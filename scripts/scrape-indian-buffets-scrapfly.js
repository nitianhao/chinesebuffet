/**
 * Scrape Indian restaurants using Scrapfly Web Scraping API + Extraction API.
 *
 * Scrapfly renders the Google Maps search page (JS rendering + anti-bot bypass),
 * then uses its AI Extraction API to extract structured restaurant data from the HTML.
 *
 * API: https://api.scrapfly.io/scrape (render) + https://api.scrapfly.io/extraction (AI extract)
 *
 * Usage:
 *   node scripts/scrape-indian-buffets-scrapfly.js [options]
 *
 * Options:
 *   --city "New York"     Scrape only a specific city
 *   --state "New York"    Scrape only cities in a specific state
 *   --limit N             Limit number of cities to process (default: all)
 *   --test                Test mode: 1 city only
 */

const fs = require('fs');
const path = require('path');

const SCRAPFLY_KEY = 'scp-live-bb32c130ea4644f48f689a5d6b40c0b8';
const SCRAPE_URL = 'https://api.scrapfly.io/scrape';
const EXTRACT_URL = 'https://api.scrapfly.io/extraction';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

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

const args = process.argv.slice(2);
let cityFilter = null, stateFilter = null, cityLimit = null, testMode = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i], next = args[i + 1];
  if (arg === '--city' && next) { cityFilter = next; i++; }
  else if (arg === '--state' && next) { stateFilter = next; i++; }
  else if (arg === '--limit' && next) { cityLimit = parseInt(next, 10); i++; }
  else if (arg === '--test') { testMode = true; }
}

