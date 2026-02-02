import { NextResponse } from 'next/server';
import { getStatesBrowseData } from '@/lib/data-instantdb';

export async function GET() {
  try {
    const states = await getStatesBrowseData();
    return NextResponse.json({ states });
  } catch (error) {
    console.error('Error fetching states browse data:', error);
    return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 });
  }
}
