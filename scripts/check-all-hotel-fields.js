// Script to check all hotel-related fields

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPaths = [
  path.join(__dirname, '../.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, '../env.local.txt'),
  path.join(process.cwd(), 'env.local.txt'),
];

for (const envPath of envPaths) {
  try {
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
      break;
    }
  } catch (error) {
    // Continue
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const hotelFields = [
  'hotelStars',
  'hotelDescription',
  'checkInDate',
  'checkOutDate',
  'similarHotelsNearby',
  'hotelReviewSummary'
];

async function checkHotelFields() {
  console.log('Checking all hotel-related fields...\n');
  console.log(`Fields to check: ${hotelFields.join(', ')}\n`);

  try {
    console.log('Fetching all buffets...');
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
      if (allBuffets.length % 2000 === 0) {
        console.log(`  Fetched ${allBuffets.length} buffets...`);
      }
      
      if (buffets.length < limit) break;
      offset += limit;
    }

    console.log(`\nTotal buffets: ${allBuffets.length}\n`);

    // Analyze each field
    const fieldStats = {};
    
    hotelFields.forEach(field => {
      fieldStats[field] = {
        appearsInRecords: 0,
        nonNull: 0,
        nonEmpty: 0,
        examples: []
      };
    });

    allBuffets.forEach(buffet => {
      hotelFields.forEach(field => {
        if (field in buffet) {
          fieldStats[field].appearsInRecords++;
          if (buffet[field] !== null && buffet[field] !== undefined) {
            fieldStats[field].nonNull++;
            const value = buffet[field];
            let isEmpty = false;
            
            if (typeof value === 'string') {
              isEmpty = value.trim() === '' || value === 'null' || value === '[]' || value === '{}';
            } else if (Array.isArray(value)) {
              isEmpty = value.length === 0;
            } else if (typeof value === 'object' && value !== null) {
              isEmpty = Object.keys(value).length === 0;
            }
            
            if (!isEmpty) {
              fieldStats[field].nonEmpty++;
              if (fieldStats[field].examples.length < 3) {
                fieldStats[field].examples.push({
                  buffetId: buffet.id,
                  buffetName: buffet.name || 'N/A',
                  value: value
                });
              }
            }
          }
        }
      });
    });

    // Display results
    console.log('='.repeat(80));
    console.log('Hotel Fields Analysis');
    console.log('='.repeat(80) + '\n');

    hotelFields.forEach(field => {
      const stats = fieldStats[field];
      console.log(`${field}:`);
      console.log(`  Appears in records: ${stats.appearsInRecords}`);
      console.log(`  Non-null values: ${stats.nonNull}`);
      console.log(`  Non-empty values: ${stats.nonEmpty}`);
      console.log(`  Percentage: ${((stats.nonEmpty / allBuffets.length) * 100).toFixed(2)}%`);
      
      if (stats.examples.length > 0) {
        console.log(`  Examples:`);
        stats.examples.forEach((ex, idx) => {
          console.log(`    ${idx + 1}. "${ex.buffetName}" (ID: ${ex.buffetId})`);
          console.log(`       Value: ${JSON.stringify(ex.value).substring(0, 100)}${JSON.stringify(ex.value).length > 100 ? '...' : ''}`);
        });
      }
      console.log('');
    });

    // Summary
    const emptyFields = hotelFields.filter(field => fieldStats[field].nonEmpty === 0);
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total fields checked: ${hotelFields.length}`);
    console.log(`Fields with 0 values: ${emptyFields.length}`);
    console.log(`Empty fields: ${emptyFields.join(', ')}`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkHotelFields()
  .then(() => {
    console.log('\n✓ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
