// Script to list all unique categories from poiRecords table
// Run with: node scripts/list-poi-categories.js

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

async function listPOICategories() {
  console.log('📋 Fetching all poiRecords from database...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    // Import schema - try TypeScript first, then fallback to compiled JS
    let schema;
    try {
      // Try to load as TypeScript module (might work with ts-node or tsx)
      schema = require('../src/instant.schema.ts');
    } catch (e) {
      // Fallback: try to load compiled version or use a simple schema object
      // For InstantDB, we can often work without explicit schema in admin scripts
      schema = null;
    }

    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema?.default || schema || {},
    });

    console.log('Fetching poiRecords in batches...');
    
    // Fetch poiRecords in batches to avoid timeouts
    const batchSize = 1000;
    let allRecords = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await db.query({
        poiRecords: {
          $: {
            limit: batchSize,
            offset: offset,
          }
        }
      });

      const records = result.poiRecords || [];
      allRecords = allRecords.concat(records);
      
      console.log(`  Fetched ${records.length} records (total: ${allRecords.length})...`);
      
      if (records.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const records = allRecords;
    console.log(`✓ Total poiRecords fetched: ${records.length}`);

    // Collect all categories
    const categoryCounts = {};
    const categoryExamples = {};

    for (const record of records) {
      const category = record.category || '(null/undefined)';
      
      if (!categoryCounts[category]) {
        categoryCounts[category] = 0;
        categoryExamples[category] = record;
      }
      categoryCounts[category]++;
    }

    // Sort by count (descending), then alphabetically
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => {
        // First sort by count (descending)
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }
        // Then sort alphabetically
        return a[0].localeCompare(b[0]);
      });

    const results = {
      totalRecords: records.length,
      recordsWithCategory: records.filter(r => r.category).length,
      recordsWithoutCategory: records.filter(r => !r.category).length,
      totalUniqueCategories: sortedCategories.length,
      categories: sortedCategories.map(([category]) => category).filter(cat => cat !== '(null/undefined)'),
      categoryCounts,
      categoryDetails: sortedCategories.map(([category, count]) => ({
        category,
        count,
      })),
    };

    console.log('\n=== Results ===');
    console.log(`Total records: ${results.totalRecords}`);
    console.log(`Total unique categories: ${results.totalUniqueCategories}`);
    console.log(`Records with category: ${results.recordsWithCategory}`);
    console.log(`Records without category: ${results.recordsWithoutCategory}`);
    console.log('\n=== All Categories (sorted by count, then alphabetically) ===');
    sortedCategories.forEach(([category, count]) => {
      console.log(`${category}: ${count} record(s)`);
    });

    // Get alphabetical list of categories (excluding null/undefined)
    const alphabeticalCategories = [...results.categories]
      .filter(cat => cat !== '(null/undefined)')
      .sort((a, b) => a.localeCompare(b));
    
    console.log('\n=== Copy-paste ready list (one category per line) ===');
    console.log('\n--- START CATEGORIES LIST ---\n');
    
    // Output each category on a separate line (clean format for Google Sheets)
    alphabeticalCategories.forEach(category => {
      console.log(category);
    });
    
    console.log('\n--- END CATEGORIES LIST ---');
    console.log(`\nTotal: ${alphabeticalCategories.length} categories`);

    return results;
  } catch (error) {
    console.error('❌ Error querying poiRecords:', error);
    if (error.message && error.message.includes('schema')) {
      console.error('\n💡 Tip: If you see schema-related errors, try running with tsx instead:');
      console.error('   npx tsx scripts/list-poi-categories.ts');
    }
    throw error;
  }
}

listPOICategories()
  .then(() => {
    console.log('\n✓ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
