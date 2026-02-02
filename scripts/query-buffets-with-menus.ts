import { init } from '@instantdb/admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
});

async function main() {
  console.log('Querying menus with menuItems...\n');
  
  // First, get menus that have menuItems (limit to first 20)
  const menusResult = await db.query({
    menus: {
      $: { limit: 100 },
      menuItems: {}
    }
  });
  
  // Filter menus that actually have menuItems
  const menusWithItems = (menusResult.menus || []).filter((m: any) => m.menuItems && m.menuItems.length > 0);
  
  console.log(`Found ${menusWithItems.length} menus with menuItems (limited query)\n`);
  
  if (menusWithItems.length === 0) {
    console.log('No menus with items found');
    return;
  }
  
  // Get the first 10 placeIds
  const placeIds = menusWithItems.slice(0, 10).map((m: any) => m.placeId);
  console.log('PlaceIds to look up:', placeIds, '\n');
  
  // Query buffets one by one for each placeId
  console.log('='.repeat(80));
  console.log('Buffets with menu data:\n');
  
  for (const placeId of placeIds) {
    // Query buffet by placeId
    const buffetResult = await db.query({
      buffets: {
        $: {
          where: { placeId: placeId }
        }
      }
    });
    
    const buffet = buffetResult.buffets?.[0];
    if (!buffet) {
      console.log(`No buffet found for placeId: ${placeId}`);
      continue;
    }
    
    // Get the menu for this buffet
    const menu = menusWithItems.find((m: any) => m.placeId === placeId);
    const itemCount = (menu as any)?.menuItems?.length || 0;
    
    // Create city-state slug
    const cityStateSlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
    const urlPath = `/chinese-buffets/${cityStateSlug}/${buffet.slug}`;
    
    console.log(`Name: ${buffet.name}`);
    console.log(`City: ${buffet.cityName}, ${buffet.state}`);
    console.log(`State Abbr: ${buffet.stateAbbr}`);
    console.log(`Slug: ${buffet.slug}`);
    console.log(`PlaceId: ${buffet.placeId}`);
    console.log(`Menu Items: ${itemCount}`);
    console.log(`URL Path: ${urlPath}`);
    console.log('-'.repeat(80));
  }
}

main().catch(console.error);
