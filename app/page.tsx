import { Metadata } from 'next';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import SectionHeader from '@/components/homepage/SectionHeader';
import { getHomePageData } from '@/lib/homepage-data';
import { pageContainer, sectionY, muted } from '@/lib/layout-utils';
import { STATE_ABBR_TO_NAME } from '@/lib/rollups';

export const metadata: Metadata = {
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
};

export default async function HomePage() {
  const data = await getHomePageData();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Hero Section */}
      <section className={`bg-[var(--surface)] border-b border-[var(--border)] ${sectionY}`} aria-label="Hero">
        <div className={`${pageContainer} flex flex-col items-center text-center`}>
          <div className="max-w-2xl w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[var(--text)] mb-4">
              Find Chinese Buffets Near You
            </h1>
            <p className={`${muted} mb-6`}>
              Discover {data.totalBuffets.toLocaleString()} all-you-can-eat Chinese buffets across{' '}
              {data.totalCities.toLocaleString()} cities
            </p>
            <div className="w-full max-w-md mx-auto">
              <SearchBar />
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/chinese-buffets/states"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--accent1)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
              >
                Browse by State
              </Link>
              <Link
                href="/chinese-buffets/cities"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-6 py-2.5 text-sm font-semibold text-[var(--text)] shadow-sm hover:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
              >
                Browse by City
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Directory Stats */}
      <section className={sectionY} aria-label="Directory stats">
        <div className={`${pageContainer} flex justify-center`}>
          <div className="grid grid-cols-3 gap-6 sm:gap-10 md:gap-16 text-center">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[var(--accent1)]">
                {data.totalBuffets.toLocaleString()}
              </div>
              <div className={muted}>Buffets</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[var(--accent1)]">
                {data.totalCities.toLocaleString()}
              </div>
              <div className={muted}>Cities</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[var(--accent1)]">
                {data.totalStates}
              </div>
              <div className={muted}>States</div>
            </div>
          </div>
        </div>
      </section>

      {/* Intro Section */}
      <section className={sectionY} aria-labelledby="intro-heading">
        <div className={pageContainer}>
          <h2 id="intro-heading" className="sr-only">
            About this directory
          </h2>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Welcome to the most comprehensive Chinese buffet directory in the United States.
              Whether you&apos;re craving dim sum, Mongolian BBQ, or classic favorites like General Tso&apos;s
              chicken, we help you find the best all-you-can-eat options near you with detailed hours,
              pricing, ratings, and customer reviews.
            </p>
          </div>
        </div>
      </section>

      {/* Browse by City */}
      {data.popularCities.length > 0 && (
        <section className={sectionY} aria-labelledby="browse-city-heading">
          <div className={pageContainer}>
            <SectionHeader
              title="Browse by city"
              actionHref="/chinese-buffets/cities"
              actionLabel="View all cities →"
              headingId="browse-city-heading"
            />
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
              {data.popularCities.slice(0, 15).map((city) => (
                <li key={city.slug}>
                  <Link
                    href={`/chinese-buffets/${city.slug}`}
                    className="block min-h-[44px] py-3 text-[var(--text)] hover:text-[var(--accent1)] hover:underline"
                  >
                    <span className="font-medium">{city.city}</span>
                    <span className={`${muted} ml-1`}>({city.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Browse by State */}
      {data.popularStates.length > 0 && (
        <section className={sectionY} aria-labelledby="browse-state-heading">
          <div className={pageContainer}>
            <SectionHeader
              title="Browse by state"
              actionHref="/chinese-buffets/states"
              actionLabel="View all states →"
              headingId="browse-state-heading"
            />
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
              {data.popularStates.slice(0, 15).map((state) => (
                <li key={state.stateAbbr}>
                  <Link
                    href={`/chinese-buffets/states/${state.stateAbbr.toLowerCase()}`}
                    className="block min-h-[44px] py-3 text-[var(--text)] hover:text-[var(--accent1)] hover:underline"
                  >
                    <span className="font-medium">
                      {STATE_ABBR_TO_NAME[state.stateAbbr] || state.stateAbbr}
                    </span>
                    <span className={`${muted} ml-1`}>({state.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Top Rated & Most Reviewed */}
      <main className={`${pageContainer} ${sectionY} space-y-12`}>
        {/* Top rated: only show buffets with a valid rating; empty state if none */}
        <section aria-labelledby="top-rated-heading">
          <SectionHeader title="Top rated Chinese buffets" headingId="top-rated-heading" />
          {data.topRatedBuffets.length > 0 ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.topRatedBuffets.map((buffet) => (
                <li key={`${buffet.citySlug}-${buffet.slug}`}>
                  <Link
                    href={`/chinese-buffets/${buffet.citySlug}/${buffet.slug}`}
                    className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:shadow-md hover:border-[var(--accent1)] transition-all"
                  >
                    <div className="font-semibold text-[var(--text)] mb-1 line-clamp-1">
                      {buffet.name}
                    </div>
                    <div className={muted}>
                      {buffet.city}, {buffet.stateAbbr}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[var(--accent1)] font-medium">
                        ★ {buffet.rating.toFixed(1)}
                      </span>
                      <span className={muted}>
                        ({buffet.reviewCount.toLocaleString()} reviews)
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={muted}>No top-rated buffets found.</p>
          )}
        </section>
      </main>
    </div>
  );
}
