import { NextResponse } from 'next/server';
import { getBuffetsForMap } from '@/lib/data-instantdb';

// This API fetches live data from InstantDB — must not run during static build.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const markers = await getBuffetsForMap(150);
    return NextResponse.json({ markers });
  } catch (error) {
    console.error('Error fetching map buffets:', error);
    return NextResponse.json({ error: 'Failed to fetch map data' }, { status: 500 });
  }
}
