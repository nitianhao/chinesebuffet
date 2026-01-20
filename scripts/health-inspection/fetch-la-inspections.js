/**
 * Los Angeles County Restaurant Inspection Data Fetcher
 * 
 * Attempts to fetch health inspection data from LA County
 * Note: LA County data may require scraping or different API endpoints
 * 
 * Usage:
 *   node scripts/health-inspection/fetch-la-inspections.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Try multiple potential LA County data sources
const LA_DATA_SOURCES = [
  {
    name: 'LA County Open Data',
    endpoint: 'https://data.lacounty.gov/resource/restaurant-inspections.json',
    type: 'socrata',
  },
  {
    name: 'Data.gov LA',
    endpoint: 'https://catalog.data.gov/dataset/restaurant-and-market-health-inspections',
    type: 'web',
  },
];

/**
 * Try to fetch from LA County Socrata API
 */
async function tryLACountySocrata() {
  const endpoint = 'https://data.lacounty.gov/resource/restaurant-inspections.json';
  const query = `$limit=5000&$where=UPPER(business_name) LIKE '%CHINESE%' OR UPPER(business_name) LIKE '%BUFFET%'&$order=inspection_date DESC`;
  const url = `${endpoint}?${query}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`API returned ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Attempting to fetch LA County inspection data...');
    
    try {
      const inspections = await tryLACountySocrata();
      console.log(`  Found ${inspections.length} records`);
      
      if (inspections.length > 0) {
        // Save results
        const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = path.join(outputDir, 'la-inspections.json');
        fs.writeFileSync(outputFile, JSON.stringify(inspections, null, 2));
        console.log(`✓ Saved to ${outputFile}`);
      }
    } catch (error) {
      console.log(`  LA County Socrata API not available: ${error.message}`);
      console.log('\n⚠ LA County data requires web scraping or different API endpoint.');
      console.log('  See: https://www.publichealth.lacounty.gov/rating/');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tryLACountySocrata };
















