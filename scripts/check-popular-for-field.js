// Script to check if popularFor field exists in the database
const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');
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

async function checkPopularForField() {
  console.log('='.repeat(80));
  console.log('Checking popularFor Field in Database');
  console.log('='.repeat(80));
  console.log('');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('✗ Error: INSTANT_ADMIN_TOKEN not found');
    console.error('  Please set it in .env.local or export it');
    process.exit(1);
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';

  console.log(`App ID: ${appId}`);
  console.log(`Admin Token: ${process.env.INSTANT_ADMIN_TOKEN ? '✓ Set' : '✗ Missing'}\n`);

  // Check if field exists in schema file
  console.log('1. Checking schema file...');
  const schemaEntity = schema.default?.entities?.buffets || schema.entities?.buffets;
  if (schemaEntity && typeof schemaEntity === 'object') {
    // The schema is a function, so we need to check the actual definition
    // Let's check the source file directly
    const schemaPath = path.join(__dirname, '../src/instant.schema.ts');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    if (schemaContent.includes('popularFor')) {
      console.log('  ✓ popularFor field found in schema file');
    } else {
      console.log('  ✗ popularFor field NOT found in schema file');
      console.log('  Please add it to src/instant.schema.ts');
      process.exit(1);
    }
  }
  console.log('');

  try {
    // Initialize database with schema
    const db = init({
      appId,
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('2. Testing database connection...\n');

    // Query a single buffet to see what fields are actually returned
    console.log('3. Querying buffet record to check available fields...');
    try {
      const result = await db.query({
        buffets: {
          $: {
            limit: 1
          }
        }
      });

      const buffets = result.buffets || [];
      if (buffets.length === 0) {
        console.log('  ⚠ No buffets found in database');
        return;
      }

      const buffet = buffets[0];
      const fields = Object.keys(buffet).sort();
      
      console.log(`  ✓ Found ${buffets.length} buffet(s)`);
      console.log(`  ✓ Buffet record has ${fields.length} fields`);
      console.log('\n  Available fields:');
      fields.forEach(field => {
        const hasValue = buffet[field] !== null && buffet[field] !== undefined;
        console.log(`    ${hasValue ? '✓' : '○'} ${field}${hasValue ? ` = ${typeof buffet[field] === 'string' && buffet[field].length > 50 ? buffet[field].substring(0, 50) + '...' : JSON.stringify(buffet[field])}` : ''}`);
      });

      let fieldExistsInDb = false;
      let updateSuccessful = false;
      
      // Check if popularFor field exists
      if ('popularFor' in buffet) {
        console.log('\n  ✅ popularFor field EXISTS in database!');
        console.log(`    Value: ${buffet.popularFor || '(null or empty)'}`);
        fieldExistsInDb = true;
      } else {
        console.log('\n  ⚠️  popularFor field NOT found in query results');
        console.log('     (This is normal if the field has no values yet)');
        console.log('\n  Testing if field exists by attempting to update a record...');
        
        // Try to update a record with popularFor to see if the field exists in the schema
        try {
          const testBuffetId = buffet.id;
          const testTx = db.tx.buffets[testBuffetId].update({
            popularFor: 'TEST_VALUE_PLEASE_DELETE'
          });
          
          console.log('    ✓ Transaction structure is valid');
          
          // Actually commit the test transaction to verify
          await db.transact([testTx]);
          console.log('    ✅ Successfully updated record with popularFor field!');
          console.log('    ✅ Field EXISTS in database schema and is writeable');
          updateSuccessful = true;
          
          // Query again to verify the field now appears
          const verifyResult = await db.query({
            buffets: {
              $: {
                where: { id: testBuffetId },
                limit: 1
              }
            }
          });
          
          const verifyBuffet = verifyResult.buffets?.[0];
          if (verifyBuffet && 'popularFor' in verifyBuffet) {
            console.log(`    ✓ Field now appears in query: "${verifyBuffet.popularFor}"`);
            fieldExistsInDb = true;
          }
          
          // Clean up - remove the test value (set to null/undefined)
          console.log('    Cleaning up test value...');
          const cleanupTx = db.tx.buffets[testBuffetId].update({
            popularFor: null
          });
          await db.transact([cleanupTx]);
          console.log('    ✓ Cleaned up test value');
          
        } catch (updateError) {
          if (updateError.message.includes('schema') || 
              updateError.message.includes('not found') ||
              updateError.message.includes('does not exist') ||
              updateError.message.includes('Attributes are missing')) {
            console.log(`    ✗ Field does NOT exist in database schema`);
            console.log(`    Error: ${updateError.message}`);
            console.log('\n  ⚠ Schema needs to be synced!');
            console.log('  Try one of these:');
            console.log('    1. Run: npm run dev (auto-syncs on startup)');
            console.log('    2. Use InstantDB dashboard to sync schema');
            console.log('    3. Run: npx instant-cli push --app ' + appId);
          } else {
            throw updateError;
          }
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log('Summary:');
      console.log('='.repeat(80));
      
      if (fieldExistsInDb) {
        console.log('✅ popularFor field EXISTS in database and appears in queries!');
        console.log('   The field is fully functional.');
      } else if (updateSuccessful) {
        // Update was successful but field doesn't appear because it's null
        console.log('✅ popularFor field EXISTS in database schema and is writeable!');
        console.log('   ✓ Field was successfully updated (test completed)');
        console.log('   ℹ️  Field doesn\'t appear in queries because all values are null/undefined');
        console.log('   ℹ️  This is normal behavior - InstantDB doesn\'t return null optional fields');
        console.log('   ℹ️  Once you populate the field with data, it will appear in queries');
        console.log('');
        console.log('   ✅ The field is ready to use! You can start updating records with:');
        console.log('      db.transact([db.tx.buffets[id].update({ popularFor: "value" })])');
      } else {
        console.log('❌ popularFor field does NOT exist in database schema');
        console.log('   The schema file has the field, but it needs to be synced to the database.');
      }

    } catch (queryError) {
      console.error(`  ✗ Error querying database: ${queryError.message}`);
      throw queryError;
    }

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Verify INSTANT_ADMIN_TOKEN is correct');
    console.error('  2. Verify NEXT_PUBLIC_INSTANT_APP_ID is correct');
    console.error('  3. Check InstantDB dashboard for schema status');
    process.exit(1);
  }
}

checkPopularForField().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
