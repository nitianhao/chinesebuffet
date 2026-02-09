'use client';

import { useState, useMemo, type ReactNode } from 'react';
import Link from 'next/link';

interface CityItem {
  slug: string;
  city: string;
  stateAbbr: string;
  buffetCount: number;
}

interface Props {
  cities: CityItem[];
  children: ReactNode; // server-rendered A-Z list
}

/**
 * Lightweight client wrapper for the cities A-Z list.
 *
 * When the user types a query the server-rendered children are hidden and
 * replaced with a filtered list.  When the query is cleared the children
 * reappear (still SEO-visible in the initial HTML).
 */
export default function CityPageSearch({ cities, children }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return null;
    return cities.filter(
      (c) =>
        c.city.toLowerCase().includes(q) ||
        c.stateAbbr.toLowerCase().includes(q),
    );
  }, [q, cities]);

  return (
    <>
      {/* Search input */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Filter cities on this page…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent1)]"
        />
      </div>

      {/* Active search results replace server-rendered list */}
      {results ? (
        results.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {results.map((c) => (
              <Link
                key={c.slug}
                href={`/chinese-buffets/${c.slug}`}
                className="text-sm text-[var(--text)] hover:text-[var(--accent1)] py-0.5"
              >
                {c.city}, {c.stateAbbr}
                <span className="text-[var(--muted)] ml-1">({c.buffetCount})</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] py-4">
            No cities match &ldquo;{query}&rdquo; on this page.
          </p>
        )
      ) : (
        /* No search query — show server-rendered children */
        children
      )}
    </>
  );
}
