// Migration script to merge menuUrl into menu field
// Run with: node scripts/merge-menu-url.js
// 
// Strategy:
// - If menuUrl exists, use it (prefer menuUrl over menu if both exist)
// - If only menu exists, keep it
// - Remove menuUrl field after merge

const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');

async function mergeMenuUrl() {
  // Use provided token or fall back to env var
  const adminToken = process.env.INSTANT_ADMIN_TOKEN || 'b92eae55-f7ea-483c-b41d-4bb02a04629b';
  
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: adminToken,
    schema: schema.default || schema,
  });

  console.log('Fetching all buffets...');
  
  // Fetch all buffets
  const result = await db.query({
    buffets: {
      $: {
        limit: 10000,
      }
    }
  });

  const buffets = result.buffets || [];
  console.log(`Total buffets: ${buffets.length}`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let conflicts = 0; // Both menu and menuUrl have values
  let menuUrlOnly = 0; // Only menuUrl has value
  let menuOnly = 0; // Only menu has value
  let neither = 0; // Neither has value

  // Process each buffet
  for (const buffet of buffets) {
    try {
      const menuUrl = buffet.menuUrl;
      const menu = buffet.menu;
      
      const hasMenuUrl = menuUrl && menuUrl.trim();
      const hasMenu = menu && menu.trim();
      
      // Track statistics
      if (hasMenuUrl && hasMenu) {
        conflicts++;
      } else if (hasMenuUrl) {
        menuUrlOnly++;
      } else if (hasMenu) {
        menuOnly++;
      } else {
        neither++;
      }
      
      // Determine the merged value
      // Priority: menuUrl > menu (if both exist, prefer menuUrl)
      let mergedMenu = null;
      let needsUpdate = false;
      
      if (hasMenuUrl) {
        // menuUrl exists - use it (this handles conflicts by preferring menuUrl)
        mergedMenu = menuUrl.trim();
        needsUpdate = true; // Always update if menuUrl exists to merge it
      } else if (hasMenu) {
        // Only menu exists - keep it, but still need to remove menuUrl field if it exists
        mergedMenu = menu.trim();
        needsUpdate = buffet.menuUrl !== undefined && buffet.menuUrl !== null;
      } else {
        // Neither has value, but still need to remove menuUrl field if it exists
        needsUpdate = buffet.menuUrl !== undefined && buffet.menuUrl !== null;
      }
      
      if (needsUpdate) {
        // Update the record
        const updateData = {
          menuUrl: null, // Remove menuUrl field
        };
        
        // Only update menu if we have a merged value or if menuUrl existed
        if (mergedMenu !== null || hasMenuUrl) {
          updateData.menu = mergedMenu;
        }
        
        await db.transact([
          db.tx.buffets[buffet.id].update(updateData)
        ]);
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`Updated ${updated} buffets...`);
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Error processing buffet ${buffet.id}:`, error);
      errors++;
    }
  }

  console.log('\n=== Migration Results ===');
  console.log(`Total buffets: ${buffets.length}`);
  console.log(`\n--- Update Statistics ---`);
  console.log(`Total updated: ${updated}`);
  console.log(`Skipped (no changes needed): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`\n--- Conflict Analysis ---`);
  console.log(`Conflicts (both menu and menuUrl had values): ${conflicts}`);
  console.log(`  → menuUrl value was kept for all ${conflicts} conflicts`);
  console.log(`Only menuUrl had value: ${menuUrlOnly}`);
  console.log(`Only menu had value: ${menuOnly}`);
  console.log(`Neither had value: ${neither}`);
  console.log(`\nMigration complete!`);
}

mergeMenuUrl().catch(console.error);
