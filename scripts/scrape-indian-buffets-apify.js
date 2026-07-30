/**
 * Scrape Indian buffets using Apify Google Maps Scraper.
 *
 * Iterates the 342 US cities (pop 100k+) CSV, runs the
 * `apify/google-maps-scraper` actor for each city with broad Indian
 * restaurant search queries, dedupes by placeId, and saves raw results.
 *
 * Usage:
 *   node scripts/scrape-indian-buffets-apify.js [options]
 *
 * Options:
 *   --city "New York"     Scrape only a specific city
 *   --state "New York"    Scrape only cities in a specific state
 *   --limit N             Limit number of cities to process (default: all)
 *   --max-results N       Max results per city per query (default: 50)
 *   --output filename     Output filename (default: auto-generated)
 *   --test                Test mode: scrape only first city, 1 query, 10 results
 *
 * Output: data/indian-buffets/apify-indian-buffets-<timestamp>.json
 */

const fs = require('fs');
const path = require('path');
const { runActor } = require('../lib/apify-client');

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

// --- Search queries ---
const SEARCH_QUERIES = [
  'Indian buffet',
  'Indian restaurant',
];

// --- Parse args ---
const args = process.argv.slice(2);
let cityFilter = null;
let stateFilter = null;
let cityLimit = null;
let maxResults = 50;
let outputFile = null;
let testMode = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  if (arg === '--city' && next) { cityFilter = next; i++; }
  else if (arg === '--state' && next) { stateFilter = next; i++; }
  else if (arg === '--limit' && next) { cityLimit = parseInt(next, 10); i++; }
  else if (arg === '--max-results' && next) { maxResults = parseInt(next, 10); i++; }
  else if (arg === '--output' && next) { outputFile = next; i++; }
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
  targetCities = targetCities.filter(c => c.state.toLowerCase() === stateFilter.toLowerCase() || c.stateAbbr.toLowerCase() === stateFilter.toLowerCase());
}
if (cityLimit) {
  targetCities = targetCities.slice(0, cityLimit);
}
if (testMode) {
  targetCities = targetCities.slice(0, 1);
  maxResults = 10;
}

console.log(`\n🍛 Indian Buffet Scraper (Apify)`);
console.log(`   Cities to process: ${targetCities.length}`);
console.log(`   Max results per query: ${maxResults}`);
console.log(`   Queries: ${testMode ? SEARCH_QUERIES.slice(0, 1).join(', ') : SEARCH_QUERIES.join(', ')}`);
console.log(`   Mode: ${testMode ? 'TEST' : 'FULL'}\n`);

// --- Output dir ---
const outputDir = path.join(__dirname, '..', 'data', 'indian-buffets');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// --- Main ---
async function main() {
  const allResults = [];
  const seenPlaceIds = new Set();
  let totalRuns = 0;
  let totalFound = 0;
  let citiesWithData = 0;

  for (const city of targetCities) {
    const queries = testMode ? SEARCH_QUERIES.slice(0, 1) : SEARCH_QUERIES;
    const cityResults = [];

    for (const query of queries) {
      const searchStr = `${query} ${city.city} ${city.state}`;
      totalRuns++;

      console.log(`\n[${totalRuns}] 🔍 "${searchStr}"`);

      try {
        const input = {
          searchStringsArray: [`${query} ${city.city} ${city.stateAbbr}`],
          maxCrawledPlaces: maxResults,
          language: 'en',
          // Skip reviews to save Apify credits
          maxReviews: 0,
          // Skip images for now (per user request)
          maxImages: 0,
        };

        const result = await runActor('compass/crawler-google-places', input, {
          timeout: 300000, // 5 min per city-query
        });

        const items = result.items || [];
        console.log(`   Found ${items.length} results`);

        for (const item of items) {
          // Dedupe by placeId
          const placeId = item.placeId || item.googleId || item.id;
          if (placeId && seenPlaceIds.has(placeId)) continue;
          if (placeId) seenPlaceIds.add(placeId);

          cityResults.push({
            ...item,
            _searchQuery: query,
            _searchCity: city.city,
            _searchState: city.state,
          });
        }
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
        // Continue to next query
      }

      // Rate limit between queries
      if (!testMode) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (cityResults.length > 0) {
      citiesWithData++;
      totalFound += cityResults.length;
      allResults.push({
        city: city.city,
        state: city.state,
        stateAbbr: city.stateAbbr,
        population: city.population,
        count: cityResults.length,
        results: cityResults,
      });
      console.log(`   ✅ ${city.city}, ${city.stateAbbr}: ${cityResults.length} Indian restaurants`);

      // Save each city's results immediately to a per-city file
      const citySlug = `${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.stateAbbr.toLowerCase()}`;
      const cityFilePath = path.join(outputDir, `city-${citySlug}.json`);
      fs.writeFileSync(cityFilePath, JSON.stringify({
        city: city.city,
        state: city.state,
        stateAbbr: city.stateAbbr,
        population: city.population,
        count: cityResults.length,
        results: cityResults,
        scrapedAt: new Date().toISOString(),
      }, null, 2));
    } else {
      console.log(`   ⚠️  ${city.city}, ${city.stateAbbr}: no results`);
    }

    // Save checkpoint every 10 cities
    if (!testMode && totalRuns % 20 === 0) {
      const checkpointPath = path.join(outputDir, 'apify-checkpoint.json');
      fs.writeFileSync(checkpointPath, JSON.stringify({
        citiesProcessed: totalRuns,
        citiesWithData,
        totalFound,
        timestamp: new Date().toISOString(),
      }, null, 2));
      console.log(`   💾 Checkpoint saved (${totalFound} results so far)`);
    }
  }

  // --- Save final output ---
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const finalOutput = outputFile
    ? path.join(outputDir, outputFile)
    : path.join(outputDir, `apify-indian-buffets-${timestamp}.json`);

  const output = {
    metadata: {
      scrapedAt: new Date().toISOString(),
      citiesProcessed: targetCities.length,
      citiesWithData,
      totalResults: totalFound,
      queries: SEARCH_QUERIES,
      maxResultsPerQuery: maxResults,
      testMode,
    },
    cities: allResults,
  };

  fs.writeFileSync(finalOutput, JSON.stringify(output, null, 2));
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Done! ${totalFound} Indian restaurants across ${citiesWithData} cities`);
  console.log(`💾 Saved to: ${finalOutput}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
