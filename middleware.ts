import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for handling duplicate URL variants and query param normalization
 * 
 * Handles:
 * 1. Trailing slash removal (redirect /path/ to /path)
 * 2. Tracking query param removal (utm_*, gclid, fbclid, ref, etc.)
 * 3. PERF_LOG=1 timing instrumentation (Server-Timing + x-perf-* headers)
 * 
 * Note: This runs on every request, so keep it lightweight.
 */

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
