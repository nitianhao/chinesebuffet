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

async function queryBuffetsWithMenus() {
  console.log('Querying InstantDB for buffets with menu data...\n');

  // First, get all menus with menuItems
  const { data: menusData } = await db.query({
    menus: {
      menuItems: {},
    },
  });

  // Get placeIds that have menus with menuItems
  const placeIdsWithMenus = new Set<string>();
  if (menusData?.menus) {
    for (const menu of menusData.menus) {
      if (menu.menuItems && menu.menuItems.length > 0 && menu.placeId) {
        placeIdsWithMenus.add(menu.placeId);
      }
    }
  }
  
  console.log(`Found ${placeIdsWithMenus.size} menus with menuItems\n`);

  // Query buffets
  const { data: buffetsData } = await db.query({
    buffets: {},
  });

  if (!buffetsData?.buffets) {
    console.log('No buffets found');
    return;
  }

  // Filter buffets that have matching menus
  const buffetsWithMenus = buffetsData.buffets.filter(
    (buffet: any) => buffet.placeId && placeIdsWithMenus.has(buffet.placeId)
  );

  console.log(`Found ${buffetsWithMenus.length} buffets with menu data\n`);
  console.log('='.repeat(120));
  console.log('EXACT SLUG VALUES FROM DATABASE:');
  console.log('='.repeat(120));
  
  // Print first 30 buffets with exact slug values
  const sample = buffetsWithMenus.slice(0, 30);
  
  for (const buffet of sample) {
    const citySlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
    const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
    
    console.log(`
Name: ${buffet.name}
  slug: "${buffet.slug}"
  cityName: "${buffet.cityName}"
  stateAbbr: "${buffet.stateAbbr}"
  placeId: "${buffet.placeId}"
  Expected URL: ${expectedUrl}
`);
  }

  // Summary table
  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY TABLE (all buffets with menus):');
  console.log('='.repeat(120));
  console.log('| Slug | City | State | Expected URL |');
  console.log('|' + '-'.repeat(40) + '|' + '-'.repeat(20) + '|' + '-'.repeat(8) + '|' + '-'.repeat(60) + '|');
  
  for (const buffet of buffetsWithMenus) {
    const citySlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
    const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
    console.log(`| ${(buffet.slug || '').padEnd(38)} | ${(buffet.cityName || '').padEnd(18)} | ${(buffet.stateAbbr || '').padEnd(6)} | ${expectedUrl.padEnd(58)} |`);
  }
}

queryBuffetsWithMenus().catch(console.error);
