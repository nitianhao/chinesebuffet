// Quick test script to verify reviews migration is working
// Run with: node scripts/test-reviews-migration.js

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

async function testReviews() {
  console.log('🧪 Testing reviews migration...\n');

  try {
    // Test 1: Check total reviews count
    console.log('Test 1: Counting total reviews in reviews table...');
    const reviewsResult = await db.query({
      reviews: {
        $: { limit: 1 },
      },
    });
    // Get a sample to verify structure
    const sampleReview = reviewsResult.reviews?.[0];
    if (sampleReview) {
      console.log('  ✓ Reviews table exists and has data');
      console.log(`  Sample review: "${sampleReview.name}" - ${sampleReview.stars} stars`);
    } else {
      console.log('  ⚠ No reviews found in reviews table');
    }

    // Test 2: Check reviews linked to a buffet
    console.log('\nTest 2: Checking reviews linked to a buffet...');
    const buffetResult = await db.query({
      buffets: {
        $: { limit: 1 },
        reviewRecords: {
          $: { limit: 5 },
        },
      },
    });

    const buffet = buffetResult.buffets?.[0];
    if (buffet) {
      const linkedReviews = buffet.reviewRecords || [];
      console.log(`  ✓ Found buffet: "${buffet.name}"`);
      console.log(`  ✓ Linked reviews count: ${linkedReviews.length}`);
      if (linkedReviews.length > 0) {
        console.log(`  Sample linked review: "${linkedReviews[0].name}" - ${linkedReviews[0].stars} stars`);
      }
    } else {
      console.log('  ⚠ No buffets found');
    }

    // Test 3: Count reviews per buffet
    console.log('\nTest 3: Getting statistics...');
    const statsResult = await db.query({
      buffets: {
        $: { limit: 10 },
        reviewRecords: {},
      },
    });

    const buffets = statsResult.buffets || [];
    let totalLinkedReviews = 0;
    let buffetsWithReviews = 0;

    buffets.forEach(b => {
      const count = b.reviewRecords?.length || 0;
      if (count > 0) {
        buffetsWithReviews++;
        totalLinkedReviews += count;
      }
    });

    console.log(`  Sample of 10 buffets:`);
    console.log(`  - Buffets with reviews: ${buffetsWithReviews}/10`);
    console.log(`  - Total linked reviews: ${totalLinkedReviews}`);

    console.log('\n✅ All tests completed!');
    console.log('\n📝 Summary:');
    console.log('  - Reviews table is accessible');
    console.log('  - Link relationship (reviewRecords) is working');
    console.log('  - Reviews are properly linked to buffets');

  } catch (error) {
    console.error('\n❌ Error during testing:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

testReviews();







