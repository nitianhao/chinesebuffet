'use client';

import { useCallback, useEffect, useState, useTransition, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CityIcon } from './CityIcon';
import { NeighborhoodIcon } from './NeighborhoodIcon';
import { BuffetIcon } from './BuffetIcon';
import SaveButton from '@/components/saved/SaveButton';

// =============================================================================
// TYPES
// =============================================================================

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  neighborhood?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  thumbUrl?: string | null;
  citySlug?: string | null;
  price?: string | null;
}

interface SearchCityResult {
  id: string;
  city: string;
  stateAbbr: string;
  slug: string;
  population?: number;
}

interface SearchNeighborhoodResult {
  id: string;
  neighborhood: string;
  slug: string;
  fullSlug: string;
  citySlug: string;
  cityName: string;
  stateAbbr: string;
  buffetCount?: number;
}

interface SearchResponse {
  q: string;
  tookMs: number;
  results: SearchResult[];
  cities?: SearchCityResult[];
  neighborhoods?: SearchNeighborhoodResult[];
  total?: number;
  hasMore?: boolean;
  offset?: number;
  limit?: number;
}

type SortOption = 'relevance' | 'rating' | 'reviews';
type RatingFilter = null | '3.5' | '4.0' | '4.5';
type PriceFilter = string[];

interface ActiveFilters {
  rating: RatingFilter;
  price: PriceFilter;
  sort: SortOption;
}

const PAGE_SIZE = 24;

// =============================================================================
// FILTER COMPONENTS
// =============================================================================

function FilterChip({ 
  label, 
  isActive, 
  onClick,
  count
}: { 
  label: string; 
  isActive: boolean; 
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
        ${isActive 
          ? 'bg-[var(--accent1)] text-white shadow-sm' 
          : 'bg-[var(--surface2)] text-[var(--text)] hover:bg-[var(--border)] border border-[var(--border)]'
        }
      `}
    >
      {label}
      {count !== undefined && (
        <span className={`text-xs ${isActive ? 'opacity-80' : 'text-[var(--muted)]'}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

function ActiveFilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent1)]/10 text-[var(--accent1)] rounded-full text-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-[var(--accent1)]/20 rounded-full p-0.5"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// =============================================================================
// BUFFET CARD
// =============================================================================

function BuffetResultCard({ result }: { result: SearchResult }) {
  const href = result.citySlug && result.slug 
    ? `/chinese-buffets/${result.citySlug}/${result.slug}` 
    : '#';
  
  const locationParts = [
    result.neighborhood,
    [result.city, result.state].filter(Boolean).join(', '),
  ].filter(Boolean);

  return (
    <div className="relative group flex gap-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent1)]/50 hover:shadow-md transition-all">
      {result.citySlug && result.slug && (
        <div className="absolute right-3 top-3">
          <SaveButton
            item={{
              slug: result.slug,
              citySlug: result.citySlug,
              name: result.name,
              city: result.city,
              stateAbbr: result.state,
              rating: result.rating,
              reviewCount: result.reviewCount,
              price: result.price,
            }}
          />
        </div>
      )}
      <Link href={href} className="flex w-full gap-4 pr-12">
        {/* Thumbnail */}
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--surface2)]">
          {result.thumbUrl ? (
            <Image
              src={result.thumbUrl}
              alt={result.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 96px, 128px"
              quality={60}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <BuffetIcon name={result.name} size="lg" />
            </div>
          )}
        </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)] transition-colors line-clamp-1">
          {result.name}
        </h3>
        
        {/* Location */}
        <p className="text-sm text-[var(--muted)] mt-0.5 line-clamp-1">
          {locationParts.join(' • ')}
        </p>

        {/* Rating & Reviews */}
        <div className="flex items-center gap-3 mt-2">
          {result.rating && (
            <div className="flex items-center gap-1">
              <span className="text-amber-500">★</span>
              <span className="font-medium text-[var(--text)]">{result.rating.toFixed(1)}</span>
            </div>
          )}
          {result.reviewCount && result.reviewCount > 0 && (
            <span className="text-sm text-[var(--muted)]">
              {result.reviewCount.toLocaleString()} reviews
            </span>
          )}
          {result.price && (
            <span className="text-sm text-emerald-600 font-medium">{result.price}</span>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
          {result.neighborhood && (
            <span className="text-xs px-2 py-0.5 bg-[var(--surface2)] text-[var(--muted)] rounded">
              {result.neighborhood}
            </span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="hidden sm:flex items-center">
        <svg className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent1)] group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      </Link>
    </div>
  );
}

