// Query InstantDB to get exact slug format for buffets with menu data
import { init } from '@instantdb/admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('INSTANT_ADMIN_TOKEN is required');
  process.exit(1);
}

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
});

async function queryMenuItems() {
  console.log('Querying InstantDB for menuItems...\n');

  // Query menuItems table
  const { data: menuItemsData } = await db.query({
    menuItems: {},
  });

  if (!menuItemsData?.menuItems) {
    console.log('No menuItems found');
  } else {
    console.log(`Found ${menuItemsData.menuItems.length} menu items`);
    console.log('Sample menu items:');
    menuItemsData.menuItems.slice(0, 5).forEach((item: any) => {
      console.log(`  - ${item.name} (${item.categoryName}): ${item.price}`);
      console.log(`    ID: ${item.id}`);
    });
  }

  // Let's query a small sample of buffets to check their structure
  console.log('\nQuerying some buffets with rating > 4...');
  
  const { data: buffetsData } = await db.query({
    buffets: {
      $: {
        where: {
          rating: { $gte: 4 },
        },
        limit: 50,
      },
    },
  });

  if (!buffetsData?.buffets) {
    console.log('No buffets found');
    return;
  }

  console.log(`Found ${buffetsData.buffets.length} buffets\n`);

  // Check which have menu data
  const buffetsWithMenu = buffetsData.buffets.filter((b: any) => b.menu);
  console.log(`Buffets with menu field: ${buffetsWithMenu.length}\n`);

  console.log('='.repeat(120));
  console.log('EXACT SLUG VALUES FROM DATABASE:');
  console.log('='.repeat(120));
  
  // Show all buffets regardless of menu
  for (const buffet of buffetsData.buffets.slice(0, 30)) {
    const citySlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
    const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
    const hasMenu = buffet.menu ? 'YES' : 'NO';
    
    console.log(`
Name: ${buffet.name}
  slug: "${buffet.slug}"
  cityName: "${buffet.cityName}"
  stateAbbr: "${buffet.stateAbbr}"
  hasMenu: ${hasMenu}
  Expected URL: ${expectedUrl}`);
  }
}

queryMenuItems().catch(console.error);
