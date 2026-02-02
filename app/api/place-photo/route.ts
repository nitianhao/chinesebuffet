import { NextRequest } from 'next/server';
import { getPlacePhotoCached } from '@/lib/photo-cache';

/**
 * Proxy route for Google Places photos
 *
 * DB-first: Uses photo cache layer. Page render never blocks on external calls.
 * - If cached exists, use it
 * - If missing, fetch once, store, and serve
 *
 * SECURITY: API key never exposed to browser.
 *
 * Usage: /api/place-photo?photoReference=places/.../photos/...&maxWidthPx=800
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const photoReference = searchParams.get('photoReference');
  const maxWidthPx = searchParams.get('maxWidthPx') || '800';
  const maxHeightPx = searchParams.get('maxHeightPx');

  if (!photoReference) {
    return Response.json(
      { error: 'Missing photoReference parameter' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[place-photo] API key not found');
    return Response.json(
      { error: 'Server configuration error - API key not found' },
      { status: 500 }
    );
  }

  try {
    const cached = await getPlacePhotoCached(
      photoReference,
      maxWidthPx,
      maxHeightPx || null
    );

    if (!cached) {
      const pathSegments = photoReference.split('/').map((s) => encodeURIComponent(s));
      const encodedPhotoRef = pathSegments.join('/');
      const params = new URLSearchParams({ maxWidthPx, key: apiKey });
      if (maxHeightPx) params.set('maxHeightPx', maxHeightPx);
      const url = `https://places.googleapis.com/v1/${encodedPhotoRef}/media?${params.toString()}`;
      console.log("GOOGLE PHOTO URL:", url);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChineseBuffets/1.0)' },
      });
      const upstreamBody = await res.text().catch(() => '');
      return Response.json(
        {
          error: 'Google Places photo fetch failed',
          status: res.status,
          body: upstreamBody.slice(0, 1200),
          requestedPhotoReference: photoReference,
          widthParam: maxWidthPx,
        },
        { status: 502 }
      );
    }

    return new Response(cached.buffer, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[place-photo] Error:', error);
    return Response.json(
      { error: 'Internal server error while fetching photo' },
      { status: 500 }
    );
  }
}
