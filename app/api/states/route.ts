import { NextResponse } from 'next/server';
import { getStateCounts } from '@/lib/data-instantdb';

export async function GET() {
  try {
    const stateCounts = await getStateCounts();
    return NextResponse.json({ stateCounts });
  } catch (error) {
    console.error('Error fetching state counts:', error);
    return NextResponse.json({ error: 'Failed to fetch state counts' }, { status: 500 });
  }
}




