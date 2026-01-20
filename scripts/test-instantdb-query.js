// Test script to verify InstantDB queries are working
// Run with: node scripts/test-instantdb-query.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
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

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function testQueries() {
  console.log('Testing InstantDB queries...\n');
  
  try {
    // Test 1: Query cities
    console.log('1. Testing cities query...');
    const citiesResult = await db.query({ cities: {} });
    console.log(`   ✓ Found ${citiesResult.cities?.length || 0} cities`);
    
    // Test 2: Query buffets without limit
    console.log('\n2. Testing buffets query (no limit)...');
    const buffetsResult1 = await db.query({
      buffets: {
        city: {}
      }
    });
    const count1 = buffetsResult1.buffets?.length || 0;
    console.log(`   ✓ Found ${count1} buffets`);
    
    // Test 3: Query buffets with limit
    console.log('\n3. Testing buffets query (with limit: 10000)...');
    const buffetsResult2 = await db.query({
      buffets: {
        $: {
          limit: 10000,
        },
        city: {}
      }
    });
    const count2 = buffetsResult2.buffets?.length || 0;
    console.log(`   ✓ Found ${count2} buffets`);
    
    // Test 4: Check city links
    if (count2 > 0) {
      const withCityLinks = buffetsResult2.buffets.filter(b => b.city).length;
      const withoutCityLinks = count2 - withCityLinks;
      console.log(`\n4. City link analysis:`);
      console.log(`   ✓ Buffets with city links: ${withCityLinks}`);
      console.log(`   ⚠ Buffets without city links: ${withoutCityLinks}`);
      
      // Show sample buffets
      console.log(`\n5. Sample buffets (first 5):`);
      buffetsResult2.buffets.slice(0, 5).forEach((b, i) => {
        console.log(`   ${i + 1}. ${b.name || 'Unknown'} (ID: ${b.id}, City: ${b.city?.slug || 'none'})`);
      });
    }
    
    // Summary
    console.log(`\n=== Summary ===`);
    console.log(`Cities: ${citiesResult.cities?.length || 0}`);
    console.log(`Buffets (no limit): ${count1}`);
    console.log(`Buffets (with limit): ${count2}`);
    console.log(`Expected: ~5,180 buffets`);
    
    if (count2 < 100) {
      console.log(`\n⚠ WARNING: Only ${count2} buffets found, expected ~5,180!`);
      console.log(`This suggests a query limit issue.`);
    } else {
      console.log(`\n✓ Query appears to be working correctly!`);
    }
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
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

testQueries();




















