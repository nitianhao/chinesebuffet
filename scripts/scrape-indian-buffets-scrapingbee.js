/**
 * Scrape Indian restaurants using ScrapingBee Google Search API.
 *
 * API docs: https://www.scrapingbee.com/features/google/
 * Endpoint: GET https://app.scrapingbee.com/api/v1/google
 * Auth: Bearer token in Authorization header
 *
 * Iterates the 342 US cities CSV, searches Google Maps for
 * "Indian restaurant <city> <state>", saves per-city JSON files immediately.
 * Skips cities already scraped (resume support).
 *
 * Usage:
 *   node scripts/scrape-indian-buffets-scrapingbee.js [options]
 *
 * Options:
 *   --city "New York"     Scrape only a specific city
 *   --state "New York"    Scrape only cities in a specific state
 *   --limit N             Limit number of cities to process (default: all)
 *   --test                Test mode: 1 city only
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const SCRAPINGBEE_KEY = 'IFBZACECQY5BVK2313DIGNBI7CUH56N6RKSN1ZAG6ZYI8U5KI8G69N5BOP0F81P7NWSNU7TSTP99LDMM';
const API_BASE = 'https://app.scrapingbee.com/api/v1/google';
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
let testMode = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  if (arg === '--city' && next) { cityFilter = next; i++; }
  else if (arg === '--state' && next) { stateFilter = next; i++; }
  else if (arg === '--limit' && next) { cityLimit = parseInt(next, 10); i++; }
  else if (arg === '--test') { testMode = true; }
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

console.log(`\n🍛 Indian Restaurant Scraper (ScrapingBee Google API)`);
console.log(`   Cities to process: ${targetCities.length}`);
console.log(`   Mode: ${testMode ? 'TEST' : 'FULL'}\n`);

// --- Output dir ---
const outputDir = path.join(__dirname, '..', 'data', 'indian-buffets');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// --- City slug helper ---
function citySlug(city) {
  return `${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.stateAbbr.toLowerCase()}`;
}

// --- Check if city already scraped (resume support) ---
function isCityScraped(city) {
  const filePath = path.join(outputDir, `sb-city-${citySlug(city)}.json`);
  return fs.existsSync(filePath);
}

// --- API call with retry ---
async function searchGoogleMaps(query, countryCode = 'us') {
  const params = new URLSearchParams({
    search: query,
    search_type: 'maps',
    country_code: countryCode,
  });

  const url = `${API_BASE}?${params.toString()}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SCRAPINGBEE_KEY}`,
        },
      });

      if (response.status === 429) {
        console.log(`   ⏳ Rate limited, waiting ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
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
    console.log(`\n🔍 "${query}"`);

    apiCalls++;

    try {
      const data = await searchGoogleMaps(query);
      const places = data.map_results || [];

      if (places.length === 0) {
        console.log(`   0 results`);
      } else {
        console.log(`   ${places.length} results`);
      }

      // Transform to match our data shape
      const results = places.map((p, i) => ({
        title: p.title || '',
        place_id: p.place_id || null,
        rating: p.rating ? parseFloat(p.rating) : null,
        reviews: p.reviews ? parseInt(p.reviews) : null,
        price: p.price || null,
        type: p.category || '',
        address: p.address || '',
        phone: p.phone || '',
        website: p.link || null,
        position: p.position || i + 1,
        _searchQuery: query,
        _searchCity: city.city,
        _searchState: city.state,
        _provider: 'scrapingbee',
      }));

      // Save per-city results immediately
      const cityFilePath = path.join(outputDir, `sb-city-${citySlug(city)}.json`);
      const cityData = {
        city: city.city,
        state: city.state,
        stateAbbr: city.stateAbbr,
        population: city.population,
        count: results.length,
        results,
        scrapedAt: new Date().toISOString(),
        provider: 'scrapingbee',
      };

      fs.writeFileSync(cityFilePath, JSON.stringify(cityData, null, 2));

      if (results.length > 0) {
        citiesWithData++;
        totalFound += results.length;
        console.log(`   ✅ ${city.city}, ${city.stateAbbr}: ${results.length} Indian restaurants (saved)`);
      } else {
        console.log(`   ⚠️  ${city.city}, ${city.stateAbbr}: no results`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      // Save empty file to mark as attempted
      const cityFilePath = path.join(outputDir, `sb-city-${citySlug(city)}.json`);
      fs.writeFileSync(cityFilePath, JSON.stringify({
        city: city.city,
        state: city.state,
        stateAbbr: city.stateAbbr,
        population: city.population,
        count: 0,
        results: [],
        scrapedAt: new Date().toISOString(),
        provider: 'scrapingbee',
        error: err.message,
      }, null, 2));
    }

    // Save checkpoint
    const checkpointPath = path.join(outputDir, 'scrapingbee-checkpoint.json');
    fs.writeFileSync(checkpointPath, JSON.stringify({
      citiesProcessed: citiesWithData + skipped,
      citiesWithData,
      totalFound,
      apiCallsUsed: apiCalls,
      citiesSkipped: skipped,
      timestamp: new Date().toISOString(),
    }, null, 2));

    // Small delay between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Done!`);
  console.log(`   Total Indian restaurants: ${totalFound}`);
  console.log(`   Cities with data: ${citiesWithData}`);
  console.log(`   Cities skipped (already scraped): ${skipped}`);
  console.log(`   API calls used: ${apiCalls}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
