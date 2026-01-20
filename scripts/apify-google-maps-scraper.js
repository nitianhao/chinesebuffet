/**
 * Example script for running Apify Google Maps Scraper
 * 
 * This script demonstrates how to use the Apify Google Maps Scraper actor
 * to scrape Chinese buffet locations.
 * 
 * Usage:
 *   node scripts/apify-google-maps-scraper.js [options]
 * 
 * Options:
 *   --query "search query"     - Search query (default: "Chinese buffet")
 *   --location "city, state"   - Location to search (required)
 *   --max-results N            - Maximum number of results (default: 100)
 *   --output filename.json     - Output filename
 * 
 * Example:
 *   node scripts/apify-google-maps-scraper.js --location "New York, NY" --max-results 50
 */

const fs = require('fs');
const path = require('path');
const { runActor } = require('../lib/apify-client');

// Parse command line arguments
const args = process.argv.slice(2);
let query = 'Chinese buffet';
let location = null;
let maxResults = 100;
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  
  if (arg === '--query' && nextArg) {
    query = nextArg;
    i++;
  } else if (arg === '--location' && nextArg) {
    location = nextArg;
    i++;
  } else if (arg === '--max-results' && nextArg) {
    maxResults = parseInt(nextArg, 10);
    i++;
  } else if (arg === '--output' && nextArg) {
    outputFile = nextArg;
    i++;
  }
}

if (!location) {
  console.error('❌ Error: --location is required');
  console.error('Usage: node scripts/apify-google-maps-scraper.js --location "City, State" [options]');
  process.exit(1);
}

// Default output filename
if (!outputFile) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const locationSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  outputFile = `apify_google_maps_${locationSlug}_${timestamp}.json`;
}

async function main() {
  try {
    console.log(`\n🎬 Running Apify Google Maps Scraper\n`);
    console.log(`📍 Location: ${location}`);
    console.log(`🔍 Query: ${query}`);
    console.log(`📊 Max Results: ${maxResults}\n`);
    
    // Prepare input for the actor
    // Note: Check the actor's documentation for exact input format
    // This is a common format, but may vary by actor version
    const input = {
      queries: [`${query} ${location}`],
      maxCrawledPlaces: maxResults,
      // Add more options as needed based on actor documentation
      // For example:
      // language: 'en',
      // countryCode: 'us',
      // maxReviews: 0, // Set to 0 to skip reviews for faster scraping
    };
    
    const result = await runActor('apify/google-maps-scraper', input);
    
    // Save results
    const outputPath = path.join(__dirname, '..', outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(result.items, null, 2));
    
    console.log(`\n✅ Scraping completed!`);
    console.log(`📊 Total results: ${result.items.length}`);
    console.log(`💾 Results saved to: ${outputPath}`);
    
    // Print summary
    if (result.stats) {
      console.log(`\n📈 Run Statistics:`);
      console.log(`   - Requests: ${result.stats.requestsTotal || 'N/A'}`);
      console.log(`   - Duration: ${result.stats.duration || 'N/A'}ms`);
    }
    
    // Show sample of results
    if (result.items.length > 0) {
      console.log(`\n📋 Sample result:`);
      const sample = result.items[0];
      console.log(`   - Name: ${sample.title || sample.name || 'N/A'}`);
      console.log(`   - Address: ${sample.address || sample.fullAddress || 'N/A'}`);
      console.log(`   - Rating: ${sample.totalScore || sample.rating || 'N/A'}`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();




















