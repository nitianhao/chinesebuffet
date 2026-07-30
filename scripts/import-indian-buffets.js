/**
 * Import Indian buffet data from Apify scrape results into InstantDB.
 *
 * Reads the JSON output from scrape-indian-buffets-apify.js, transforms each
 * restaurant record to match the `buffets` schema, dedupes against existing
 * records (by placeId, slug, and geo+name proximity), matches to cities, and
 * writes new records with cuisineType='indian'.
 *
 * Usage:
 *   node scripts/import-indian-buffets.js [options]
 *
 * Options:
 *   --input <file>        Input JSON file (default: latest in data/indian-buffets/)
 *   --dry-run             Don't write to DB, just report (default)
 *   --commit              Write new records to InstantDB
 *   --state <value>       Limit to one state
 *   --city <value>        Limit to one city
 *
 * Output: data/indian-buffets/import-report.json
 */

const fs = require('fs');
const path = require('path');
const { init, id } = require('@instantdb/admin');
const { normalizeSearchText } = require('./lib/normalizeSearchText');

// --- Load env ---
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

// --- State abbreviation mapping ---
const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};

// --- Parse args ---
const args = process.argv.slice(2);
let inputFile = null;
let commit = false;
let stateFilter = null;
let cityFilter = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  if (arg === '--input' && next) { inputFile = next; i++; }
  else if (arg === '--commit') { commit = true; }
  else if (arg === '--dry-run') { commit = false; }
  else if (arg === '--state' && next) { stateFilter = next; i++; }
  else if (arg === '--city' && next) { cityFilter = next; i++; }
}

// --- Find input files (all per-city JSON files from all providers) ---
const dataDir = path.join(__dirname, '..', 'data', 'indian-buffets');
if (!fs.existsSync(dataDir)) {
  console.error('❌ No data/indian-buffets/ directory found. Run the scraper first.');
  process.exit(1);
}

// Collect all per-city files from all providers
const allCityFiles = fs.readdirSync(dataDir)
  .filter(f =>
    (f.startsWith('city-') || f.startsWith('sf-city-') || f.startsWith('sb-city-')) &&
    f.endsWith('.json')
  )
  .sort();

if (allCityFiles.length === 0) {
  console.error('❌ No per-city scrape results found in data/indian-buffets/. Run the scraper first.');
  process.exit(1);
}
console.log(`Found ${allCityFiles.length} city data files`);

// --- Helpers ---
function generateSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeStreet(street) {
  return normalizeSearchText(String(street || ''))
    .replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(avenue|ave)\b/g, 'ave')
    .replace(/\b(road|rd)\b/g, 'rd')
    .replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(drive|dr)\b/g, 'dr')
    .replace(/\b(lane|ln)\b/g, 'ln')
    .replace(/\s+/g, ' ')
    .trim();
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || Number.isNaN(v))) {
    return Number.POSITIVE_INFINITY;
  }
  const R = 6371000;
  const toRad = v => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractStreetFromAddress(address) {
  if (!address) return '';
  // "194 Bleecker St, New York, NY 10012" → "194 Bleecker St"
  const parts = address.split(',');
  return parts[0]?.trim() || '';
}

function extractPostalCode(address) {
  if (!address) return '';
  const match = address.match(/\b(\d{5}(?:-\d{4})?)\b/);
  return match ? match[1] : '';
}

function normalizeStateAbbr(state) {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_ABBR[state] || state.toUpperCase();
}

