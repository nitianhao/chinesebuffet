/**
 * Generic Health Department Scraper Framework
 * 
 * A flexible scraper that can be adapted for different health department websites
 * Supports both HTTP requests and browser automation
 * 
 * Usage:
 *   node scripts/health-inspection/scrape-generic.js <city> [restaurant-name]
 */

const fs = require('fs');
const path = require('path');

// City configurations
const CITY_CONFIGS = {
  houston: {
    name: 'Houston',
    state: 'TX',
    searchUrl: 'https://www.houstontx.gov/health/FoodService/index.html',
    method: 'http', // or 'puppeteer'
    selectors: {
      searchInput: 'input[name="search"], input[id*="search"]',
      searchButton: 'button[type="submit"], input[type="submit"]',
      resultsContainer: 'table, .results, .inspection-results',
      resultItem: 'tr, .result-item, .inspection-record',
    },
    dataMapping: {
      name: '.name, td:nth-child(1)',
      address: '.address, td:nth-child(2)',
      score: '.score, td:nth-child(3)',
      date: '.date, td:nth-child(4)',
      violations: '.violations, td:nth-child(5)',
    },
  },
  dallas: {
    name: 'Dallas',
    state: 'TX',
    searchUrl: 'https://www.dallascounty.org/departments/dchhs/food-safety.php',
    method: 'http',
    selectors: {},
  },
  austin: {
    name: 'Austin',
    state: 'TX',
    searchUrl: 'https://www.austintexas.gov/department/environmental-health-services',
    method: 'http',
    selectors: {},
  },
};

/**
 * HTTP-based search (simple requests)
 */
async function searchHttp(config, restaurantName) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(config.searchUrl);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    };
    
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, html: data });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Browser automation search (Puppeteer)
 */
