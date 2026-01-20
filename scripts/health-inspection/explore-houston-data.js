/**
 * Explore Houston Open Data Portal
 * 
 * Searches for health inspection or restaurant data in Houston's open data portal
 * 
 * Usage:
 *   node scripts/health-inspection/explore-houston-data.js
 */

const https = require('https');

/**
 * Search Houston open data portal
 */
async function searchHoustonData() {
  console.log('Exploring Houston Open Data Portal');
  console.log('==================================\n');
  
  // Houston uses Socrata for open data
  const baseUrl = 'https://data.houstontx.gov';
  
  // Try to find datasets related to health/food/restaurant
  const searchTerms = ['health', 'inspection', 'restaurant', 'food', 'permit'];
  
  for (const term of searchTerms) {
    try {
      console.log(`Searching for: ${term}`);
      
      const url = `${baseUrl}/api/search/views?query=${encodeURIComponent(term)}&limit=10`;
      
      const data = await new Promise((resolve, reject) => {
        https.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve(null);
            }
          });
        }).on('error', reject);
      });
      
      if (data && data.results) {
        console.log(`  Found ${data.results.length} dataset(s):\n`);
        data.results.slice(0, 5).forEach((dataset, i) => {
          console.log(`  ${i + 1}. ${dataset.name}`);
          console.log(`     ID: ${dataset.id}`);
          if (dataset.description) {
            console.log(`     ${dataset.description.substring(0, 100)}...`);
          }
          console.log('');
        });
        
        // Look for health inspection specific datasets
        const healthDatasets = data.results.filter(d => 
          d.name.toLowerCase().includes('inspection') ||
          d.name.toLowerCase().includes('restaurant') ||
          d.name.toLowerCase().includes('food') ||
          d.description?.toLowerCase().includes('inspection')
        );
        
        if (healthDatasets.length > 0) {
          console.log(`  ⭐ Found ${healthDatasets.length} relevant dataset(s)!`);
          healthDatasets.forEach(d => {
            console.log(`\n  Dataset: ${d.name}`);
            console.log(`  ID: ${d.id}`);
            console.log(`  URL: ${baseUrl}/resource/${d.id}.json`);
            console.log(`  Try: curl "${baseUrl}/resource/${d.id}.json?\\$limit=10"`);
          });
        }
      } else {
        console.log('  No results found\n');
      }
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`  Error: ${error.message}\n`);
    }
  }
  
  console.log('\n💡 If you find a relevant dataset:');
  console.log('  1. Note the dataset ID');
  console.log('  2. Access data via: https://data.houstontx.gov/resource/{ID}.json');
  console.log('  3. Update fetch script to use this endpoint');
}

// Run if called directly
if (require.main === module) {
  searchHoustonData().catch(console.error);
}

module.exports = { searchHoustonData };
















