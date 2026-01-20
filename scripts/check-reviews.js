// Script to check reviews in database

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

async function checkReviews() {
  console.log('Fetching buffets with reviews from database...');
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
  
  console.log(`\nTotal buffets: ${allBuffets.length}`);
  
  let hasReviews = 0;
  let totalReviews = 0;
  let sampleReviewKeys = new Set();
  
  allBuffets.forEach(buffet => {
    if (buffet.reviews) {
      let parsed = buffet.reviews;
      if (typeof buffet.reviews === 'string') {
        try {
          parsed = JSON.parse(buffet.reviews);
        } catch (e) {
          return;
        }
      }
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        hasReviews++;
        totalReviews += parsed.length;
        
        // Collect keys from first review
        if (parsed[0] && typeof parsed[0] === 'object') {
          Object.keys(parsed[0]).forEach(key => sampleReviewKeys.add(key));
        }
      }
    }
  });
  
  console.log(`\n📊 Reviews Analysis:`);
  console.log(`  - Buffets with reviews: ${hasReviews}`);
  console.log(`  - Total reviews: ${totalReviews}`);
  console.log(`  - Average reviews per buffet: ${hasReviews > 0 ? (totalReviews / hasReviews).toFixed(1) : 0}`);
  console.log(`  - Review keys found: ${Array.from(sampleReviewKeys).join(', ')}`);
  
  return { hasReviews, totalReviews, sampleReviewKeys: Array.from(sampleReviewKeys) };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

checkReviews()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

















