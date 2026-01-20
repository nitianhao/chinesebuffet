// Script to import Yelp attribute fields from yelp-restaurant-mapping.json to InstantDB
// Updates the following fields:
// - restaurantsDelivery (from restaurants_delivery)
// - restaurantsTakeOut (from restaurants_take_out)
// - businessAcceptsCreditCards (from business_accepts_credit_cards)
// - bikeParking (from bike_parking)
// - dogsAllowed (from dogs_allowed)
// - wheelchairAccessible (from wheelchair_accessible)
// - businessParking (from business_parking, stored as JSON string)
// Run with: node scripts/import-yelp-attributes-fields.js

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

async function importYelpAttributeFields() {
  console.log('🚀 Starting Yelp attribute fields import...\n');

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

    // Step 2: Extract attribute fields and build map
    console.log('Step 2: Extracting Yelp attribute fields...');
    const attributesMap = new Map(); // key -> { attributes, placeId, yelpId }
    
    let entriesWithAttributes = 0;
    for (const entry of entries) {
      const placeId = entry.buffetId || entry.placeID;
      const yelpId = entry.yelp?.id;
      
      if (!placeId && !yelpId) continue;

      // Check for attributes in yelp.details.attributes
      const attributes = entry.yelp?.details?.attributes;
      
      if (!attributes || typeof attributes !== 'object') continue;

      // Extract the fields we need
      const extractedAttributes = {};
      let hasAnyAttribute = false;

      if ('restaurants_delivery' in attributes) {
        extractedAttributes.restaurantsDelivery = attributes.restaurants_delivery === true;
        hasAnyAttribute = true;
      }
      if ('restaurants_take_out' in attributes) {
        extractedAttributes.restaurantsTakeOut = attributes.restaurants_take_out === true;
        hasAnyAttribute = true;
      }
      if ('business_accepts_credit_cards' in attributes) {
        extractedAttributes.businessAcceptsCreditCards = attributes.business_accepts_credit_cards === true;
        hasAnyAttribute = true;
      }
      if ('bike_parking' in attributes) {
        extractedAttributes.bikeParking = attributes.bike_parking === true;
        hasAnyAttribute = true;
      }
      if ('dogs_allowed' in attributes) {
        extractedAttributes.dogsAllowed = attributes.dogs_allowed === true;
        hasAnyAttribute = true;
      }
      if ('wheelchair_accessible' in attributes) {
        extractedAttributes.wheelchairAccessible = attributes.wheelchair_accessible === true;
        hasAnyAttribute = true;
      }
      if ('business_parking' in attributes && attributes.business_parking !== null && typeof attributes.business_parking === 'object') {
        extractedAttributes.businessParking = stringifyIfNeeded(attributes.business_parking);
        hasAnyAttribute = true;
      }

      if (hasAnyAttribute) {
        // Use placeId as primary key, or yelpId if placeId doesn't exist
        const key = placeId || yelpId;
        attributesMap.set(key, {
          attributes: extractedAttributes,
          placeId: placeId,
          yelpId: yelpId
        });
        entriesWithAttributes++;
      }
    }
    
    console.log(`  Found ${entriesWithAttributes} entries with attribute fields\n`);

    // Step 3: Build maps of placeId -> buffet ID, yelpId -> buffet ID, and id -> buffet ID
    console.log('Step 3: Building buffet lookup maps by placeId, yelpId, and id...');
    const buffetMapByPlaceId = new Map();
    const buffetMapByYelpId = new Map();
    const buffetMapById = new Map(); // Direct InstantDB id mapping
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
        // Map by InstantDB id (for cases where buffetId is the InstantDB id)
        buffetMapById.set(buffet.id, buffet.id);
        
        if (buffet.placeId) {
          buffetMapByPlaceId.set(buffet.placeId, buffet.id);
        }
        
        // Check yelpData for yelpId
        if (buffet.yelpData) {
          try {
            const yelpData = parseJsonField(buffet.yelpData);
            if (yelpData && yelpData.id) {
              buffetMapByYelpId.set(yelpData.id, buffet.id);
            }
            // Also check yelpId field directly
            if (yelpData && yelpData.yelpId) {
              buffetMapByYelpId.set(yelpData.yelpId, buffet.id);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });
      
      if (buffets.length < limit) break;
      offset += limit;
    }
    
    console.log(`  Found ${buffetMapByPlaceId.size} buffets with placeId`);
    console.log(`  Found ${buffetMapByYelpId.size} buffets with yelpId`);
    console.log(`  Found ${buffetMapById.size} buffets with id\n`);

    // Step 4: Process entries and prepare updates
    console.log('Step 4: Processing attribute fields and preparing updates...');
    
    let totalEntries = 0;
    let buffetsWithNoMatch = 0;
    let buffetsUpdated = 0;
    let buffetsSkipped = 0;
    let buffetsWithErrors = 0;

    const UPDATE_BATCH_SIZE = 50; // Update buffets in batches
    const buffetCache = new Map(); // Cache for fetched buffet data

    // Convert map to array for batch processing
    const attributeEntries = Array.from(attributesMap.entries());
    
    for (let i = 0; i < attributeEntries.length; i += UPDATE_BATCH_SIZE) {
      const entryBatch = attributeEntries.slice(i, i + UPDATE_BATCH_SIZE);
      const batchTransactions = [];

      for (const [key, entryData] of entryBatch) {
        try {
          totalEntries++;
          const { attributes, placeId, yelpId } = entryData;

          // Try to find buffet by placeId first
          let buffetId = placeId ? buffetMapByPlaceId.get(placeId) : null;
          
          // If not found by placeId, try by InstantDB id (in case buffetId is the InstantDB id)
          if (!buffetId && placeId) {
            buffetId = buffetMapById.get(placeId);
          }
          
          // If still not found, try by yelpId
          if (!buffetId && yelpId) {
            buffetId = buffetMapByYelpId.get(yelpId);
          }
          
          if (!buffetId) {
            buffetsWithNoMatch++;
            if (buffetsWithNoMatch <= 10) {
              console.log(`  ⚠ No buffet found for placeId: ${placeId || 'N/A'}, yelpId: ${yelpId || 'N/A'}`);
            }
            continue;
          }

          // Build update object with only fields that have values
          const updateFields = {};
          if ('restaurantsDelivery' in attributes) {
            updateFields.restaurantsDelivery = attributes.restaurantsDelivery;
          }
          if ('restaurantsTakeOut' in attributes) {
            updateFields.restaurantsTakeOut = attributes.restaurantsTakeOut;
          }
          if ('businessAcceptsCreditCards' in attributes) {
            updateFields.businessAcceptsCreditCards = attributes.businessAcceptsCreditCards;
          }
          if ('bikeParking' in attributes) {
            updateFields.bikeParking = attributes.bikeParking;
          }
          if ('dogsAllowed' in attributes) {
            updateFields.dogsAllowed = attributes.dogsAllowed;
          }
          if ('wheelchairAccessible' in attributes) {
            updateFields.wheelchairAccessible = attributes.wheelchairAccessible;
          }
          if ('businessParking' in attributes) {
            updateFields.businessParking = attributes.businessParking;
          }

          // Only create update if we have fields to update
          if (Object.keys(updateFields).length > 0) {
            // Create update transaction
            const updateTx = db.tx.buffets[buffetId].update(updateFields);
            
            batchTransactions.push(updateTx);
            buffetsUpdated++;
          } else {
            buffetsSkipped++;
          }

        } catch (error) {
          console.error(`  ✗ Error processing key ${key} (placeId: ${placeId || 'N/A'}, yelpId: ${yelpId || 'N/A'}):`, error.message);
          buffetsWithErrors++;
        }
      }

      // Commit batch
      if (batchTransactions.length > 0) {
        try {
          await db.transact(batchTransactions);
          console.log(`  ✓ Updated batch: ${batchTransactions.length} buffets (total updated: ${buffetsUpdated}/${totalEntries})`);
        } catch (error) {
          console.error(`  ✗ Error committing batch (${batchTransactions.length} buffets):`, error.message);
          buffetsSkipped += batchTransactions.length;
          buffetsUpdated -= batchTransactions.length;
        }
      }

      if ((i + UPDATE_BATCH_SIZE) % 500 === 0 || i + UPDATE_BATCH_SIZE >= attributeEntries.length) {
        console.log(`  → Progress: ${Math.min(i + UPDATE_BATCH_SIZE, attributeEntries.length)}/${attributeEntries.length} entries processed\n`);
      }
    }

    // Step 5: Summary
    console.log('\n📊 Import Summary:');
    console.log(`  Total entries with attributes: ${totalEntries}`);
    console.log(`  Buffets with no matching placeId or yelpId: ${buffetsWithNoMatch}`);
    console.log(`  Buffets updated: ${buffetsUpdated}`);
    if (buffetsSkipped > 0) {
      console.log(`  ⚠ Buffets skipped: ${buffetsSkipped}`);
    }
    if (buffetsWithErrors > 0) {
      console.log(`  ⚠ Buffets with processing errors: ${buffetsWithErrors}`);
    }

    console.log('\n✅ Import complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the data looks correct in your InstantDB dashboard');
    console.log('  2. Check that the new fields are populated correctly');
    console.log('  3. Sync your schema in InstantDB dashboard if needed');

  } catch (error) {
    console.error('\n❌ Error during import:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run import
importYelpAttributeFields();


