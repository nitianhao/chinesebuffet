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

    console.log('Fetching all structuredData records...');

    // Fetch all structuredData records
    const result = await db.query({
      structuredData: {
        $: {
          limit: 100000, // High limit to get all records
        }
      }
    });

    const records = result.structuredData || [];
    console.log(`Total structuredData records: ${records.length}`);

    // Collect all types
    const typeCounts: Record<string, number> = {};
    const typeExamples: Record<string, any> = {};

    for (const record of records) {
      const type = record.type || '(null/undefined)';

      if (!typeCounts[type]) {
        typeCounts[type] = 0;
        typeExamples[type] = record;
      }
      typeCounts[type]++;
    }

    // Sort by count (descending)
    const sortedTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1]);

    // Build detailed information for each type
    const typesInfo = sortedTypes.map(([type, count]) => {
      const example = typeExamples[type];
      let sampleKeys: string[] = [];

      if (example && example.data) {
        try {
          const parsedData = JSON.parse(example.data);
          sampleKeys = Object.keys(parsedData);
        } catch (e) {
          // Not JSON, skip
        }
      }

      return {
        type,
        count,
        sampleKeys: sampleKeys.slice(0, 10),
      };
    });

    const results = {
      totalRecords: records.length,
      recordsWithType: records.filter(r => r.type).length,
      recordsWithoutType: records.filter(r => !r.type).length,
      totalUniqueTypes: sortedTypes.length,
      types: sortedTypes.map(([type]) => type),
      typesInfo,
      typeCounts,
    };

    console.log('\n=== Results ===');
    console.log(`Total records: ${results.totalRecords}`);
    console.log(`Total unique types: ${results.totalUniqueTypes}`);
    console.log(`Records with type: ${results.recordsWithType}`);
    console.log(`Records without type: ${results.recordsWithoutType}`);
    console.log('\n=== Types ===');
    sortedTypes.forEach(([type, count]) => {
      console.log(`${type}: ${count} record(s)`);
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error querying structuredData:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
