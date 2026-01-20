/**
 * Find Direct Menu URLs on Restaurant Websites
 * 
 * Two-step process:
 * 1. Get website URLs from Yelp using tri_angle/yelp-scraper
 * 2. Scrape each website to find menu links
 * 
 * Cost: ~$5.84 - $6.13 for 5,703 restaurants
 * 
 * Usage:
 *   node scripts/find-menu-urls-on-websites.js
 *   node scripts/find-menu-urls-on-websites.js --step 1  # Only get websites
 *   node scripts/find-menu-urls-on-websites.js --step 2  # Only find menu links
 *   node scripts/find-menu-urls-on-websites.js --limit 10
 *   node scripts/find-menu-urls-on-websites.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const apify = require('../lib/apify-client');
const cheerio = require('cheerio');

// Configuration
const CONFIG = {
  inputFile: path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json'),
  outputFile: path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json'),
  websitesFile: path.join(__dirname, '../data/restaurant-websites.json'), // Intermediate file
  menuUrlsFile: path.join(__dirname, '../data/menu-urls-found.json'), // Results file
  
  // Apify actors
  yelpScraperActor: 'tri_angle/yelp-scraper',
  webScraperActor: 'apify/web-scraper', // For custom scraping, we'll use Cheerio directly
  
  // Batch processing
  batchSize: 50,
  delayBetweenBatches: 2000,
  delayBetweenRequests: 500, // Delay when scraping websites directly
  
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
  ],
  
  // HTTP request settings
  requestTimeout: 10000,
  maxRetries: 2,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STEP = args.find(arg => arg.startsWith('--step'))?.split('=')[1] || 'both';
const LIMIT = args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || null;
const BATCH_SIZE = args.find(arg => arg.startsWith('--batch-size'))?.split('=')[1] || CONFIG.batchSize;

/**
 * Load restaurants from JSON file
 */
function loadRestaurants() {
  console.log(`📖 Loading restaurants from: ${CONFIG.inputFile}`);
  const data = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf8'));
  const restaurants = Object.values(data);
  
  // Filter restaurants that need menu URLs
  const needingMenuUrls = restaurants.filter(r => {
    const yelp = r.yelp || {};
    const details = yelp.details || {};
    const menuUrl = details.menu_url || '';
    return !menuUrl || !menuUrl.trim();
  });
  
  console.log(`📊 Total restaurants: ${restaurants.length}`);
  console.log(`📊 Needing menu URLs: ${needingMenuUrls.length}`);
  
  if (LIMIT) {
    const limit = parseInt(LIMIT);
    console.log(`🔢 Limiting to first ${limit} restaurants`);
    return needingMenuUrls.slice(0, limit);
  }
  
  return needingMenuUrls;
}

/**
 * Step 1: Get website URLs from Yelp
 */
