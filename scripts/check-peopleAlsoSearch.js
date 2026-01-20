// Script to check if peopleAlsoSearch field is present in database records

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

async function checkPeopleAlsoSearch() {
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
  
  // Analyze peopleAlsoSearch field
  let hasPeopleAlsoSearch = 0;
  let hasPeopleAlsoSearchWithData = 0;
  let hasPeopleAlsoSearchEmpty = 0;
  let noPeopleAlsoSearch = 0;
  let peopleAlsoSearchWithValidData = [];
  
  allBuffets.forEach(buffet => {
    if (buffet.peopleAlsoSearch !== undefined && buffet.peopleAlsoSearch !== null) {
      hasPeopleAlsoSearch++;
      
      // Try to parse if it's a JSON string
      let parsed = null;
      if (typeof buffet.peopleAlsoSearch === 'string') {
        try {
          parsed = JSON.parse(buffet.peopleAlsoSearch);
        } catch (e) {
          // Not valid JSON, treat as empty
        }
      } else if (Array.isArray(buffet.peopleAlsoSearch)) {
        parsed = buffet.peopleAlsoSearch;
      }
      
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        hasPeopleAlsoSearchWithData++;
        peopleAlsoSearchWithValidData.push({
          id: buffet.id,
          name: buffet.name,
          placeId: buffet.placeId,
          peopleAlsoSearch: parsed,
          count: parsed.length
        });
      } else {
        hasPeopleAlsoSearchEmpty++;
      }
    } else {
      noPeopleAlsoSearch++;
    }
  });
  
  console.log('\n📊 peopleAlsoSearch Field Analysis:');
  console.log('=====================================');
  console.log(`Total buffets: ${allBuffets.length}`);
  console.log(`\nField Status:`);
  console.log(`  - Has peopleAlsoSearch field (not null/undefined): ${hasPeopleAlsoSearch}`);
  console.log(`    • With valid data (array with items): ${hasPeopleAlsoSearchWithData}`);
  console.log(`    • Empty/null/empty array: ${hasPeopleAlsoSearchEmpty}`);
  console.log(`  - No peopleAlsoSearch field (null/undefined): ${noPeopleAlsoSearch}`);
  
  if (peopleAlsoSearchWithValidData.length > 0) {
    console.log(`\n✅ Found ${peopleAlsoSearchWithValidData.length} buffets with peopleAlsoSearch data:`);
    console.log('\nSample records (first 10):');
    peopleAlsoSearchWithValidData.slice(0, 10).forEach((record, idx) => {
      console.log(`\n${idx + 1}. ${record.name}`);
      console.log(`   PlaceId: ${record.placeId || 'N/A'}`);
      console.log(`   Related searches (${record.count}):`);
      record.peopleAlsoSearch.slice(0, 5).forEach((item, i) => {
        const title = item.title || item.name || 'Unknown';
        const placeId = item.placeId || 'N/A';
        console.log(`     ${i + 1}. ${title} (${placeId})`);
      });
      if (record.peopleAlsoSearch.length > 5) {
        console.log(`     ... and ${record.peopleAlsoSearch.length - 5} more`);
      }
    });
    
    if (peopleAlsoSearchWithValidData.length > 10) {
      console.log(`\n... and ${peopleAlsoSearchWithValidData.length - 10} more records`);
    }
  } else {
    console.log('\n⚠️  No buffets have peopleAlsoSearch data populated');
  }
  
  return {
    total: allBuffets.length,
    hasField: hasPeopleAlsoSearch,
    hasData: hasPeopleAlsoSearchWithData,
    empty: hasPeopleAlsoSearchEmpty,
    missing: noPeopleAlsoSearch
  };
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

checkPeopleAlsoSearch()
  .then(results => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error checking peopleAlsoSearch:', error);
    process.exit(1);
  });

















