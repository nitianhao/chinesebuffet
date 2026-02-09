'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type {
  SearchResponse,
  SearchCityResult,
  SearchNeighborhoodResult,
  SearchResult,
  SearchSuggestionsResponse,
} from '@/lib/searchTypes';

type MobileSearchDrawerProps = {
  triggerChildren: React.ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  placeholder?: string;
};

const RECENT_KEY = 'recentSearches';
const RECENT_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

const addRecent = (value: string) => {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const existing = window.localStorage.getItem(RECENT_KEY);
  const items = existing ? JSON.parse(existing) : [];
  const next = [trimmed, ...items.filter((item: string) => item !== trimmed)].slice(0, RECENT_LIMIT);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
};

const loadRecent = () => {
  if (typeof window === 'undefined') return [];
  const existing = window.localStorage.getItem(RECENT_KEY);
  try {
    return existing ? (JSON.parse(existing) as string[]) : [];
  } catch {
    return [];
  }
};

export default function MobileSearchDrawer({
  triggerChildren,
  triggerClassName,
  triggerAriaLabel = 'Open search',
  placeholder = 'Search City, Neighborhood, Buffets',
}: MobileSearchDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cities, setCities] = useState<SearchCityResult[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<SearchNeighborhoodResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestionsResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const touchStartY = useRef<number | null>(null);

  const citySlugFromPath = useMemo(() => {
    if (!pathname || !pathname.startsWith('/chinese-buffets/')) return null;
    const [, , slug] = pathname.split('/');
    if (!slug) return null;
    if (slug === 'states' || slug === 'near' || slug === 'regions') return null;
    return slug;
  }, [pathname]);

  const popularCities = useMemo(() => {
    if (!suggestions?.suggestions?.popularPlaces) return [];
    const seen = new Set<string>();
    const list = [];
    for (const place of suggestions.suggestions.popularPlaces) {
      if (!place.citySlug) continue;
      if (seen.has(place.citySlug)) continue;
      seen.add(place.citySlug);
      list.push({
        city: place.city,
        state: place.state,
        citySlug: place.citySlug,
      });
      if (list.length >= 6) break;
    }
    return list;
  }, [suggestions]);

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  const handleNavigate = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setRecent(loadRecent());
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || suggestions) return;
    const params = new URLSearchParams();
    if (citySlugFromPath) params.set('citySlug', citySlugFromPath);
    fetch(`/api/search-suggestions?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SearchSuggestionsResponse | null) => {
        if (data) setSuggestions(data);
      })
      .catch(() => {});
  }, [citySlugFromPath, isOpen, suggestions]);

  useEffect(() => {
    if (!isOpen) return;
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setCities([]);
      setNeighborhoods([]);
      setIsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const trimmed = query.trim();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      const params = new URLSearchParams({ q: trimmed, limit: '6' });
      if (citySlugFromPath) params.set('citySlug', citySlugFromPath);
      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: SearchResponse | null) => {
          if (!data) return;
          setResults(Array.isArray(data.results) ? data.results : []);
          setCities(Array.isArray(data.cities) ? data.cities : []);
          setNeighborhoods(Array.isArray(data.neighborhoods) ? data.neighborhoods : []);
        })
        .catch((error) => {
          if ((error as Error).name === 'AbortError') return;
        })
        .finally(() => setIsLoading(false));
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [citySlugFromPath, isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      addRecent(trimmed);
      handleClose();
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    },
    [router]
  );

  const startTouch = (event: React.TouchEvent) => {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const moveTouch = (event: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const delta = event.touches[0].clientY - touchStartY.current;
    if (delta > 80) {
      touchStartY.current = null;
      handleClose();
    }
  };

  const drawer = (
    <div
      className="fixed inset-0 z-[10001] bg-[var(--surface)] text-[var(--text)] md:hidden"
      onTouchStart={startTouch}
      onTouchMove={moveTouch}
    >
      <div
        className="flex items-center gap-2 border-b border-[var(--border)] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      >
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit(query);
            }}
            placeholder={placeholder}
            aria-label="Search"
            className="w-full min-h-[44px] rounded-full border border-[var(--border)] bg-[var(--surface2)] py-2.5 pl-10 pr-4 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]"
          />
        </div>
        <button
          type="button"
          aria-label="Close search"
          onClick={handleClose}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex h-[calc(100dvh-4.5rem-env(safe-area-inset-top))] flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        {recent.length > 0 && (
          <section className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
              Recent
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleSubmit(item)}
                  aria-label={`Search ${item}`}
                  className="min-h-[44px] max-w-full break-words rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}

        {suggestions?.suggestions?.popularQueries?.length ? (
          <section className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
              Trending
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.suggestions.popularQueries.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleSubmit(item)}
                  aria-label={`Search ${item}`}
                  className="min-h-[44px] max-w-full break-words rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {popularCities.length > 0 && (
          <section className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
              Popular cities
            </div>
            <div className="space-y-2">
              {popularCities.map((city) => (
                <Link
                  key={city.citySlug}
                  href={`/chinese-buffets/${city.citySlug}`}
                  onClick={handleNavigate}
                  className="flex min-h-[44px] items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
                >
                  <span className="font-semibold text-[var(--text)]">
                    {city.city}, {city.state}
                  </span>
                  <span className="text-[var(--muted)]">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {query.trim().length >= MIN_QUERY_LENGTH && (
          <section>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">
              Results
            </div>
            {isLoading && (
              <div className="space-y-2" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="min-h-[56px] rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3"
                  >
                    <div className="h-4 w-2/3 rounded bg-black/5" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-black/5" />
                  </div>
                ))}
              </div>
            )}
            {!isLoading && cities.length === 0 && neighborhoods.length === 0 && results.length === 0 && (
              <div className="text-sm text-[var(--muted)]">No matches found.</div>
            )}
            <div className="space-y-2">
              {cities.map((city) => (
                <Link
                  key={city.id}
                  href={`/chinese-buffets/${city.slug}`}
                  onClick={handleNavigate}
                  className="flex min-h-[44px] items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
                >
                  <span className="font-semibold text-[var(--text)]">{city.city}, {city.stateAbbr}</span>
                  <span className="text-[var(--muted)]">City</span>
                </Link>
              ))}
              {neighborhoods.map((neighborhood) => (
                <Link
                  key={neighborhood.id}
                  href={`/chinese-buffets/${neighborhood.fullSlug}`}
                  onClick={handleNavigate}
                  className="flex min-h-[44px] items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
                >
                  <span className="font-semibold text-[var(--text)]">
                    {neighborhood.neighborhood}, {neighborhood.cityName}
                  </span>
                  <span className="text-[var(--muted)]">Area</span>
                </Link>
              ))}
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={`/chinese-buffets/${result.citySlug || ''}/${result.slug}`}
                  onClick={() => {
                    addRecent(query);
                    handleNavigate();
                  }}
                  className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text)] leading-snug line-clamp-2">
                      {result.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      {typeof result.rating === 'number' && (
                        <span className="inline-flex items-center gap-1">
                          <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {result.rating.toFixed(1)}
                        </span>
                      )}
                      {typeof result.reviewCount === 'number' && (
                        <span>({result.reviewCount})</span>
                      )}
                      <span className="text-[var(--text-secondary)]">
                        {[result.neighborhood, [result.city, result.state].filter(Boolean).join(', ')]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
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
          </section>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label={triggerAriaLabel}
        onClick={handleOpen}
        className={triggerClassName}
      >
        {triggerChildren}
      </button>

      {isOpen && mounted && createPortal(drawer, document.body)}
    </>
  );
}
