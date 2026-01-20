// Script to check if imageCategories field is present in database records

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

async function checkImageCategories() {
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
  
  // Analyze imageCategories field
  let hasImageCategories = 0;
  let hasImageCategoriesWithData = 0;
  let hasImageCategoriesEmpty = 0;
  let noImageCategories = 0;
  let imageCategoriesWithValidData = [];
  
  allBuffets.forEach(buffet => {
    if (buffet.imageCategories !== undefined && buffet.imageCategories !== null) {
      hasImageCategories++;
      
      // Try to parse if it's a JSON string
      let parsed = null;
      if (typeof buffet.imageCategories === 'string') {
        try {
          parsed = JSON.parse(buffet.imageCategories);
        } catch (e) {
          // Not valid JSON, treat as empty
        }
      } else if (Array.isArray(buffet.imageCategories)) {
        parsed = buffet.imageCategories;
      }
      
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        hasImageCategoriesWithData++;
        imageCategoriesWithValidData.push({
          id: buffet.id,
          name: buffet.name,
          placeId: buffet.placeId,
          imageCategories: parsed,
          count: parsed.length
        });
      } else {
        hasImageCategoriesEmpty++;
      }
    } else {
      noImageCategories++;
    }
  });
  
  console.log('\n📊 imageCategories Field Analysis:');
  console.log('=====================================');
  console.log(`Total buffets: ${allBuffets.length}`);
  console.log(`\nField Status:`);
  console.log(`  - Has imageCategories field (not null/undefined): ${hasImageCategories}`);
  console.log(`    • With valid data (array with items): ${hasImageCategoriesWithData}`);
  console.log(`    • Empty/null/empty array: ${hasImageCategoriesEmpty}`);
  console.log(`  - No imageCategories field (null/undefined): ${noImageCategories}`);
  
  if (imageCategoriesWithValidData.length > 0) {
    console.log(`\n✅ Found ${imageCategoriesWithValidData.length} buffets with imageCategories data:`);
    console.log('\nSample records (first 10):');
    imageCategoriesWithValidData.slice(0, 10).forEach((record, idx) => {
      console.log(`\n${idx + 1}. ${record.name}`);
      console.log(`   PlaceId: ${record.placeId || 'N/A'}`);
      console.log(`   Categories (${record.count}): ${record.imageCategories.join(', ')}`);
    });
    
    if (imageCategoriesWithValidData.length > 10) {
      console.log(`\n... and ${imageCategoriesWithValidData.length - 10} more records`);
    }
  } else {
    console.log('\n⚠️  No buffets have imageCategories data populated');
  }
  
  return {
    total: allBuffets.length,
    hasField: hasImageCategories,
    hasData: hasImageCategoriesWithData,
    empty: hasImageCategoriesEmpty,
    missing: noImageCategories
  };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

checkImageCategories()
  .then(results => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error checking imageCategories:', error);
    process.exit(1);
  });

















