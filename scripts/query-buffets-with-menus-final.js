// Get buffets that have menus via placeId match

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

async function queryBuffetsWithMenus() {
  console.log('Connecting to InstantDB...');
  
  const db = init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  try {
    // Get all menus with SUCCESS status
    console.log('\n1. Fetching all menus...');
    let allMenus = [];
    let offset = 0;
    const limit = 500;
    
    while (true) {
      const result = await db.query({
        menus: {
          $: { limit, offset }
        }
      });
      
      const menus = result.menus || [];
      if (menus.length === 0) break;
      
      allMenus = allMenus.concat(menus);
      if (menus.length < limit) break;
      offset += limit;
    }
    
    console.log(`   Total menus: ${allMenus.length}`);
    
    // Get placeIds with successful menus that have items
    const placeIdsWithMenus = new Set();
    for (const menu of allMenus) {
      if (menu.status === 'SUCCESS' && menu.placeId) {
        // Check if menu has actual items data
        if (menu.items || menu.structuredData) {
          placeIdsWithMenus.add(menu.placeId);
        }
      }
    }
    console.log(`   PlaceIds with menu data: ${placeIdsWithMenus.size}`);

    // Get all buffets
    console.log('\n2. Fetching all buffets...');
    let allBuffets = [];
    offset = 0;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: { limit: 1000, offset }
        }
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < 1000) break;
      offset += 1000;
    }
    
    console.log(`   Total buffets: ${allBuffets.length}`);

    // Match buffets with menus
    const buffetsWithMenus = allBuffets.filter(b => 
      b.placeId && placeIdsWithMenus.has(b.placeId)
    );
    
    console.log(`\n3. Buffets with matching menus: ${buffetsWithMenus.length}`);

    // Output results
    console.log('\n' + '='.repeat(140));
    console.log('BUFFETS WITH MENU DATA - EXACT SLUG FORMAT');
    console.log('='.repeat(140));
    
    console.log('\n| slug                                     | cityName           | stateAbbr | placeId                           | URL');
    console.log('|' + '-'.repeat(42) + '|' + '-'.repeat(20) + '|' + '-'.repeat(11) + '|' + '-'.repeat(35) + '|' + '-'.repeat(60));
    
    for (const buffet of buffetsWithMenus) {
      const citySlug = `${(buffet.cityName || '').toLowerCase().replace(/\s+/g, '-')}-${(buffet.stateAbbr || '').toLowerCase()}`;
      const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
      console.log(`| ${(buffet.slug || '').padEnd(40)} | ${(buffet.cityName || '').padEnd(18)} | ${(buffet.stateAbbr || '').padEnd(9)} | ${(buffet.placeId || '').padEnd(33)} | ${expectedUrl}`);
    }

    // Summary
    console.log('\n' + '='.repeat(140));
    console.log('SUMMARY');
    console.log('='.repeat(140));
    console.log(`
Total buffets: ${allBuffets.length}
Total menus: ${allMenus.length}
Buffets with menu data: ${buffetsWithMenus.length}

URL FORMAT:
  /chinese-buffets/{cityName-lowercase-hyphenated}-{stateAbbr-lowercase}/{slug}

SLUG FORMAT:
  - Slug does NOT contain city name
  - Slug is typically: restaurant-name-hyphenated or restaurant-name-hyphenated-stateabbr
  - Examples:
    - "china-buffet"
    - "great-wall-buffet"
    - "panda-express-or"
    - "asian-buffet-grill"
`);

  } catch (error) {
    console.error('Error:', error);
  }
}

queryBuffetsWithMenus().catch(console.error);
