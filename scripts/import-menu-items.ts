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
 *   npx tsx scripts/import-menu-items.ts
 * 
 * Requirements:
 *   - INSTANT_ADMIN_TOKEN environment variable
 *   - NEXT_PUBLIC_INSTANT_APP_ID or INSTANT_APP_ID environment variable
 */

import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';

interface MenuItem {
  name: string;
  description?: string | null;
  price?: string | null;
  priceNumber?: number | null;
}

interface MenuCategory {
  name: string;
  items: MenuItem[];
}

interface MenuRecord {
  title: string;
  placeID: string;
  menu: string;
  scrapedMenu: {
    success: boolean;
    contentType: string;
    scrapedAt: string;
    structuredData?: {
      categories?: MenuCategory[];
    };
  };
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
async function findOrCreateMenu(
  db: ReturnType<typeof init>,
  placeId: string,
  sourceUrl: string,
  scrapedMenu: MenuRecord['scrapedMenu']
): Promise<string> {
  // First, try to find existing menu
  const existing = await db.query({
    menus: {
      $: {
        where: { placeId: placeId },
        order: [{ field: 'scrapedAt', direction: 'desc' }],
        limit: 1,
      },
    },
  });

  if (existing.menus && existing.menus.length > 0) {
    return existing.menus[0].id;
  }

  // Create new menu record
  const menuId = db.id();
  await db.transact([
    db.tx.menus[menuId].update({
      placeId: placeId,
      sourceUrl: sourceUrl,
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
async function importMenuItems(
  db: ReturnType<typeof init>,
  menuId: string,
  categories: MenuCategory[]
): Promise<number> {
  if (!categories || categories.length === 0) {
    return 0;
  }

  // Delete existing menu items for this menu (to avoid duplicates on re-run)
  const existingItems = await db.query({
    menus: {
      $: { where: { id: menuId } },
      menuItems: {},
    },
  });

  const itemsToDelete = existingItems.menus?.[0]?.menuItems || [];
  if (itemsToDelete.length > 0) {
    console.log(`  Deleting ${itemsToDelete.length} existing menu items...`);
    const deleteOps = itemsToDelete.map((item: any) =>
      db.tx.menuItems[item.id].delete()
    );
    await db.transact(deleteOps);
  }

  // Prepare all menu items
  const menuItemsToCreate: Array<{
    menuId: string;
    categoryName: string;
    item: MenuItem;
    order: number;
  }> = [];

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
      const itemId = db.id();
      return db.tx.menuItems[itemId]
        .update({
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
  const menuRecords: MenuRecord[] = JSON.parse(fileContent);
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

export { importMenuData };
