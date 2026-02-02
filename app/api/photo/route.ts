import { NextRequest } from 'next/server';

/**
 * Proxy route for Google Places Photos (New) API
 *
 * Usage: /api/photo?photoReference=places/.../photos/...&w=800
 * - photoReference: required, must start with places/
 * - w: optional, maxWidthPx (default 800)
 *
 * SECURITY: API key never exposed to browser.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const photoReference = searchParams.get('photoReference');
  const wParam = searchParams.get('w');
  const w = wParam ? Number.parseInt(wParam, 10) : 800;
  const maxWidthPx = Number.isFinite(w) && w > 0 ? w : 800;

  if (!photoReference || typeof photoReference !== 'string') {
    return Response.json(
      { error: 'Missing photoReference parameter' },
      { status: 400 }
    );
  }

  if (!photoReference.startsWith('places/')) {
    return Response.json(
      { error: 'Invalid photoReference: must start with places/' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Server configuration error - GOOGLE_MAPS_API_KEY not found' },
      { status: 500 }
    );
  }

  const pathSegments = photoReference.split('/').map((segment) => encodeURIComponent(segment));
  const encodedPhotoRef = pathSegments.join('/');
  const url = `https://places.googleapis.com/v1/${encodedPhotoRef}/media?maxWidthPx=${maxWidthPx}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: 'Google Places photo fetch failed', status: 0, body: msg.slice(0, 1200) },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return Response.json(
      {
        error: 'Google Places photo fetch failed',
        status: res.status,
        body: body.slice(0, 1200),
      },
      { status: 502 }
    );
  }

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
