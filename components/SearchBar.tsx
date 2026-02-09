'use client';

/**
 * SearchBar Component
 * 
 * ## Performance Architecture
 * 
 * This component implements a 3-layer caching strategy:
 * 
 * 1. **Client Cache (this file)**
 *    - In-memory LRU cache for search results (60s TTL, 50 entries max)
 *    - Suggestions cached for 1 hour per session
 *    - Instant response for repeated queries
 * 
 * 2. **Server Cache (API routes)**
 *    - In-memory cache per serverless instance
 *    - Reduces database queries
 * 
 * 3. **CDN Cache (Vercel Edge)**
 *    - Cache-Control headers enable edge caching
 *    - s-maxage for fresh data, stale-while-revalidate for instant responses
 * 
 * ## IMPORTANT: Do NOT break caching
 * - Do NOT add `cache: "no-store"` to fetch calls
 * - Do NOT add user-specific headers to requests
 * - Do NOT add cookies/auth to search requests
 * 
 * ## Performance Budget
 * - Target: < 100ms for cached, < 300ms for uncached
 * - Debounce: 200ms to reduce API calls while typing
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { generateSlug } from '@/lib/utils';
import type { SearchResponse, SearchResult, SearchCityResult, SearchNeighborhoodResult, SearchSuggestionsResponse } from '@/lib/searchTypes';
import { CityIcon } from '@/components/search/CityIcon';
import { NeighborhoodIcon } from '@/components/search/NeighborhoodIcon';
import { BuffetIcon } from '@/components/search/BuffetIcon';

type SearchBarProps = {
  variant?: 'desktop' | 'mobile';
  placeholder?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
};

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 8;
const DEBOUNCE_MS = 200;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 50;
const SUGGESTIONS_TTL_MS = 60 * 60 * 1000;
const BUFFET_ROW_HEIGHT = 52; // Slightly reduced for density
const CITY_ROW_HEIGHT = 48; // Compact city rows
const NEIGHBORHOOD_ROW_HEIGHT = 48; // Same as city rows
const SKELETON_ROWS = 4;
const MAX_DROPDOWN_HEIGHT = 480; // Max height before scroll (increased for neighborhoods)

type SearchCacheEntry = {
  ts: number;
  data: SearchResponse;
};

const searchCache = new Map<string, SearchCacheEntry>();
const suggestionsCache = new Map<string, { ts: number; data: SearchSuggestionsResponse }>();

function buildCacheKey(query: string, limit: number, citySlug?: string | null) {
  return `${query.toLowerCase()}::${limit}::${citySlug || ''}`;
}

function getCachedResult(cacheKey: string): SearchResponse | null {
  const entry = searchCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    searchCache.delete(cacheKey);
    return null;
  }
  searchCache.delete(cacheKey);
  searchCache.set(cacheKey, entry);
  return entry.data;
}

function setCachedResult(cacheKey: string, data: SearchResponse) {
  searchCache.set(cacheKey, { ts: Date.now(), data });
  if (searchCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = searchCache.keys().next().value as string | undefined;
  if (oldestKey) searchCache.delete(oldestKey);
}

function getCachedSuggestions(cacheKey: string): SearchSuggestionsResponse | null {
  const entry = suggestionsCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.ts > SUGGESTIONS_TTL_MS) {
    suggestionsCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedSuggestions(cacheKey: string, data: SearchSuggestionsResponse) {
  suggestionsCache.set(cacheKey, { ts: Date.now(), data });
}

function getResultHref(result: SearchResult): string {
  const citySlug = result.citySlug || generateSlug(`${result.city}-${result.state}`);
  if (!citySlug || !result.slug) {
    return '#';
  }
  return `/chinese-buffets/${citySlug}/${result.slug}`;
}

function getCityHref(city: SearchCityResult): string {
  return `/chinese-buffets/${city.slug}`;
}

/**
 * Highlights matched substring in text with subtle emphasis
 * Returns React elements with the matched portion wrapped
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  
  if (matchIndex === -1) return text;
  
  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + normalizedQuery.length);
  const after = text.slice(matchIndex + normalizedQuery.length);
  
  return (
    <>
      {before}
      <span className="rounded-sm bg-[var(--accent1)]/10 px-0.5 font-semibold text-[var(--accent1)]">
        {match}
      </span>
      {after}
    </>
  );
}

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 animate-pulse" style={{ height: BUFFET_ROW_HEIGHT }}>
      <div className="h-10 w-10 rounded-lg bg-gray-100" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-4 w-3/4 rounded bg-gray-100" />
        <div className="h-3 w-1/2 rounded bg-gray-100" />
      </div>
    </div>
  );
}

// Section header component for consistent styling
function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="px-4 py-2 flex items-center justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400/90">
        {children}
      </div>
      {typeof count === 'number' && (
        <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
          {count}
        </span>
      )}
    </div>
  );
}

// Chevron icon for city rows
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

export default function SearchBar({
  variant = 'desktop',
  placeholder = 'Search buffets, cities, neighborhoods...',
  autoFocus = false,
  onNavigate,
}: SearchBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cities, setCities] = useState<SearchCityResult[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<SearchNeighborhoodResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [resultsQuery, setResultsQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestionsResponse | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const inputTimingRef = useRef<{ q: string; at: number } | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const suggestionsInFlightRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();
  const shouldSearch = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const showSuggestions = isOpen && trimmedQuery.length === 0;
  const showDropdown =
    isOpen && (showSuggestions || (shouldSearch && (cities.length > 0 || results.length > 0 || isLoading)));
  const showNoResults = shouldSearch && !isLoading && results.length === 0 && cities.length === 0;

  const citySlugFromPath = useMemo(() => {
    if (!pathname || !pathname.startsWith('/chinese-buffets/')) return null;
    const [, , slug] = pathname.split('/');
    if (!slug) return null;
    if (slug === 'states' || slug === 'near' || slug === 'regions') return null;
    return slug;
  }, [pathname]);

  const inputClasses = useMemo(() => {
    return variant === 'desktop'
      ? 'w-full rounded-full border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm transition focus:border-[var(--accent1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]/20'
      : 'w-full rounded-full border border-gray-200 bg-white py-3 pl-11 pr-4 text-base text-gray-900 shadow-sm focus:border-[var(--accent1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]/20';
  }, [variant]);

  const panelClasses = useMemo(() => {
    return 'absolute z-[9999] mt-2 w-full rounded-2xl border border-gray-200/80 bg-white shadow-xl shadow-gray-200/60';
  }, []);

  // Build flat list of navigable items for keyboard navigation
  const navigableItems = useMemo(() => {
    const items: Array<{ type: 'suggestion' | 'place' | 'result' | 'city' | 'neighborhood' | 'footer'; value: string; href?: string }> = [];
    
    if (showSuggestions && suggestions) {
      suggestions.suggestions.popularQueries.forEach((q) => {
        items.push({ type: 'suggestion', value: q });
      });
      suggestions.suggestions.popularPlaces.forEach((place) => {
        const href = `/chinese-buffets/${place.citySlug || generateSlug(`${place.city}-${place.state}`)}/${place.slug}`;
        items.push({ type: 'place', value: place.name, href });
      });
    } else {
      // Cities first, then neighborhoods, then buffets, then footer CTA
      cities.forEach((city) => {
        items.push({ type: 'city', value: `${city.city}, ${city.stateAbbr}`, href: getCityHref(city) });
      });
      neighborhoods.forEach((neighborhood) => {
        items.push({ 
          type: 'neighborhood', 
          value: `${neighborhood.neighborhood}, ${neighborhood.cityName}`, 
          href: `/chinese-buffets/${neighborhood.fullSlug}` 
        });
      });
      results.forEach((result) => {
        items.push({ type: 'result', value: result.name, href: getResultHref(result) });
      });
      // Add footer CTA if we have results
      if (shouldSearch && (cities.length > 0 || neighborhoods.length > 0 || results.length > 0)) {
        items.push({ type: 'footer', value: trimmedQuery, href: `/search?q=${encodeURIComponent(trimmedQuery)}` });
      }
    }
    
    return items;
  }, [showSuggestions, suggestions, cities, neighborhoods, results, shouldSearch, trimmedQuery]);

  // Reset highlight when results/suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [navigableItems.length, showSuggestions, results, cities, neighborhoods]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setQuery(nextValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
    if (process.env.NODE_ENV !== 'production') {
      const trimmed = nextValue.trim();
      if (trimmed.length >= MIN_QUERY_LENGTH) {
        inputTimingRef.current = { q: trimmed, at: performance.now() };
      }
    }
  }, []);

  const fetchSuggestions = useCallback(async (citySlugValue: string | null) => {
    if (suggestionsInFlightRef.current) return;
    const cacheKey = citySlugValue || 'global';
    const cached = getCachedSuggestions(cacheKey);
    if (cached) {
      setSuggestions(cached);
      return;
    }

    suggestionsInFlightRef.current = true;
    setIsSuggestionsLoading(true);
    try {
      const params = new URLSearchParams();
      if (citySlugValue) params.set('citySlug', citySlugValue);
      const response = await fetch(`/api/search-suggestions?${params.toString()}`);
      if (!response.ok) return;
      const data = (await response.json()) as SearchSuggestionsResponse;
      setCachedSuggestions(cacheKey, data);
      setSuggestions(data);
    } catch {
      // ignore suggestion fetch errors
    } finally {
      suggestionsInFlightRef.current = false;
      setIsSuggestionsLoading(false);
    }
  }, []);

  const handleFocus = useCallback(() => {
    setIsOpen(true);
    if (!suggestions) {
      fetchSuggestions(citySlugFromPath);
    }
  }, [citySlugFromPath, fetchSuggestions, suggestions]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  }, []);

  const handleNavigate = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    onNavigate?.();
  }, [onNavigate]);

  const selectHighlightedItem = useCallback(() => {
    if (highlightedIndex < 0 || highlightedIndex >= navigableItems.length) return false;
    
    const item = navigableItems[highlightedIndex];
    if (item.type === 'suggestion') {
      setQuery(item.value);
      setDebouncedQuery(item.value);
      setHighlightedIndex(-1);
      return true;
    } else if (item.href) {
      window.location.href = item.href;
      handleNavigate();
      return true;
    }
    return false;
  }, [highlightedIndex, navigableItems, handleNavigate]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown') {
        setIsOpen(true);
        event.preventDefault();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex((prev) => 
          prev < navigableItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : navigableItems.length - 1
        );
        break;
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0) {
          selectHighlightedItem();
        } else if (query.trim().length >= MIN_QUERY_LENGTH) {
          // Navigate to search results page
          setIsOpen(false);
          router.push(`/search?q=${encodeURIComponent(query.trim())}`);
          onNavigate?.();
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, highlightedIndex, navigableItems.length, selectHighlightedItem, query, router, onNavigate]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listboxRef.current) return;
    const items = listboxRef.current.querySelectorAll('[role="option"]');
    const item = items[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const fetchResults = useCallback(async (searchText: string, cacheKey: string, citySlug?: string | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    try {
      setIsLoading(true);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[search-ui] cacheHit=false q=${searchText}`);
      }
      const queryParams = new URLSearchParams({
        q: searchText,
        limit: String(DEFAULT_LIMIT),
      });
      if (citySlug) {
        queryParams.set('citySlug', citySlug);
      }
      const response = await fetch(
        `/api/search?${queryParams.toString()}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      const data = (await response.json()) as SearchResponse;
      
      if (requestId !== requestIdRef.current) return;
      if (process.env.NODE_ENV === 'development') {
        console.log('[search-ui-debug]', {
          query: searchText,
          citiesLength: data?.cities?.length,
          resultsLength: data?.results?.length,
          keys: Object.keys(data || {}),
        });
      }
      setCachedResult(cacheKey, data);
      const newResults = Array.isArray(data.results) ? data.results : [];
      const newCities = Array.isArray(data.cities) ? data.cities : [];
      const newNeighborhoods = Array.isArray(data.neighborhoods) ? data.neighborhoods : [];
      setResults(newResults);
      setCities(newCities);
      setNeighborhoods(newNeighborhoods);
      setResultsQuery(data.q || searchText);
      
      // DEBUG STEP 2: Log state after setting
      console.log(
        "[search-ui-state]",
        {
          citiesState: newCities.length,
          neighborhoodsState: newNeighborhoods.length,
          resultsState: newResults.length,
          citiesData: newCities,
        }
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('[search-ui] request error', error);
      }
      if (requestId !== requestIdRef.current) return;
      setResults([]);
      setCities([]);
      setNeighborhoods([]);
      setResultsQuery(searchText);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        if (inFlightRef.current === cacheKey) {
          inFlightRef.current = null;
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!shouldSearch) {
      abortRef.current?.abort();
      setResults([]);
      setCities([]);
      setNeighborhoods([]);
      setResultsQuery(trimmedQuery);
      setIsLoading(false);
      setDebouncedQuery('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [trimmedQuery, shouldSearch]);

  useEffect(() => {
    if (!debouncedQuery) return;

    const cacheKey = buildCacheKey(debouncedQuery, DEFAULT_LIMIT, citySlugFromPath);
    const cached = getCachedResult(cacheKey);
    if (cached) {
      setResults(Array.isArray(cached.results) ? cached.results : []);
      setCities(Array.isArray(cached.cities) ? cached.cities : []);
      setNeighborhoods(Array.isArray(cached.neighborhoods) ? cached.neighborhoods : []);
      setResultsQuery(cached.q || debouncedQuery);
      setIsLoading(false);
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[search-ui] cacheHit=true q=${cached.q || debouncedQuery} results=${cached.results?.length ?? 0} cities=${cached.cities?.length ?? 0}`
        );
      }
      return;
    }

    if (inFlightRef.current === cacheKey) return;
    inFlightRef.current = cacheKey;
    fetchResults(debouncedQuery, cacheKey, citySlugFromPath);
  }, [citySlugFromPath, debouncedQuery, fetchResults]);

  useEffect(() => {
    if (!suggestions?.suggestions?.popularQueries?.length) return;
    const queries = suggestions.suggestions.popularQueries.slice(0, 2);
    queries.forEach((suggestion) => {
      const cacheKey = buildCacheKey(suggestion, DEFAULT_LIMIT, citySlugFromPath);
      if (getCachedResult(cacheKey)) return;
      const params = new URLSearchParams({
        q: suggestion,
        limit: String(DEFAULT_LIMIT),
      });
      if (citySlugFromPath) params.set('citySlug', citySlugFromPath);
      fetch(`/api/search?${params.toString()}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: SearchResponse | null) => {
          if (!data) return;
          setCachedResult(cacheKey, data);
        })
        .catch(() => {});
    });
  }, [citySlugFromPath, suggestions]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!inputTimingRef.current) return;
    if (!resultsQuery || resultsQuery !== inputTimingRef.current.q) return;
    const renderMs = Math.round(performance.now() - inputTimingRef.current.at);
    console.log(`[search-ui] q=${resultsQuery} renderMs=${renderMs}`);
    inputTimingRef.current = null;
  }, [results, resultsQuery]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    console.log(
      '[dropdown] open=',
      isOpen,
      'qn=',
      trimmedQuery,
      'cities=',
      cities.length,
      'results=',
      results.length,
      'loading=',
      isLoading
    );
  }, [trimmedQuery, cities.length, results.length, isOpen, isLoading]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Track current option index for aria
  let optionIndex = 0;
  const footerIdx = cities.length + neighborhoods.length + results.length;
  const isFooterHighlighted = highlightedIndex === footerIdx;

  return (
    <div className="relative w-full">
        <span
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputClasses}
          autoFocus={autoFocus}
          name="q"
          aria-label="Search for buffets"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls="search-listbox"
          aria-activedescendant={highlightedIndex >= 0 ? `search-option-${highlightedIndex}` : undefined}
          role="combobox"
          autoComplete="off"
        />

        {showDropdown && (
          <div 
            ref={listboxRef}
            id="search-listbox"
            role="listbox"
            aria-label="Search results"
            className={panelClasses} 
            onMouseDown={(event) => event.preventDefault()}
            style={{ maxHeight: MAX_DROPDOWN_HEIGHT }}
          >
            <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: MAX_DROPDOWN_HEIGHT }}>
            {/* Empty input: show suggestions or loading */}
            {showSuggestions && (
              <>
                {isSuggestionsLoading && !suggestions && (
                  <div>
                    {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </div>
                )}
                {suggestions && (
                  <div>
                    {suggestions.suggestions.popularQueries.length > 0 && (
                      <div className="py-2">
                        <SectionHeader>Popular searches</SectionHeader>
                        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                          {suggestions.suggestions.popularQueries.map((suggestion, idx) => {
                            const currentIndex = optionIndex++;
                            const isHighlighted = highlightedIndex === currentIndex;
                            return (
                              <button
                                key={suggestion}
                                id={`search-option-${currentIndex}`}
                                role="option"
                                aria-selected={isHighlighted}
                                type="button"
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                                  isHighlighted 
                                    ? 'border-[var(--accent1)] bg-[var(--accent1)]/10 text-[var(--accent1)]' 
                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                                onClick={() => {
                                  setQuery(suggestion);
                                  setDebouncedQuery(suggestion);
                                  setIsOpen(true);
                                }}
                                onMouseEnter={() => setHighlightedIndex(currentIndex)}
                              >
                                {suggestion}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {suggestions.suggestions.popularPlaces.length > 0 && (
                      <div className="border-t border-gray-100 py-2">
                        <SectionHeader>Popular places</SectionHeader>
                        <div className="space-y-0.5">
                          {suggestions.suggestions.popularPlaces.map((place) => {
                            const currentIndex = optionIndex++;
                            const isHighlighted = highlightedIndex === currentIndex;
                            const href = `/chinese-buffets/${place.citySlug || generateSlug(`${place.city}-${place.state}`)}/${place.slug}`;
                            return (
                              <Link
                                key={`${place.citySlug || place.city}-${place.slug}`}
                                id={`search-option-${currentIndex}`}
                                role="option"
                                aria-selected={isHighlighted}
                                href={href}
                                className={`group flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                                  isHighlighted 
                                    ? 'bg-[var(--accent1)]/5' 
                                    : 'hover:bg-gray-50'
                                }`}
                                onClick={handleNavigate}
                                onMouseEnter={() => setHighlightedIndex(currentIndex)}
                              >
                                <span className={`truncate font-medium ${isHighlighted ? 'text-[var(--accent1)]' : 'text-gray-800'}`}>
                                  {place.name}
                                </span>
                                <span className={`ml-2 text-xs ${isHighlighted ? 'text-[var(--accent1)]/60' : 'text-gray-400'}`}>
                                  {[place.city, place.state].filter(Boolean).join(', ')}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Loading search results */}
            {shouldSearch && isLoading && (
              <div className="py-2">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            )}

            {/* Search results: Cities and Buffets */}
            {shouldSearch && !isLoading && (
              <div>
                {/* Cities section - navigation entry points */}
                {cities.length > 0 && (
                  <div className={`py-2 ${neighborhoods.length === 0 && results.length === 0 ? 'pb-16' : ''}`}>
                    <SectionHeader count={cities.length}>Cities</SectionHeader>
                    <div className="space-y-0.5">
                      {cities.map((city, idx) => {
                        const isHighlighted = highlightedIndex === idx;
                        return (
                          <Link
                            key={city.id}
                            id={`search-option-${idx}`}
                            role="option"
                            aria-selected={isHighlighted}
                            href={getCityHref(city)}
                            className={`group flex items-center gap-3 rounded-lg px-4 py-2 transition-colors ${
                              isHighlighted
                                ? 'bg-[var(--accent1)]/8 ring-1 ring-[var(--accent1)]/15'
                                : 'hover:bg-gray-50'
                            }`}
                            style={{ minHeight: CITY_ROW_HEIGHT }}
                            onClick={handleNavigate}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                          >
                            <CityIcon 
                              cityName={city.city} 
                              stateAbbr={city.stateAbbr} 
                              isHighlighted={isHighlighted}
                            />
                            <div className="min-w-0 flex-1">
                              <div className={`truncate text-sm font-semibold ${isHighlighted ? 'text-[var(--accent1)]' : 'text-gray-900'}`}>
                                {highlightMatch(city.city, trimmedQuery)}
                                <span className="font-normal text-gray-500">, {city.stateAbbr}</span>
                              </div>
                              <div className="truncate text-xs text-gray-400">
                                Browse all Chinese buffets in this city
                              </div>
                            </div>
                            <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-all ${
                              isHighlighted
                                ? 'text-[var(--accent1)] opacity-100'
                                : 'text-gray-300 opacity-0 group-hover:opacity-100'
                            }`} />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Divider between cities and neighborhoods */}
                {cities.length > 0 && neighborhoods.length > 0 && (
                  <div className="mx-4 border-t border-gray-100" />
                )}

                {/* Neighborhoods section */}
                {neighborhoods.length > 0 && (
                  <div className={`py-2 ${results.length === 0 ? 'pb-16' : ''}`}>
                    <SectionHeader count={neighborhoods.length}>Neighborhoods</SectionHeader>
                    <div className="space-y-0.5">
                      {neighborhoods.map((neighborhood, idx) => {
                        const globalIdx = cities.length + idx;
                        const isHighlighted = highlightedIndex === globalIdx;
                        return (
                          <Link
                            key={neighborhood.id}
                            id={`search-option-${globalIdx}`}
                            role="option"
                            aria-selected={isHighlighted}
                            href={`/chinese-buffets/${neighborhood.fullSlug}`}
                            className={`group flex items-center gap-3 rounded-lg px-4 py-2 transition-colors ${
                              isHighlighted
                                ? 'bg-[var(--accent1)]/8 ring-1 ring-[var(--accent1)]/15'
                                : 'hover:bg-gray-50'
                            }`}
                            style={{ minHeight: NEIGHBORHOOD_ROW_HEIGHT }}
                            onClick={handleNavigate}
                            onMouseEnter={() => setHighlightedIndex(globalIdx)}
                          >
                            <NeighborhoodIcon 
                              neighborhoodName={neighborhood.neighborhood} 
                              cityName={neighborhood.cityName}
                              stateAbbr={neighborhood.stateAbbr}
                              isHighlighted={isHighlighted}
                            />
                            <div className="min-w-0 flex-1">
                              <div className={`truncate text-sm font-semibold ${isHighlighted ? 'text-[var(--accent1)]' : 'text-gray-900'}`}>
                                {highlightMatch(neighborhood.neighborhood, trimmedQuery)}
                                <span className="font-normal text-gray-500">, {neighborhood.cityName}</span>
                              </div>
                              <div className="truncate text-xs text-gray-400">
                                {neighborhood.buffetCount || 0} buffet{neighborhood.buffetCount !== 1 ? 's' : ''} in this neighborhood
                              </div>
                            </div>
                            <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-all ${
                              isHighlighted
                                ? 'text-[var(--accent1)] opacity-100'
                                : 'text-gray-300 opacity-0 group-hover:opacity-100'
                            }`} />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Divider between neighborhoods/cities and buffets */}
                {(cities.length > 0 || neighborhoods.length > 0) && results.length > 0 && (
                  <div className="mx-4 border-t border-gray-100" />
                )}

                {/* Buffets section - compact and scannable */}
                {results.length > 0 && (
                  <div className="py-2 pb-16">
                    <SectionHeader count={results.length}>Buffets</SectionHeader>
                    <div className="space-y-0.5">
                      {results.map((result, idx) => {
                        const globalIdx = cities.length + neighborhoods.length + idx;
                        const isHighlighted = highlightedIndex === globalIdx;
                        const locationParts = [
                          result.neighborhood || null,
                          [result.city, result.state].filter(Boolean).join(', ') || null,
                        ].filter(Boolean);
                        const locationText = locationParts.join(' • ');
                        return (
                          <Link
                            key={result.id}
                            id={`search-option-${globalIdx}`}
                            role="option"
                            aria-selected={isHighlighted}
                            href={getResultHref(result)}
                            className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-colors ${
                              isHighlighted
                                ? 'bg-[var(--accent1)]/8 ring-1 ring-[var(--accent1)]/15'
                                : 'hover:bg-gray-50'
                            }`}
                            style={{ minHeight: BUFFET_ROW_HEIGHT }}
                            onClick={handleNavigate}
                            onMouseEnter={() => setHighlightedIndex(globalIdx)}
                          >
                            {result.thumbUrl ? (
                              <img
                                src={result.thumbUrl}
                                alt=""
                                className="h-10 w-10 flex-shrink-0 rounded-lg object-cover bg-gray-100"
                                loading="lazy"
                              />
                            ) : (
                              <BuffetIcon name={result.name} size="md" isHighlighted={isHighlighted} />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className={`truncate text-sm font-semibold ${isHighlighted ? 'text-[var(--accent1)]' : 'text-gray-900'}`}>
                                {highlightMatch(result.name, trimmedQuery)}
                              </div>
                              {locationText && (
                                <div className="truncate text-xs text-gray-400">
                                  {locationText}
                                </div>
                              )}
                            </div>
                            {typeof result.rating === 'number' && (
                              <div className="flex flex-col items-end text-xs text-gray-400">
                                <span className="flex items-center gap-0.5">
                                  <svg className="h-3 w-3 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  {result.rating.toFixed(1)}
                                </span>
                                {typeof result.reviewCount === 'number' && (
                                  <span className="text-gray-300">({result.reviewCount})</span>
                                )}
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(!isLoading && cities.length === 0 && results.length === 0) && (
                  <div className="px-4 py-8 pb-4 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <svg className="h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    </div>
                    <div className="text-sm text-gray-600">
                      No results for "<span className="font-medium">{resultsQuery}</span>"
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      Try a different search term
                    </div>
                  </div>
                )}
              </div>
            )}
              {/* Sticky footer - Show all results button */}
              {shouldSearch && !isLoading && (cities.length > 0 || neighborhoods.length > 0 || results.length > 0) && (
                <div className="sticky bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
                  <Link
                    id={`search-option-${footerIdx}`}
                    role="option"
                    aria-selected={isFooterHighlighted}
                    href={`/search?q=${encodeURIComponent(trimmedQuery)}`}
                    className={`flex items-center justify-center gap-2 px-4 py-3 m-2 rounded-lg text-sm font-semibold transition-all ${
                      isFooterHighlighted
                        ? 'bg-[var(--accent1)] text-white shadow-md'
                        : 'bg-[var(--accent1)]/10 text-[var(--accent1)] hover:bg-[var(--accent1)] hover:text-white'
                    }`}
                    onClick={handleNavigate}
                    onMouseEnter={() => setHighlightedIndex(footerIdx)}
                  >
                    <span>Show all {cities.length + neighborhoods.length + results.length} results</span>
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
