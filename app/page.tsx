import { Metadata } from 'next';
import Link from 'next/link';
import SectionHeader from '@/components/homepage/SectionHeader';
import TopRatedBuffetCard from '@/components/homepage/TopRatedBuffetCard';
import SiteShell from '@/components/layout/SiteShell';
import SearchBar from '@/components/SearchBar';
import MobileSearchDrawer from '@/components/search/MobileSearchDrawer';
import { getHomePageData } from '@/lib/homepage-data';
import { h2, muted } from '@/lib/layout-utils';
import { STATE_ABBR_TO_NAME } from '@/lib/rollups';
import { REGION_LABELS, VALID_REGIONS } from '@/lib/regions';
import { generateSlug } from '@/lib/utils';
import { getSiteUrl, getCanonicalUrl } from '@/lib/site-url';
import { JsonLdServer } from '@/components/seo/JsonLdServer';

/** Lightweight POI link data — no DB calls needed */
const POI_LINKS = [
  { slug: 'parking', label: 'With parking' },
  { slug: 'shopping-malls', label: 'Near shopping malls' },
  { slug: 'highways', label: 'Near highways' },
  { slug: 'gas-stations', label: 'Near gas stations' },
] as const;

export const revalidate = 43200;

export const metadata: Metadata = {
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
  alternates: { canonical: getCanonicalUrl('/') },
  robots: { index: true, follow: true },
};

