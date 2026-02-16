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

    console.log('Fetching all poiRecords...');

    // Fetch all poiRecords
    const result = await db.query({
      poiRecords: {
        $: {
          limit: 100000, // High limit to get all records
        }
      }
    });

    const records = result.poiRecords || [];
    console.log(`Total poiRecords: ${records.length}`);

    // Collect all categories
    const categoryCounts: Record<string, number> = {};

    for (const record of records) {
      const category = record.category || '(null/undefined)';

      if (!categoryCounts[category]) {
        categoryCounts[category] = 0;
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

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error querying poiRecords:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
