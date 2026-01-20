// Script to check checkInDate and checkOutDate fields

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
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
    // Continue to next path
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

async function checkHotelFields() {
  console.log('Connecting to InstantDB...');
  console.log('Checking checkInDate and checkOutDate fields...\n');

  try {
    console.log('Fetching all buffets...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    // Fetch all buffets in batches
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

    const buffets = allBuffets;
    console.log(`\nFound ${buffets.length} buffets total\n`);

    // Analyze checkInDate
    const checkInDateValues = [];
    const checkInDateCount = { total: 0, nonNull: 0, nonEmpty: 0 };
    
    // Analyze checkOutDate
    const checkOutDateValues = [];
    const checkOutDateCount = { total: 0, nonNull: 0, nonEmpty: 0 };

    buffets.forEach(buffet => {
      // Check checkInDate
      if ('checkInDate' in buffet) {
        checkInDateCount.total++;
        if (buffet.checkInDate !== null && buffet.checkInDate !== undefined) {
          checkInDateCount.nonNull++;
          if (buffet.checkInDate !== '' && String(buffet.checkInDate).trim() !== '') {
            checkInDateCount.nonEmpty++;
            // Collect example values (up to 10)
            if (checkInDateValues.length < 10) {
              checkInDateValues.push({
                buffetId: buffet.id,
                buffetName: buffet.name || 'N/A',
                checkInDate: buffet.checkInDate
              });
            }
          }
        }
      }

      // Check checkOutDate
      if ('checkOutDate' in buffet) {
        checkOutDateCount.total++;
        if (buffet.checkOutDate !== null && buffet.checkOutDate !== undefined) {
          checkOutDateCount.nonNull++;
          if (buffet.checkOutDate !== '' && String(buffet.checkOutDate).trim() !== '') {
            checkOutDateCount.nonEmpty++;
            // Collect example values (up to 10)
            if (checkOutDateValues.length < 10) {
              checkOutDateValues.push({
                buffetId: buffet.id,
                buffetName: buffet.name || 'N/A',
                checkOutDate: buffet.checkOutDate
              });
            }
          }
        }
      }
    });

    // Display results
    console.log('='.repeat(80));
    console.log('checkInDate Field Analysis');
    console.log('='.repeat(80));
    console.log(`Total records: ${buffets.length}`);
    console.log(`Field appears in records: ${checkInDateCount.total}`);
    console.log(`Non-null values: ${checkInDateCount.nonNull}`);
    console.log(`Non-empty values: ${checkInDateCount.nonEmpty}`);
    console.log(`Percentage: ${((checkInDateCount.nonEmpty / buffets.length) * 100).toFixed(2)}%`);
    
    if (checkInDateValues.length > 0) {
      console.log(`\nExample values (${checkInDateValues.length} examples):`);
      checkInDateValues.forEach((example, index) => {
        console.log(`\n  Example ${index + 1}:`);
        console.log(`    Buffet ID: ${example.buffetId}`);
        console.log(`    Buffet Name: ${example.buffetName}`);
        console.log(`    checkInDate: "${example.checkInDate}" (type: ${typeof example.checkInDate})`);
      });
    } else {
      console.log('\n  No non-empty values found for checkInDate');
    }

    console.log('\n' + '='.repeat(80));
    console.log('checkOutDate Field Analysis');
    console.log('='.repeat(80));
    console.log(`Total records: ${buffets.length}`);
    console.log(`Field appears in records: ${checkOutDateCount.total}`);
    console.log(`Non-null values: ${checkOutDateCount.nonNull}`);
    console.log(`Non-empty values: ${checkOutDateCount.nonEmpty}`);
    console.log(`Percentage: ${((checkOutDateCount.nonEmpty / buffets.length) * 100).toFixed(2)}%`);
    
    if (checkOutDateValues.length > 0) {
      console.log(`\nExample values (${checkOutDateValues.length} examples):`);
      checkOutDateValues.forEach((example, index) => {
        console.log(`\n  Example ${index + 1}:`);
        console.log(`    Buffet ID: ${example.buffetId}`);
        console.log(`    Buffet Name: ${example.buffetName}`);
        console.log(`    checkOutDate: "${example.checkOutDate}" (type: ${typeof example.checkOutDate})`);
      });
    } else {
      console.log('\n  No non-empty values found for checkOutDate');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`checkInDate: ${checkInDateCount.nonEmpty} non-empty values`);
    console.log(`checkOutDate: ${checkOutDateCount.nonEmpty} non-empty values`);

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
