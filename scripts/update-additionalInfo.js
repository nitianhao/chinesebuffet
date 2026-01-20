// Script to update buffet additionalInfo from google_places_merged_all.json based on placeId

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
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
} catch (error) {
  // Silently fail if .env.local can't be read (e.g., permissions issue)
  // User can set INSTANT_ADMIN_TOKEN directly in environment
}

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

// Helper to check if additionalInfo has meaningful service options data
function hasServiceOptionsData(additionalInfo) {
  if (!additionalInfo) return false;
  
  let parsed = additionalInfo;
  if (typeof additionalInfo === 'string') {
    try {
      parsed = JSON.parse(additionalInfo);
    } catch (e) {
      return false;
    }
  }
  
  if (!parsed || typeof parsed !== 'object') return false;
  
  // Check for service-related keys (not just technical fields)
  const serviceKeys = [
    'Service options', 'Highlights', 'Popular for', 'Accessibility',
    'Offerings', 'Dining options', 'Amenities', 'Atmosphere',
    'Crowd', 'Planning', 'Payments', 'Children', 'Parking'
  ];
  
  return serviceKeys.some(key => parsed[key] && Array.isArray(parsed[key]) && parsed[key].length > 0);
}

async function updateAdditionalInfo() {
  console.log('Reading google_places_merged_all.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: google_places_merged_all.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> additionalInfo (only if additionalInfo exists and has service options)
  const additionalInfoMap = new Map();
  let recordsWithAdditionalInfo = 0;
  
  jsonData.forEach(record => {
    if (record.placeId && record.additionalInfo && typeof record.additionalInfo === 'object' && hasServiceOptionsData(record.additionalInfo)) {
      additionalInfoMap.set(record.placeId, record.additionalInfo);
      recordsWithAdditionalInfo++;
    }
  });
  
  console.log(`Found ${recordsWithAdditionalInfo} records with additionalInfo (service options data)`);
  console.log(`Created map with ${additionalInfoMap.size} placeIds -> additionalInfo`);
  
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
  
  // Find buffets that have matching placeIds and need additionalInfo updates
  const buffetsToUpdate = [];
  let alreadyHasAdditionalInfo = 0;
  let noPlaceId = 0;
  let noMatch = 0;
  
  allBuffets.forEach(buffet => {
    if (!buffet.placeId) {
      noPlaceId++;
      return;
    }
    
    if (additionalInfoMap.has(buffet.placeId)) {
      const newAdditionalInfo = additionalInfoMap.get(buffet.placeId);
      const stringifiedNew = stringifyIfNeeded(newAdditionalInfo);
      
      // Parse existing additionalInfo if it's a string
      let existingAdditionalInfo = null;
      if (buffet.additionalInfo) {
        if (typeof buffet.additionalInfo === 'string') {
          try {
            existingAdditionalInfo = JSON.parse(buffet.additionalInfo);
          } catch (e) {
            // Invalid JSON, treat as different
            existingAdditionalInfo = buffet.additionalInfo;
          }
        } else {
          existingAdditionalInfo = buffet.additionalInfo;
        }
      }
      
      // Check if existing has service options data
      const existingHasServiceData = hasServiceOptionsData(existingAdditionalInfo);
      
      // Only update if:
      // 1. No existing additionalInfo, OR
      // 2. Existing doesn't have service options data, OR
      // 3. The data is different
      const existingStringified = stringifyIfNeeded(existingAdditionalInfo);
      
      if (!existingStringified || !existingHasServiceData || existingStringified !== stringifiedNew) {
        buffetsToUpdate.push({ 
          buffet, 
          additionalInfo: stringifiedNew 
        });
      } else {
        alreadyHasAdditionalInfo++;
      }
    } else {
      noMatch++;
    }
  });
  
  console.log(`\nUpdate Summary:`);
  console.log(`  - Buffets to update: ${buffetsToUpdate.length}`);
  console.log(`  - Already have matching additionalInfo: ${alreadyHasAdditionalInfo}`);
  console.log(`  - No placeId in database: ${noPlaceId}`);
  console.log(`  - No matching placeId in JSON: ${noMatch}`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('\nNo updates needed!');
    return 0;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, additionalInfo }) => {
    return db.tx.buffets[buffet.id].update({ additionalInfo });
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
  
  console.log(`\n✅ Successfully updated ${updated} buffets with additionalInfo from JSON!`);
  return updated;
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateAdditionalInfo()
  .then(updatedCount => {
    if (updatedCount !== undefined) {
      console.log(`\n📊 Total records updated: ${updatedCount}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error updating additionalInfo:', error);
    process.exit(1);
  });

















