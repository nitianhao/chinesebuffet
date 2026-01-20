/**
 * Alternative Houston Scraper
 * 
 * Uses a different approach - tries to find direct API endpoints
 * or uses simpler HTTP requests with better error handling
 * 
 * Usage:
 *   node scripts/health-inspection/scrape-houston-alternative.js [restaurant-name]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * Try to find Houston health inspection data via different methods
 */
async function searchHoustonAlternative(restaurantName) {
  console.log(`Searching for: ${restaurantName}\n`);
  
  // Method 1: Try Houston's open data portal with different endpoints
  const dataPortalEndpoints = [
    'https://data.houstontx.gov/api/views',
    'https://data.houstontx.gov/api/catalog/v1',
    'https://data.houstontx.gov/api/search/views?query=health+inspection',
    'https://data.houstontx.gov/api/search/views?query=restaurant',
    'https://data.houstontx.gov/api/search/views?query=food+permit',
  ];
  
  console.log('Method 1: Checking Houston Open Data Portal...');
  for (const endpoint of dataPortalEndpoints) {
    try {
      const data = await httpRequest(endpoint);
      if (data && typeof data === 'object') {
        console.log(`  ✓ Found data at: ${endpoint}`);
        if (data.results && data.results.length > 0) {
          console.log(`  Found ${data.results.length} datasets`);
          const relevant = data.results.filter(d => 
            d.name?.toLowerCase().includes('health') ||
            d.name?.toLowerCase().includes('inspection') ||
            d.name?.toLowerCase().includes('restaurant') ||
            d.name?.toLowerCase().includes('food')
          );
          if (relevant.length > 0) {
            console.log(`  ⭐ Found ${relevant.length} relevant dataset(s)!`);
            relevant.forEach(d => {
              console.log(`    - ${d.name} (ID: ${d.id || d.resource?.id})`);
            });
            return { method: 'api', data: relevant };
          }
        }
      }
    } catch (e) {
      // Continue to next endpoint
    }
  }
  
  // Method 2: Try direct search on health department website (simpler approach)
  console.log('\nMethod 2: Trying direct website access...');
  try {
    const healthDeptUrl = 'https://www.houstontx.gov/health/FoodService/index.html';
    const response = await httpRequest(healthDeptUrl, { timeout: 15000 });
    
    if (response && response.html) {
      console.log(`  ✓ Page loaded (${response.html.length} bytes)`);
      
      // Save for inspection
      fs.writeFileSync('houston-health-simple.html', response.html);
      console.log(`  ✓ Saved HTML to houston-health-simple.html`);
      
      // Try to find search form or API endpoints in HTML
      const apiMatches = response.html.match(/["']([^"']*\/api\/[^"']*)["']/gi);
      const jsonMatches = response.html.match(/["']([^"']*\.json[^"']*)["']/gi);
      
      if (apiMatches && apiMatches.length > 0) {
        console.log(`  ⭐ Found ${apiMatches.length} potential API endpoint(s) in HTML`);
        apiMatches.slice(0, 5).forEach(match => {
          console.log(`    - ${match}`);
        });
      }
      
      if (jsonMatches && jsonMatches.length > 0) {
        console.log(`  ⭐ Found ${jsonMatches.length} potential JSON endpoint(s)`);
        jsonMatches.slice(0, 5).forEach(match => {
          console.log(`    - ${match}`);
        });
      }
      
      // Check if it's a simple HTML page we can parse
      if (response.html.includes('<form') || response.html.includes('search')) {
        console.log(`  → Page contains search form - may need Puppeteer`);
        return { method: 'html', needsPuppeteer: true, html: response.html };
      }
    }
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  
  // Method 3: Try Harris County (Houston is in Harris County)
  console.log('\nMethod 3: Checking Harris County...');
  try {
    const harrisCountyUrl = 'https://www.harriscountyhealth.org';
    const response = await httpRequest(harrisCountyUrl, { timeout: 10000 });
    if (response && response.html) {
      console.log(`  ✓ Harris County site accessible`);
      // Could search here too
    }
  } catch (e) {
    console.log(`  ✗ Harris County not accessible`);
  }
  
  return { method: 'none', message: 'No accessible data source found' };
}

/**
 * HTTP request helper
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json, text/html, */*',
        },
        timeout: options.timeout || 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            // Try to parse as JSON
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            // Return as HTML/text
            resolve({ html: data, statusCode: res.statusCode });
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Main function
 */
async function main() {
  const restaurantName = process.argv[2] || 'China Star Buffet';
  
  console.log('Houston Health Inspection - Alternative Search');
  console.log('==============================================\n');
  
  const result = await searchHoustonAlternative(restaurantName);
  
  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  console.log(`Method used: ${result.method}`);
  
  if (result.method === 'api' && result.data) {
    console.log(`\n✅ Found API endpoints! Next steps:`);
    console.log(`  1. Use dataset ID to fetch data`);
    console.log(`  2. Create fetcher similar to NYC script`);
    console.log(`  3. Format: https://data.houstontx.gov/resource/{ID}.json`);
  } else if (result.method === 'html' && result.needsPuppeteer) {
    console.log(`\n⚠ Website requires JavaScript (Puppeteer needed)`);
    console.log(`  Use: scrape-houston-working.js instead`);
  } else {
    console.log(`\n💡 Recommendations:`);
    console.log(`  1. Check houston-health-simple.html for structure`);
    console.log(`  2. Try manual search on website`);
    console.log(`  3. Consider third-party service (Foodspark, etc.)`);
    console.log(`  4. Use manual entry template`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { searchHoustonAlternative };
















