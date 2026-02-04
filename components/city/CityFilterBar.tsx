'use client';

import { useCallback, useState, useTransition, useMemo, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type {
  AmenityKey,
  NearbyCategoryKey,
  PriceBucketKey,
  RatingBucketKey,
  ReviewCountBucketKey,
  DineOptionKey,
  StandoutTagKey,
} from '@/lib/facets/taxonomy';
import {
  DINE_OPTION_LABELS,
  PRICE_BUCKET_LABELS,
  STANDOUT_TAG_LABELS,
} from '@/lib/facets/taxonomy';
import type { AggregatedFacets, DistanceBucketKey } from '@/lib/facets/aggregateFacets';
import { nearbyKey, formatNeighborhoodLabel } from '@/lib/facets/aggregateFacets';

// =============================================================================
// TYPES
// =============================================================================

type SortOption = 'relevance' | 'rating' | 'reviews' | 'price_low' | 'price_high';

interface ActiveFilters {
  price: PriceBucketKey[];
  rating: RatingBucketKey | null;
  reviews: ReviewCountBucketKey | null;
  neighborhoods: string[];
  amenities: AmenityKey[];
  dineOptions: DineOptionKey[];
  nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }>;
  standoutTags: StandoutTagKey[];
  openNow: boolean;
  sort: SortOption;
}

interface CityFilterBarProps {
  aggregated: AggregatedFacets;
  totalBuffets: number;
  filteredCount: number;
}

// =============================================================================
// LABELS
// =============================================================================

const PRICE_LABELS: Record<PriceBucketKey, string> = PRICE_BUCKET_LABELS;

const RATING_LABELS: Record<RatingBucketKey, string> = {
  rating_45: '4.5+ ★',
  rating_40: '4.0+ ★',
  rating_35: '3.5+ ★',
};

const REVIEWS_LABELS: Record<ReviewCountBucketKey, string> = {
  reviews_100: '100+',
  reviews_500: '500+',
  reviews_1000: '1000+',
};

const AMENITY_LABELS: Record<AmenityKey, string> = {
  parking: 'Parking',
  wheelchair_accessible: 'Wheelchair',
  kids_friendly: 'Kids Friendly',
  reservations: 'Reservations',
  takeout: 'Takeout',
  delivery: 'Delivery',
  wifi: 'WiFi',
  alcohol: 'Alcohol',
  credit_cards_accepted: 'Credit Cards',
  outdoor_seating: 'Outdoor',
  private_dining: 'Private',
};

const CATEGORY_LABELS: Record<NearbyCategoryKey, string> = {
  grocery: 'Grocery',
  hotel: 'Hotel',
  tourist_attraction: 'Attraction',
  shopping: 'Shopping',
  education: 'School',
  repair: 'Auto',
  nightlife: 'Nightlife',
  park: 'Park',
  transit: 'Transit',
  restaurant: 'Restaurant',
  gas_station: 'Gas',
  parking_lot: 'Parking',
};

const BUCKET_LABELS: Record<DistanceBucketKey, string> = {
  within025: '¼mi',
  within05: '½mi',
  within1: '1mi',
};

const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevance',
  rating: 'Highest Rated',
  reviews: 'Most Reviews',
  price_low: 'Price: Low to High',
  price_high: 'Price: High to Low',
};

// =============================================================================
// HELPERS
// =============================================================================

function parseActiveFilters(searchParams: URLSearchParams): ActiveFilters {
  const price = (searchParams.get('price')?.split(',').filter(Boolean) || []) as PriceBucketKey[];
  const rating = (searchParams.get('rating') || null) as RatingBucketKey | null;
  const reviews = (searchParams.get('reviews') || null) as ReviewCountBucketKey | null;
  const neighborhoods = searchParams.get('neighborhoods')?.split(',').filter(Boolean) || [];
  const amenities = (searchParams.get('amenities')?.split(',').filter(Boolean) || []) as AmenityKey[];
  const dineOptions = (searchParams.get('dine')?.split(',').filter(Boolean) || []) as DineOptionKey[];

  const nearbyParam = searchParams.get('nearby')?.split(',').filter(Boolean) || [];
  const nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }> = [];
  for (const item of nearbyParam) {
    const parts = item.split('_');
    if (parts.length >= 2) {
      const bucket = parts.pop() as DistanceBucketKey;
      const category = parts.join('_') as NearbyCategoryKey;
      nearby.push({ category, bucket });
    }
  }

  const standoutTags = (searchParams.get('tags')?.split(',').filter(Boolean) || []) as StandoutTagKey[];
  const openNowParam = searchParams.get('openNow');
  const openNow = openNowParam === '1' || openNowParam === 'true';
  
  // Parse sort option
  const sortParam = searchParams.get('sort') as SortOption | null;
  const sort: SortOption = sortParam && Object.keys(SORT_LABELS).includes(sortParam) ? sortParam : 'relevance';

  return { price, rating, reviews, neighborhoods, amenities, dineOptions, nearby, standoutTags, openNow, sort };
}

