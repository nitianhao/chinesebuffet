/**
 * Single source of truth for the site's absolute URL.
 *
 * Usage:
 *   import { getSiteUrl } from '@/lib/site-url';
 *   const url = getSiteUrl(); // e.g. "https://buffetlocator.com"
 *
 * Rules:
 *   - In production builds: NEXT_PUBLIC_SITE_URL **must** be set; throws otherwise.
 *   - In development / test: falls back to http://localhost:3000.
 *   - Always returns a URL with no trailing slash.
 */

function normalize(url: string): string {
  return url.replace(/\/+$/, '');
}

let _cached: string | undefined;

export function getSiteUrl(): string {
  if (_cached) return _cached;

  const raw = process.env.NEXT_PUBLIC_SITE_URL;

  if (raw) {
    _cached = normalize(raw);
    return _cached;
  }

  // Production without the env var is a hard error.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[site-url] NEXT_PUBLIC_SITE_URL is not set. ' +
        'This environment variable is required for production builds so that ' +
        'robots.txt, sitemaps, canonicals, and OG URLs resolve to the correct domain. ' +
        'Set it in your .env.production or hosting environment, e.g.:\n' +
        '  NEXT_PUBLIC_SITE_URL=https://buffetlocator.com'
    );
  }

  // Dev / test fallback
  _cached = 'http://localhost:3000';
  return _cached;
}

/**
 * Absolute canonical URL for a pathname. Use in every page's metadata so no
 * canonical is inherited from layout.
 * @param pathname - e.g. "/", "/search", "/chinese-buffets/states"
 */
export function getCanonicalUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getSiteUrl()}${path}`;
}

/**
 * Base URL for robots.txt and sitemaps. Uses NEXT_PUBLIC_SITE_URL only; no dev fallback.
 * Throws if missing so robots/sitemaps never use a wrong domain.
 */
export function getBaseUrlForRobotsAndSitemaps(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw || typeof raw !== 'string') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is required for robots and sitemaps. Set it in .env or environment.'
    );
  }
  return raw.replace(/\/+$/, '');
}
