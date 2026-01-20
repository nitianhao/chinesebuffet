// Script to sync InstantDB schema
// This will push the schema to InstantDB using the CLI

const { execSync } = require('child_process');
const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');

async function syncSchema() {
  console.log('='.repeat(80));
  console.log('InstantDB Schema Sync');
  console.log('='.repeat(80));
  console.log('This will push the schema (including the new menus entity) to InstantDB.\n');

  // Verify schema has menus entity
  const entities = Object.keys(schema.default?.entities || schema.entities || {});
  if (!entities.includes('menus')) {
    console.error('✗ ERROR: menus entity not found in schema!');
    console.error('  Please check src/instant.schema.ts');
    process.exit(1);
  }
  
  console.log('✓ Schema file contains menus entity');
  console.log(`✓ Found ${entities.length} entities in schema\n`);

  // Method 1: Try using InstantDB CLI
  console.log('Attempting to sync schema using InstantDB CLI...\n');
  
  // Get app ID from environment
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  
  try {
    // Try pnpx first (pnpm), then npx (npm)
    let cliCommand = `pnpx instant-cli push --app ${appId}`;
    try {
      execSync('which pnpx', { stdio: 'ignore' });
    } catch (e) {
      cliCommand = `npx instant-cli push --app ${appId}`;
    }
    
    console.log(`Running: ${cliCommand}`);
    execSync(cliCommand, { 
      stdio: 'inherit',
      cwd: __dirname + '/..'
    });
    
    console.log('\n✅ Schema pushed successfully using CLI!\n');
    
  } catch (cliError) {
    console.log('\n⚠ CLI method failed, trying alternative method...\n');
    
    // Method 2: Initialize database to trigger sync
    if (!process.env.INSTANT_ADMIN_TOKEN) {
      console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
      console.error('Please set it in your .env.local file or export it:');
      console.error('  export INSTANT_ADMIN_TOKEN="your-token-here"');
      console.error('\nAlternatively, you can:');
      console.error('  1. Run: npm run dev (this auto-syncs schemas when Next.js starts)');
      console.error('  2. Or manually push schema via InstantDB dashboard');
      process.exit(1);
    }

    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';

    try {
      // Initialize the database with the schema
      const db = init({
        appId,
        adminToken: process.env.INSTANT_ADMIN_TOKEN,
        schema: schema.default || schema,
      });

      console.log(`✓ Database initialized with app ID: ${appId}`);
      
      // Try a simple query to verify the schema is recognized
      try {
        const testQuery = await db.query({ menus: { $: { limit: 1 } } });
        console.log('✓ Menus entity is accessible in the database');
        console.log(`  Found ${testQuery.menus?.length || 0} existing menu records\n`);
        console.log('✅ Schema is synced!\n');
      } catch (queryError) {
        if (queryError.message.includes('schema') || queryError.message.includes('Attributes are missing')) {
          console.log('⚠ Schema may not be fully synced yet.');
          console.log('\nRecommended: Run your Next.js dev server to auto-sync:');
          console.log('  npm run dev');
          console.log('  (Let it start, then stop it - this will sync the schema)\n');
        } else {
          throw queryError;
        }
      }
    } catch (error) {
      console.error('\n✗ Error:', error.message);
      console.error('\nTroubleshooting:');
      console.error('  1. Verify INSTANT_ADMIN_TOKEN is correct');
      console.error('  2. Verify NEXT_PUBLIC_INSTANT_APP_ID is correct');
      console.error('  3. Run: npm run dev (this auto-syncs schemas)');
      console.error('  4. Check InstantDB dashboard for schema status');
      process.exit(1);
    }
  }
}

syncSchema().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