export default async function HomePage() {
  const data = await getHomePageData();
  const ratedBuffets = data.topRatedBuffets.filter((buffet) => buffet.rating > 0);
  const siteUrl = getSiteUrl();
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: siteUrl,
    name: 'Chinese Buffet Directory',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Chinese Buffet Directory',
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    sameAs: [] as string[],
  };

  return (
    <SiteShell>
      <div style={{ display: 'none' }} aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '<!-- JSONLD_START:website -->' }} />
      <JsonLdServer data={websiteSchema} />
      <div style={{ display: 'none' }} aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '<!-- JSONLD_END:website -->' }} />
      <div style={{ display: 'none' }} aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '<!-- JSONLD_START:org -->' }} />
      <JsonLdServer data={organizationSchema} />
      <div style={{ display: 'none' }} aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '<!-- JSONLD_END:org -->' }} />
      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-labelledby="hero-heading"
      >
        <div className="max-w-2xl text-center md:text-left">
          <h1 id="hero-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-[var(--text)]">
            Chinese Buffet Directory
          </h1>
          <p className={`${muted} mt-4`}>
            Find Chinese buffets by city, neighborhood, rating, price, and dine-in/takeout options.
          </p>
          <div className="mt-6 w-full max-w-xl md:max-w-xl">
            <div className="md:hidden">
              <MobileSearchDrawer
                triggerAriaLabel="Open search"
                placeholder="Search City, Neighborhood, Buffets"
                triggerClassName="w-full rounded-full border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-left text-[var(--text-secondary)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)]"
                triggerChildren={
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search City, Neighborhood, Buffets
                  </span>
                }
              />
            </div>
            <div className="hidden md:block">
              <SearchBar />
            </div>
          </div>
        </div>
      </section>

      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-labelledby="intro-heading"
      >
        <h2 id="intro-heading" className={h2}>
          Find the right buffet fast
        </h2>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-4 sm:p-6">
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <p className={`${muted} max-w-3xl`}>
              Explore Chinese buffet options across cities and neighborhoods with trustworthy ratings and
              reviews. Whether you want a quick dine-in stop or a takeout-friendly spot, this directory
              helps you compare places and decide where to eat.
            </p>
            <ul className="mt-4 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)] md:mt-0">
              <li>Ratings and reviews to compare quality and consistency.</li>
              <li>Photo previews when available.</li>
              <li>Nearby places and hubs to help you explore local options.</li>
            </ul>
          </div>
        </div>
      </section>

      {data.popularCities.length > 0 && (
        <section
          className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
          aria-label="Browse by city"
        >
          <SectionHeader
            title="Browse by city"
            actionHref="/chinese-buffets/cities"
            actionLabel="View all cities"
          />
          <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
            {data.popularCities.slice(0, 30).map((city) => (
              <li key={city.slug} className="min-w-0">
                <a
                  href={`/chinese-buffets/${city.slug}`}
                  className="block min-h-[44px] py-2 text-[var(--text)] hover:text-[var(--accent1)] hover:underline"
                >
                  <span className="block min-w-0 font-medium leading-tight line-clamp-2">
                    {city.city}, {city.stateAbbr}
                  </span>
                  <span className={`${muted} block text-sm`}>{city.count} buffets</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-label="Directory stats"
      >
        <p className={`${muted} text-sm sm:text-base`}>
          <span className="font-medium text-[var(--text)]">
            {data.totalBuffets.toLocaleString()} buffets
          </span>
          <span aria-hidden="true" className="mx-2">·</span>
          <span className="font-medium text-[var(--text)]">
            {data.totalCities.toLocaleString()} cities
          </span>
          <span aria-hidden="true" className="mx-2">·</span>
          <span className="font-medium text-[var(--text)]">
            {data.totalStates.toLocaleString()} states
          </span>
        </p>
      </section>

      {data.popularStates.length > 0 && (
        <section
          className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
          aria-label="Browse by state"
        >
          <SectionHeader
            title="Browse by state"
            actionHref="/chinese-buffets/states"
            actionLabel="View all states"
          />
          <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
            {data.popularStates.slice(0, 20).map((state) => (
              <li key={state.stateAbbr} className="min-w-0">
                <a
                  href={`/chinese-buffets/states/${state.stateAbbr.toLowerCase()}`}
                  className="block min-h-[44px] py-2 text-[var(--text)] hover:text-[var(--accent1)] hover:underline"
                >
                  <span className="block min-w-0 font-medium leading-tight line-clamp-2">
                    {STATE_ABBR_TO_NAME[state.stateAbbr] || state.stateAbbr}
                  </span>
                  <span className={`${muted} block text-sm`}>{state.count} buffets</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Browse by nearby places — server-rendered POI links */}
      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-label="Browse by nearby places"
      >
        <SectionHeader title="Browse by nearby places" />
        <ul className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {POI_LINKS.map((poi) => (
            <li key={poi.slug}>
              <Link
                href={`/chinese-buffets/near/${poi.slug}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors text-center"
              >
                {poi.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Browse by region — server-rendered region links */}
      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-label="Browse by region"
      >
        <SectionHeader title="Browse by region" />
        <ul className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {VALID_REGIONS.map((region) => (
            <li key={region}>
              <Link
                href={`/chinese-buffets/regions/${region}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors text-center"
              >
                {REGION_LABELS[region]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-label="Top rated Chinese buffets"
      >
        <SectionHeader title="Top rated Chinese buffets" />
        {ratedBuffets.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ratedBuffets.map((buffet) => {
              const citySlug = generateSlug(`${buffet.city}-${buffet.stateAbbr}`);
              // TODO: Filter to true buffets when a definitive category/type field exists.
              return (
                <li key={`${buffet.city}-${buffet.slug}`} className="h-full">
                  <TopRatedBuffetCard
                    buffet={buffet}
                    citySlug={citySlug}
                    subtitle={`${buffet.city}, ${buffet.stateAbbr}`}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={muted}>No top-rated buffets found yet.</p>
        )}
      </section>

      <section
        className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
        aria-label="FAQ"
      >
        <SectionHeader title="FAQ" />
        <div className="mt-4 space-y-3">
          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-lg">
              How do you rank buffets?
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              We highlight places with strong ratings and a meaningful number of reviews, then show them
              by city so you can compare options quickly.
            </p>
          </details>
          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-lg">
              How often is the data updated?
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              We refresh directory data on a regular schedule and continue to add new locations over time.
            </p>
          </details>
          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-lg">
              Can I add a buffet?
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Yes. Use the submit form to share a buffet and we will review it before publishing.
            </p>
          </details>
          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-lg">
              Do you cover my city?
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              We cover cities across the United States and are expanding. Search to see what is available
              near you.
            </p>
          </details>
          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-lg">
              What information is listed for each buffet?
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              Each listing includes the buffet name, location, ratings and reviews, and other helpful
              details when available.
            </p>
          </details>
          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-lg">
              Do you show dine-in or takeout options?
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              When service options are available, we include them so you can plan your visit.
            </p>
          </details>
        </div>
      </section>
    </SiteShell>
  );
}
