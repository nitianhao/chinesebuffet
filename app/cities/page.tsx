import { Metadata } from 'next';
import Link from 'next/link';
import { getCitiesRollup } from '@/lib/rollups';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'All Cities - Chinese Buffets Directory',
  description: 'Browse Chinese buffets by city across the USA. Find all-you-can-eat Chinese buffets in your city.',
};

export default async function CitiesPage() {
  const { cities } = await getCitiesRollup();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text)] mb-3">
            All Cities
          </h1>
          <p className="text-[var(--muted)] text-lg leading-relaxed max-w-2xl">
            Browse Chinese buffets by city across the United States. Each city page lists local all-you-can-eat Chinese buffets with hours, ratings, and directions.
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
          <p className="text-[var(--muted)]">
            No cities available. Try browsing by state.
          </p>
        )}

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--accent1)] font-medium hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
