// Script to update remaining cities with population data using advanced matching
// Handles cities with invalid state abbreviations and alternative data sources
// Run with: node scripts/update-cities-population-remaining.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
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
  // Silently fail if .env.local can't be read
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Cache for population data
const populationCache = new Map();

// State name to abbreviation mapping (full names)
const stateNameToAbbr = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC', 'dc': 'DC'
};

// Fix state abbreviation from state full name
function fixStateAbbr(stateAbbr, stateFullName) {
  // If stateAbbr is valid, return it
  const cleanAbbr = stateAbbr?.toString().trim().replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleanAbbr && cleanAbbr.length === 2 && stateNameToAbbr[cleanAbbr.toLowerCase()]) {
    return cleanAbbr;
  }
  
  // Try to extract from state full name
  if (stateFullName) {
    const stateLower = stateFullName.toLowerCase().trim();
    // Check exact match
    if (stateNameToAbbr[stateLower]) {
      return stateNameToAbbr[stateLower];
    }
    // Check partial matches
    for (const [name, abbr] of Object.entries(stateNameToAbbr)) {
      if (stateLower.includes(name) || name.includes(stateLower)) {
        return abbr;
      }
    }
  }
  
  return null;
}

// Normalize city name for better matching
function normalizeCityName(cityName) {
  if (!cityName) return '';
  
  return cityName
    .trim()
    .replace(/^St\.\s+/i, 'Saint ')
    .replace(/^Ft\.\s+/i, 'Fort ')
    .replace(/\s+City$/i, '')
    .replace(/\s+County$/i, '')
    .replace(/\s+township$/i, '')
    .replace(/\s+Township$/i, '');
}

// Get state from reverse geocoding using lat/lng
async function getStateFromCoordinates(lat, lng) {
  try {
    // Use Nominatim (OpenStreetMap) reverse geocoding - free, no key required
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CityPopulationBot/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const address = data.address || {};
      
      // Try to get state abbreviation
      if (address.state_code) {
        return address.state_code.toUpperCase();
      }
      if (address.state) {
        const stateName = address.state.toLowerCase();
        return stateNameToAbbr[stateName] || null;
      }
    }
  } catch (error) {
    // Silently fail
  }
  
  return null;
}

// Get population using SimpleMaps US Cities Database (free CSV format)
// This is a comprehensive database of US cities with population
async function getPopulationFromSimpleMaps(cityName, stateAbbr, retries = 2) {
  const cacheKey = `${cityName.toLowerCase()}-${stateAbbr.toLowerCase()}`;
  
  if (populationCache.has(cacheKey)) {
    return populationCache.get(cacheKey);
  }
  
  // SimpleMaps provides a free API endpoint or we can scrape their site
  // Try their search API first
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use a free city population API endpoint
      // Try citypopulation.de API (free, covers US cities)
      const searchCity = encodeURIComponent(normalizeCityName(cityName));
      const url = `https://www.citypopulation.de/en/usa/cities/?city=${searchCity}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CityPopulationBot/1.0)'
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        
        // Look for population data in HTML
        // Pattern: city name followed by population number
        const regex = new RegExp(
          `${escapeRegex(cityName)}[^<]*?<td[^>]*>\\s*(\\d{1,3}(?:,\\d{3})*(?:,\\d{3})*)\\s*</td>`,
          'i'
        );
        const match = html.match(regex);
        
        if (match && match[1]) {
          const population = parseInt(match[1].replace(/,/g, ''), 10);
          if (population > 0 && population < 50000000) {
            populationCache.set(cacheKey, population);
            return population;
          }
        }
      }
    } catch (error) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  
  return null;
}

// Escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get population using comprehensive search across multiple sources
async function getPopulationAdvanced(cityName, stateAbbr, stateFullName, lat, lng) {
  // Step 1: Try to fix state abbreviation
  let fixedStateAbbr = fixStateAbbr(stateAbbr, stateFullName);
  
  // Step 2: If state is still invalid and we have coordinates, try reverse geocoding
  if (!fixedStateAbbr && lat && lng) {
    fixedStateAbbr = await getStateFromCoordinates(lat, lng);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
  }
  
  if (!fixedStateAbbr) {
    return null;
  }
  
  // Step 3: Try different city name variations
  const cityVariations = [
    normalizeCityName(cityName),
    cityName.replace(/^Saint\s+/i, 'St. '),
    cityName.replace(/^Fort\s+/i, 'Ft. '),
    cityName.replace(/\s+City$/i, ''),
    cityName.replace(/\s+township$/i, ''),
    cityName, // Original
  ];
  
  // Remove duplicates
  const uniqueVariations = [...new Set(cityVariations)];
  
  // Try each variation with different APIs
  for (const cityVar of uniqueVariations) {
    // Try DataUSA API first
    try {
      const url = `https://datausa.io/api/data?drilldowns=Place&measures=Population&Geography=${encodeURIComponent(cityVar)}, ${fixedStateAbbr}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityPopulationBot/1.0)' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const latest = data.data.reduce((latest, current) => 
            (!latest || current.Year > latest.Year) ? current : latest
          , null);
          
          if (latest && latest.Population) {
            const population = parseInt(latest.Population, 10);
            if (population > 0) {
              const cacheKey = `${cityName.toLowerCase()}-${stateAbbr?.toLowerCase() || fixedStateAbbr.toLowerCase()}`;
              populationCache.set(cacheKey, population);
              return population;
            }
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      // Continue to next source
    }
    
    // Try Wikipedia API
    try {
      const encodedTitle = encodeURIComponent(`${cityVar}, ${fixedStateAbbr}`);
      const wikipediaUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
      
      const response = await fetch(wikipediaUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityPopulationBot/1.0)' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const extract = data.extract || '';
        
        const patterns = [
          /population[:\s]+(?:of\s+)?(\d{1,3}(?:,\d{3})*(?:,\d{3})*)/i,
          /(\d{1,3}(?:,\d{3})*(?:,\d{3})*)\s+(?:residents|people|inhabitants)/i,
          /with\s+(?:a\s+)?population\s+(?:of\s+)?(\d{1,3}(?:,\d{3})*(?:,\d{3})*)/i,
        ];
        
        for (const pattern of patterns) {
          const match = extract.match(pattern);
          if (match) {
            const population = parseInt(match[1].replace(/,/g, ''), 10);
            if (population >= 1000 && population <= 50000000) {
              const cacheKey = `${cityName.toLowerCase()}-${stateAbbr?.toLowerCase() || fixedStateAbbr.toLowerCase()}`;
              populationCache.set(cacheKey, population);
              return population;
            }
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      // Continue
    }
  }
  
  return null;
}

