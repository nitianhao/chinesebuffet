// Script to convert distance (meters) to distanceFt (feet) in poiRecords table
// Run with: node scripts/migrate-distance-to-feet.js [--all]
// Without --all flag, migrates only 10 records for testing
//
// Conversion: 1 meter = 3.28084 feet

const { init } = require('@instantdb/admin');
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

// Conversion factor: 1 meter = 3.28084 feet
const METERS_TO_FEET = 3.28084;

async function migrateDistanceToFeet() {
  try {
    console.log('================================================================================');
    console.log('Converting distance (meters) to distanceFt (feet) in poiRecords table');
    console.log('================================================================================');

    // Check if --all flag is provided
    const migrateAll = process.argv.includes('--all');
    console.log(`Mode: ${migrateAll ? 'ALL records' : 'TEST (10 records)'}\n`);

    // Process records incrementally instead of fetching all at once
    let offset = 0;
    const fetchLimit = 100; // Smaller batches to avoid timeouts
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let batchCount = 0;
    const BATCH_SIZE = 50; // Process updates in batches

    console.log('Processing poiRecords incrementally...\n');

    while (true) {
      batchCount++;
      console.log(`Fetching batch ${batchCount} (offset: ${offset})...`);
      
      let records = [];
      try {
        const result = await db.query({
          poiRecords: {
            $: {
              limit: fetchLimit,
              offset: offset
            }
          }
        });

        records = result.poiRecords || [];
        console.log(`  ✓ Fetched ${records.length} records`);
        
        if (records.length === 0) {
          console.log('  No more records to fetch.\n');
          break;
        }
      } catch (error) {
        console.error(`  ✗ Error fetching batch at offset ${offset}:`, error.message);
        if (error.stack) {
          console.error(error.stack);
        }
        throw error;
      }

      // Filter records that need updating
      const recordsToUpdate = records.filter(record => {
        return record.distance !== null && 
               record.distance !== undefined && 
               typeof record.distance === 'number' &&
               (record.distanceFt === null || record.distanceFt === undefined);
      });

      console.log(`  → ${recordsToUpdate.length} records need distanceFt conversion`);

      if (recordsToUpdate.length === 0) {
        console.log('  → No records to update in this batch\n');
        offset += fetchLimit;
        continue;
      }

      // Limit to 10 records if not using --all flag (only for first batch)
      const recordsToProcess = migrateAll || totalUpdated > 0 
        ? recordsToUpdate 
        : recordsToUpdate.slice(0, 10);

      if (!migrateAll && totalUpdated > 0 && recordsToUpdate.length > 0) {
        console.log('  → Test mode: stopping after first batch\n');
        break;
      }

      // Process updates in batches
      for (let i = 0; i < recordsToProcess.length; i += BATCH_SIZE) {
        const batch = recordsToProcess.slice(i, i + BATCH_SIZE);
        const transactions = [];

        for (const record of batch) {
          try {
            // Convert meters to feet
            const distanceInFeet = record.distance * METERS_TO_FEET;
            
            // Round to 2 decimal places for cleaner values
            const distanceFt = Math.round(distanceInFeet * 100) / 100;

            // Create update transaction
            transactions.push(
              db.tx.poiRecords[record.id].update({
                distanceFt: distanceFt
              })
            );
          } catch (error) {
            console.error(`  ✗ Error preparing update for record ${record.id}:`, error.message);
            totalErrors++;
          }
        }

        // Execute batch transaction
        if (transactions.length > 0) {
          try {
            await db.transact(transactions);
            totalUpdated += transactions.length;
            console.log(`  ✓ Updated ${transactions.length} records (total: ${totalUpdated})`);
          } catch (error) {
            console.error(`  ✗ Error updating batch:`, error.message);
            totalErrors += transactions.length;
          }
        }
      }

      console.log(''); // Empty line for readability

      // If not migrating all, stop after first batch
      if (!migrateAll && totalUpdated > 0) {
        break;
      }

      // Check if we've reached the end
      if (records.length < fetchLimit) {
        break;
      }

      offset += fetchLimit;
    }

    console.log('\n================================================================================');
    console.log('Migration Summary:');
    console.log('================================================================================');
    console.log(`  ✓ Updated: ${totalUpdated}`);
    console.log(`  ⏭ Skipped: ${totalSkipped}`);
    console.log(`  ✗ Errors: ${totalErrors}`);
    console.log(`  📊 Batches processed: ${batchCount}`);
    console.log('\n✅ Migration complete!');
    console.log('📝 Please verify the data in your database');
    console.log('💡 To process all records, run with --all flag: node scripts/migrate-distance-to-feet.js --all');
    console.log('================================================================================\n');

  } catch (error) {
    console.error('Fatal error:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

migrateDistanceToFeet();
