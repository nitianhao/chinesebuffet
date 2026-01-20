// Script to check database for existing DoorDash URLs
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/buffets-by-id.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('🔍 Checking database for DoorDash URLs...\n');

const doordashUrls = [];

for (const [placeId, buffet] of Object.entries(data)) {
  let foundUrl = null;
  let source = null;
  
  // Check website field
  if (buffet.website && buffet.website.includes('doordash.com')) {
    foundUrl = buffet.website;
    source = 'website';
  }
  
  // Check orderBy field (can be array or JSON string)
  if (!foundUrl && buffet.orderBy) {
    let orderBy = buffet.orderBy;
    
    // Parse if it's a JSON string
    if (typeof orderBy === 'string') {
      try {
        orderBy = JSON.parse(orderBy);
      } catch (e) {
        // Not valid JSON, skip
      }
    }
    
    // Check if it's an array
    if (Array.isArray(orderBy)) {
      for (const order of orderBy) {
        const url = order.orderUrl || order.url || order.link;
        if (url && url.includes('doordash.com')) {
          foundUrl = url;
          source = 'orderBy';
          break;
        }
      }
    }
  }
  
  if (foundUrl) {
    doordashUrls.push({
      placeId: placeId,
      name: buffet.name,
      city: buffet.address?.city,
      state: buffet.address?.state,
      doordashUrl: foundUrl,
      source: source
    });
  }
}

console.log(`✅ Found ${doordashUrls.length} restaurants with DoorDash URLs\n`);

if (doordashUrls.length > 0) {
  console.log('Restaurants with DoorDash URLs:');
  console.log('=' .repeat(80));
  
  doordashUrls.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.name}`);
    console.log(`   Location: ${item.city}, ${item.state}`);
    console.log(`   Place ID: ${item.placeId}`);
    console.log(`   Source: ${item.source}`);
    console.log(`   URL: ${item.doordashUrl}`);
  });
  
  // Save to file
  const outputPath = path.join(__dirname, '../data/doordash-urls-from-db.json');
  fs.writeFileSync(outputPath, JSON.stringify(doordashUrls, null, 2));
  console.log(`\n\n✅ Results saved to: ${outputPath}`);
} else {
  console.log('No DoorDash URLs found in database.');
}

console.log(`\n📊 Summary: ${doordashUrls.length} DoorDash URLs found out of ${Object.keys(data).length} restaurants`);





