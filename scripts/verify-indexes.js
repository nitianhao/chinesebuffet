// Script to verify that the new indexes on buffets.rating and buffets.placeId are working
const { init } = require('@instantdb/admin');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env.local if it exists
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

async function verifyIndexes() {
  console.log('='.repeat(80));
  console.log('Verifying Schema Indexes');
  console.log('='.repeat(80));
  console.log('');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('✗ Error: INSTANT_ADMIN_TOKEN not found');
    process.exit(1);
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';

  try {
    const schema = require('../src/instant.schema.ts');
    const db = init({
      appId,
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('Testing indexed queries...\n');

    // Test 1: Query buffets ordered by rating (should use rating index)
    console.log('Test 1: Query buffets ordered by rating (indexed field)...');
    const ratingQueryStart = Date.now();
    try {
      const ratingResult = await db.query({
        buffets: {
          $: {
            limit: 10,
            order: [{ field: 'rating', direction: 'desc' }]
          },
          city: {}
        }
      });
      const ratingQueryDuration = Date.now() - ratingQueryStart;
      console.log(`  ✓ Query successful: ${ratingResult.buffets?.length || 0} buffets`);
      console.log(`  ✓ Query duration: ${ratingQueryDuration}ms`);
      if (ratingQueryDuration < 500) {
        console.log('  ✓ Performance looks good (likely using index)\n');
      } else {
        console.log('  ⚠ Query took longer than expected - index may not be active\n');
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}\n`);
    }

    // Test 2: Query buffet by placeId (should use placeId index)
    console.log('Test 2: Query buffet by placeId (indexed field)...');
    const placeIdQueryStart = Date.now();
    try {
      // First get a placeId from an existing buffet
      const sampleResult = await db.query({
        buffets: {
          $: { limit: 1 },
        }
      });
      
      const samplePlaceId = sampleResult.buffets?.[0]?.placeId;
      
      if (samplePlaceId) {
        const placeIdResult = await db.query({
          buffets: {
            $: {
              where: { placeId: samplePlaceId },
              limit: 1
            }
          }
        });
        const placeIdQueryDuration = Date.now() - placeIdQueryStart;
        console.log(`  ✓ Query successful: Found ${placeIdResult.buffets?.length || 0} buffet(s)`);
        console.log(`  ✓ Query duration: ${placeIdQueryDuration}ms`);
        if (placeIdQueryDuration < 300) {
          console.log('  ✓ Performance looks good (likely using index)\n');
        } else {
          console.log('  ⚠ Query took longer than expected - index may not be active\n');
        }
      } else {
        console.log('  ⚠ No buffets with placeId found to test\n');
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}\n`);
    }

    // Test 3: Verify schema file has the indexes
    console.log('Test 3: Verifying schema file has index definitions...');
    try {
      const schemaSource = fs.readFileSync(path.join(__dirname, '../src/instant.schema.ts'), 'utf8');
      const hasRatingIndex = schemaSource.includes('rating: i.number().indexed().optional()');
      const hasPlaceIdIndex = schemaSource.includes('placeId: i.string().indexed().optional()');
      
      if (hasRatingIndex) {
        console.log('  ✓ rating field is marked as indexed in schema');
      } else {
        console.log('  ✗ rating field is NOT marked as indexed in schema');
      }
      
      if (hasPlaceIdIndex) {
        console.log('  ✓ placeId field is marked as indexed in schema');
      } else {
        console.log('  ✗ placeId field is NOT marked as indexed in schema');
      }
      console.log('');
    } catch (error) {
      console.log(`  ⚠ Could not verify schema file: ${error.message}\n`);
    }

    console.log('='.repeat(80));
    console.log('✅ Index Verification Complete');
    console.log('='.repeat(80));
    console.log('\nNote: InstantDB indexes are automatically created when schema is synced.');
    console.log('If queries are slow, the indexes may still be building in the background.\n');

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

verifyIndexes().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
