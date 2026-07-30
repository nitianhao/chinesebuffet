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

// Immutable cache: the function fetches each image once, then the CDN + browser
// serve it. Keeps Vercel Function Invocations near zero (see COST GUARD note).
const IMMUTABLE_IMAGE_CACHE =
  "public, s-maxage=31536000, max-age=31536000, immutable";

// SSRF guard: only proxy Google-hosted photos (the shape backfill-photos.ts stores).
const ALLOWED_IMAGE_HOST = /(^|\.)googleusercontent\.com$/i;

/**
 * Rewrite a googleusercontent size directive (the `=w1200-h554-k-no` suffix) to
 * the requested width so thumbnails fetch small images instead of the full size.
 * Falls back to the original URL when the format is unrecognized.
 */
function resizeGoogleImageUrl(rawUrl: string, w: number): string {
  const eq = rawUrl.lastIndexOf("=");
  if (eq === -1) return `${rawUrl}=w${w}`;
  const opt = rawUrl.slice(eq + 1);
  return /^[a-z0-9-]+$/i.test(opt) ? `${rawUrl.slice(0, eq)}=w${w}` : rawUrl;
}

/**
 * Proxy a scraped direct image URL. Server-side fetch avoids the browser
 * hotlink throttling that makes lh3 URLs load unreliably, and the response is
 * cached hard so repeat views cost nothing.
 */
async function fetchDirectImage(rawUrl: string, w: number): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return Response.json(
      { error: "Invalid url" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOST.test(parsed.hostname)) {
    return Response.json(
      { error: "url host not allowed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const sized = resizeGoogleImageUrl(rawUrl, w);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let res: any = await (fetch as any)(sized, {
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  // If the resized variant fails, retry the original URL once.
  if (!res.ok && sized !== rawUrl) {
    res = await (fetch as any)(rawUrl, { next: { revalidate: 60 * 60 * 24 * 30 } });
  }
  if (!res.ok) {
    return Response.json(
      { error: "Upstream image unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const bytes = await res.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": IMMUTABLE_IMAGE_CACHE,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const photoReference = searchParams.get("photoReference") || "";
    const directUrl = searchParams.get("url") || "";
    const wRaw = searchParams.get("w");

    const wNum = Number(wRaw);
    const w = Number.isFinite(wNum) && wNum > 0 ? Math.round(wNum) : 800;

    // Scraped hero photos are stored as direct googleusercontent URLs. Proxying
    // them (rather than hotlinking) makes them load reliably; this path is free
    // of the Places API, so it's not subject to the DISABLE_GOOGLE_APIS guard.
    if (directUrl) {
      return await fetchDirectImage(directUrl, w);
    }

    // Validate
    if (!photoReference || !photoReference.startsWith("places/")) {
      return Response.json(
        { error: "Invalid photoReference: must start with places/" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // COST GUARD (dev): when DISABLE_GOOGLE_APIS=1, never call the billable
    // Google Places Photo API. Return a lightweight placeholder instead so
    // local page loads cost nothing. Production leaves this unset.
    if (process.env.DISABLE_GOOGLE_APIS === "1") {
      const h = Math.round(w * 0.66);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 3 2"><rect width="3" height="2" fill="#e5e7eb"/><text x="1.5" y="1.05" font-size="0.18" fill="#9ca3af" text-anchor="middle" font-family="sans-serif">photo disabled (dev)</text></svg>`;
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

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
