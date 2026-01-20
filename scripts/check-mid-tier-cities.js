// Check how many buffets exist for mid-tier cities
// Run with: node scripts/check-mid-tier-cities.js

const { init } = require('@instantdb/admin');
const path = require('path');

// Target cities - mid-tier with exact names and state names
// Note: Some cities are stored with shorter names in the database
const targetCities = [
  { name: 'San Antonio', state: 'Texas', stateAbbr: 'TX' },
  { name: 'San Diego', state: 'California', stateAbbr: 'CA' },
  { name: 'Dallas', state: 'Texas', stateAbbr: 'TX' },
  { name: 'Jacksonville', state: 'Florida', stateAbbr: 'FL' },
  { name: 'Fort Worth', state: 'Texas', stateAbbr: 'TX' },
  { name: 'San Jose', state: 'California', stateAbbr: 'CA' },
  { name: 'Austin', state: 'Texas', stateAbbr: 'TX' },
  { name: 'Charlotte', state: 'North Carolina', stateAbbr: 'NC' },
  { name: 'Columbus', state: 'Ohio', stateAbbr: 'OH' },
  { name: 'Indianapolis', state: 'Indiana', stateAbbr: 'IN' }, // Stored as just "Indianapolis" in DB
  { name: 'San Francisco', state: 'California', stateAbbr: 'CA' },
  { name: 'Seattle', state: 'Washington', stateAbbr: 'WA' },
  { name: 'Denver', state: 'Colorado', stateAbbr: 'CO' },
  { name: 'Oklahoma', state: 'Oklahoma', stateAbbr: 'OK' }, // Stored as "Oklahoma" not "Oklahoma City" in DB
  { name: 'Nashville', state: 'Tennessee', stateAbbr: 'TN' }, // Stored as just "Nashville" in DB
  { name: 'Washington', state: 'District of Columbia', stateAbbr: 'DC' },
  { name: 'El Paso', state: 'Texas', stateAbbr: 'TX' },
  { name: 'Las Vegas', state: 'Nevada', stateAbbr: 'NV' },
  { name: 'Boston', state: 'Massachusetts', stateAbbr: 'MA' },
  { name: 'Detroit', state: 'Michigan', stateAbbr: 'MI' },
  { name: 'Louisville', state: 'Kentucky', stateAbbr: 'KY' }, // Stored as just "Louisville" in DB
  { name: 'Portland', state: 'Oregon', stateAbbr: 'OR' }
];

// Normalize city names for comparison (case-insensitive, trim whitespace)
function normalizeCityName(cityName) {
  return cityName ? cityName.trim().toLowerCase() : '';
}

// Check if a city matches our target cities (with state matching)
function matchesTargetCity(city) {
  const cityName = normalizeCityName(city.city);
  const stateName = normalizeCityName(city.state || '');
  const stateAbbr = city.stateAbbr || '';
  
  for (const target of targetCities) {
    const targetName = normalizeCityName(target.name);
    const targetState = normalizeCityName(target.state);
    const targetStateAbbr = target.stateAbbr;
    
    // Check exact match with state
    if (cityName === targetName && (stateAbbr === targetStateAbbr || stateName === targetState)) {
      return true;
    }
  }
  
  return false;
}

async function checkCities() {
  console.log('Connecting to InstantDB...\n');
  
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
      matchesTargetCity(city)
    );
    
    console.log(`Found ${matchingCities.length} matching cities:\n`);
    matchingCities.forEach(city => {
      console.log(`  - ${city.city}, ${city.stateAbbr} (slug: ${city.slug})`);
    });
    
    if (matchingCities.length === 0) {
      console.log('\n⚠ No matching cities found.');
      return;
    }
    
    // Step 2: For each matching city, query linked buffets and count
    console.log('\nStep 2: Counting buffets linked to matching cities...\n');
    const cityCounts = {};
    let totalCount = 0;
    
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
        const count = buffets.length;
        
        cityCounts[city.city] = count;
        totalCount += count;
        console.log(`  Found ${count} buffets`);
        
      } catch (error) {
        console.error(`  Error querying buffets for ${city.city}:`, error.message);
        cityCounts[city.city] = 0;
      }
    }
    
    // Print summary
    console.log('\n=== Summary ===\n');
    console.log('Buffets by city:');
    Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => {
        console.log(`  ${city}: ${count} buffets`);
      });
    
    console.log(`\nTotal buffets: ${totalCount}`);
    console.log(`\nMatching cities: ${matchingCities.length}`);
    
    return { totalCount, cityCounts, matchingCities };
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkCities();

