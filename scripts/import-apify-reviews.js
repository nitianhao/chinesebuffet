// Script to import reviews from apify-reviews-cities.json to InstantDB reviews table
// Run with: node scripts/import-apify-reviews.js

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      // Match key=value format
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to stringify JSON fields for review storage
function stringifyIfNeeded(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

// Transform review object to InstantDB format
function prepareReviewData(review) {
  return {
    reviewerId: review.reviewerId || null,
    reviewerUrl: review.reviewerUrl || null,
    name: review.name || '',
    reviewerNumberOfReviews: review.reviewerNumberOfReviews || null,
    isLocalGuide: review.isLocalGuide || null,
    reviewerPhotoUrl: review.reviewerPhotoUrl || null,
    text: review.text || '',
    textTranslated: review.textTranslated || null,
    publishAt: review.publishAt || review.time || '',
    publishedAtDate: review.publishedAtDate || null,
    likesCount: review.likesCount || null,
    reviewId: review.reviewId || null,
    reviewUrl: review.reviewUrl || null,
    reviewOrigin: review.reviewOrigin || null,
    stars: review.stars || review.rating || 0,
    rating: review.rating || review.stars || null,
    responseFromOwnerDate: review.responseFromOwnerDate || null,
    responseFromOwnerText: review.responseFromOwnerText || null,
    reviewImageUrls: stringifyIfNeeded(review.reviewImageUrls),
    reviewContext: stringifyIfNeeded(review.reviewContext),
    reviewDetailedRating: stringifyIfNeeded(review.reviewDetailedRating),
    visitedIn: review.visitedIn || null,
    originalLanguage: review.originalLanguage || null,
    translatedLanguage: review.translatedLanguage || null,
    // Legacy fields for backward compatibility
    author: review.author || review.name || null,
    time: review.time || review.publishAt || null,
    relativeTime: review.relativeTime || null,
  };
}

async function importReviews() {
  console.log('🚀 Starting Apify reviews import...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    // Step 1: Load the JSON file
    const jsonPath = path.join(__dirname, '../Example JSON/apify-reviews-mid-tier-cities.json');
    console.log('Step 1: Loading JSON file...');
    
    if (!fs.existsSync(jsonPath)) {
      console.error(`Error: File not found at ${jsonPath}`);
      process.exit(1);
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`  Loaded ${jsonData.length} records from JSON file\n`);

    // Step 2: Build a map of placeId -> buffet ID
    console.log('Step 2: Building buffet lookup map by placeId...');
    const buffetMap = new Map();
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          },
        },
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      buffets.forEach(buffet => {
        if (buffet.placeId) {
          buffetMap.set(buffet.placeId, buffet.id);
        }
      });
      
      if (buffets.length < limit) break;
      offset += limit;
    }
    
    console.log(`  Found ${buffetMap.size} buffets with placeId\n`);

    // Step 3: Process records and create reviews
    console.log('Step 3: Processing reviews...');
    
    let totalRecordsProcessed = 0;
    let totalReviewsProcessed = 0;
    let totalReviewsCreated = 0;
    let totalReviewsSkipped = 0;
    let recordsWithNoBuffet = 0;
    let recordsWithErrors = 0;

    const RECORD_BATCH_SIZE = 10; // Process records in smaller batches
    const TRANSACTION_BATCH_SIZE = 20; // Smaller transaction batches to avoid "too many parameters" error

    for (let i = 0; i < jsonData.length; i += RECORD_BATCH_SIZE) {
      const recordBatch = jsonData.slice(i, i + RECORD_BATCH_SIZE);
      const existingReviewsCache = new Map(); // Cache existing reviews per buffet

      // First, collect all reviews to create
      const reviewsToCreate = [];

      for (const record of recordBatch) {
        try {
          totalRecordsProcessed++;

          // Find buffet by placeId
          const buffetId = buffetMap.get(record.placeId);
          if (!buffetId) {
            recordsWithNoBuffet++;
            if (recordsWithNoBuffet <= 10) {
              console.log(`  ⚠ No buffet found for placeId: ${record.placeId} (${record.Title})`);
            }
            continue;
          }

          // Get or cache existing reviews for this buffet
          let existingReviewsSet = existingReviewsCache.get(buffetId);
          if (!existingReviewsSet) {
            try {
              const checkResult = await db.query({
                buffets: {
                  $: { where: { id: buffetId } },
                  reviewRecords: {},
                },
              });
              const existingReviews = checkResult.buffets?.[0]?.reviewRecords || [];
              existingReviewsSet = new Set();
              existingReviews.forEach(r => {
                const key = r.reviewId || `${r.text || ''}_${r.name || ''}_${r.publishAt || ''}`;
                existingReviewsSet.add(key);
              });
              existingReviewsCache.set(buffetId, existingReviewsSet);
            } catch (error) {
              existingReviewsSet = new Set();
              existingReviewsCache.set(buffetId, existingReviewsSet);
            }
          }

          // Process reviews for this record
          if (!Array.isArray(record.reviews) || record.reviews.length === 0) {
            continue;
          }

          let reviewsCreatedForRecord = 0;
          let reviewsSkippedForRecord = 0;

          for (const review of record.reviews) {
            totalReviewsProcessed++;

            // Check if review already exists
            const reviewKey = review.reviewId || `${review.text || ''}_${review.name || review.author || ''}_${review.publishAt || review.time || ''}`;
            
            if (existingReviewsSet.has(reviewKey)) {
              reviewsSkippedForRecord++;
              totalReviewsSkipped++;
              continue;
            }

            // Prepare review data
            const reviewData = prepareReviewData(review);

            // Add to list of reviews to create
            reviewsToCreate.push({
              reviewData,
              buffetId,
              recordTitle: record.Title,
            });

            existingReviewsSet.add(reviewKey);
            reviewsCreatedForRecord++;
          }

          if (reviewsCreatedForRecord > 0 || reviewsSkippedForRecord > 0) {
            console.log(`  ✓ ${record.Title}: Prepared ${reviewsCreatedForRecord} reviews${reviewsSkippedForRecord > 0 ? `, skipped ${reviewsSkippedForRecord} duplicates` : ''}`);
          }
        } catch (error) {
          console.error(`  ✗ Error processing ${record.Title || 'unknown'}:`, error.message);
          recordsWithErrors++;
        }
      }

      // Now commit reviews in smaller transaction batches
      for (let j = 0; j < reviewsToCreate.length; j += TRANSACTION_BATCH_SIZE) {
        const transactionBatch = reviewsToCreate.slice(j, j + TRANSACTION_BATCH_SIZE);
        const batchTransactions = [];

        for (const { reviewData, buffetId } of transactionBatch) {
          const reviewId = id();
          const reviewTx = db.tx.reviews[reviewId]
            .create(reviewData)
            .link({ buffet: buffetId });
          batchTransactions.push(reviewTx);
        }

        if (batchTransactions.length > 0) {
          try {
            await db.transact(batchTransactions);
            totalReviewsCreated += batchTransactions.length;
            console.log(`  → Committed transaction: ${batchTransactions.length} reviews (total created: ${totalReviewsCreated})`);
          } catch (error) {
            console.error(`  ✗ Error committing transaction (${batchTransactions.length} reviews):`, error.message);
            recordsWithErrors += transactionBatch.length;
            // Don't count these as created since they failed
          }
        }
      }

      if (reviewsToCreate.length > 0) {
        console.log(`  → Completed batch: ${i + 1}-${Math.min(i + RECORD_BATCH_SIZE, jsonData.length)}/${jsonData.length} records\n`);
      }
    }

    // Step 4: Summary
    console.log('\n📊 Import Summary:');
    console.log(`  Records processed: ${totalRecordsProcessed}/${jsonData.length}`);
    console.log(`  Records with no matching buffet: ${recordsWithNoBuffet}`);
    console.log(`  Total reviews processed: ${totalReviewsProcessed}`);
    console.log(`  Reviews created: ${totalReviewsCreated}`);
    console.log(`  Reviews skipped (duplicates): ${totalReviewsSkipped}`);
    if (recordsWithErrors > 0) {
      console.log(`  ⚠ Records with errors: ${recordsWithErrors}`);
    }

    console.log('\n✅ Import complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the data looks correct in your InstantDB dashboard');
    console.log('  2. Test that buffet detail pages load reviews correctly');

  } catch (error) {
    console.error('\n❌ Error during import:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run import
importReviews();

