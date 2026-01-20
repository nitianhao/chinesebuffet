// Script to import Yelp attributes from yelp-restaurant-mapping.json to InstantDB
// Run with: node scripts/import-yelp-attributes.js

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

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to stringify JSON fields
function stringifyIfNeeded(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

// Helper to parse JSON strings
function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

async function importYelpAttributes() {
  console.log('🚀 Starting Yelp attributes import...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Please set it in .env.local file');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    // Step 1: Load the JSON file
    const jsonPath = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
    console.log('Step 1: Loading JSON file...');
    
    if (!fs.existsSync(jsonPath)) {
      console.error(`Error: File not found at ${jsonPath}`);
      process.exit(1);
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const entries = Object.values(jsonData);
    console.log(`  Loaded ${entries.length} entries from JSON file\n`);

    // Step 2: Build a map of placeId -> buffet ID
    console.log('Step 2: Building buffet lookup map by placeId...');
    const buffetMap = new Map();
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          },
        },
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      buffets.forEach(buffet => {
        if (buffet.placeId) {
          buffetMap.set(buffet.placeId, buffet.id);
        }
      });
      
      if (buffets.length < limit) break;
      offset += limit;
    }
    
    console.log(`  Found ${buffetMap.size} buffets with placeId\n`);

    // Step 3: Process entries and prepare updates
    console.log('Step 3: Processing attributes and preparing updates...');
    
    let totalEntriesProcessed = 0;
    let entriesWithAttributes = 0;
    let entriesWithNoBuffet = 0;
    let entriesUpdated = 0;
    let entriesSkipped = 0;
    let entriesWithErrors = 0;

    const UPDATE_BATCH_SIZE = 50; // Update buffets in batches
    const buffetCache = new Map(); // Cache for fetched buffet data

    for (let i = 0; i < entries.length; i += UPDATE_BATCH_SIZE) {
      const entryBatch = entries.slice(i, i + UPDATE_BATCH_SIZE);
      const batchTransactions = [];

      for (const entry of entryBatch) {
        try {
          totalEntriesProcessed++;

          // Check if entry has yelp details (required for attributes)
          if (!entry.yelp?.details) {
            continue;
          }

          // Get attributes (may be null, which is valid)
          const attributes = entry.yelp.details.attributes;
          
          // Skip if attributes field doesn't exist at all (shouldn't happen if details exists)
          if (!('attributes' in entry.yelp.details)) {
            continue;
          }

          entriesWithAttributes++;

          // Find buffet by placeId (buffetId)
          const buffetId = buffetMap.get(entry.buffetId);
          if (!buffetId) {
            entriesWithNoBuffet++;
            if (entriesWithNoBuffet <= 10) {
              console.log(`  ⚠ No buffet found for placeId: ${entry.buffetId} (${entry.buffetName || 'unknown'})`);
            }
            continue;
          }

          // Fetch existing buffet data to merge with existing yelpData (use cache)
          let yelpData = {};
          if (!buffetCache.has(buffetId)) {
            try {
              const result = await db.query({
                buffets: {
                  $: { where: { id: buffetId } }
                }
              });
              
              const existingBuffet = result.buffets?.[0];
              buffetCache.set(buffetId, existingBuffet || null);
              
              if (existingBuffet && existingBuffet.yelpData) {
                yelpData = parseJsonField(existingBuffet.yelpData) || {};
              }
            } catch (fetchError) {
              console.error(`  ⚠ Error fetching buffet ${buffetId}:`, fetchError.message);
              buffetCache.set(buffetId, null);
              // Continue anyway, we'll create new yelpData
            }
          } else {
            // Use cached data
            const cachedBuffet = buffetCache.get(buffetId);
            if (cachedBuffet && cachedBuffet.yelpData) {
              yelpData = parseJsonField(cachedBuffet.yelpData) || {};
            }
          }
          
          // Merge attributes into yelpData
          yelpData.attributes = attributes;
          
          // Stringify yelpData for storage
          const yelpDataString = stringifyIfNeeded(yelpData);

          // Create update transaction
          const updateTx = db.tx.buffets[buffetId].update({
            yelpData: yelpDataString
          });
          
          batchTransactions.push(updateTx);
          entriesUpdated++;

        } catch (error) {
          console.error(`  ✗ Error processing ${entry.buffetName || entry.buffetId || 'unknown'}:`, error.message);
          entriesWithErrors++;
        }
      }

      // Commit batch
      if (batchTransactions.length > 0) {
        try {
          await db.transact(batchTransactions);
          console.log(`  ✓ Updated batch: ${batchTransactions.length} buffets (total updated: ${entriesUpdated}/${entriesWithAttributes})`);
        } catch (error) {
          console.error(`  ✗ Error committing batch (${batchTransactions.length} buffets):`, error.message);
          entriesSkipped += batchTransactions.length;
          entriesUpdated -= batchTransactions.length;
        }
      }

      if ((i + UPDATE_BATCH_SIZE) % 500 === 0 || i + UPDATE_BATCH_SIZE >= entries.length) {
        console.log(`  → Progress: ${Math.min(i + UPDATE_BATCH_SIZE, entries.length)}/${entries.length} entries processed\n`);
      }
    }

    // Step 5: Summary
    console.log('\n📊 Import Summary:');
    console.log(`  Total entries processed: ${totalEntriesProcessed}/${entries.length}`);
    console.log(`  Entries with attributes: ${entriesWithAttributes}`);
    console.log(`  Entries with no matching buffet: ${entriesWithNoBuffet}`);
    console.log(`  Buffets updated: ${entriesUpdated}`);
    if (entriesSkipped > 0) {
      console.log(`  ⚠ Buffets skipped (errors): ${entriesSkipped}`);
    }
    if (entriesWithErrors > 0) {
      console.log(`  ⚠ Entries with processing errors: ${entriesWithErrors}`);
    }

    console.log('\n✅ Import complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the data looks correct in your InstantDB dashboard');
    console.log('  2. Check that yelpData.attributes is populated correctly');

  } catch (error) {
    console.error('\n❌ Error during import:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run import
importYelpAttributes();

