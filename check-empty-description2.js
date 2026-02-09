// Script to count how many description2 fields are empty in the buffet table

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPaths = [
  path.join(__dirname, '.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, 'env.local.txt'),
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

async function countEmptyDescription2() {
  console.log('Connecting to InstantDB...');
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const schema = require('./src/instant.schema.ts');
  
  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

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

    if (buffets.length === 0) {
      console.log('No buffets found in the database.');
      return;
    }

    // Count empty description2 fields
    let emptyCount = 0;
    let nullCount = 0;
    let undefinedCount = 0;
    let emptyStringCount = 0;
    let whitespaceOnlyCount = 0;
    let hasValueCount = 0;

    buffets.forEach(buffet => {
      const description2 = buffet.description2;
      
      if (description2 === null) {
        nullCount++;
        emptyCount++;
      } else if (description2 === undefined) {
        undefinedCount++;
        emptyCount++;
      } else if (typeof description2 === 'string') {
        const trimmed = description2.trim();
        if (trimmed === '') {
          if (description2 === '') {
            emptyStringCount++;
          } else {
            whitespaceOnlyCount++;
          }
          emptyCount++;
        } else {
          hasValueCount++;
        }
      } else {
        // Unexpected type, count as empty
        emptyCount++;
      }
    });

    console.log('='.repeat(80));
    console.log('RESULTS: Empty description2 fields in buffet table');
    console.log('='.repeat(80));
    console.log(`\nTotal buffets: ${buffets.length}`);
    console.log(`Empty description2 fields: ${emptyCount} (${((emptyCount / buffets.length) * 100).toFixed(2)}%)`);
    console.log(`  - null: ${nullCount}`);
    console.log(`  - undefined: ${undefinedCount}`);
    console.log(`  - empty string "": ${emptyStringCount}`);
    console.log(`  - whitespace only: ${whitespaceOnlyCount}`);
    console.log(`\nNon-empty description2 fields: ${hasValueCount} (${((hasValueCount / buffets.length) * 100).toFixed(2)}%)`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

countEmptyDescription2()
  .then(() => {
    console.log('\n✓ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
