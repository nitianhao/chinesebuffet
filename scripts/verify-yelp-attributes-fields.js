// Script to verify Yelp attribute fields in InstantDB
// Checks if the new fields are populated in the database
// Run with: node scripts/verify-yelp-attributes-fields.js

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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
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
  console.warn('Warning: Could not load .env.local:', error.message);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to parse JSON strings
function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

async function verifyYelpAttributeFields() {
  console.log('🔍 Verifying Yelp attribute fields in database...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    // Fetch a sample of buffets to check
    console.log('Step 1: Fetching buffets from database...');
    
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          },
        },
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      
      if (buffets.length < limit) break;
      offset += limit;
    }
    
    console.log(`  Found ${allBuffets.length} total buffets\n`);

    // Check each field
    const fields = [
      { name: 'restaurantsDelivery', displayName: 'Restaurants Delivery' },
      { name: 'restaurantsTakeOut', displayName: 'Restaurants Take Out' },
      { name: 'businessAcceptsCreditCards', displayName: 'Business Accepts Credit Cards' },
      { name: 'bikeParking', displayName: 'Bike Parking' },
      { name: 'dogsAllowed', displayName: 'Dogs Allowed' },
      { name: 'wheelchairAccessible', displayName: 'Wheelchair Accessible' },
      { name: 'businessParking', displayName: 'Business Parking' },
    ];

    console.log('Step 2: Checking field population...\n');

    const stats = {};
    
    for (const field of fields) {
      let count = 0;
      let trueCount = 0;
      let falseCount = 0;
      let nullCount = 0;
      let otherCount = 0;
      const samples = [];

      for (const buffet of allBuffets) {
        const value = buffet[field.name];
        
        if (value !== null && value !== undefined) {
          count++;
          
          if (field.name === 'businessParking') {
            // For businessParking, check if it's a valid JSON string
            const parsed = parseJsonField(value);
            if (parsed && typeof parsed === 'object') {
              trueCount++;
              if (samples.length < 3) {
                samples.push({ id: buffet.id, name: buffet.name, value: parsed });
              }
            } else {
              otherCount++;
            }
          } else {
            // For boolean fields
            if (value === true) {
              trueCount++;
              if (samples.length < 3) {
                samples.push({ id: buffet.id, name: buffet.name, value: true });
              }
            } else if (value === false) {
              falseCount++;
            } else {
              otherCount++;
            }
          }
        } else {
          nullCount++;
        }
      }

      stats[field.name] = {
        total: allBuffets.length,
        populated: count,
        percentage: ((count / allBuffets.length) * 100).toFixed(2),
        trueCount,
        falseCount,
        nullCount,
        otherCount,
        samples,
      };
    }

    // Display results
    console.log('📊 Field Population Statistics:\n');
    console.log('='.repeat(80));
    
    for (const field of fields) {
      const stat = stats[field.name];
      console.log(`\n${field.displayName} (${field.name}):`);
      console.log(`  Total buffets: ${stat.total}`);
      console.log(`  Populated: ${stat.populated} (${stat.percentage}%)`);
      
      if (field.name === 'businessParking') {
        console.log(`  Valid JSON objects: ${stat.trueCount}`);
        console.log(`  Invalid/Other: ${stat.otherCount}`);
      } else {
        console.log(`  True: ${stat.trueCount}`);
        console.log(`  False: ${stat.falseCount}`);
        console.log(`  Other: ${stat.otherCount}`);
      }
      console.log(`  Null/Undefined: ${stat.nullCount}`);
      
      if (stat.samples.length > 0) {
        console.log(`  Sample records:`);
        stat.samples.forEach((sample, idx) => {
          console.log(`    ${idx + 1}. ${sample.name} (ID: ${sample.id.substring(0, 8)}...)`);
          if (field.name === 'businessParking') {
            console.log(`       Value: ${JSON.stringify(sample.value)}`);
          } else {
            console.log(`       Value: ${sample.value}`);
          }
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📈 Summary:\n');
    
    const totalPopulated = fields.reduce((sum, field) => sum + stats[field.name].populated, 0);
    const avgPercentage = (totalPopulated / (fields.length * allBuffets.length) * 100).toFixed(2);
    
    console.log(`Total buffets: ${allBuffets.length}`);
    console.log(`Average field population: ${avgPercentage}%`);
    console.log(`\nFields with most data:`);
    
    const sortedFields = fields
      .map(f => ({ ...f, populated: stats[f.name].populated }))
      .sort((a, b) => b.populated - a.populated);
    
    sortedFields.forEach((field, idx) => {
      console.log(`  ${idx + 1}. ${field.displayName}: ${stats[field.name].populated} records (${stats[field.name].percentage}%)`);
    });

    console.log('\n✅ Verification complete!\n');

  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    if (error.message && error.message.includes('Attributes are missing')) {
      console.error('\n⚠️  The schema fields are not yet synced to InstantDB.');
      console.error('   Please sync your schema first by running:');
      console.error('   - npm run dev (let it start, then stop it)');
      console.error('   - OR: npx instant-cli push --app 709e0e09-3347-419b-8daa-bad6889e480d');
    }
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run verification
verifyYelpAttributeFields();


