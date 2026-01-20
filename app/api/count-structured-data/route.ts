import { NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

export async function GET(request: Request) {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'INSTANT_ADMIN_TOKEN is required' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'hasTv';

    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log(`Fetching structuredData records with type = '${type}'...`);
    
    // Query structuredData records filtered by type
    const result = await db.query({
      structuredData: {
        $: {
          where: { type },
          limit: 100000, // High limit to get all matching records
        }
      }
    });

    const records = result.structuredData || [];
    const count = records.length;

    console.log(`Found ${count} records with type = '${type}'`);

    return NextResponse.json({
      type,
      count,
      records: records.length > 0 ? records.slice(0, 10) : [], // Return first 10 as sample
    });
  } catch (error) {
    console.error('Error querying structuredData:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
