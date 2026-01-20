// Script to update buffet review summaries from apify-reviews-mid-tier-cities.json based on placeId

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

// Try without schema first - InstantDB may auto-detect optional fields
let db;
try {
  db = init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    // Don't pass schema - let InstantDB auto-detect
  });
} catch (error) {
  // Fallback to schema if needed
  db = init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });
}

async function updateReviewSummaries() {
  console.log('Reading apify-reviews-mid-tier-cities.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/apify-reviews-mid-tier-cities.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: apify-reviews-mid-tier-cities.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> { reviewSummaryParagraph1, reviewSummaryParagraph2 }
  const summariesMap = new Map();
  let recordsWithSummaries = 0;
  
  jsonData.forEach(record => {
    if (record.placeId && (record.reviewSummaryParagraph1 || record.reviewSummaryParagraph2)) {
      summariesMap.set(record.placeId, {
        reviewSummaryParagraph1: record.reviewSummaryParagraph1 || null,
        reviewSummaryParagraph2: record.reviewSummaryParagraph2 || null,
      });
      recordsWithSummaries++;
    }
  });
  
  console.log(`Found ${recordsWithSummaries} records with review summaries`);
  console.log(`Created map with ${summariesMap.size} placeIds -> summaries\n`);
  
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
  
  // Find buffets that need review summary updates
  const buffetsToUpdate = [];
  let stats = {
    updated: 0,
    noPlaceId: 0,
    noMatch: 0,
    alreadyHasSummaries: 0,
  };
  
  allBuffets.forEach(buffet => {
    if (!buffet.placeId) {
      stats.noPlaceId++;
      return;
    }
    
    if (summariesMap.has(buffet.placeId)) {
      const summaries = summariesMap.get(buffet.placeId);
      
      // Check if update is needed
      const needsUpdate = 
        buffet.reviewSummaryParagraph1 !== summaries.reviewSummaryParagraph1 ||
        buffet.reviewSummaryParagraph2 !== summaries.reviewSummaryParagraph2;
      
      if (needsUpdate) {
        buffetsToUpdate.push({
          buffet,
          reviewSummaryParagraph1: summaries.reviewSummaryParagraph1,
          reviewSummaryParagraph2: summaries.reviewSummaryParagraph2,
        });
      } else {
        stats.alreadyHasSummaries++;
      }
    } else {
      stats.noMatch++;
    }
  });
  
  console.log('Update Summary:');
  console.log(`  - Buffets to update: ${buffetsToUpdate.length}`);
  console.log(`  - Already have matching summaries: ${stats.alreadyHasSummaries}`);
  console.log(`  - No placeId: ${stats.noPlaceId}`);
  console.log(`  - No matching placeId in JSON: ${stats.noMatch}\n`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return 0;
  }
  
  // Execute updates one at a time (more reliable for schema changes)
  console.log('Updating buffets one at a time...');
  let updated = 0;
  let errors = 0;
  
  for (const { buffet, reviewSummaryParagraph1, reviewSummaryParagraph2 } of buffetsToUpdate) {
    try {
      await db.transact(
        db.tx.buffets[buffet.id].update({
          reviewSummaryParagraph1,
          reviewSummaryParagraph2,
        })
      );
      updated++;
      if (updated % 50 === 0) {
        console.log(`  ✓ Updated ${updated}/${buffetsToUpdate.length} buffets...`);
      }
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  ✗ Error updating buffet ${buffet.id} (${buffet.name}):`, error.message);
      }
      if (errors === 5) {
        console.log(`  ... (suppressing further errors, ${errors} total so far)`);
      }
    }
  }
  
  console.log(`\n✅ Successfully updated ${updated} buffets with review summaries from JSON!`);
  if (errors > 0) {
    console.log(`   ⚠️  ${errors} errors encountered`);
  }
  
  return updated;
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateReviewSummaries()
  .then(updatedCount => {
    if (updatedCount !== undefined) {
      console.log(`\n📊 Total records updated: ${updatedCount}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error updating review summaries:', error);
    process.exit(1);
  });












