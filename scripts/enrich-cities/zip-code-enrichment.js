// ZIP Code enrichment script
// Enriches cities with ZIP code coverage from GeoNames API
// Data source: GeoNames (free, no API key required for basic usage)

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

// Cache for API responses
const zipCodeCache = new Map();

/**
 * Get ZIP codes for a city using GeoNames API
 * @param {string} cityName - City name
 * @param {string} stateAbbr - State abbreviation
 * @param {number} lat - Latitude (optional, helps with accuracy)
 * @param {number} lng - Longitude (optional, helps with accuracy)
 * @returns {Promise<string[]>} Array of ZIP codes
 */
async function getZipCodesForCity(cityName, stateAbbr, lat = null, lng = null) {
  const cacheKey = `${cityName},${stateAbbr}`;
  
  if (zipCodeCache.has(cacheKey)) {
    return zipCodeCache.get(cacheKey);
  }
  
  try {
    // Use GeoNames postal code search
    // Rate limit: 30,000 requests/day (generous)
    let url;
    
    if (lat && lng) {
      // Use coordinates for more accurate results
      url = `http://api.geonames.org/postalCodeSearchJSON?placename=${encodeURIComponent(cityName)}&country=US&adminCode1=${stateAbbr}&lat=${lat}&lng=${lng}&maxRows=50&username=demo`;
    } else {
      // Use city name search
      url = `http://api.geonames.org/postalCodeSearchJSON?placename=${encodeURIComponent(cityName)}&country=US&adminCode1=${stateAbbr}&maxRows=50&username=demo`;
    }
    
    // Note: GeoNames requires a username for free tier, but "demo" works for limited testing
    // For production, register at http://www.geonames.org/login for better rate limits
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CityEnrichmentBot/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.postalCodes && Array.isArray(data.postalCodes)) {
        // Extract unique ZIP codes and sort them
        const zipCodes = [...new Set(data.postalCodes.map(pc => pc.postalCode))].sort();
        
        // Cache result
        zipCodeCache.set(cacheKey, zipCodes);
        
        // Rate limiting: GeoNames requests should be throttled
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return zipCodes;
      }
    } else {
      console.warn(`  ⚠ GeoNames API returned ${response.status} for ${cityName}, ${stateAbbr}`);
    }
  } catch (error) {
    console.warn(`  ⚠ Error fetching ZIP codes for ${cityName}, ${stateAbbr}: ${error.message}`);
  }
  
  // Fallback: Try to get ZIP codes from buffets in the city
  return getZipCodesFromBuffets(cityName, stateAbbr);
}

/**
 * Fallback: Extract ZIP codes from buffets in the city
 * @param {string} cityName - City name
 * @param {string} stateAbbr - State abbreviation
 * @returns {Promise<string[]>} Array of ZIP codes
 */
async function getZipCodesFromBuffets(cityName, stateAbbr) {
  try {
    const result = await db.query({
      buffets: {
        $: {
          where: {
            cityName: cityName,
            stateAbbr: stateAbbr
          }
        }
      }
    });
    
    const buffets = result.buffets || [];
    const zipCodes = new Set();
    
    buffets.forEach(buffet => {
      if (buffet.postalCode) {
        // Extract 5-digit ZIP code (handle ZIP+4 format)
        const zipMatch = buffet.postalCode.match(/^\d{5}/);
        if (zipMatch) {
          zipCodes.add(zipMatch[0]);
        }
      }
    });
    
    const sortedZips = Array.from(zipCodes).sort();
    
    if (sortedZips.length > 0) {
      console.log(`    → Found ${sortedZips.length} ZIP codes from buffets`);
      return sortedZips;
    }
  } catch (error) {
    console.warn(`  ⚠ Error extracting ZIP codes from buffets: ${error.message}`);
  }
  
  return [];
}

