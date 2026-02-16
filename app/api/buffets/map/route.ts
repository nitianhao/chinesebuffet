import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * COST GUARD:
 * - This route is intentionally edge-cacheable.
 * - Do not use cookies()/headers()/draftMode()/unstable_noStore() here.
 * - Changing Cache-Control impacts Vercel Function Invocations.
 */
import { getBuffetsForMap } from '@/lib/data-instantdb';

// This API fetches live data from InstantDB — must not run during static build.
// Map markers change rarely; cache at the edge to avoid per-view function invocations.

export async function GET() {
  try {
    const markers = await getBuffetsForMap(150);
    return NextResponse.json(
      { markers },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching map buffets:', error);
    return NextResponse.json({ error: 'Failed to fetch map data' }, { status: 500 });
  }
}
