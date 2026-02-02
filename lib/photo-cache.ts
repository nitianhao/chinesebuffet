/**
 * Photo cache layer – DB-first approach for external image fetches
 *
 * Eliminates slow external API calls during page render:
 * - "If cached exists, use it"
 * - "If missing, fetch once, store, and serve"
 *
 * Uses Next.js unstable_cache for persistence across requests.
 * Page render never blocks on repeated external calls.
 */

import { unstable_cache } from 'next/cache';
import { createHash } from 'crypto';

const CACHE_REVALIDATE = 86400; // 24 hours

/** Hash a string for cache key (short, filesystem-safe) */
function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/** Cached result shape – base64 for JSON-serializable cache storage */
type CachedPhoto = { base64: string; contentType: string };

/** Fetch Google Places photo – external call (slow) */
async function fetchPlacePhotoFromGoogle(
  photoReference: string,
  maxWidthPx: string,
  maxHeightPx: string | null,
  apiKey: string
): Promise<CachedPhoto> {
  const pathSegments = photoReference.split('/').map((s) => encodeURIComponent(s));
  const encodedPhotoRef = pathSegments.join('/');
  const params = new URLSearchParams({ maxWidthPx });
  if (maxHeightPx) params.set('maxHeightPx', maxHeightPx);
  const url = `https://places.googleapis.com/v1/${encodedPhotoRef}/media?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ChineseBuffets/1.0)',
      'X-Goog-Api-Key': apiKey,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Places API error ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('Empty response from Google Places API');

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { base64: buffer.toString('base64'), contentType };
}

/** Fetch external URL photo – external call (slow) */
async function fetchExternalPhotoFromUrl(
  url: string,
  _maxWidthPx?: number
): Promise<CachedPhoto> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });

  if (!res.ok || !res.body) {
    throw new Error(`External fetch failed ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { base64: buffer.toString('base64'), contentType };
}

/**
 * Get Google Places photo – cached. Never blocks on repeated external calls.
 */
export async function getPlacePhotoCached(
  photoReference: string,
  maxWidthPx: string = '800',
  maxHeightPx: string | null = null
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[photo-cache] Missing Google API key');
    return null;
  }

  const cacheKey = hashKey(`place:${photoReference}:${maxWidthPx}:${maxHeightPx || ''}`);
  const fetcher = () =>
    fetchPlacePhotoFromGoogle(photoReference, maxWidthPx, maxHeightPx, apiKey);

  try {
    const cached: CachedPhoto = await unstable_cache(fetcher, [cacheKey], {
      revalidate: CACHE_REVALIDATE,
      tags: ['place-photo', `place-photo-${cacheKey}`],
    })();
    return {
      buffer: Buffer.from(cached.base64, 'base64'),
      contentType: cached.contentType,
    };
  } catch (e) {
    console.error('[photo-cache] Place photo fetch error:', e);
    return null;
  }
}

/**
 * Get external URL photo – cached. Never blocks on repeated external calls.
 */
export async function getExternalPhotoCached(
  url: string,
  maxWidthPx?: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cacheKey = hashKey(`url:${url}:${maxWidthPx ?? 0}`);

  const fetcher = () => fetchExternalPhotoFromUrl(url, maxWidthPx);

  try {
    const cached: CachedPhoto = await unstable_cache(fetcher, [cacheKey], {
      revalidate: CACHE_REVALIDATE,
      tags: ['external-photo', `external-photo-${cacheKey}`],
    })();
    return {
      buffer: Buffer.from(cached.base64, 'base64'),
      contentType: cached.contentType,
    };
  } catch (e) {
    console.error('[photo-cache] External photo fetch error:', e);
    return null;
  }
}
