import { NextResponse } from 'next/server';
import { getBuffetsForMap } from '@/lib/data-instantdb';

export async function GET() {
  try {
    const markers = await getBuffetsForMap(150);
    return NextResponse.json({ markers });
  } catch (error) {
    console.error('Error fetching map buffets:', error);
    return NextResponse.json({ error: 'Failed to fetch map data' }, { status: 500 });
  }
}
