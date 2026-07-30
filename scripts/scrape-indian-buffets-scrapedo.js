/**
 * Scrape Indian restaurants using scrape.do Google Maps Scraper API.
 *
 * API docs: https://docs.scrape.do/google-maps-api/search-places
 * Endpoint: GET https://api.scrape.do/plugin/google/maps/search
 *
 * Iterates the 342 US cities CSV, searches Google Maps for
 * "Indian restaurant <city> <state>", paginates up to 6 pages,
 * dedupes by place_id, and saves per-city JSON files immediately.
 *
 * Usage:
 *   node scripts/scrape-indian-buffets-scrapedo.js [options]
 *
 * Options:
 *   --city "New York"     Scrape only a specific city
 *   --state "New York"    Scrape only cities in a specific state
 *   --limit N             Limit number of cities to process (default: all)
 *   --max-pages N         Max pages per query (default: 6, each = 20 results)
 *   --test                Test mode: 1 city, 1 page only
 *
 * Output: data/indian-buffets/city-<slug>.json (per city, saved immediately)
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const SCRAPE_DO_TOKEN = '0892d02837fe458c8d5e4a6aa67d1527331ac2f85ec';
const API_BASE = 'https://api.scrape.do/plugin/google/maps/search';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

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
let cityFilter = null;
let stateFilter = null;
let cityLimit = null;
let maxPages = 6;
let testMode = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  if (arg === '--city' && next) { cityFilter = next; i++; }
  else if (arg === '--state' && next) { stateFilter = next; i++; }
  else if (arg === '--limit' && next) { cityLimit = parseInt(next, 10); i++; }
  else if (arg === '--max-pages' && next) { maxPages = parseInt(next, 10); i++; }
  else if (arg === '--test') { testMode = true; maxPages = 1; }
}

// --- Load cities CSV ---
const csvPath = path.join(__dirname, '..', 'Research', 'us_cities_over_100k_2024_census_estimates.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const csvLines = csvContent.split('\n').slice(1).filter(l => l.trim());

const cities = csvLines.map(line => {
  const [rank, place, state, population] = line.split(',');
  if (!place || !state) return null;
  return {
    rank: parseInt(rank) || 0,
    city: place,
    state: state,
    stateAbbr: STATE_ABBR[state] || state,
    population: parseInt(population) || 0,
  };
}).filter(Boolean);

// Apply filters
let targetCities = cities;
if (cityFilter) {
  targetCities = targetCities.filter(c => c.city.toLowerCase() === cityFilter.toLowerCase());
}
if (stateFilter) {
  targetCities = targetCities.filter(c =>
    c.state.toLowerCase() === stateFilter.toLowerCase() ||
    c.stateAbbr.toLowerCase() === stateFilter.toLowerCase()
  );
}
if (cityLimit) {
  targetCities = targetCities.slice(0, cityLimit);
}
if (testMode) {
  targetCities = targetCities.slice(0, 1);
}

console.log(`\n🍛 Indian Restaurant Scraper (scrape.do Google Maps API)`);
console.log(`   Cities to process: ${targetCities.length}`);
console.log(`   Max pages per query: ${maxPages} (up to ${maxPages * 20} results per city)`);
console.log(`   Mode: ${testMode ? 'TEST' : 'FULL'}\n`);

// --- Output dir ---
const outputDir = path.join(__dirname, '..', 'data', 'indian-buffets');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// --- API call with retry ---
async function searchGoogleMaps(query, startOffset = 0) {
  const params = new URLSearchParams({
    token: SCRAPE_DO_TOKEN,
    q: query,
    start: String(startOffset),
    hl: 'en',
    gl: 'us',
    google_domain: 'google.com',
  });

  const url = `${API_BASE}?${params.toString()}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { method: 'GET' });

      if (response.status === 429) {
        console.log(`   ⏳ Rate limited, waiting ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(`   ⚠️ Attempt ${attempt} failed: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else {
        throw err;
      }
    }
  }
}

// --- Check if city already scraped (resume support) ---
function isCityScraped(city) {
  const citySlug = `${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.stateAbbr.toLowerCase()}`;
  const filePath = path.join(outputDir, `city-${citySlug}.json`);
  return fs.existsSync(filePath);
}

// --- Main ---
async function main() {
  let totalFound = 0;
  let citiesWithData = 0;
  let apiCalls = 0;
  let skipped = 0;

  for (const city of targetCities) {
    // Skip already-scraped cities (resume support)
    if (!testMode && isCityScraped(city)) {
      skipped++;
      continue;
    }

    const query = `Indian restaurant ${city.city} ${city.stateAbbr}`;
    const allResults = [];
    const seenPlaceIds = new Set();

    console.log(`\n🔍 "${query}"`);

    for (let page = 0; page < maxPages; page++) {
      const startOffset = page * 20;
      apiCalls++;

      try {
        const data = await searchGoogleMaps(query, startOffset);
        const places = data.local_results || [];

        if (places.length === 0) {
          console.log(`   Page ${page + 1}: 0 results (end of data)`);
          break;
        }

        let newCount = 0;
        for (const place of places) {
          const placeId = place.place_id;
          if (placeId && seenPlaceIds.has(placeId)) continue;
          if (placeId) seenPlaceIds.add(placeId);

          allResults.push({
            ...place,
            _searchQuery: query,
            _searchCity: city.city,
            _searchState: city.state,
            _page: page + 1,
          });
          newCount++;
        }

        console.log(`   Page ${page + 1}: ${places.length} results (${newCount} new)`);
      } catch (err) {
        console.error(`   ❌ Page ${page + 1} error: ${err.message}`);
        // If it's the first page that fails, skip the city
        if (page === 0) break;
        // Otherwise continue to next city
        break;
      }

      // Small delay between pages
      await new Promise(r => setTimeout(r, 1000));
    }

    // Save per-city results immediately
    const citySlug = `${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.stateAbbr.toLowerCase()}`;
    const cityFilePath = path.join(outputDir, `city-${citySlug}.json`);

    const cityData = {
      city: city.city,
      state: city.state,
      stateAbbr: city.stateAbbr,
      population: city.population,
      count: allResults.length,
      results: allResults,
      scrapedAt: new Date().toISOString(),
      apiCallsUsed: apiCalls,
    };

    fs.writeFileSync(cityFilePath, JSON.stringify(cityData, null, 2));

    if (allResults.length > 0) {
      citiesWithData++;
      totalFound += allResults.length;
      console.log(`   ✅ ${city.city}, ${city.stateAbbr}: ${allResults.length} Indian restaurants (saved)`);
    } else {
      console.log(`   ⚠️  ${city.city}, ${city.stateAbbr}: no results`);
    }

    // Save checkpoint
    const checkpointPath = path.join(outputDir, 'scrapedo-checkpoint.json');
    fs.writeFileSync(checkpointPath, JSON.stringify({
      citiesProcessed: citiesWithData + skipped,
      citiesWithData,
      totalFound,
      apiCallsUsed: apiCalls,
      citiesSkipped: skipped,
      timestamp: new Date().toISOString(),
    }, null, 2));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Done!`);
  console.log(`   Total Indian restaurants: ${totalFound}`);
  console.log(`   Cities with data: ${citiesWithData}`);
  console.log(`   Cities skipped (already scraped): ${skipped}`);
  console.log(`   API calls used: ${apiCalls}`);
  console.log(`   Credits used: ~${apiCalls * 10}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