// --- Transform scraped item to buffet record ---
// Handles data from multiple providers (scrape.do, Scrapfly, Apify)
function transformApifyItem(item, citySlug) {
  const name = item.title || item.name || 'Unknown';
  const address = item.address || item.fullAddress || '';
  const street = item.street || extractStreetFromAddress(address);

  // City/state — parse from address, fall back to search metadata
  let cityName = item.city || '';
  let state = item.state || '';

  // Try to parse city, state, zip from address: "123 Main St, New York, NY 10016"
  if (!cityName || !state) {
    const addressParts = address.split(',').map(s => s.trim());
    if (addressParts.length >= 3) {
      // Find the part that looks like "NY 10016" or "NY"
      for (let i = addressParts.length - 1; i >= 1; i--) {
        const part = addressParts[i];
        const stateMatch = part.match(/^([A-Z]{2})(?:\s+(\d{5}))?$/);
        if (stateMatch) {
          if (!state) state = stateMatch[1];
          if (!cityName && addressParts[i - 1]) cityName = addressParts[i - 1];
          break;
        }
      }
    }
  }

  // Location — handle scrape.do (gps_coordinates) vs Apify (location)
  const gps = item.gps_coordinates || item.location || {};
  const lat = gps.lat || gps.latitude || item.lat || 0;
  const lng = gps.lng || gps.longitude || item.lng || 0;

  const stateAbbr = normalizeStateAbbr(state);
  const postalCode = item.postalCode || item.postal_code || extractPostalCode(address);
  const phone = item.phone || '';
  const phoneUnformatted = phone.replace(/\D/g, '');
  const website = item.website || item.link || null;
  const rating = item.totalScore || item.rating || 0;
  const reviewsCount = item.reviewsCount || item.reviews || 0;
  const price = item.price || null;
  const placeId = item.placeId || item.place_id || item.googleId || null;
  const categories = item.categories || item.types || [];
  const categoryName = item.categoryName || item.category || item.type || '';
  const primaryType = categoryName || (categories.length > 0 ? categories[0] : null);
  const hours = item.openingHours || item.openHours || item.operating_hours || [];
  const permanentlyClosed = item.permanentlyClosed || false;
  const temporarilyClosed = item.temporarilyClosed || false;
  const imagesCount = item.imagesCount || 0;
  const description = item.description || null;
  const locatedIn = item.locatedIn || null;
  const serviceOptions = item.service_options || item.serviceOptions || null;

  const buffetSlug = generateSlug(name);

  return {
    name,
    slug: buffetSlug,
    street,
    cityName,
    state,
    stateAbbr,
    postalCode,
    address,
    phone,
    phoneUnformatted,
    website,
    price,
    rating,
    reviewsCount,
    lat,
    lng,
    neighborhood: null,
    permanentlyClosed,
    temporarilyClosed,
    placeId,
    imagesCount,
    categoryName,
    primaryType,
    hours: JSON.stringify(hours),
    categories: JSON.stringify(categories),
    description,
    locatedIn,
    imageCategories: JSON.stringify(item.imageCategories || []),
    serviceOptions: serviceOptions ? JSON.stringify(serviceOptions) : null,
    cuisineType: 'indian',
    citySlug,
  };
}

