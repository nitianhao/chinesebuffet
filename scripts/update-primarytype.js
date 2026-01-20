// Script to update existing buffet records with primaryType from JSON file
// Matches records by placeId (ID)

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function updatePrimaryTypes() {
  console.log('Reading allcities.cleaned.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/allcities.cleaned.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: allcities.cleaned.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Filter records with primaryType
  const recordsWithPrimaryType = jsonData.filter(record => record.primaryType);
  console.log(`Found ${recordsWithPrimaryType.length} records with primaryType`);
  
  // Create a map of placeId -> primaryType
  const primaryTypeMap = new Map();
  recordsWithPrimaryType.forEach(record => {
    if (record.placeId) {
      primaryTypeMap.set(record.placeId, record.primaryType);
    }
  });
  
  console.log(`Created map with ${primaryTypeMap.size} placeIds`);
  
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
  
  // Find buffets that need updating
  const buffetsToUpdate = allBuffets.filter(buffet => {
    if (!buffet.placeId) return false;
    const primaryType = primaryTypeMap.get(buffet.placeId);
    return primaryType && buffet.primaryType !== primaryType;
  });
  
  console.log(`\nFound ${buffetsToUpdate.length} buffets that need primaryType update`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(buffet => {
    const primaryType = primaryTypeMap.get(buffet.placeId);
    return db.tx.buffets[buffet.id].update({
      primaryType: primaryType
    });
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
  
  console.log(`\n✅ Successfully updated ${updated} buffets with primaryType!`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updatePrimaryTypes().catch(error => {
  console.error('Error updating primaryType:', error);
  process.exit(1);
});


