// =============================================================================
// CITY RESULT CARD
// =============================================================================

function CityResultCard({ city }: { city: SearchCityResult }) {
  return (
    <Link
      href={`/chinese-buffets/${city.slug}`}
      className="group flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:border-[var(--accent1)]/50 hover:shadow-sm transition-all"
    >
      <CityIcon cityName={city.city} stateAbbr={city.stateAbbr} size="md" />
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-[var(--text)] group-hover:text-[var(--accent1)] transition-colors">
          {city.city}, {city.stateAbbr}
        </h4>
        <p className="text-xs text-[var(--muted)]">
          Browse all Chinese buffets
        </p>
      </div>
      <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent1)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// =============================================================================
// NEIGHBORHOOD RESULT CARD
// =============================================================================

function NeighborhoodResultCard({ neighborhood }: { neighborhood: SearchNeighborhoodResult }) {
  return (
    <Link
      href={`/chinese-buffets/${neighborhood.fullSlug}`}
      className="group flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:border-[var(--accent1)]/50 hover:shadow-sm transition-all"
    >
      <NeighborhoodIcon 
        neighborhoodName={neighborhood.neighborhood} 
        cityName={neighborhood.cityName}
        stateAbbr={neighborhood.stateAbbr}
        size="md" 
      />
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-[var(--text)] group-hover:text-[var(--accent1)] transition-colors">
          {neighborhood.neighborhood}
        </h4>
        <p className="text-xs text-[var(--muted)]">
          {neighborhood.cityName}, {neighborhood.stateAbbr} • {neighborhood.buffetCount || 0} buffet{neighborhood.buffetCount !== 1 ? 's' : ''}
        </p>
      </div>
      <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent1)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// =============================================================================
// SKELETON LOADERS
// =============================================================================

function BuffetCardSkeleton() {
  return (
    <div className="flex gap-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl animate-pulse">
      <div className="w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 rounded-lg bg-[var(--surface2)]" />
      <div className="flex-1 space-y-3">
        <div className="h-5 bg-[var(--surface2)] rounded w-3/4" />
        <div className="h-4 bg-[var(--surface2)] rounded w-1/2" />
        <div className="h-4 bg-[var(--surface2)] rounded w-1/4" />
      </div>
    </div>
  );
}

function CityCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-[var(--surface2)]" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-[var(--surface2)] rounded w-1/2" />
        <div className="h-3 bg-[var(--surface2)] rounded w-1/3" />
      </div>
    </div>
  );
}

function NeighborhoodCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-[var(--surface2)]" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-[var(--surface2)] rounded w-2/3" />
        <div className="h-3 bg-[var(--surface2)] rounded w-2/5" />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SearchResultsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  
  // State - sync query with URL (all search state is client-side)
  const urlQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cities, setCities] = useState<SearchCityResult[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<SearchNeighborhoodResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  
  // Sync URL when query changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      const newUrl = `/search?${params.toString()}`;
      // Only update if different from current URL
      if (params.get('q') !== urlQuery) {
        router.replace(newUrl, { scroll: false });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, urlQuery, searchParams, router]);
  
  // Filters from URL
  const activeFilters: ActiveFilters = useMemo(() => ({
    rating: (searchParams.get('rating') as RatingFilter) || null,
    price: searchParams.get('price')?.split(',').filter(Boolean) || [],
    sort: (searchParams.get('sort') as SortOption) || 'relevance',
  }), [searchParams]);

  // Fetch results
  const fetchResults = useCallback(async (searchQuery: string, offset = 0, append = false) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      setCities([]);
      setNeighborhoods([]);
      setTotalResults(0);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({ 
        q: searchQuery, 
        limit: String(PAGE_SIZE),
        offset: String(offset),
        mode: 'full', // Enable full mode for more results
      });
      const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
      const data: SearchResponse = await res.json();
      
      if (append) {
        setResults(prev => [...prev, ...(data.results || [])]);
      } else {
        setResults(data.results || []);
        setCities(data.cities || []);
        setNeighborhoods(data.neighborhoods || []);
      }
      setTotalResults(data.total ?? data.results?.length ?? 0);
      setHasMore(data.hasMore ?? false);
      setCurrentOffset(offset + (data.results?.length || 0));
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Search error:', error);
        if (!append) {
          setResults([]);
          setCities([]);
          setNeighborhoods([]);
        }
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Fetch on mount and query change
  useEffect(() => {
    fetchResults(query);
  }, [query, fetchResults]);

  // Load more handler
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      fetchResults(query, currentOffset, true);
    }
  }, [fetchResults, query, currentOffset, isLoadingMore, hasMore]);

  // Filter results client-side
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Rating filter
    if (activeFilters.rating) {
      const minRating = parseFloat(activeFilters.rating);
      filtered = filtered.filter(r => r.rating && r.rating >= minRating);
    }

    // Price filter
    if (activeFilters.price.length > 0) {
      filtered = filtered.filter(r => {
        if (!r.price) return false;
        const dollarCount = (r.price.match(/\$/g) || []).length;
        return activeFilters.price.includes(String(dollarCount));
      });
    }

    // Sort
    switch (activeFilters.sort) {
      case 'rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'reviews':
        filtered.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
        break;
      // 'relevance' keeps original order
    }

    return filtered;
  }, [results, activeFilters]);

  // Update URL with filters
  const updateFilters = useCallback((newFilters: Partial<ActiveFilters>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (newFilters.rating !== undefined) {
      if (newFilters.rating) {
        params.set('rating', newFilters.rating);
      } else {
        params.delete('rating');
      }
    }
    
    if (newFilters.price !== undefined) {
      if (newFilters.price.length > 0) {
        params.set('price', newFilters.price.join(','));
      } else {
        params.delete('price');
      }
    }
    
    if (newFilters.sort !== undefined) {
      if (newFilters.sort !== 'relevance') {
        params.set('sort', newFilters.sort);
      } else {
        params.delete('sort');
      }
    }

    startTransition(() => {
      router.push(`/search?${params.toString()}`, { scroll: false });
    });
  }, [router, searchParams]);

  const toggleRating = useCallback((rating: RatingFilter) => {
    updateFilters({ rating: activeFilters.rating === rating ? null : rating });
  }, [activeFilters.rating, updateFilters]);

  const togglePrice = useCallback((price: string) => {
    const newPrice = activeFilters.price.includes(price)
      ? activeFilters.price.filter(p => p !== price)
      : [...activeFilters.price, price];
    updateFilters({ price: newPrice });
  }, [activeFilters.price, updateFilters]);

  const setSort = useCallback((sort: SortOption) => {
    updateFilters({ sort });
  }, [updateFilters]);

  const clearFilters = useCallback(() => {
    updateFilters({ rating: null, price: [], sort: 'relevance' });
  }, [updateFilters]);

  const hasActiveFilters = activeFilters.rating || activeFilters.price.length > 0;

  // Price label mapping
  const PRICE_LABELS: Record<string, string> = {
    '1': '$',
    '2': '$$',
    '3': '$$$',
  };

  // Check if more results might be available after filtering
  const mightHaveMoreAfterFilter = hasMore || (hasActiveFilters && filteredResults.length < results.length);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search buffets, cities, neighborhoods..."
              className="w-full pl-10 pr-4 py-3 bg-[var(--surface2)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]/50 focus:border-[var(--accent1)]"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--border)] rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filters bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Rating filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-[var(--muted)] mr-1">Rating:</span>
              {(['4.5', '4.0', '3.5'] as const).map((rating) => (
                <FilterChip
                  key={rating}
                  label={`${rating}+ ★`}
                  isActive={activeFilters.rating === rating}
                  onClick={() => toggleRating(rating)}
                />
              ))}
            </div>

            <span className="text-[var(--border)]">|</span>

            {/* Price filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-[var(--muted)] mr-1">Price:</span>
              {(['1', '2', '3'] as const).map((price) => (
                <FilterChip
                  key={price}
                  label={PRICE_LABELS[price]}
                  isActive={activeFilters.price.includes(price)}
                  onClick={() => togglePrice(price)}
                />
              ))}
            </div>

            <span className="text-[var(--border)]">|</span>

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-[var(--muted)] mr-1">Sort:</span>
              <select
                value={activeFilters.sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="text-sm bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]/50"
              >
                <option value="relevance">Relevance</option>
                <option value="rating">Highest Rated</option>
                <option value="reviews">Most Reviews</option>
              </select>
            </div>
          </div>

          {/* Active filters display */}
          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilters.rating && (
                <ActiveFilterPill
                  label={`${activeFilters.rating}+ stars`}
                  onRemove={() => toggleRating(activeFilters.rating)}
                />
              )}
              {activeFilters.price.map((p) => (
                <ActiveFilterPill
                  key={p}
                  label={PRICE_LABELS[p]}
                  onRemove={() => togglePrice(p)}
                />
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-[var(--accent1)] hover:underline ml-2"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-6 ${isPending ? 'opacity-70' : ''}`}>
        {/* Results header */}
        {!isLoading && query && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[var(--muted)]">
              {filteredResults.length === 0 && cities.length === 0 && neighborhoods.length === 0 ? (
                'No results found'
              ) : (
                <>
                  <span className="font-medium text-[var(--text)]">{filteredResults.length}</span>
                  {hasMore && '+'} buffet{filteredResults.length !== 1 ? 's' : ''}
                  {cities.length > 0 && (
                    <>, <span className="font-medium text-[var(--text)]">{cities.length}</span> cit{cities.length !== 1 ? 'ies' : 'y'}</>
                  )}
                  {neighborhoods.length > 0 && (
                    <>, <span className="font-medium text-[var(--text)]">{neighborhoods.length}</span> neighborhood{neighborhoods.length !== 1 ? 's' : ''}</>
                  )}
                  {' '}for &quot;{query}&quot;
                  {hasActiveFilters && results.length !== filteredResults.length && (
                    <span className="text-[var(--muted)]"> (filtered from {results.length})</span>
                  )}
                </>
              )}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-6">
            {/* City skeletons */}
            <div>
              <div className="h-5 bg-[var(--surface2)] rounded w-24 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => <CityCardSkeleton key={i} />)}
              </div>
            </div>
            {/* Neighborhood skeletons */}
            <div>
              <div className="h-5 bg-[var(--surface2)] rounded w-32 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => <NeighborhoodCardSkeleton key={i} />)}
              </div>
            </div>
            {/* Buffet skeletons */}
            <div>
              <div className="h-5 bg-[var(--surface2)] rounded w-24 mb-3" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <BuffetCardSkeleton key={i} />)}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !query && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-[var(--muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-2">Search for Chinese Buffets</h2>
            <p className="text-[var(--muted)]">Enter a city, neighborhood, or restaurant name to get started</p>
          </div>
        )}

        {/* No results state */}
        {!isLoading && query && filteredResults.length === 0 && cities.length === 0 && neighborhoods.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-[var(--muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-[var(--text)] mb-2">No results found</h2>
            <p className="text-[var(--muted)]">Try adjusting your search or filters</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 px-4 py-2 bg-[var(--accent1)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {!isLoading && (cities.length > 0 || neighborhoods.length > 0 || filteredResults.length > 0) && (
          <div className="space-y-8">
            {/* Cities */}
            {cities.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                  Cities ({cities.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cities.map((city) => (
                    <CityResultCard key={city.id} city={city} />
                  ))}
                </div>
              </section>
            )}

            {/* Neighborhoods */}
            {neighborhoods.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                  Neighborhoods ({neighborhoods.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {neighborhoods.map((neighborhood) => (
                    <NeighborhoodResultCard key={neighborhood.id} neighborhood={neighborhood} />
                  ))}
                </div>
              </section>
            )}

            {/* Buffets */}
            {filteredResults.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                  Buffets ({filteredResults.length}{hasMore ? '+' : ''})
                </h2>
                <div className="space-y-3">
                  {filteredResults.map((result) => (
                    <BuffetResultCard key={result.id} result={result} />
                  ))}
                </div>

                {/* Load More Button */}
                {(hasMore || mightHaveMoreAfterFilter) && (
                  <div className="mt-6 text-center">
                    {isLoadingMore ? (
                      <div className="inline-flex items-center gap-2 px-6 py-3 text-[var(--muted)]">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading more...
                      </div>
                    ) : hasMore ? (
                      <button
                        type="button"
                        onClick={loadMore}
                        className="px-6 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
                      >
                        Load More Results
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
