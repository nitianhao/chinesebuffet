import Link from 'next/link';

export interface CityItem {
  slug: string;
  city: string;
  state: string;
  buffetCount: number;
}

interface BrowseByCityGridProps {
  cities: CityItem[];
}

export default function BrowseByCityGrid({ cities = [] }: BrowseByCityGridProps) {
  return (
    <section
      id="popular-cities"
      className="bg-[var(--surface)] py-10 border-b border-[var(--border)]"
      aria-labelledby="browse-cities-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h2
            id="browse-cities-heading"
            className="text-2xl font-bold text-[var(--text)] mb-3"
          >
            Browse by City
          </h2>
          <p className="text-[var(--muted)] text-base leading-relaxed max-w-2xl">
            Find all-you-can-eat Chinese buffets in cities across the USA. Each city page lists local buffets with hours, ratings, and directions.
          </p>
        </header>

        {cities.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {cities.map((c) => (
            <Link
              key={c.slug}
              href={`/chinese-buffets/${c.slug}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
            >
              <span className="block truncate font-semibold">{c.city}</span>
              <span className="block text-[var(--muted)] text-xs mt-0.5">
                {c.state} · {c.buffetCount} {c.buffetCount === 1 ? 'buffet' : 'buffets'}
              </span>
            </Link>
          ))}
        </div>
        ) : (
          <p className="text-[var(--muted)] text-sm mb-4">
            Browse all cities below.
          </p>
        )}

        <div className="mt-6">
          <Link
            href="/cities"
            className="inline-flex items-center gap-2 text-[var(--accent1)] font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 rounded"
          >
            View all cities
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
