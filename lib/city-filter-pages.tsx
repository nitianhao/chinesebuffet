/**
 * Shared logic for curated SEO filter pages under /chinese-buffets/[city-state]/<filter>.
 *
 * Filters: best | cheap | open-now | top-rated
 *
 * Each filter page is a server-rendered, ISR-cached, static HTML page
 * with a unique title, description, intro, and canonical URL.
 * Only generated when filtered results >= MIN_RESULTS.
 */

import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getCityBuffetsRollup, CityBuffetRow } from '@/lib/rollups';
import SiteShell from '@/components/layout/SiteShell';
import { getSiteUrl } from '@/lib/site-url';

const BASE_URL = getSiteUrl();
const isDev = process.env.NODE_ENV !== 'production';
const REVALIDATE = isDev ? 3600 : 21600;
const MIN_RESULTS = 5;

const getCityBuffetsCached = unstable_cache(
  async (citySlug: string) => getCityBuffetsRollup(citySlug),
  ['city-buffets-rollup'],
  { revalidate: REVALIDATE }
);

// ---------------------------------------------------------------------------
// Filter definitions — the only curated intents
// ---------------------------------------------------------------------------

export type CityFilter = 'best' | 'cheap' | 'open-now' | 'top-rated';

export const CITY_FILTERS: CityFilter[] = ['best', 'cheap', 'open-now', 'top-rated'];

interface FilterConfig {
  /** Human-readable label for nav links */
  label: string;
  /** Build page <title> */
  title: (city: string, state: string) => string;
  /** Build meta description */
  description: (city: string, state: string, count: number) => string;
  /** Intro paragraph rendered on-page */
  intro: (city: string, state: string) => string;
  /** Filter + sort logic applied to the full buffet list */
  apply: (buffets: CityBuffetRow[]) => CityBuffetRow[];
}

