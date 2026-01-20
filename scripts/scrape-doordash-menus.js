// Script to scrape DoorDash menus using Apify and store in InstantDB
// Run with: node scripts/scrape-doordash-menus.js [--limit 10] [--test]

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const { runActor } = require('../lib/apify-client');

// Load schema
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

// Initialize InstantDB
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Configuration
const CONFIG = {
  actorId: 'axlymxp/doordash-store-scraper',
  limit: 10, // Default to 10 for testing
  maxResults: 50, // Max results per search
  radius: 1, // Search radius in miles
};

/**
 * Load restaurants from buffets-by-id.json
 */
function loadRestaurants(limit = null) {
  const dataPath = path.join(__dirname, '../data/buffets-by-id.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  const restaurants = Object.values(data)
    .filter(buffet => buffet.placeId) // Only include those with placeId
    .slice(0, limit || Infinity);
  
  return restaurants;
}

/**
 * Prepare Apify input for DoorDash scraper
 * Format: { location: "lat,lng", searchQuery: "restaurant name", maxResults: 50, radius: 1 }
 */
function prepareApifyInput(restaurant) {
  const location = `${restaurant.location.lat},${restaurant.location.lng}`;
  const searchQuery = restaurant.name;
  
  return {
    location: location,
    searchQuery: searchQuery,
    maxResults: CONFIG.maxResults,
    radius: CONFIG.radius, // miles
  };
}

/**
 * Match DoorDash results to our restaurant
 * Returns best match or null
 */
function matchRestaurant(doordashResult, originalRestaurant) {
  if (!doordashResult || !doordashResult.name) return null;
  
  // Simple name matching (case insensitive, remove special chars)
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const originalName = normalize(originalRestaurant.name);
  const doordashName = normalize(doordashResult.name);
  
  // Check for exact or close match
  if (originalName === doordashName || 
      originalName.includes(doordashName) || 
      doordashName.includes(originalName)) {
    return doordashResult;
  }
  
  // If there's location data, check proximity
  if (doordashResult.latitude && doordashResult.longitude) {
    const distance = calculateDistance(
      originalRestaurant.location.lat,
      originalRestaurant.location.lng,
      doordashResult.latitude,
      doordashResult.longitude
    );
    
    // If very close (within 0.5 miles) and name is somewhat similar, accept it
    if (distance < 0.5 && calculateSimilarity(originalName, doordashName) > 0.5) {
      return doordashResult;
    }
  }
  
  return null;
}

/**
 * Calculate distance between two coordinates in miles (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculate string similarity (simple Jaccard similarity)
 */
function calculateSimilarity(str1, str2) {
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Extract menu data from DoorDash result
 * Structure menu data to match our schema
 */
function extractMenuData(doordashResult) {
  if (!doordashResult) return null;
  
  // DoorDash structure may vary, try common fields
  const menu = doordashResult.menu || doordashResult.menuItems || doordashResult.items || [];
  
  if (!Array.isArray(menu) || menu.length === 0) {
    return null;
  }
  
  // Organize by categories
  const categoriesMap = new Map();
  const allItems = [];
  
  menu.forEach(item => {
    const categoryName = item.category || item.categoryName || 'Other';
    const menuItem = {
      name: item.name || item.title || '',
      description: item.description || '',
      price: item.price || item.priceText || '',
      priceNumber: parseFloat(item.price?.replace(/[^0-9.]/g, '') || '0'),
      imageUrl: item.imageUrl || item.image || null,
    };
    
    if (!categoriesMap.has(categoryName)) {
      categoriesMap.set(categoryName, []);
    }
    categoriesMap.get(categoryName).push(menuItem);
    allItems.push(menuItem);
  });
  
  // Convert categories map to array
  const categories = Array.from(categoriesMap.entries()).map(([name, items]) => ({
    name,
    items,
  }));
  
  return {
    categories,
    items: allItems,
    metadata: {
      source: 'DoorDash',
      sourceUrl: doordashResult.url || doordashResult.storeUrl || '',
      restaurantName: doordashResult.name || '',
      extractedAt: new Date().toISOString(),
      totalCategories: categories.length,
      totalItems: allItems.length,
    },
  };
}

/**
 * Save menu to InstantDB
 */
async function saveMenuToDB(placeId, sourceUrl, menuData, status = 'SUCCESS', errorMessage = null) {
  try {
    // Check if menu already exists for this placeId
    const existing = await db.query({
      menus: {
        $: {
          where: { placeId: placeId },
          order: [{ field: 'scrapedAt', direction: 'desc' }]
        }
      }
    });
    
    if (existing.menus && existing.menus.length > 0) {
      console.log(`  Menu already exists for placeId ${placeId}, updating...`);
      // Update existing menu instead of creating new one
      const existingMenu = existing.menus[0];
      const updateData = {
        sourceUrl: sourceUrl,
        structuredData: JSON.stringify(menuData || {}),
        categories: menuData?.categories ? JSON.stringify(menuData.categories) : null,
        items: menuData?.items ? JSON.stringify(menuData.items) : null,
        scrapedAt: new Date().toISOString(),
        status: status,
        errorMessage: errorMessage || null,
      };
      
      await db.transact([
        db.tx.menus[existingMenu.id].update(updateData)
      ]);
      
      return { updated: true, menuId: existingMenu.id };
    }
    
    const menuId = id();
    const menuRecord = {
      placeId,
      sourceUrl: sourceUrl || '',
      contentType: 'DOORDASH', // Custom type for DoorDash
      rawText: null, // DoorDash provides structured data directly
      structuredData: JSON.stringify(menuData || {}),
      categories: menuData?.categories ? JSON.stringify(menuData.categories) : null,
      items: menuData?.items ? JSON.stringify(menuData.items) : null,
      scrapedAt: new Date().toISOString(),
      status: status,
      errorMessage: errorMessage || null,
    };
    
    await db.transact([
      db.tx.menus[menuId].create(menuRecord)
    ]);
    
    console.log(`  ✓ Saved menu to database (ID: ${menuId})`);
    return { saved: true, menuId };
  } catch (error) {
    console.error(`  Error saving to database: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Process a single restaurant through DoorDash scraper
 */
async function processRestaurant(restaurant) {
  console.log(`\nProcessing: ${restaurant.name}`);
  console.log(`  Place ID: ${restaurant.placeId}`);
  console.log(`  Location: ${restaurant.address.city}, ${restaurant.address.state}`);
  console.log(`  Coordinates: ${restaurant.location.lat}, ${restaurant.location.lng}`);
  
  try {
    // Prepare input for Apify
    const input = prepareApifyInput(restaurant);
    console.log(`  Searching DoorDash with: "${input.searchQuery}" at ${input.location}`);
    
    // Run Apify actor
    const result = await runActor(CONFIG.actorId, input, {
      waitForFinish: true,
      timeout: 600000, // 10 minutes timeout
    });
    
    if (!result.items || result.items.length === 0) {
      console.log(`  ✗ No results found on DoorDash`);
      await saveMenuToDB(
        restaurant.placeId,
        '',
        null,
        'FAILED',
        'No restaurants found on DoorDash'
      );
      return { success: false, reason: 'no_results' };
    }
    
    console.log(`  Found ${result.items.length} result(s) from DoorDash`);
    
    // Debug: Log first result structure
    if (result.items.length > 0) {
      console.log(`  Debug - First result keys:`, Object.keys(result.items[0]));
      console.log(`  Debug - First result sample:`, JSON.stringify(result.items[0], null, 2).substring(0, 500));
    }
    
    // Check if results have restaurant data or just addresses
    // The actor seems to return address data, not restaurant data
    // Check if any field looks like restaurant data
    const hasRestaurantData = result.items.some(item => 
      item.name || item.storeName || item.restaurantName || item.menu || item.menuItems
    );
    
    if (!hasRestaurantData) {
      console.log(`  ⚠ Actor returned address data, not restaurant data`);
      console.log(`    This actor (${CONFIG.actorId}) may not be the correct one for DoorDash menus`);
      console.log(`    Consider using a different actor or approach`);
      
      await saveMenuToDB(
        restaurant.placeId,
        '',
        null,
        'FAILED',
        'Actor returned address data instead of restaurant data'
      );
      return { success: false, reason: 'wrong_actor_format' };
    }
    
    // Try to match the restaurant
    let matchedResult = null;
    for (const item of result.items) {
      const match = matchRestaurant(item, restaurant);
      if (match) {
        matchedResult = match;
        console.log(`  ✓ Matched: ${match.name || match.storeName || match.restaurantName}`);
        break;
      }
    }
    
    if (!matchedResult) {
      console.log(`  ⚠ No matching restaurant found (checked ${result.items.length} results)`);
      console.log(`    Searched for: "${restaurant.name}"`);
      if (result.items.length > 0) {
        const firstItem = result.items[0];
        console.log(`    Found instead: ${firstItem.name || firstItem.storeName || firstItem.restaurantName || JSON.stringify(firstItem).substring(0, 100)}`);
      }
      
      await saveMenuToDB(
        restaurant.placeId,
        result.items[0]?.url || result.items[0]?.storeUrl || '',
        null,
        'FAILED',
        'No matching restaurant found on DoorDash'
      );
      return { success: false, reason: 'no_match' };
    }
    
    // Extract menu data
    const menuData = extractMenuData(matchedResult);
    
    if (!menuData || menuData.items.length === 0) {
      console.log(`  ⚠ No menu data found in DoorDash result`);
      await saveMenuToDB(
        restaurant.placeId,
        matchedResult.url || matchedResult.storeUrl || '',
        null,
        'FAILED',
        'No menu items found in DoorDash result'
      );
      return { success: false, reason: 'no_menu_data' };
    }
    
    console.log(`  ✓ Extracted menu: ${menuData.categories.length} categories, ${menuData.items.length} items`);
    
    // Save to database
    const saveResult = await saveMenuToDB(
      restaurant.placeId,
      matchedResult.url || matchedResult.storeUrl || '',
      menuData,
      'SUCCESS',
      null
    );
    
    if (saveResult.error) {
      return { success: false, reason: 'save_error', error: saveResult.error };
    }
    
    return { success: true, menuData };
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    await saveMenuToDB(
      restaurant.placeId,
      '',
      null,
      'FAILED',
      error.message
    );
    return { success: false, reason: 'error', error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let limit = CONFIG.limit;
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
    }
  }
  
  console.log('🚀 DoorDash Menu Scraper');
  console.log(`📊 Loading restaurants (limit: ${limit})...\n`);
  
  // Load restaurants
  const restaurants = loadRestaurants(limit);
  console.log(`✅ Loaded ${restaurants.length} restaurants\n`);
  
  if (restaurants.length === 0) {
    console.error('No restaurants found!');
    process.exit(1);
  }
  
  // Process each restaurant
  let successCount = 0;
  let failedCount = 0;
  let noResultsCount = 0;
  let noMatchCount = 0;
  let noMenuDataCount = 0;
  
  for (let i = 0; i < restaurants.length; i++) {
    const restaurant = restaurants[i];
    console.log(`\n[${i + 1}/${restaurants.length}]`);
    
    const result = await processRestaurant(restaurant);
    
    if (result.success) {
      successCount++;
    } else {
      failedCount++;
      if (result.reason === 'no_results') noResultsCount++;
      else if (result.reason === 'no_match') noMatchCount++;
      else if (result.reason === 'no_menu_data') noMenuDataCount++;
    }
    
    // Small delay between requests to avoid rate limiting
    if (i < restaurants.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }
  
  // Summary
  console.log(`\n\n✅ Processing complete!`);
  console.log(`\nSummary:`);
  console.log(`  Total processed: ${restaurants.length}`);
  console.log(`  ✓ Success: ${successCount}`);
  console.log(`  ✗ Failed: ${failedCount}`);
  if (noResultsCount > 0) console.log(`    - No results: ${noResultsCount}`);
  if (noMatchCount > 0) console.log(`    - No match: ${noMatchCount}`);
  if (noMenuDataCount > 0) console.log(`    - No menu data: ${noMenuDataCount}`);
  console.log(`\n💡 Check Apify console for cost details: https://console.apify.com/actors/runs`);
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

