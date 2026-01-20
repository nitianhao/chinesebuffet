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

// Initialize admin client
const db = init({
  appId: process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN || 'b92eae55-f7ea-483c-b41d-4bb02a04629b',
});

const JSON_FILE_PATH = path.join(__dirname, '..', 'Example JSON', 'apify-big-cities.json');
const TARGET_NEW_RECORDS = 500;

async function add500NewBuffets() {
  console.log('Reading existing JSON file...');
  
  // Read existing records
  let existingRecords = [];
  let existingPlaceIds = new Set();
  
  if (fs.existsSync(JSON_FILE_PATH)) {
    const fileContent = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    existingRecords = JSON.parse(fileContent);
    existingPlaceIds = new Set(existingRecords.map(r => r.PlaceID).filter(id => id));
    console.log(`Found ${existingRecords.length} existing records with ${existingPlaceIds.size} unique PlaceIDs`);
  } else {
    console.log('No existing file found, will create new one');
  }
  
  console.log('\nFetching buffets from instantDB...');
  const newRecords = [];
  let offset = 0;
  const limit = 1000;
  let totalFetched = 0;
  
  // Fetch buffets in batches until we have 500 new ones
  while (newRecords.length < TARGET_NEW_RECORDS) {
    console.log(`\nFetching batch starting at offset ${offset}...`);
    
    try {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          }
        }
      });
      
      const buffets = result.buffets || [];
      totalFetched += buffets.length;
      
      if (buffets.length === 0) {
        console.log('No more buffets to fetch');
        break;
      }
      
      console.log(`Fetched ${buffets.length} buffets (total fetched: ${totalFetched})`);
      
      // Filter out buffets that are already in the file
      for (const buffet of buffets) {
        // Skip if no placeId or if already exists
        if (!buffet.placeId || existingPlaceIds.has(buffet.placeId)) {
          continue;
        }
        
        // Skip if missing required fields
        if (!buffet.name || !buffet.cityName) {
          continue;
        }
        
        // Skip closed buffets
        if (buffet.permanentlyClosed || buffet.temporarilyClosed) {
          continue;
        }
        
        // Add to new records
        newRecords.push({
          name: buffet.name,
          PlaceID: buffet.placeId,
          City: buffet.cityName
        });
        
        // Add to existing PlaceIDs set to avoid duplicates within this batch
        existingPlaceIds.add(buffet.placeId);
        
        if (newRecords.length >= TARGET_NEW_RECORDS) {
          console.log(`Reached target of ${TARGET_NEW_RECORDS} new records!`);
          break;
        }
      }
      
      console.log(`Found ${newRecords.length} new records so far (need ${TARGET_NEW_RECORDS})`);
      
      // If we got fewer buffets than the limit, we've reached the end
      if (buffets.length < limit) {
        console.log('Reached end of available buffets');
        break;
      }
      
      offset += limit;
      
    } catch (error) {
      console.error(`Error fetching batch at offset ${offset}:`, error.message);
      console.error('Error details:', error);
      break;
    }
  }
  
  if (newRecords.length === 0) {
    console.log('\nNo new records found to add.');
    return;
  }
  
  console.log(`\nAdding ${newRecords.length} new records to the file...`);
  
  // Combine existing and new records
  const allRecords = [...existingRecords, ...newRecords];
  
  // Save to JSON file
  fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(allRecords, null, 2));
  
  console.log(`\nSuccess! Updated file with ${allRecords.length} total records`);
  console.log(`Added ${newRecords.length} new records`);
  console.log(`File saved to: ${JSON_FILE_PATH}`);
  
  // Show breakdown by city for new records
  const cityCounts = {};
  newRecords.forEach(record => {
    cityCounts[record.City] = (cityCounts[record.City] || 0) + 1;
  });
  
  console.log('\nNew records by city:');
  Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([city, count]) => {
      console.log(`  ${city}: ${count}`);
    });
  
  return allRecords;
}

// Run the script
add500NewBuffets()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
