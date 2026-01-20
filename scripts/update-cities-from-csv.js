// Script to update cities with population data from a local CSV file
// This is the most reliable approach for remaining cities
// 
// STEP 1: Download a US cities CSV file (free from SimpleMaps):
//   https://simplemaps.com/data/us-cities
//   Save it as: data/us-cities-population.csv
//
// STEP 2: Run this script:
//   node scripts/update-cities-from-csv.js
//
// The script will match cities by name and state, handling name variations

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

// Normalize city name for matching
function normalizeCityName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/^st\.\s+/i, 'saint ')
    .replace(/^ft\.\s+/i, 'fort ')
    .replace(/\s+city$/i, '')
    .replace(/\s+township$/i, '')
    .replace(/\s+county$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity between two strings (simple Levenshtein-like)
function similarity(str1, str2) {
  const s1 = normalizeCityName(str1);
  const s2 = normalizeCityName(str2);
  
  if (s1 === s2) return 1.0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.max(s1.length, s2.length) / Math.min(s1.length, s2.length);
  }
  
  // Simple character matching
  let matches = 0;
  const minLen = Math.min(s1.length, s2.length);
  const maxLen = Math.max(s1.length, s2.length);
  
  for (let i = 0; i < minLen; i++) {
    if (s1[i] === s2[i]) matches++;
  }
  
  return matches / maxLen;
}

// State name to abbreviation mapping
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

// Fix state abbreviation
function fixStateAbbr(stateAbbr, stateFullName) {
  if (!stateAbbr && !stateFullName) return null;
  
  // Clean state abbreviation
  const cleanAbbr = stateAbbr?.toString().trim().replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleanAbbr && cleanAbbr.length === 2 && stateNameToAbbr[cleanAbbr.toLowerCase()]) {
    return cleanAbbr;
  }
  
  // Try to extract from state full name
  if (stateFullName) {
    const stateLower = stateFullName.toLowerCase().trim();
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

// Load population data from CSV
function loadPopulationFromCSV(csvPath) {
  if (!fs.existsSync(csvPath)) {
    return null;
  }
  
  console.log(`Loading population data from: ${csvPath}`);
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('CSV file appears to be empty or has no data rows');
    return null;
  }
  
  // Parse headers
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  // Find column indices - handle uscities.csv format
  const cityIdx = headers.findIndex(h => h === 'city' || h === 'city_ascii');
  const stateIdx = headers.findIndex(h => h === 'state_name');
  const stateAbbrIdx = headers.findIndex(h => h === 'state_id' || h === 'state_abbr' || h === 'state_code');
  const popIdx = headers.findIndex(h => h === 'population' || h === 'pop');
  
  console.log(`Found columns: city=${cityIdx} (${headers[cityIdx]}), state=${stateIdx} (${headers[stateIdx] || 'N/A'}), stateAbbr=${stateAbbrIdx} (${headers[stateAbbrIdx] || 'N/A'}), population=${popIdx} (${headers[popIdx]})`);
  
  if (cityIdx === -1 || popIdx === -1) {
    console.error('CSV file missing required columns (city and population)');
    console.error('Available columns:', headers);
    return null;
  }
  
  if (stateAbbrIdx === -1 && stateIdx === -1) {
    console.error('CSV file missing state column (state_id or state_name)');
    console.error('Available columns:', headers);
    return null;
  }
  
  const cityMap = new Map(); // Map: "normalized-city-state" -> population
  const cityVariations = new Map(); // Store variations for better matching
  
  for (let i = 1; i < lines.length; i++) {
    // Handle CSV with quoted values
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
    values.push(currentValue.trim()); // Add last value
    
    if (values.length <= Math.max(cityIdx, popIdx, stateAbbrIdx >= 0 ? stateAbbrIdx : stateIdx)) {
      continue;
    }
    
    const city = values[cityIdx]?.trim().replace(/^"|"$/g, '');
    const stateAbbr = stateAbbrIdx >= 0 ? values[stateAbbrIdx]?.trim().replace(/^"|"$/g, '') : null;
    const stateFull = stateIdx >= 0 ? values[stateIdx]?.trim().replace(/^"|"$/g, '') : null;
    const population = parseInt(values[popIdx]?.replace(/,/g, '').replace(/^"|"$/g, ''), 10);
    
    if (!city || isNaN(population) || population <= 0) {
      continue;
    }
    
    // Determine state abbreviation
    let finalStateAbbr = fixStateAbbr(stateAbbr, stateFull);
    if (!finalStateAbbr) continue;
    
    // Create normalized keys
    const normalizedCity = normalizeCityName(city);
    const key = `${normalizedCity}-${finalStateAbbr.toLowerCase()}`;
    
    cityMap.set(key, population);
    
    // Store variations for fuzzy matching
    const variations = [
      normalizedCity,
      city.toLowerCase().replace(/^st\.\s+/i, 'saint '),
      city.toLowerCase().replace(/^saint\s+/i, 'st. '),
      city.toLowerCase().replace(/\s+city$/i, ''),
    ];
    
    for (const variation of variations) {
      const varKey = `${variation}-${finalStateAbbr.toLowerCase()}`;
      if (!cityMap.has(varKey)) {
        cityVariations.set(varKey, { original: key, similarity: 0.9 });
      }
    }
  }
  
  console.log(`Loaded ${cityMap.size} cities from CSV`);
  
  return { exact: cityMap, variations: cityVariations };
}

