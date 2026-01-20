// Restaurant Density enrichment script
// Enriches cities with restaurant counts and density metrics using OpenStreetMap Overpass API
// Data source: OpenStreetMap Overpass API (free, no key required)

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load schema
let schema;
try {
  schema = require('../../src/instant.schema.ts');
} catch (e) {
  schema = require('../../src/instant.schema.ts').default;
}

// Load environment variables from .env.local
try {
  const envPath = path.join(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      // Skip comments and empty lines
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const match = trimmedLine.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key] && value) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Please set it in .env.local or as an environment variable');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Overpass API endpoint
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

/**
 * Query Overpass API for restaurant counts
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @returns {Promise<{totalRestaurants: number, chineseRestaurants: number, districts: string[]}>}
 */
async function getRestaurantData(lat, lng, radiusKm = 10, retries = 2) {
  // Convert radius from km to meters for Overpass API
  const radiusMeters = Math.round(radiusKm * 1000);
  
  // Simplified query - only use nodes (faster, less data to process)
  // Most restaurants in OSM are tagged as nodes, so this should capture most of them
  // Use a combined query to get both total and Chinese restaurants in one call (more efficient)
  const combinedQuery = `(
    node["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
  );
  out meta;`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Wait longer on retry
        const waitTime = attempt * 3000;
        process.stdout.write(`⚠ Retry ${attempt}/${retries} (waiting ${waitTime}ms)... `);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Fetch all restaurants in one query
      const response = await fetch(OVERPASS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CityEnrichmentBot/1.0'
        },
        body: `[out:json][timeout:30];${combinedQuery}`
      });
      
      if (!response.ok) {
        if (response.status === 504 && attempt < retries) {
          // Gateway timeout - retry with longer timeout
          process.stdout.write(`[Timeout ${response.status}] `);
          continue;
        }
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Check for Overpass API errors in response
      if (data.error) {
        if (data.error.code === 'timeout' && attempt < retries) {
          process.stdout.write(`[API Timeout] `);
          continue; // Retry on timeout
        }
        throw new Error(`API Error: ${data.error.code} - ${data.error.message}`);
      }
      
      // Count restaurants
      let totalRestaurants = 0;
      let chineseRestaurants = 0;
      
      if (data.elements && Array.isArray(data.elements)) {
        data.elements.forEach(element => {
          if (element.tags && element.tags.amenity === 'restaurant') {
            totalRestaurants++;
            if (element.tags.cuisine === 'chinese') {
              chineseRestaurants++;
            }
          }
        });
      }
      
      // Extract restaurant districts (simplified - areas with many restaurants)
      // For now, we'll return empty array - can be enhanced later
      const districts = [];
      
      return {
        totalRestaurants: Math.max(totalRestaurants, 0),
        chineseRestaurants: Math.max(chineseRestaurants, 0),
        districts: districts
      };
      
    } catch (error) {
      if (attempt === retries) {
        // Last attempt failed
        process.stdout.write(`✗ Failed after ${retries + 1} attempts: ${error.message.split('\n')[0]}\n`);
        return { totalRestaurants: 0, chineseRestaurants: 0, districts: [] };
      }
      // Otherwise, will retry - error message already printed above
    }
  }
  
  // Should never reach here, but just in case
  process.stdout.write(`✗ Unexpected error\n`);
  return { totalRestaurants: 0, chineseRestaurants: 0, districts: [] };
}

/**
 * Get city coordinates from buffets (simplified - just get first buffet's location)
 * @param {string} citySlug - City slug
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function getCityCoordinates(citySlug) {
  try {
    // Simplified query - just get one buffet for coordinates
    const result = await db.query({
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          $: { limit: 1 },
          city: {}
        }
      }
    });
    
    const city = result.cities?.[0];
    if (!city || !city.buffets || city.buffets.length === 0) {
      return null;
    }
    
    // Use first buffet's coordinates
    const firstBuffet = city.buffets[0];
    if (firstBuffet.lat && firstBuffet.lng) {
      return {
        lat: firstBuffet.lat,
        lng: firstBuffet.lng
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate restaurant density per 10,000 population
 * @param {number} restaurantCount - Number of restaurants
 * @param {number} population - City population
 * @returns {number} Density (restaurants per 10,000 people)
 */
function calculateRestaurantDensity(restaurantCount, population) {
  if (!population || population === 0) return 0;
  return Math.round((restaurantCount / population) * 10000 * 100) / 100;
}

/**
 * Enrich cities with restaurant density data
 * @param {number|null} testLimit - Optional limit on number of cities to process (for testing)
 */
