/**
 * Data Source Finder
 * 
 * Attempts to find open data portals and APIs for health inspection data
 * Checks common patterns and endpoints
 * 
 * Usage:
 *   node scripts/health-inspection/find-data-sources.js [city|state]
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const COMMON_PATTERNS = [
  // Open data portals
  'https://data.{city}.gov',
  'https://{city}.opendata.arcgis.com',
  'https://{city}.socrata.com',
  'https://data.{county}.gov',
  
  // API endpoints
  'https://{city}.gov/api/health',
  'https://{city}.gov/api/inspections',
  'https://{city}.gov/data/inspections.json',
  
  // Health department specific
  'https://{city}.gov/health/api',
  'https://health.{city}.gov/api',
];

const CITIES = {
  houston: {
    name: 'Houston',
    state: 'TX',
    county: 'Harris',
    domains: ['houstontx.gov', 'houston.gov', 'harriscounty.gov'],
  },
  dallas: {
    name: 'Dallas',
    state: 'TX',
    county: 'Dallas',
    domains: ['dallascounty.org', 'dallas.gov'],
  },
  austin: {
    name: 'Austin',
    state: 'TX',
    county: 'Travis',
    domains: ['austintexas.gov', 'traviscountytx.gov'],
  },
};

/**
 * Test URL accessibility
 */
async function testUrl(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 5000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            accessible: res.statusCode === 200,
            size: data.length,
            contentType: res.headers['content-type'],
            isJson: res.headers['content-type']?.includes('json'),
          });
        });
      });
      
      req.on('error', () => resolve({ accessible: false, error: true }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ accessible: false, timeout: true });
      });
    } catch (e) {
      resolve({ accessible: false, error: e.message });
    }
  });
}

/**
 * Generate potential URLs for a city
 */
function generateUrls(cityConfig) {
  const urls = [];
  
  // Try each domain
  cityConfig.domains.forEach(domain => {
    // Open data patterns
    urls.push(`https://data.${domain}`);
    urls.push(`https://${domain}/data`);
    urls.push(`https://${domain}/opendata`);
    
    // API patterns
    urls.push(`https://${domain}/api/health`);
    urls.push(`https://${domain}/api/inspections`);
    urls.push(`https://${domain}/api/restaurant-inspections`);
    urls.push(`https://${domain}/data/inspections.json`);
    urls.push(`https://${domain}/data/restaurant-inspections.json`);
    
    // Socrata patterns
    urls.push(`https://${domain.replace('.gov', '').replace('.org', '')}.socrata.com`);
  });
  
  return urls;
}

/**
 * Search for data sources
 */
async function findDataSources(cityKey = null) {
  const citiesToCheck = cityKey 
    ? [CITIES[cityKey.toLowerCase()]].filter(Boolean)
    : Object.values(CITIES);
  
  if (citiesToCheck.length === 0) {
    console.log('Available cities:', Object.keys(CITIES).join(', '));
    return;
  }
  
  console.log('Searching for Health Inspection Data Sources');
  console.log('='.repeat(60) + '\n');
  
  for (const city of citiesToCheck) {
    console.log(`\n${city.name}, ${city.state}`);
    console.log('-'.repeat(60));
    
    const urls = generateUrls(city);
    const results = [];
    
    for (const url of urls) {
      process.stdout.write(`  Testing ${url}... `);
      const result = await testUrl(url);
      
      if (result.accessible) {
        console.log(`✓ Accessible (${result.status})`);
        if (result.isJson) {
          console.log(`    ⭐ JSON endpoint found!`);
        }
        results.push({ url, ...result });
      } else if (result.timeout) {
        console.log('⏱ Timeout');
      } else {
        console.log('✗ Not accessible');
      }
      
      // Small delay to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (results.length > 0) {
      console.log(`\n  Found ${results.length} accessible endpoint(s):`);
      results.forEach(r => {
        console.log(`    - ${r.url}`);
        if (r.isJson) {
          console.log(`      → JSON API endpoint!`);
        }
      });
    } else {
      console.log(`\n  ⚠ No accessible endpoints found`);
      console.log(`  → Will need web scraping`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary:');
  console.log('  - Checked common open data patterns');
  console.log('  - Tested API endpoints');
  console.log('  - If no results, web scraping required');
  console.log('\n💡 Next steps:');
  console.log('  1. Manually check city open data portals');
  console.log('  2. Contact health departments for API access');
  console.log('  3. Implement web scraping (see WEB_SCRAPING_GUIDE.md)');
}

// Run if called directly
if (require.main === module) {
  const city = process.argv[2];
  findDataSources(city).catch(console.error);
}

module.exports = { findDataSources, testUrl, CITIES };
















