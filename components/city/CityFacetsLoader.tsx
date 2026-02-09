'use client';

import { useEffect, useState } from 'react';
import type { AggregatedFacets } from '@/lib/facets/aggregateFacets';
import CityFilterBar from './CityFilterBar';

interface CityFacetsLoaderProps {
  cityState: string;
  totalBuffets: number;
}

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * Client component that fetches facets from /api/facets/city after the initial
 * page render, then hydrates the CityFilterBar.
 *
 * While loading, a lightweight skeleton bar is shown so the page stays usable.
 */
export default function CityFacetsLoader({
  cityState,
  totalBuffets,
}: CityFacetsLoaderProps) {
  const [facets, setFacets] = useState<AggregatedFacets | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/facets/city?cityState=${encodeURIComponent(cityState)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;

        if (json.ok && json.facets) {
          setFacets(json.facets);
          setState('loaded');
        } else {
          // API returned ok:false (timeout/error) — show degraded UI
          setState('error');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [cityState]);

  // ---- Loading skeleton ----
  if (state === 'loading') {
    return (
      <div className="sticky top-[var(--header-offset-mobile)] md:top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-3 flex items-center gap-3 animate-pulse">
            <div className="h-5 w-24 rounded bg-[var(--surface2)]" />
            <div className="h-5 w-px bg-[var(--border)] hidden sm:block" />
            <div className="hidden lg:flex items-center gap-2 flex-1">
              <div className="h-8 w-20 rounded-lg bg-[var(--surface2)]" />
              <div className="h-8 w-16 rounded-lg bg-[var(--surface2)]" />
              <div className="h-8 w-20 rounded-lg bg-[var(--surface2)]" />
              <div className="h-8 w-28 rounded-lg bg-[var(--surface2)]" />
            </div>
            <div className="lg:hidden h-8 w-16 rounded-lg bg-[var(--surface2)]" />
            <div className="flex-1 lg:flex-none" />
            <div className="h-8 w-20 rounded-lg bg-[var(--surface2)]" />
          </div>
        </div>
      </div>
    );
  }

  // ---- Error / unavailable ----
  if (state === 'error' || !facets) {
    return (
      <div className="sticky top-[var(--header-offset-mobile)] md:top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-3 flex items-center gap-3">
            <div className="text-sm text-[var(--muted)]">
              <span className="font-semibold text-[var(--text)]">{totalBuffets}</span> results
            </div>
            <div className="h-5 w-px bg-[var(--border)] shrink-0 hidden sm:block" />
            <span className="text-xs text-[var(--muted)]">Filters unavailable right now</span>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loaded — render the real filter bar ----
  return (
    <CityFilterBar
      aggregated={facets}
      totalBuffets={totalBuffets}
      filteredCount={totalBuffets}
    />
  );
}
