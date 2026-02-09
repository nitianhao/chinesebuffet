// Query InstantDB for menu data analysis
require('dotenv').config({ path: '.env.local' });

const { init } = require('@instantdb/admin');

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const adminToken = process.env.INSTANT_ADMIN_TOKEN;

if (!adminToken) {
  console.error('ERROR: INSTANT_ADMIN_TOKEN not found in .env.local');
  process.exit(1);
}

console.log('Connecting to InstantDB...');
console.log('App ID:', appId);

const db = init({
  appId,
  adminToken,
});

async function queryMenuData() {
  try {
    console.log('\n--- Querying menus with menuItems (limited to 5) ---\n');
    
    // Query menus with their menuItems
    const menusResult = await db.query({
      menus: {
        $: { limit: 5 },
        menuItems: {}
      }
    });

    const menus = menusResult.menus || [];
    console.log(`Sample menus fetched: ${menus.length}`);

    // Get menu count
    console.log('\n--- Counting menus ---\n');
    const menuCountResult = await db.query({
      menus: {
        $: { limit: 5000 }
      }
    });
    const totalMenus = menuCountResult.menus?.length || 0;
    console.log(`Total menus in database: ${totalMenus}`);

    // Get sample menuItems (small limit to avoid timeout)
    console.log('\n--- Fetching sample menuItems ---\n');
    const menuItemsSampleResult = await db.query({
      menuItems: {
        $: { limit: 100 }
      }
    });
    const sampleMenuItems = menuItemsSampleResult.menuItems || [];
    console.log(`Sample menuItems fetched: ${sampleMenuItems.length}`);
    console.log('(Note: Full count not available due to table size - likely 10,000+ items)');

    if (menus.length === 0) {
      console.log('\nNo menus found in database.');
      return;
    }

    // Show sample menus with their items
    console.log('\n' + '='.repeat(80));
    console.log('=== SAMPLE MENUS WITH MENU ITEMS ===');
    console.log('='.repeat(80));
    
    const sampleMenus = menus.slice(0, 3);
    
    for (let i = 0; i < sampleMenus.length; i++) {
      const menu = sampleMenus[i];
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`MENU ${i + 1}`);
      console.log(`${'─'.repeat(80)}`);
      console.log('ID:', menu.id);
      console.log('Place ID:', menu.placeId);
      console.log('Source URL:', menu.sourceUrl);
      console.log('Content Type:', menu.contentType);
      console.log('Status:', menu.status);
      console.log('Scraped At:', menu.scrapedAt);
      if (menu.errorMessage) console.log('Error Message:', menu.errorMessage);
      
      // Show raw text preview
      if (menu.rawText) {
        console.log('\n📄 RAW TEXT PREVIEW:');
        const preview = menu.rawText.substring(0, 800);
        console.log(preview + (menu.rawText.length > 800 ? '\n... [truncated]' : ''));
      } else {
        console.log('\n📄 RAW TEXT: None');
      }
      
      // Show categories
      if (menu.categories) {
        console.log('\n📂 CATEGORIES:');
        try {
          const cats = JSON.parse(menu.categories);
          console.log(JSON.stringify(cats, null, 2));
        } catch (e) {
          console.log(menu.categories);
        }
      }

      // Show structured data preview
      if (menu.structuredData) {
        console.log('\n📊 STRUCTURED DATA PREVIEW:');
        try {
          const structured = JSON.parse(menu.structuredData);
          const preview = JSON.stringify(structured, null, 2).substring(0, 1200);
          console.log(preview + '\n... [truncated]');
        } catch (e) {
          console.log(menu.structuredData?.substring(0, 500));
        }
      }

      // Show related menu items
      const relatedItems = menu.menuItems || [];
      console.log(`\n🍽️  LINKED MENU ITEMS: ${relatedItems.length} items`);
      
      if (relatedItems.length > 0) {
        // Group by category
        const byCategory = {};
        relatedItems.forEach(item => {
          const cat = item.categoryName || 'Uncategorized';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(item);
        });
        
        console.log('\nItems by category:');
        Object.entries(byCategory).forEach(([cat, items]) => {
          console.log(`\n  [${cat}] - ${items.length} items`);
          items.slice(0, 5).forEach((item, idx) => {
            const price = item.price ? ` - ${item.price}` : '';
            console.log(`    ${idx + 1}. ${item.name}${price}`);
            if (item.description) {
              console.log(`       ${item.description.substring(0, 80)}${item.description.length > 80 ? '...' : ''}`);
            }
          });
          if (items.length > 5) {
            console.log(`    ... and ${items.length - 5} more items`);
          }
        });
      }
    }

    // Show sample menuItems from standalone query
    console.log('\n' + '='.repeat(80));
    console.log('=== SAMPLE MENU ITEMS (from direct query) ===');
    console.log('='.repeat(80));
    
    sampleMenuItems.slice(0, 15).forEach((item, idx) => {
      const price = item.price ? ` | Price: ${item.price}` : '';
      const priceNum = item.priceNumber ? ` ($${item.priceNumber})` : '';
      console.log(`\n${idx + 1}. ${item.name}`);
      console.log(`   Category: ${item.categoryName || 'N/A'}${price}${priceNum}`);
      if (item.description) {
        console.log(`   Description: ${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}`);
      }
      console.log(`   Order: ${item.itemOrder || 'N/A'} | ID: ${item.id}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total menus: ${totalMenus}`);
    console.log(`Sample menuItems shown: ${sampleMenuItems.length} (full count requires pagination)`);
    
    // Calculate average items per menu from sample
    const avgItems = menus.reduce((sum, m) => sum + (m.menuItems?.length || 0), 0) / menus.length;
    console.log(`Average items per menu (sample): ${avgItems.toFixed(1)}`);

  } catch (error) {
    console.error('Error querying database:', error);
    process.exit(1);
  }
}

queryMenuData().then(() => {
  console.log('\nQuery complete.');
  process.exit(0);
});
