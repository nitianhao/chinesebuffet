/**
 * Find Direct Menu URLs on Restaurant Websites (No Apify Required!)
 * 
 * This script reads website URLs from your database/JSON and finds menu links.
 * No Apify needed - just local HTTP requests and Cheerio parsing.
 * 
 * Cost: $0.00 (completely free!)
 * 
 * Usage:
 *   node scripts/find-menu-urls-from-websites.js
 *   node scripts/find-menu-urls-from-websites.js --source json
 *   node scripts/find-menu-urls-from-websites.js --source db
 *   node scripts/find-menu-urls-from-websites.js --limit 10
 *   node scripts/find-menu-urls-from-websites.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');

// Configuration
const CONFIG = {
  // Input sources
  jsonFile: path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json'),
  outputFile: path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json'),
  resultsFile: path.join(__dirname, '../data/menu-urls-found.json'),
  
  // Menu URL patterns to try (in order)
  menuUrlPatterns: [
    '/menu',
    '/menus',
    '/menu.html',
    '/menus.html',
    '/#menu',
    '/menu.pdf',
    '/food-menu',
    '/our-menu',
    '/dining-menu',
  ],
  
  // HTTP request settings
  requestTimeout: 10000,
  delayBetweenRequests: 500, // Be respectful to servers
  maxRetries: 2,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SOURCE = args.find(arg => arg.startsWith('--source'))?.split('=')[1] || 'json';
const LIMIT = args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || null;

/**
 * Extract website URLs from JSON file
 */
function getWebsitesFromJson() {
  console.log(`📖 Loading restaurants from: ${CONFIG.jsonFile}`);
  const data = JSON.parse(fs.readFileSync(CONFIG.jsonFile, 'utf8'));
  const restaurants = Object.values(data);
  
  const results = [];
  
  for (const r of restaurants) {
    // Check if already has menu URL
    const yelp = r.yelp || {};
    const details = yelp.details || {};
    const existingMenuUrl = details.menu_url || '';
    
    if (existingMenuUrl && existingMenuUrl.trim()) {
      continue; // Skip if already has menu URL
    }
    
    // Try to find website URL in various locations
    let website = null;
    
    // Check yelp.details.website
    if (details.website) {
      website = details.website;
    }
    // Check yelp.details.attributes.website
    else if (details.attributes && details.attributes.website) {
      website = details.attributes.website;
    }
    // Check root level website (if exists)
    else if (r.website) {
      website = r.website;
    }
    
    if (website && website.trim()) {
      results.push({
        buffetId: r.buffetId,
        buffetName: r.buffetName,
        website: website.trim(),
        restaurant: r,
      });
    }
  }
  
  console.log(`📊 Total restaurants: ${restaurants.length}`);
  console.log(`📊 Restaurants with websites: ${results.length}`);
  console.log(`📊 Needing menu URLs: ${results.length}`);
  
  return results;
}

/**
 * Extract website URLs from InstantDB
 */
async function getWebsitesFromDb() {
  console.log(`📖 Loading restaurants from InstantDB...`);
  
  // You'll need to implement this based on your InstantDB setup
  // This is a placeholder - adjust based on your actual DB access
  const { init } = require('@instantdb/admin');
  const schema = require('../src/instant.schema').default;
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN required for database access');
  }
  
  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema,
  });
  
  const result = await db.query({
    buffets: {
      $: {
        limit: 10000,
      },
      website: true,
      placeId: true,
      name: true,
    }
  });
  
  const buffets = result.buffets || [];
  const results = [];
  
  for (const buffet of buffets) {
    if (buffet.website && buffet.website.trim()) {
      results.push({
        buffetId: buffet.placeId || buffet.id,
        buffetName: buffet.name,
        website: buffet.website.trim(),
        buffet: buffet,
      });
    }
  }
  
  console.log(`📊 Total buffets: ${buffets.length}`);
  console.log(`📊 Buffets with websites: ${results.length}`);
  
  return results;
}

/**
 * Check if a URL exists (HTTP HEAD request)
 */
function checkUrlExists(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'HEAD',
        headers: {
          'User-Agent': CONFIG.userAgent,
        },
        timeout: 5000,
      };
      
      const req = client.request(options, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Fetch HTML from a URL
 */
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': CONFIG.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: CONFIG.requestTimeout,
      };
      
      const req = client.request(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve(data);
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Find menu URL on a website
 */
async function findMenuUrlOnWebsite(websiteUrl) {
  if (!websiteUrl || !websiteUrl.trim()) {
    return null;
  }
  
  // Normalize URL
  let baseUrl = websiteUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  
  baseUrl = baseUrl.replace(/\/$/, '');
  
  // First, try common menu URL patterns (quick check)
  for (const pattern of CONFIG.menuUrlPatterns) {
    const menuUrl = baseUrl + pattern;
    const exists = await checkUrlExists(menuUrl);
    if (exists) {
      return menuUrl;
    }
  }
  
  // If patterns don't work, scrape the homepage to find menu links
  try {
    const html = await fetchHtml(baseUrl);
    const $ = cheerio.load(html);
    
    // Find all links
    const menuLinks = [];
    
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().toLowerCase();
      
      if (!href) return;
      
      // Check if link text or URL contains "menu"
      const hrefLower = href.toLowerCase();
      if (text.includes('menu') || hrefLower.includes('menu')) {
        // Resolve relative URLs
        let fullUrl;
        try {
          fullUrl = new URL(href, baseUrl).href;
        } catch {
          return;
        }
        
        menuLinks.push({
          url: fullUrl,
          text: $(elem).text(),
          href: href,
        });
      }
    });
    
    // Sort by relevance (exact "menu" matches first)
    menuLinks.sort((a, b) => {
      const aScore = (a.href.toLowerCase().includes('/menu') ? 10 : 0) + 
                     (a.text.toLowerCase() === 'menu' ? 5 : 0) +
                     (a.text.toLowerCase().includes('view menu') ? 3 : 0);
      const bScore = (b.href.toLowerCase().includes('/menu') ? 10 : 0) + 
                     (b.text.toLowerCase() === 'menu' ? 5 : 0) +
                     (b.text.toLowerCase().includes('view menu') ? 3 : 0);
      return bScore - aScore;
    });
    
    // Return the most relevant menu link
    if (menuLinks.length > 0) {
      return menuLinks[0].url;
    }
  } catch (error) {
    // Website might be down or blocking requests
    console.warn(`⚠️  Could not scrape ${baseUrl}: ${error.message}`);
  }
  
  return null;
}

