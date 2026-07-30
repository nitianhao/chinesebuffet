/**
 * Enrich Indian buffet records with nearby POIs from Overpass API.
 *
 * This script queries Indian buffets (cuisineType='indian') from InstantDB,
 * fetches nearby POIs from the Overpass API (OpenStreetMap), and writes
 * the results back to each buffet's overpassPOIs field.
 *
 * The Overpass API is free and open source — no API key required.
 *
 * Usage:
 *   node scripts/enrich-indian-pois.js [options]
 *
 * Options:
 *   --max-buffets N    Process at most N buffets (default: all)
 *   --radius N         Search radius in meters (default: 1000)
 */

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=#\s]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const schema = require('../src/instant.schema.ts');
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const args = process.argv.slice(2);
let maxBuffets = null;
let searchRadius = 1000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max-buffets' && args[i + 1]) { maxBuffets = parseInt(args[i + 1]); i++; }
  else if (args[i] === '--radius' && args[i + 1]) { searchRadius = parseInt(args[i + 1]); i++; }
}

const DEFAULT_OVERPASS_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const RETRYABLE_OVERPASS_STATUS = new Set([429, 504]);

function isRetryableOverpassStatus(status) {
  return RETRYABLE_OVERPASS_STATUS.has(status);
}

async function queryOverpass(query, endpoint = DEFAULT_OVERPASS_URL, timeout = 25, retries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `[out:json][timeout:${timeout}];${query}`,
      });

      if (!response.ok) {
        const status = response.status;
        const retryable = isRetryableOverpassStatus(status);
        const err = new Error(`Overpass API error: ${status}`);
        err.status = status;
        err.retryable = retryable;
        lastError = err;

        if (retryable && attempt < retries) {
          const waitTime = attempt * 5000;
          console.log(`    Overpass ${status}, waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw err;
      }

      const data = await response.json();

      if ('error' in data) {
        throw new Error(`Overpass API error: ${data.error?.code} - ${data.error?.message}`);
      }

      return data;
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;

      const retryable = Boolean(error?.retryable) || error?.status == null;
      if (!retryable) throw error;

      const waitTime = attempt * 5000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw lastError || new Error('Failed to query Overpass API');
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POI category mapping (same as existing script)
const POI_GROUPS = {
  accommodationLodging: ['hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'chalet'],
  agriculturalFarming: ['farm', 'farmyard', 'agricultural'],
  artsCulture: ['arts_centre', 'theatre', 'cinema', 'gallery', 'museum', 'library', 'community_centre', 'place_of_worship', 'arts_centre'],
  communicationsTechnology: ['telephone', 'post_office', 'internet_cafe'],
  educationLearning: ['school', 'college', 'university', 'kindergarten', 'language_school', 'driving_school'],
  financialServices: ['bank', 'atm', 'bureau_de_change', 'microfinance'],
  foodDining: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'bakery', 'food_court', 'bbq'],
  governmentPublicServices: ['townhall', 'police', 'fire_station', 'post_office', 'courthouse', 'embassy'],
  healthcareMedicalServices: ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'veterinary'],
  homeImprovementGarden: ['hardware_store', 'garden_centre', 'doityourself'],
  industrialManufacturing: ['factory', 'industrial', 'works'],
  miscellaneousServices: ['hairdresser', 'beauty', 'tattoo', 'massage'],
  personalCareBeauty: ['hairdresser', 'beauty', 'spa', 'nail_salon'],
  petCareVeterinary: ['pet', 'veterinary', 'animal_shelter'],
  professionalBusinessServices: ['office', 'company', 'accountant', 'lawyer', 'estate_agent'],
  recreationEntertainment: ['casino', 'cinema', 'nightclub', 'amusement_arcade', 'escape_game', 'karaoke_box'],
  religiousSpiritual: ['place_of_worship', 'church', 'mosque', 'temple', 'synagogue'],
  repairMaintenance: ['shoe_repair', 'tailor', 'watchmaker', 'repair'],
  retailShopping: ['supermarket', 'convenience', 'clothes', 'electronics', 'mobile_phone', 'books', 'gift', 'jewelry', 'beverages', 'bakery', 'butcher', 'greengrocer'],
  socialCommunityServices: ['social_facility', 'community_centre', 'childcare'],
  sportsFitness: ['sports_centre', 'gym', 'fitness', 'swimming_pool', 'stadium', 'pitch', 'track'],
  transportationAutomotive: ['parking', 'fuel', 'car_rental', 'car_wash', 'bicycle_rental', 'bus_station', 'taxi', 'car'],
  travelTourismServices: ['hotel', 'motel', 'guest_house', 'tourism', 'information', 'caravan_site', 'camp_site'],
  utilitiesInfrastructure: ['water', 'recycling', 'waste_basket', 'telephone', 'power', 'substation'],
};

function categorizePOI(element) {
  const tags = element.tags || {};
  const amenity = tags.amenity;
  const shop = tags.shop;
  const tourism = tags.tourism;
  const leisure = tags.leisure;

  for (const [group, amenities] of Object.entries(POI_GROUPS)) {
    if (amenity && amenities.includes(amenity)) return group;
    if (shop && amenities.includes(shop)) return group;
    if (tourism && amenities.includes(tourism)) return group;
    if (leisure && amenities.includes(leisure)) return group;
  }

  if (amenity) return 'miscellaneousServices';
  if (shop) return 'retailShopping';
  if (tourism) return 'travelTourismServices';
  if (leisure) return 'recreationEntertainment';
  return null;
}

async function findNearbyPOIs(lat, lon, radius = 1000) {
  const query = `(
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
    );
    out center body 200;`;

  const data = await queryOverpass(query, DEFAULT_OVERPASS_URL, 25, 3);
  const elements = data.elements || [];

  const pois = elements.map(el => {
    const elLat = el.lat || (el.center && el.center.lat) || 0;
    const elLon = el.lon || (el.center && el.center.lon) || 0;
    const distance = calculateDistanceMeters(lat, lon, elLat, elLon);
    const group = categorizePOI(el);
    if (!group) return null;

    return {
      osmId: el.id,
      type: el.type,
      name: el.tags?.name || null,
      category: el.tags?.amenity || el.tags?.shop || el.tags?.tourism || el.tags?.leisure,
      group,
      distance: Math.round(distance),
      distanceFt: Math.round(distance * 3.28084),
      lat: elLat,
      lon: elLon,
      tags: el.tags || {},
    };
  }).filter(p => p !== null).sort((a, b) => a.distance - b.distance);

  return pois;
}

async function main() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('❌ INSTANT_ADMIN_TOKEN not found');
    process.exit(1);
  }

  console.log(`\n🍛 Enriching Indian Buffets with Overpass POI data\n`);

  // Fetch all Indian buffets with coordinates
  console.log('Step 1: Fetching Indian buffets from InstantDB...');
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const result = await db.query({
      buffets: {
        $: {
          where: { cuisineType: 'indian' },
          limit: limit,
          offset: offset,
          fields: ['id', 'name', 'lat', 'lng', 'placeId', 'overpassPOIs'],
        },
      },
    });

    const buffets = result.buffets || [];
    console.log(`  Fetched ${buffets.length} Indian buffets (offset: ${offset})`);

    if (buffets.length === 0) {
      hasMore = false;
    } else {
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < limit) hasMore = false;
      else offset += limit;
    }
  }

  console.log(`\nTotal Indian buffets: ${allBuffets.length}`);

  // Filter buffets with coordinates
  let buffetsWithCoords = allBuffets.filter(b => b.lat && b.lng && b.lat !== 0 && b.lng !== 0);
  console.log(`With coordinates: ${buffetsWithCoords.length}`);
  console.log(`Without coordinates: ${allBuffets.length - buffetsWithCoords.length}\n`);

  // Filter out already processed
  const unprocessed = buffetsWithCoords.filter(b => {
    if (!b.overpassPOIs) return true;
    try {
      const data = JSON.parse(b.overpassPOIs);
      return !(data && (data.totalPOIs !== undefined || data.pois || data.fetchedAt));
    } catch { return true; }
  });

  console.log(`Already enriched: ${buffetsWithCoords.length - unprocessed.length}`);
  console.log(`Need enrichment: ${unprocessed.length}\n`);

  if (maxBuffets && unprocessed.length > maxBuffets) {
    console.log(`Limiting to ${maxBuffets} buffets this run\n`);
    unprocessed.length = maxBuffets;
  }

  if (unprocessed.length === 0) {
    console.log('✅ All Indian buffets already enriched!');
    return;
  }

  // Process
  let processed = 0, updated = 0, skipped = 0, errors = 0;
  const BATCH_SIZE = 3;
  const DELAY_MS = 5000;

  console.log(`Step 2: Enriching with Overpass API...`);
  console.log(`Processing in batches of ${BATCH_SIZE} with ${DELAY_MS}ms delay\n`);

  for (let i = 0; i < unprocessed.length; i += BATCH_SIZE) {
    const batch = unprocessed.slice(i, i + BATCH_SIZE);
    const txs = [];

    for (const buffet of batch) {
      processed++;
      const progress = `[${processed}/${unprocessed.length}]`;
      console.log(`${progress} ${buffet.name}`);

      try {
        const pois = await findNearbyPOIs(buffet.lat, buffet.lng, searchRadius);

        // Group POIs by category
        const byGroup = {};
        for (const poi of pois) {
          if (!byGroup[poi.group]) byGroup[poi.group] = [];
          byGroup[poi.group].push({
            osmId: poi.osmId,
            type: poi.type,
            name: poi.name,
            category: poi.category,
            group: poi.group,
            distance: poi.distance,
            distanceFt: poi.distanceFt,
            lat: poi.lat,
            lon: poi.lon,
            tags: poi.tags,
          });
        }

        const poiData = {
          totalPOIs: pois.length,
          fetchedAt: new Date().toISOString(),
          radius: searchRadius,
          ...byGroup,
        };

        txs.push(db.tx.buffets[buffet.id].update({
          overpassPOIs: JSON.stringify(poiData),
        }));

        // Also write individual category fields
        for (const [group, groupPOIs] of Object.entries(byGroup)) {
          if (group in POI_GROUPS || group !== 'miscellaneousServices') {
            txs.push(db.tx.buffets[buffet.id].update({
              [group]: JSON.stringify(groupPOIs),
            }));
          }
        }

        updated++;
        console.log(`  ✅ ${pois.length} POIs found`);
      } catch (err) {
        errors++;
        console.log(`  ❌ ${err.message}`);
      }

      // Delay between individual requests
      await new Promise(r => setTimeout(r, 2000));
    }

    // Commit batch
    if (txs.length > 0) {
      try {
        await db.transact(txs);
      } catch (err) {
        console.error(`  Batch commit error: ${err.message}`);
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < unprocessed.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Enrichment complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
