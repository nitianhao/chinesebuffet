// Points of Interest (POI) enrichment script
// Enriches cities with nearby attractions, shopping centers, universities, and hotels
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

// Load environment variables
try {
  const envPath = path.join(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmedLine = line.trim();
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

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

/**
 * Get city coordinates from buffets data
 * @param {string} citySlug - City slug (unique identifier)
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function getCityCoordinates(citySlug) {
  try {
    // Query city by slug and get related buffets (same approach as restaurant-density.js)
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
    console.warn(`  ⚠ Error fetching coordinates for city slug ${citySlug}: ${error.message}`);
    return null;
  }
}

/**
 * Query Overpass API for all POIs in a single optimized query
 * Uses only nodes (faster) and combines all POI types into one request
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @param {number} retries - Number of retries
 * @returns {Promise<{attractions: Array, shopping: Array, universities: Array, hotels: Array, timedOut: boolean}>}
 */
async function getAllPOIs(lat, lng, radiusKm, retries = 2) {
  // Convert radius to meters for Overpass API
  const radiusMeters = Math.round(radiusKm * 1000);
  
  // OPTIMIZED: Single combined query using only nodes (much faster than ways/relations)
  // Most POIs in OSM are tagged as nodes, so this captures the majority
  const combinedQuery = `[out:json][timeout:25];
(
  node["tourism"="attraction"](around:${radiusMeters},${lat},${lng});
  node["tourism"="museum"](around:${radiusMeters},${lat},${lng});
  node["tourism"="theme_park"](around:${radiusMeters},${lat},${lng});
  node["tourism"="zoo"](around:${radiusMeters},${lat},${lng});
  node["leisure"="park"](around:${radiusMeters},${lat},${lng});
  node["shop"="mall"](around:${radiusMeters},${lat},${lng});
  node["amenity"="marketplace"](around:${radiusMeters},${lat},${lng});
  node["amenity"="university"](around:${radiusMeters},${lat},${lng});
  node["amenity"="college"](around:${radiusMeters},${lat},${lng});
  node["tourism"="hotel"](around:${radiusMeters},${lat},${lng});
);
out meta;`;
  
  let lastResponseStatus = null;
  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff with max delay of 10 seconds
        const waitTime = Math.min(attempt * 3000, 10000);
        process.stdout.write(`⚠ Retry ${attempt}/${retries} (waiting ${waitTime}ms)... `);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      const response = await fetch(OVERPASS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CityEnrichmentBot/1.0'
        },
        body: `data=${encodeURIComponent(combinedQuery)}`
      });
      
      lastResponseStatus = response.status;
      
      if (!response.ok) {
        if (response.status === 504 && attempt < retries) {
          // Gateway timeout - retry
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
          continue;
        }
        throw new Error(`API Error: ${data.error.code} - ${data.error.message}`);
      }
      
      const elements = data.elements || [];
      
      // Categorize POIs by type
      const attractions = [];
      const shopping = [];
      const universities = [];
      const hotels = [];
      
      for (const element of elements) {
        const tags = element.tags || {};
        const name = tags.name || tags['name:en'] || tags['alt_name'] || null;
        
        if (!name || !element.lat || !element.lon) continue;
        
        // Calculate distance
        const distanceKm = calculateDistance(lat, lng, element.lat, element.lon);
        
        // Categorize based on tags
        if (tags.tourism === 'attraction' || tags.tourism === 'museum' || 
            tags.tourism === 'theme_park' || tags.tourism === 'zoo' || 
            tags.leisure === 'park') {
          let category = 'Attraction';
          if (tags.tourism === 'museum') category = 'Museum';
          else if (tags.tourism === 'theme_park') category = 'Theme Park';
          else if (tags.tourism === 'zoo') category = 'Zoo';
          else if (tags.leisure === 'park') category = 'Park';
          
          attractions.push({
            name: name,
            category: category,
            distance: Math.round(distanceKm * 10) / 10
          });
        } else if (tags.shop === 'mall' || tags.amenity === 'marketplace') {
          shopping.push(name);
        } else if (tags.amenity === 'university' || tags.amenity === 'college') {
          universities.push(name);
        } else if (tags.tourism === 'hotel') {
          // Filter hotels - only major ones (has "hotel", "resort", "inn" in name or is a known chain)
          const nameLower = name.toLowerCase();
          if (nameLower.includes('hotel') || nameLower.includes('resort') || 
              nameLower.includes('inn') || nameLower.includes('lodge') ||
              nameLower.includes('marriott') || nameLower.includes('hilton') ||
              nameLower.includes('hyatt') || nameLower.includes('sheraton') ||
              nameLower.includes('holiday inn') || nameLower.includes('best western')) {
            hotels.push(name);
          }
        }
      }
      
      // Sort attractions by distance and limit to top 10
      attractions.sort((a, b) => a.distance - b.distance);
      const topAttractions = attractions.slice(0, 10);
      
      // Limit shopping to top 10 (closest)
      const topShopping = shopping.slice(0, 10);
      
      // Limit universities to top 10
      const topUniversities = universities.slice(0, 10);
      
      // Limit hotels to top 5 (already filtered)
      const topHotels = hotels.slice(0, 5);
      
      return {
        attractions: topAttractions,
        shopping: topShopping,
        universities: topUniversities,
        hotels: topHotels,
        timedOut: false
      };
      
    } catch (error) {
      lastError = error;
      const isTimeout = lastResponseStatus === 504 || 
                       error.message.includes('504') || 
                       error.message.includes('timeout') ||
                       error.message.includes('Timeout');
      
      if (attempt === retries) {
        // Last attempt failed
        process.stdout.write(`✗ Failed after ${retries + 1} attempts\n`);
        return {
          attractions: [],
          shopping: [],
          universities: [],
          hotels: [],
          timedOut: isTimeout
        };
      }
      // Otherwise, will retry - error message already printed above
    }
  }
  
  // Should never reach here
  return {
    attractions: [],
    shopping: [],
    universities: [],
    hotels: [],
    timedOut: true
  };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude 1
 * @param {number} lon1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lon2 - Longitude 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Enrich cities with POI data
 * @param {number|null} testLimit - Optional limit on number of cities to process (for testing)
 */