// Find population in the loaded data
function findPopulation(cityName, stateAbbr, stateFullName, populationData) {
  if (!populationData) return null;
  
  const fixedStateAbbr = fixStateAbbr(stateAbbr, stateFullName);
  if (!fixedStateAbbr) return null;
  
  const normalizedCity = normalizeCityName(cityName);
  const key = `${normalizedCity}-${fixedStateAbbr.toLowerCase()}`;
  
  // Try exact match first
  if (populationData.exact.has(key)) {
    return populationData.exact.get(key);
  }
  
  // Try fuzzy matching
  let bestMatch = null;
  let bestSimilarity = 0.5; // Minimum similarity threshold
  
  for (const [mapKey, population] of populationData.exact.entries()) {
    const [mapCity, mapState] = mapKey.split('-');
    if (mapState !== fixedStateAbbr.toLowerCase()) continue;
    
    const sim = similarity(cityName, mapCity.replace(/-/g, ' '));
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestMatch = population;
    }
  }
  
  return bestMatch;
}

// Main function
async function updateCitiesFromCSV() {
  // Check for CSV file
  const csvPaths = [
    path.join(__dirname, '../uscities.csv'),
    path.join(__dirname, '../data/us-cities-population.csv'),
    path.join(__dirname, '../Example JSON/us-cities-population.csv'),
    path.join(__dirname, '../us-cities-population.csv'),
  ];
  
  let csvPath = null;
  for (const pathOption of csvPaths) {
    if (fs.existsSync(pathOption)) {
      csvPath = pathOption;
      break;
    }
  }
  
  if (!csvPath) {
    console.error('\n❌ ERROR: No CSV file found!');
    console.error('\nPlease download a US cities population CSV file:');
    console.error('  https://simplemaps.com/data/us-cities');
    console.error('\nAnd place it at one of these locations:');
    csvPaths.forEach(p => console.error(`  - ${p}`));
    console.error('\nCSV format should have columns: city, state_id (or state_abbr), population');
    process.exit(1);
  }
  
  // Load population data from CSV
  const populationData = loadPopulationFromCSV(csvPath);
  if (!populationData) {
    console.error('Failed to load population data from CSV');
    process.exit(1);
  }
  
  console.log('\nFetching all cities from InstantDB...');
  
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
  
  // Find cities that need population updates
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
  
  console.log(`\nUpdating ${citiesToUpdate.length} cities using CSV data...\n`);
  
  // Update cities in batches
  const BATCH_SIZE = 50;
  const totalBatches = Math.ceil(citiesToUpdate.length / BATCH_SIZE);
  let updatedCount = 0;
  let failedCount = 0;
  const updateTxs = [];
  
  for (let i = 0; i < citiesToUpdate.length; i++) {
    const city = citiesToUpdate[i];
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    // Progress indicator
    if (i % 50 === 0 || i === citiesToUpdate.length - 1) {
      const percent = ((i + 1) / citiesToUpdate.length * 100).toFixed(1);
      console.log(`  [${percent}%] Processing ${i + 1}/${citiesToUpdate.length}...`);
    }
    
    // Find population from CSV
    const population = findPopulation(city.city, city.stateAbbr, city.state, populationData);
    
    if (population && population > 0) {
      updateTxs.push(
        db.tx.cities[city.id].update({
          population: population
        })
      );
      updatedCount++;
    } else {
      failedCount++;
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

updateCitiesFromCSV().catch(error => {
  console.error('\n✗ Error updating cities population:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
