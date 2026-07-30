import { Metadata } from 'next';
import Link from 'next/link';
import { getNeutralCitiesRollup } from '@/lib/hub-data';
import { cuisineByKey } from '@/lib/cuisines';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'All Cities — Chinese & Indian Buffets Directory',
  description:
    'Browse Chinese and Indian buffets by city across the USA. Each city lists local all-you-can-eat buffets with hours, ratings, and directions.',
};

export default async function CitiesPage() {
  const cities = await getNeutralCitiesRollup();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text)] mb-3">All Cities</h1>
          <p className="text-[var(--muted)] text-lg leading-relaxed max-w-2xl">
            Browse Chinese and Indian buffets by city across the United States. Each
            city links to local all-you-can-eat buffets with hours, ratings, and
            directions.
          </p>
        </header>

        {cities.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {cities.map((c) => (
              <div
                key={c.slug}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <span className="block truncate font-semibold text-[var(--text)]">
                  {c.city}
                </span>
                <span className="block text-[var(--muted)] text-xs mt-0.5">{c.state}</span>
                <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
                  {c.cuisines.map((cu, i) => {
                    const def = cuisineByKey(cu.key);
                    if (!def) return null;
                    return (
                      <span key={cu.key} className="whitespace-nowrap">
                        {i > 0 && <span className="text-[var(--muted)]">· </span>}
                        <Link
                          href={`${def.routePrefix}/${c.slug}`}
                          className="font-medium text-[var(--accent1)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]"
                        >
                          {cu.label}
                        </Link>
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)]">No cities available. Try browsing by state.</p>
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