async function step1GetWebsites(restaurants) {
  console.log('\n🔍 Step 1: Getting website URLs from Yelp...\n');
  
  // Extract Yelp URLs
  const yelpData = restaurants.map(r => {
    const yelp = r.yelp || {};
    const yelpUrl = (yelp.url || '').split('?')[0]; // Remove query params
    return {
      buffetId: r.buffetId,
      buffetName: r.buffetName,
      yelpUrl,
      restaurant: r,
    };
  }).filter(item => item.yelpUrl);
  
  console.log(`📋 Found ${yelpData.length} restaurants with Yelp URLs`);
  
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would process ${yelpData.length} Yelp URLs`);
    return yelpData.map(item => ({
      ...item,
      website: 'https://example.com',
    }));
  }
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < yelpData.length; i += parseInt(BATCH_SIZE)) {
    batches.push(yelpData.slice(i, i + parseInt(BATCH_SIZE)));
  }
  
  console.log(`📦 Processing ${batches.length} batches through Apify...\n`);
  
  const allResults = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`🔄 Batch ${i + 1}/${batches.length} (${batch.length} restaurants)...`);
    
    const input = {
      directUrls: batch.map(item => item.yelpUrl),
    };
    
    try {
      const result = await apify.runActor(CONFIG.yelpScraperActor, input, {
        waitForFinish: true,
        timeout: 600000,
      });
      
      console.log(`✅ Batch ${i + 1} completed (Run ID: ${result.runId})`);
      
      // Map results back
      const resultsMap = new Map();
      result.items.forEach(item => {
        if (item.directUrl) {
          resultsMap.set(item.directUrl, item);
        }
      });
      
      const batchResults = batch.map(item => {
        const apifyResult = resultsMap.get(item.yelpUrl);
        return {
          ...item,
          website: apifyResult?.website || null,
          apifyResult,
        };
      });
      
      allResults.push(...batchResults);
      
      // Delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
      }
    } catch (error) {
      console.error(`❌ Error in batch ${i + 1}:`, error.message);
      // Continue with next batch
      batch.forEach(item => {
        allResults.push({ ...item, website: null });
      });
    }
  }
  
  // Save intermediate results
  const websitesData = allResults.map(r => ({
    buffetId: r.buffetId,
    buffetName: r.buffetName,
    website: r.website,
    yelpUrl: r.yelpUrl,
  }));
  
  fs.writeFileSync(CONFIG.websitesFile, JSON.stringify(websitesData, null, 2));
  console.log(`\n💾 Saved website URLs to: ${CONFIG.websitesFile}`);
  
  return allResults;
}

/**
 * Fetch HTML from a URL
 */
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
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
  });
}

/**
 * Check if a URL exists (HTTP HEAD request)
 */
function checkUrlExists(url) {
  return new Promise((resolve) => {
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
                     (a.text.toLowerCase() === 'menu' ? 5 : 0);
      const bScore = (b.href.toLowerCase().includes('/menu') ? 10 : 0) + 
                     (b.text.toLowerCase() === 'menu' ? 5 : 0);
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
 * Step 2: Find menu URLs on websites
 */
async function step2FindMenuUrls(websitesData) {
  console.log('\n🔍 Step 2: Finding menu URLs on restaurant websites...\n');
  
  const restaurantsWithWebsites = websitesData.filter(r => r.website);
  console.log(`📋 Found ${restaurantsWithWebsites.length} restaurants with websites`);
  
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would check ${restaurantsWithWebsites.length} websites`);
    return restaurantsWithWebsites.map(r => ({
      ...r,
      menuUrl: `${r.website}/menu`,
    }));
  }
  
  const results = [];
  
  for (let i = 0; i < restaurantsWithWebsites.length; i++) {
    const item = restaurantsWithWebsites[i];
    
    if ((i + 1) % 10 === 0) {
      console.log(`🔄 Progress: ${i + 1}/${restaurantsWithWebsites.length}...`);
    }
    
    try {
      const menuUrl = await findMenuUrlOnWebsite(item.website);
      results.push({
        ...item,
        menuUrl,
      });
      
      // Delay between requests
      if (i < restaurantsWithWebsites.length - 1) {
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
  
  // Save results
  fs.writeFileSync(CONFIG.menuUrlsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved menu URLs to: ${CONFIG.menuUrlsFile}`);
  
  return results;
}

/**
 * Update restaurant data with menu URLs
 */
function updateRestaurants(menuUrlResults) {
  console.log(`\n📝 Updating restaurant data with menu URLs...`);
  
  const data = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf8'));
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
}

/**
 * Save updated data
 */
function saveData(data, outputFile) {
  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would save data to: ${outputFile}`);
    return;
  }
  
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
  console.log('🚀 Finding Direct Menu URLs on Restaurant Websites\n');
  console.log(`📋 Configuration:`);
  console.log(`   Step: ${STEP}`);
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log(`   Dry Run: ${DRY_RUN}`);
  console.log(`   Limit: ${LIMIT || 'None'}`);
  console.log('');
  
  try {
    const restaurants = loadRestaurants();
    
    if (restaurants.length === 0) {
      console.log('✅ All restaurants already have menu URLs!');
      return;
    }
    
    let websitesData = [];
    let menuUrlResults = [];
    
    // Step 1: Get websites
    if (STEP === 'both' || STEP === '1') {
      // Check if we have saved website data
      if (fs.existsSync(CONFIG.websitesFile) && STEP === 'both') {
        console.log(`📖 Loading saved website URLs from: ${CONFIG.websitesFile}`);
        websitesData = JSON.parse(fs.readFileSync(CONFIG.websitesFile, 'utf8'));
      } else {
        websitesData = await step1GetWebsites(restaurants);
      }
    } else if (fs.existsSync(CONFIG.websitesFile)) {
      websitesData = JSON.parse(fs.readFileSync(CONFIG.websitesFile, 'utf8'));
    }
    
    // Step 2: Find menu URLs
    if (STEP === 'both' || STEP === '2') {
      if (websitesData.length === 0) {
        console.error('❌ No website data found. Run Step 1 first.');
        return;
      }
      
      // Check if we have saved menu URL results
      if (fs.existsSync(CONFIG.menuUrlsFile) && STEP === 'both') {
        console.log(`📖 Loading saved menu URLs from: ${CONFIG.menuUrlsFile}`);
        menuUrlResults = JSON.parse(fs.readFileSync(CONFIG.menuUrlsFile, 'utf8'));
      } else {
        menuUrlResults = await step2FindMenuUrls(websitesData);
      }
    } else {
      menuUrlResults = websitesData;
    }
    
    // Update restaurants
    const { data, updatedCount } = updateRestaurants(menuUrlResults);
    
    // Save data
    saveData(data, CONFIG.outputFile);
    
    // Summary
    console.log(`\n✅ Process Complete!`);
    console.log(`   Restaurants with websites: ${websitesData.filter(r => r.website).length}`);
    console.log(`   Menu URLs found: ${menuUrlResults.filter(r => r.menuUrl).length}`);
    console.log(`   Updated in JSON: ${updatedCount}`);
    
    // Cost estimate
    const yelpCost = (restaurants.length / 1000) * 1.0; // $1.00 per 1,000
    console.log(`\n💰 Estimated Cost:`);
    console.log(`   Step 1 (Yelp scraper): ~$${yelpCost.toFixed(2)}`);
    console.log(`   Step 2 (Website scraping): ~$0.14 - $0.43 (CU-based)`);
    console.log(`   Total: ~$${(yelpCost + 0.3).toFixed(2)}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, findMenuUrlOnWebsite };


