import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for handling duplicate URL variants and query param normalization
 * 
 * Handles:
 * 1. Trailing slash removal (redirect /path/ to /path)
 * 2. Tracking query param removal (utm_*, gclid, fbclid, ref, etc.)
 * 
 * Note: This runs on every request, so keep it lightweight.
 */

/**
 * List of tracking query params to strip (case-insensitive)
 * 
 * These params are removed from URLs and users are redirected to the clean canonical URL:
 * - utm_*: Google Analytics UTM parameters (utm_source, utm_medium, utm_campaign, utm_term, utm_content)
 * - gclid: Google Click ID (Google Ads tracking)
 * - fbclid: Facebook Click ID (Facebook Ads tracking)
 * - ref: Generic referrer parameter
 * - source, campaign, medium, term, content: Generic marketing parameters
 * 
 * Params are matched case-insensitively and also match variants (e.g., utm_source_foo matches utm_source)
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
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
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