async function enrichPOIs(testLimit = null) {
  console.log('Starting Points of Interest enrichment...\n');
  
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
  
  // Filter cities that need enrichment (at least one POI field missing)
  let citiesToEnrich = allCities.filter(city => 
    !city.topAttractions || !city.shoppingCenters || !city.universities || !city.majorHotels
  );
  
  // Apply limit after filtering if test limit is set
  if (testLimit && citiesToEnrich.length > testLimit) {
    citiesToEnrich = citiesToEnrich.slice(0, testLimit);
  }
  
  console.log(`Processing ${citiesToEnrich.length} cities that need enrichment${testLimit ? ` (limited to ${testLimit})` : ''}\n`);
  
  const BATCH_SIZE = 10; // Smaller batch size due to multiple API calls per city
  let enrichedCount = 0;
  let skippedCount = 0;
  const updateTxs = [];
  const startTime = Date.now();
  
  // Circuit breaker: if we get too many consecutive 504 errors, pause longer
  let consecutiveTimeouts = 0;
  const MAX_CONSECUTIVE_TIMEOUTS = 3;
  
  for (let i = 0; i < citiesToEnrich.length; i++) {
    const city = citiesToEnrich[i];
    const percent = ((i + 1) / citiesToEnrich.length * 100).toFixed(1);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const avgTimePerCity = enrichedCount > 0 ? Math.floor((Date.now() - startTime) / 1000 / enrichedCount) : 0;
    const remaining = citiesToEnrich.length - i - 1;
    const estimatedTimeRemaining = remaining > 0 && avgTimePerCity > 0 ? Math.floor(remaining * avgTimePerCity) : 0;
    
    // Progress header every 10 cities
    if (i === 0 || i % 10 === 0 || i === citiesToEnrich.length - 1) {
      console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Progress: ${i + 1}/${citiesToEnrich.length} (${percent}%) | Enriched: ${enrichedCount} | Skipped: ${skippedCount} | Elapsed: ${elapsed}s`);
      if (estimatedTimeRemaining > 0) {
        const mins = Math.floor(estimatedTimeRemaining / 60);
        const secs = estimatedTimeRemaining % 60;
        console.log(`  Estimated time remaining: ${mins}m ${secs}s | Avg: ${avgTimePerCity}s per city`);
      }
      console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    
    // Get city coordinates
    process.stdout.write(`  [${(i + 1).toString().padStart(3)}/${citiesToEnrich.length}] ${city.city}, ${city.state}... `);
    
    const coords = await getCityCoordinates(city.slug);
    if (!coords) {
      skippedCount++;
      console.log('✗ No coordinates found');
      continue;
    }
    
    // Determine search radius based on population (reduced for better performance)
    const radiusKm = city.population > 100000 ? 12 : city.population > 50000 ? 8 : 6;
    
    // Circuit breaker: if too many consecutive timeouts, wait longer
    if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
      const pauseTime = 5000; // 5 second pause
      console.log(`\n  ⚠ ${consecutiveTimeouts} consecutive timeouts detected. Pausing for ${pauseTime / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, pauseTime));
      consecutiveTimeouts = 0; // Reset counter after pause
    }
    
    // Fetch all POIs in a single optimized query
    process.stdout.write('fetching POIs... ');
    const allPOIs = await getAllPOIs(coords.lat, coords.lng, radiusKm);
    
    // Track consecutive timeouts for circuit breaker (only count actual timeouts, not empty results)
    if (allPOIs.timedOut) {
      consecutiveTimeouts++;
    } else {
      consecutiveTimeouts = 0; // Reset on success (even if empty results)
    }
    
    // Check if we got any data
    const hasResults = allPOIs.attractions.length > 0 || 
                      allPOIs.shopping.length > 0 || 
                      allPOIs.universities.length > 0 || 
                      allPOIs.hotels.length > 0;
    
    // Prepare update data (only update fields that are missing)
    const updateData = {};
    let hasData = false;
    
    if (!city.topAttractions && allPOIs.attractions.length > 0) {
      updateData.topAttractions = JSON.stringify(allPOIs.attractions);
      hasData = true;
    }
    
    if (!city.shoppingCenters && allPOIs.shopping.length > 0) {
      updateData.shoppingCenters = JSON.stringify(allPOIs.shopping);
      hasData = true;
    }
    
    if (!city.universities && allPOIs.universities.length > 0) {
      updateData.universities = JSON.stringify(allPOIs.universities);
      hasData = true;
    }
    
    if (!city.majorHotels && allPOIs.hotels.length > 0) {
      updateData.majorHotels = JSON.stringify(allPOIs.hotels);
      hasData = true;
    }
    
    if (!hasData) {
      skippedCount++;
      if (allPOIs.timedOut) {
        console.log('✗ Query timed out');
      } else {
        console.log('✗ No POIs found');
      }
      continue;
    }
    
    updateTxs.push(
      db.tx.cities[city.id].update(updateData)
    );
    enrichedCount++;
    
    const foundCounts = [
      allPOIs.attractions.length > 0 ? `${allPOIs.attractions.length} attractions` : null,
      allPOIs.shopping.length > 0 ? `${allPOIs.shopping.length} shopping` : null,
      allPOIs.universities.length > 0 ? `${allPOIs.universities.length} universities` : null,
      allPOIs.hotels.length > 0 ? `${allPOIs.hotels.length} hotels` : null
    ].filter(c => c !== null);
    
    console.log(`✓ ${foundCounts.join(', ')}`);
    
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
    
    // Rate limiting: delay between cities to be respectful to Overpass API
    // Reduced from 1000ms to 800ms since we're making 1 query instead of 4
    if (i < citiesToEnrich.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  
  console.log(`\n✅ POI enrichment complete!`);
  console.log(`   - Enriched: ${enrichedCount} cities`);
  console.log(`   - Skipped: ${skippedCount} cities (no coordinates or no POIs found)`);
  console.log(`   - Already enriched: ${allCities.length - citiesToEnrich.length} cities`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null;
  
  enrichPOIs(limit).catch(error => {
    console.error('\n✗ Error enriching POI data:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { enrichPOIs };
