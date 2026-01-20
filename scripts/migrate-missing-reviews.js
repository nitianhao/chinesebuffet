// Script to migrate remaining reviews that failed in the first migration
// Run with: node scripts/migrate-missing-reviews.js

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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
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
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to parse JSON field
function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value;
  }
  return null;
}

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

async function migrateMissingReviews() {
  console.log('🚀 Migrating missing reviews...\n');

  try {
    // Step 1: Find buffets that have reviews in JSON but not in table
    console.log('Step 1: Finding buffets with missing reviews...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          },
          reviewRecords: {},
        },
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < limit) break;
      offset += limit;
    }

    // Filter buffets that need migration
    const buffetsToMigrate = [];
    for (const buffet of allBuffets) {
      const jsonReviews = parseJsonField(buffet.reviews);
      const jsonReviewCount = Array.isArray(jsonReviews) ? jsonReviews.length : 0;
      const tableReviewCount = buffet.reviewRecords?.length || 0;
      
      if (jsonReviewCount > 0 && jsonReviewCount > tableReviewCount) {
        buffetsToMigrate.push({
          ...buffet,
          jsonReviews,
          jsonReviewCount,
          tableReviewCount,
          missingCount: jsonReviewCount - tableReviewCount,
        });
      }
    }

    console.log(`  Found ${buffetsToMigrate.length} buffets needing migration`);
    console.log(`  Total missing reviews: ${buffetsToMigrate.reduce((sum, b) => sum + b.missingCount, 0)}\n`);

    if (buffetsToMigrate.length === 0) {
      console.log('✅ No missing reviews found. Migration complete!');
      return;
    }

    // Step 2: Migrate reviews
    console.log('Step 2: Migrating reviews...\n');
    
    let totalReviewsCreated = 0;
    let totalReviewsSkipped = 0;
    let buffetsProcessed = 0;
    let buffetsWithErrors = 0;

    const BATCH_SIZE = 50; // Smaller batches for better reliability

    for (let i = 0; i < buffetsToMigrate.length; i += BATCH_SIZE) {
      const batch = buffetsToMigrate.slice(i, i + BATCH_SIZE);
      const batchTransactions = [];

      for (const buffet of batch) {
        try {
          // Check existing reviews for this buffet
          const checkResult = await db.query({
            buffets: {
              $: { where: { id: buffet.id } },
              reviewRecords: {},
            },
          });
          
          const existingReviews = checkResult.buffets?.[0]?.reviewRecords || [];
          const existingReviewsSet = new Set();
          existingReviews.forEach(r => {
            const key = r.reviewId || `${r.text || ''}_${r.name || ''}_${r.publishAt || ''}`;
            existingReviewsSet.add(key);
          });

          const reviewsArray = buffet.jsonReviews;
          const reviewsToCreate = [];

          // Collect reviews that need to be created
          for (const review of reviewsArray) {
            const reviewKey = review.reviewId || `${review.text || ''}_${review.name || review.author || ''}_${review.publishAt || review.time || ''}`;
            
            if (!existingReviewsSet.has(reviewKey)) {
              reviewsToCreate.push(review);
              existingReviewsSet.add(reviewKey);
            } else {
              totalReviewsSkipped++;
            }
          }

          // Process reviews in smaller batches to avoid transaction size limits
          const REVIEWS_PER_TRANSACTION = 50;
          for (let j = 0; j < reviewsToCreate.length; j += REVIEWS_PER_TRANSACTION) {
            const reviewBatch = reviewsToCreate.slice(j, j + REVIEWS_PER_TRANSACTION);
            const transactionBatch = [];

            for (const review of reviewBatch) {
              const reviewData = prepareReviewData(review);
              const reviewId = id();
              const reviewTx = db.tx.reviews[reviewId]
                .create(reviewData)
                .link({ buffet: buffet.id });

              transactionBatch.push(reviewTx);
            }

            // Execute this batch of reviews
            if (transactionBatch.length > 0) {
              try {
                await db.transact(transactionBatch);
                totalReviewsCreated += transactionBatch.length;
              } catch (error) {
                console.error(`  ✗ Error committing reviews for ${buffet.name}:`, error.message);
                buffetsWithErrors++;
                break; // Stop processing this buffet if there's an error
              }
            }
          }

          buffetsProcessed++;

          if (reviewsToCreate.length > 0) {
            console.log(`  ✓ ${buffet.name}: Created ${reviewsToCreate.length} reviews`);
          }
        } catch (error) {
          console.error(`  ✗ Error processing ${buffet.name}:`, error.message);
          buffetsWithErrors++;
        }
      }
    }

    // Step 3: Summary
    console.log('\n📊 Migration Summary:');
    console.log(`  Buffets processed: ${buffetsProcessed}/${buffetsToMigrate.length}`);
    console.log(`  Reviews created: ${totalReviewsCreated}`);
    console.log(`  Reviews skipped (duplicates): ${totalReviewsSkipped}`);
    if (buffetsWithErrors > 0) {
      console.log(`  ⚠ Buffets with errors: ${buffetsWithErrors}`);
    }

    console.log('\n✅ Migration complete!');

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migration
if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

migrateMissingReviews();

