/**
 * Houston Health Department Restaurant Inspection Scraper
 * 
 * Scrapes health inspection data from Houston Health Department website
 * URL: https://www.houstontx.gov/health/FoodService/index.html
 * 
 * Usage:
 *   node scripts/health-inspection/scrape-houston.js [restaurant-name]
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Search for restaurant in Houston health department database
 * @param {Object} page - Puppeteer page object
 * @param {string} restaurantName - Restaurant name to search
 * @returns {Promise<Array>} Array of inspection records
 */
async function searchRestaurant(page, restaurantName) {
  try {
    // Navigate to Houston health department search page
    console.log(`  Searching for: ${restaurantName}`);
    
    // Try to find the search interface
    // Note: This will need to be adjusted based on actual website structure
    await page.goto('https://www.houstontx.gov/health/FoodService/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    // Wait a bit for page to load
    await page.waitForTimeout(2000);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'houston-health-debug.png', fullPage: true });
    console.log('  Screenshot saved to houston-health-debug.png');
    
    // Try to find search form - this will need to be customized based on actual site
    const searchInput = await page.$('input[type="text"], input[name*="search"], input[id*="search"]');
    
    if (searchInput) {
      await searchInput.type(restaurantName, { delay: 100 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      
      // Extract results
      const results = await page.evaluate(() => {
        // This will need to be customized based on actual HTML structure
        const records = [];
        // Example: Find table rows or result elements
        const rows = document.querySelectorAll('table tr, .result-item, .inspection-record');
        rows.forEach(row => {
          // Extract data from row
          // This is a placeholder - needs actual implementation
        });
        return records;
      });
      
      return results;
    } else {
      console.log('  ⚠ Search form not found - website structure may have changed');
      return [];
    }
    
  } catch (error) {
    console.error(`  Error searching for ${restaurantName}:`, error.message);
    return [];
  }
}

/**
 * Transform Houston inspection data to standardized format
 * @param {Object} rawData - Raw inspection data from Houston
 * @returns {Object} Standardized health inspection object
 */
function transformHoustonInspection(rawData) {
  // Houston uses numeric scores (0-100, higher is better typically)
  // This will need to be adjusted based on actual Houston data format
  
  return {
    currentScore: rawData.score || null,
    currentGrade: rawData.grade || null,
    inspectionDate: rawData.inspectionDate || null,
    inspectorName: rawData.inspector || null,
    violations: rawData.violations || [],
    criticalViolationsCount: rawData.criticalViolations || 0,
    generalViolationsCount: rawData.generalViolations || 0,
    dataSource: 'Houston Health Department',
    lastUpdated: new Date().toISOString(),
    permitNumber: rawData.permitNumber || null,
    healthDepartmentUrl: 'https://www.houstontx.gov/health/FoodService/index.html',
    _raw: rawData,
  };
}

/**
 * Main scraping function
 */
async function scrapeHouston() {
  const restaurantName = process.argv[2] || null;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Houston Health Department Scraper');
    console.log('==================================\n');
    
    if (restaurantName) {
      // Search for specific restaurant
      const results = await searchRestaurant(page, restaurantName);
      console.log(`Found ${results.length} inspection records`);
      
      if (results.length > 0) {
        // Save results
        const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = path.join(outputDir, 'houston-inspections.json');
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
        console.log(`\n✓ Saved to ${outputFile}`);
      }
    } else {
      // Load Houston buffets and search for each
      const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
      if (!fs.existsSync(buffetsPath)) {
        console.error('Buffets file not found');
        process.exit(1);
      }
      
      const buffets = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
      const houstonBuffets = Object.values(buffets).filter(b => 
        b.address?.stateAbbr === 'TX' && 
        b.address?.city?.toLowerCase() === 'houston'
      );
      
      console.log(`Found ${houstonBuffets.length} Houston buffets to search\n`);
      
      const allResults = {};
      
      for (let i = 0; i < Math.min(houstonBuffets.length, 5); i++) { // Limit to 5 for testing
        const buffet = houstonBuffets[i];
        console.log(`[${i + 1}/${Math.min(houstonBuffets.length, 5)}] ${buffet.name}`);
        
        const results = await searchRestaurant(page, buffet.name);
        if (results.length > 0) {
          allResults[buffet.id] = {
            buffet: {
              id: buffet.id,
              name: buffet.name,
              address: buffet.address?.full,
            },
            inspections: results,
          };
        }
        
        // Be respectful - wait between requests
        await page.waitForTimeout(2000);
      }
      
      if (Object.keys(allResults).length > 0) {
        const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = path.join(outputDir, 'houston-inspections.json');
        fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
        console.log(`\n✓ Saved ${Object.keys(allResults).length} results to ${outputFile}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  scrapeHouston().catch(console.error);
}

module.exports = { scrapeHouston, searchRestaurant, transformHoustonInspection };
