// =============================================================================
// ACTIVE FILTER TAG (removable chip)
// =============================================================================

function ActiveFilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent1)]/10 text-[var(--accent1)] rounded-full text-xs font-medium whitespace-nowrap">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-[var(--accent1)]/20 rounded-full p-0.5 -mr-0.5"
        aria-label={`Remove ${label}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// =============================================================================
// DROPDOWN FILTER
// =============================================================================

function FilterDropdown({
  label,
  options,
  value,
  onChange,
  multiple = false,
  icon,
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  value: string | string[];
  onChange: (value: string) => void;
  multiple?: boolean;
  icon?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasValue = multiple ? (value as string[]).length > 0 : !!value;
  
  const displayLabel = useMemo(() => {
    if (multiple) {
      const selected = value as string[];
      if (selected.length === 0) return label;
      if (selected.length === 1) {
        const opt = options.find(o => o.value === selected[0]);
        return opt?.label || label;
      }
      return `${label} (${selected.length})`;
    }
    if (!value) return label;
    const opt = options.find(o => o.value === value);
    return opt?.label || label;
  }, [label, options, value, multiple]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
          ${hasValue
            ? 'bg-[var(--accent1)] text-white'
            : 'bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent1)]'
          }
        `}
      >
        {icon}
        <span>{displayLabel}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          
          {/* Dropdown menu */}
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] max-h-64 overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg py-1">
            {options.map((option) => {
              const isSelected = multiple
                ? (value as string[]).includes(option.value)
                : value === option.value;
              
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    if (!multiple) setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors
                    ${isSelected ? 'bg-[var(--accent1)]/10 text-[var(--accent1)]' : 'text-[var(--text)] hover:bg-[var(--surface2)]'}
                  `}
                >
                  <span className="flex items-center gap-2">
                    {multiple && (
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-[var(--accent1)] border-[var(--accent1)]' : 'border-[var(--border)]'}`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    {option.label}
                  </span>
                  {option.count !== undefined && option.count > 0 && (
                    <span className="text-xs text-[var(--muted)]">({option.count})</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// MOBILE FILTER DRAWER
// =============================================================================

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  aggregated: AggregatedFacets;
  activeFilters: ActiveFilters;
  onTogglePrice: (key: PriceBucketKey) => void;
  onToggleRating: (key: RatingBucketKey) => void;
  onToggleReviews: (key: ReviewCountBucketKey) => void;
  onToggleAmenity: (key: AmenityKey) => void;
  onToggleDineOption: (key: DineOptionKey) => void;
  onToggleNearby: (category: NearbyCategoryKey, bucket: DistanceBucketKey) => void;
  onToggleNeighborhood: (slug: string) => void;
  onToggleStandoutTag: (key: StandoutTagKey) => void;
  onToggleOpenNow: () => void;
  onClearAll: () => void;
  onApply: () => void;
  activeCount: number;
}

function FilterDrawer({
  isOpen,
  onClose,
  aggregated,
  activeFilters,
  onTogglePrice,
  onToggleRating,
  onToggleReviews,
  onToggleAmenity,
  onToggleDineOption,
  onToggleNearby,
  onToggleNeighborhood,
  onToggleStandoutTag,
  onToggleOpenNow,
  onClearAll,
  onApply,
  activeCount,
}: FilterDrawerProps) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Computed options
  const neighborhoodOptions = useMemo(() => {
    const counts = aggregated.neighborhoodCounts || {};
    return Object.entries(counts)
      .map(([slug, count]) => ({ slug, label: formatNeighborhoodLabel(slug), count }))
      .sort((a, b) => b.count - a.count);
  }, [aggregated]);

  const amenityOptions = useMemo(() => {
    return (Object.keys(AMENITY_LABELS) as AmenityKey[])
      .map((key) => ({ key, label: AMENITY_LABELS[key], count: aggregated.amenityCounts?.[key] || 0 }))
      .filter((a) => a.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [aggregated]);

  const dineOptions = useMemo(() => {
    return (['dine_in', 'takeout', 'delivery'] as DineOptionKey[])
      .map((key) => ({ key, label: DINE_OPTION_LABELS[key], count: aggregated.dineOptionCounts?.[key] || 0 }))
      .filter((d) => d.count > 0);
  }, [aggregated]);

  const standoutTagOptions = useMemo(() => {
    const counts = aggregated.standoutTagCounts || {};
    return (Object.entries(counts) as Array<[StandoutTagKey, number]>)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ key, label: STANDOUT_TAG_LABELS[key], count }));
  }, [aggregated]);

  const nearbyOptions = useMemo(() => {
    const result: Array<{ category: NearbyCategoryKey; label: string; buckets: Array<{ bucket: DistanceBucketKey; count: number }> }> = [];
    for (const category of Object.keys(CATEGORY_LABELS) as NearbyCategoryKey[]) {
      const buckets: Array<{ bucket: DistanceBucketKey; count: number }> = [];
      for (const bucket of ['within025', 'within05', 'within1'] as DistanceBucketKey[]) {
        const count = aggregated.nearbyCounts?.[nearbyKey(category, bucket)] || 0;
        if (count > 0) buckets.push({ bucket, count });
      }
      if (buckets.length > 0) result.push({ category, label: CATEGORY_LABELS[category], buckets });
    }
    return result;
  }, [aggregated]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Drawer */}
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-[var(--surface)] rounded-t-2xl overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--text)]">Filters</h2>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 bg-[var(--accent1)] text-white text-xs rounded-full">{activeCount}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface2)] rounded-full transition-colors"
            aria-label="Close filters"
          >
            <svg className="w-5 h-5 text-[var(--text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Open Now - only show if at least one buffet has hours */}
          {aggregated.buffetsWithHours > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${activeFilters.openNow ? 'bg-green-500 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-sm font-medium text-[var(--text)]">Open now</span>
              </div>
              <button
                type="button"
                onClick={onToggleOpenNow}
                title="Show only buffets currently open"
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${activeFilters.openNow ? 'bg-green-600' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={activeFilters.openNow}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${activeFilters.openNow ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Price */}
          <FilterSection title="Price">
            <div className="flex flex-wrap gap-2">
              {(['price_1', 'price_2', 'price_3'] as PriceBucketKey[]).map((key) => {
                const count = aggregated.priceCounts?.[key] || 0;
                if (count === 0) return null;
                return (
                  <FilterChipButton
                    key={key}
                    label={PRICE_LABELS[key]}
                    count={count}
                    active={activeFilters.price.includes(key)}
                    onClick={() => onTogglePrice(key)}
                  />
                );
              })}
            </div>
          </FilterSection>

          {/* Rating */}
          <FilterSection title="Rating">
            <div className="flex flex-wrap gap-2">
              {(['rating_45', 'rating_40', 'rating_35'] as RatingBucketKey[]).map((key) => {
                const count = aggregated.ratingCounts?.[key] || 0;
                if (count === 0) return null;
                return (
                  <FilterChipButton
                    key={key}
                    label={RATING_LABELS[key]}
                    count={count}
                    active={activeFilters.rating === key}
                    onClick={() => onToggleRating(key)}
                  />
                );
              })}
            </div>
          </FilterSection>

          {/* Reviews */}
          <FilterSection title="Review Count">
            <div className="flex flex-wrap gap-2">
              {(['reviews_100', 'reviews_500', 'reviews_1000'] as ReviewCountBucketKey[]).map((key) => {
                const count = aggregated.reviewCountCounts?.[key] || 0;
                if (count === 0) return null;
                return (
                  <FilterChipButton
                    key={key}
                    label={REVIEWS_LABELS[key]}
                    count={count}
                    active={activeFilters.reviews === key}
                    onClick={() => onToggleReviews(key)}
                  />
                );
              })}
            </div>
          </FilterSection>

          {/* Neighborhoods */}
          {neighborhoodOptions.length >= 2 && (
            <FilterSection title="Neighborhood">
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {neighborhoodOptions.map((opt) => (
                  <FilterChipButton
                    key={opt.slug}
                    label={opt.label}
                    count={opt.count}
                    active={activeFilters.neighborhoods.includes(opt.slug)}
                    onClick={() => onToggleNeighborhood(opt.slug)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* Service Type */}
          {dineOptions.length > 0 && (
            <FilterSection title="Service Type">
              <div className="flex flex-wrap gap-2">
                {dineOptions.map((opt) => (
                  <FilterChipButton
                    key={opt.key}
                    label={opt.label}
                    count={opt.count}
                    active={activeFilters.dineOptions.includes(opt.key)}
                    onClick={() => onToggleDineOption(opt.key)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* What Stands Out */}
          {standoutTagOptions.length > 0 && (
            <FilterSection title="What Stands Out">
              <div className="flex flex-wrap gap-2">
                {standoutTagOptions.map((opt) => (
                  <FilterChipButton
                    key={opt.key}
                    label={opt.label}
                    count={opt.count}
                    active={activeFilters.standoutTags.includes(opt.key)}
                    onClick={() => onToggleStandoutTag(opt.key)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* Amenities */}
          {amenityOptions.length > 0 && (
            <FilterSection title="Amenities">
              <div className="flex flex-wrap gap-2">
                {amenityOptions.map((opt) => (
                  <FilterChipButton
                    key={opt.key}
                    label={opt.label}
                    count={opt.count}
                    active={activeFilters.amenities.includes(opt.key)}
                    onClick={() => onToggleAmenity(opt.key)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* Nearby Places */}
          {nearbyOptions.length > 0 && (
            <FilterSection title="Nearby Places">
              <div className="space-y-2">
                {nearbyOptions.slice(0, 6).map(({ category, label, buckets }) => (
                  <div key={category} className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text)] w-20 shrink-0">{label}</span>
                    <div className="flex gap-1">
                      {buckets.map(({ bucket, count }) => (
                        <FilterChipButton
                          key={bucket}
                          label={BUCKET_LABELS[bucket]}
                          count={count}
                          active={activeFilters.nearby.some(n => n.category === category && n.bucket === bucket)}
                          onClick={() => onToggleNearby(category, bucket)}
                          small
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </FilterSection>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] shrink-0 bg-[var(--surface)]">
          <button
            type="button"
            onClick={onClearAll}
            className="flex-1 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface2)] rounded-lg transition-colors"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onApply}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[var(--accent1)] rounded-lg hover:opacity-90 transition-opacity"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}

function FilterChipButton({
  label,
  count,
  active,
  onClick,
  small = false,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1 rounded-full font-medium transition-colors whitespace-nowrap
        ${small ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}
        ${active
          ? 'bg-[var(--accent1)] text-white'
          : 'bg-[var(--surface2)] text-[var(--text)] hover:bg-[var(--surface)] border border-[var(--border)]'
        }
      `}
    >
      {label}
      {count !== undefined && count > 0 && !active && (
        <span className="text-[var(--muted)]">({count})</span>
      )}
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CityFilterBar({
  aggregated,
  totalBuffets,
  filteredCount,
}: CityFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const activeFilters = useMemo(() => parseActiveFilters(searchParams), [searchParams]);

  const hasActiveFilters = useMemo(() => {
    return (
      activeFilters.price.length > 0 ||
      activeFilters.rating !== null ||
      activeFilters.reviews !== null ||
      activeFilters.neighborhoods.length > 0 ||
      activeFilters.amenities.length > 0 ||
      activeFilters.dineOptions.length > 0 ||
      activeFilters.nearby.length > 0 ||
      activeFilters.standoutTags.length > 0 ||
      activeFilters.openNow
    );
  }, [activeFilters]);

  const activeCount = useMemo(() => {
    return (
      activeFilters.price.length +
      (activeFilters.rating ? 1 : 0) +
      (activeFilters.reviews ? 1 : 0) +
      activeFilters.neighborhoods.length +
      activeFilters.amenities.length +
      activeFilters.dineOptions.length +
      activeFilters.nearby.length +
      activeFilters.standoutTags.length +
      (activeFilters.openNow ? 1 : 0)
    );
  }, [activeFilters]);

  // Neighborhood options for desktop dropdown
  const neighborhoodOptions = useMemo(() => {
    const counts = aggregated.neighborhoodCounts || {};
    return Object.entries(counts)
      .map(([slug, count]) => ({ value: slug, label: formatNeighborhoodLabel(slug), count }))
      .sort((a, b) => b.count - a.count);
  }, [aggregated]);

  // Build URL with filters
  const buildUrl = useCallback(
    (newFilters: ActiveFilters) => {
      const params = new URLSearchParams();
      if (newFilters.price.length > 0) params.set('price', newFilters.price.join(','));
      if (newFilters.rating) params.set('rating', newFilters.rating);
      if (newFilters.reviews) params.set('reviews', newFilters.reviews);
      if (newFilters.neighborhoods.length > 0) params.set('neighborhoods', newFilters.neighborhoods.join(','));
      if (newFilters.amenities.length > 0) params.set('amenities', newFilters.amenities.join(','));
      if (newFilters.dineOptions.length > 0) params.set('dine', newFilters.dineOptions.join(','));
      if (newFilters.nearby.length > 0) {
        params.set('nearby', newFilters.nearby.map((n) => nearbyKey(n.category, n.bucket)).join(','));
      }
      if (newFilters.standoutTags.length > 0) params.set('tags', newFilters.standoutTags.join(','));
      if (newFilters.openNow) params.set('openNow', '1');
      if (newFilters.sort && newFilters.sort !== 'relevance') params.set('sort', newFilters.sort);
      const queryString = params.toString();
      return queryString ? `${pathname}?${queryString}` : pathname;
    },
    [pathname]
  );

  const updateFilters = useCallback(
    (newFilters: ActiveFilters) => {
      startTransition(() => {
        router.push(buildUrl(newFilters), { scroll: false });
      });
    },
    [router, buildUrl]
  );

  // Toggle handlers
  const togglePrice = useCallback(
    (key: PriceBucketKey) => {
      const newPrice = activeFilters.price.includes(key)
        ? activeFilters.price.filter((p) => p !== key)
        : [...activeFilters.price, key];
      updateFilters({ ...activeFilters, price: newPrice });
    },
    [activeFilters, updateFilters]
  );

  const toggleRating = useCallback(
    (key: RatingBucketKey) => {
      const newRating = activeFilters.rating === key ? null : key;
      updateFilters({ ...activeFilters, rating: newRating });
    },
    [activeFilters, updateFilters]
  );

  const toggleReviews = useCallback(
    (key: ReviewCountBucketKey) => {
      const newReviews = activeFilters.reviews === key ? null : key;
      updateFilters({ ...activeFilters, reviews: newReviews });
    },
    [activeFilters, updateFilters]
  );

  const toggleAmenity = useCallback(
    (key: AmenityKey) => {
      const newAmenities = activeFilters.amenities.includes(key)
        ? activeFilters.amenities.filter((a) => a !== key)
        : [...activeFilters.amenities, key];
      updateFilters({ ...activeFilters, amenities: newAmenities });
    },
    [activeFilters, updateFilters]
  );

  const toggleDineOption = useCallback(
    (key: DineOptionKey) => {
      const newDine = activeFilters.dineOptions.includes(key)
        ? activeFilters.dineOptions.filter((d) => d !== key)
        : [...activeFilters.dineOptions, key];
      updateFilters({ ...activeFilters, dineOptions: newDine });
    },
    [activeFilters, updateFilters]
  );

  const toggleNearby = useCallback(
    (category: NearbyCategoryKey, bucket: DistanceBucketKey) => {
      const exists = activeFilters.nearby.some((n) => n.category === category && n.bucket === bucket);
      const newNearby = exists
        ? activeFilters.nearby.filter((n) => !(n.category === category && n.bucket === bucket))
        : [...activeFilters.nearby, { category, bucket }];
      updateFilters({ ...activeFilters, nearby: newNearby });
    },
    [activeFilters, updateFilters]
  );

  const toggleNeighborhood = useCallback(
    (slug: string) => {
      const newNeighborhoods = activeFilters.neighborhoods.includes(slug)
        ? activeFilters.neighborhoods.filter((n) => n !== slug)
        : [...activeFilters.neighborhoods, slug];
      updateFilters({ ...activeFilters, neighborhoods: newNeighborhoods });
    },
    [activeFilters, updateFilters]
  );

  const toggleStandoutTag = useCallback(
    (key: StandoutTagKey) => {
      const newTags = activeFilters.standoutTags.includes(key)
        ? activeFilters.standoutTags.filter((t) => t !== key)
        : [...activeFilters.standoutTags, key];
      updateFilters({ ...activeFilters, standoutTags: newTags });
    },
    [activeFilters, updateFilters]
  );

  const toggleOpenNow = useCallback(() => {
    updateFilters({ ...activeFilters, openNow: !activeFilters.openNow });
  }, [activeFilters, updateFilters]);

  const setSort = useCallback(
    (sort: SortOption) => {
      updateFilters({ ...activeFilters, sort });
    },
    [activeFilters, updateFilters]
  );

  const clearFilters = useCallback(() => {
    updateFilters({
      price: [],
      rating: null,
      reviews: null,
      neighborhoods: [],
      amenities: [],
      dineOptions: [],
      nearby: [],
      standoutTags: [],
      openNow: false,
      sort: activeFilters.sort, // Keep sort when clearing
    });
  }, [updateFilters, activeFilters.sort]);

  // Price options for dropdown
  const priceOptions = useMemo(() => {
    return (['price_1', 'price_2', 'price_3'] as PriceBucketKey[])
      .map((key) => ({ value: key, label: PRICE_LABELS[key], count: aggregated.priceCounts?.[key] || 0 }))
      .filter((opt) => opt.count > 0);
  }, [aggregated]);

  // Rating options for dropdown
  const ratingOptions = useMemo(() => {
    return (['rating_45', 'rating_40', 'rating_35'] as RatingBucketKey[])
      .map((key) => ({ value: key, label: RATING_LABELS[key], count: aggregated.ratingCounts?.[key] || 0 }))
      .filter((opt) => opt.count > 0);
  }, [aggregated]);

  // Sort options
  const sortOptions = useMemo(() => {
    return (Object.keys(SORT_LABELS) as SortOption[]).map((key) => ({
      value: key,
      label: SORT_LABELS[key],
    }));
  }, []);

  return (
    <>
      <div
        className={`
          sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)] shadow-sm
          ${isPending ? 'opacity-70' : ''}
        `}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main bar */}
          <div className="py-3 flex items-center gap-3">
            {/* Result count */}
            <div className="text-sm text-[var(--muted)] shrink-0">
              <span className="font-semibold text-[var(--text)]">{filteredCount}</span>
              <span className="hidden sm:inline"> of {totalBuffets}</span> results
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-[var(--border)] shrink-0 hidden sm:block" />

            {/* Desktop inline filters */}
            <div className="hidden lg:flex items-center gap-2 flex-1">
              {/* Open Now toggle - only show if at least one buffet has hours */}
              {aggregated.buffetsWithHours > 0 && (
                <button
                  type="button"
                  onClick={toggleOpenNow}
                  title="Show only buffets currently open"
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                    ${activeFilters.openNow
                      ? 'bg-green-600 text-white'
                      : 'bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)] hover:border-green-500'
                    }
                  `}
                >
                  <span className={`w-2 h-2 rounded-full ${activeFilters.openNow ? 'bg-white animate-pulse' : 'bg-green-500'}`} />
                  Open now
                </button>
              )}

              {/* Price dropdown */}
              {priceOptions.length > 0 && (
                <FilterDropdown
                  label="Price"
                  options={priceOptions}
                  value={activeFilters.price}
                  onChange={(val) => togglePrice(val as PriceBucketKey)}
                  multiple
                />
              )}

              {/* Rating dropdown */}
              {ratingOptions.length > 0 && (
                <FilterDropdown
                  label="Rating"
                  options={ratingOptions}
                  value={activeFilters.rating || ''}
                  onChange={(val) => toggleRating(val as RatingBucketKey)}
                />
              )}

              {/* Neighborhood dropdown */}
              {neighborhoodOptions.length >= 2 && (
                <FilterDropdown
                  label="Neighborhood"
                  options={neighborhoodOptions}
                  value={activeFilters.neighborhoods}
                  onChange={toggleNeighborhood}
                  multiple
                />
              )}

              {/* More filters button (desktop) */}
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                  ${activeCount > 3
                    ? 'bg-[var(--accent1)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent1)]'
                  }
                `}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                More
                {activeCount > 3 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] text-xs rounded-full bg-white/20">
                    {activeCount - 3}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile: Filters button */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className={`
                lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${hasActiveFilters
                  ? 'bg-[var(--accent1)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)]'
                }
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {activeCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] text-xs rounded-full bg-white/20">
                  {activeCount}
                </span>
              )}
            </button>

            {/* Spacer */}
            <div className="flex-1 lg:flex-none" />

            {/* Sort dropdown */}
            <FilterDropdown
              label="Sort"
              options={sortOptions}
              value={activeFilters.sort}
              onChange={(val) => setSort(val as SortOption)}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              }
            />
          </div>

          {/* Active filters chips row */}
          {hasActiveFilters && (
            <div className="pb-3 -mt-1">
              <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                {activeFilters.openNow && (
                  <ActiveFilterTag label="Open now" onRemove={toggleOpenNow} />
                )}
                {activeFilters.price.map((key) => (
                  <ActiveFilterTag key={key} label={PRICE_LABELS[key]} onRemove={() => togglePrice(key)} />
                ))}
                {activeFilters.rating && (
                  <ActiveFilterTag label={RATING_LABELS[activeFilters.rating]} onRemove={() => toggleRating(activeFilters.rating!)} />
                )}
                {activeFilters.reviews && (
                  <ActiveFilterTag label={`${REVIEWS_LABELS[activeFilters.reviews]} reviews`} onRemove={() => toggleReviews(activeFilters.reviews!)} />
                )}
                {activeFilters.neighborhoods.map((slug) => (
                  <ActiveFilterTag key={slug} label={formatNeighborhoodLabel(slug)} onRemove={() => toggleNeighborhood(slug)} />
                ))}
                {activeFilters.amenities.map((key) => (
                  <ActiveFilterTag key={key} label={AMENITY_LABELS[key]} onRemove={() => toggleAmenity(key)} />
                ))}
                {activeFilters.dineOptions.map((key) => (
                  <ActiveFilterTag key={key} label={DINE_OPTION_LABELS[key]} onRemove={() => toggleDineOption(key)} />
                ))}
                {activeFilters.standoutTags.map((key) => (
                  <ActiveFilterTag key={key} label={STANDOUT_TAG_LABELS[key]} onRemove={() => toggleStandoutTag(key)} />
                ))}
                {activeFilters.nearby.map(({ category, bucket }) => (
                  <ActiveFilterTag
                    key={`${category}_${bucket}`}
                    label={`${CATEGORY_LABELS[category]} ${BUCKET_LABELS[bucket]}`}
                    onRemove={() => toggleNearby(category, bucket)}
                  />
                ))}
                <button
                  onClick={clearFilters}
                  className="text-xs font-medium text-[var(--accent1)] hover:underline whitespace-nowrap ml-1"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        aggregated={aggregated}
        activeFilters={activeFilters}
        onTogglePrice={togglePrice}
        onToggleRating={toggleRating}
        onToggleReviews={toggleReviews}
        onToggleAmenity={toggleAmenity}
        onToggleDineOption={toggleDineOption}
        onToggleNearby={toggleNearby}
        onToggleNeighborhood={toggleNeighborhood}
        onToggleStandoutTag={toggleStandoutTag}
        onToggleOpenNow={toggleOpenNow}
        onClearAll={clearFilters}
        onApply={() => setIsDrawerOpen(false)}
        activeCount={activeCount}
      />
    </>
  );
}
