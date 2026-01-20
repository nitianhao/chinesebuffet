// Script to fix city links for all buffets in InstantDB
// This will link buffets to cities based on cityName and stateAbbr

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to normalize city name
function normalizeCityName(cityName) {
  if (!cityName) return '';
  return cityName
    .replace(/ city \(balance\)/gi, '')
    .replace(/ city/gi, '')
    .replace(/\/.*$/g, '')
    .replace(/-.*$/g, '')
    .trim()
    .toLowerCase();
}

async function fixCityLinks() {
  console.log('Fixing city links for all buffets...\n');
  
  try {
    // Fetch all cities
    console.log('1. Fetching all cities...');
    const citiesResult = await db.query({ cities: {} });
    const cities = citiesResult.cities || [];
    console.log(`   ✓ Found ${cities.length} cities`);
    
    // Create a map: cityName-stateAbbr -> cityId
    const cityMap = new Map();
    cities.forEach(city => {
      const key = `${normalizeCityName(city.city)}-${city.stateAbbr.toLowerCase()}`;
      cityMap.set(key, city.id);
      // Also add by slug
      cityMap.set(city.slug, city.id);
    });
    console.log(`   ✓ Created city map with ${cityMap.size} entries`);
    
    // Fetch all buffets
    console.log('\n2. Fetching all buffets...');
    const buffetsResult = await db.query({
      buffets: {
        $: {
          limit: 10000,
        },
        city: {}
      }
    });
    const buffets = buffetsResult.buffets || [];
    console.log(`   ✓ Found ${buffets.length} buffets`);
    
    // Find buffets without city links
    const buffetsWithoutCity = buffets.filter(b => !b.city);
    const buffetsWithCity = buffets.filter(b => b.city);
    console.log(`   - ${buffetsWithCity.length} buffets already have city links`);
    console.log(`   - ${buffetsWithoutCity.length} buffets need city links`);
    
    if (buffetsWithoutCity.length === 0) {
      console.log('\n✓ All buffets already have city links!');
      return;
    }
    
    // Create update transactions
    console.log('\n3. Creating link transactions...');
    const linkTxs = [];
    let matched = 0;
    let unmatched = 0;
    
    for (const buffet of buffetsWithoutCity) {
      const cityName = normalizeCityName(buffet.cityName || '');
      const stateAbbr = (buffet.stateAbbr || '').toLowerCase();
      const key = `${cityName}-${stateAbbr}`;
      
      const cityId = cityMap.get(key);
      
      if (cityId) {
        // Link buffet to city
        linkTxs.push(
          db.tx.buffets[buffet.id].link({ city: cityId })
        );
        matched++;
      } else {
        unmatched++;
        if (unmatched <= 10) {
          console.log(`   ⚠ No city found for: ${buffet.name} (${buffet.cityName}, ${buffet.stateAbbr})`);
        }
      }
    }
    
    console.log(`   ✓ Created ${linkTxs.length} link transactions`);
    console.log(`   - ${matched} buffets matched to cities`);
    console.log(`   - ${unmatched} buffets couldn't be matched`);
    
    // Execute transactions in batches
    if (linkTxs.length > 0) {
      console.log(`\n4. Applying city links in batches...`);
      const BATCH_SIZE = 100;
      const totalBatches = Math.ceil(linkTxs.length / BATCH_SIZE);
      
      for (let i = 0; i < linkTxs.length; i += BATCH_SIZE) {
        const batch = linkTxs.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        try {
          await db.transact(batch);
          console.log(`   ✓ Linked batch ${batchNum}/${totalBatches} (${batch.length} buffets)`);
        } catch (error) {
          console.error(`   ✗ Error linking batch ${batchNum}:`, error.message);
        }
      }
      
      console.log(`\n✓ Successfully linked ${linkTxs.length} buffets to cities!`);
    }
    
    // Verify results
    console.log('\n5. Verifying results...');
    const verifyResult = await db.query({
      buffets: {
        $: {
          limit: 10000,
        },
        city: {}
      }
    });
    const verifyBuffets = verifyResult.buffets || [];
    const withLinks = verifyBuffets.filter(b => b.city).length;
    const withoutLinks = verifyBuffets.length - withLinks;
    
    console.log(`   ✓ Total buffets: ${verifyBuffets.length}`);
    console.log(`   ✓ Buffets with city links: ${withLinks}`);
    console.log(`   ⚠ Buffets without city links: ${withoutLinks}`);
    
    if (withLinks > 0) {
      console.log(`\n✅ Success! ${withLinks} buffets now have city links.`);
    }
    
  } catch (error) {
    console.error('\n✗ Error:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

fixCityLinks();




















