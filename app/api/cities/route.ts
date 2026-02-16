import { NextResponse } from 'next/server';
import { getTopCities } from '@/lib/data-instantdb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const topCities = await getTopCities(20); // Get top 20 cities for dropdown
    return NextResponse.json(
      { cities: topCities },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching top cities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cities' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