const csvPath = path.join(__dirname, '..', 'Research', 'us_cities_over_100k_2024_census_estimates.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const csvLines = csvContent.split('\n').slice(1).filter(l => l.trim());
const cities = csvLines.map(line => {
  const [rank, place, state, population] = line.split(',');
  if (!place || !state) return null;
  return { rank: parseInt(rank) || 0, city: place, state, stateAbbr: STATE_ABBR[state] || state, population: parseInt(population) || 0 };
}).filter(Boolean);

let targetCities = cities;
if (cityFilter) targetCities = targetCities.filter(c => c.city.toLowerCase() === cityFilter.toLowerCase());
if (stateFilter) targetCities = targetCities.filter(c => c.state.toLowerCase() === stateFilter.toLowerCase() || c.stateAbbr.toLowerCase() === stateFilter.toLowerCase());
if (cityLimit) targetCities = targetCities.slice(0, cityLimit);
if (testMode) targetCities = targetCities.slice(0, 1);

console.log(`\n🍛 Indian Restaurant Scraper (Scrapfly Web Scraping + AI Extraction)`);
console.log(`   Cities to process: ${targetCities.length}`);
console.log(`   Mode: ${testMode ? 'TEST' : 'FULL'}\n`);

const outputDir = path.join(__dirname, '..', 'data', 'indian-buffets');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function citySlug(city) {
  return `${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.stateAbbr.toLowerCase()}`;
}

function isCityScraped(city) {
  // Check if any provider already scraped this city
  const slug = citySlug(city);
  return fs.existsSync(path.join(outputDir, `sf-city-${slug}.json`)) ||
         fs.existsSync(path.join(outputDir, `city-${slug}.json`)) ||
         fs.existsSync(path.join(outputDir, `sb-city-${slug}.json`));
}

const EXTRACTION_PROMPT = `Extract all restaurant listings from this Google Maps HTML. For each restaurant, return a JSON object with these exact fields:
- title: restaurant name (string)
- address: full street address (string)
- phone: phone number if visible (string or null)
- website: website URL if visible (string or null)
- rating: numeric rating like 4.5 (string or null)
- reviews: number of reviews like 1900 (string or null)
- price: price level like $ or $$ (string or null)
- category: restaurant type like "Indian restaurant" (string or null)
- place_id: Google Place ID starting with "ChIJ" — look in href links, data attributes, or anywhere in the HTML (string or null)
Return ONLY a JSON array of objects. No markdown, no explanation.`;

async function scrapeAndExtract(query) {
  // Step 1: Scrape Google Maps with JS rendering
  const scrapeParams = new URLSearchParams({
    key: SCRAPFLY_KEY,
    url: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
    render_js: 'true',
    as_raw: 'true',
  });

  let html;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${SCRAPE_URL}?${scrapeParams.toString()}`);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Scrape HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      html = await resp.text();
      break;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(`   ⚠️ Scrape attempt ${attempt} failed: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else throw err;
    }
  }

  if (!html || html.length < 1000) {
    console.log(`   ⚠️ Empty HTML response (${html?.length || 0} chars)`);
    return [];
  }

  // Step 2: Extract structured data with AI
  const extractParams = new URLSearchParams({
    key: SCRAPFLY_KEY,
    content_type: 'text/html',
    extraction_prompt: EXTRACTION_PROMPT,
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${EXTRACT_URL}?${extractParams.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: html }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Extract HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }

      const data = await resp.json();
      const result = data.result || data.data || data;

      // Parse the result — it might be a string or already parsed
      let restaurants;
      if (typeof result === 'string') {
        // Try to parse JSON from the string
        const match = result.match(/\[[\s\S]*\]/);
        if (match) {
          restaurants = JSON.parse(match[0]);
        } else {
          restaurants = [];
        }
      } else if (Array.isArray(result)) {
        restaurants = result;
      } else {
        restaurants = [];
      }

      return restaurants;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(`   ⚠️ Extract attempt ${attempt} failed: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else {
        console.log(`   ⚠️ Extraction failed after ${MAX_RETRIES} attempts: ${err.message}`);
        return [];
      }
    }
  }

  return [];
}

async function main() {
  let totalFound = 0, citiesWithData = 0, apiCalls = 0, skipped = 0;

  for (const city of targetCities) {
    if (!testMode && isCityScraped(city)) { skipped++; continue; }

    const query = `Indian restaurant ${city.city} ${city.stateAbbr}`;
    console.log(`\n🔍 "${query}"`);
    apiCalls++;

    try {
      const restaurants = await scrapeAndExtract(query);

      // Normalize and add metadata
      const results = restaurants.map((r, i) => ({
        title: r.title || '',
        place_id: r.place_id || null,
        rating: r.rating ? parseFloat(r.rating) : null,
        reviews: r.reviews ? parseInt(String(r.reviews).replace(/,/g, '')) : null,
        price: r.price || null,
        type: r.category || '',
        address: r.address || '',
        phone: r.phone || null,
        website: r.website || null,
        position: i + 1,
        _searchQuery: query,
        _searchCity: city.city,
        _searchState: city.state,
        _provider: 'scrapfly',
      }));

      // Save per-city results immediately
      const cityFilePath = path.join(outputDir, `sf-city-${citySlug(city)}.json`);
      fs.writeFileSync(cityFilePath, JSON.stringify({
        city: city.city, state: city.state, stateAbbr: city.stateAbbr,
        population: city.population, count: results.length, results,
        scrapedAt: new Date().toISOString(), provider: 'scrapfly',
      }, null, 2));

      if (results.length > 0) {
        citiesWithData++;
        totalFound += results.length;
        console.log(`   ✅ ${city.city}, ${city.stateAbbr}: ${results.length} Indian restaurants (saved)`);
      } else {
        console.log(`   ⚠️  ${city.city}, ${city.stateAbbr}: no results`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      fs.writeFileSync(path.join(outputDir, `sf-city-${citySlug(city)}.json`), JSON.stringify({
        city: city.city, state: city.state, stateAbbr: city.stateAbbr,
        population: city.population, count: 0, results: [],
        scrapedAt: new Date().toISOString(), provider: 'scrapfly', error: err.message,
      }, null, 2));
    }

    // Checkpoint
    fs.writeFileSync(path.join(outputDir, 'scrapfly-checkpoint.json'), JSON.stringify({
      citiesProcessed: citiesWithData + skipped, citiesWithData, totalFound,
      apiCallsUsed: apiCalls, citiesSkipped: skipped, timestamp: new Date().toISOString(),
    }, null, 2));

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Done!`);
  console.log(`   Total Indian restaurants: ${totalFound}`);
  console.log(`   Cities with data: ${citiesWithData}`);
  console.log(`   Cities skipped: ${skipped}`);
  console.log(`   API calls used: ${apiCalls} (scrape + extract = 2 calls per city)`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => { console.error('\n❌ Fatal error:', err); process.exit(1); });
