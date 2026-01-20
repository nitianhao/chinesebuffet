/**
 * Import menu items from menu_urls.json into InstantDB
 * 
 * This script:
 * 1. Reads menu data from Example JSON/menu_urls.json
 * 2. For each record, finds or creates the menu record
 * 3. Extracts menu items from structuredData.categories
 * 4. Creates menuItems records linked to the menu
 * 
 * Usage:
 *   node scripts/import-menu-items.js
 * 
 * Requirements:
 *   - INSTANT_ADMIN_TOKEN environment variable
 *   - NEXT_PUBLIC_INSTANT_APP_ID or INSTANT_APP_ID environment variable
 */

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Try to load schema - handle both TS and JS
let schema;
try {
  // Try as compiled JS first
  schema = require('../src/instant.schema');
} catch (e) {
  try {
    // Try with .default
    schema = require('../src/instant.schema').default;
  } catch (e2) {
    // If that fails, we'll define a minimal schema inline
    console.warn('Could not load schema file, using inline schema');
    const { i } = require('@instantdb/core');
    schema = i.schema({
      entities: {
        menus: i.entity({
          placeId: i.string().indexed(),
          sourceUrl: i.string(),
          contentType: i.string(),
          rawText: i.string().optional(),
          structuredData: i.string(),
          categories: i.string().optional(),
          items: i.string().optional(),
          scrapedAt: i.string(),
          status: i.string(),
          errorMessage: i.string().optional(),
        }),
        menuItems: i.entity({
          categoryName: i.string().indexed(),
          name: i.string().indexed(),
          description: i.string().optional(),
          price: i.string().optional(),
          priceNumber: i.number().optional(),
          itemOrder: i.number().optional(),
        }),
      },
      links: {
        menuMenuItems: {
          forward: {
            on: 'menuItems',
            has: 'one',
            label: 'menu',
            onDelete: 'cascade'
          },
          reverse: {
            on: 'menus',
            has: 'many',
            label: 'menuItems'
          }
        }
      },
      rooms: {}
    });
  }
}

// Initialize admin client
function getAdminDb() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  
  return init({
    appId,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });
}

// Find or create menu record
async function findOrCreateMenu(db, placeId, sourceUrl, scrapedMenu) {
  // First, try to find existing menu
  const existing = await db.query({
    menus: {
      $: {
        where: { placeId: placeId },
        limit: 1,
      },
    },
  });

  if (existing.menus && existing.menus.length > 0) {
    return existing.menus[0].id;
  }

  // Create new menu record
  const menuId = id();
  // Ensure sourceUrl is a string
  const sourceUrlString = typeof sourceUrl === 'string' ? sourceUrl : (sourceUrl?.url || sourceUrl?.href || JSON.stringify(sourceUrl) || '');
  
  await db.transact([
    db.tx.menus[menuId].create({
      placeId: placeId,
      sourceUrl: sourceUrlString,
      contentType: scrapedMenu.contentType || 'HTML',
      rawText: scrapedMenu.rawText || null,
      structuredData: JSON.stringify(scrapedMenu.structuredData || {}),
      categories: scrapedMenu.structuredData?.categories
        ? JSON.stringify(scrapedMenu.structuredData.categories.map(c => c.name))
        : null,
      items: scrapedMenu.structuredData?.categories
        ? JSON.stringify(
            scrapedMenu.structuredData.categories.flatMap(c => c.items)
          )
        : null,
      scrapedAt: scrapedMenu.scrapedAt || new Date().toISOString(),
      status: scrapedMenu.success ? 'SUCCESS' : 'FAILED',
      errorMessage: null,
    }),
  ]);

  return menuId;
}

