// Script to update adrFormatAddress field for all buffet records from JSON file
// Extracts adrFormatAddress from addressFormats.adrFormatAddress

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function updateAdrFormatAddress() {
  console.log('Reading allcities.cleaned.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/allcities.cleaned.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: allcities.cleaned.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> adrFormatAddress (extracted from addressFormats)
  const adrFormatAddressMap = new Map();
  jsonData.forEach(record => {
    if (record.placeId && record.addressFormats && record.addressFormats.adrFormatAddress) {
      adrFormatAddressMap.set(record.placeId, record.addressFormats.adrFormatAddress);
    }
  });
  
  console.log(`Found ${adrFormatAddressMap.size} records with adrFormatAddress in JSON`);
  
  // Fetch all existing buffets from database
  console.log('\nFetching existing buffets from database...');
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      buffets: {
        $: {
          limit: limit,
          offset: offset,
        }
      }
    });
    
    const buffets = result.buffets || [];
    if (buffets.length === 0) break;
    
    allBuffets = allBuffets.concat(buffets);
    console.log(`  Fetched ${allBuffets.length} buffets so far...`);
    
    if (buffets.length < limit) break;
    offset += limit;
  }
  
  console.log(`Total buffets in database: ${allBuffets.length}`);
  
  // Find buffets that have matching JSON records with adrFormatAddress
  const buffetsToUpdate = [];
  allBuffets.forEach(buffet => {
    if (buffet.placeId && adrFormatAddressMap.has(buffet.placeId)) {
      const adrFormatAddress = adrFormatAddressMap.get(buffet.placeId);
      buffetsToUpdate.push({ 
        buffet, 
        adrFormatAddress: adrFormatAddress // Already a string, no need to stringify
      });
    }
  });
  
  console.log(`\nFound ${buffetsToUpdate.length} buffets to update with adrFormatAddress`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, adrFormatAddress }) => {
    return db.tx.buffets[buffet.id].update({ adrFormatAddress });
  });
  
  // Execute updates in batches
  const batchSize = 100;
  let updated = 0;
  
  for (let i = 0; i < updateTxs.length; i += batchSize) {
    const batch = updateTxs.slice(i, i + batchSize);
    await db.transact(batch);
    updated += batch.length;
    console.log(`  ✓ Updated ${updated}/${buffetsToUpdate.length} buffets...`);
  }
  
  console.log(`\n✅ Successfully updated ${updated} buffets with adrFormatAddress!`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateAdrFormatAddress().catch(error => {
  console.error('Error updating adrFormatAddress:', error);
  process.exit(1);
});

















