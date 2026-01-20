/**
 * Enrich Chinese Buffet Data with Menu URLs using Apify
 * 
 * This script uses the cheapest Apify option (tri_angle/yelp-scraper) to:
 * 1. Extract website URLs from Yelp pages
 * 2. Construct menu URLs using common patterns
 * 3. Update the JSON file with menu URLs
 * 
 * Cost: ~$5.70 for 5,703 restaurants (or ~$0.11 if CU-based pricing applies)
 * 
 * Usage:
 *   node scripts/enrich-menu-urls-apify.js
 *   node scripts/enrich-menu-urls-apify.js --batch-size 100
 *   node scripts/enrich-menu-urls-apify.js --dry-run
 *   node scripts/enrich-menu-urls-apify.js --limit 10
 */

const fs = require('fs');
const path = require('path');
const apify = require('../lib/apify-client');

// Configuration
const CONFIG = {
  // Input file
  inputFile: path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json'),
  
  // Output file (backup will be created)
  outputFile: path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json'),
  
  // Apify actor
  actorId: 'tri_angle/yelp-scraper',
  
  // Batch processing
  batchSize: 50, // Process restaurants in batches to avoid rate limits
  
  // Menu URL patterns to try (in order of preference)
  menuUrlPatterns: [
    '/menu',
    '/menus',
    '/menu.html',
    '/#menu',
    '/menu.pdf',
    '/menus.html',
  ],
  
  // Delay between batches (ms)
  delayBetweenBatches: 2000,
  
  // Retry configuration
  maxRetries: 3,
  retryDelay: 5000,
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || null;
const BATCH_SIZE = args.find(arg => arg.startsWith('--batch-size'))?.split('=')[1] || CONFIG.batchSize;

/**
 * Load restaurant data from JSON file
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
  
  // Apply limit if specified
  if (LIMIT) {
    const limit = parseInt(LIMIT);
    console.log(`🔢 Limiting to first ${limit} restaurants`);
    return needingMenuUrls.slice(0, limit);
  }
  
  return needingMenuUrls;
}

/**
 * Extract Yelp URLs from restaurants
 */
function extractYelpUrls(restaurants) {
  return restaurants.map(r => {
    const yelp = r.yelp || {};
    const yelpUrl = yelp.url || '';
    
    // Extract clean Yelp URL (remove query params)
    const cleanUrl = yelpUrl.split('?')[0];
    
    return {
      buffetId: r.buffetId,
      buffetName: r.buffetName,
      yelpUrl: cleanUrl,
      restaurant: r,
    };
  }).filter(item => item.yelpUrl);
}

/**
 * Construct menu URL from website URL
 */
function constructMenuUrl(websiteUrl) {
  if (!websiteUrl || !websiteUrl.trim()) {
    return null;
  }
  
  // Normalize website URL
  let baseUrl = websiteUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');
  
  // Try common menu URL patterns
  for (const pattern of CONFIG.menuUrlPatterns) {
    const menuUrl = baseUrl + pattern;
    // In a real implementation, you might want to verify the URL exists
    // For now, we'll use the first pattern as default
    return menuUrl;
  }
  
  // Default to /menu
  return baseUrl + '/menu';
}

/**
 * Process a batch of restaurants through Apify
 */
async function processBatch(batch, batchNumber, totalBatches) {
  console.log(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} restaurants)...`);
  
  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would process ${batch.length} restaurants`);
    return batch.map(item => ({
      ...item,
      website: 'https://example.com', // Mock data
      menuUrl: 'https://example.com/menu',
    }));
  }
  
  // Prepare input for Apify actor
  const directUrls = batch.map(item => item.yelpUrl);
  
  const input = {
    directUrls: directUrls,
  };
  
  try {
    // Run Apify actor
    const result = await apify.runActor(CONFIG.actorId, input, {
      waitForFinish: true,
      timeout: 600000, // 10 minutes
    });
    
    console.log(`✅ Batch ${batchNumber} completed`);
    console.log(`   Run ID: ${result.runId}`);
    console.log(`   Items retrieved: ${result.items.length}`);
    console.log(`   Compute Units: ${result.stats?.computeUnits || 'N/A'}`);
    
    // Map results back to restaurants
    const resultsMap = new Map();
    result.items.forEach(item => {
      if (item.directUrl) {
        resultsMap.set(item.directUrl, item);
      }
    });
    
    // Combine with original batch data
    return batch.map(item => {
      const apifyResult = resultsMap.get(item.yelpUrl);
      const website = apifyResult?.website || null;
      const menuUrl = website ? constructMenuUrl(website) : null;
      
      return {
        ...item,
        website,
        menuUrl,
        apifyResult,
      };
    });
    
  } catch (error) {
    console.error(`❌ Error processing batch ${batchNumber}:`, error.message);
    throw error;
  }
}

