// Script to sync popularTimesHistogram data from apify-big-cities.json to instantDB buffet table
// Overrides existing values if already filled out
// Run with: node scripts/sync-popular-times-histogram-from-json.js [--all]
// Without --all flag, processes only 10 records for testing

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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
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
const testLimit = 10;

async function syncPopularTimesHistogram() {
  console.log('='.repeat(80));
  console.log('Syncing popularTimesHistogram data from JSON to instantDB buffet table');
  console.log('(Overriding existing values if already filled out)');
  console.log('='.repeat(80));
  console.log(`Mode: ${migrateAll ? 'ALL records' : `TEST (${testLimit} records only)`}\n`);

  try {
    // Load the JSON file
    const jsonPath = path.join(__dirname, '../Example JSON/apify-big-cities.json');
    console.log('Loading JSON file...');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`✓ Loaded ${jsonData.length} records from JSON file\n`);

    // Filter records that have popularTimesHistogram data
    const recordsWithHistogram = jsonData.filter(record => {
      const histogram = record.popularTimesHistogram;
      return histogram && 
             histogram !== 'null' &&
             histogram !== null &&
             ((typeof histogram === 'object' && (Array.isArray(histogram) ? histogram.length > 0 : Object.keys(histogram).length > 0)) ||
              (typeof histogram === 'string' && histogram.trim() !== '' && histogram.trim() !== 'null')) &&
             record.PlaceID;
    });

    console.log(`✓ Found ${recordsWithHistogram.length} records with popularTimesHistogram data\n`);

    if (recordsWithHistogram.length === 0) {
      console.log('No records with popularTimesHistogram data found. Exiting.');
      return;
    }

    // Limit records for testing
    const recordsToProcess = migrateAll 
      ? recordsWithHistogram 
      : recordsWithHistogram.slice(0, testLimit);

    console.log(`Processing ${recordsToProcess.length} records...\n`);

    // Create a map of PlaceID -> popularTimesHistogram (as JSON string) for quick lookup
    const histogramMap = new Map();
    for (const record of recordsToProcess) {
      if (record.PlaceID && record.popularTimesHistogram) {
        let histogramValue;
        
        // If it's already a string, try to parse it to validate, then use it
        if (typeof record.popularTimesHistogram === 'string') {
          try {
            // Try to parse to validate it's valid JSON
            JSON.parse(record.popularTimesHistogram);
            histogramValue = record.popularTimesHistogram.trim();
          } catch (e) {
            // If parsing fails, skip this record
            console.warn(`⚠ Skipping invalid JSON string for PlaceID ${record.PlaceID}`);
            continue;
          }
        } else if (typeof record.popularTimesHistogram === 'object') {
          // Convert object/array to JSON string
          histogramValue = JSON.stringify(record.popularTimesHistogram);
        } else {
          continue;
        }
        
        histogramMap.set(record.PlaceID, histogramValue);
      }
    }

    console.log(`✓ Created lookup map with ${histogramMap.size} PlaceIDs\n`);

    // Fetch buffets that match these PlaceIDs
    console.log('Fetching matching buffets from database...');
    const placeIds = Array.from(histogramMap.keys());
    
    // Query buffets in batches (InstantDB may have query limits)
    const batchSize = 100;
    let allBuffets = [];
    
    for (let i = 0; i < placeIds.length; i += batchSize) {
      const batch = placeIds.slice(i, i + batchSize);
      
      try {
        // Query buffets by placeId
        const query = {
          buffets: {
            $: {
              where: {
                placeId: { $in: batch }
              }
            }
          }
        };

        const result = await db.query(query);
        const buffets = result.buffets || [];
        allBuffets = allBuffets.concat(buffets);
        
        console.log(`  Fetched ${buffets.length} buffets for batch ${Math.floor(i / batchSize) + 1} (${Math.min(i + batchSize, placeIds.length)}/${placeIds.length} placeIds)`);
      } catch (error) {
        console.error(`  Error fetching batch ${Math.floor(i / batchSize) + 1}:`, error.message);
        // If $in doesn't work, try individual queries
        console.log('  Trying individual queries...');
        for (const placeId of batch) {
          try {
            const result = await db.query({
              buffets: {
                $: { where: { placeId: placeId } }
              }
            });
            const buffets = result.buffets || [];
            allBuffets = allBuffets.concat(buffets);
          } catch (err) {
            console.error(`    Error querying placeId ${placeId}:`, err.message);
          }
        }
      }
    }

    console.log(`\n✓ Found ${allBuffets.length} matching buffets in database\n`);

    if (allBuffets.length === 0) {
      console.log('No matching buffets found. This could mean:');
      console.log('  1. The PlaceIDs in the JSON don\'t match the placeId field in the database');
      console.log('  2. The buffets haven\'t been imported yet');
      console.log('  3. The placeId field is named differently\n');
      return;
    }

    // Prepare updates (override existing values)
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const updates = [];

    for (const buffet of allBuffets) {
      try {
        const placeId = buffet.placeId;
        const newHistogram = histogramMap.get(placeId);

        if (!newHistogram) {
          skipped++;
          continue;
        }

        // Always update (override existing values)
        const oldValue = buffet.popularTimesHistogram || null;
        updates.push({
          buffetId: buffet.id,
          buffetName: buffet.name,
          placeId: placeId,
          popularTimesHistogram: newHistogram,
          oldValue: oldValue
        });

      } catch (error) {
        console.error(`✗ Error processing buffet "${buffet.name}":`, error.message);
        errors++;
      }
    }

    console.log(`Prepared ${updates.length} updates. Applying to database...\n`);

    // Apply updates in batches
    const updateBatchSize = 50;
    for (let i = 0; i < updates.length; i += updateBatchSize) {
      const batch = updates.slice(i, i + updateBatchSize);
      
      try {
        const transactions = batch.map(update => 
          db.tx.buffets[update.buffetId].update({
            popularTimesHistogram: update.popularTimesHistogram
          })
        );

        await db.transact(transactions);

        // Log progress
        for (const update of batch) {
          let oldValuePreview = 'null';
          if (update.oldValue) {
            try {
              const parsed = typeof update.oldValue === 'string' ? JSON.parse(update.oldValue) : update.oldValue;
              if (typeof parsed === 'object') {
                const keys = Object.keys(parsed).slice(0, 3);
                oldValuePreview = `{${keys.join(', ')}, ...} (${Object.keys(parsed).length} days)`;
              } else {
                oldValuePreview = update.oldValue.substring(0, 40) + '...';
              }
            } catch (e) {
              oldValuePreview = update.oldValue.substring(0, 40) + '...';
            }
          }
          
          let newValuePreview = 'null';
          try {
            const parsed = typeof update.popularTimesHistogram === 'string' ? JSON.parse(update.popularTimesHistogram) : update.popularTimesHistogram;
            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
              const keys = Object.keys(parsed).slice(0, 3);
              newValuePreview = `{${keys.join(', ')}, ...} (${Object.keys(parsed).length} days)`;
            } else if (Array.isArray(parsed)) {
              newValuePreview = `[array with ${parsed.length} items]`;
            } else {
              newValuePreview = update.popularTimesHistogram.substring(0, 60) + '...';
            }
          } catch (e) {
            newValuePreview = update.popularTimesHistogram.substring(0, 60) + '...';
          }
          
          console.log(`✓ Updated "${update.buffetName}" (placeId: ${update.placeId})`);
          console.log(`  → popularTimesHistogram: ${oldValuePreview} → ${newValuePreview}`);
          updated++;
        }
        
        console.log(`\n  Batch ${Math.floor(i / updateBatchSize) + 1} complete (${Math.min(i + updateBatchSize, updates.length)}/${updates.length})\n`);

      } catch (error) {
        console.error(`✗ Error updating batch ${Math.floor(i / updateBatchSize) + 1}:`, error.message);
        
        // Try individual updates if batch fails
        console.log('  Trying individual updates...');
        for (const update of batch) {
          try {
            await db.transact([
              db.tx.buffets[update.buffetId].update({
                popularTimesHistogram: update.popularTimesHistogram
              })
            ]);
            
            let newValuePreview = 'null';
            try {
              const parsed = typeof update.popularTimesHistogram === 'string' ? JSON.parse(update.popularTimesHistogram) : update.popularTimesHistogram;
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                const keys = Object.keys(parsed).slice(0, 2);
                newValuePreview = `{${keys.join(', ')}, ...} (${Object.keys(parsed).length} days)`;
              } else {
                newValuePreview = update.popularTimesHistogram.substring(0, 40) + '...';
              }
            } catch (e) {
              newValuePreview = update.popularTimesHistogram.substring(0, 40) + '...';
            }
            
            console.log(`  ✓ Updated "${update.buffetName}" (${newValuePreview})`);
            updated++;
          } catch (err) {
            console.error(`  ✗ Error updating "${update.buffetName}":`, err.message);
            errors++;
          }
        }
      }
    }

    console.log('='.repeat(80));
    console.log('Sync Summary:');
    console.log(`  ✓ Updated: ${updated}`);
    console.log(`  ⏭ Skipped: ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log('='.repeat(80));

    if (!migrateAll && updated > 0) {
      console.log('\n✓ Test sync completed successfully!');
      console.log('To sync all records, run:');
      console.log('  node scripts/sync-popular-times-histogram-from-json.js --all\n');
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

syncPopularTimesHistogram().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
