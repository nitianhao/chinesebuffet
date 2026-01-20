// Script to import business URLs from yelp-restaurant-mapping.json to InstantDB
// Updates the "website" field with data from yelp.details.attributes.business_url
// Run with: node scripts/import-business-urls.js

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

async function importBusinessUrls() {
  console.log('🚀 Starting business URL import...\n');

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

    // Step 2: Extract business URLs and build map
    console.log('Step 2: Extracting business URLs...');
    const businessUrlMap = new Map(); // key -> { businessUrl, placeId, yelpId }
    
    let entriesWithBusinessUrl = 0;
    for (const entry of entries) {
      const placeId = entry.buffetId || entry.placeID;
      const yelpId = entry.yelp?.id;
      
      if (!placeId && !yelpId) continue;

      // Check for business_url in yelp.details.attributes.business_url
      const businessUrl = entry.yelp?.details?.attributes?.business_url;
      
      // Only include non-empty URLs
      if (businessUrl && typeof businessUrl === 'string' && businessUrl.trim()) {
        // Use placeId as primary key, or yelpId if placeId doesn't exist
        const key = placeId || yelpId;
        businessUrlMap.set(key, {
          businessUrl: businessUrl.trim(),
          placeId: placeId,
          yelpId: yelpId
        });
        entriesWithBusinessUrl++;
      }
    }
    
    console.log(`  Found ${entriesWithBusinessUrl} entries with business URLs\n`);

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
    console.log('Step 4: Processing business URLs and preparing updates...');
    
    let totalBusinessUrls = 0;
    let buffetsWithNoMatch = 0;
    let buffetsUpdated = 0;
    let buffetsSkipped = 0;
    let buffetsWithErrors = 0;

    const UPDATE_BATCH_SIZE = 50; // Update buffets in batches
    const buffetCache = new Map(); // Cache for fetched buffet data

    // Convert map to array for batch processing
    const businessUrlEntries = Array.from(businessUrlMap.entries());
    
    for (let i = 0; i < businessUrlEntries.length; i += UPDATE_BATCH_SIZE) {
      const entryBatch = businessUrlEntries.slice(i, i + UPDATE_BATCH_SIZE);
      const batchTransactions = [];

      for (const [key, entryData] of entryBatch) {
        try {
          totalBusinessUrls++;
          const { businessUrl, placeId, yelpId } = entryData;

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

          // Fetch existing buffet data to check if website already exists (use cache)
          let existingWebsite = null;
          if (!buffetCache.has(buffetId)) {
            try {
              const result = await db.query({
                buffets: {
                  $: { where: { id: buffetId } }
                }
              });
              
              const existingBuffet = result.buffets?.[0];
              buffetCache.set(buffetId, existingBuffet || null);
              
              if (existingBuffet && existingBuffet.website) {
                existingWebsite = existingBuffet.website;
              }
            } catch (fetchError) {
              console.error(`  ⚠ Error fetching buffet ${buffetId}:`, fetchError.message);
              buffetCache.set(buffetId, null);
            }
          } else {
            // Use cached data
            const cachedBuffet = buffetCache.get(buffetId);
            if (cachedBuffet && cachedBuffet.website) {
              existingWebsite = cachedBuffet.website;
            }
          }
          
          // Check if website already exists and matches
          if (existingWebsite && existingWebsite.trim() === businessUrl) {
            buffetsSkipped++;
            continue;
          }
          
          // Create update transaction
          const updateTx = db.tx.buffets[buffetId].update({
            website: businessUrl
          });
          
          batchTransactions.push(updateTx);
          buffetsUpdated++;

        } catch (error) {
          console.error(`  ✗ Error processing key ${key} (placeId: ${placeId || 'N/A'}, yelpId: ${yelpId || 'N/A'}):`, error.message);
          buffetsWithErrors++;
        }
      }

      // Commit batch
      if (batchTransactions.length > 0) {
        try {
          await db.transact(batchTransactions);
          console.log(`  ✓ Updated batch: ${batchTransactions.length} buffets (total updated: ${buffetsUpdated}/${totalBusinessUrls})`);
        } catch (error) {
          console.error(`  ✗ Error committing batch (${batchTransactions.length} buffets):`, error.message);
          buffetsSkipped += batchTransactions.length;
          buffetsUpdated -= batchTransactions.length;
        }
      }

      if ((i + UPDATE_BATCH_SIZE) % 500 === 0 || i + UPDATE_BATCH_SIZE >= businessUrlEntries.length) {
        console.log(`  → Progress: ${Math.min(i + UPDATE_BATCH_SIZE, businessUrlEntries.length)}/${businessUrlEntries.length} business URLs processed\n`);
      }
    }

    // Step 5: Summary
    console.log('\n📊 Import Summary:');
    console.log(`  Total business URLs found: ${totalBusinessUrls}`);
    console.log(`  Buffets with no matching placeId or yelpId: ${buffetsWithNoMatch}`);
    console.log(`  Buffets updated: ${buffetsUpdated}`);
    if (buffetsSkipped > 0) {
      console.log(`  ⚠ Buffets skipped (already have same URL): ${buffetsSkipped}`);
    }
    if (buffetsWithErrors > 0) {
      console.log(`  ⚠ Buffets with processing errors: ${buffetsWithErrors}`);
    }

    console.log('\n✅ Import complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the data looks correct in your InstantDB dashboard');
    console.log('  2. Check that website field is populated correctly with business URLs');

  } catch (error) {
    console.error('\n❌ Error during import:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run import
importBusinessUrls();


