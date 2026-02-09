'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type NeighborhoodRow = {
  slug: string;
  neighborhood: string;
  buffetCount: number;
};

type NeighborhoodsHubClientProps = {
  neighborhoods: NeighborhoodRow[];
  citySlug: string;
};

export default function NeighborhoodsHubClient({
  neighborhoods,
  citySlug,
}: NeighborhoodsHubClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const activeQuery = (searchParams.get('q') || '').trim();
  const [draftQuery, setDraftQuery] = useState(activeQuery);

  const filtered = useMemo(() => {
    if (!activeQuery) return neighborhoods;
    const needle = activeQuery.toLowerCase();
    return neighborhoods.filter((n) =>
      n.neighborhood.toLowerCase().includes(needle)
    );
  }, [activeQuery, neighborhoods]);

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (draftQuery.trim()) {
      params.set('q', draftQuery.trim());
    } else {
      params.delete('q');
    }
    router.push(`${pathname}?${params.toString()}`);
    setIsSheetOpen(false);
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    router.push(`${pathname}`);
    setDraftQuery('');
    setIsSheetOpen(false);
  };

  const getBestFor = (count: number) => {
    if (count >= 30) return 'Best for variety';
    if (count >= 15) return 'Best for groups';
    return 'Best for quick picks';
  };

  return (
    <>
      <div className="sticky top-[var(--header-offset-mobile)] md:top-0 z-30 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-[var(--muted)]">
              <span className="font-medium text-[var(--text)]">{filtered.length}</span>{' '}
              {filtered.length === 1 ? 'neighborhood' : 'neighborhoods'}
            </div>
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-colors bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent1)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
            </button>
          </div>
          {activeQuery && (
            <div className="pt-3 -mx-1">
              <div
                className="flex items-center gap-2 overflow-x-auto px-1"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent1)]/10 text-[var(--accent1)] rounded-full text-sm">
                  {activeQuery}
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="shrink-0 text-sm text-[var(--accent1)] hover:underline ml-2"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {filtered.map((neighborhood) => (
          <Link
            key={neighborhood.slug}
            href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`}
            className="group flex min-h-[72px] items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--accent1)] hover:shadow-md"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface2)]">
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[var(--muted)]">
                {neighborhood.neighborhood.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--text)] line-clamp-2">
                  {neighborhood.neighborhood}
                </h2>
                <span className="text-xs text-[var(--muted)]">
                  {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {getBestFor(neighborhood.buffetCount)}
              </div>
            </div>
            <span className="text-[var(--muted)]">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </span>
          </Link>
        ))}
      </div>

      {isSheetOpen && (
        <div className="fixed inset-0 z-[10000] md:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsSheetOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] rounded-t-2xl border border-[var(--border)] p-4 pb-[calc(var(--bottom-nav-height,64px)+env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Filter neighborhoods</h2>
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <label htmlFor="neighborhood-filter" className="sr-only">
              Filter neighborhoods
            </label>
            <input
              id="neighborhood-filter"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Neighborhood name…"
              className="w-full min-h-[44px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]"
              autoComplete="off"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 min-h-[44px] rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-sm font-medium text-[var(--text)]"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="flex-1 min-h-[44px] rounded-lg bg-[var(--accent1)] text-sm font-semibold text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