async function searchPuppeteer(config, restaurantName) {
  try {
    const puppeteer = require('puppeteer');
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    await page.goto(config.searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Try to find and fill search form
    if (config.selectors.searchInput) {
      await page.waitForSelector(config.selectors.searchInput, { timeout: 5000 });
      await page.type(config.selectors.searchInput, restaurantName);
      
      if (config.selectors.searchButton) {
        await page.click(config.selectors.searchButton);
      } else {
        await page.keyboard.press('Enter');
      }
      
      await page.waitForTimeout(3000);
    }
    
    // Extract results
    const results = await page.evaluate((selectors, dataMapping) => {
      const records = [];
      const items = document.querySelectorAll(selectors.resultItem || 'tr');
      
      items.forEach(item => {
        const record = {};
        Object.entries(dataMapping).forEach(([field, selector]) => {
          const elem = item.querySelector(selector);
          if (elem) record[field] = elem.textContent.trim();
        });
        if (Object.keys(record).length > 0) {
          records.push(record);
        }
      });
      
      return records;
    }, config.selectors, config.dataMapping);
    
    await browser.close();
    return results;
    
  } catch (error) {
    if (error.message.includes('Cannot find module')) {
      console.log('⚠ Puppeteer not installed. Install with: npm install puppeteer');
      return [];
    }
    throw error;
  }
}

/**
 * Transform raw data to standardized format
 */
function transformToStandardFormat(rawData, cityConfig) {
  return {
    currentScore: rawData.score ? parseInt(rawData.score) : null,
    currentGrade: rawData.grade || null,
    inspectionDate: rawData.date || null,
    inspectorName: rawData.inspector || null,
    violations: rawData.violations ? parseViolations(rawData.violations) : [],
    criticalViolationsCount: countCriticalViolations(rawData.violations),
    generalViolationsCount: countGeneralViolations(rawData.violations),
    dataSource: `${cityConfig.name} Health Department`,
    lastUpdated: new Date().toISOString(),
    permitNumber: rawData.permitNumber || null,
    healthDepartmentUrl: cityConfig.searchUrl,
    _raw: rawData,
  };
}

function parseViolations(violationsText) {
  if (!violationsText) return [];
  // Basic parsing - can be enhanced
  return violationsText.split(',').map(v => ({
    description: v.trim(),
    category: v.toLowerCase().includes('critical') ? 'Critical' : 'General',
  }));
}

function countCriticalViolations(violationsText) {
  if (!violationsText) return 0;
  return (violationsText.match(/critical/gi) || []).length;
}

function countGeneralViolations(violationsText) {
  if (!violationsText) return 0;
  const total = violationsText.split(',').length;
  return total - countCriticalViolations(violationsText);
}

/**
 * Main scraping function
 */
async function scrapeCity(cityName, restaurantName = null) {
  const cityKey = cityName.toLowerCase();
  const config = CITY_CONFIGS[cityKey];
  
  if (!config) {
    console.error(`City "${cityName}" not configured. Available cities: ${Object.keys(CITY_CONFIGS).join(', ')}`);
    process.exit(1);
  }
  
  console.log(`${config.name} Health Department Scraper`);
  console.log('==========================================\n');
  
  try {
    let results = [];
    
    if (restaurantName) {
      // Search for specific restaurant
      console.log(`Searching for: ${restaurantName}\n`);
      
      if (config.method === 'puppeteer') {
        results = await searchPuppeteer(config, restaurantName);
      } else {
        const response = await searchHttp(config, restaurantName);
        console.log(`HTTP ${response.statusCode}`);
        console.log(`Page size: ${response.html.length} bytes`);
        // TODO: Parse HTML with cheerio or regex
        console.log('⚠ HTML parsing not yet implemented');
      }
      
    } else {
      // Load buffets for this city and search each
      const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
      if (!fs.existsSync(buffetsPath)) {
        console.error('Buffets file not found');
        process.exit(1);
      }
      
      const buffets = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
      const cityBuffets = Object.values(buffets).filter(b => 
        b.address?.stateAbbr === config.state && 
        b.address?.city?.toLowerCase() === cityKey
      );
      
      console.log(`Found ${cityBuffets.length} ${config.name} buffets\n`);
      
      const allResults = {};
      
      for (let i = 0; i < cityBuffets.length; i++) {
        const buffet = cityBuffets[i];
        console.log(`[${i + 1}/${cityBuffets.length}] ${buffet.name}`);
        
        try {
          let searchResults = [];
          
          if (config.method === 'puppeteer') {
            searchResults = await searchPuppeteer(config, buffet.name);
          } else {
            const response = await searchHttp(config, buffet.name);
            // TODO: Parse results
            console.log('  ⚠ HTTP parsing not yet implemented');
          }
          
          if (searchResults.length > 0) {
            allResults[buffet.id] = {
              buffet: {
                id: buffet.id,
                name: buffet.name,
                address: buffet.address?.full,
              },
              inspections: searchResults.map(r => transformToStandardFormat(r, config)),
            };
            console.log(`  ✓ Found ${searchResults.length} inspection(s)`);
          } else {
            console.log(`  - No results found`);
          }
          
          // Be respectful - wait between requests
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`  ✗ Error: ${error.message}`);
        }
      }
      
      if (Object.keys(allResults).length > 0) {
        const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = path.join(outputDir, `${cityKey}-inspections.json`);
        fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
        console.log(`\n✓ Saved ${Object.keys(allResults).length} results to ${outputFile}`);
      }
      
      results = allResults;
    }
    
    return results;
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const city = process.argv[2];
  const restaurant = process.argv[3] || null;
  
  if (!city) {
    console.log('Usage: node scrape-generic.js <city> [restaurant-name]');
    console.log('\nAvailable cities:');
    Object.keys(CITY_CONFIGS).forEach(key => {
      console.log(`  - ${key} (${CITY_CONFIGS[key].name})`);
    });
    process.exit(1);
  }
  
  scrapeCity(city, restaurant);
}

module.exports = { scrapeCity, CITY_CONFIGS };
















