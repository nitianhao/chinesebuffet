// Script to update buffet popularTimesHistogram, webResults, and orderBy from google_places_merged_all.json based on placeId

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
  // Silently fail if .env.local can't be read
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

// Helper to parse field
function parseField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

async function updateMultipleFields() {
  console.log('Reading google_places_merged_all.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: google_places_merged_all.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON\n`);
  
  // Create maps for each field
  const popularTimesHistogramMap = new Map();
  const webResultsMap = new Map();
  const orderByMap = new Map();
  
  jsonData.forEach(record => {
    if (record.placeId) {
      // popularTimesHistogram
      if (record.popularTimesHistogram && typeof record.popularTimesHistogram === 'object' && Object.keys(record.popularTimesHistogram).length > 0) {
        popularTimesHistogramMap.set(record.placeId, record.popularTimesHistogram);
      }
      
      // webResults
      if (record.webResults && Array.isArray(record.webResults) && record.webResults.length > 0) {
        webResultsMap.set(record.placeId, record.webResults);
      }
      
      // orderBy
      if (record.orderBy && Array.isArray(record.orderBy) && record.orderBy.length > 0) {
        orderByMap.set(record.placeId, record.orderBy);
      }
    }
  });
  
  console.log(`Created maps:`);
  console.log(`  - popularTimesHistogram: ${popularTimesHistogramMap.size} placeIds`);
  console.log(`  - webResults: ${webResultsMap.size} placeIds`);
  console.log(`  - orderBy: ${orderByMap.size} placeIds\n`);
  
  // Fetch all existing buffets from database
  console.log('Fetching existing buffets from database...');
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
  
  console.log(`Total buffets in database: ${allBuffets.length}\n`);
  
  // Find buffets that need updates
  const buffetsToUpdate = [];
  const stats = {
    popularTimesHistogram: { toUpdate: 0, alreadyHas: 0 },
    webResults: { toUpdate: 0, alreadyHas: 0 },
    orderBy: { toUpdate: 0, alreadyHas: 0 },
    noPlaceId: 0,
    noMatch: 0
  };
  
  allBuffets.forEach(buffet => {
    if (!buffet.placeId) {
      stats.noPlaceId++;
      return;
    }
    
    const updates = {};
    let needsUpdate = false;
    
    // Check popularTimesHistogram
    if (popularTimesHistogramMap.has(buffet.placeId)) {
      const newValue = popularTimesHistogramMap.get(buffet.placeId);
      const stringifiedNew = stringifyIfNeeded(newValue);
      const existing = parseField(buffet.popularTimesHistogram);
      const existingStringified = stringifyIfNeeded(existing);
      
      if (!existingStringified || existingStringified !== stringifiedNew) {
        updates.popularTimesHistogram = stringifiedNew;
        needsUpdate = true;
        stats.popularTimesHistogram.toUpdate++;
      } else {
        stats.popularTimesHistogram.alreadyHas++;
      }
    }
    
    // Check webResults
    if (webResultsMap.has(buffet.placeId)) {
      const newValue = webResultsMap.get(buffet.placeId);
      const stringifiedNew = stringifyIfNeeded(newValue);
      const existing = parseField(buffet.webResults);
      const existingStringified = stringifyIfNeeded(existing);
      
      if (!existingStringified || existingStringified !== stringifiedNew) {
        updates.webResults = stringifiedNew;
        needsUpdate = true;
        stats.webResults.toUpdate++;
      } else {
        stats.webResults.alreadyHas++;
      }
    }
    
    // Check orderBy
    if (orderByMap.has(buffet.placeId)) {
      const newValue = orderByMap.get(buffet.placeId);
      const stringifiedNew = stringifyIfNeeded(newValue);
      const existing = parseField(buffet.orderBy);
      const existingStringified = stringifyIfNeeded(existing);
      
      if (!existingStringified || existingStringified !== stringifiedNew) {
        updates.orderBy = stringifiedNew;
        needsUpdate = true;
        stats.orderBy.toUpdate++;
      } else {
        stats.orderBy.alreadyHas++;
      }
    }
    
    if (needsUpdate) {
      buffetsToUpdate.push({ buffet, updates });
    } else if (popularTimesHistogramMap.has(buffet.placeId) || webResultsMap.has(buffet.placeId) || orderByMap.has(buffet.placeId)) {
      stats.noMatch++;
    }
  });
  
  console.log('Update Summary:');
  console.log(`  popularTimesHistogram: ${stats.popularTimesHistogram.toUpdate} to update, ${stats.popularTimesHistogram.alreadyHas} already have`);
  console.log(`  webResults: ${stats.webResults.toUpdate} to update, ${stats.webResults.alreadyHas} already have`);
  console.log(`  orderBy: ${stats.orderBy.toUpdate} to update, ${stats.orderBy.alreadyHas} already have`);
  console.log(`  No placeId: ${stats.noPlaceId}`);
  console.log(`  No match: ${stats.noMatch}`);
  console.log(`  Total buffets to update: ${buffetsToUpdate.length}\n`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return { popularTimesHistogram: 0, webResults: 0, orderBy: 0 };
  }
  
  // Create update transactions
  console.log('Creating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, updates }) => {
    return db.tx.buffets[buffet.id].update(updates);
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
  
  console.log(`\n✅ Successfully updated ${updated} buffets!`);
  console.log(`   - popularTimesHistogram: ${stats.popularTimesHistogram.toUpdate} records`);
  console.log(`   - webResults: ${stats.webResults.toUpdate} records`);
  console.log(`   - orderBy: ${stats.orderBy.toUpdate} records`);
  
  return {
    popularTimesHistogram: stats.popularTimesHistogram.toUpdate,
    webResults: stats.webResults.toUpdate,
    orderBy: stats.orderBy.toUpdate
  };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateMultipleFields()
  .then(results => {
    if (results) {
      console.log(`\n📊 Total records updated:`);
      console.log(`   popularTimesHistogram: ${results.popularTimesHistogram}`);
      console.log(`   webResults: ${results.webResults}`);
      console.log(`   orderBy: ${results.orderBy}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error updating fields:', error);
    process.exit(1);
  });

















