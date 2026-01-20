// Quick script to check if reviews are linked to buffets
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

async function checkLinks() {
  console.log('Checking review links...\n');
  
  // Check from reviews side
  const reviewsResult = await db.query({
    reviews: {
      $: { limit: 5 },
      buffet: {},
    },
  });
  
  const reviews = reviewsResult.reviews || [];
  console.log(`Found ${reviews.length} reviews`);
  
  reviews.forEach((review, i) => {
    console.log(`\nReview ${i + 1}:`);
    console.log(`  Name: ${review.name}`);
    console.log(`  Stars: ${review.stars}`);
    console.log(`  Has buffet link: ${!!review.buffet}`);
    if (review.buffet) {
      console.log(`  Buffet ID: ${review.buffet.id}`);
      console.log(`  Buffet name: ${review.buffet.name || 'N/A'}`);
    }
  });
  
  // Check from buffet side
  console.log('\n\nChecking from buffet side...\n');
  const buffetResult = await db.query({
    buffets: {
      $: { limit: 3 },
      reviewRecords: {},
    },
  });
  
  const buffets = buffetResult.buffets || [];
  buffets.forEach((buffet, i) => {
    const reviewCount = buffet.reviewRecords?.length || 0;
    console.log(`\nBuffet ${i + 1}: ${buffet.name}`);
    console.log(`  Review count: ${reviewCount}`);
  });
}

checkLinks().catch(console.error);







