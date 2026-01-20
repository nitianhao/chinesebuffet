// Script to count buffets with menu_url filled
// Run with: node check-menu-url-count.js
const { init } = require('@instantdb/admin');
const schema = require('./src/instant.schema.ts');

async function countMenuUrls() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('Fetching all buffets...');
  
  // Fetch all buffets with a high limit
  const result = await db.query({
    buffets: {
      $: {
        limit: 10000,
      }
    }
  });

  const buffets = result.buffets || [];
  console.log(`Total buffets: ${buffets.length}`);

  let countWithMenuUrl = 0;
  let countWithMenuUrlInYelp = 0;
  let countWithDirectMenuUrl = 0;
  let countWithMenuField = 0;

  // Check each buffet
  for (const buffet of buffets) {
    // Check menu field (after merge, menuUrl values are stored here)
    if (buffet.menu && typeof buffet.menu === 'string' && buffet.menu.trim()) {
      // Check if it looks like a URL (starts with http)
      if (buffet.menu.trim().startsWith('http')) {
        countWithMenuField++;
        countWithMenuUrl++;
        countWithDirectMenuUrl++;
        continue;
      }
    }
    
    // Check for direct menu_url field (legacy, will be removed after migration)
    if (buffet.menu_url && buffet.menu_url.trim()) {
      countWithDirectMenuUrl++;
      countWithMenuUrl++;
      continue;
    }
    
    // Check for menuUrl field (legacy, will be removed after migration)
    if (buffet.menuUrl && buffet.menuUrl.trim()) {
      countWithDirectMenuUrl++;
      countWithMenuUrl++;
      continue;
    }

    // Check inside yelpData JSON
    if (buffet.yelpData) {
      try {
        const yelpData = typeof buffet.yelpData === 'string' 
          ? JSON.parse(buffet.yelpData) 
          : buffet.yelpData;
        
        // Check various possible locations for menu_url
        if (yelpData?.menu_url && yelpData.menu_url.trim()) {
          countWithMenuUrlInYelp++;
          countWithMenuUrl++;
          continue;
        }
        
        if (yelpData?.details?.menu_url && yelpData.details.menu_url.trim()) {
          countWithMenuUrlInYelp++;
          countWithMenuUrl++;
          continue;
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }

  console.log('\n=== Results ===');
  console.log(`Total buffets: ${buffets.length}`);
  console.log(`Buffets with menu_url (any location): ${countWithMenuUrl}`);
  console.log(`  - In menu field: ${countWithMenuField}`);
  console.log(`  - Direct menu_url/menuUrl field (legacy): ${countWithDirectMenuUrl}`);
  console.log(`  - menu_url in yelpData: ${countWithMenuUrlInYelp}`);
  console.log(`Buffets without menu_url: ${buffets.length - countWithMenuUrl}`);
  console.log(`Percentage with menu_url: ${((countWithMenuUrl / buffets.length) * 100).toFixed(2)}%`);
}

countMenuUrls().catch(console.error);

