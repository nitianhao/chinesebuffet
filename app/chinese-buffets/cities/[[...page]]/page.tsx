import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCitiesRollup, CityRollupRow } from '@/lib/rollups';
import CityPageSearch from '@/components/cities/CityPageSearch';
import { getSiteUrl } from '@/lib/site-url';

const BASE_URL = getSiteUrl();
const isDev = process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// ISR caching — no searchParams access so the page stays cached.
// Pagination is path-based: /chinese-buffets/cities (page 1),
//                            /chinese-buffets/cities/2 (page 2), etc.
// ---------------------------------------------------------------------------
export const revalidate = isDev ? 3600 : 21600;
export const fetchCache = 'force-cache';

// On-demand ISR: pages are generated on first request and cached.
export async function generateStaticParams() {
  return [];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cities rendered in the A-Z section per page */
const CITIES_PER_PAGE = 150;

/** Top city cards shown only on page 1 */
const TOP_COUNT = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PageProps {
  params: { page?: string[] };
}

function parsePageNum(params: { page?: string[] }): number {
  if (!params.page || params.page.length === 0) return 1;
  const n = parseInt(params.page[0], 10);
  return Number.isFinite(n) && n >= 1 ? n : -1; // -1 = invalid
}

/** Sort cities alphabetically by state name then city name. */
function sortAlpha(cities: CityRollupRow[]): CityRollupRow[] {
  return [...cities].sort((a, b) => {
    const s = (a.state || a.stateAbbr).localeCompare(b.state || b.stateAbbr);
    return s !== 0 ? s : a.city.localeCompare(b.city);
  });
}

/** Group a city slice by state abbreviation, preserving order. */
function groupByState(cities: CityRollupRow[]) {
  const groups: { stateAbbr: string; stateName: string; cities: CityRollupRow[] }[] = [];
  let current: (typeof groups)[number] | null = null;

  for (const c of cities) {
    const abbr = c.stateAbbr || 'Other';
    if (!current || current.stateAbbr !== abbr) {
      current = { stateAbbr: abbr, stateName: c.state || abbr, cities: [] };
      groups.push(current);
    }
    current.cities.push(c);
  }
  return groups;
}

function pageUrl(page: number) {
  return page === 1
    ? `${BASE_URL}/chinese-buffets/cities`
    : `${BASE_URL}/chinese-buffets/cities/${page}`;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePageNum(params);
  const { cities } = await getCitiesRollup();
  const totalPages = Math.max(1, Math.ceil(cities.length / CITIES_PER_PAGE));

  if (page < 1 || page > totalPages) {
    return { title: 'Page Not Found', robots: { index: false, follow: false } };
  }

  const suffix = page > 1 ? ` - Page ${page} of ${totalPages}` : '';

  return {
    title: `Chinese Buffets by City${suffix} - Complete US Directory`,
    description:
      page === 1
        ? `Browse Chinese buffets in ${cities.length} cities across the US. Find hours, prices, ratings, and reviews.`
        : `Page ${page} of ${totalPages} — more cities with Chinese buffets across the US.`,
    alternates: { canonical: pageUrl(page) },
    robots: { index: true, follow: true },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function TopCityCard({ city }: { city: CityRollupRow }) {
  return (
    <Link
      href={`/chinese-buffets/${city.slug}`}
      className="group flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-all hover:border-[var(--accent1)] hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface2)] text-xs font-semibold text-[var(--muted)]">
        {city.stateAbbr}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent1)] line-clamp-1">
          {city.city}, {city.stateAbbr}
        </h3>
        <span className="text-xs text-[var(--muted)]">{city.buffetCount} buffets</span>
      </div>
    </Link>
  );
}

function PaginationNav({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  if (total <= 1) return null;

  // Build a window of page links: 1 ... [current-1] [current] [current+1] ... total
  const pages: (number | '...')[] = [];
  const add = (n: number) => {
    if (n >= 1 && n <= total && !pages.includes(n)) pages.push(n);
  };
  add(1);
  if (current - 1 > 2) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) add(i);
  if (current + 1 < total - 1) pages.push('...');
  add(total);

  const linkCls =
    'inline-flex h-9 min-w-[36px] items-center justify-center rounded-md border text-sm font-medium transition-colors';
  const href = (p: number) =>
    p === 1 ? '/chinese-buffets/cities' : `/chinese-buffets/cities/${p}`;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2">
      {current > 1 && (
        <Link href={href(current - 1)} className={`${linkCls} border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface2)]`}>
          ← Prev
        </Link>
      )}
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="px-1 text-[var(--muted)]">…</span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === current ? 'page' : undefined}
            className={`${linkCls} ${
              p === current
                ? 'border-[var(--accent1)] bg-[var(--accent1)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface2)]'
            }`}
          >
            {p}
          </Link>
        ),
      )}
      {current < total && (
        <Link href={href(current + 1)} className={`${linkCls} border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface2)]`}>
          Next →
        </Link>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CitiesIndexPage({ params }: PageProps) {
  const page = parsePageNum(params);
  const { cities: allCities } = await getCitiesRollup();
  const totalPages = Math.max(1, Math.ceil(allCities.length / CITIES_PER_PAGE));

  if (page < 1 || page > totalPages) notFound();

  // --- Data prep ---
  const totalBuffets = allCities.reduce((s, c) => s + c.buffetCount, 0);
  const alphaAll = sortAlpha(allCities);

  const start = (page - 1) * CITIES_PER_PAGE;
  const pageSlice = alphaAll.slice(start, start + CITIES_PER_PAGE);
  const stateGroups = groupByState(pageSlice);

  // Top cities (by buffet count) — page 1 only
  const topCities = page === 1 ? allCities.slice(0, TOP_COUNT) : [];

  // Minimal shape passed to client search component
  const searchData = pageSlice.map((c) => ({
    slug: c.slug,
    city: c.city,
    stateAbbr: c.stateAbbr,
    buffetCount: c.buffetCount,
  }));

  // Range label for current page (e.g. "A–M" or state range)
  const firstState = stateGroups[0]?.stateName ?? '';
  const lastState = stateGroups[stateGroups.length - 1]?.stateName ?? '';
  const rangeLabel = firstState === lastState ? firstState : `${firstState} – ${lastState}`;

  const isPage1 = page === 1;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* rel prev/next for crawlers — rendered in <body> but still useful */}
      {page > 1 && (
        <link
          rel="prev"
          href={page === 2 ? '/chinese-buffets/cities' : `/chinese-buffets/cities/${page - 1}`}
        />
      )}
      {page < totalPages && (
        <link rel="next" href={`/chinese-buffets/cities/${page + 1}`} />
      )}

      {/* Header */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="text-sm text-[var(--muted)] mb-3">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            {isPage1 ? (
              <span className="text-[var(--text)]">Cities</span>
            ) : (
              <>
                <Link href="/chinese-buffets/cities" className="hover:text-[var(--accent1)]">Cities</Link>
                <span className="mx-2">/</span>
                <span className="text-[var(--text)]">Page {page}</span>
              </>
            )}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text)] mb-1">
            Chinese Buffets by City{!isPage1 && ` — Page ${page}`}
          </h1>
          <p className="text-base text-[var(--muted)]">
            {totalBuffets.toLocaleString()} buffets in {allCities.length} cities
            {!isPage1 && ` · Showing ${rangeLabel}`}
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Top cities (page 1 only) */}
        {isPage1 && topCities.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-[var(--text)] mb-4">Top Cities</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topCities.map((c) => (
                <TopCityCard key={c.slug} city={c} />
              ))}
            </div>
          </section>
        )}

        {/* Search + A-Z city list */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-[var(--text)]">
              {isPage1 ? 'All Cities A–Z' : `Cities — ${rangeLabel}`}
            </h2>
            {totalPages > 1 && (
              <span className="text-sm text-[var(--muted)]">
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          <CityPageSearch cities={searchData}>
            {/* Server-rendered city list — hidden when user is searching */}
            <div className="space-y-6">
              {stateGroups.map((g) => (
                <div key={g.stateAbbr} id={`state-${g.stateAbbr.toLowerCase()}`}>
                  <h3 className="text-base font-semibold text-[var(--text)] mb-2">
                    <Link
                      href={`/chinese-buffets/states/${g.stateAbbr.toLowerCase()}`}
                      className="hover:text-[var(--accent1)]"
                    >
                      {g.stateName}
                    </Link>
                    <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                      ({g.cities.length})
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {g.cities.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/chinese-buffets/${c.slug}`}
                        className="text-sm text-[var(--text)] hover:text-[var(--accent1)] py-0.5"
                      >
                        {c.city}
                        <span className="text-[var(--muted)] ml-1">({c.buffetCount})</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CityPageSearch>
        </section>

        {/* Pagination */}
        <PaginationNav current={page} total={totalPages} />

        {/* Footer nav */}
        <nav className="border-t border-[var(--border)] pt-6 text-sm">
          <Link href="/" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            ← Home
          </Link>
          <span className="mx-3 text-[var(--muted)]">|</span>
          <Link href="/chinese-buffets/states" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            Browse by State →
          </Link>
        </nav>
      </div>
    </div>
  );
}
