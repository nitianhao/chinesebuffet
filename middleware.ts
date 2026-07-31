import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crossCuisineRedirects from './lib/generated/cross-cuisine-redirects.json';

/**
 * Middleware for handling duplicate URL variants and query param normalization
 *
 * Handles:
 * 1. Cross-cuisine redirects (SEO Bet 1): legacy /chinese-buffets/<indian> URLs
 *    308 to their /indian-buffets/ equivalents
 * 2. Trailing slash removal (redirect /path/ to /path)
 * 3. Tracking query param removal (utm_*, gclid, fbclid, ref, etc.)
 * 4. PERF_LOG=1 timing instrumentation (Server-Timing + x-perf-* headers)
 *
 * Note: This runs on every request, so keep it lightweight.
 */

/**
 * Generated map of legacy Chinese-route URLs for Indian-cuisine buffets to
 * their correct /indian-buffets/ paths. These URLs were indexed and earning
 * traffic; the route-level cuisine guard now notFound()s them, and a page-level
 * permanentRedirect() is swallowed by the route's ISR cache (revalidate=86400,
 * fetchCache='force-cache') — verified in prod. Middleware runs before the
 * cache on every request, so the 308 must live here.
 * Regenerate with: npx tsx scripts/generate-cross-cuisine-redirects.ts
 */
const CROSS_CUISINE_REDIRECTS = crossCuisineRedirects as Record<string, string>;

// Perf instrumentation is ~0 cost (two performance.now() calls + header set)
// so we always compute it, but only attach headers when PERF_LOG=1.
const PERF = process.env.PERF_LOG === '1';

/**
 * List of tracking query params to strip (case-insensitive)
 */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ref',
  'source',
  'campaign',
  'medium',
  'term',
  'content',
];

export function middleware(request: NextRequest) {
  const mwStart = performance.now();

  const url = request.nextUrl.clone();
  let hasChanges = false;

  // 0. Cross-cuisine redirects (SEO Bet 1)
  // Normalise a trailing slash for the lookup so /path and /path/ both match,
  // then 308 straight to the correct-cuisine path (already clean). Runs before
  // the ISR cache, unlike the swallowed page-level redirect.
  const rawPath = url.pathname;
  const lookupPath =
    rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  const crossCuisineTarget = CROSS_CUISINE_REDIRECTS[lookupPath];
  if (crossCuisineTarget) {
    url.pathname = crossCuisineTarget;
    const res = NextResponse.redirect(url, 308);
    if (PERF) addPerfHeaders(res, mwStart);
    return res;
  }

  // 1. Handle trailing slash removal
  // Only for content pages (not API routes, _next, static files, or root)
  if (url.pathname !== '/' && 
      !url.pathname.startsWith('/api/') && 
      !url.pathname.startsWith('/_next/') &&
      !url.pathname.startsWith('/_static/') &&
      url.pathname.endsWith('/')) {
    // Remove trailing slash
    url.pathname = url.pathname.slice(0, -1);
    hasChanges = true;
  }

  // 2. Remove tracking query params
  // Build list of params to remove
  const trackingParamsToRemove: string[] = [];
  
  url.searchParams.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Check if this is a tracking param (exact match or starts with param_)
    if (TRACKING_PARAMS.some(param => {
      const lowerParam = param.toLowerCase();
      return lowerKey === lowerParam || lowerKey.startsWith(lowerParam + '_');
    })) {
      trackingParamsToRemove.push(key);
    }
  });

  if (trackingParamsToRemove.length > 0) {
    trackingParamsToRemove.forEach(param => {
      url.searchParams.delete(param);
    });
    hasChanges = true;
  }

  // If we made changes, redirect to clean URL
  // Use 308 (Permanent Redirect) to preserve POST method if needed
  if (hasChanges) {
    const res = NextResponse.redirect(url, 308);
    if (PERF) addPerfHeaders(res, mwStart);
    return res;
  }

  const res = NextResponse.next();
  if (PERF) addPerfHeaders(res, mwStart);
  return res;
}

// ---------------------------------------------------------------------------
// Perf helpers – kept inline to avoid extra imports in middleware bundle
// ---------------------------------------------------------------------------

function addPerfHeaders(res: NextResponse, mwStart: number) {
  const mwMs = (performance.now() - mwStart).toFixed(2);
  const requestStartEpoch = Date.now(); // epoch ms — lets perf script compute total server time

  res.headers.set('x-perf-mw-ms', mwMs);
  res.headers.set('x-request-start', String(requestStartEpoch));
  // Server-Timing is visible in browser DevTools "Timing" tab
  res.headers.append('server-timing', `mw;dur=${mwMs}`);
}

// Only run middleware on specific paths to avoid unnecessary processing
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
