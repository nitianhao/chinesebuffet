// Script to check language and locatedIn fields

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

const fieldsToCheck = ['language', 'locatedIn'];

async function checkFields() {
  console.log(`Checking fields: ${fieldsToCheck.join(', ')}...\n`);

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
    
    fieldsToCheck.forEach(field => {
      fieldStats[field] = {
        appearsInRecords: 0,
        nonNull: 0,
        nonEmpty: 0,
        examples: [],
        uniqueValues: new Set()
      };
    });

    allBuffets.forEach(buffet => {
      fieldsToCheck.forEach(field => {
        if (field in buffet) {
          fieldStats[field].appearsInRecords++;
          if (buffet[field] !== null && buffet[field] !== undefined) {
            fieldStats[field].nonNull++;
            const value = buffet[field];
            let isEmpty = false;
            
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed !== '' && trimmed !== 'null') {
                isEmpty = false;
                fieldStats[field].uniqueValues.add(trimmed);
              } else {
                isEmpty = true;
              }
            } else {
              isEmpty = true;
            }
            
            if (!isEmpty) {
              fieldStats[field].nonEmpty++;
              if (fieldStats[field].examples.length < 5) {
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

    // Display results for each field
    fieldsToCheck.forEach(field => {
      const stats = fieldStats[field];
      console.log('='.repeat(80));
      console.log(`${field} Field Analysis`);
      console.log('='.repeat(80));
      console.log(`Total records: ${allBuffets.length}`);
      console.log(`Field appears in records: ${stats.appearsInRecords}`);
      console.log(`Non-null values: ${stats.nonNull}`);
      console.log(`Non-empty values: ${stats.nonEmpty}`);
      console.log(`Percentage: ${((stats.nonEmpty / allBuffets.length) * 100).toFixed(2)}%`);
      console.log(`Unique values: ${stats.uniqueValues.size}`);
      
      if (stats.uniqueValues.size > 0 && stats.uniqueValues.size <= 20) {
        console.log(`Unique value list: ${Array.from(stats.uniqueValues).join(', ')}`);
      } else if (stats.uniqueValues.size > 20) {
        console.log(`Unique value list (first 20): ${Array.from(stats.uniqueValues).slice(0, 20).join(', ')}...`);
      }
      
      if (stats.examples.length > 0) {
        console.log(`\nExample values (${stats.examples.length} examples):`);
        stats.examples.forEach((example, index) => {
          console.log(`\n  Example ${index + 1}:`);
          console.log(`    Buffet ID: ${example.buffetId}`);
          console.log(`    Buffet Name: ${example.buffetName}`);
          console.log(`    ${field}: "${example.value}"`);
        });
      } else {
        console.log('\n  No non-empty values found');
      }
      console.log('');
    });

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    fieldsToCheck.forEach(field => {
      const stats = fieldStats[field];
      if (stats.nonEmpty === 0) {
        console.log(`❌ ${field}: No values found - field is empty`);
      } else {
        console.log(`✓ ${field}: ${stats.nonEmpty} non-empty value(s), ${stats.uniqueValues.size} unique value(s)`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkFields()
  .then(() => {
    console.log('\n✓ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
