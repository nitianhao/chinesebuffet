const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
} catch (e) {
  // Ignore if .env.local doesn't exist
}

// Cities to filter
const TARGET_CITIES = [
  'New York',
  'Chicago',
  'Philadelphia',
  'San Francisco',
  'Los Angeles',
  'Washington',
  'Seattle',
  'Denver',
  'Dallas',
  'Houston',
  'Baltimore',
  'Miami',
  'Sacramento',
  'San Antonio',
  'Las Vegas',
  'Phoenix',
  'Boston',
  'Atlanta',
  'San Jose',
  'Detroit',
  'Portland',
  'Memphis',
  'Fresno',
  'Tulsa',
  'Minneapolis',
  'New Orleans'
];

// Initialize admin client
const db = init({
  appId: process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN || 'b92eae55-f7ea-483c-b41d-4bb02a04629b',
});

async function exportBigCitiesBuffets() {
  console.log('Starting export of buffets from big cities...');
  console.log(`Target cities: ${TARGET_CITIES.join(', ')}`);
  
  const allResults = [];
  
  // Query buffets for each city
  // Since InstantDB doesn't support OR queries easily, we'll query each city separately
  for (const cityName of TARGET_CITIES) {
    console.log(`\nQuerying buffets in ${cityName}...`);
    
    try {
      const result = await db.query({
        buffets: {
          $: {
            where: { cityName: cityName },
            limit: 10000, // Large limit to get all buffets
          }
        }
      });
      
      const buffets = result.buffets || [];
      console.log(`Found ${buffets.length} buffets in ${cityName}`);
      
      // Transform to desired format
      for (const buffet of buffets) {
        allResults.push({
          name: buffet.name || '',
          PlaceID: buffet.placeId || null,
          City: buffet.cityName || cityName
        });
      }
      
    } catch (error) {
      console.error(`Error querying ${cityName}:`, error.message);
    }
  }
  
  console.log(`\nTotal buffets found: ${allResults.length}`);
  
  // Filter out any records with missing required fields
  const validResults = allResults.filter(b => b.name && b.PlaceID && b.City);
  console.log(`Valid records (with name, PlaceID, and City): ${validResults.length}`);
  
  // Save to JSON file
  const outputPath = path.join(__dirname, '..', 'Example JSON', 'apify-big-cities.json');
  fs.writeFileSync(outputPath, JSON.stringify(validResults, null, 2));
  
  console.log(`\nExport complete! Saved ${validResults.length} records to: ${outputPath}`);
  console.log(`\nRecord count: ${validResults.length}`);
  
  return validResults;
}

// Run the export
exportBigCitiesBuffets()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
