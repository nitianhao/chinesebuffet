// Script to update buffet reviews from google_places_merged_all.json based on placeId
// Merges reviews from JSON with existing reviews, avoiding duplicates by reviewId

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
  // Silently fail
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

// Helper to parse reviews
function parseReviews(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

// Merge reviews from JSON with existing reviews
// Uses reviewId to avoid duplicates, prefers JSON data when reviewId matches
function mergeReviews(existingReviews, jsonReviews) {
  const existingMap = new Map();
  const jsonMap = new Map();
  
  // Index existing reviews by reviewId (if available) or create a hash
  existingReviews.forEach(review => {
    if (review.reviewId) {
      existingMap.set(review.reviewId, review);
    } else {
      // For legacy reviews without reviewId, create a hash based on text + author/name + time
      const hash = `${review.text || ''}_${review.name || review.author || ''}_${review.publishAt || review.time || ''}`;
      existingMap.set(`legacy_${hash}`, review);
    }
  });
  
  // Index JSON reviews by reviewId
  jsonReviews.forEach(review => {
    if (review.reviewId) {
      jsonMap.set(review.reviewId, review);
    }
  });
  
  // Start with all existing reviews
  const merged = [...existingReviews];
  
  // Add or update reviews from JSON
  jsonReviews.forEach(jsonReview => {
    if (jsonReview.reviewId) {
      const existing = existingMap.get(jsonReview.reviewId);
      if (existing) {
        // Update existing review with JSON data (JSON takes precedence)
        const index = merged.findIndex(r => r.reviewId === jsonReview.reviewId);
        if (index !== -1) {
          merged[index] = jsonReview;
        }
      } else {
        // Add new review
        merged.push(jsonReview);
      }
    } else {
      // JSON review without reviewId - add it if it's not a duplicate
      const hash = `${jsonReview.text || ''}_${jsonReview.name || ''}_${jsonReview.publishAt || ''}`;
      const legacyKey = `legacy_${hash}`;
      if (!existingMap.has(legacyKey)) {
        merged.push(jsonReview);
      }
    }
  });
  
  return merged;
}

async function updateReviews() {
  console.log('Reading google_places_merged_all.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: google_places_merged_all.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> reviews
  const reviewsMap = new Map();
  let recordsWithReviews = 0;
  let totalJsonReviews = 0;
  
  jsonData.forEach(record => {
    if (record.placeId && record.reviews && Array.isArray(record.reviews) && record.reviews.length > 0) {
      reviewsMap.set(record.placeId, record.reviews);
      recordsWithReviews++;
      totalJsonReviews += record.reviews.length;
    }
  });
  
  console.log(`Found ${recordsWithReviews} records with reviews`);
  console.log(`Total reviews in JSON: ${totalJsonReviews}`);
  console.log(`Created map with ${reviewsMap.size} placeIds -> reviews\n`);
  
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
  
  // Find buffets that need review updates
  const buffetsToUpdate = [];
  let stats = {
    updated: 0,
    newReviews: 0,
    existingReviews: 0,
    noPlaceId: 0,
    noMatch: 0,
    totalReviewsBefore: 0,
    totalReviewsAfter: 0
  };
  
  allBuffets.forEach(buffet => {
    if (!buffet.placeId) {
      stats.noPlaceId++;
      return;
    }
    
    if (reviewsMap.has(buffet.placeId)) {
      const jsonReviews = reviewsMap.get(buffet.placeId);
      const existingReviews = parseReviews(buffet.reviews);
      
      stats.totalReviewsBefore += existingReviews.length;
      
      // Merge reviews
      const mergedReviews = mergeReviews(existingReviews, jsonReviews);
      
      stats.totalReviewsAfter += mergedReviews.length;
      
      // Only update if there are changes
      const existingStringified = stringifyIfNeeded(existingReviews);
      const mergedStringified = stringifyIfNeeded(mergedReviews);
      
      if (existingStringified !== mergedStringified) {
        const newReviewCount = mergedReviews.length - existingReviews.length;
        stats.newReviews += newReviewCount;
        stats.existingReviews += existingReviews.length;
        
        buffetsToUpdate.push({
          buffet,
          reviews: mergedStringified,
          reviewCount: mergedReviews.length,
          newCount: newReviewCount
        });
      } else {
        stats.noMatch++;
      }
    } else {
      stats.noMatch++;
    }
  });
  
  console.log('Update Summary:');
  console.log(`  - Buffets to update: ${buffetsToUpdate.length}`);
  console.log(`  - Total reviews before: ${stats.totalReviewsBefore}`);
  console.log(`  - Total reviews after: ${stats.totalReviewsAfter}`);
  console.log(`  - New reviews to add: ${stats.newReviews}`);
  console.log(`  - No placeId: ${stats.noPlaceId}`);
  console.log(`  - No matching placeId in JSON: ${stats.noMatch}\n`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return 0;
  }
  
  // Create update transactions
  console.log('Creating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, reviews }) => {
    return db.tx.buffets[buffet.id].update({ reviews });
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
  
  console.log(`\n✅ Successfully updated ${updated} buffets with reviews from JSON!`);
  console.log(`   - Added ${stats.newReviews} new reviews`);
  console.log(`   - Updated ${stats.existingReviews} existing reviews`);
  
  return updated;
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateReviews()
  .then(updatedCount => {
    if (updatedCount !== undefined) {
      console.log(`\n📊 Total records updated: ${updatedCount}`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Error updating reviews:', error);
    process.exit(1);
  });
