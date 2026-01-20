/**
 * Houston Scraper Runner
 * 
 * Convenience script to run Houston scraper with proper error handling
 * 
 * Usage:
 *   node scripts/health-inspection/run-houston-scraper.js [restaurant-name]
 */

const { scrapeHouston } = require('./scrape-houston-working');

async function main() {
  const restaurantName = process.argv[2] || null;
  
  console.log('Houston Health Inspection Scraper');
  console.log('==================================\n');
  
  // Check dependencies
  let puppeteerAvailable = false;
  try {
    require('puppeteer');
    puppeteerAvailable = true;
  } catch (e) {
    console.log('❌ Puppeteer not installed\n');
    console.log('Please install dependencies first:');
    console.log('  npm install puppeteer cheerio --save-dev');
    console.log('  OR');
    console.log('  ./scripts/health-inspection/install-dependencies.sh\n');
    process.exit(1);
  }
  
  if (!puppeteerAvailable) {
    process.exit(1);
  }
  
  console.log('✓ Dependencies OK\n');
  
  if (restaurantName) {
    console.log(`Testing with: ${restaurantName}\n`);
  } else {
    console.log('Will scrape all 28 Houston buffets\n');
    console.log('⚠ This will take 30-60 minutes');
    console.log('⚠ Progress is saved incrementally - you can stop and resume\n');
  }
  
  try {
    await scrapeHouston(restaurantName);
    console.log('\n✅ Scraping complete!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
















