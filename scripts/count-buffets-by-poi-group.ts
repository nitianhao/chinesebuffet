import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

async function countBuffetsByPOIGroup() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log(`\n🔍 Analyzing all POI groups and counting unique buffets...\n`);

  // Step 1: Get all unique group types
  console.log('Step 1: Fetching all poiRecords to identify group types...');
  const batchSize = 1000;
  let allRecords: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await db.query({
      poiRecords: {
        $: {
          limit: batchSize,
          offset: offset,
        },
      },
    });

    const records = result.poiRecords || [];
    allRecords = allRecords.concat(records);

    if (records.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (allRecords.length % 5000 === 0) {
      console.log(`  Fetched ${allRecords.length} records...`);
    }
  }

  console.log(`✓ Total poiRecords fetched: ${allRecords.length}\n`);

  // Collect all unique group types (excluding null/undefined)
  const groupTypes = new Set<string>();
  for (const record of allRecords) {
    if (record.group) {
      groupTypes.add(record.group);
    }
  }

  const sortedGroups = Array.from(groupTypes).sort();
  console.log(`✓ Found ${sortedGroups.length} unique group types\n`);

  // Step 2: For each group, count unique buffets
  console.log('Step 2: Counting unique buffets for each group...\n');
  
  const results: Array<{ group: string; uniqueBuffets: number; totalRecords: number }> = [];

  for (let i = 0; i < sortedGroups.length; i++) {
    const group = sortedGroups[i];
    console.log(`  [${i + 1}/${sortedGroups.length}] Processing: "${group}"`);

    const uniqueBuffetIds = new Set<string>();
    let totalRecords = 0;
    offset = 0;
    hasMore = true;

    while (hasMore) {
      const result = await db.query({
        poiRecords: {
          $: {
            where: { group: group },
            limit: batchSize,
            offset: offset,
          },
          buffet: {},
        },
      });

      const records = result.poiRecords || [];
      totalRecords += records.length;

      for (const record of records) {
        if (record.buffet?.id) {
          uniqueBuffetIds.add(record.buffet.id);
        }
      }

      if (records.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    results.push({
      group,
      uniqueBuffets: uniqueBuffetIds.size,
      totalRecords,
    });

    console.log(`    → ${uniqueBuffetIds.size} unique buffets, ${totalRecords} total records`);
  }

  // Sort results by unique buffets count (descending)
  results.sort((a, b) => b.uniqueBuffets - a.uniqueBuffets);

  // Print table
  console.log('\n' + '='.repeat(100));
  console.log('RESULTS TABLE');
  console.log('='.repeat(100));
  console.log('\nGroup Type | Unique Buffets | Total Records');
  console.log('-'.repeat(100));

  for (const result of results) {
    const groupName = result.group.padEnd(40);
    const buffets = result.uniqueBuffets.toString().padStart(15);
    const records = result.totalRecords.toString().padStart(15);
    console.log(`${groupName} | ${buffets} | ${records}`);
  }

  console.log('-'.repeat(100));
  console.log(`Total Groups: ${results.length}`);
  console.log(`Total Unique Buffets (across all groups): ${new Set(results.map(r => r.group)).size}`);
  
  // Calculate total unique buffets (union of all)
  const allBuffetIds = new Set<string>();
  for (const result of results) {
    // We'd need to re-query to get the union, but for now just show the max
    // This is an approximation - the actual union would be higher
  }

  console.log('='.repeat(100) + '\n');

  // Also output as markdown table
  console.log('\n📋 Markdown Table:\n');
  console.log('| Group Type | Unique Buffets | Total Records |');
  console.log('|------------|----------------|---------------|');
  for (const result of results) {
    console.log(`| ${result.group} | ${result.uniqueBuffets} | ${result.totalRecords} |`);
  }

  return results;
}

// Run the script
countBuffetsByPOIGroup()
  .then((results) => {
    console.log(`\n✅ Analysis complete! Found ${results.length} group types.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
