// Script to count how many buffets have a website field filled out in InstantDB

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Try to load schema - handle both TypeScript and compiled versions
let schema;
try {
  schema = require('../src/instant.schema.ts');
  schema = schema.default || schema;
} catch (e) {
  // If TypeScript import fails, try to use a minimal schema or handle differently
  console.error('Warning: Could not load schema from TypeScript file');
  console.error('This might work if you run with tsx or if the schema is compiled');
  throw e;
}

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
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
  // Silently fail if we can't read .env.local (might be permission issue)
  // User can set environment variables manually
}

async function countWebsites() {
  // Check for required environment variables
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Please set it in your .env.local file or export it before running this script');
    process.exit(1);
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';

  try {
    // Initialize the admin client
    const db = init({
      appId: appId,
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('Fetching all buffets from InstantDB...');
    
    // Query all buffets - try with a high limit first
    let allBuffets = [];
    let offset = 0;
    const limit = 10000;
    let hasMore = true;

    while (hasMore) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          }
        }
      });

      const buffets = result.buffets || [];
      allBuffets = allBuffets.concat(buffets);
      
      console.log(`Fetched ${buffets.length} buffets (total so far: ${allBuffets.length})`);
      
      if (buffets.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    console.log(`\nTotal buffets in database: ${allBuffets.length}`);

    // Count buffets with non-empty website
    const buffetsWithWebsite = allBuffets.filter(buffet => {
      const website = buffet.website;
      return website && website.trim() !== '';
    });

    const buffetsWithoutWebsite = allBuffets.length - buffetsWithWebsite.length;
    const percentage = (buffetsWithWebsite.length / allBuffets.length) * 100;

    console.log('\n=== Results ===');
    console.log(`Total records: ${allBuffets.length}`);
    console.log(`Records with website filled: ${buffetsWithWebsite.length}`);
    console.log(`Records without website: ${buffetsWithoutWebsite}`);
    console.log(`Percentage with website: ${percentage.toFixed(2)}%`);

  } catch (error) {
    console.error('Error querying InstantDB:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

countWebsites();

