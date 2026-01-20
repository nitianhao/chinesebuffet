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

async function migrateServiceOptions() {
  try {
    console.log('Starting migration of serviceOptions to structuredData...\n');

    // Check if --all flag is provided
    const migrateAll = process.argv.includes('--all');

    // Fetch all buffets
    const allBuffets = await db.query({
      buffets: {
        $: {},
      },
    });

    if (!allBuffets.buffets || allBuffets.buffets.length === 0) {
      console.log('✓ No buffets found');
      return;
    }

    // Filter buffets that have serviceOptions
    const buffets = allBuffets.buffets.filter(b => 
      b.serviceOptions && 
      b.serviceOptions.trim() !== '' &&
      b.serviceOptions !== 'null'
    );

    if (buffets.length === 0) {
      console.log('✓ No buffets found with serviceOptions');
      return;
    }

    // If not --all, only process the first one
    const buffetsToProcess = migrateAll ? buffets : [buffets[0]];

    console.log(`✓ Found ${buffets.length} buffet(s) with serviceOptions`);
    console.log(`  Processing ${buffetsToProcess.length} buffet(s)${migrateAll ? ' (all)' : ' (first one for testing)'}\n`);

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
              $: { where: { type: 'serviceOptions' } }
            }
          }
        };

        const existing = await db.query(existingQuery);
        const existingStructuredData = existing.buffets?.[0]?.structuredData || [];
        
        if (existingStructuredData.length > 0) {
          console.log(`⏭ [${totalProcessed}/${buffetsToProcess.length}] Skipping buffet "${buffet.name}" (id: ${buffet.id}) - already migrated`);
          skipped++;
          continue;
        }

        // Parse the serviceOptions JSON string
        let serviceOptionsData = null;
        if (buffet.serviceOptions) {
          try {
            if (typeof buffet.serviceOptions === 'string') {
              serviceOptionsData = JSON.parse(buffet.serviceOptions);
            } else {
              serviceOptionsData = buffet.serviceOptions;
            }
          } catch (parseError) {
            console.error(`⚠ Error parsing serviceOptions for buffet "${buffet.name}":`, parseError.message);
            errors++;
            continue;
          }
        }

        if (!serviceOptionsData || typeof serviceOptionsData !== 'object') {
          console.log(`⏭ [${totalProcessed}/${buffetsToProcess.length}] Skipping buffet "${buffet.name}" (id: ${buffet.id}) - no valid data`);
          skipped++;
          continue;
        }

        // Create structuredData record
        const structuredDataId = id();
        const now = new Date().toISOString();

        const transaction = db.tx.structuredData[structuredDataId]
          .create({
            data: JSON.stringify(serviceOptionsData),
            type: 'serviceOptions',
            createdAt: now,
            updatedAt: now,
          })
          .link({ buffet: buffet.id });

        await db.transact([transaction]);

        console.log(`✓ [${totalProcessed}/${buffetsToProcess.length}] Migrated buffet "${buffet.name}" (id: ${buffet.id})`);
        console.log(`  → Created structuredData record (id: ${structuredDataId}, type: serviceOptions)`);
        console.log(`  → Data preview: ${JSON.stringify(serviceOptionsData).substring(0, 100)}...\n`);
        
        migrated++;
      } catch (error) {
        console.error(`✗ [${totalProcessed}/${buffetsToProcess.length}] Error migrating buffet "${buffet.name}" (id: ${buffet.id}):`, error.message);
        errors++;
      }
    }

    console.log('================================================================================');
    console.log('Migration Summary:');
    console.log(`  ✓ Migrated: ${migrated}`);
    console.log(`  ⏭ Skipped: ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log('================================================================================\n');

    if (!migrateAll && migrated > 0) {
      console.log('✓ Test migration completed successfully!');
      console.log('  To migrate all records, run: node scripts/migrate-service-options.js --all\n');
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

migrateServiceOptions();
