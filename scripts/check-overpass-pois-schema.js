// Script to check if overpassPOIs entity exists in the database
// Run with: node scripts/check-overpass-pois-schema.js

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

async function checkSchema() {
  console.log('🔍 Checking if overpassPOIs entity exists in database...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    // Try to query the overpassPOIs entity
    console.log('Attempting to query overpassPOIs entity...');
    try {
      const result = await db.query({
        overpassPOIs: {
          $: { limit: 1 }
        }
      });

      console.log('✅ Schema is synced! overpassPOIs entity exists.');
      console.log(`   Found ${result.overpassPOIs?.length || 0} existing POI records\n`);
      
      // Also check if we can query with the link
      console.log('Checking buffetOverpassPOIs link...');
      try {
        const linkResult = await db.query({
          buffets: {
            $: { limit: 1 },
            overpassPOIs: {}
          }
        });
        console.log('✅ Link relationship is working!\n');
        return true;
      } catch (linkError) {
        console.log('⚠️  Link relationship may not be fully synced yet.');
        console.log('   Error:', linkError.message);
        return false;
      }
    } catch (error) {
      if (error.message && error.message.includes('overpassPOIs')) {
        console.log('❌ Schema not synced yet. overpassPOIs entity does not exist.');
        console.log('   Please sync the schema in InstantDB dashboard first.\n');
        return false;
      }
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error checking schema:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkSchema();
