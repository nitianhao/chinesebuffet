// Script to remove claimThisBusiness field from all buffets in the database

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

// Field to remove
const fieldToRemove = 'claimThisBusiness';

async function removeClaimThisBusiness() {
  console.log('Connecting to InstantDB...');
  console.log(`Field to remove: ${fieldToRemove}\n`);

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

    console.log(`\nFound ${allBuffets.length} buffets total\n`);

    // Filter buffets that have this field
    const buffetsToUpdate = allBuffets.filter(buffet => {
      return fieldToRemove in buffet;
    });

    console.log(`Found ${buffetsToUpdate.length} buffets that have this field\n`);

    if (buffetsToUpdate.length === 0) {
      console.log('✓ No buffets have this field. Field is already clean!');
      return;
    }

    // Update buffets in batches
    const batchSize = 100;
    let updatedCount = 0;

    for (let i = 0; i < buffetsToUpdate.length; i += batchSize) {
      const batch = buffetsToUpdate.slice(i, i + batchSize);
      
      // Create update transactions using InstantDB's tx API
      // Set field to null to remove it (since it's optional)
      const updateTxs = batch
        .filter(buffet => fieldToRemove in buffet)
        .map(buffet => {
          const updateData = {};
          if (fieldToRemove in buffet) {
            updateData[fieldToRemove] = null; // Set to null to clear the field
          }
          return db.tx.buffets[buffet.id].update(updateData);
        });

      if (updateTxs.length > 0) {
        await db.transact(updateTxs);
      }

      updatedCount += batch.length;
      console.log(`  Updated ${updatedCount}/${buffetsToUpdate.length} buffets...`);
    }

    console.log(`\n✓ Successfully removed ${fieldToRemove} from ${updatedCount} buffets!`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

removeClaimThisBusiness()
  .then(() => {
    console.log('\n✅ Cleanup complete!');
    console.log('\n⚠️  IMPORTANT: You need to manually sync the schema in InstantDB.');
    console.log('   The schema file has been updated, but InstantDB requires manual schema sync.');
    console.log('   Go to your InstantDB dashboard and sync the schema to apply these changes.');
    console.log('   Or run: npm run sync-schema');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
