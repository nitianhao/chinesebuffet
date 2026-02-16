import { NextResponse } from 'next/server';
import { getStateCounts } from '@/lib/data-instantdb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stateCounts = await getStateCounts();
    return NextResponse.json(
      { stateCounts },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching state counts:', error);
    return NextResponse.json({ error: 'Failed to fetch state counts' }, { status: 500 });
  }
}