/**
 * Update restaurant data with menu URLs
 */
function updateRestaurants(menuUrlResults, sourceData) {
  console.log(`\n📝 Updating restaurant data with menu URLs...`);
  
  if (SOURCE === 'json') {
    const data = JSON.parse(fs.readFileSync(CONFIG.jsonFile, 'utf8'));
    const resultsMap = new Map();
    
    menuUrlResults.forEach(result => {
      if (result.menuUrl) {
        resultsMap.set(result.buffetId, result.menuUrl);
      }
    });
    
    let updatedCount = 0;
    
    Object.keys(data).forEach(buffetId => {
      const menuUrl = resultsMap.get(buffetId);
      if (menuUrl) {
        const restaurant = data[buffetId];
        if (restaurant && restaurant.yelp && restaurant.yelp.details) {
          restaurant.yelp.details.menu_url = menuUrl;
          updatedCount++;
        }
      }
    });
    
    console.log(`✅ Updated ${updatedCount} restaurants with menu URLs`);
    return { data, updatedCount };
  } else {
    // For DB source, you'd update InstantDB here
    console.log(`✅ Found ${menuUrlResults.filter(r => r.menuUrl).length} menu URLs`);
    console.log(`   (DB updates would need to be implemented separately)`);
    return { data: null, updatedCount: menuUrlResults.filter(r => r.menuUrl).length };
  }
}

/**
 * Save updated data
 */
function saveData(data, outputFile) {
  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would save data to: ${outputFile}`);
    return;
  }
  
  if (!data) return; // Skip if DB source
  
  const backupFile = outputFile + '.backup.' + Date.now();
  console.log(`💾 Creating backup: ${backupFile}`);
  fs.copyFileSync(outputFile, backupFile);
  
  console.log(`💾 Saving updated data to: ${outputFile}`);
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  console.log(`✅ Data saved successfully`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Finding Direct Menu URLs on Restaurant Websites (No Apify Required!)\n');
  console.log(`📋 Configuration:`);
  console.log(`   Source: ${SOURCE}`);
  console.log(`   Dry Run: ${DRY_RUN}`);
  console.log(`   Limit: ${LIMIT || 'None'}`);
  console.log(`   Cost: $0.00 (completely free!)\n`);
  
  try {
    // Get websites from source
    let websitesData = [];
    
    if (SOURCE === 'json') {
      websitesData = getWebsitesFromJson();
    } else if (SOURCE === 'db') {
      websitesData = await getWebsitesFromDb();
    } else {
      throw new Error(`Unknown source: ${SOURCE}. Use 'json' or 'db'`);
    }
    
    if (websitesData.length === 0) {
      console.log('✅ All restaurants already have menu URLs or no websites found!');
      return;
    }
    
    // Apply limit if specified
    if (LIMIT) {
      const limit = parseInt(LIMIT);
      console.log(`🔢 Limiting to first ${limit} restaurants`);
      websitesData = websitesData.slice(0, limit);
    }
    
    console.log(`\n🔍 Finding menu URLs on ${websitesData.length} websites...\n`);
    
    // Find menu URLs
    const results = [];
    
    for (let i = 0; i < websitesData.length; i++) {
      const item = websitesData[i];
      
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`🔄 Progress: ${i + 1}/${websitesData.length}...`);
      }
      
      if (DRY_RUN) {
        results.push({
          ...item,
          menuUrl: `${item.website}/menu`,
        });
      } else {
        try {
          const menuUrl = await findMenuUrlOnWebsite(item.website);
          results.push({
            ...item,
            menuUrl,
          });
          
          // Delay between requests
          if (i < websitesData.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
          }
        } catch (error) {
          console.warn(`⚠️  Error finding menu for ${item.buffetName}: ${error.message}`);
          results.push({
            ...item,
            menuUrl: null,
          });
        }
      }
    }
  
    // Save results
    fs.writeFileSync(CONFIG.resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Saved results to: ${CONFIG.resultsFile}`);
    
    // Update restaurants
    const { data, updatedCount } = updateRestaurants(results, websitesData);
    
    // Save data (if JSON source)
    if (data) {
      saveData(data, CONFIG.outputFile);
    }
    
    // Summary
    console.log(`\n✅ Process Complete!`);
    console.log(`   Websites checked: ${results.length}`);
    console.log(`   Menu URLs found: ${results.filter(r => r.menuUrl).length}`);
    console.log(`   Success rate: ${((results.filter(r => r.menuUrl).length / results.length) * 100).toFixed(1)}%`);
    console.log(`   Updated in ${SOURCE === 'json' ? 'JSON' : 'database'}: ${updatedCount}`);
    console.log(`\n💰 Cost: $0.00 (completely free - no Apify needed!)`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, findMenuUrlOnWebsite };
