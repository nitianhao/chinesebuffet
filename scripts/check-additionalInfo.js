// Script to check if additionalInfo field is present in database records

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

async function checkAdditionalInfo() {
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
  
  // Analyze additionalInfo field
  let hasAdditionalInfo = 0;
  let hasAdditionalInfoWithData = 0;
  let hasAdditionalInfoEmpty = 0;
  let noAdditionalInfo = 0;
  let additionalInfoWithValidData = [];
  const categoryCounts = new Map();
  
  allBuffets.forEach(buffet => {
    if (buffet.additionalInfo !== undefined && buffet.additionalInfo !== null) {
      hasAdditionalInfo++;
      
      // Try to parse if it's a JSON string
      let parsed = null;
      if (typeof buffet.additionalInfo === 'string') {
        try {
          parsed = JSON.parse(buffet.additionalInfo);
        } catch (e) {
          // Not valid JSON, treat as empty
        }
      } else if (typeof buffet.additionalInfo === 'object') {
        parsed = buffet.additionalInfo;
      }
      
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        hasAdditionalInfoWithData++;
        
        // Count categories
        Object.keys(parsed).forEach(category => {
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        });
        
        additionalInfoWithValidData.push({
          id: buffet.id,
          name: buffet.name,
          placeId: buffet.placeId,
          additionalInfo: parsed,
          categoryCount: Object.keys(parsed).length,
          categories: Object.keys(parsed)
        });
      } else {
        hasAdditionalInfoEmpty++;
      }
    } else {
      noAdditionalInfo++;
    }
  });
  
  console.log('\n📊 additionalInfo Field Analysis:');
  console.log('=====================================');
  console.log(`Total buffets: ${allBuffets.length}`);
  console.log(`\nField Status:`);
  console.log(`  - Has additionalInfo field (not null/undefined): ${hasAdditionalInfo}`);
  console.log(`    • With valid data (object with keys): ${hasAdditionalInfoWithData}`);
  console.log(`    • Empty/null/empty object: ${hasAdditionalInfoEmpty}`);
  console.log(`  - No additionalInfo field (null/undefined): ${noAdditionalInfo}`);
  
  if (categoryCounts.size > 0) {
    console.log(`\n📋 Categories found in additionalInfo (${categoryCounts.size} unique categories):`);
    const sortedCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    sortedCategories.forEach(([category, count]) => {
      console.log(`  - ${category}: ${count} buffets`);
    });
  }
  
  if (additionalInfoWithValidData.length > 0) {
    console.log(`\n✅ Found ${additionalInfoWithValidData.length} buffets with additionalInfo data:`);
    console.log('\nSample records (first 5):');
    additionalInfoWithValidData.slice(0, 5).forEach((record, idx) => {
      console.log(`\n${idx + 1}. ${record.name}`);
      console.log(`   PlaceId: ${record.placeId || 'N/A'}`);
      console.log(`   Categories (${record.categoryCount}): ${record.categories.join(', ')}`);
      
      // Show sample data from first category
      const firstCategory = record.categories[0];
      const firstCategoryData = record.additionalInfo[firstCategory];
      if (Array.isArray(firstCategoryData) && firstCategoryData.length > 0) {
        console.log(`   Sample from "${firstCategory}":`);
        firstCategoryData.slice(0, 3).forEach((item, i) => {
          if (typeof item === 'object') {
            const keys = Object.keys(item);
            if (keys.length > 0) {
              console.log(`     ${i + 1}. ${keys[0]}: ${item[keys[0]]}`);
            }
          }
        });
        if (firstCategoryData.length > 3) {
          console.log(`     ... and ${firstCategoryData.length - 3} more items`);
        }
      }
    });
    
    if (additionalInfoWithValidData.length > 5) {
      console.log(`\n... and ${additionalInfoWithValidData.length - 5} more records`);
    }
  } else {
    console.log('\n⚠️  No buffets have additionalInfo data populated');
  }
  
  return {
    total: allBuffets.length,
    hasField: hasAdditionalInfo,
    hasData: hasAdditionalInfoWithData,
    empty: hasAdditionalInfoEmpty,
    missing: noAdditionalInfo,
    categories: categoryCounts
  };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

checkAdditionalInfo()
  .then(results => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error checking additionalInfo:', error);
    process.exit(1);
  });

















