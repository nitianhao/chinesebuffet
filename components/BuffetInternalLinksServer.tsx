import Link from 'next/link';

/**
 * Server-rendered internal links for the buffet detail page.
 *
 * Purpose: ensure crawlers see rich internal links in the initial HTML
 * without relying on client-side JS (ComparisonBundle is ssr:false).
 *
 * Renders:
 *  1. "More buffets in {City}" — links to same-city buffets + city hub
 *  2. "More in {Neighborhood}" — link to neighborhood page + buffets (if neighborhood exists)
 *  3. "More in {State}" — link to state page
 *  4. "Nearby cities" — links to other city pages (optional)
 *
 * This is a **server component** — no 'use client', no interactivity.
 * Keep data minimal: only slugs, names, ratings needed.
 */

interface BuffetLink {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  rating?: number;
}

export interface BuffetInternalLinksServerProps {
  /** Current city slug (e.g. "los-angeles-ca") */
  citySlug: string;
  /** Display name of the city */
  cityName: string;
  /** State abbreviation (e.g. "CA") */
  stateAbbr: string;
  /** Full state name (e.g. "California") */
  stateName: string;
  /** Total buffets in city (for the CTA) */
  buffetCount?: number;
  /** Other buffets in the same city (excluding current) */
  sameCityBuffets: BuffetLink[];
  /** Neighborhood name if known */
  neighborhoodName?: string;
  /** Neighborhood slug (kebab-case) */
  neighborhoodSlug?: string;
}

export default function BuffetInternalLinksServer({
  citySlug,
  cityName,
  stateAbbr,
  stateName,
  buffetCount,
  sameCityBuffets,
  neighborhoodName,
  neighborhoodSlug,
}: BuffetInternalLinksServerProps) {
  const stateSlug = stateAbbr.toLowerCase();
  const hasCityBuffets = sameCityBuffets.length > 0;
  const hasNeighborhood = !!(neighborhoodName && neighborhoodSlug);
  const hasAnything = hasCityBuffets || hasNeighborhood || stateName;

  if (!hasAnything) return null;

  return (
    <nav
      aria-label="Related pages"
      className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
    >
      <h2 className="text-lg font-semibold text-[var(--text)] mb-4">
        Explore more Chinese buffets
      </h2>

      <div className="space-y-6">
        {/* ── More buffets in {City} ── */}
        {hasCityBuffets && (
          <div>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                More in {cityName}
              </h3>
              <Link
                href={`/chinese-buffets/${citySlug}`}
                className="text-xs font-medium text-[var(--accent1)] hover:underline"
              >
                All{buffetCount ? ` ${buffetCount}` : ''} buffets →
              </Link>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {sameCityBuffets.slice(0, 10).map((b) => (
                <li key={b.id} className="min-w-0">
                  <Link
                    href={`/chinese-buffets/${b.citySlug}/${b.slug}`}
                    className="group flex items-baseline gap-1.5 py-1 text-sm text-[var(--text)] hover:text-[var(--accent1)]"
                  >
                    <span className="truncate">{b.name}</span>
                    {b.rating != null && b.rating > 0 && (
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        ★ {b.rating.toFixed(1)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── More in {Neighborhood} ── */}
        {hasNeighborhood && (
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">
              <Link
                href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhoodSlug}`}
                className="hover:text-[var(--accent1)] hover:underline"
              >
                {neighborhoodName} neighborhood →
              </Link>
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Browse all Chinese buffets in {neighborhoodName}, {cityName}.
            </p>
          </div>
        )}

        {/* ── Hub links: state + city ── */}
        <div className="flex flex-wrap gap-3">
          {stateName && (
            <Link
              href={`/chinese-buffets/states/${stateSlug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
            >
              Buffets in {stateName} →
            </Link>
          )}
          <Link
            href={`/chinese-buffets/${citySlug}/neighborhoods`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
          >
            {cityName} neighborhoods →
          </Link>
        </div>
      </div>
    </nav>
  );
}
