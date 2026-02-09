import Link from 'next/link';

export interface NeighborhoodItem {
  neighborhood: string;
  slug: string;
  citySlug: string;
  cityName: string;
  stateAbbr: string;
  buffetCount: number;
}

interface PopularNeighborhoodsProps {
  neighborhoods: NeighborhoodItem[];
}

export default function PopularNeighborhoods({ neighborhoods }: PopularNeighborhoodsProps) {
  if (!neighborhoods?.length) return null;

  return (
    <section
      id="popular-neighborhoods"
      className="bg-[var(--surface)] py-10 border-b border-[var(--border)]"
      aria-labelledby="popular-neighborhoods-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h2 id="popular-neighborhoods-heading" className="text-2xl font-bold text-[var(--text)] mb-3">
            Popular Neighborhoods
          </h2>
          <p className="text-[var(--muted)] text-base leading-relaxed max-w-2xl">
            Browse Chinese buffets by neighborhood to find options near you. Neighborhoods help you discover local buffets in specific areas of a city—whether you&apos;re downtown, near the airport, or in a residential district.
          </p>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" role="list">
          {neighborhoods.map((n) => (
            <li key={`${n.citySlug}-${n.slug}`}>
              <Link
                href={`/chinese-buffets/${n.citySlug}/neighborhoods/${n.slug}`}
                className="block p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent1)] hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
              >
                <span className="font-semibold text-[var(--text)]">
                  {n.neighborhood}, {n.cityName}, {n.stateAbbr}
                </span>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {n.buffetCount} {n.buffetCount === 1 ? 'buffet' : 'buffets'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
