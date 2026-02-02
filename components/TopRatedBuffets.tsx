import Link from 'next/link';

export interface BuffetListItem {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  city: string;
  state: string;
  rating: number;
  reviewsCount: number;
}

interface TopRatedBuffetsProps {
  buffets: BuffetListItem[];
}

export default function TopRatedBuffets({ buffets }: TopRatedBuffetsProps) {
  if (!buffets?.length) return null;

  return (
    <section
      id="top-rated"
      className="bg-[var(--bg)] py-10"
      aria-labelledby="top-rated-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h2 id="top-rated-heading" className="text-2xl font-bold text-[var(--text)] mb-3">
            Top Rated Chinese Buffets
          </h2>
          <p className="text-[var(--muted)] text-base leading-relaxed max-w-2xl">
            Buffets with a rating of 4.3 or higher and at least 50 reviews. These locations consistently earn high marks from diners.
          </p>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="list">
          {buffets.map((b) => (
            <li key={b.id}>
              <Link
                href={`/chinese-buffets/${b.citySlug}/${b.slug}`}
                className="block p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent1)] hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
              >
                <span className="font-semibold text-[var(--text)]">{b.name}</span>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                  <span>★ {b.rating.toFixed(1)}</span>
                  <span>·</span>
                  <span>{b.reviewsCount} reviews</span>
                  <span>·</span>
                  <span>{b.city}, {b.state}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
