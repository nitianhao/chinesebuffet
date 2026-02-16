/**
 * Single source of truth for the site's absolute URL.
 *
 * Usage:
 *   import { getBaseUrlSafe } from '@/lib/site-url';
 *   const url = getBaseUrlSafe(); // e.g. "https://buffetlocator.com"
 *
 * Rules:
 *   - NEVER throws at module scope or during build
 *   - Accepts NEXT_PUBLIC_SITE_URL in multiple formats:
 *     - "buffetlocator.com" -> "https://buffetlocator.com"
 *     - "https://buffetlocator.com" -> "https://buffetlocator.com"
 *     - "https://buffetlocator.com/" -> "https://buffetlocator.com"
 *   - Falls back to VERCEL_URL if NEXT_PUBLIC_SITE_URL is missing
 *   - Falls back to "http://localhost:3000" if both are missing
 *   - Always returns a URL with no trailing slash
 */

/**
 * Normalizes a raw URL string to a valid absolute URL without trailing slash.
 * Returns null if the input is invalid or missing.
 * 
 * @param raw - Raw URL string (may or may not have protocol)
 * @returns Normalized URL or null if invalid
 */
function normalizeBaseUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    // If no protocol, prepend https://
    const withProtocol = trimmed.match(/^https?:\/\//)
      ? trimmed
      : `https://${trimmed}`;

    // Validate with URL constructor
    const url = new URL(withProtocol);

    // Return origin without trailing slash (protocol + hostname + port if non-standard)
    return url.origin;
  } catch {
    // Invalid URL format
    return null;
  }
}

let _cached: string | undefined;

/**
 * Get the base URL for the site. NEVER throws - always returns a valid URL.
 * Safe to use during build, in metadata, robots.txt, and sitemaps.
 * 
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL (normalized)
 * 2. VERCEL_URL (Vercel build/runtime env)
 * 3. http://localhost:3000 (safe fallback)
 * 
 * @returns Absolute base URL without trailing slash
 */
export function getBaseUrlSafe(): string {
  if (_cached) return _cached;

  // Try NEXT_PUBLIC_SITE_URL first
  const siteUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (siteUrl) {
    _cached = siteUrl;
    return _cached;
  }

  // Try VERCEL_URL (available during Vercel builds and runtime)
  const vercelUrl = normalizeBaseUrl(process.env.VERCEL_URL);
  if (vercelUrl) {
    _cached = vercelUrl;
    return _cached;
  }

  // Safe fallback for local development and builds without env vars
  _cached = 'http://localhost:3000';
  return _cached;
}

/**
 * Absolute canonical URL for a pathname. Use in every page's metadata so no
 * canonical is inherited from layout.
 * 
 * @param pathname - e.g. "/", "/search", "/chinese-buffets/states"
 * @returns Absolute canonical URL
 */
export function getCanonicalUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getBaseUrlSafe()}${path}`;
}

/**
 * @deprecated Use getBaseUrlSafe() instead. This function is kept for backward compatibility.
 * 
 * Legacy function that used to throw in production. Now safely delegates to getBaseUrlSafe().
 */
export function getSiteUrl(): string {
  return getBaseUrlSafe();
}

/**
 * @deprecated Use getBaseUrlSafe() instead. This function is kept for backward compatibility.
 * 
 * Legacy function that used to throw if env var was missing. Now safely delegates to getBaseUrlSafe().
 */
export function getBaseUrlForRobotsAndSitemaps(): string {
  return getBaseUrlSafe();
}
