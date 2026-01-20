// Script to migrate waiterService from buffets table to structuredData table
// Run with: node scripts/migrate-waiter-service.js [--all]
// Without --all flag, migrates only one record for testing

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      // Match key=value format
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export INSTANT_ADMIN_TOKEN="your-token-here"');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

async function migrateWaiterService() {
  try {
    console.log('Starting migration of waiterService to structuredData...\n');

    // Check if --all flag is provided
    const migrateAll = process.argv.includes('--all');

    // Fetch all buffets
    const allBuffets = await db.query({
      buffets: {
        $: {},
      },
    });

    if (!allBuffets.buffets || allBuffets.buffets.length === 0) {
      console.log('No buffets found in the database.');
      return;
    }

    // Filter buffets that have waiterService set
    const buffets = allBuffets.buffets.filter(b => b.waiterService !== null && b.waiterService !== undefined);

    if (buffets.length === 0) {
      console.log('No buffets found with waiterService field set.');
      return;
    }

    console.log(`Found ${buffets.length} buffets with waiterService field set.\n`);

    // Determine which buffets to process
    const buffetsToProcess = migrateAll ? buffets : buffets.slice(0, 1);

    if (!migrateAll) {
      console.log('Running in test mode - migrating only 1 record.\n');
      console.log('To migrate all records, run: node scripts/migrate-waiter-service.js --all\n');
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    let totalProcessed = 0;

    for (const buffet of buffetsToProcess) {
      totalProcessed++;
      try {
        // Check if structuredData already exists for this buffet
        const existingQuery = {
          buffets: {
            $: { where: { id: buffet.id } },
            structuredData: {
              $: { where: { type: 'waiterService' } }
            }
          }
        };
        const existingResult = await db.query(existingQuery);
        const existingStructuredData = existingResult.buffets?.[0]?.structuredData || [];

        if (existingStructuredData.length > 0) {
          console.log(`⏭ [${totalProcessed}/${buffetsToProcess.length}] Skipping buffet "${buffet.name}" (id: ${buffet.id}) - already migrated`);
          skipped++;
          continue;
        }

        // Create structuredData record
        const structuredDataId = id();
        const now = new Date().toISOString();

        const batchTransactions = [
          db.tx.structuredData[structuredDataId]
            .create({
              data: JSON.stringify(buffet.waiterService),
              type: 'waiterService',
              createdAt: now,
              updatedAt: now,
            })
            .link({ buffet: buffet.id })
        ];

        await db.transact(batchTransactions);

        console.log(`✓ [${totalProcessed}/${buffetsToProcess.length}] Migrated buffet "${buffet.name}" (id: ${buffet.id})`);
        console.log(`  → Created structuredData record (id: ${structuredDataId}, type: waiterService)`);
        console.log(`  → Value: ${buffet.waiterService}\n`);

        migrated++;
      } catch (error) {
        console.error(`✗ [${totalProcessed}/${buffetsToProcess.length}] Error migrating buffet "${buffet.name}" (id: ${buffet.id}):`, error.message);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);

    if (!migrateAll && migrated > 0) {
      console.log('\nTo migrate all remaining records, run:');
      console.log('  node scripts/migrate-waiter-service.js --all');
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

migrateWaiterService();
