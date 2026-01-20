// Quick script to check the structure of DoorDash results from Apify
const { runActor } = require('../lib/apify-client');

async function main() {
  console.log('Testing DoorDash scraper result structure...\n');
  
  // Test with one restaurant
  const input = {
    location: "38.3779086,-121.9462909",
    searchQuery: "Kings Buffet",
    maxResults: 50,
    radius: 1
  };
  
  console.log('Input:', JSON.stringify(input, null, 2));
  console.log('\nRunning actor...\n');
  
  const result = await runActor('axlymxp/doordash-store-scraper', input, {
    waitForFinish: true,
    timeout: 600000,
  });
  
  console.log('\nResults received:', result.items.length);
  console.log('\nFirst result structure:');
  console.log(JSON.stringify(result.items[0], null, 2));
  
  if (result.items.length > 0) {
    console.log('\n\nAll result fields:');
    console.log(Object.keys(result.items[0]));
  }
}

main().catch(console.error);





