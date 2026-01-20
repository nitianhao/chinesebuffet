// Script to check if reviewsDistribution field is present in database records

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

async function checkReviewsDistribution() {
  console.log('Fetching all buffets from database...');
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
  
  console.log(`\nTotal buffets in database: ${allBuffets.length}`);
  
  // Analyze reviewsDistribution field
  let hasReviewsDistribution = 0;
  let hasReviewsDistributionWithData = 0;
  let hasReviewsDistributionEmpty = 0;
  let noReviewsDistribution = 0;
  let reviewsDistributionWithValidData = [];
  
  allBuffets.forEach(buffet => {
    if (buffet.reviewsDistribution !== undefined && buffet.reviewsDistribution !== null) {
      hasReviewsDistribution++;
      
      // Try to parse if it's a JSON string
      let parsed = null;
      if (typeof buffet.reviewsDistribution === 'string') {
        try {
          parsed = JSON.parse(buffet.reviewsDistribution);
        } catch (e) {
          // Not valid JSON, treat as empty
        }
      } else if (typeof buffet.reviewsDistribution === 'object') {
        parsed = buffet.reviewsDistribution;
      }
      
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        hasReviewsDistributionWithData++;
        reviewsDistributionWithValidData.push({
          id: buffet.id,
          name: buffet.name,
          placeId: buffet.placeId,
          reviewsDistribution: parsed,
          keys: Object.keys(parsed)
        });
      } else {
        hasReviewsDistributionEmpty++;
      }
    } else {
      noReviewsDistribution++;
    }
  });
  
  console.log('\n📊 reviewsDistribution Field Analysis:');
  console.log('=====================================');
  console.log(`Total buffets: ${allBuffets.length}`);
  console.log(`\nField Status:`);
  console.log(`  - Has reviewsDistribution field (not null/undefined): ${hasReviewsDistribution}`);
  console.log(`    • With valid data (object with keys): ${hasReviewsDistributionWithData}`);
  console.log(`    • Empty/null/empty object: ${hasReviewsDistributionEmpty}`);
  console.log(`  - No reviewsDistribution field (null/undefined): ${noReviewsDistribution}`);
  
  if (reviewsDistributionWithValidData.length > 0) {
    console.log(`\n✅ Found ${reviewsDistributionWithValidData.length} buffets with reviewsDistribution data:`);
    console.log('\nSample records (first 10):');
    reviewsDistributionWithValidData.slice(0, 10).forEach((record, idx) => {
      console.log(`\n${idx + 1}. ${record.name}`);
      console.log(`   PlaceId: ${record.placeId || 'N/A'}`);
      console.log(`   Distribution keys: ${record.keys.join(', ')}`);
      console.log(`   Distribution values:`);
      record.keys.forEach(key => {
        const value = record.reviewsDistribution[key];
        console.log(`     ${key}: ${value}`);
      });
    });
    
    if (reviewsDistributionWithValidData.length > 10) {
      console.log(`\n... and ${reviewsDistributionWithValidData.length - 10} more records`);
    }
  } else {
    console.log('\n⚠️  No buffets have reviewsDistribution data populated');
  }
  
  return {
    total: allBuffets.length,
    hasField: hasReviewsDistribution,
    hasData: hasReviewsDistributionWithData,
    empty: hasReviewsDistributionEmpty,
    missing: noReviewsDistribution
  };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

checkReviewsDistribution()
  .then(results => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error checking reviewsDistribution:', error);
    process.exit(1);
  });

















