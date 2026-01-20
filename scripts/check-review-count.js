// Quick script to check actual review count in database
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
} catch (error) {
  // Try env.local.txt as fallback
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
  } catch (e) {}
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function checkCount() {
  console.log('🔍 Checking review count in database...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    let totalReviews = 0;
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        reviews: {
          $: {
            limit: limit,
            offset: offset,
          },
        },
      });
      
      const reviews = result.reviews || [];
      if (reviews.length === 0) break;
      
      totalReviews += reviews.length;
      console.log(`  Counted ${totalReviews.toLocaleString()} reviews so far...`);
      
      if (reviews.length < limit) break;
      offset += limit;
    }
    
    console.log(`\n✅ Total reviews in database: ${totalReviews.toLocaleString()}`);
    
    // Also check a sample
    const sampleResult = await db.query({
      reviews: {
        $: { limit: 5 },
        buffet: {},
      },
    });
    
    if (sampleResult.reviews && sampleResult.reviews.length > 0) {
      console.log(`\n📝 Sample reviews:`);
      sampleResult.reviews.forEach((r, i) => {
        console.log(`  ${i + 1}. "${r.name}" - ${r.stars} stars - Buffet: ${r.buffet?.name || 'No link'}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCount();







