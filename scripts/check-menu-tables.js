// Check menuItems and menus tables in InstantDB

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

async function checkMenuTables() {
  console.log('Connecting to InstantDB...');
  
  const db = init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  try {
    // Check menuItems table
    console.log('\n1. Checking menuItems table...');
    const menuItemsResult = await db.query({
      menuItems: {
        $: { limit: 100 }
      }
    });
    console.log(`   Found ${menuItemsResult.menuItems?.length || 0} menuItems`);
    
    if (menuItemsResult.menuItems?.length > 0) {
      console.log('\n   Sample menuItems:');
      menuItemsResult.menuItems.slice(0, 5).forEach(item => {
        console.log(`   - ${item.name} | ${item.categoryName} | ${item.price}`);
      });
    }

    // Check menus table
    console.log('\n2. Checking menus table...');
    const menusResult = await db.query({
      menus: {
        $: { limit: 100 }
      }
    });
    console.log(`   Found ${menusResult.menus?.length || 0} menus`);
    
    if (menusResult.menus?.length > 0) {
      console.log('\n   Sample menus:');
      menusResult.menus.slice(0, 5).forEach(menu => {
        console.log(`   - placeId: ${menu.placeId} | status: ${menu.status}`);
      });
    }

    // If no menu tables have data, let's check ALL buffets with slug samples
    console.log('\n3. Sampling buffet slugs (regardless of menu data)...');
    const buffetsResult = await db.query({
      buffets: {
        $: { limit: 50 }
      }
    });
    
    console.log(`   Found ${buffetsResult.buffets?.length || 0} sample buffets`);
    console.log('\n   Sample slugs:');
    buffetsResult.buffets?.slice(0, 20).forEach(buffet => {
      const citySlug = `${(buffet.cityName || '').toLowerCase().replace(/\s+/g, '-')}-${(buffet.stateAbbr || '').toLowerCase()}`;
      const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
      console.log(`   slug: "${buffet.slug}" | city: ${buffet.cityName}, ${buffet.stateAbbr}`);
      console.log(`         URL: ${expectedUrl}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMenuTables().catch(console.error);
