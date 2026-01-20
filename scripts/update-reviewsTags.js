// Script to update buffet reviewsTags from google_places_merged_all.json based on placeId

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

async function updateReviewsTags() {
  console.log('Reading google_places_merged_all.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: google_places_merged_all.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> reviewsTags (only if reviewsTags exists and is not null/empty)
  const reviewsTagsMap = new Map();
  let recordsWithReviewsTags = 0;
  
  jsonData.forEach(record => {
    if (record.placeId && record.reviewsTags && Array.isArray(record.reviewsTags) && record.reviewsTags.length > 0) {
      reviewsTagsMap.set(record.placeId, record.reviewsTags);
      recordsWithReviewsTags++;
    }
  });
  
  console.log(`Found ${recordsWithReviewsTags} records with reviewsTags`);
  console.log(`Created map with ${reviewsTagsMap.size} placeIds -> reviewsTags`);
  
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
  
  // Find buffets that have matching placeIds and need reviewsTags updates
  const buffetsToUpdate = [];
  let alreadyHasReviewsTags = 0;
  let noPlaceId = 0;
  let noMatch = 0;
  
  allBuffets.forEach(buffet => {
    if (!buffet.placeId) {
      noPlaceId++;
      return;
    }
    
    if (reviewsTagsMap.has(buffet.placeId)) {
      const newReviewsTags = reviewsTagsMap.get(buffet.placeId);
      const stringifiedNew = stringifyIfNeeded(newReviewsTags);
      
      // Parse existing reviewsTags if it's a string
      let existingReviewsTags = null;
      if (buffet.reviewsTags) {
        if (typeof buffet.reviewsTags === 'string') {
          try {
            existingReviewsTags = JSON.parse(buffet.reviewsTags);
          } catch (e) {
            // Invalid JSON, treat as different
            existingReviewsTags = buffet.reviewsTags;
          }
        } else {
          existingReviewsTags = buffet.reviewsTags;
        }
      }
      
      // Only update if the reviewsTags is different
      // Compare arrays by converting to JSON strings
      const existingStringified = stringifyIfNeeded(existingReviewsTags);
      
      if (!existingStringified || existingStringified !== stringifiedNew) {
        buffetsToUpdate.push({ 
          buffet, 
          reviewsTags: stringifiedNew 
        });
      } else {
        alreadyHasReviewsTags++;
      }
    } else {
      noMatch++;
    }
  });
  
  console.log(`\nUpdate Summary:`);
  console.log(`  - Buffets to update: ${buffetsToUpdate.length}`);
  console.log(`  - Already have matching reviewsTags: ${alreadyHasReviewsTags}`);
  console.log(`  - No placeId in database: ${noPlaceId}`);
  console.log(`  - No matching placeId in JSON: ${noMatch}`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('\nNo updates needed!');
    return 0;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, reviewsTags }) => {
    return db.tx.buffets[buffet.id].update({ reviewsTags });
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
  
  console.log(`\n✅ Successfully updated ${updated} buffets with reviewsTags from JSON!`);
  return updated;
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateReviewsTags()
  .then(updatedCount => {
    if (updatedCount !== undefined) {
      console.log(`\n📊 Total records updated: ${updatedCount}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error updating reviewsTags:', error);
    process.exit(1);
  });

