// Import menu items for a single menu
async function importMenuItems(db, menuId, categories) {
  if (!categories || categories.length === 0) {
    return 0;
  }

  // Delete existing menu items for this menu (to avoid duplicates on re-run)
  // Try to query existing items, but don't fail if the schema isn't deployed yet
  let itemsToDelete = [];
  try {
    const existingItems = await db.query({
      menus: {
        $: { where: { id: menuId } },
        menuItems: {},
      },
    });
    itemsToDelete = existingItems.menus?.[0]?.menuItems || [];
  } catch (error) {
    // Schema might not be deployed yet, that's okay - we'll just create new items
    console.log(`  Note: Could not query existing items (schema may not be deployed): ${error.message}`);
  }

  if (itemsToDelete.length > 0) {
    console.log(`  Deleting ${itemsToDelete.length} existing menu items...`);
    try {
      const deleteOps = itemsToDelete.map((item) =>
        db.tx.menuItems[item.id].delete()
      );
      await db.transact(deleteOps);
    } catch (error) {
      console.log(`  Warning: Could not delete existing items: ${error.message}`);
    }
  }

  // Prepare all menu items
  const menuItemsToCreate = [];

  for (const category of categories) {
    if (!category.items || category.items.length === 0) continue;

    category.items.forEach((item, index) => {
      menuItemsToCreate.push({
        menuId,
        categoryName: category.name || 'Uncategorized',
        item,
        order: index,
      });
    });
  }

  if (menuItemsToCreate.length === 0) {
    return 0;
  }

  // Create menu items in batches (InstantDB has limits on transaction size)
  const BATCH_SIZE = 100;
  let totalCreated = 0;

  for (let i = 0; i < menuItemsToCreate.length; i += BATCH_SIZE) {
    const batch = menuItemsToCreate.slice(i, i + BATCH_SIZE);
    
    const txOps = batch.map(({ menuId, categoryName, item, order }) => {
      const itemId = id();
      return db.tx.menuItems[itemId]
        .create({
          categoryName: categoryName,
          name: item.name || 'Unnamed Item',
          description: item.description || null,
          price: item.price || null,
          priceNumber: item.priceNumber || null,
          itemOrder: order,
        })
        .link({ menu: menuId });
    });

    await db.transact(txOps);
    totalCreated += batch.length;
    
    if (i + BATCH_SIZE < menuItemsToCreate.length) {
      console.log(`  Created ${totalCreated}/${menuItemsToCreate.length} menu items...`);
    }
  }

  return totalCreated;
}

// Main import function
async function importMenuData() {
  console.log('Starting menu items import...\n');

  // Check environment
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('ERROR: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Please set it in your .env.local file or export it before running this script');
    process.exit(1);
  }

  // Load JSON file
  const jsonPath = path.join(__dirname, '../Example JSON/menu_urls.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: File not found: ${jsonPath}`);
    process.exit(1);
  }

  console.log(`Reading menu data from ${jsonPath}...`);
  const fileContent = fs.readFileSync(jsonPath, 'utf-8');
  const menuRecords = JSON.parse(fileContent);
  console.log(`Found ${menuRecords.length} menu records\n`);

  // Initialize database
  const db = getAdminDb();
  console.log('Connected to InstantDB\n');

  // Statistics
  let processed = 0;
  let skipped = 0;
  let totalMenuItems = 0;
  let errors = 0;

  // Process each record
  for (let i = 0; i < menuRecords.length; i++) {
    const record = menuRecords[i];
    const placeId = record.placeID;
    const title = record.title;

    try {
      // Skip if no structured data
      if (!record.scrapedMenu?.structuredData?.categories) {
        console.log(`[${i + 1}/${menuRecords.length}] Skipping ${title} - no structured data`);
        skipped++;
        continue;
      }

      const categories = record.scrapedMenu.structuredData.categories;
      const itemCount = categories.reduce((sum, cat) => sum + (cat.items?.length || 0), 0);

      if (itemCount === 0) {
        console.log(`[${i + 1}/${menuRecords.length}] Skipping ${title} - no menu items`);
        skipped++;
        continue;
      }

      console.log(`[${i + 1}/${menuRecords.length}] Processing ${title} (${itemCount} items)...`);

      // Find or create menu
      const menuId = await findOrCreateMenu(
        db,
        placeId,
        record.menu,
        record.scrapedMenu
      );

      // Import menu items
      const created = await importMenuItems(db, menuId, categories);
      totalMenuItems += created;

      console.log(`  ✓ Created ${created} menu items\n`);
      processed++;

    } catch (error) {
      console.error(`  ✗ Error processing ${title}:`, error instanceof Error ? error.message : error);
      errors++;
    }

    // Progress update every 50 records
    if ((i + 1) % 50 === 0) {
      console.log(`\nProgress: ${i + 1}/${menuRecords.length} processed\n`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total records: ${menuRecords.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total menu items created: ${totalMenuItems}`);
  console.log('='.repeat(60) + '\n');
}

// Run import
if (require.main === module) {
  importMenuData()
    .then(() => {
      console.log('Import completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importMenuData };
