// Script to check if reviewsTags field is present in database records

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

async function checkReviewsTags() {
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
  
  // Analyze reviewsTags field
  let hasReviewsTags = 0;
  let hasReviewsTagsWithData = 0;
  let hasReviewsTagsEmpty = 0;
  let noReviewsTags = 0;
  let reviewsTagsWithValidData = [];
  
  allBuffets.forEach(buffet => {
    if (buffet.reviewsTags !== undefined && buffet.reviewsTags !== null) {
      hasReviewsTags++;
      
      // Try to parse if it's a JSON string
      let parsed = null;
      if (typeof buffet.reviewsTags === 'string') {
        try {
          parsed = JSON.parse(buffet.reviewsTags);
        } catch (e) {
          // Not valid JSON, treat as empty
        }
      } else if (Array.isArray(buffet.reviewsTags)) {
        parsed = buffet.reviewsTags;
      }
      
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        hasReviewsTagsWithData++;
        reviewsTagsWithValidData.push({
          id: buffet.id,
          name: buffet.name,
          placeId: buffet.placeId,
          reviewsTags: parsed,
          count: parsed.length
        });
      } else {
        hasReviewsTagsEmpty++;
      }
    } else {
      noReviewsTags++;
    }
  });
  
  console.log('\n📊 reviewsTags Field Analysis:');
  console.log('=====================================');
  console.log(`Total buffets: ${allBuffets.length}`);
  console.log(`\nField Status:`);
  console.log(`  - Has reviewsTags field (not null/undefined): ${hasReviewsTags}`);
  console.log(`    • With valid data (array with items): ${hasReviewsTagsWithData}`);
  console.log(`    • Empty/null/empty array: ${hasReviewsTagsEmpty}`);
  console.log(`  - No reviewsTags field (null/undefined): ${noReviewsTags}`);
  
  if (reviewsTagsWithValidData.length > 0) {
    console.log(`\n✅ Found ${reviewsTagsWithValidData.length} buffets with reviewsTags data:`);
    console.log('\nSample records (first 10):');
    reviewsTagsWithValidData.slice(0, 10).forEach((record, idx) => {
      console.log(`\n${idx + 1}. ${record.name}`);
      console.log(`   PlaceId: ${record.placeId || 'N/A'}`);
      console.log(`   Tags (${record.count}):`);
      record.reviewsTags.slice(0, 10).forEach((tag, i) => {
        const title = tag.title || tag.name || tag.tag || 'Unknown';
        const count = tag.count || tag.reviewsCount || 'N/A';
        console.log(`     ${i + 1}. ${title} (${count} ${typeof count === 'number' ? 'reviews' : ''})`);
      });
      if (record.reviewsTags.length > 10) {
        console.log(`     ... and ${record.reviewsTags.length - 10} more tags`);
      }
    });
    
    if (reviewsTagsWithValidData.length > 10) {
      console.log(`\n... and ${reviewsTagsWithValidData.length - 10} more records`);
    }
  } else {
    console.log('\n⚠️  No buffets have reviewsTags data populated');
  }
  
  return {
    total: allBuffets.length,
    hasField: hasReviewsTags,
    hasData: hasReviewsTagsWithData,
    empty: hasReviewsTagsEmpty,
    missing: noReviewsTags
  };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

checkReviewsTags()
  .then(results => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error checking reviewsTags:', error);
    process.exit(1);
  });

















