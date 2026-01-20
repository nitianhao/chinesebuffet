// Script to update additionalServiceOptions field for all buffet records from JSON file

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to stringify JSON fields
function stringifyIfNeeded(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

async function updateAdditionalServiceOptions() {
  console.log('Reading allcities.cleaned.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/allcities.cleaned.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: allcities.cleaned.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> additionalServiceOptions
  const additionalServiceOptionsMap = new Map();
  jsonData.forEach(record => {
    if (record.placeId && record.additionalServiceOptions) {
      // Include all records with additionalServiceOptions (even if all are false)
      additionalServiceOptionsMap.set(record.placeId, record.additionalServiceOptions);
    }
  });
  
  console.log(`Found ${additionalServiceOptionsMap.size} records with additionalServiceOptions in JSON`);
  
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
  
  // Find buffets that have matching JSON records with additionalServiceOptions
  const buffetsToUpdate = [];
  allBuffets.forEach(buffet => {
    if (buffet.placeId && additionalServiceOptionsMap.has(buffet.placeId)) {
      const additionalServiceOptions = additionalServiceOptionsMap.get(buffet.placeId);
      buffetsToUpdate.push({ 
        buffet, 
        additionalServiceOptions: stringifyIfNeeded(additionalServiceOptions) 
      });
    }
  });
  
  console.log(`\nFound ${buffetsToUpdate.length} buffets to update with additionalServiceOptions`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, additionalServiceOptions }) => {
    return db.tx.buffets[buffet.id].update({ additionalServiceOptions });
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
  
  console.log(`\n✅ Successfully updated ${updated} buffets with additionalServiceOptions!`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateAdditionalServiceOptions().catch(error => {
  console.error('Error updating additionalServiceOptions:', error);
  process.exit(1);
});

















