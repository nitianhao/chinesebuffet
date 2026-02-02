import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for Google Places Photos (New) API
 *
 * Usage: /api/photo?name=places/.../photos/...&w=800
 * - name: required, Google photoReference (must start with places/)
 * - w: optional, maxWidthPx (default 800)
 *
 * SECURITY: API key never exposed to browser.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const wParam = searchParams.get('w');
  const w = wParam ? parseInt(wParam, 10) : 800;
  const maxWidthPx = Number.isNaN(w) || w <= 0 ? 800 : w;

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: 'Missing name parameter' },
      { status: 400 }
    );
  }

  if (!name.startsWith('places/')) {
    return NextResponse.json(
      { error: 'Invalid name: must start with places/' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server configuration error - GOOGLE_MAPS_API_KEY not found' },
      { status: 500 }
    );
  }

  const pathSegments = name.split('/').map((s) => encodeURIComponent(s));
  const encodedPhotoRef = pathSegments.join('/');
  const url = `https://places.googleapis.com/v1/${encodedPhotoRef}/media?key=${apiKey}&maxWidthPx=${maxWidthPx}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChineseBuffets/1.0)' },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Fetch failed', detail: msg.slice(0, 800) },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return NextResponse.json(
      {
        error: 'Google Places API error',
        status: res.status,
        body: body.slice(0, 800),
      },
      { status: 502 }
    );
  }

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
