// Script to scrape DoorDash menus from URLs using Apify and store in InstantDB
// Can use URLs from file or provided directly
// Run with: node scripts/scrape-doordash-menus-from-urls.js --urls-file data/doordash-urls-from-db.json

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
  actorId: 'tri_angle/doordash-store-details-scraper',
};

/**
 * Extract menu data from DoorDash result
 */
function extractMenuData(doordashResult) {
  if (!doordashResult) return null;
  
  // DoorDash structure may vary - try different possible fields
  const menu = doordashResult.menu || 
               doordashResult.menuItems || 
               doordashResult.items || 
               doordashResult.categories || 
               [];
  
  if (!Array.isArray(menu) || menu.length === 0) {
    return null;
  }
  
  // Organize by categories
  const categoriesMap = new Map();
  const allItems = [];
  
  menu.forEach(item => {
    const categoryName = item.category || item.categoryName || item.section || 'Other';
    const menuItem = {
      name: item.name || item.title || item.displayName || '',
      description: item.description || item.itemDescription || '',
      price: item.price || item.priceText || item.displayPrice || '',
      priceNumber: parseFloat((item.price || item.priceText || '0').toString().replace(/[^0-9.]/g, '')) || 0,
      imageUrl: item.imageUrl || item.image || item.photoUrl || null,
      available: item.available !== false, // Default to true unless explicitly false
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
      sourceUrl: doordashResult.url || doordashResult.storeUrl || doordashResult.pageUrl || '',
      restaurantName: doordashResult.name || doordashResult.storeName || '',
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
      contentType: 'DOORDASH',
      rawText: null,
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
 * Process a single DoorDash URL
 */
async function processDoorDashUrl(placeId, restaurantName, doordashUrl) {
  console.log(`\nProcessing: ${restaurantName}`);
  console.log(`  Place ID: ${placeId}`);
  console.log(`  DoorDash URL: ${doordashUrl}`);
  
  try {
    // Prepare input for Apify actor
    const input = {
      startUrls: [
        { url: doordashUrl }
      ]
    };
    
    console.log(`  Running Apify actor: ${CONFIG.actorId}`);
    
    // Run Apify actor
    const result = await runActor(CONFIG.actorId, input, {
      waitForFinish: true,
      timeout: 600000, // 10 minutes
    });
    
    if (!result.items || result.items.length === 0) {
      console.log(`  ✗ No results from DoorDash scraper`);
      await saveMenuToDB(
        placeId,
        doordashUrl,
        null,
        'FAILED',
        'No data returned from DoorDash scraper'
      );
      return { success: false, reason: 'no_results' };
    }
    
    console.log(`  Received ${result.items.length} result(s) from DoorDash`);
    
    // Debug: Log structure of first result
    if (result.items.length > 0) {
      console.log(`  Debug - First result keys:`, Object.keys(result.items[0]));
      console.log(`  Debug - First result sample:`, JSON.stringify(result.items[0], null, 2).substring(0, 1000));
    }
    
    // Use first result (should be the restaurant data)
    const doordashData = result.items[0];
    
    // Extract menu data
    const menuData = extractMenuData(doordashData);
    
    if (!menuData || menuData.items.length === 0) {
      console.log(`  ⚠ No menu data found in DoorDash result`);
      await saveMenuToDB(
        placeId,
        doordashUrl,
        null,
        'FAILED',
        'No menu items found in DoorDash result'
      );
      return { success: false, reason: 'no_menu_data' };
    }
    
    console.log(`  ✓ Extracted menu: ${menuData.categories.length} categories, ${menuData.items.length} items`);
    
    // Save to database
    const saveResult = await saveMenuToDB(
      placeId,
      doordashUrl,
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
      placeId,
      doordashUrl,
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
  let urlsFile = null;
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--urls-file' && args[i + 1]) {
      urlsFile = args[i + 1];
    }
  }
  
  console.log('🚀 DoorDash Menu Scraper (from URLs)');
  
  let urlsData = [];
  
  if (urlsFile) {
    console.log(`📂 Loading URLs from: ${urlsFile}\n`);
    const filePath = path.join(__dirname, '..', urlsFile);
    urlsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } else {
    // Use default file if exists
    const defaultFile = path.join(__dirname, '../data/doordash-urls-from-db.json');
    if (fs.existsSync(defaultFile)) {
      console.log(`📂 Loading URLs from: ${defaultFile}\n`);
      urlsData = JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
    } else {
      console.error('❌ No URLs file provided. Use --urls-file path/to/file.json');
      process.exit(1);
    }
  }
  
  console.log(`✅ Loaded ${urlsData.length} DoorDash URLs\n`);
  
  if (urlsData.length === 0) {
    console.error('No URLs found!');
    process.exit(1);
  }
  
  // Process each URL
  let successCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < urlsData.length; i++) {
    const item = urlsData[i];
    console.log(`\n[${i + 1}/${urlsData.length}]`);
    
    const result = await processDoorDashUrl(
      item.placeId,
      item.name,
      item.doordashUrl
    );
    
    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
    
    // Small delay between requests
    if (i < urlsData.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log(`\n\n✅ Processing complete!`);
  console.log(`\nSummary:`);
  console.log(`  Total processed: ${urlsData.length}`);
  console.log(`  ✓ Success: ${successCount}`);
  console.log(`  ✗ Failed: ${failedCount}`);
  console.log(`\n💡 Check Apify console for cost details: https://console.apify.com/actors/runs`);
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});





