/**
 * Explore Houston Open Data API
 * 
 * Searches Houston's open data portal for health inspection datasets
 * 
 * Usage:
 *   node scripts/health-inspection/explore-houston-api.js
 */

const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

async function exploreHoustonAPI() {
  console.log('Exploring Houston Open Data Portal API');
  console.log('=====================================\n');
  
  // Try catalog endpoint
  console.log('1. Checking catalog...');
  try {
    const catalog = await httpGet('https://data.houstontx.gov/api/catalog/v1?limit=100');
    if (catalog && catalog.result && catalog.result.results) {
      console.log(`   Found ${catalog.result.results.length} total datasets\n`);
      
      // Filter for health/restaurant related
      const relevant = catalog.result.results.filter(d => {
        const name = (d.resource?.name || '').toLowerCase();
        const desc = (d.resource?.description || '').toLowerCase();
        return name.includes('health') || name.includes('inspection') || 
               name.includes('restaurant') || name.includes('food') ||
               desc.includes('health') || desc.includes('inspection');
      });
      
      if (relevant.length > 0) {
        console.log(`   ⭐ Found ${relevant.length} relevant dataset(s):\n`);
        relevant.forEach((d, i) => {
          const resource = d.resource;
          console.log(`   ${i + 1}. ${resource.name || 'Unnamed'}`);
          console.log(`      ID: ${resource.id}`);
          if (resource.description) {
            console.log(`      ${resource.description.substring(0, 100)}...`);
          }
          console.log(`      URL: https://data.houstontx.gov/resource/${resource.id}.json`);
          console.log('');
        });
      } else {
        console.log('   No health/restaurant datasets found in catalog\n');
      }
    }
  } catch (e) {
    console.log(`   Error: ${e.message}\n`);
  }
  
  // Try search endpoint
  console.log('2. Searching for "health inspection"...');
  try {
    const search1 = await httpGet('https://data.houstontx.gov/api/search/views?query=health+inspection&limit=20');
    if (search1 && search1.results) {
      console.log(`   Found ${search1.results.length} result(s)\n`);
      search1.results.slice(0, 5).forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.name}`);
        console.log(`      ID: ${d.id}`);
        if (d.description) {
          console.log(`      ${d.description.substring(0, 80)}...`);
        }
        console.log('');
      });
    }
  } catch (e) {
    console.log(`   Error: ${e.message}\n`);
  }
  
  console.log('3. Searching for "restaurant"...');
  try {
    const search2 = await httpGet('https://data.houstontx.gov/api/search/views?query=restaurant&limit=20');
    if (search2 && search2.results) {
      console.log(`   Found ${search2.results.length} result(s)\n`);
      search2.results.slice(0, 5).forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.name}`);
        console.log(`      ID: ${d.id}`);
        console.log('');
      });
    }
  } catch (e) {
    console.log(`   Error: ${e.message}\n`);
  }
  
  console.log('4. Searching for "food permit"...');
  try {
    const search3 = await httpGet('https://data.houstontx.gov/api/search/views?query=food+permit&limit=20');
    if (search3 && search3.results) {
      console.log(`   Found ${search3.results.length} result(s)\n`);
      search3.results.slice(0, 5).forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.name}`);
        console.log(`      ID: ${d.id}`);
        console.log('');
      });
    }
  } catch (e) {
    console.log(`   Error: ${e.message}\n`);
  }
  
  console.log('\n💡 If you find a relevant dataset:');
  console.log('  1. Note the dataset ID');
  console.log('  2. Test access: curl "https://data.houstontx.gov/resource/{ID}.json?$limit=10"');
  console.log('  3. Create fetcher script similar to fetch-nyc-inspections.js');
}

if (require.main === module) {
  exploreHoustonAPI().catch(console.error);
}

module.exports = { exploreHoustonAPI };
















