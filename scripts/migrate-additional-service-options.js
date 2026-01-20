// Script to migrate additionalServiceOptions from buffets table to structuredData table
// Run with: node scripts/migrate-additional-service-options.js [--all]
// Without --all flag, migrates only one record for testing

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

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
  schema: schema.default || schema,
});

const migrateAll = process.argv.includes('--all');

async function migrateAdditionalServiceOptions() {
  console.log('='.repeat(80));
  console.log('Migrating additionalServiceOptions to structuredData table');
  console.log('='.repeat(80));
  console.log(`Mode: ${migrateAll ? 'ALL records' : 'TEST (1 record only)'}\n`);

  try {
    // Query buffets - we'll filter for those with additionalServiceOptions in JavaScript
    console.log('Querying buffets...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    // Fetch buffets in batches and filter for those with additionalServiceOptions
    while (true) {
      const query = {
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          }
        }
      };

      const result = await db.query(query);
      const batch = result.buffets || [];
      
      if (batch.length === 0) break;
      
      // Filter for buffets that have additionalServiceOptions
      const buffetsWithData = batch.filter(b => 
        b.additionalServiceOptions && 
        b.additionalServiceOptions.trim() !== '' &&
        b.additionalServiceOptions !== 'null'
      );
      
      allBuffets = allBuffets.concat(buffetsWithData);
      
      // If testing mode and we found at least one, stop
      if (!migrateAll && allBuffets.length >= 1) {
        allBuffets = allBuffets.slice(0, 1); // Take only the first one
        break;
      }
      
      if (batch.length < limit) break;
      offset += limit;
      
      // For testing, stop after first batch
      if (!migrateAll) break;
    }
    
    const buffets = allBuffets;

    if (buffets.length === 0) {
      console.log('✓ No buffets found with additionalServiceOptions');
      return;
    }

    console.log(`✓ Found ${buffets.length} buffet(s) with additionalServiceOptions\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const buffet of buffets) {
      try {
        // Check if structuredData already exists for this buffet
        const existingQuery = {
          buffets: {
            $: { where: { id: buffet.id } },
            structuredData: {}
          }
        };

        const existing = await db.query(existingQuery);
        const existingStructuredData = existing.buffets?.[0]?.structuredData || [];
        const existingTypes = new Set(existingStructuredData.map(sd => sd.type));
        
        // Check if both types already exist
        if (existingTypes.has('allowsDogs') && existingTypes.has('curbsidePickup')) {
          console.log(`⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - already migrated`);
          skipped++;
          continue;
        }

        // Parse the additionalServiceOptions JSON string
        let additionalServiceOptionsData = null;
        if (buffet.additionalServiceOptions) {
          try {
            if (typeof buffet.additionalServiceOptions === 'string') {
              additionalServiceOptionsData = JSON.parse(buffet.additionalServiceOptions);
            } else {
              additionalServiceOptionsData = buffet.additionalServiceOptions;
            }
          } catch (parseError) {
            console.error(`⚠ Error parsing additionalServiceOptions for buffet "${buffet.name}":`, parseError.message);
            errors++;
            continue;
          }
        }

        if (!additionalServiceOptionsData || typeof additionalServiceOptionsData !== 'object') {
          console.log(`⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - no valid data`);
          skipped++;
          continue;
        }

        // Create separate structuredData records for each field
        const now = new Date().toISOString();
        const transactions = [];
        const recordsCreated = [];

        // Create record for allowsDogs if it exists and not already migrated
        if ('allowsDogs' in additionalServiceOptionsData && !existingTypes.has('allowsDogs')) {
          const allowsDogsId = id();
          const allowsDogsRecord = {
            data: JSON.stringify({ allowsDogs: additionalServiceOptionsData.allowsDogs }),
            type: 'allowsDogs',
            createdAt: now,
            updatedAt: now,
          };
          
          transactions.push(
            db.tx.structuredData[allowsDogsId]
              .create(allowsDogsRecord)
              .link({ buffet: buffet.id })
          );
          recordsCreated.push({ id: allowsDogsId, type: 'allowsDogs', value: additionalServiceOptionsData.allowsDogs });
        }

        // Create record for curbsidePickup if it exists and not already migrated
        if ('curbsidePickup' in additionalServiceOptionsData && !existingTypes.has('curbsidePickup')) {
          const curbsidePickupId = id();
          const curbsidePickupRecord = {
            data: JSON.stringify({ curbsidePickup: additionalServiceOptionsData.curbsidePickup }),
            type: 'curbsidePickup',
            createdAt: now,
            updatedAt: now,
          };
          
          transactions.push(
            db.tx.structuredData[curbsidePickupId]
              .create(curbsidePickupRecord)
              .link({ buffet: buffet.id })
          );
          recordsCreated.push({ id: curbsidePickupId, type: 'curbsidePickup', value: additionalServiceOptionsData.curbsidePickup });
        }

        if (transactions.length === 0) {
          console.log(`⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - no new data to migrate`);
          skipped++;
          continue;
        }

        // Create all structuredData records in a single transaction
        await db.transact(transactions);

        console.log(`✓ Migrated buffet "${buffet.name}" (id: ${buffet.id})`);
        recordsCreated.forEach(record => {
          console.log(`  → Created structuredData record (id: ${record.id}, type: ${record.type}, value: ${record.value})`);
        });
        console.log('');
        
        migrated++;

        // If testing mode, stop after first record
        if (!migrateAll && migrated === 1) {
          console.log('✓ Test migration completed successfully!\n');
          console.log('To migrate all records, run:');
          console.log('  node scripts/migrate-additional-service-options.js --all\n');
          break;
        }

      } catch (error) {
        console.error(`✗ Error migrating buffet "${buffet.name}" (id: ${buffet.id}):`, error.message);
        errors++;
      }
    }

    console.log('='.repeat(80));
    console.log('Migration Summary:');
    console.log(`  ✓ Migrated: ${migrated}`);
    console.log(`  ⏭ Skipped: ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

migrateAdditionalServiceOptions().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
