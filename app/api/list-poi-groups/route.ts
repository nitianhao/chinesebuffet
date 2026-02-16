import { NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'INSTANT_ADMIN_TOKEN is required' }, { status: 500 });
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('Fetching all poiRecords to analyze group field...');

    // Fetch all poiRecords in batches to handle large datasets
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

      if (records.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Total poiRecords: ${allRecords.length}`);

    // Collect all group values
    const groupCounts: Record<string, number> = {};

    for (const record of allRecords) {
      const group = record.group || '(null/undefined)';

      if (!groupCounts[group]) {
        groupCounts[group] = 0;
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
      totalRecords: allRecords.length,
      recordsWithGroup: allRecords.filter(r => r.group).length,
      recordsWithoutGroup: allRecords.filter(r => !r.group).length,
      totalUniqueGroups: sortedGroups.length,
      groups: sortedGroups.map(([group]) => group).filter(grp => grp !== '(null/undefined)'),
      groupCounts,
      groupDetails: sortedGroups.map(([group, count]) => ({
        group,
        count,
      })),
    };

    console.log(`Total unique groups: ${results.totalUniqueGroups}`);
    console.log(`Records with group: ${results.recordsWithGroup}`);
    console.log(`Records without group: ${results.recordsWithoutGroup}`);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error querying poiRecords:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
