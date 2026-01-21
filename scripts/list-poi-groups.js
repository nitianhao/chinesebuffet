// Script to list all unique group values from poiRecords table
// Run with: node scripts/list-poi-groups.js

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

async function listPOIGroups() {
  console.log('📋 Fetching all poiRecords from database to analyze group field...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    // Import schema - try TypeScript first, then fallback to compiled JS
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
    console.log(`✓ Total poiRecords fetched: ${records.length}\n`);

    // Collect all group values
    const groupCounts = {};
    const groupExamples = {};

    for (const record of records) {
      const group = record.group || '(null/undefined)';
      
      if (!groupCounts[group]) {
        groupCounts[group] = 0;
        groupExamples[group] = record;
      }
      groupCounts[group]++;
    }

    // Sort by count (descending), then alphabetically
    const sortedGroups = Object.entries(groupCounts)
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
      recordsWithGroup: records.filter(r => r.group).length,
      recordsWithoutGroup: records.filter(r => !r.group).length,
      totalUniqueGroups: sortedGroups.length,
      groups: sortedGroups.map(([group]) => group).filter(grp => grp !== '(null/undefined)'),
      groupCounts,
      groupDetails: sortedGroups.map(([group, count]) => ({
        group,
        count,
      })),
    };

    console.log('=== Results ===');
    console.log(`Total records: ${results.totalRecords}`);
    console.log(`Total unique groups: ${results.totalUniqueGroups}`);
    console.log(`Records with group: ${results.recordsWithGroup}`);
    console.log(`Records without group: ${results.recordsWithoutGroup}`);
    console.log('\n=== All Group Values (sorted by count, then alphabetically) ===');
    sortedGroups.forEach(([group, count]) => {
      console.log(`${group}: ${count} record(s)`);
    });

    // Get alphabetical list of groups (excluding null/undefined)
    const alphabeticalGroups = [...results.groups]
      .filter(grp => grp !== '(null/undefined)')
      .sort((a, b) => a.localeCompare(b));
    
    console.log('\n=== Copy-paste ready list (one group per line) ===');
    console.log('\n--- START GROUPS LIST ---\n');
    
    // Output each group on a separate line
    alphabeticalGroups.forEach(group => {
      console.log(group);
    });
    
    console.log('\n--- END GROUPS LIST ---');
    console.log(`\nTotal: ${alphabeticalGroups.length} unique groups`);

    return results;
  } catch (error) {
    console.error('❌ Error querying poiRecords:', error);
    if (error.message && error.message.includes('schema')) {
      console.error('\n💡 Tip: If you see schema-related errors, try running with tsx instead:');
      console.error('   npx tsx scripts/list-poi-groups.ts');
    }
    throw error;
  }
}

listPOIGroups()
  .then(() => {
    console.log('\n✓ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