// --- Main ---
async function main() {
  // Load scrape data
  console.log(`\n🍛 Import Indian Buffets`);
  console.log(`   Mode: ${commit ? 'COMMIT (write to DB)' : 'DRY RUN'}\n`);

  // Load all per-city files
  const allItems = [];
  let totalRaw = 0;

  for (const fileName of allCityFiles) {
    const filePath = path.join(dataDir, fileName);
    const cityData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Apply filters
    if (stateFilter) {
      const abbr = normalizeStateAbbr(stateFilter);
      if (cityData.stateAbbr !== abbr && normalizeStateAbbr(cityData.state) !== abbr) continue;
    }
    if (cityFilter && cityData.city.toLowerCase() !== cityFilter.toLowerCase()) continue;

    for (const item of cityData.results || []) {
      allItems.push({ item, searchCity: cityData });
      totalRaw++;
    }
  }

  console.log(`   Total scraped items across all files: ${totalRaw}`);

  console.log(`   Total scraped items: ${allItems.length}`);

  // Dedupe by placeId within the scraped data
  const seenPlaceIds = new Set();
  const dedupedItems = [];
  let dupeCount = 0;

  for (const { item, searchCity } of allItems) {
    const placeId = item.placeId || item.place_id || item.googleId;
    if (placeId && seenPlaceIds.has(placeId)) {
      dupeCount++;
      continue;
    }
    if (placeId) seenPlaceIds.add(placeId);
    dedupedItems.push({ item, searchCity });
  }

  console.log(`   After dedupe (by placeId): ${dedupedItems.length} (${dupeCount} duplicates removed)`);

  // Init DB
  const schema = require('../src/instant.schema.ts');
  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  // Load all existing Indian buffets from DB to check for dupes
  console.log('\nFetching existing Indian buffets from InstantDB...');
  const existingResult = await db.query({
    buffets: {
      $: {
        where: { cuisineType: 'indian' },
        fields: ['id', 'name', 'slug', 'placeId', 'lat', 'lng', 'address', 'cityName', 'stateAbbr'],
        limit: 10000,
      },
    },
  });
  const existingBuffets = existingResult.buffets || [];
  console.log(`   Found ${existingBuffets.length} existing Indian buffets in DB`);

  // Build lookup indexes for dedup
  const existingByPlaceId = new Map();
  const existingBySlugCity = new Map();

  for (const b of existingBuffets) {
    if (b.placeId) existingByPlaceId.set(b.placeId, b);
    const slugKey = `${b.slug}|${normalizeSearchText(b.cityName || '')}|${normalizeSearchText(b.stateAbbr || '')}`;
    existingBySlugCity.set(slugKey, b);
  }

  // Load cities from DB for matching
  console.log('Fetching cities from InstantDB...');
  const citiesResult = await db.query({
    cities: {
      $: {
        fields: ['id', 'slug', 'city', 'state', 'stateAbbr', 'population', 'rank'],
        limit: 10000,
      },
    },
  });
  const cities = citiesResult.cities || [];
  console.log(`   Found ${cities.length} cities`);

  // Build city lookup map
  const cityMap = new Map(); // slug -> city record
  const cityByNormalizedName = new Map(); // "normname|ABBR" -> city

  for (const c of cities) {
    cityMap.set(c.slug, c);
    const key = `${normalizeSearchText(c.city)}|${c.stateAbbr}`;
    cityByNormalizedName.set(key, c);
  }

  // Match each scraped item to a city
  const matched = [];
  const unmatched = [];

  for (const { item, searchCity } of dedupedItems) {
    const transformed = transformApifyItem(item, '');

    // Try to match city by name+state from the item's own data
    let city = null;
    if (transformed.cityName && transformed.stateAbbr) {
      const key = `${normalizeSearchText(transformed.cityName)}|${transformed.stateAbbr}`;
      city = cityByNormalizedName.get(key);
    }
    // Fallback to search city
    if (!city && searchCity) {
      const key = `${normalizeSearchText(searchCity.city)}|${searchCity.stateAbbr}`;
      city = cityByNormalizedName.get(key);
    }

    if (!city) {
      unmatched.push({ name: transformed.name, city: transformed.cityName, state: transformed.stateAbbr });
      continue;
    }

    transformed.citySlug = city.slug;

    // Check for duplicates against existing DB records
    const placeId = transformed.placeId;
    if (placeId && existingByPlaceId.has(placeId)) {
      continue; // Skip — already in DB
    }

    // Check slug+city dupe
    const slugKey = `${transformed.slug}|${normalizeSearchText(city.city)}|${city.stateAbbr}`;
    if (existingBySlugCity.has(slugKey)) {
      continue; // Skip — slug collision
    }

    // Also check geo proximity (within 50 meters + similar name)
    let isGeoDupe = false;
    for (const exB of existingBuffets) {
      if (transformed.lat && transformed.lng && exB.lat && exB.lng) {
        const dist = haversineMeters(transformed.lat, transformed.lng, exB.lat, exB.lng);
        if (dist < 50) {
          const nameSim = normalizeSearchText(transformed.name) === normalizeSearchText(exB.name);
          if (nameSim || dist < 15) {
            isGeoDupe = true;
            break;
          }
        }
      }
    }
    if (isGeoDupe) continue;

    matched.push({ transformed, city });
    // Add to lookup so subsequent items in this batch can dedupe against it
    if (placeId) existingByPlaceId.set(placeId, transformed);
    existingBySlugCity.set(slugKey, transformed);
  }

  console.log(`\n   Matched to cities: ${matched.length}`);
  console.log(`   Unmatched (no city): ${unmatched.length}`);
  console.log(`   Skipped (already in DB): ${dedupedItems.length - matched.length - unmatched.length}`);

  if (unmatched.length > 0 && unmatched.length <= 20) {
    console.log('\n   Unmatched items:');
    for (const u of unmatched) {
      console.log(`     - ${u.name} (${u.city}, ${u.state})`);
    }
  }

  if (matched.length === 0) {
    console.log('\n⚠️  No new buffets to import.');
    return;
  }

  // Group by city for stats
  const byCity = {};
  for (const { transformed, city } of matched) {
    const key = `${city.city}, ${city.stateAbbr}`;
    byCity[key] = (byCity[key] || 0) + 1;
  }

  console.log(`\n   New Indian buffets to import: ${matched.length}`);
  console.log(`   Cities: ${Object.keys(byCity).length}`);
  console.log('\n   Top cities:');
  const sortedCities = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [city, count] of sortedCities) {
    console.log(`     ${city}: ${count}`);
  }

  if (!commit) {
    console.log('\n⚠️  DRY RUN — no records written. Use --commit to write to InstantDB.');

    // Save report
    const reportPath = path.join(__dirname, '..', 'data', 'indian-buffets', 'import-report-dry.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      totalScraped: allItems.length,
      afterDedupe: dedupedItems.length,
      newBuffets: matched.length,
      unmatched: unmatched.length,
      byCity,
      timestamp: new Date().toISOString(),
    }, null, 2));
    console.log(`   Report saved: ${reportPath}`);
    return;
  }

  // --- Commit to DB ---
  console.log('\n🚀 Writing to InstantDB...');

  const BATCH_SIZE = 100;
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < matched.length; i += BATCH_SIZE) {
    const batch = matched.slice(i, i + BATCH_SIZE);
    const txs = batch.map(({ transformed, city }) => {
      const buffetId = id();
      return db.tx.buffets[buffetId]
        .create({
          name: transformed.name,
          slug: transformed.slug,
          street: transformed.street,
          cityName: transformed.cityName,
          state: transformed.state,
          stateAbbr: transformed.stateAbbr,
          postalCode: transformed.postalCode,
          address: transformed.address,
          phone: transformed.phone,
          phoneUnformatted: transformed.phoneUnformatted,
          website: transformed.website,
          price: transformed.price,
          rating: transformed.rating,
          reviewsCount: transformed.reviewsCount,
          lat: transformed.lat,
          lng: transformed.lng,
          neighborhood: transformed.neighborhood,
          permanentlyClosed: transformed.permanentlyClosed,
          temporarilyClosed: transformed.temporarilyClosed,
          placeId: transformed.placeId,
          imagesCount: transformed.imagesCount,
          categoryName: transformed.categoryName,
          primaryType: transformed.primaryType,
          hours: transformed.hours,
          categories: transformed.categories,
          description: transformed.description,
          imageCategories: transformed.imageCategories,
          serviceOptions: transformed.serviceOptions,
          cuisineType: 'indian',
        })
        .link({ city: city.id });
    });

    try {
      await db.transact(txs);
      imported += batch.length;
      console.log(`   Imported ${imported}/${matched.length}...`);
    } catch (err) {
      console.error(`   Error importing batch at ${i}: ${err.message}`);
      // Try smaller batches
      for (const { transformed, city } of batch) {
        try {
          const buffetId = id();
          await db.transact([
            db.tx.buffets[buffetId]
              .create({
                name: transformed.name,
                slug: transformed.slug,
                street: transformed.street,
                cityName: transformed.cityName,
                state: transformed.state,
                stateAbbr: transformed.stateAbbr,
                postalCode: transformed.postalCode,
                address: transformed.address,
                phone: transformed.phone,
                phoneUnformatted: transformed.phoneUnformatted,
                website: transformed.website,
                price: transformed.price,
                rating: transformed.rating,
                reviewsCount: transformed.reviewsCount,
                lat: transformed.lat,
                lng: transformed.lng,
                neighborhood: transformed.neighborhood,
                permanentlyClosed: transformed.permanentlyClosed,
                temporarilyClosed: transformed.temporarilyClosed,
                placeId: transformed.placeId,
                imagesCount: transformed.imagesCount,
                categoryName: transformed.categoryName,
                primaryType: transformed.primaryType,
                hours: transformed.hours,
                categories: transformed.categories,
                description: transformed.description,
                imageCategories: transformed.imageCategories,
                serviceOptions: transformed.serviceOptions,
                cuisineType: 'indian',
              })
              .link({ city: city.id }),
          ]);
          imported++;
        } catch (e) {
          console.error(`   Failed: ${transformed.name} — ${e.message}`);
          failed++;
        }
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Import complete!`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Failed: ${failed}`);
  console.log(`${'='.repeat(60)}`);

  // Save report
  const reportPath = path.join(__dirname, '..', 'data', 'indian-buffets', 'import-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    totalScraped: allItems.length,
    afterDedupe: dedupedItems.length,
    newBuffets: imported,
    failed,
    unmatched: unmatched.length,
    byCity,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log(`   Report saved: ${reportPath}`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('❌ INSTANT_ADMIN_TOKEN not found. Add it to .env.local');
  process.exit(1);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
