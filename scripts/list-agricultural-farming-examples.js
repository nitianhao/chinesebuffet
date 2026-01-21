// Script to list example POI names from the Agricultural & Farming group
// Run with: node scripts/list-agricultural-farming-examples.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

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

async function listAgriculturalFarmingExamples() {
  console.log('📋 Fetching POI examples from Agricultural & Farming group...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    let schema;
    try {
      schema = require('../src/instant.schema.ts');
    } catch (e) {
      schema = null;
    }

    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema?.default || schema || {},
    });

    console.log('Fetching poiRecords with group = "Agricultural & Farming"...');
    
    // Fetch records with the specific group
    const result = await db.query({
      poiRecords: {
        $: {
          where: {
            group: 'Agricultural & Farming'
          },
          limit: 100, // Get up to 100 to have enough examples
        }
      }
    });

    const records = result.poiRecords || [];
    console.log(`✓ Found ${records.length} records in Agricultural & Farming group\n`);

    if (records.length === 0) {
      console.log('No records found with this group. They may not be labeled yet.');
      return;
    }

    // Extract names and show first 20
    const examples = records
      .filter(r => r.name) // Only records with names
      .slice(0, 20)
      .map((record, index) => ({
        index: index + 1,
        name: record.name,
        category: record.category || '(no category)',
        distance: record.distance ? `${Math.round(record.distance)}m` : 'N/A'
      }));

    console.log('=== 20 Example POI Names from Agricultural & Farming Group ===\n');
    examples.forEach(example => {
      console.log(`${example.index}. ${example.name}`);
      console.log(`   Category: ${example.category}`);
      console.log(`   Distance: ${example.distance}`);
      console.log('');
    });

    // Also show summary stats
    const categoriesInGroup = {};
    records.forEach(record => {
      const cat = record.category || '(no category)';
      categoriesInGroup[cat] = (categoriesInGroup[cat] || 0) + 1;
    });

    console.log('\n=== Category Distribution in This Group ===');
    Object.entries(categoriesInGroup)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`  ${category}: ${count} record(s)`);
      });

    return examples;
  } catch (error) {
    console.error('❌ Error querying poiRecords:', error);
    throw error;
  }
}

listAgriculturalFarmingExamples()
  .then(() => {
    console.log('\n✓ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
