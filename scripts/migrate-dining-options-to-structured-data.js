// Script to migrate diningOptions from buffets table to structuredData table
// Run with: node scripts/migrate-dining-options-to-structured-data.js [--all]
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

async function migrateDiningOptions() {
  console.log('='.repeat(80));
  console.log('Migrating diningOptions to structuredData table');
  console.log('='.repeat(80));
  console.log(`Mode: ${migrateAll ? 'ALL records' : 'TEST (1 record only)'}\n`);

  try {
    // Query buffets - we'll filter for those with diningOptions in JavaScript
    console.log('Querying buffets...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    // Fetch buffets in batches and filter for those with diningOptions
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
      
      // Filter for buffets that have diningOptions
      const buffetsWithData = batch.filter(b => 
        b.diningOptions && 
        b.diningOptions.trim() !== '' &&
        b.diningOptions !== 'null'
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
      console.log('✓ No buffets found with diningOptions');
      return;
    }

    console.log(`✓ Found ${buffets.length} buffet(s) with diningOptions\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const total = buffets.length;

    for (let i = 0; i < buffets.length; i++) {
      const buffet = buffets[i];
      try {
        // Check if structuredData already exists for this buffet with type 'diningOptions'
        const existingQuery = {
          buffets: {
            $: { where: { id: buffet.id } },
            structuredData: {}
          }
        };

        const existing = await db.query(existingQuery);
        const existingStructuredData = existing.buffets?.[0]?.structuredData || [];
        const hasDiningOptions = existingStructuredData.some(sd => sd.type === 'diningOptions');
        
        // Check if already migrated
        if (hasDiningOptions) {
          if (migrateAll) {
            console.log(`[${i + 1}/${total}] ⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - already migrated`);
          } else {
            console.log(`⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - already migrated`);
          }
          skipped++;
          continue;
        }

        // Parse the diningOptions field
        let diningOptionsData = null;
        if (buffet.diningOptions) {
          try {
            if (typeof buffet.diningOptions === 'string') {
              // First, try to parse as JSON
              try {
                diningOptionsData = JSON.parse(buffet.diningOptions);
              } catch (jsonError) {
                // If not valid JSON, check if it's comma-separated
                if (buffet.diningOptions.includes(',')) {
                  // Split by comma, trim each item, and create an array
                  diningOptionsData = buffet.diningOptions
                    .split(',')
                    .map(item => item.trim())
                    .filter(item => item.length > 0);
                } else {
                  // Single value, create array with one item
                  diningOptionsData = [buffet.diningOptions.trim()];
                }
              }
            } else if (Array.isArray(buffet.diningOptions)) {
              // Already an array
              diningOptionsData = buffet.diningOptions;
            } else {
              // Already an object
              diningOptionsData = buffet.diningOptions;
            }
          } catch (parseError) {
            console.error(`⚠ Error parsing diningOptions for buffet "${buffet.name}":`, parseError.message);
            errors++;
            continue;
          }
        }

        if (!diningOptionsData) {
          if (migrateAll) {
            console.log(`[${i + 1}/${total}] ⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - no valid data`);
          } else {
            console.log(`⏭ Skipping buffet "${buffet.name}" (id: ${buffet.id}) - no valid data`);
          }
          skipped++;
          continue;
        }

        // Create structuredData record
        const now = new Date().toISOString();
        const structuredDataId = id();
        
        // Format the data as JSON string
        // If it's already an array or object, stringify it; otherwise wrap in array
        let dataString;
        if (Array.isArray(diningOptionsData)) {
          dataString = JSON.stringify(diningOptionsData);
        } else if (typeof diningOptionsData === 'object') {
          dataString = JSON.stringify(diningOptionsData);
        } else {
          // Single value, wrap in array
          dataString = JSON.stringify([diningOptionsData]);
        }

        const structuredDataRecord = {
          data: dataString,
          type: 'diningOptions',
          createdAt: now,
          updatedAt: now,
        };
        
        // Create the record and link it to the buffet
        await db.transact([
          db.tx.structuredData[structuredDataId]
            .create(structuredDataRecord)
            .link({ buffet: buffet.id })
        ]);

        if (migrateAll) {
          console.log(`[${i + 1}/${total}] ✓ Migrated buffet "${buffet.name}" (id: ${buffet.id})`);
          console.log(`  → Created structuredData record (id: ${structuredDataId}, type: diningOptions)`);
          console.log(`  → Data preview: ${dataString.substring(0, 100)}${dataString.length > 100 ? '...' : ''}`);
          console.log(`  → Progress: ${migrated + 1} migrated, ${skipped} skipped, ${errors} errors`);
          console.log('');
        } else {
          console.log(`✓ Migrated buffet "${buffet.name}" (id: ${buffet.id})`);
          console.log(`  → Created structuredData record (id: ${structuredDataId}, type: diningOptions)`);
          console.log(`  → Data preview: ${dataString.substring(0, 100)}${dataString.length > 100 ? '...' : ''}`);
          console.log('');
        }
        
        migrated++;

        // If testing mode, stop after first record
        if (!migrateAll && migrated === 1) {
          console.log('✓ Test migration completed successfully!\n');
          console.log('To migrate all records, run:');
          console.log('  node scripts/migrate-dining-options-to-structured-data.js --all\n');
          break;
        }

      } catch (error) {
        if (migrateAll) {
          console.error(`[${i + 1}/${total}] ✗ Error migrating buffet "${buffet.name}" (id: ${buffet.id}):`, error.message);
        } else {
          console.error(`✗ Error migrating buffet "${buffet.name}" (id: ${buffet.id}):`, error.message);
        }
        console.error(error.stack);
        errors++;
      }
    }

    console.log('='.repeat(80));
    console.log('Migration Summary:');
    console.log(`  ✓ Migrated: ${migrated}`);
    console.log(`  ⏭ Skipped: ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log(`  Total Processed: ${migrated + skipped + errors}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

migrateDiningOptions().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
