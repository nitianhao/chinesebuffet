// Script to retry POI enrichment for buffets that failed or have errors
// Run with: node scripts/retry-failed-pois.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables
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
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `[out:json][timeout:${timeout}];${query}`,
      });

      if (!response.ok) {
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
 */
async function findAllNearbyPOIs(lat, lon, radius = 1000, limit = 200) {
  const query = `
    (
      node["amenity"](around:${radius},${lat},${lon});
      way["amenity"](around:${radius},${lat},${lon});
      relation["amenity"](around:${radius},${lat},${lon});
      node["shop"](around:${radius},${lat},${lon});
      way["shop"](around:${radius},${lat},${lon});
      relation["shop"](around:${radius},${lat},${lon});
      node["tourism"](around:${radius},${lat},${lon});
      way["tourism"](around:${radius},${lat},${lon});
      relation["tourism"](around:${radius},${lat},${lon});
      node["leisure"](around:${radius},${lat},${lon});
      way["leisure"](around:${radius},${lat},${lon});
      relation["leisure"](around:${radius},${lat},${lon});
      node["healthcare"](around:${radius},${lat},${lon});
      way["healthcare"](around:${radius},${lat},${lon});
      relation["healthcare"](around:${radius},${lat},${lon});
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

      let category = element.tags?.amenity || 
                     element.tags?.shop || 
                     element.tags?.tourism || 
                     element.tags?.leisure ||
                     element.tags?.healthcare ||
                     element.tags?.office ||
                     'unknown';

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

    const poisByCategory = {};
    pois.forEach(poi => {
      if (!poisByCategory[poi.category]) {
        poisByCategory[poi.category] = [];
      }
      poisByCategory[poi.category].push(poi);
    });

    const poiData = {
      totalPOIs: pois.length,
      radius: 1000,
      fetchedAt: new Date().toISOString(),
      pois: pois,
      poisByCategory: poisByCategory,
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
 * Find buffets that failed or have errors
 */
async function findFailedBuffets() {
  console.log('🔍 Finding buffets that need retry...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    // Fetch all buffets
    console.log('Fetching all buffets from InstantDB...');
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

    console.log(`\nTotal buffets: ${allBuffets.length}\n`);

    // Filter for buffets that need retry
    const failedBuffets = allBuffets.filter(buffet => {
      // Must have coordinates
      if (!buffet.lat || !buffet.lng) return false;

      // Check if overpassPOIs is missing or invalid
      const existingPOIs = buffet.overpassPOIs;
      if (!existingPOIs) {
        return true; // No data, needs processing
      }

      try {
        const poiData = JSON.parse(existingPOIs);
        // If it has no POIs or is empty, consider it failed
        if (!poiData || poiData.totalPOIs === 0 || !poiData.pois || poiData.pois.length === 0) {
          return true; // Failed or empty, retry
        }
        return false; // Has valid data
      } catch (e) {
        return true; // Invalid JSON, retry
      }
    });

    console.log(`Buffets that need retry: ${failedBuffets.length}\n`);
    return failedBuffets;

  } catch (error) {
    console.error('Error finding failed buffets:', error);
    throw error;
  }
}

/**
 * Retry enrichment for failed buffets
 */
async function retryFailedBuffets() {
  console.log('🔄 Retrying POI enrichment for failed buffets...\n');

  const failedBuffets = await findFailedBuffets();

  if (failedBuffets.length === 0) {
    console.log('✅ No buffets need retry! All buffets have valid POI data.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  const BATCH_SIZE = 5;
  const DELAY_MS = 5000;

  console.log(`Processing ${failedBuffets.length} buffets in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < failedBuffets.length; i += BATCH_SIZE) {
    const batch = failedBuffets.slice(i, i + BATCH_SIZE);
    const batchTransactions = [];

    for (const buffet of batch) {
      processed++;
      const progress = `[${processed}/${failedBuffets.length}]`;

      console.log(`${progress} Processing: ${buffet.name}`);

      const enrichment = await enrichBuffetWithPOIs(buffet);

      if (enrichment.success) {
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

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (batchTransactions.length > 0) {
      try {
        await db.transact(batchTransactions);
        console.log(`  💾 Saved ${batchTransactions.length} updates to database\n`);
      } catch (error) {
        console.error(`  ❌ Error saving batch: ${error.message}\n`);
      }
    }

    if (i + BATCH_SIZE < failedBuffets.length) {
      console.log(`Waiting ${DELAY_MS}ms before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Retry Complete!');
  console.log('='.repeat(60));
  console.log(`Total buffets processed: ${processed}`);
  console.log(`Successfully updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log('='.repeat(60));
}

if (require.main === module) {
  retryFailedBuffets().catch(console.error);
}

module.exports = { retryFailedBuffets, findFailedBuffets };



