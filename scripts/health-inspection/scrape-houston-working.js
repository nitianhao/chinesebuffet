/**
 * Houston Health Department Scraper - Working Implementation
 * 
 * Scrapes health inspection data from Houston Health Department
 * Uses Puppeteer for JavaScript-heavy sites
 * 
 * Prerequisites:
 *   npm install puppeteer --save-dev
 * 
 * Usage:
 *   node scripts/health-inspection/scrape-houston-working.js [restaurant-name]
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Check if Puppeteer is available
let puppeteerAvailable = true;
try {
  require('puppeteer');
} catch (e) {
  puppeteerAvailable = false;
  console.log('⚠ Puppeteer not installed. Install with: npm install puppeteer --save-dev\n');
}

/**
 * Search for restaurant in Houston health department
 */
async function searchHoustonRestaurant(page, restaurantName) {
  try {
    console.log(`  Searching for: ${restaurantName}`);
    
    // Navigate to Houston health department
    const url = 'https://www.houstontx.gov/health/FoodService/index.html';
    console.log(`  Loading: ${url}`);
    
    // Try multiple navigation strategies
    let navigationSuccess = false;
    const strategies = [
      { waitUntil: 'domcontentloaded', timeout: 30000 },
      { waitUntil: 'load', timeout: 30000 },
      { waitUntil: 'networkidle0', timeout: 20000 },
    ];
    
    for (const strategy of strategies) {
      try {
        await page.goto(url, strategy);
        navigationSuccess = true;
        break;
      } catch (e) {
        console.log(`  ⚠ Strategy ${strategy.waitUntil} failed, trying next...`);
      }
    }
    
    if (!navigationSuccess) {
      console.log('  ⚠ All navigation strategies failed, continuing anyway...');
    }
    
    // Wait for page to fully load
    await page.waitForTimeout(5000);
    
    // Take screenshot for debugging
    const screenshotPath = 'houston-health-page.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  ✓ Screenshot saved: ${screenshotPath}`);
    
    // Try to find search elements - these will need to be updated based on actual website
    const searchSelectors = [
      'input[name="search"]',
      'input[name="restaurant"]',
      'input[name="name"]',
      'input[type="text"]',
      'input[id*="search"]',
      '#search',
      '.search-input',
    ];
    
    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput) {
          console.log(`  ✓ Found search input: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!searchInput) {
      console.log('  ⚠ Search input not found automatically');
      console.log('  → Please inspect the page and update selectors');
      console.log(`  → Screenshot saved at: ${screenshotPath}`);
      
      // Get page HTML for manual inspection
      const html = await page.content();
      const htmlPath = 'houston-health-page.html';
      fs.writeFileSync(htmlPath, html);
      console.log(`  → HTML saved at: ${htmlPath}`);
      
      return [];
    }
    
    // Type restaurant name
    await searchInput.type(restaurantName, { delay: 100 });
    await page.waitForTimeout(1000);
    
    // Find and click search button
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Search")',
      '.search-button',
      '#search-button',
    ];
    
    let searchButton = null;
    for (const selector of buttonSelectors) {
      try {
        searchButton = await page.$(selector);
        if (searchButton) {
          console.log(`  ✓ Found search button: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (searchButton) {
      await searchButton.click();
    } else {
      // Try pressing Enter
      await page.keyboard.press('Enter');
    }
    
    // Wait for results
    await page.waitForTimeout(5000);
    
    // Extract results
    const results = await page.evaluate(() => {
      const records = [];
      
      // Try common result container selectors
      const containerSelectors = [
        'table tbody tr',
        '.result-item',
        '.inspection-record',
        '.search-result',
        'table tr',
      ];
      
      for (const containerSelector of containerSelectors) {
        const items = document.querySelectorAll(containerSelector);
        if (items.length > 0) {
          console.log(`Found ${items.length} items with selector: ${containerSelector}`);
          
          items.forEach((item, index) => {
            const text = item.textContent.trim();
            if (text && text.length > 10) { // Filter out empty rows
              records.push({
                index: index + 1,
                text: text.substring(0, 200), // First 200 chars
                html: item.innerHTML.substring(0, 500), // First 500 chars of HTML
              });
            }
          });
          
          if (records.length > 0) break;
        }
      }
      
      return records;
    });
    
    console.log(`  ✓ Found ${results.length} potential result(s)`);
    
    if (results.length > 0) {
      console.log('\n  Sample results:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(`    ${i + 1}. ${r.text.substring(0, 100)}...`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return [];
  }
}

/**
 * Transform raw results to standardized format
 */
function transformResults(rawResults, restaurantName) {
  // This is a placeholder - actual transformation depends on data structure
  return rawResults.map(result => ({
    restaurantName: restaurantName,
    rawData: result.text,
    extracted: {
      // These fields need to be extracted based on actual HTML structure
      name: null,
      address: null,
      score: null,
      grade: null,
      date: null,
      violations: null,
    },
    _raw: result,
  }));
}

/**
 * Main scraping function
 */
async function scrapeHouston(restaurantName = null) {
  if (!puppeteerAvailable) {
    console.log('Please install Puppeteer first:');
    console.log('  npm install puppeteer --save-dev\n');
    process.exit(1);
  }
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    ignoreHTTPSErrors: true,
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Houston Health Department Scraper');
    console.log('==================================\n');
    
    if (restaurantName) {
      // Search for specific restaurant
      const results = await searchHoustonRestaurant(page, restaurantName);
      
      if (results.length > 0) {
        const transformed = transformResults(results, restaurantName);
        
        const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = path.join(outputDir, `houston-test-${Date.now()}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(transformed, null, 2));
        console.log(`\n✓ Saved results to ${outputFile}`);
      }
      
    } else {
      // Load Houston buffets and search each
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
      
      console.log(`Found ${houstonBuffets.length} Houston buffets\n`);
      console.log('⚠ This will take a while. Progress will be saved incrementally.\n');
      
      const allResults = {};
      const progressFile = path.join(__dirname, '../..', 'data', 'health-inspections', '.houston-progress.json');
      
      // Load previous progress
      let progress = { completed: [], failed: [] };
      if (fs.existsSync(progressFile)) {
        progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        console.log(`Resuming: ${progress.completed.length} already completed\n`);
      }
      
      for (let i = 0; i < houstonBuffets.length; i++) {
        const buffet = houstonBuffets[i];
        
        if (progress.completed.includes(buffet.id)) {
          console.log(`[${i + 1}/${houstonBuffets.length}] ${buffet.name} - Already completed, skipping`);
          continue;
        }
        
        console.log(`[${i + 1}/${houstonBuffets.length}] ${buffet.name}`);
        
        try {
          const results = await searchHoustonRestaurant(page, buffet.name);
          
          if (results.length > 0) {
            allResults[buffet.id] = {
              buffet: {
                id: buffet.id,
                name: buffet.name,
                address: buffet.address?.full,
              },
              rawResults: results,
              transformed: transformResults(results, buffet.name),
            };
            progress.completed.push(buffet.id);
            console.log(`  ✓ Found ${results.length} result(s)`);
          } else {
            progress.failed.push({ id: buffet.id, name: buffet.name, reason: 'No results' });
            console.log(`  - No results found`);
          }
          
          // Save progress after each restaurant
          fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
          
          // Save results incrementally
          if (Object.keys(allResults).length > 0) {
            const outputFile = path.join(__dirname, '../..', 'data', 'health-inspections', 'houston-inspections-partial.json');
            fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
          }
          
          // Be respectful - wait between requests
          await page.waitForTimeout(3000);
          
        } catch (error) {
          progress.failed.push({ id: buffet.id, name: buffet.name, reason: error.message });
          console.error(`  ✗ Error: ${error.message}`);
        }
      }
      
      // Final save
      if (Object.keys(allResults).length > 0) {
        const outputFile = path.join(__dirname, '../..', 'data', 'health-inspections', 'houston-inspections.json');
        fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
        console.log(`\n✓ Saved ${Object.keys(allResults).length} results to ${outputFile}`);
      }
      
      console.log(`\nCompleted: ${progress.completed.length}`);
      console.log(`Failed: ${progress.failed.length}`);
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
  const restaurantName = process.argv[2] || null;
  scrapeHouston(restaurantName).catch(console.error);
}

module.exports = { scrapeHouston, searchHoustonRestaurant };

