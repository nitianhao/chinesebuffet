// Query InstantDB to check menu-buffet placeId relationship
const { init } = require('@instantdb/admin');
require('dotenv').config({ path: '.env.local' });

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

async function main() {
  console.log('=== Checking Menu-Buffet PlaceId Relationship ===\n');

  // 1. Get 5 sample menus
  console.log('--- 5 Sample Menus ---');
  const menusResult = await db.query({ menus: { $: { limit: 5 } } });
  const menus = menusResult.menus || [];
  
  console.log(`Found ${menus.length} menus in sample`);
  menus.forEach((menu, i) => {
    console.log(`${i + 1}. placeId: ${menu.placeId}, sourceUrl: ${menu.sourceUrl?.substring(0, 50)}...`);
  });

  // 2. Get 5 sample buffets (limit fields to avoid size issues)
  console.log('\n--- 5 Sample Buffets ---');
  const buffetsResult = await db.query({ buffets: { $: { limit: 5 } } });
  const buffets = buffetsResult.buffets || [];
  
  console.log(`Found ${buffets.length} buffets in sample`);
  buffets.forEach((buffet, i) => {
    console.log(`${i + 1}. placeId: ${buffet.placeId}, name: ${buffet.name}`);
  });

  // 3. Get all menus (much smaller table)
  console.log('\n--- Checking for PlaceId Matches ---');
  const allMenusResult = await db.query({ menus: {} });
  const allMenus = allMenusResult.menus || [];
  const menuPlaceIds = [...new Set(allMenus.map(m => m.placeId))];
  
  console.log(`Total menus in database: ${allMenus.length}`);
  console.log(`Unique menu placeIds: ${menuPlaceIds.length}`);

  // 4. Check specific menu placeIds against buffets
  console.log('\n--- Checking specific menu placeIds against buffets ---');
  
  // Take first 10 menu placeIds and check if buffets exist
  const samplePlaceIds = menuPlaceIds.slice(0, 10);
  let matchCount = 0;
  let unmatchedPlaceIds = [];
  
  for (const placeId of samplePlaceIds) {
    const buffetResult = await db.query({
      buffets: { $: { where: { placeId: placeId }, limit: 1 } }
    });
    
    const matchedBuffet = buffetResult.buffets?.[0];
    if (matchedBuffet) {
      matchCount++;
      console.log(`✓ MATCH: ${placeId} -> ${matchedBuffet.name}`);
    } else {
      unmatchedPlaceIds.push(placeId);
      console.log(`✗ NO MATCH: ${placeId}`);
    }
  }
  
  console.log(`\n--- Summary (first 10 placeIds) ---`);
  console.log(`Matched: ${matchCount}`);
  console.log(`Unmatched: ${unmatchedPlaceIds.length}`);

  // 5. Let's also grab some buffet placeIds to compare formats
  console.log('\n--- Format Comparison ---');
  console.log('Menu placeIds (first 5):');
  menuPlaceIds.slice(0, 5).forEach((id, i) => console.log(`  ${i + 1}. ${id}`));
  
  console.log('\nBuffet placeIds (from initial sample):');
  buffets.forEach((b, i) => console.log(`  ${i + 1}. ${b.placeId}`));

  // 6. Count total matches by querying in batches
  console.log('\n--- Counting All Matches (batched) ---');
  let totalMatches = 0;
  const batchSize = 50;
  
  for (let i = 0; i < Math.min(menuPlaceIds.length, 200); i += batchSize) {
    const batch = menuPlaceIds.slice(i, i + batchSize);
    
    for (const placeId of batch) {
      const result = await db.query({
        buffets: { $: { where: { placeId: placeId }, limit: 1 } }
      });
      if (result.buffets?.length > 0) {
        totalMatches++;
      }
    }
    console.log(`Checked ${Math.min(i + batchSize, menuPlaceIds.length)} of ${menuPlaceIds.length}... matches so far: ${totalMatches}`);
  }
  
  console.log(`\n=== FINAL RESULT ===`);
  console.log(`Total menus: ${allMenus.length}`);
  console.log(`Menus checked: ${Math.min(200, menuPlaceIds.length)}`);
  console.log(`Menus with matching buffet: ${totalMatches}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
