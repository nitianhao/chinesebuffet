'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

export interface StateItem {
  stateAbbr: string;
  stateName: string;
  buffetCount: number;
  topCities: string[];
}

type SortMode = 'alphabetical' | 'most-buffets';

export default function BrowseByState() {
  const [states, setStates] = useState<StateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('most-buffets');

  useEffect(() => {
    fetch('/api/states/browse')
      .then((res) => res.json())
      .then((data) => {
        if (data?.states?.length) setStates(data.states);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const filteredAndSorted = useMemo(() => {
    const trimmed = filter.trim().toLowerCase();
    let list = states;

    if (trimmed) {
      list = states.filter(
        (s) =>
          s.stateName.toLowerCase().includes(trimmed) ||
          s.stateAbbr.toLowerCase().includes(trimmed)
      );
    }

    if (sortMode === 'alphabetical') {
      return [...list].sort((a, b) => a.stateName.localeCompare(b.stateName));
    }
    return [...list].sort((a, b) => b.buffetCount - a.buffetCount);
  }, [states, filter, sortMode]);

  if (isLoading) {
    return (
      <section id="states" className="bg-[var(--surface)] py-12" aria-labelledby="states-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="states-heading" className="text-2xl font-bold text-[var(--text)] mb-6">
            Browse by State
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="border border-[var(--border)] rounded-xl p-5 animate-pulse min-h-[120px]"
              >
                <div className="h-6 bg-[var(--surface2)] rounded mb-2" />
                <div className="h-4 bg-[var(--surface2)] rounded w-16 mb-3" />
                <div className="h-3 bg-[var(--surface2)] rounded w-full" />
                <div className="h-3 bg-[var(--surface2)] rounded w-3/4 mt-1" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!states.length) return null;

  return (
    <section
      id="states"
      className="bg-[var(--surface)] py-12 border-b border-[var(--border)]"
      aria-labelledby="states-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h2 id="states-heading" className="text-2xl font-bold text-[var(--text)] mb-3">
            Browse by State
          </h2>
          <p className="text-[var(--muted)] text-base leading-relaxed max-w-2xl mb-6">
            Find Chinese buffets by state. Each state page lists cities and buffets with hours, ratings, and directions.
          </p>

          {/* Filter + Sort UI */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1 min-w-0">
              <label htmlFor="state-filter" className="sr-only">
                Filter states by name or abbreviation
              </label>
              <input
                id="state-filter"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter states…"
                aria-label="Filter states"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--border)] bg-white text-[var(--text)] placeholder:text-[var(--muted)] text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:border-transparent"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>
            <div className="flex gap-2 shrink-0" role="group" aria-label="Sort by">
              <button
                type="button"
                onClick={() => setSortMode('most-buffets')}
                aria-pressed={sortMode === 'most-buffets'}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition
                  ${sortMode === 'most-buffets'
                    ? 'bg-[var(--accent1)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'}`}
              >
                Most buffets
              </button>
              <button
                type="button"
                onClick={() => setSortMode('alphabetical')}
                aria-pressed={sortMode === 'alphabetical'}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition
                  ${sortMode === 'alphabetical'
                    ? 'bg-[var(--accent1)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'}`}
              >
                A–Z
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredAndSorted.map((s) => (
            <Link
              key={s.stateAbbr}
              href={`/chinese-buffets/states/${s.stateAbbr.toLowerCase()}`}
              className="block min-h-[120px] p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent1)] hover:shadow-md transition-all
                focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 active:scale-[0.98]"
            >
              <div className="font-semibold text-lg text-[var(--text)] mb-1">
                {s.stateName}
              </div>
              <div className="text-[var(--muted)] text-sm mb-2">
                {s.buffetCount} {s.buffetCount === 1 ? 'buffet' : 'buffets'}
              </div>
              {s.topCities.length > 0 && (
                <p className="text-xs text-[var(--muted)] line-clamp-2 leading-snug">
                  Top cities: {s.topCities.slice(0, 3).join(', ')}
                  {s.topCities.length > 3 ? '…' : ''}
                </p>
              )}
            </Link>
          ))}
        </div>

        {filteredAndSorted.length === 0 && (
          <p className="text-[var(--muted)] text-center py-8">
            No states match &quot;{filter}&quot;
          </p>
        )}
      </div>
    </section>
  );
}
