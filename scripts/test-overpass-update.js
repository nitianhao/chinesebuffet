// Test script to actually try updating the overpassPOIs field
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

async function testUpdate() {
  console.log('🧪 Testing overpassPOIs field update...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('❌ Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    // Get one buffet
    const result = await db.query({
      buffets: {
        $: { limit: 1 }
      }
    });

    const buffet = result.buffets?.[0];
    if (!buffet) {
      console.error('❌ No buffets found');
      process.exit(1);
    }

    console.log(`Testing with buffet: ${buffet.name} (${buffet.id})\n`);

    // Try to update with test data
    const testData = {
      totalPOIs: 0,
      radius: 1000,
      fetchedAt: new Date().toISOString(),
      pois: [],
      poisByCategory: {},
      summary: { restaurants: 0, shops: 0, parks: 0, parking: 0, transit: 0, healthcare: 0, education: 0 }
    };

    console.log('Attempting to update overpassPOIs field...');
    const updateTx = db.tx.buffets[buffet.id].update({
      overpassPOIs: JSON.stringify(testData)
    });

    await db.transact([updateTx]);
    console.log('✅ Update transaction completed successfully!\n');

    // Verify by fetching again
    console.log('Verifying update...');
    const verifyResult = await db.query({
      buffets: {
        $: { where: { id: buffet.id } }
      }
    });

    const updatedBuffet = verifyResult.buffets?.[0];
    if (updatedBuffet?.overpassPOIs) {
      console.log('✅ SUCCESS: Field was updated and is now accessible!');
      console.log(`   Field value: ${updatedBuffet.overpassPOIs.substring(0, 100)}...`);
      console.log('\n🎉 The overpassPOIs field is working correctly!');
      console.log('   You can now run the enrichment script: npm run enrich-pois');
    } else {
      console.log('⚠️  Update completed but field not visible in query results.');
      console.log('   This might mean:');
      console.log('   1. The field needs a moment to sync');
      console.log('   2. The schema might need to be redeployed');
      console.log('   3. Try refreshing the InstantDB dashboard');
    }

  } catch (error) {
    console.error('\n❌ Error updating field:', error.message);
    if (error.message.includes('schema') || error.message.includes('Attributes')) {
      console.error('\n⚠️  Schema validation error detected.');
      console.error('   The overpassPOIs field may not be fully synced to InstantDB cloud schema.');
      console.error('   Please:');
      console.error('   1. Go to InstantDB dashboard');
      console.error('   2. Verify the field is saved in the schema');
      console.error('   3. Try saving/deploying the schema again');
      console.error('   4. Wait a few seconds and try again');
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testUpdate().catch(console.error);






