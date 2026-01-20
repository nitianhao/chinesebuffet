// Comprehensive verification script
const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables
try {
  const envPath = path.join(__dirname, '../.env.local');
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
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function verifyMigration() {
  console.log('🔍 Comprehensive Migration Verification\n');
  console.log('=' .repeat(60));
  
  // 1. Count total reviews in table
  console.log('\n1. Checking reviews table...');
  let totalReviews = 0;
  let reviewsWithLinks = 0;
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      reviews: {
        $: { 
          limit: limit,
          offset: offset,
        },
        buffet: {},
      },
    });
    
    const reviews = result.reviews || [];
    if (reviews.length === 0) break;
    
    totalReviews += reviews.length;
    reviewsWithLinks += reviews.filter(r => r.buffet?.id).length;
    
    if (reviews.length < limit) break;
    offset += limit;
  }
  
  console.log(`  ✓ Total reviews in table: ${totalReviews.toLocaleString()}`);
  console.log(`  ✓ Reviews with buffet links: ${reviewsWithLinks.toLocaleString()} (${((reviewsWithLinks/totalReviews)*100).toFixed(1)}%)`);
  
  // 2. Check buffets with reviews
  console.log('\n2. Checking buffets with linked reviews...');
  let buffetsWithReviews = 0;
  let totalLinkedReviews = 0;
  offset = 0;
  
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
    
    buffets.forEach(b => {
      const count = b.reviewRecords?.length || 0;
      if (count > 0) {
        buffetsWithReviews++;
        totalLinkedReviews += count;
      }
    });
    
    if (buffets.length < limit) break;
    offset += limit;
    
    // Sample first batch for details
    if (offset === limit) {
      const sampleBuffet = buffets.find(b => (b.reviewRecords?.length || 0) > 0);
      if (sampleBuffet) {
        console.log(`  ✓ Sample: "${sampleBuffet.name}" has ${sampleBuffet.reviewRecords.length} reviews`);
      }
    }
  }
  
  console.log(`  ✓ Buffets with reviews: ${buffetsWithReviews}`);
  console.log(`  ✓ Total reviews linked to buffets: ${totalLinkedReviews.toLocaleString()}`);
  
  // 3. Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Migration Status:');
  console.log(`  Reviews in table: ${totalReviews.toLocaleString()}`);
  console.log(`  Reviews linked: ${reviewsWithLinks.toLocaleString()}`);
  console.log(`  Buffets with reviews: ${buffetsWithReviews}`);
  
  if (totalReviews > 0 && reviewsWithLinks === totalReviews) {
    console.log('\n✅ SUCCESS: All reviews are properly linked!');
  } else if (totalReviews > 0) {
    console.log(`\n⚠️  WARNING: ${totalReviews - reviewsWithLinks} reviews are missing links`);
  } else {
    console.log('\n❌ ERROR: No reviews found in table');
  }
  
  console.log('\n' + '='.repeat(60));
}

verifyMigration().catch(error => {
  console.error('\n❌ Error:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});







