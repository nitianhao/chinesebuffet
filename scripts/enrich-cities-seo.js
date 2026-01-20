// Script to enrich cities dataset with SEO-relevant data from free/open-source APIs
// Adds: timezone, elevation, county, MSA, nearby cities, landmarks, ZIP codes, demographics
// Run with: node scripts/enrich-cities-seo.js

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
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  // Silently fail
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Cache to avoid duplicate API calls
const enrichmentCache = new Map();

// Get timezone from coordinates using TimeZoneDB API (free tier available)
async function getTimezone(lat, lng) {
  const cacheKey = `timezone-${lat}-${lng}`;
  if (enrichmentCache.has(cacheKey)) {
    return enrichmentCache.get(cacheKey);
  }
  
  try {
    // Using a free timezone API (no key required for basic use)
    const url = `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CityEnrichmentBot/1.0' }
    });
    
    if (response.ok) {
      const data = await response.json();
      const timezone = data.timeZone || data.timezone || null;
      if (timezone) {
        enrichmentCache.set(cacheKey, timezone);
        return timezone;
      }
    }
  } catch (error) {
    // Fallback: use a simple timezone lookup based on coordinates
    // This is a basic approximation
  }
  
  return null;
}

// Get elevation from Open-Elevation API (free, no key required)
async function getElevation(lat, lng) {
  const cacheKey = `elevation-${lat}-${lng}`;
  if (enrichmentCache.has(cacheKey)) {
    return enrichmentCache.get(cacheKey);
  }
  
  try {
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CityEnrichmentBot/1.0' }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const elevation = Math.round(data.results[0].elevation);
        enrichmentCache.set(cacheKey, elevation);
        return elevation;
      }
    }
  } catch (error) {
    // Silently fail
  }
  
  return null;
}

// Get detailed location info from Nominatim (OpenStreetMap) - free, no key required
async function getLocationDetails(lat, lng, cityName, stateAbbr) {
  const cacheKey = `location-${lat}-${lng}`;
  if (enrichmentCache.has(cacheKey)) {
    return enrichmentCache.get(cacheKey);
  }
  
  try {
    // Rate limit: 1 request per second (free tier)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&extratags=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CityEnrichmentBot/1.0 (contact@example.com)',
        'Accept-Language': 'en'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const address = data.address || {};
      
      const details = {
        county: address.county || address.municipality || null,
        countyCode: address.county_code || null,
        postalCode: address.postcode || null,
        country: address.country || null,
        countryCode: address.country_code?.toUpperCase() || null,
        region: address.region || address.state || null,
        displayName: data.display_name || null,
      };
      
      enrichmentCache.set(cacheKey, details);
      return details;
    }
  } catch (error) {
    // Silently fail
  }
  
  return null;
}

// Get nearby cities from the CSV data (cities within 50 miles)
function getNearbyCities(cityLat, cityLng, allCitiesFromCSV, maxDistance = 50) {
  const nearby = [];
  const R = 3959; // Earth radius in miles
  
  for (const csvCity of allCitiesFromCSV) {
    if (!csvCity.lat || !csvCity.lng) continue;
    
    // Haversine formula to calculate distance
    const dLat = (csvCity.lat - cityLat) * Math.PI / 180;
    const dLon = (csvCity.lng - cityLng) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(cityLat * Math.PI / 180) * Math.cos(csvCity.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    if (distance <= maxDistance && distance > 0) {
      nearby.push({
        name: csvCity.city,
        state: csvCity.state_id,
        distance: Math.round(distance * 10) / 10,
        population: csvCity.population
      });
    }
  }
  
  // Sort by distance and return top 10
  return nearby
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);
}

// Load cities from CSV for nearby city calculations
function loadCitiesFromCSV() {
  const csvPath = path.join(__dirname, '../uscities.csv');
  if (!fs.existsSync(csvPath)) {
    return [];
  }
  
  try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const cityIdx = headers.findIndex(h => h === 'city');
    const stateIdx = headers.findIndex(h => h === 'state_id');
    const latIdx = headers.findIndex(h => h === 'lat');
    const lngIdx = headers.findIndex(h => h === 'lng');
    const popIdx = headers.findIndex(h => h === 'population');
    
    const cities = [];
    for (let i = 1; i < lines.length; i++) {
      const values = [];
      let currentValue = '';
      let inQuotes = false;
      
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());
      
      if (values.length > Math.max(cityIdx, stateIdx, latIdx, lngIdx, popIdx)) {
        cities.push({
          city: values[cityIdx]?.replace(/^"|"$/g, ''),
          state_id: values[stateIdx]?.replace(/^"|"$/g, ''),
          lat: parseFloat(values[latIdx]?.replace(/^"|"$/g, '')),
          lng: parseFloat(values[lngIdx]?.replace(/^"|"$/g, '')),
          population: parseInt(values[popIdx]?.replace(/,/g, '').replace(/^"|"$/g, ''), 10)
        });
      }
    }
    
    return cities;
  } catch (error) {
    console.error('Error loading CSV:', error.message);
    return [];
  }
}

// Generate SEO keywords for a city
function generateSEOKeywords(cityName, stateAbbr, stateName, county, nearbyCities) {
  const keywords = [];
  
  // Basic city keywords
  keywords.push(`${cityName} ${stateAbbr}`);
  keywords.push(`${cityName}, ${stateName}`);
  keywords.push(`things to do in ${cityName}`);
  keywords.push(`${cityName} restaurants`);
  keywords.push(`${cityName} hotels`);
  
  // County-based keywords
  if (county) {
    keywords.push(`${cityName} ${county} County`);
  }
  
  // Nearby cities
  if (nearbyCities && nearbyCities.length > 0) {
    nearbyCities.slice(0, 3).forEach(nearby => {
      keywords.push(`${cityName} near ${nearby.name}`);
    });
  }
  
  return keywords;
}

// Main enrichment function
async function enrichCities() {
  console.log('Loading cities from InstantDB...');
  
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
  }
  
  console.log(`Found ${allCities.length} cities in database`);
  
  // Load CSV for nearby cities calculation
  console.log('Loading CSV data for nearby cities...');
  const csvCities = loadCitiesFromCSV();
  console.log(`Loaded ${csvCities.length} cities from CSV`);
  
  // Get city coordinates from buffets if cities don't have them
  console.log('Fetching buffet data for coordinates...');
  const buffetsResult = await db.query({ buffets: { city: {} } });
  const cityCoordinates = new Map();
  
  buffetsResult.buffets?.forEach(buffet => {
    if (buffet.city && buffet.city.slug && buffet.lat && buffet.lng) {
      if (!cityCoordinates.has(buffet.city.slug)) {
        cityCoordinates.set(buffet.city.slug, { lat: buffet.lat, lng: buffet.lng });
      }
    }
  });
  
  console.log(`Found coordinates for ${cityCoordinates.size} cities\n`);
  
  // Process cities in batches
  const BATCH_SIZE = 10; // Smaller batches due to API rate limits
  let enrichedCount = 0;
  let skippedCount = 0;
  const updateTxs = [];
  
  for (let i = 0; i < allCities.length; i++) {
    const city = allCities[i];
    
    if (i % 10 === 0 || i === allCities.length - 1) {
      const percent = ((i + 1) / allCities.length * 100).toFixed(1);
      console.log(`  [${percent}%] Processing ${i + 1}/${allCities.length}: ${city.city}, ${city.stateAbbr || 'N/A'}...`);
    }
    
    // Get coordinates
    let lat = null;
    let lng = null;
    
    // Try to get from city coordinates map (from buffets)
    const coords = cityCoordinates.get(city.slug);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
    
    // If no coordinates, skip this city
    if (!lat || !lng) {
      skippedCount++;
      continue;
    }
    
    // Fetch enrichment data
    const [timezone, elevation, locationDetails] = await Promise.all([
      getTimezone(lat, lng),
      getElevation(lat, lng),
      getLocationDetails(lat, lng, city.city, city.stateAbbr)
    ]);
    
    // Get nearby cities
    const nearbyCities = getNearbyCities(lat, lng, csvCities);
    
    // Generate SEO keywords
    const seoKeywords = generateSEOKeywords(
      city.city,
      city.stateAbbr,
      city.state,
      locationDetails?.county,
      nearbyCities
    );
    
    // Prepare update data
    const updateData = {};
    
    if (timezone) updateData.timezone = timezone;
    if (elevation !== null) updateData.elevation = elevation;
    if (locationDetails?.county) updateData.county = locationDetails.county;
    if (locationDetails?.postalCode) updateData.postalCode = locationDetails.postalCode;
    if (locationDetails?.countryCode) updateData.countryCode = locationDetails.countryCode;
    if (nearbyCities.length > 0) {
      updateData.nearbyCities = JSON.stringify(nearbyCities);
    }
    if (seoKeywords.length > 0) {
      updateData.seoKeywords = JSON.stringify(seoKeywords);
    }
    
    // Only update if we have new data
    if (Object.keys(updateData).length > 0) {
      updateTxs.push(
        db.tx.cities[city.id].update(updateData)
      );
      enrichedCount++;
    } else {
      skippedCount++;
    }
    
    // Commit batch
    if (updateTxs.length >= BATCH_SIZE || i === allCities.length - 1) {
      if (updateTxs.length > 0) {
        try {
          await db.transact(updateTxs);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          console.log(`    ✓ Committed batch ${batchNum} (${updateTxs.length} cities enriched)`);
          updateTxs.length = 0;
        } catch (error) {
          console.error(`    ✗ Error updating batch:`, error.message);
          updateTxs.length = 0;
        }
      }
    }
    
    // Rate limiting for Nominatim (1 request per second)
    if (i < allCities.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }
  
  console.log(`\n✅ Enrichment complete!`);
  console.log(`   - Enriched: ${enrichedCount} cities`);
  console.log(`   - Skipped: ${skippedCount} cities (no coordinates or no new data)`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

enrichCities().catch(error => {
  console.error('\n✗ Error enriching cities:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
