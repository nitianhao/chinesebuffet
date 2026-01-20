// Script to check for missing reviews from the JSON file
const fs = require('fs');
const path = require('path');
const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');

// Load environment variables
try {
  const envPath = path.join(__dirname, '../env.local.txt');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
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
} catch (error) {}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

function stringifyIfNeeded(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

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
    author: review.author || review.name || null,
    time: review.time || review.publishAt || null,
    relativeTime: review.relativeTime || null,
  };
}

async function checkMissingReviews() {
  console.log('🔍 Checking for missing reviews...\n');

  // Step 1: Load JSON and count total reviews
  const jsonPath = path.join(__dirname, '../Example JSON/apify-reviews-cities.json');
  console.log('Step 1: Loading JSON file...');
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  let totalReviewsInJson = 0;
  jsonData.forEach(record => {
    if (Array.isArray(record.reviews)) {
      totalReviewsInJson += record.reviews.length;
    }
  });
  
  console.log(`  Total records: ${jsonData.length}`);
  console.log(`  Total reviews in JSON: ${totalReviewsInJson}\n`);

  // Step 2: Build buffet map
  console.log('Step 2: Building buffet lookup map...');
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

  // Step 3: Check each record and find missing reviews
  console.log('Step 3: Checking for missing reviews...');
  const missingReviews = [];
  let recordsChecked = 0;

  for (const record of jsonData) {
    recordsChecked++;
    const buffetId = buffetMap.get(record.placeId);
    if (!buffetId || !Array.isArray(record.reviews) || record.reviews.length === 0) {
      continue;
    }

    // Get existing reviews for this buffet
    const checkResult = await db.query({
      buffets: {
        $: { where: { id: buffetId } },
        reviewRecords: {},
      },
    });
    
    const existingReviews = checkResult.buffets?.[0]?.reviewRecords || [];
    const existingReviewKeys = new Set();
    existingReviews.forEach(r => {
      const key = r.reviewId || `${r.text || ''}_${r.name || ''}_${r.publishAt || ''}`;
      existingReviewKeys.add(key);
    });

    // Check each review in JSON
    for (const review of record.reviews) {
      const reviewKey = review.reviewId || `${review.text || ''}_${review.name || review.author || ''}_${review.publishAt || review.time || ''}`;
      
      if (!existingReviewKeys.has(reviewKey)) {
        missingReviews.push({
          record,
          review,
          buffetId,
        });
      }
    }

    if (recordsChecked % 100 === 0) {
      console.log(`  Checked ${recordsChecked}/${jsonData.length} records, found ${missingReviews.length} missing reviews so far...`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total reviews in JSON: ${totalReviewsInJson}`);
  console.log(`  Missing reviews found: ${missingReviews.length}\n`);

  if (missingReviews.length > 0) {
    console.log('📝 Missing reviews by restaurant:');
    const byRestaurant = {};
    missingReviews.forEach(({ record, review }) => {
      const name = record.Title || 'Unknown';
      if (!byRestaurant[name]) {
        byRestaurant[name] = [];
      }
      byRestaurant[name].push(review);
    });

    Object.entries(byRestaurant).forEach(([name, reviews]) => {
      console.log(`  ${name}: ${reviews.length} missing reviews`);
    });

    // Save missing reviews to a file for import
    const missingPath = path.join(__dirname, '../missing-reviews.json');
    fs.writeFileSync(missingPath, JSON.stringify(missingReviews, null, 2));
    console.log(`\n💾 Saved ${missingReviews.length} missing reviews to: ${missingPath}`);
    console.log(`\nRun the import script to add these missing reviews.`);
  } else {
    console.log('✅ All reviews are already in the database!');
  }
}

checkMissingReviews().catch(console.error);