async function enrichRestaurantDensity(testLimit = null) {
  console.log('Starting restaurant density enrichment...\n');
  
  // Fetch all cities
  let allCities = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      cities: {
        $: {
          limit: limit,
          offset: offset,
        }
      }
    });
    
    const cities = result.cities || [];
    if (cities.length === 0) break;
    
    allCities = allCities.concat(cities);
    if (cities.length < limit) break;
    offset += limit;
    
    // If test limit is set, stop when we have enough cities
    if (testLimit && allCities.length >= testLimit) {
      allCities = allCities.slice(0, testLimit);
      break;
    }
  }
  
  if (testLimit) {
    console.log(`Found ${allCities.length} cities (limited to ${testLimit} for testing)\n`);
  } else {
    console.log(`Found ${allCities.length} cities in database\n`);
  }
  
  // Filter cities that need enrichment
  let citiesToEnrich = allCities.filter(city => 
    city.totalRestaurants === null || city.totalRestaurants === undefined
  );
  
  // Apply limit after filtering if test limit is set
  if (testLimit && citiesToEnrich.length > testLimit) {
    citiesToEnrich = citiesToEnrich.slice(0, testLimit);
  }
  
  console.log(`Processing ${citiesToEnrich.length} cities that need enrichment${testLimit ? ` (limited to ${testLimit})` : ''}\n`);
  
  const BATCH_SIZE = 10; // Smaller batch due to API rate limits and query time
  let enrichedCount = 0;
  let skippedCount = 0;
  const updateTxs = [];
  const startTime = Date.now();
  
  console.log(`  Starting to process ${citiesToEnrich.length} cities...\n`);
  
  for (let i = 0; i < citiesToEnrich.length; i++) {
    const city = citiesToEnrich[i];
    const percent = ((i + 1) / citiesToEnrich.length * 100).toFixed(1);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const avgTimePerCity = enrichedCount > 0 ? Math.floor((Date.now() - startTime) / 1000 / enrichedCount) : 0;
    const remaining = citiesToEnrich.length - i - 1;
    const estimatedTimeRemaining = remaining > 0 && avgTimePerCity > 0 ? Math.floor(remaining * avgTimePerCity) : 0;
    
    // Progress header every 5 cities or first/last
    if (i === 0 || i % 5 === 0 || i === citiesToEnrich.length - 1) {
      console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Progress: ${i + 1}/${citiesToEnrich.length} (${percent}%) | Enriched: ${enrichedCount} | Skipped: ${skippedCount} | Elapsed: ${elapsed}s`);
      if (estimatedTimeRemaining > 0) {
        const mins = Math.floor(estimatedTimeRemaining / 60);
        const secs = estimatedTimeRemaining % 60;
        console.log(`  Estimated time remaining: ${mins}m ${secs}s | Avg: ${avgTimePerCity}s per city`);
      }
      console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    
    // Get coordinates on-demand (more efficient)
    process.stdout.write(`  [${(i + 1).toString().padStart(3)}/${citiesToEnrich.length}] Fetching coordinates for ${city.city}, ${city.stateAbbr}... `);
    const coords = await getCityCoordinates(city.slug);
    
    if (!coords) {
      skippedCount++;
      console.log('✗ No coordinates');
      continue;
    }
    console.log(`✓ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    
    // Determine search radius based on population (reduced to avoid timeouts)
    // Smaller radius = faster queries, but still comprehensive for city centers
    // Using smaller radii to avoid Overpass API timeouts
    const radiusKm = city.population > 500000 ? 8 : city.population > 100000 ? 6 : 4;
    
    // Fetch restaurant data
    process.stdout.write(`      Querying Overpass API (${radiusKm}km radius)... `);
    const queryStartTime = Date.now();
    const restaurantData = await getRestaurantData(coords.lat, coords.lng, radiusKm);
    const queryDuration = ((Date.now() - queryStartTime) / 1000).toFixed(1);
    
    // Calculate density
    const restaurantDensity = calculateRestaurantDensity(restaurantData.totalRestaurants, city.population);
    
    console.log(`✓ (${queryDuration}s) Found ${restaurantData.totalRestaurants} restaurants (${restaurantData.chineseRestaurants} Chinese)`);
    
    // Prepare update data
    const updateData = {
      totalRestaurants: restaurantData.totalRestaurants,
      chineseRestaurants: restaurantData.chineseRestaurants,
      restaurantDensity: restaurantDensity,
    };
    
    if (restaurantData.districts && restaurantData.districts.length > 0) {
      updateData.restaurantDistricts = JSON.stringify(restaurantData.districts);
    }
    
    updateTxs.push(
      db.tx.cities[city.id].update(updateData)
    );
    enrichedCount++;
    
    console.log(`      ✓ Density: ${restaurantDensity.toFixed(2)} restaurants per 10k population`);
    
    // Commit batch
    if (updateTxs.length >= BATCH_SIZE || i === citiesToEnrich.length - 1) {
      if (updateTxs.length > 0) {
        process.stdout.write(`      Committing batch to database (${updateTxs.length} cities)... `);
        try {
          await db.transact(updateTxs);
          console.log(`✓`);
          updateTxs.length = 0;
        } catch (error) {
          console.log(`✗ Error: ${error.message}`);
          updateTxs.length = 0;
        }
      }
    }
    
    // Rate limiting for Overpass API (be respectful - wait 2 seconds between requests to avoid timeouts)
    if (i < citiesToEnrich.length - 1) {
      process.stdout.write(`      Waiting 2s before next query (rate limiting)... `);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`✓`);
    }
  }
  
  console.log(`\n✅ Restaurant density enrichment complete!`);
  console.log(`   - Enriched: ${enrichedCount} cities`);
  console.log(`   - Skipped: ${skippedCount} cities (no coordinates)`);
  console.log(`   - Already enriched: ${allCities.length - citiesToEnrich.length} cities`);
  console.log(`\n💡 Note: This process may take a while due to Overpass API rate limits`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null;
  
  enrichRestaurantDensity(limit).catch(error => {
    console.error('\n✗ Error enriching restaurant density:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { enrichRestaurantDensity, getRestaurantData, calculateRestaurantDensity };
