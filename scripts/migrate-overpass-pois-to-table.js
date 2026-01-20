// Script to migrate overpassPOIs from JSON field to separate overpassPOIs table
// Run with: node scripts/migrate-overpass-pois-to-table.js

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

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to parse JSON field
function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object') {
    return value;
  }
  return null;
}

// Transform POI object to InstantDB format
function preparePOIData(poi, order) {
  return {
    osmId: poi.id || 0,
    type: poi.type || 'node',
    name: poi.name || null,
    category: poi.category || null,
    distance: poi.distance || 0,
    lat: poi.lat || 0,
    lon: poi.lon || 0,
    tags: poi.tags ? JSON.stringify(poi.tags) : null,
    order: order || null,
  };
}

async function migrateOverpassPOIs() {
  console.log('🚀 Starting overpassPOIs migration...\n');

  try {
    // Step 1: Verify schema is synced
    console.log('Step 1: Verifying schema is synced...');
    try {
      await db.query({
        overpassPOIs: {
          $: { limit: 1 }
        }
      });
      console.log('  ✅ Schema verified\n');
    } catch (error) {
      console.error('  ❌ Schema not synced! Please sync the schema first.');
      console.error('  Error:', error.message);
      process.exit(1);
    }

    // Step 2: Fetch all buffets with overpassPOIs field
    console.log('Step 2: Fetching all buffets...');
    let allBuffets = [];
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
      
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < limit) break;
      offset += limit;
    }

    // Filter buffets that have overpassPOIs in JSON field
    const buffets = allBuffets.filter(b => b.overpassPOIs && b.overpassPOIs.trim() !== '');
    console.log(`  Found ${allBuffets.length} total buffets`);
    console.log(`  Found ${buffets.length} buffets with overpassPOIs field\n`);

    if (buffets.length === 0) {
      console.log('✅ No buffets with overpassPOIs found. Migration complete!');
      return;
    }

    // Step 3: Check existing POIs in the overpassPOIs table
    console.log('Step 3: Checking existing POIs in overpassPOIs table...');
    const poisByBuffetId = new Map();
    
    // For efficiency, we'll check POIs as we process buffets
    console.log(`  Will check for duplicates during migration\n`);

    // Step 4: Process buffets and create POI records
    console.log('Step 4: Migrating overpassPOIs...');
    
    let totalPOIsProcessed = 0;
    let totalPOIsCreated = 0;
    let totalPOIsSkipped = 0;
    let buffetsProcessed = 0;
    let buffetsWithErrors = 0;

    const BATCH_SIZE = 50; // Process POIs in batches to avoid overwhelming the DB

    for (let i = 0; i < buffets.length; i += BATCH_SIZE) {
      const batch = buffets.slice(i, i + BATCH_SIZE);
      const batchTransactions = [];

      for (const buffet of batch) {
        try {
          const poisJson = buffet.overpassPOIs;
          const poisData = parseJsonField(poisJson);

          // Handle both array format and object format
          let poisArray = null;
          if (Array.isArray(poisData)) {
            poisArray = poisData;
          } else if (poisData && typeof poisData === 'object') {
            // If it's an object, check for common array keys
            if (poisData.pois && Array.isArray(poisData.pois)) {
              poisArray = poisData.pois;
            } else if (poisData.data && Array.isArray(poisData.data)) {
              poisArray = poisData.data;
            } else if (poisData.results && Array.isArray(poisData.results)) {
              poisArray = poisData.results;
            } else {
              // Try to find any array property
              const arrayKey = Object.keys(poisData).find(key => Array.isArray(poisData[key]));
              if (arrayKey) {
                poisArray = poisData[arrayKey];
              }
            }
          }

          if (!Array.isArray(poisArray) || poisArray.length === 0) {
            continue;
          }

          let poisCreatedForBuffet = 0;
          let poisSkippedForBuffet = 0;

          // Check if this buffet already has POIs in the table
          let existingPOIsSet = poisByBuffetId.get(buffet.id);
          if (!existingPOIsSet) {
            try {
              const checkResult = await db.query({
                buffets: {
                  $: { where: { id: buffet.id } },
                  overpassPOIs: {},
                },
              });
              const existingPOIs = checkResult.buffets?.[0]?.overpassPOIs || [];
              existingPOIsSet = new Set();
              existingPOIs.forEach(poi => {
                const key = `${poi.osmId}_${poi.lat}_${poi.lon}`;
                existingPOIsSet.add(key);
              });
              poisByBuffetId.set(buffet.id, existingPOIsSet);
            } catch (error) {
              existingPOIsSet = new Set();
              poisByBuffetId.set(buffet.id, existingPOIsSet);
            }
          }

          // Sort POIs by distance to maintain order
          const sortedPOIs = [...poisArray].sort((a, b) => {
            const distA = a.distance || 0;
            const distB = b.distance || 0;
            return distA - distB;
          });

          for (let idx = 0; idx < sortedPOIs.length; idx++) {
            const poi = sortedPOIs[idx];
            totalPOIsProcessed++;

            // Check if POI already exists (by osmId + coordinates)
            const poiKey = `${poi.id || poi.osmId || 0}_${poi.lat || 0}_${poi.lon || 0}`;
            
            if (existingPOIsSet.has(poiKey)) {
              poisSkippedForBuffet++;
              totalPOIsSkipped++;
              continue;
            }

            // Prepare POI data
            const poiData = preparePOIData(poi, idx);

            // Create POI transaction
            const poiId = id();
            const poiTx = db.tx.overpassPOIs[poiId]
              .create(poiData)
              .link({ buffet: buffet.id });

            batchTransactions.push(poiTx);
            // Mark as existing before adding to transaction
            existingPOIsSet.add(poiKey);
            poisCreatedForBuffet++;
            totalPOIsCreated++;
          }
          
          // Update the map with the new POIs we're about to create
          poisByBuffetId.set(buffet.id, existingPOIsSet);

          buffetsProcessed++;

          if (poisCreatedForBuffet > 0) {
            console.log(`  ✓ ${buffet.name}: Created ${poisCreatedForBuffet} POIs${poisSkippedForBuffet > 0 ? `, skipped ${poisSkippedForBuffet} duplicates` : ''}`);
          }
        } catch (error) {
          console.error(`  ✗ Error processing ${buffet.name}:`, error.message);
          buffetsWithErrors++;
        }
      }

      // Execute batch transaction
      if (batchTransactions.length > 0) {
        try {
          await db.transact(batchTransactions);
          console.log(`  → Committed batch: ${batchTransactions.length} POIs created\n`);
        } catch (error) {
          console.error(`  ✗ Error committing batch:`, error.message);
          buffetsWithErrors += batch.length;
        }
      }
    }

    // Step 5: Summary
    console.log('\n📊 Migration Summary:');
    console.log(`  Buffets processed: ${buffetsProcessed}/${buffets.length}`);
    console.log(`  Total POIs processed: ${totalPOIsProcessed}`);
    console.log(`  POIs created: ${totalPOIsCreated}`);
    console.log(`  POIs skipped (duplicates): ${totalPOIsSkipped}`);
    if (buffetsWithErrors > 0) {
      console.log(`  ⚠ Buffets with errors: ${buffetsWithErrors}`);
    }

    console.log('\n✅ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the data looks correct in your InstantDB dashboard');
    console.log('  2. Test that buffet detail pages load POIs correctly');
    console.log('  3. Once confirmed, you can optionally remove the JSON overpassPOIs field');
    console.log('     from the schema (it will remain for backward compatibility)');

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migration
if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

migrateOverpassPOIs();
