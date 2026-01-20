// Script to enrich all buffet records in InstantDB with nearby Points of Interest from Overpass API
// Run with: node scripts/enrich-pois-instantdb.js

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
      if (!trimmed || trimmed.startsWith('#')) return;
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
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Query Overpass API with retry logic for rate limits
 */
async function queryOverpass(query, endpoint = DEFAULT_OVERPASS_URL, timeout = 25, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Node.js 18+ has fetch built-in
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `[out:json][timeout:${timeout}];${query}`,
      });

      if (!response.ok) {
        // If rate limited, wait and retry
        if (response.status === 429 && attempt < retries) {
          const waitTime = attempt * 5000; // Linear backoff: 5s, 10s
          console.log(`    Rate limited, waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if ('error' in data) {
        throw new Error(`Overpass API error: ${data.error?.code} - ${data.error?.message}`);
      }

      return data;
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Failed to query Overpass API after ${retries} attempts: ${String(error)}`);
      }
      // Wait before retry
      const waitTime = attempt * 5000; // Linear backoff: 5s, 10s
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find all nearby POIs for a location
 * Searches for all amenities, shops, tourism, and leisure POIs
 */
async function findAllNearbyPOIs(lat, lon, radius = 1000, limit = 200) {
  // Query for all types of POIs
  const query = `
    (
      // Amenities
      node["amenity"](around:${radius},${lat},${lon});
      way["amenity"](around:${radius},${lat},${lon});
      relation["amenity"](around:${radius},${lat},${lon});
      // Shops
      node["shop"](around:${radius},${lat},${lon});
      way["shop"](around:${radius},${lat},${lon});
      relation["shop"](around:${radius},${lat},${lon});
      // Tourism
      node["tourism"](around:${radius},${lat},${lon});
      way["tourism"](around:${radius},${lat},${lon});
      relation["tourism"](around:${radius},${lat},${lon});
      // Leisure
      node["leisure"](around:${radius},${lat},${lon});
      way["leisure"](around:${radius},${lat},${lon});
      relation["leisure"](around:${radius},${lat},${lon});
      // Healthcare
      node["healthcare"](around:${radius},${lat},${lon});
      way["healthcare"](around:${radius},${lat},${lon});
      relation["healthcare"](around:${radius},${lat},${lon});
      // Office
      node["office"](around:${radius},${lat},${lon});
      way["office"](around:${radius},${lat},${lon});
      relation["office"](around:${radius},${lat},${lon});
    );
    out center meta;
  `;

  try {
    const response = await queryOverpass(query);
    const pois = [];

    for (const element of response.elements) {
      const elementLat = element.lat || (element.geometry?.[0]?.lat);
      const elementLon = element.lon || (element.geometry?.[0]?.lon);

      if (!elementLat || !elementLon) continue;

      const distance = calculateDistanceMeters(lat, lon, elementLat, elementLon);

      // Determine category
      let category = element.tags?.amenity || 
                     element.tags?.shop || 
                     element.tags?.tourism || 
                     element.tags?.leisure ||
                     element.tags?.healthcare ||
                     element.tags?.office ||
                     'unknown';

      // Determine subcategory (e.g., cuisine type for restaurants)
      let subcategory = null;
      if (element.tags?.amenity === 'restaurant' && element.tags?.cuisine) {
        subcategory = element.tags.cuisine;
      }

      pois.push({
        id: element.id,
        type: element.type,
        name: element.tags?.name || null,
        category: category,
        subcategory: subcategory,
        distance: Math.round(distance),
        lat: elementLat,
        lon: elementLon,
        tags: element.tags || {},
      });
    }

    // Sort by distance and limit results
    return pois
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  } catch (error) {
    console.error(`Error fetching POIs: ${error.message}`);
    return [];
  }
}

/**
 * Enrich a single buffet with POI data
 */
async function enrichBuffetWithPOIs(buffet) {
  if (!buffet.lat || !buffet.lng) {
    return { success: false, reason: 'No coordinates' };
  }

  try {
    console.log(`  Fetching POIs for ${buffet.name} (${buffet.lat}, ${buffet.lng})...`);
    
    const pois = await findAllNearbyPOIs(buffet.lat, buffet.lng, 1000, 200);
    
    if (pois.length === 0) {
      return { success: false, reason: 'No POIs found' };
    }

    // Group POIs by category for easier analysis
    const poisByCategory = {};
    pois.forEach(poi => {
      if (!poisByCategory[poi.category]) {
        poisByCategory[poi.category] = [];
      }
      poisByCategory[poi.category].push(poi);
    });

    // Create enrichment data structure
    const poiData = {
      totalPOIs: pois.length,
      radius: 1000, // meters
      fetchedAt: new Date().toISOString(),
      pois: pois,
      poisByCategory: poisByCategory,
      // Summary statistics
      summary: {
        restaurants: pois.filter(p => p.category === 'restaurant' || p.category === 'fast_food' || p.category === 'cafe').length,
        shops: pois.filter(p => p.tags?.shop).length,
        parks: pois.filter(p => p.category === 'park' || p.tags?.leisure === 'park').length,
        parking: pois.filter(p => p.category === 'parking' || p.tags?.amenity === 'parking').length,
        transit: pois.filter(p => p.tags?.highway === 'bus_stop' || p.tags?.public_transport).length,
        healthcare: pois.filter(p => p.category === 'hospital' || p.category === 'clinic' || p.category === 'pharmacy').length,
        education: pois.filter(p => p.category === 'school' || p.category === 'university' || p.category === 'library').length,
      }
    };

    return {
      success: true,
      poiData: poiData
    };
  } catch (error) {
    console.error(`  Error enriching ${buffet.name}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Main enrichment function
 */
async function enrichAllBuffetsWithPOIs() {
  console.log('🚀 Starting POI enrichment for all buffets in InstantDB...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Please set it in .env.local file');
    process.exit(1);
  }

  try {
    // Fetch all buffets with pagination
    console.log('Step 1: Fetching all buffets from InstantDB...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      try {
        const result = await db.query({
          buffets: {
            $: { limit: limit, offset: offset },
            city: {}
          }
        });

        const buffets = result.buffets || [];
        console.log(`  Fetched ${buffets.length} buffets (offset: ${offset})`);

        if (buffets.length === 0) {
          hasMore = false;
        } else {
          allBuffets = allBuffets.concat(buffets);

          if (buffets.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        }
      } catch (error) {
        console.error(`Error fetching batch at offset ${offset}:`, error.message);
        if (offset === 0) {
          // Try without pagination
          console.log('Trying without pagination...');
          const result = await db.query({
            buffets: {
              city: {}
            }
          });
          allBuffets = result.buffets || [];
        }
        hasMore = false;
      }
    }

    console.log(`\nTotal buffets in database: ${allBuffets.length}\n`);

    // Filter buffets with coordinates
    let buffetsWithCoords = allBuffets.filter(b => b.lat && b.lng);
    console.log(`Buffets with coordinates: ${buffetsWithCoords.length}`);
    console.log(`Buffets without coordinates: ${allBuffets.length - buffetsWithCoords.length}\n`);

    // Filter out already processed buffets
    console.log('Step 1.5: Filtering out already processed buffets...');
    const unprocessedBuffets = buffetsWithCoords.filter(buffet => {
      const existingPOIs = buffet.overpassPOIs;
      if (!existingPOIs) return true; // No data, needs processing
      
      try {
        const poiData = JSON.parse(existingPOIs);
        // Skip if already has POI data
        if (poiData && (poiData.totalPOIs !== undefined || poiData.pois || poiData.fetchedAt)) {
          return false; // Already processed
        }
      } catch (e) {
        // Invalid JSON, process it
        return true;
      }
      return true; // Default to processing if unsure
    });

    const alreadyProcessed = buffetsWithCoords.length - unprocessedBuffets.length;
    console.log(`Already processed: ${alreadyProcessed}`);
    console.log(`Need processing: ${unprocessedBuffets.length}\n`);

    buffetsWithCoords = unprocessedBuffets; // Use only unprocessed buffets

    // Process buffets
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const BATCH_SIZE = 5; // Process 5 at a time (reduced to avoid rate limits)
    const DELAY_MS = 5000; // 5 second delay between batches to respect rate limits

    console.log('Step 2: Enriching buffets with POI data...\n');
    console.log(`Processing in batches of ${BATCH_SIZE} with ${DELAY_MS}ms delay between batches`);
    console.log(`Individual requests have 2s delay to avoid rate limiting\n`);

    for (let i = 0; i < buffetsWithCoords.length; i += BATCH_SIZE) {
      const batch = buffetsWithCoords.slice(i, i + BATCH_SIZE);
      const batchTransactions = [];

      for (const buffet of batch) {
        processed++;
        const progress = `[${processed}/${buffetsWithCoords.length}]`;

        // Check if already enriched (skip if overpassPOIs field exists and has data)
        const existingPOIs = buffet.overpassPOIs;
        if (existingPOIs) {
          try {
            const poiData = JSON.parse(existingPOIs);
            // Skip if already has POI data (regardless of when it was fetched)
            if (poiData && (poiData.totalPOIs !== undefined || poiData.pois || poiData.fetchedAt)) {
              console.log(`${progress} Skipping ${buffet.name}: Already enriched (${poiData.totalPOIs || 0} POIs found)`);
              skipped++;
              continue;
            }
          } catch (e) {
            // Invalid JSON, proceed with enrichment
          }
        }

        console.log(`${progress} Processing: ${buffet.name}`);

        const enrichment = await enrichBuffetWithPOIs(buffet);

        if (enrichment.success) {
          // Prepare update transaction using correct InstantDB format
          const updateTx = db.tx.buffets[buffet.id].update({
            overpassPOIs: JSON.stringify(enrichment.poiData)
          });
          batchTransactions.push(updateTx);
          updated++;
          console.log(`  ✅ Found ${enrichment.poiData.totalPOIs} POIs`);
        } else {
          errors++;
          console.log(`  ⚠️  ${enrichment.reason}`);
        }

        // Increased delay between individual requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Update batch in database
      if (batchTransactions.length > 0) {
        try {
          await db.transact(batchTransactions);
          console.log(`  💾 Saved ${batchTransactions.length} updates to database\n`);
        } catch (error) {
          console.error(`  ❌ Error saving batch: ${error.message}\n`);
        }
      }

      // Delay between batches to handle rate limiting
      if (i + BATCH_SIZE < buffetsWithCoords.length) {
        console.log(`Waiting ${DELAY_MS}ms before next batch (rate limit protection)...\n`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Enrichment Complete!');
    console.log('='.repeat(60));
    console.log(`Total buffets processed: ${processed}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Skipped (already enriched): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  enrichAllBuffetsWithPOIs().catch(console.error);
}

module.exports = { enrichAllBuffetsWithPOIs, enrichBuffetWithPOIs };

