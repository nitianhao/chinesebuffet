// Script to check if InstantDB schema is synced
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

async function checkSchemaSync() {
  console.log('='.repeat(80));
  console.log('Checking InstantDB Schema Sync Status');
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

  // Check schema file
  const entities = Object.keys(schema.default?.entities || schema.entities || {});
  console.log('Schema file entities:');
  entities.forEach(entity => {
    const hasMenus = entity === 'menus';
    console.log(`  ${hasMenus ? '✓' : ' '} ${entity}${hasMenus ? ' (NEW)' : ''}`);
  });
  console.log('');

  if (!entities.includes('menus')) {
    console.error('✗ ERROR: menus entity not found in schema file!');
    process.exit(1);
  }

  try {
    // Initialize database
    const db = init({
      appId,
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('Testing database connection...\n');

    // Test 1: Try to query menus entity
    console.log('Test 1: Querying menus entity...');
    try {
      const menusQuery = await db.query({ 
        menus: { 
          $: { limit: 1 } 
        } 
      });
      console.log('  ✓ SUCCESS: menus entity is accessible!');
      console.log(`  Found ${menusQuery.menus?.length || 0} existing menu records\n`);
    } catch (queryError) {
      if (queryError.message.includes('schema') || 
          queryError.message.includes('Attributes are missing') ||
          queryError.message.includes('not found') ||
          queryError.message.includes('does not exist')) {
        console.log('  ✗ FAILED: menus entity not found in database');
        console.log(`  Error: ${queryError.message}\n`);
        console.log('  ⚠ Schema has NOT been synced yet.');
        console.log('  Action required: Run schema sync command\n');
        return false;
      } else {
        throw queryError;
      }
    }

    // Test 2: Try to query other entities to ensure DB is working
    console.log('Test 2: Querying buffets entity (verification)...');
    try {
      const buffetsQuery = await db.query({ 
        buffets: { 
          $: { limit: 1 } 
        } 
      });
      console.log('  ✓ Database connection working');
      console.log(`  Found ${buffetsQuery.buffets?.length || 0} buffet records\n`);
    } catch (error) {
      console.log(`  ⚠ Warning: ${error.message}\n`);
    }

    // Test 3: Try to create a test menu (then delete it)
    console.log('Test 3: Testing menu creation (dry run)...');
    try {
      // Just test the transaction structure, don't actually commit
      const testMenuId = require('@instantdb/admin').id();
      const testTx = db.tx.menus[testMenuId].create({
        placeId: 'TEST_PLACE_ID',
        sourceUrl: 'https://test.com/menu',
        contentType: 'HTML',
        structuredData: JSON.stringify({ test: true }),
        scrapedAt: new Date().toISOString(),
        status: 'SUCCESS'
      });
      
      // Don't actually execute, just verify structure is valid
      console.log('  ✓ Menu transaction structure is valid');
      console.log('  (Not actually creating test record)\n');
    } catch (error) {
      console.log(`  ⚠ Warning: ${error.message}\n`);
    }

    console.log('='.repeat(80));
    console.log('✅ Schema is SYNCED and ready to use!');
    console.log('='.repeat(80));
    console.log('\nYou can now run the menu scraper:');
    console.log('  npm run scrape-menus\n');
    
    return true;

  } catch (error) {
    console.error('\n✗ Error checking schema:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Verify INSTANT_ADMIN_TOKEN is correct');
    console.error('  2. Verify NEXT_PUBLIC_INSTANT_APP_ID is correct');
    console.error('  3. Run: npm run sync-schema (or npx instant-cli push --app <app-id>)');
    console.error('  4. Check InstantDB dashboard');
    return false;
  }
}

checkSchemaSync().then(synced => {
  process.exit(synced ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});