/**
 * Update restaurant data with menu URLs
 */
function updateRestaurants(restaurants, results) {
  console.log(`\n📝 Updating restaurant data with menu URLs...`);
  
  // Create a map of results by buffetId
  const resultsMap = new Map();
  results.forEach(result => {
    resultsMap.set(result.buffetId, result);
  });
  
  // Load original data
  const data = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf8'));
  
  let updatedCount = 0;
  
  // Update restaurants with menu URLs
  Object.keys(data).forEach(buffetId => {
    const result = resultsMap.get(buffetId);
    if (result && result.menuUrl) {
      const restaurant = data[buffetId];
      if (restaurant && restaurant.yelp && restaurant.yelp.details) {
        restaurant.yelp.details.menu_url = result.menuUrl;
        updatedCount++;
      }
    }
  });
  
  console.log(`✅ Updated ${updatedCount} restaurants with menu URLs`);
  
  return { data, updatedCount };
}

/**
 * Save updated data to file
 */
function saveData(data, outputFile) {
  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would save data to: ${outputFile}`);
    return;
  }
  
  // Create backup
  const backupFile = outputFile + '.backup.' + Date.now();
  console.log(`💾 Creating backup: ${backupFile}`);
  fs.copyFileSync(outputFile, backupFile);
  
  // Save updated data
  console.log(`💾 Saving updated data to: ${outputFile}`);
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  console.log(`✅ Data saved successfully`);
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Starting Menu URL Enrichment with Apify\n');
  console.log(`📋 Configuration:`);
  console.log(`   Actor: ${CONFIG.actorId}`);
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log(`   Dry Run: ${DRY_RUN}`);
  console.log(`   Limit: ${LIMIT || 'None'}`);
  console.log('');
  
  try {
    // Load restaurants
    const restaurants = loadRestaurants();
    
    if (restaurants.length === 0) {
      console.log('✅ All restaurants already have menu URLs!');
      return;
    }
    
    // Extract Yelp URLs
    const yelpData = extractYelpUrls(restaurants);
    console.log(`\n📋 Found ${yelpData.length} restaurants with Yelp URLs`);
    
    // Process in batches
    const batches = [];
    for (let i = 0; i < yelpData.length; i += parseInt(BATCH_SIZE)) {
      batches.push(yelpData.slice(i, i + parseInt(BATCH_SIZE)));
    }
    
    console.log(`\n📦 Processing ${batches.length} batches...`);
    
    const allResults = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Process batch with retries
      let retries = 0;
      let batchResults = null;
      
      while (retries < CONFIG.maxRetries) {
        try {
          batchResults = await processBatch(batch, i + 1, batches.length);
          break;
        } catch (error) {
          retries++;
          if (retries < CONFIG.maxRetries) {
            console.log(`⚠️  Retry ${retries}/${CONFIG.maxRetries} after ${CONFIG.retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
          } else {
            throw error;
          }
        }
      }
      
      allResults.push(...batchResults);
      
      // Delay between batches (except for last batch)
      if (i < batches.length - 1) {
        console.log(`⏳ Waiting ${CONFIG.delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
      }
    }
    
    // Update restaurants with menu URLs
    const { data, updatedCount } = updateRestaurants(restaurants, allResults);
    
    // Save updated data
    saveData(data, CONFIG.outputFile);
    
    // Summary
    console.log(`\n✅ Enrichment Complete!`);
    console.log(`   Total processed: ${allResults.length}`);
    console.log(`   With menu URLs: ${updatedCount}`);
    console.log(`   Without menu URLs: ${allResults.length - updatedCount}`);
    
    // Cost estimate
    const estimatedCost = (allResults.length / 1000) * 1.0; // $1.00 per 1,000 results
    console.log(`\n💰 Estimated Cost: ~$${estimatedCost.toFixed(2)}`);
    console.log(`   (Based on $1.00 per 1,000 results)`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, constructMenuUrl };


