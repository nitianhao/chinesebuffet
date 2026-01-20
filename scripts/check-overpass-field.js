// Quick script to check if overpassPOIs field exists in InstantDB
const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
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

async function checkOverpassField() {
  console.log('🔍 Checking if overpassPOIs field exists in InstantDB...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('❌ Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    // Try to fetch a few buffets and check if overpassPOIs field is accessible
    console.log('Fetching sample buffets to check field access...');
    const result = await db.query({
      buffets: {
        $: { limit: 5 }
      }
    });

    const buffets = result.buffets || [];
    console.log(`✅ Successfully fetched ${buffets.length} buffets\n`);

    if (buffets.length > 0) {
      const sampleBuffet = buffets[0];
      console.log('Sample buffet fields:');
      console.log(`  - ID: ${sampleBuffet.id}`);
      console.log(`  - Name: ${sampleBuffet.name}`);
      console.log(`  - Has overpassPOIs field: ${sampleBuffet.overpassPOIs !== undefined ? '✅ YES' : '❌ NO'}`);
      
      if (sampleBuffet.overpassPOIs !== undefined) {
        console.log(`  - overpassPOIs value: ${sampleBuffet.overpassPOIs ? 'Has data' : 'null/empty'}`);
        if (sampleBuffet.overpassPOIs) {
          try {
            const poiData = JSON.parse(sampleBuffet.overpassPOIs);
            console.log(`  - POI data structure: ✅ Valid JSON`);
            console.log(`  - Total POIs: ${poiData.totalPOIs || 'N/A'}`);
          } catch (e) {
            console.log(`  - POI data: ⚠️  Invalid JSON`);
          }
        }
      }

      // Try to check if we can update the field (test with a small update)
      console.log('\n🧪 Testing if field can be updated...');
      try {
        // Just test the transaction format, don't actually update
        const testTx = db.tx.buffets[sampleBuffet.id].update({
          overpassPOIs: JSON.stringify({ test: true })
        });
        console.log('✅ Field update transaction created successfully');
        console.log('   (Not actually updating - just testing transaction format)');
      } catch (error) {
        console.log('❌ Error creating update transaction:');
        console.log(`   ${error.message}`);
        if (error.message.includes('schema') || error.message.includes('Attributes')) {
          console.log('\n⚠️  This suggests the field may not be synced to InstantDB cloud schema yet.');
          console.log('   Make sure you saved/deployed the schema in the InstantDB dashboard.');
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    if (buffets[0]?.overpassPOIs !== undefined) {
      console.log('✅ SUCCESS: overpassPOIs field is accessible in InstantDB!');
      console.log('   You can now run the enrichment script.');
    } else {
      console.log('⚠️  WARNING: overpassPOIs field is not accessible yet.');
      console.log('   Make sure you:');
      console.log('   1. Added the field in InstantDB dashboard');
      console.log('   2. Saved/deployed the schema');
      console.log('   3. Wait a few seconds for sync to complete');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error checking field:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkOverpassField().catch(console.error);






