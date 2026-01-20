/**
 * Batch Scraping Coordinator
 * 
 * Coordinates scraping across multiple cities
 * Handles errors, progress tracking, and data aggregation
 * 
 * Usage:
 *   node scripts/health-inspection/batch-scrape.js [city1] [city2] ...
 */

const fs = require('fs');
const path = require('path');
const { scrapeCity, CITY_CONFIGS } = require('./scrape-generic');

/**
 * Load progress from previous runs
 */
function loadProgress() {
  const progressFile = path.join(__dirname, '../..', 'data', 'health-inspections', '.scraping-progress.json');
  if (fs.existsSync(progressFile)) {
    return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  }
  return { completed: [], failed: [], inProgress: [] };
}

/**
 * Save progress
 */
function saveProgress(progress) {
  const progressFile = path.join(__dirname, '../..', 'data', 'health-inspections', '.scraping-progress.json');
  const dir = path.dirname(progressFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

/**
 * Get buffets for a city
 */
function getCityBuffets(cityKey) {
  const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
  if (!fs.existsSync(buffetsPath)) {
    return [];
  }
  
  const buffets = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
  const config = CITY_CONFIGS[cityKey];
  if (!config) return [];
  
  return Object.values(buffets).filter(b => 
    b.address?.stateAbbr === config.state && 
    b.address?.city?.toLowerCase() === cityKey
  );
}

/**
 * Main batch scraping function
 */
async function batchScrape(cities = []) {
  const progress = loadProgress();
  
  // If no cities specified, scrape all configured cities
  const citiesToScrape = cities.length > 0 
    ? cities.map(c => c.toLowerCase())
    : Object.keys(CITY_CONFIGS);
  
  console.log('Batch Health Inspection Scraper');
  console.log('================================\n');
  console.log(`Cities to scrape: ${citiesToScrape.join(', ')}\n`);
  
  const results = {};
  
  for (const cityKey of citiesToScrape) {
    if (!CITY_CONFIGS[cityKey]) {
      console.log(`⚠ ${cityKey} not configured, skipping\n`);
      continue;
    }
    
    const config = CITY_CONFIGS[cityKey];
    const buffets = getCityBuffets(cityKey);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${config.name} (${buffets.length} buffets)`);
    console.log('='.repeat(50));
    
    if (buffets.length === 0) {
      console.log('No buffets found for this city\n');
      continue;
    }
    
    // Check if already completed
    if (progress.completed.includes(cityKey)) {
      console.log('✓ Already completed (use --force to re-scrape)\n');
      continue;
    }
    
    try {
      progress.inProgress.push(cityKey);
      saveProgress(progress);
      
      const cityResults = await scrapeCity(cityKey);
      
      if (cityResults && Object.keys(cityResults).length > 0) {
        results[cityKey] = cityResults;
        progress.completed.push(cityKey);
        progress.inProgress = progress.inProgress.filter(c => c !== cityKey);
        console.log(`\n✓ ${config.name} completed: ${Object.keys(cityResults).length} results`);
      } else {
        progress.failed.push({ city: cityKey, reason: 'No results found' });
        progress.inProgress = progress.inProgress.filter(c => c !== cityKey);
        console.log(`\n⚠ ${config.name}: No results found`);
      }
      
      saveProgress(progress);
      
      // Wait between cities
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      progress.failed.push({ city: cityKey, reason: error.message });
      progress.inProgress = progress.inProgress.filter(c => c !== cityKey);
      saveProgress(progress);
      
      console.error(`\n✗ ${config.name} failed: ${error.message}`);
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('Summary');
  console.log('='.repeat(50));
  console.log(`Completed: ${progress.completed.length}`);
  console.log(`Failed: ${progress.failed.length}`);
  console.log(`Total results: ${Object.keys(results).length} cities`);
  
  if (progress.failed.length > 0) {
    console.log(`\nFailed cities:`);
    progress.failed.forEach(f => {
      console.log(`  - ${f.city}: ${f.reason}`);
    });
  }
  
  // Aggregate all results
  if (Object.keys(results).length > 0) {
    const allResults = {};
    Object.values(results).forEach(cityResults => {
      Object.assign(allResults, cityResults);
    });
    
    const outputFile = path.join(__dirname, '../..', 'data', 'health-inspections', 'all-scraped-inspections.json');
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
    console.log(`\n✓ Aggregated results saved to all-scraped-inspections.json`);
  }
}

// Run if called directly
if (require.main === module) {
  const cities = process.argv.slice(2);
  const force = process.argv.includes('--force');
  
  if (force) {
    // Clear progress
    const progressFile = path.join(__dirname, '../..', 'data', 'health-inspections', '.scraping-progress.json');
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
      console.log('Progress cleared (--force flag)\n');
    }
  }
  
  batchScrape(cities).catch(console.error);
}

module.exports = { batchScrape, loadProgress, saveProgress };
