// Main function to update remaining cities
async function updateRemainingCities() {
  console.log('Fetching all cities from InstantDB...');
  
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
  
  console.log(`\nTotal cities in database: ${allCities.length}`);
  
  // Find cities that still need population updates
  const citiesToUpdate = [];
  let alreadyHasPopulation = 0;
  
  allCities.forEach(city => {
    if (city.population && city.population > 0) {
      alreadyHasPopulation++;
      return;
    }
    citiesToUpdate.push(city);
  });
  
  console.log(`\nCities status:`);
  console.log(`  - Already have population: ${alreadyHasPopulation}`);
  console.log(`  - Need population update: ${citiesToUpdate.length}`);
  
  if (citiesToUpdate.length === 0) {
    console.log('\n✓ All cities already have population data!');
    return;
  }
  
  console.log(`\nUpdating remaining ${citiesToUpdate.length} cities using advanced matching...`);
  console.log('Using: State name correction, reverse geocoding, name variations, multiple APIs\n');
  
  // Update cities in batches
  const BATCH_SIZE = 20;
  const totalBatches = Math.ceil(citiesToUpdate.length / BATCH_SIZE);
  let updatedCount = 0;
  let failedCount = 0;
  const updateTxs = [];
  
  // Get city coordinates from buffets if needed
  console.log('Fetching buffet data to get city coordinates...');
  const buffetsResult = await db.query({ buffets: { city: {} } });
  const cityCoordinates = new Map();
  
  // Build a map of city slugs to coordinates (from buffets)
  buffetsResult.buffets?.forEach(buffet => {
    if (buffet.city && buffet.city.slug && buffet.lat && buffet.lng) {
      if (!cityCoordinates.has(buffet.city.slug)) {
        cityCoordinates.set(buffet.city.slug, { lat: buffet.lat, lng: buffet.lng });
      }
    }
  });
  
  console.log(`Found coordinates for ${cityCoordinates.size} cities from buffet data\n`);
  
  for (let i = 0; i < citiesToUpdate.length; i++) {
    const city = citiesToUpdate[i];
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    // Progress indicator
    if (i % 10 === 0 || i === citiesToUpdate.length - 1) {
      const percent = ((i + 1) / citiesToUpdate.length * 100).toFixed(1);
      console.log(`  [${percent}%] Processing ${i + 1}/${citiesToUpdate.length}: ${city.city}, ${city.stateAbbr || 'N/A'}...`);
    }
    
    // Get coordinates if available
    const coords = cityCoordinates.get(city.slug);
    
    // Try to get population with advanced matching
    const population = await getPopulationAdvanced(
      city.city,
      city.stateAbbr,
      city.state,
      coords?.lat,
      coords?.lng
    );
    
    if (population && population > 0) {
      updateTxs.push(
        db.tx.cities[city.id].update({
          population: population
        })
      );
      updatedCount++;
      console.log(`    ✓ Found population: ${population.toLocaleString()}`);
    } else {
      failedCount++;
      console.warn(`    ⚠ Could not find population for ${city.city}, ${city.stateAbbr || city.state || 'N/A'}`);
    }
    
    // Rate limiting
    if (i < citiesToUpdate.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // Commit batch when full or at the end
    if (updateTxs.length >= BATCH_SIZE || i === citiesToUpdate.length - 1) {
      if (updateTxs.length > 0) {
        try {
          await db.transact(updateTxs);
          console.log(`    ✓ Committed batch ${batchNum}/${totalBatches} (${updateTxs.length} cities updated)`);
          updateTxs.length = 0;
        } catch (error) {
          console.error(`    ✗ Error updating batch ${batchNum}:`, error.message);
          updateTxs.length = 0;
        }
      }
    }
  }
  
  console.log(`\n✅ Update complete!`);
  console.log(`   - Updated: ${updatedCount} cities`);
  console.log(`   - Failed: ${failedCount} cities`);
  console.log(`   - Already had population: ${alreadyHasPopulation} cities`);
  
  // Final stats
  const finalCities = await db.query({ cities: {} });
  const citiesWithPopulation = finalCities.cities.filter(c => c.population && c.population > 0).length;
  console.log(`\n   Total cities with population data: ${citiesWithPopulation}/${finalCities.cities.length}`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateRemainingCities().catch(error => {
  console.error('\n✗ Error updating cities population:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
