// Script to sync menu data from apify-big-cities.json to instantDB buffet table
// Skips records that already have menu data populated
// Run with: node scripts/sync-menu-from-json.js [--all]
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

// Helper to check if menu field is already populated
function isMenuPopulated(menuValue) {
  if (!menuValue) return false;
  if (typeof menuValue === 'string') {
    const trimmed = menuValue.trim();
    return trimmed !== '' && trimmed !== 'null' && trimmed.toLowerCase() !== 'null';
  }
  if (typeof menuValue === 'object') {
    return Object.keys(menuValue).length > 0;
  }
  return false;
}

async function syncMenus() {
  console.log('='.repeat(80));
  console.log('Syncing menu data from JSON to instantDB buffet table');
  console.log('(Skipping records that already have menu data)');
  console.log('='.repeat(80));
  console.log(`Mode: ${migrateAll ? 'ALL records' : `TEST (${testLimit} records only)`}\n`);

  try {
    // Load the JSON file
    const jsonPath = path.join(__dirname, '../Example JSON/apify-big-cities.json');
    console.log('Loading JSON file...');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`✓ Loaded ${jsonData.length} records from JSON file\n`);

    // Filter records that have menu data
    const recordsWithMenu = jsonData.filter(record => {
      const menu = record.menu;
      return menu && 
             ((typeof menu === 'string' && menu.trim() !== '' && menu.trim() !== 'null') ||
              (typeof menu === 'object' && menu !== null)) &&
             record.PlaceID;
    });

    console.log(`✓ Found ${recordsWithMenu.length} records with menu data\n`);

    if (recordsWithMenu.length === 0) {
      console.log('No records with menu data found. Exiting.');
      return;
    }

    // Limit records for testing
    const recordsToProcess = migrateAll 
      ? recordsWithMenu 
      : recordsWithMenu.slice(0, testLimit);

    console.log(`Processing ${recordsToProcess.length} records...\n`);

    // Create a map of PlaceID -> menu for quick lookup
    const menuMap = new Map();
    for (const record of recordsToProcess) {
      if (record.PlaceID && record.menu) {
        // Store menu as string if it's a string, or JSON stringify if it's an object
        const menuValue = typeof record.menu === 'string' 
          ? record.menu.trim()
          : JSON.stringify(record.menu);
        menuMap.set(record.PlaceID, menuValue);
      }
    }

    console.log(`✓ Created lookup map with ${menuMap.size} PlaceIDs\n`);

    // Fetch buffets that match these PlaceIDs
    console.log('Fetching matching buffets from database...');
    const placeIds = Array.from(menuMap.keys());
    
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

    // Prepare updates (skip if menu is already populated)
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const updates = [];

    for (const buffet of allBuffets) {
      try {
        const placeId = buffet.placeId;
        const newMenu = menuMap.get(placeId);

        if (!newMenu) {
          skipped++;
          continue;
        }

        // Check if menu is already populated - if so, skip it
        if (isMenuPopulated(buffet.menu)) {
          console.log(`⏭ Skipping buffet "${buffet.name}" (placeId: ${placeId}) - menu already populated`);
          skipped++;
          continue;
        }

        // Update only if menu is empty/null
        updates.push({
          buffetId: buffet.id,
          buffetName: buffet.name,
          placeId: placeId,
          menu: newMenu,
          oldValue: buffet.menu || null
        });

      } catch (error) {
        console.error(`✗ Error processing buffet "${buffet.name}":`, error.message);
        errors++;
      }
    }

    console.log(`\nPrepared ${updates.length} updates (${skipped} skipped due to existing menu). Applying to database...\n`);

    // Apply updates in batches
    const updateBatchSize = 50;
    for (let i = 0; i < updates.length; i += updateBatchSize) {
      const batch = updates.slice(i, i + updateBatchSize);
      
      try {
        const transactions = batch.map(update => 
          db.tx.buffets[update.buffetId].update({
            menu: update.menu
          })
        );

        await db.transact(transactions);

        // Log progress
        for (const update of batch) {
          const menuPreview = typeof update.menu === 'string' 
            ? (update.menu.length > 60 ? update.menu.substring(0, 60) + '...' : update.menu)
            : 'Object';
          console.log(`✓ Updated "${update.buffetName}" (placeId: ${update.placeId})`);
          console.log(`  → menu: ${update.oldValue ? '(had value)' : 'null'} → ${menuPreview}`);
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
                menu: update.menu
              })
            ]);
            console.log(`  ✓ Updated "${update.buffetName}" individually`);
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
    console.log(`  ⏭ Skipped (already had menu): ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log('='.repeat(80));

    if (!migrateAll && updated > 0) {
      console.log('\n✓ Test sync completed successfully!');
      console.log('To sync all records, run:');
      console.log('  node scripts/sync-menu-from-json.js --all\n');
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

syncMenus().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
