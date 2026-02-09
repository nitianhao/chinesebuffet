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

async function queryMenusAndBuffets() {
  console.log('Querying InstantDB for menus...\n');

  // First, get all menus
  const { data: menusData } = await db.query({
    menus: {},
  });

  if (!menusData?.menus) {
    console.log('No menus found');
    return;
  }

  console.log(`Found ${menusData.menus.length} total menus`);

  // Filter menus that have items (checking the items field which is JSON stringified)
  const menusWithItems = menusData.menus.filter((menu: any) => {
    if (!menu.items) return false;
    try {
      const items = JSON.parse(menu.items);
      return Array.isArray(items) && items.length > 0;
    } catch {
      return false;
    }
  });

  console.log(`Found ${menusWithItems.length} menus with items\n`);
  
  // Get unique placeIds
  const placeIdsWithMenus = [...new Set(menusWithItems.map((m: any) => m.placeId).filter(Boolean))];
  console.log(`Unique placeIds with menu items: ${placeIdsWithMenus.length}\n`);

  // Sample some placeIds to query buffets
  const samplePlaceIds = placeIdsWithMenus.slice(0, 30);
  
  console.log('='.repeat(120));
  console.log('QUERYING BUFFETS BY PLACEID...');
  console.log('='.repeat(120));

  // Query buffets one by one for each placeId
  for (const placeId of samplePlaceIds) {
    const { data: buffetData } = await db.query({
      buffets: {
        $: {
          where: {
            placeId: placeId,
          },
        },
      },
    });

    if (buffetData?.buffets?.[0]) {
      const buffet = buffetData.buffets[0];
      const citySlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
      const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
      
      console.log(`
Name: ${buffet.name}
  slug: "${buffet.slug}"
  cityName: "${buffet.cityName}"
  stateAbbr: "${buffet.stateAbbr}"
  placeId: "${buffet.placeId}"
  Expected URL: ${expectedUrl}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY:');
  console.log('='.repeat(120));
  console.log(`Total menus: ${menusData.menus.length}`);
  console.log(`Menus with items: ${menusWithItems.length}`);
  console.log(`Unique placeIds: ${placeIdsWithMenus.length}`);
}

queryMenusAndBuffets().catch(console.error);
