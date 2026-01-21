import { NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

export async function GET(request: Request) {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'INSTANT_ADMIN_TOKEN is required' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const group = searchParams.get('group');
  const limit = parseInt(searchParams.get('limit') || '20');

  if (!group) {
    return NextResponse.json({ error: 'group parameter is required' }, { status: 400 });
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log(`Fetching poiRecords with group = "${group}"...`);
    
    // Fetch records with the specific group
    const result = await db.query({
      poiRecords: {
        $: {
          where: {
            group: group
          },
          limit: Math.min(limit, 100), // Cap at 100
        }
      }
    });

    const records = result.poiRecords || [];
    console.log(`Found ${records.length} records in "${group}" group`);

    // Extract examples with names
    const examples = records
      .filter(r => r.name) // Only records with names
      .slice(0, limit)
      .map((record) => ({
        name: record.name,
        category: record.category || '(no category)',
        distance: record.distance ? Math.round(record.distance) : null,
        lat: record.lat,
        lon: record.lon,
      }));

    // Category distribution
    const categoriesInGroup: Record<string, number> = {};
    records.forEach(record => {
      const cat = record.category || '(no category)';
      categoriesInGroup[cat] = (categoriesInGroup[cat] || 0) + 1;
    });

    const results = {
      group,
      totalRecords: records.length,
      examplesWithNames: examples.length,
      examples,
      categoryDistribution: Object.entries(categoriesInGroup)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
    };

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error querying poiRecords:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