/**
 * Get city coordinates from buffets
 * @param {string} citySlug - City slug
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function getCityCoordinates(citySlug) {
  try {
    const result = await db.query({
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          city: {}
        }
      }
    });
    
    const city = result.cities?.[0];
    if (!city || !city.buffets || city.buffets.length === 0) {
      return null;
    }
    
    // Calculate center from buffets
    let totalLat = 0;
    let totalLng = 0;
    let count = 0;
    
    city.buffets.forEach(buffet => {
      if (buffet.lat && buffet.lng) {
        totalLat += buffet.lat;
        totalLng += buffet.lng;
        count++;
      }
    });
    
    if (count > 0) {
      return {
        lat: totalLat / count,
        lng: totalLng / count
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Enrich cities with ZIP codes
 * @param {number|null} testLimit - Optional limit on number of cities to process (for testing)
 */
async function enrichZipCodes(testLimit = null) {
  console.log('Starting ZIP code enrichment...\n');
  
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
  
  // Build city coordinates map (pre-fetch for efficiency)
  console.log('Pre-fetching city coordinates from buffets...');
  const cityCoordinatesMap = new Map();
  
  for (const city of allCities) {
    if (!city.zipCodes) { // Only fetch if not already enriched
      const coords = await getCityCoordinates(city.slug);
      if (coords) {
        cityCoordinatesMap.set(city.slug, coords);
      }
    }
  }
  
  console.log(`Found coordinates for ${cityCoordinatesMap.size} cities\n`);
  
  const BATCH_SIZE = 20; // Smaller batch due to API rate limits
  let enrichedCount = 0;
  let skippedCount = 0;
  const updateTxs = [];
  
  for (let i = 0; i < allCities.length; i++) {
    const city = allCities[i];
    
    // Skip if already enriched
    if (city.zipCodes) {
      skippedCount++;
      continue;
    }
    
    // Get coordinates if available
    const coords = cityCoordinatesMap.get(city.slug);
    
    // Fetch ZIP codes
    const zipCodes = await getZipCodesForCity(
      city.city,
      city.stateAbbr,
      coords?.lat,
      coords?.lng
    );
    
    if (zipCodes.length === 0) {
      skippedCount++;
      if (i % 50 === 0 || i === allCities.length - 1) {
        const percent = ((i + 1) / allCities.length * 100).toFixed(1);
        console.log(`  [${percent}%] ${city.city}, ${city.stateAbbr} - No ZIP codes found`);
      }
      continue;
    }
    
    // Determine primary ZIP code (most common or first alphabetically)
    const primaryZipCode = zipCodes[0]; // Could be improved with frequency analysis
    
    // Prepare update data
    const updateData = {
      zipCodes: JSON.stringify(zipCodes),
      primaryZipCode: primaryZipCode,
    };
    
    updateTxs.push(
      db.tx.cities[city.id].update(updateData)
    );
    enrichedCount++;
    
    if (i % 10 === 0 || i === allCities.length - 1) {
      const percent = ((i + 1) / allCities.length * 100).toFixed(1);
      console.log(`  [${percent}%] ${city.city}, ${city.stateAbbr} - Found ${zipCodes.length} ZIP codes (primary: ${primaryZipCode})`);
    }
    
    // Commit batch
    if (updateTxs.length >= BATCH_SIZE || i === allCities.length - 1) {
      if (updateTxs.length > 0) {
        try {
          await db.transact(updateTxs);
          console.log(`    ✓ Committed batch (${updateTxs.length} cities enriched)`);
          updateTxs.length = 0;
        } catch (error) {
          console.error(`    ✗ Error updating batch:`, error.message);
          updateTxs.length = 0;
        }
      }
    }
    
    // Rate limiting for GeoNames (200ms between requests)
    if (i < allCities.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`\n✅ ZIP code enrichment complete!`);
  console.log(`   - Enriched: ${enrichedCount} cities`);
  console.log(`   - Skipped: ${skippedCount} cities (already enriched or no ZIP codes found)`);
  console.log(`\n💡 Note: For better GeoNames API rate limits, register at http://www.geonames.org/login`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null;
  
  enrichZipCodes(limit).catch(error => {
    console.error('\n✗ Error enriching ZIP codes:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { enrichZipCodes, getZipCodesForCity };
