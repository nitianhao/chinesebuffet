// Script to migrate reviews from JSON field to separate reviews table
// Run with: node scripts/migrate-reviews-to-table.js

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

async function migrateReviews() {
  console.log('🚀 Starting reviews migration...\n');

  try {
    // Step 1: Fetch all buffets (we'll filter those with reviews)
    console.log('Step 1: Fetching all buffets...');
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
        },
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < limit) break;
      offset += limit;
    }

    // Filter buffets that have reviews in JSON field
    const buffets = allBuffets.filter(b => b.reviews && b.reviews.trim() !== '');
    console.log(`  Found ${allBuffets.length} total buffets`);
    console.log(`  Found ${buffets.length} buffets with reviews field\n`);

    if (buffets.length === 0) {
      console.log('✅ No buffets with reviews found. Migration complete!');
      return;
    }

    // Step 2: Check existing reviews in the reviews table (optional - for duplicate detection)
    console.log('Step 2: Checking existing reviews in reviews table...');
    const reviewsByBuffetId = new Map();
    
    // For efficiency, we'll check reviews as we process buffets
    // This avoids querying all reviews upfront
    console.log(`  Will check for duplicates during migration\n`);

    // Step 3: Process buffets and create review records
    console.log('Step 3: Migrating reviews...');
    
    let totalReviewsProcessed = 0;
    let totalReviewsCreated = 0;
    let totalReviewsSkipped = 0;
    let buffetsProcessed = 0;
    let buffetsWithErrors = 0;

    const BATCH_SIZE = 50; // Process reviews in batches to avoid overwhelming the DB

    for (let i = 0; i < buffets.length; i += BATCH_SIZE) {
      const batch = buffets.slice(i, i + BATCH_SIZE);
      const batchTransactions = [];

      for (const buffet of batch) {
        try {
          const reviewsJson = buffet.reviews;
          const reviewsArray = parseJsonField(reviewsJson);

          if (!Array.isArray(reviewsArray) || reviewsArray.length === 0) {
            continue;
          }

          let reviewsCreatedForBuffet = 0;
          let reviewsSkippedForBuffet = 0;

          // Check if this buffet already has reviews in the table
          let existingReviewsSet = reviewsByBuffetId.get(buffet.id);
          if (!existingReviewsSet) {
            try {
              const checkResult = await db.query({
                buffets: {
                  $: { where: { id: buffet.id } },
                  reviewRecords: {},
                },
              });
              const existingReviews = checkResult.buffets?.[0]?.reviewRecords || [];
              existingReviewsSet = new Set();
              existingReviews.forEach(r => {
                const key = r.reviewId || `${r.text || ''}_${r.name || ''}_${r.publishAt || ''}`;
                existingReviewsSet.add(key);
              });
              reviewsByBuffetId.set(buffet.id, existingReviewsSet);
            } catch (error) {
              existingReviewsSet = new Set();
              reviewsByBuffetId.set(buffet.id, existingReviewsSet);
            }
          }

          for (const review of reviewsArray) {
            totalReviewsProcessed++;

            // Check if review already exists (by reviewId or by content)
            const reviewKey = review.reviewId || `${review.text || ''}_${review.name || review.author || ''}_${review.publishAt || review.time || ''}`;
            
            if (existingReviewsSet.has(reviewKey)) {
              reviewsSkippedForBuffet++;
              totalReviewsSkipped++;
              continue;
            }

            // Prepare review data
            const reviewData = prepareReviewData(review);

            // Create review transaction
            const reviewId = id();
            const reviewTx = db.tx.reviews[reviewId]
              .create(reviewData)
              .link({ buffet: buffet.id });

            batchTransactions.push(reviewTx);
            // Mark as existing before adding to transaction
            existingReviewsSet.add(reviewKey);
            reviewsCreatedForBuffet++;
            totalReviewsCreated++;
          }
          
          // Update the map with the new reviews we're about to create
          reviewsByBuffetId.set(buffet.id, existingReviewsSet);

          buffetsProcessed++;

          if (reviewsCreatedForBuffet > 0) {
            console.log(`  ✓ ${buffet.name}: Created ${reviewsCreatedForBuffet} reviews${reviewsSkippedForBuffet > 0 ? `, skipped ${reviewsSkippedForBuffet} duplicates` : ''}`);
          }
        } catch (error) {
          console.error(`  ✗ Error processing ${buffet.name}:`, error.message);
          buffetsWithErrors++;
        }
      }

      // Execute batch transaction
      if (batchTransactions.length > 0) {
        try {
          await db.transact(batchTransactions);
          console.log(`  → Committed batch: ${batchTransactions.length} reviews created\n`);
        } catch (error) {
          console.error(`  ✗ Error committing batch:`, error.message);
          buffetsWithErrors += batch.length;
        }
      }
    }

    // Step 4: Summary
    console.log('\n📊 Migration Summary:');
    console.log(`  Buffets processed: ${buffetsProcessed}/${buffets.length}`);
    console.log(`  Total reviews processed: ${totalReviewsProcessed}`);
    console.log(`  Reviews created: ${totalReviewsCreated}`);
    console.log(`  Reviews skipped (duplicates): ${totalReviewsSkipped}`);
    if (buffetsWithErrors > 0) {
      console.log(`  ⚠ Buffets with errors: ${buffetsWithErrors}`);
    }

    console.log('\n✅ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Verify the data looks correct in your InstantDB dashboard');
    console.log('  2. Test that buffet detail pages load reviews correctly');
    console.log('  3. Once confirmed, you can optionally remove the JSON reviews field');
    console.log('     from the schema (it will remain for backward compatibility)');

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

migrateReviews();

