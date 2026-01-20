const { runActor } = require('../lib/apify-client');
const fs = require('fs');
const path = require('path');

const JSON_FILE_PATH = path.join(__dirname, '..', 'Example JSON', 'apify-big-cities.json');
const ACTOR_ID = 'compass/crawler-google-places';

async function scrapeOneRecord() {
  console.log('Reading JSON file...');
  
  // Read existing records
  let records = [];
  if (fs.existsSync(JSON_FILE_PATH)) {
    const fileContent = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    records = JSON.parse(fileContent);
    console.log(`Found ${records.length} records in file`);
  } else {
    throw new Error(`File not found: ${JSON_FILE_PATH}`);
  }
  
  if (records.length === 0) {
    throw new Error('No records found in file');
  }
  
  // Get first record for testing
  const testRecord = records[0];
  console.log(`\nTesting with first record:`);
  console.log(`  Name: ${testRecord.name}`);
  console.log(`  PlaceID: ${testRecord.PlaceID}`);
  console.log(`  City: ${testRecord.City}`);
  
  // Try using placeId directly first, if that doesn't work, use query
  // Based on compass/crawler-google-places docs, we can use placeIds array
  const input = {
    placeIds: [testRecord.PlaceID],
    // Exclude unnecessary data
    includeReviews: false,
    includePhotos: false,
    includeBusinessLeads: false,
    includeSocialMedia: false,
    // Only get basic place data
    includeMenu: false, // We don't need menu data per user request
  };
  
  console.log(`\n🚀 Running Apify actor: ${ACTOR_ID}`);
  console.log(`📥 Input:`, JSON.stringify(input, null, 2));
  
  try {
    const result = await runActor(ACTOR_ID, input, {
      waitForFinish: true,
      timeout: 600000, // 10 minutes timeout for testing
    });
    
    if (result.items && result.items.length > 0) {
      console.log(`\n✅ Successfully scraped ${result.items.length} item(s)`);
      
      // Get the scraped data (should be just one item since we used one placeId)
      const scrapedData = result.items[0];
      
      console.log(`\n📊 Scraped data fields:`, Object.keys(scrapedData));
      
      // Filter out unwanted fields (reviews, photos, social media, business leads)
      const unwantedFields = [
        'reviews',
        'images',
        'imageUrls',
        'imageCategories',
        'imagesCount',
        'leadsEnrichment',
        'peopleAlsoSearch', // might contain social media links
        'webResults', // might contain social media
        'hotelAds',
        'similarHotelsNearby',
        'hotelReviewSummary',
        'hotelDescription',
        'hotelStars',
        'checkInDate',
        'checkOutDate',
        'gasPrices',
        'userPlaceNote',
        'isAdvertisement',
        'searchString',
        'language',
        'inputPlaceId',
      ];
      
      // Create clean scraped data without unwanted fields
      const cleanScrapedData = {};
      Object.keys(scrapedData).forEach(key => {
        if (!unwantedFields.includes(key)) {
          cleanScrapedData[key] = scrapedData[key];
        }
      });
      
      // Update the record in the array with the scraped data
      // Merge the original data with the clean scraped data
      records[0] = {
        ...testRecord,
        ...cleanScrapedData,
        // Keep original fields
        name: testRecord.name,
        PlaceID: testRecord.PlaceID,
        City: testRecord.City,
      };
      
      // Save back to file
      fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(records, null, 2));
      
      console.log(`\n✅ Updated record in JSON file`);
      console.log(`📝 File saved to: ${JSON_FILE_PATH}`);
      
      // Show what was added
      console.log(`\n📋 Additional fields added to record:`);
      const newFields = Object.keys(scrapedData).filter(key => 
        !['name', 'PlaceID', 'City'].includes(key)
      );
      newFields.forEach(field => {
        const value = scrapedData[field];
        if (typeof value === 'object') {
          console.log(`  ${field}: [${typeof value === 'object' && !Array.isArray(value) ? 'Object' : Array.isArray(value) ? 'Array' : typeof value}]`);
        } else {
          console.log(`  ${field}: ${value}`);
        }
      });
      
    } else {
      console.log(`\n⚠️  No items returned from actor`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error running actor:`, error.message);
    
    // If placeIds doesn't work, try with query
    if (error.message.includes('placeIds') || error.message.includes('Invalid input')) {
      console.log(`\n🔄 Trying alternative approach with query instead of placeId...`);
      
      const queryInput = {
        queries: [`${testRecord.name}, ${testRecord.City}`],
        maxCrawledPlaces: 1,
        includeReviews: false,
        includePhotos: false,
        includeBusinessLeads: false,
        includeSocialMedia: false,
        includeMenu: false,
      };
      
      try {
        const result = await runActor(ACTOR_ID, queryInput, {
          waitForFinish: true,
          timeout: 600000,
        });
        
        if (result.items && result.items.length > 0) {
          const scrapedData = result.items[0];
          
          // Update the record
          records[0] = {
            ...testRecord,
            ...scrapedData,
            name: testRecord.name,
            PlaceID: testRecord.PlaceID,
            City: testRecord.City,
          };
          
          fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(records, null, 2));
          console.log(`\n✅ Successfully scraped using query approach and updated file`);
        }
      } catch (queryError) {
        console.error(`\n❌ Query approach also failed:`, queryError.message);
        throw queryError;
      }
    } else {
      throw error;
    }
  }
}

// Run the script
scrapeOneRecord()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
