const { runActor } = require('../lib/apify-client');
const fs = require('fs');
const path = require('path');

const JSON_FILE_PATH = path.join(__dirname, '..', 'Example JSON', 'apify-big-cities.json');
const ACTOR_ID = 'compass/crawler-google-places';
const BATCH_SIZE = null; // null = process all remaining records
const MAX_PLACE_IDS_PER_RUN = 50; // Apify actor may have limits, process in batches

// Fields to exclude from scraped data
const UNWANTED_FIELDS = [
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

function isRecordScraped(record) {
  // Check if record has been scraped by looking for scraped data fields
  return record.hasOwnProperty('title') || 
         record.hasOwnProperty('address') || 
         record.hasOwnProperty('totalScore') ||
         record.hasOwnProperty('scrapedAt');
}

function filterUnwantedFields(data) {
  const clean = {};
  Object.keys(data).forEach(key => {
    if (!UNWANTED_FIELDS.includes(key)) {
      clean[key] = data[key];
    }
  });
  return clean;
}

async function scrapeBatch() {
  console.log('Reading JSON file...');
  
  // Read existing records
  let records = [];
  if (fs.existsSync(JSON_FILE_PATH)) {
    const fileContent = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    records = JSON.parse(fileContent);
    console.log(`Found ${records.length} total records in file`);
  } else {
    throw new Error(`File not found: ${JSON_FILE_PATH}`);
  }
  
  // Find records that haven't been scraped yet
  const unscrapedRecords = records.filter(record => {
    // Skip if already enriched (has scraped data fields)
    if (isRecordScraped(record)) {
      return false;
    }
    // Only process records with PlaceID
    return record.PlaceID && record.PlaceID.trim() !== '';
  });
  
  console.log(`\nFound ${unscrapedRecords.length} unscraped records (out of ${records.length} total)`);
  console.log(`Already enriched: ${records.length - unscrapedRecords.length} records`);
  
  if (unscrapedRecords.length === 0) {
    console.log('✅ All records have already been scraped!');
    return;
  }
  
  // Process in batches of MAX_PLACE_IDS_PER_RUN to avoid hitting API limits
  // If BATCH_SIZE is null, process all remaining records
  const recordsToProcess = BATCH_SIZE ? unscrapedRecords.slice(0, BATCH_SIZE) : unscrapedRecords;
  console.log(`Target: Scrape ${recordsToProcess.length} records`);
  const placeIdMap = new Map(); // Map PlaceID to record index in original array
  
  records.forEach((record, index) => {
    if (record.PlaceID) {
      placeIdMap.set(record.PlaceID, index);
    }
  });
  
  let successCount = 0;
  let failCount = 0;
  const processedPlaceIds = new Set();
  
  // Process in smaller batches
  for (let i = 0; i < recordsToProcess.length; i += MAX_PLACE_IDS_PER_RUN) {
    const batch = recordsToProcess.slice(i, i + MAX_PLACE_IDS_PER_RUN);
    const placeIds = batch.map(r => r.PlaceID).filter(id => id);
    
    console.log(`\n📦 Processing batch ${Math.floor(i / MAX_PLACE_IDS_PER_RUN) + 1} (${placeIds.length} place IDs)...`);
    
    try {
      const input = {
        placeIds: placeIds,
        // Exclude unnecessary data, but include menu
        includeReviews: false,
        includePhotos: false,
        includeBusinessLeads: false,
        includeSocialMedia: false,
        includeMenu: true, // Include menu data as requested
      };
      
      console.log(`🚀 Running Apify actor for ${placeIds.length} places...`);
      const result = await runActor(ACTOR_ID, input, {
        waitForFinish: true,
        timeout: 1800000, // 30 minutes timeout per batch
      });
      
      if (result.items && result.items.length > 0) {
        console.log(`✅ Successfully scraped ${result.items.length} items`);
        
        // Update records with scraped data
        for (const scrapedItem of result.items) {
          const placeId = scrapedItem.placeId || scrapedItem.inputPlaceId;
          if (!placeId) {
            console.warn('⚠️  Item missing placeId, skipping...');
            continue;
          }
          
          const recordIndex = placeIdMap.get(placeId);
          if (recordIndex === undefined) {
            console.warn(`⚠️  PlaceID ${placeId} not found in records, skipping...`);
            continue;
          }
          
          // Filter out unwanted fields
          const cleanData = filterUnwantedFields(scrapedItem);
          
          // Update the record
          records[recordIndex] = {
            ...records[recordIndex],
            ...cleanData,
            // Preserve original fields
            name: records[recordIndex].name,
            PlaceID: records[recordIndex].PlaceID,
            City: records[recordIndex].City,
          };
          
          processedPlaceIds.add(placeId);
          successCount++;
        }
        
        // Save progress after each batch
        fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(records, null, 2));
        console.log(`💾 Progress saved (${successCount} records updated so far)`);
        
      } else {
        console.warn(`⚠️  No items returned from actor for this batch`);
        failCount += batch.length;
      }
      
      // Add a small delay between batches to avoid rate limiting
      if (i + MAX_PLACE_IDS_PER_RUN < recordsToProcess.length) {
        console.log('⏸️  Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Error processing batch:`, error.message);
      failCount += batch.length;
      
      // Continue with next batch even if this one fails
      console.log('⏭️  Continuing with next batch...');
    }
  }
  
  // Final save
  fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(records, null, 2));
  
  console.log(`\n✅ Batch processing complete!`);
  console.log(`📊 Statistics:`);
  console.log(`   - Successfully scraped: ${successCount} records`);
  console.log(`   - Failed/Skipped: ${failCount} records`);
  console.log(`   - Total processed: ${successCount + failCount} records`);
  console.log(`   - Remaining unscraped: ${records.filter(r => !isRecordScraped(r) && r.PlaceID).length} records`);
  console.log(`\n📝 File saved to: ${JSON_FILE_PATH}`);
}

// Run the script
scrapeBatch()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
