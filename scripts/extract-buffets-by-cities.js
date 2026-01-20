// Extract buffets from specific cities by querying InstantDB
// Run with: node scripts/extract-buffets-by-cities.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (error) {
    console.warn('Warning: Could not read .env.local file:', error.message);
  }
}

// Target cities
const targetCities = [
  'New York',
  'Chicago',
  'Los Angeles',
  'Houston',
  'Boston',
  'Philadelphia'
];

// Normalize city names for comparison (case-insensitive, trim whitespace)
function normalizeCityName(cityName) {
  return cityName ? cityName.trim().toLowerCase() : '';
}

// Check if a city name matches any of our target cities
function matchesTargetCity(cityName) {
  const normalized = normalizeCityName(cityName);
  return targetCities.some(target => normalizeCityName(target) === normalized);
}

async function extractBuffets() {
  console.log('Connecting to InstantDB...\n');
  
  // Admin token is provided in the script or from environment

  const schema = require('../src/instant.schema.ts');
  
  const db = init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN || 'b92eae55-f7ea-483c-b41d-4bb02a04629b',
    schema: schema.default || schema,
  });

  try {
    // Step 1: Query all cities to find matching ones
    console.log('Step 1: Querying cities namespace...');
    const citiesResult = await db.query({ cities: {} });
    const allCities = citiesResult.cities || [];
    console.log(`Found ${allCities.length} total cities in database\n`);
    
    // Find cities that match our target cities
    const matchingCities = allCities.filter(city => 
      matchesTargetCity(city.city)
    );
    
    console.log(`Found ${matchingCities.length} matching cities:\n`);
    matchingCities.forEach(city => {
      console.log(`  - ${city.city}, ${city.stateAbbr} (slug: ${city.slug})`);
    });
    
    if (matchingCities.length === 0) {
      console.log('\n⚠ No matching cities found. Available city names:');
      const cityNames = allCities.map(c => c.city).filter(Boolean).sort();
      cityNames.slice(0, 20).forEach(name => console.log(`  - ${name}`));
      console.log(`  ... and ${cityNames.length - 20} more`);
      return [];
    }
    
    // Step 2: For each matching city, query linked buffets
    console.log('\nStep 2: Querying buffets linked to matching cities...\n');
    const extractedData = [];
    const cityCounts = {};
    
    for (const city of matchingCities) {
      console.log(`Querying buffets for ${city.city}, ${city.stateAbbr}...`);
      
      try {
        // Query buffets linked to this city
        const result = await db.query({
          cities: {
            $: { where: { slug: city.slug } },
            buffets: {
              $: {
                limit: 10000, // High limit to get all buffets for this city
              }
            }
          }
        });
        
        const cityData = result.cities?.[0];
        const buffets = cityData?.buffets || [];
        
        cityCounts[city.city] = buffets.length;
        console.log(`  Found ${buffets.length} buffets`);
        
        // Extract required fields
        buffets.forEach(buffet => {
          extractedData.push({
            Title: buffet.name || '',
            ID: buffet.id || '',
            City: city.city,
            placeId: buffet.placeId || ''
          });
        });
        
      } catch (error) {
        console.error(`  Error querying buffets for ${city.city}:`, error.message);
        cityCounts[city.city] = 0;
      }
    }
    
    // Print summary by city
    console.log('\n=== Summary ===\n');
    targetCities.forEach(city => {
      const count = cityCounts[city] || 0;
      console.log(`  ${city}: ${count} buffets`);
    });
    
    // Sort by city, then by title
    extractedData.sort((a, b) => {
      const cityCompare = a.City.localeCompare(b.City);
      if (cityCompare !== 0) return cityCompare;
      return a.Title.localeCompare(b.Title);
    });
    
    // Save to JSON file
    const outputPath = path.join(__dirname, '../Example JSON/apify-reviews-cities.json');
    fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2), 'utf8');
    
    console.log(`\n✓ Successfully extracted ${extractedData.length} buffets`);
    console.log(`✓ Saved to: ${outputPath}`);
    console.log(`\nTotal buffets found: ${extractedData.length}`);
    
    return extractedData;
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

extractBuffets();