const FILTER_CONFIGS: Record<CityFilter, FilterConfig> = {
  best: {
    label: 'Best',
    title: (city, state) =>
      `Best Chinese Buffets in ${city}, ${state} — Top Picks`,
    description: (city, state, count) =>
      `The ${count} best Chinese buffets in ${city}, ${state}, ranked by rating and review volume.`,
    intro: (city) =>
      `The best Chinese buffets in ${city}, ranked by a combination of customer rating and review volume. These are the highest-quality all-you-can-eat spots locals recommend.`,
    apply: (buffets) =>
      buffets
        .filter((b) => (b.rating ?? 0) > 0 && (b.reviewsCount ?? 0) > 0)
        .sort((a, b) => {
          const scoreA =
            (a.rating ?? 0) * Math.log2(Math.max(a.reviewsCount ?? 1, 1));
          const scoreB =
            (b.rating ?? 0) * Math.log2(Math.max(b.reviewsCount ?? 1, 1));
          return scoreB - scoreA;
        }),
  },
  'top-rated': {
    label: 'Top Rated',
    title: (city, state) =>
      `Top Rated Chinese Buffets in ${city}, ${state}`,
    description: (city, state, count) =>
      `${count} top-rated Chinese buffets in ${city}, ${state}. Sorted by highest customer rating.`,
    intro: (city) =>
      `Top-rated Chinese buffets in ${city}, sorted by highest customer rating. These buffets consistently earn the best scores from diners.`,
    apply: (buffets) =>
      buffets
        .filter((b) => (b.rating ?? 0) >= 3.5)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
  },
  cheap: {
    label: 'Cheap',
    title: (city, state) =>
      `Cheap Chinese Buffets in ${city}, ${state} — Affordable All-You-Can-Eat`,
    description: (city, state, count) =>
      `${count} affordable Chinese buffets in ${city}, ${state}. Budget-friendly all-you-can-eat options sorted by price.`,
    intro: (city) =>
      `Affordable Chinese buffets in ${city}. These budget-friendly all-you-can-eat restaurants offer the best value without breaking the bank.`,
    apply: (buffets) => {
      const withPrice = buffets.filter((b) => b.price != null && b.price !== '');
      return withPrice.sort((a, b) => {
        const dollarCount = (p: string) => (p.match(/\$/g) || []).length;
        const pa = dollarCount(a.price!);
        const pb = dollarCount(b.price!);
        if (pa !== pb) return pa - pb;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
    },
  },
  'open-now': {
    label: 'Open Now',
    title: (city, state) =>
      `Chinese Buffets Open Now in ${city}, ${state}`,
    description: (city, state, count) =>
      `Find ${count} Chinese buffets open in ${city}, ${state}. Check hours and visit today.`,
    intro: (city) =>
      `Chinese buffets in ${city} with listed operating hours. Check individual listings for today's hours and plan your visit.`,
    apply: (buffets) =>
      // Show all buffets with a phone number (indicator of active business),
      // sorted by rating. Actual real-time open/closed status is on detail pages.
      buffets
        .filter((b) => b.phone != null && b.phone !== '')
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
  },
};

// ---------------------------------------------------------------------------
// Metadata builder — used by each thin page's generateMetadata export
// ---------------------------------------------------------------------------

export async function buildFilterMetadata(
  citySlug: string,
  filter: CityFilter
): Promise<Metadata> {
  const config = FILTER_CONFIGS[filter];
  const { data } = await getCityBuffetsCached(citySlug);

  if (!data || data.buffets.length === 0) {
    return {
      title: 'Not Found',
      robots: { index: false, follow: false },
    };
  }

  const filtered = config.apply(data.buffets);
  if (filtered.length < MIN_RESULTS) {
    return {
      title: config.title(data.cityName, data.state),
      robots: { index: false, follow: true },
    };
  }

  return {
    title: config.title(data.cityName, data.state),
    description: config.description(data.cityName, data.state, filtered.length),
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/${citySlug}/${filter}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared page component — server-rendered, static HTML
// ---------------------------------------------------------------------------

interface CityFilterPageShellProps {
  citySlug: string;
  filter: CityFilter;
}

export async function CityFilterPageShell({
  citySlug,
  filter,
}: CityFilterPageShellProps) {
  const config = FILTER_CONFIGS[filter];
  const { data } = await getCityBuffetsCached(citySlug);

  if (!data || data.buffets.length === 0) {
    notFound();
  }

  const filtered = config.apply(data.buffets);
  if (filtered.length < MIN_RESULTS) {
    notFound();
  }

  const { cityName, state, stateAbbr } = data;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: state,
        item: `${BASE_URL}/chinese-buffets/states/${stateAbbr.toLowerCase()}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: cityName,
        item: `${BASE_URL}/chinese-buffets/${citySlug}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: config.label,
        item: `${BASE_URL}/chinese-buffets/${citySlug}/${filter}`,
      },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: config.title(cityName, state),
    numberOfItems: filtered.length,
    itemListElement: filtered.slice(0, 30).map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/chinese-buffets/${citySlug}/${b.slug}`,
      name: b.name,
    })),
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <header className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <nav className="text-sm text-[var(--muted)] mb-4">
          <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
          <span className="mx-2">/</span>
          <Link
            href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
            className="hover:text-[var(--accent1)]"
          >
            {state}
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/chinese-buffets/${citySlug}`}
            className="hover:text-[var(--accent1)]"
          >
            {cityName}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--text)]">{config.label}</span>
        </nav>

        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)] mb-2">
          {config.title(cityName, state)}
        </h1>
        <p className="text-[var(--muted)] max-w-2xl leading-relaxed">
          {config.intro(cityName, state)}
        </p>
      </header>

      {/* Filter nav pills */}
      <nav
        aria-label="Filter options"
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
      >
        <ul className="flex flex-wrap gap-2">
          {CITY_FILTERS.map((f) => (
            <li key={f}>
              <Link
                href={`/chinese-buffets/${citySlug}/${f}`}
                className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  f === filter
                    ? 'border-[var(--accent1)] bg-[var(--accent1)] text-white'
                    : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)]'
                }`}
              >
                {FILTER_CONFIGS[f].label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={`/chinese-buffets/${citySlug}`}
              className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
            >
              All buffets
            </Link>
          </li>
        </ul>
      </nav>

      {/* Buffet list */}
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <p className="text-sm text-[var(--muted)] mb-4">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </p>
        <ul className="divide-y divide-[var(--border)]">
          {filtered.map((b, i) => (
            <li key={b.id} className="py-4 first:pt-0 last:pb-0">
              <Link
                href={`/chinese-buffets/${citySlug}/${b.slug}`}
                className="group block"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-[var(--muted)] mr-2">
                      {i + 1}.
                    </span>
                    <span className="font-medium text-[var(--text)] group-hover:text-[var(--accent1)]">
                      {b.name}
                    </span>
                    {b.neighborhood && (
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {b.neighborhood}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    {b.rating != null && b.rating > 0 && (
                      <span className="text-[var(--text)]">
                        ★ {b.rating.toFixed(1)}
                      </span>
                    )}
                    {b.reviewsCount != null && b.reviewsCount > 0 && (
                      <span className="text-[var(--muted)] text-xs">
                        ({b.reviewsCount})
                      </span>
                    )}
                    {b.price && (
                      <span className="text-[var(--muted)] text-xs">
                        {b.price}
                      </span>
                    )}
                  </div>
                </div>
                {b.address && (
                  <p className="text-xs text-[var(--muted)] mt-1 truncate">
                    {b.address}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Back nav */}
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <Link
          href={`/chinese-buffets/${citySlug}`}
          className="text-[var(--accent1)] hover:opacity-80 font-medium"
        >
          ← All buffets in {cityName}
        </Link>
        <span className="mx-4 text-[var(--muted)]">|</span>
        <Link
          href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
          className="text-[var(--accent1)] hover:opacity-80 font-medium"
        >
          {state} →
        </Link>
      </section>
    </SiteShell>
  );
}
