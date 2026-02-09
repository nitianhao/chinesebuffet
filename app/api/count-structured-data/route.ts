import { NextResponse } from 'next/server';
import { getStructuredDataCount } from '@/lib/server/structuredDataCounts';

/**
 * Returns structured data count. Uses server helper (no request.url) so route is safe for static/build.
 * Optional: ?type=hasTv (default). Reading searchParams would make the route dynamic; we use default for stability.
 */
export async function GET() {
  try {
    const data = await getStructuredDataCount('hasTv');
    return NextResponse.json(data);
  } catch (err) {
    console.error('[count-structured-data]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ type: 'hasTv', count: 0, records: [] });
  }
}
