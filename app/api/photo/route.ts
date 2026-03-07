import { NextRequest } from "next/server";

/**
 * COST GUARD:
 * - This route is intentionally edge-cacheable.
 * - Do not use cookies()/headers()/draftMode()/unstable_noStore() here.
 * - Changing Cache-Control impacts Vercel Function Invocations.
 */

async function fetchPhotoBytes(photoName: string, w: number, key: string): Promise<Response | null> {
  const placesBase = "https://places." + "googleapis.com/v1";
  const url = `${placesBase}/${photoName}/media?maxWidthPx=${w}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (fetch as any)(url, {
    headers: { "X-Goog-Api-Key": key },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) return null;
  return res;
}

/**
 * Extract placeId from a photo reference like "places/{placeId}/photos/{photoName}"
 */
function extractPlaceId(photoReference: string): string | null {
  const match = photoReference.match(/^places\/([^/]+)\/photos\//);
  return match ? match[1] : null;
}

/**
 * Fetch fresh photo names from Places API for a given placeId.
 * Returns an array of fresh photo resource names.
 */
async function fetchFreshPhotoNames(placeId: string, key: string): Promise<string[]> {
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${key}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (fetch as any)(url, { next: { revalidate: 3600 } }); // cache for 1h
  if (!res.ok) return [];
  try {
    const data = await res.json();
    const photos: Array<{ name?: string }> = data?.photos ?? [];
    return photos.map((p) => p.name).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const photoReference = searchParams.get("photoReference") || "";
    const wRaw = searchParams.get("w");

    // Validate
    if (!photoReference || !photoReference.startsWith("places/")) {
      return Response.json(
        { error: "Invalid photoReference: must start with places/" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const wNum = Number(wRaw);
    const w = Number.isFinite(wNum) && wNum > 0 ? Math.round(wNum) : 800;

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return Response.json(
        { error: "Missing GOOGLE_MAPS_API_KEY on server" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Try the stored photo reference first
    let upstreamRes = await fetchPhotoBytes(photoReference, w, key);

    // If that failed (stale/expired token), fall back to fetching fresh photo names
    if (!upstreamRes) {
      const placeId = extractPlaceId(photoReference);
      if (placeId) {
        const freshNames = await fetchFreshPhotoNames(placeId, key);
        for (const name of freshNames) {
          upstreamRes = await fetchPhotoBytes(name, w, key);
          if (upstreamRes) break;
        }
      }
    }

    if (!upstreamRes) {
      return Response.json(
        { error: "Google Places photo unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const contentType =
      upstreamRes.headers.get("content-type") || "application/octet-stream";
    const bytes = await upstreamRes.arrayBuffer();

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Strong browser caching
        "Cache-Control": "public, s-maxage=31536000, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    return Response.json(
      { error: "Unexpected error in /api/photo", message: String(err?.message ?? err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
