'use client';

import { useCallback, useState, useTransition, useMemo } from 'react';
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
  STANDOUT_TAG_LABELS,
  DINE_OPTION_LABELS,
  PRICE_BUCKET_LABELS,
} from '@/lib/facets/taxonomy';
import type { AggregatedFacets, DistanceBucketKey } from '@/lib/facets/aggregateFacets';
import { nearbyKey } from '@/lib/facets/aggregateFacets';

// =============================================================================
// TYPES
// =============================================================================

interface NeighborhoodOption {
  slug: string;
  name: string;
  count: number;
}

interface ActiveFilters {
  price: PriceBucketKey[];
  rating: RatingBucketKey | null;
  reviews: ReviewCountBucketKey | null;
  neighborhoods: string[];
  amenities: AmenityKey[];
  dineOptions: DineOptionKey[];
  nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }>;
  standoutTags: StandoutTagKey[];
}

interface CityFiltersPanelProps {
  aggregated: AggregatedFacets;
  neighborhoods: NeighborhoodOption[];
  totalBuffets: number;
  filteredCount: number;
}

// =============================================================================
// DISPLAY LABELS
// =============================================================================

const PRICE_LABELS: Record<PriceBucketKey, string> = PRICE_BUCKET_LABELS;

const RATING_LABELS: Record<RatingBucketKey, string> = {
  rating_45: '4.5+ ★',
  rating_40: '4.0+ ★',
  rating_35: '3.5+ ★',
};

const REVIEWS_LABELS: Record<ReviewCountBucketKey, string> = {
  reviews_100: '100+ reviews',
  reviews_500: '500+ reviews',
  reviews_1000: '1000+ reviews',
};

const AMENITY_LABELS: Record<AmenityKey, string> = {
  parking: 'Parking',
  wheelchair_accessible: 'Wheelchair Accessible',
  kids_friendly: 'Kids Friendly',
  reservations: 'Reservations',
  takeout: 'Takeout',
  delivery: 'Delivery',
  wifi: 'Free WiFi',
  alcohol: 'Serves Alcohol',
  credit_cards_accepted: 'Credit Cards',
  outdoor_seating: 'Outdoor Seating',
  private_dining: 'Private Dining',
};

const CATEGORY_LABELS: Record<NearbyCategoryKey, string> = {
  grocery: 'Grocery Store',
  hotel: 'Hotel',
  tourist_attraction: 'Tourist Attraction',
  shopping: 'Shopping',
  education: 'School/College',
  repair: 'Auto Repair',
  nightlife: 'Nightlife',
  park: 'Park',
  transit: 'Public Transit',
  restaurant: 'Other Restaurant',
  gas_station: 'Gas Station',
  parking_lot: 'Parking Lot',
};

const BUCKET_LABELS: Record<DistanceBucketKey, string> = {
  within025: '¼ mi',
  within05: '½ mi',
  within1: '1 mi',
};

// Priority order for nearby categories
const NEARBY_PRIORITY: NearbyCategoryKey[] = [
  'hotel',
  'transit',
  'parking_lot',
  'shopping',
  'grocery',
  'park',
  'tourist_attraction',
  'nightlife',
  'restaurant',
  'gas_station',
  'education',
  'repair',
];

// =============================================================================
// HELPER: Parse active filters from URL
// =============================================================================

function parseActiveFilters(searchParams: URLSearchParams): ActiveFilters {
  const price = (searchParams.get('price')?.split(',') || []) as PriceBucketKey[];
  const rating = (searchParams.get('rating') || null) as RatingBucketKey | null;
  const reviews = (searchParams.get('reviews') || null) as ReviewCountBucketKey | null;
  const neighborhoods = searchParams.get('neighborhoods')?.split(',').filter(Boolean) || [];
  const amenities = (searchParams.get('amenities')?.split(',') || []) as AmenityKey[];
  const dineOptions = (searchParams.get('dine')?.split(',') || []) as DineOptionKey[];
  const standoutTags = (searchParams.get('tags')?.split(',') || []) as StandoutTagKey[];

  const nearbyParam = searchParams.get('nearby')?.split(',') || [];
  const nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }> = [];
  for (const item of nearbyParam) {
    const parts = item.split('_');
    if (parts.length >= 2) {
      const bucket = parts.pop() as DistanceBucketKey;
      const category = parts.join('_') as NearbyCategoryKey;
      nearby.push({ category, bucket });
    }
  }

  return { price, rating, reviews, neighborhoods, amenities, dineOptions, nearby, standoutTags };
}

// =============================================================================
// CHECKBOX ITEM
// =============================================================================

interface CheckboxItemProps {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function CheckboxItem({ label, count, checked, onChange, disabled }: CheckboxItemProps) {
  return (
    <label
      className={`
        flex items-center gap-2 py-1.5 cursor-pointer select-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-[var(--accent1)]'}
      `}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent1)] focus:ring-[var(--accent1)] focus:ring-offset-0"
      />
      <span className="flex-1 text-sm text-[var(--text)]">{label}</span>
      <span className="text-xs text-[var(--muted)]">({count})</span>
    </label>
  );
}

// =============================================================================
// COLLAPSIBLE SECTION
// =============================================================================

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-3 text-left"
      >
        <span className="font-semibold text-sm text-[var(--text)]">{title}</span>
        <svg
          className={`w-4 h-4 text-[var(--muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
}

// =============================================================================
// ACTIVE FILTER CHIP
// =============================================================================

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--accent1)]/10 text-[var(--accent1)] rounded-full text-xs">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-[var(--accent1)]/20 rounded-full p-0.5"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// =============================================================================
// MOBILE FILTER DRAWER
// =============================================================================

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}

function FilterDrawer({ isOpen, onClose, children, onClear, resultCount, totalCount }: FilterDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] lg:hidden">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] rounded-t-2xl border border-[var(--border)] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] space-y-2 pb-[calc(var(--bottom-nav-height,64px)+env(safe-area-inset-bottom)+1.5rem)]">
          <div className="text-sm text-center text-[var(--muted)]">
            {resultCount} of {totalCount} buffets
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="flex-1 min-h-[44px] rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-sm font-medium text-[var(--text)]"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-lg bg-[var(--accent1)] text-sm font-semibold text-white"
            >
              Show results
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FILTERS CONTENT (shared between sidebar and drawer)
// =============================================================================

interface FiltersContentProps {
  activeFilters: ActiveFilters;
  aggregated: AggregatedFacets;
  neighborhoods: NeighborhoodOption[];
  togglePrice: (key: PriceBucketKey) => void;
  toggleRating: (key: RatingBucketKey) => void;
  toggleReviews: (key: ReviewCountBucketKey) => void;
  toggleNeighborhood: (slug: string) => void;
  toggleAmenity: (key: AmenityKey) => void;
  toggleDineOption: (key: DineOptionKey) => void;
  toggleNearby: (category: NearbyCategoryKey, bucket: DistanceBucketKey) => void;
  toggleStandoutTag: (key: StandoutTagKey) => void;
}

function FiltersContent({
  activeFilters,
  aggregated,
  neighborhoods,
  togglePrice,
  toggleRating,
  toggleReviews,
  toggleNeighborhood,
  toggleAmenity,
  toggleDineOption,
  toggleNearby,
  toggleStandoutTag,
}: FiltersContentProps) {
  // Price options
  const priceOptions = useMemo(() => {
    return (['price_1', 'price_2', 'price_3'] as PriceBucketKey[])
      .map((key) => ({
        key,
        label: PRICE_LABELS[key],
        count: aggregated.priceCounts?.[key] || 0,
      }))
      .filter((o) => o.count > 0);
  }, [aggregated]);

  // Rating options
  const ratingOptions = useMemo(() => {
    return (['rating_45', 'rating_40', 'rating_35'] as RatingBucketKey[])
      .map((key) => ({
        key,
        label: RATING_LABELS[key],
        count: aggregated.ratingCounts?.[key] || 0,
      }))
      .filter((o) => o.count > 0);
  }, [aggregated]);

  // Reviews options
  const reviewsOptions = useMemo(() => {
    return (['reviews_1000', 'reviews_500', 'reviews_100'] as ReviewCountBucketKey[])
      .map((key) => ({
        key,
        label: REVIEWS_LABELS[key],
        count: aggregated.reviewCountCounts?.[key] || 0,
      }))
      .filter((o) => o.count > 0);
  }, [aggregated]);

  // Amenity options
  const amenityOptions = useMemo(() => {
    return (Object.keys(AMENITY_LABELS) as AmenityKey[])
      .map((key) => ({
        key,
        label: AMENITY_LABELS[key],
        count: aggregated.amenityCounts?.[key] || 0,
      }))
      .filter((a) => a.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [aggregated]);

  // Dine options
  const dineOptions = useMemo(() => {
    return (['dine_in', 'takeout', 'delivery'] as DineOptionKey[])
      .map((key) => ({
        key,
        label: DINE_OPTION_LABELS[key],
        count: aggregated.dineOptionCounts?.[key] || 0,
      }))
      .filter((d) => d.count > 0);
  }, [aggregated]);

  // Nearby categories with counts - grouped by category, showing best distance bucket
  const nearbyOptions = useMemo(() => {
    const result: Array<{
      category: NearbyCategoryKey;
      label: string;
      buckets: Array<{ bucket: DistanceBucketKey; label: string; count: number }>;
    }> = [];

    for (const category of NEARBY_PRIORITY) {
      const buckets: Array<{ bucket: DistanceBucketKey; label: string; count: number }> = [];

      for (const bucket of ['within025', 'within05', 'within1'] as DistanceBucketKey[]) {
        const count = aggregated.nearbyCounts?.[nearbyKey(category, bucket)] || 0;
        if (count > 0) {
          buckets.push({ bucket, label: BUCKET_LABELS[bucket], count });
        }
      }

      if (buckets.length > 0) {
        result.push({
          category,
          label: CATEGORY_LABELS[category],
          buckets,
        });
      }
    }

    return result;
  }, [aggregated]);

  // Standout tags
  const standoutOptions = useMemo(() => {
    return (Object.keys(STANDOUT_TAG_LABELS) as StandoutTagKey[])
      .map((key) => ({
        key,
        label: STANDOUT_TAG_LABELS[key],
        count: aggregated.standoutTagCounts?.[key] || 0,
      }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12); // Top 12 tags
  }, [aggregated]);

  const hasPriceData = priceOptions.length > 0;
  const hasRatingData = ratingOptions.length > 0;
  const hasReviewsData = reviewsOptions.length > 0;
  const hasAmenityData = amenityOptions.length > 0;
  const hasDineData = dineOptions.length > 0;
  const hasNeighborhoodData = neighborhoods.length > 0;
  const hasNearbyData = nearbyOptions.length > 0;
  const hasStandoutData = standoutOptions.length > 0;

  return (
    <>
      {/* Price */}
      {hasPriceData && (
        <CollapsibleSection title="Price">
          <div className="space-y-1">
            {priceOptions.map((option) => (
              <CheckboxItem
                key={option.key}
                label={option.label}
                count={option.count}
                checked={activeFilters.price.includes(option.key)}
                onChange={() => togglePrice(option.key)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Rating */}
      {hasRatingData && (
        <CollapsibleSection title="Rating">
          <div className="space-y-1">
            {ratingOptions.map((option) => (
              <CheckboxItem
                key={option.key}
                label={option.label}
                count={option.count}
                checked={activeFilters.rating === option.key}
                onChange={() => toggleRating(option.key)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Reviews */}
      {hasReviewsData && (
        <CollapsibleSection title="Reviews">
          <div className="space-y-1">
            {reviewsOptions.map((option) => (
              <CheckboxItem
                key={option.key}
                label={option.label}
                count={option.count}
                checked={activeFilters.reviews === option.key}
                onChange={() => toggleReviews(option.key)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Service Type */}
      {hasDineData && (
        <CollapsibleSection title="Service Type">
          <div className="space-y-1">
            {dineOptions.map((option) => (
              <CheckboxItem
                key={option.key}
                label={option.label}
                count={option.count}
                checked={activeFilters.dineOptions.includes(option.key)}
                onChange={() => toggleDineOption(option.key)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Neighborhoods */}
      {hasNeighborhoodData && (
        <CollapsibleSection title="Neighborhoods">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {neighborhoods.map((n) => (
              <CheckboxItem
                key={n.slug}
                label={n.name}
                count={n.count}
                checked={activeFilters.neighborhoods.includes(n.slug)}
                onChange={() => toggleNeighborhood(n.slug)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Amenities */}
      {hasAmenityData && (
        <CollapsibleSection title="Amenities">
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {amenityOptions.map((option) => (
              <CheckboxItem
                key={option.key}
                label={option.label}
                count={option.count}
                checked={activeFilters.amenities.includes(option.key)}
                onChange={() => toggleAmenity(option.key)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Nearby Places */}
      {hasNearbyData && (
        <CollapsibleSection title="Nearby Places" defaultOpen={false}>
          <div className="space-y-3">
            {nearbyOptions.map(({ category, label, buckets }) => (
              <div key={category} className="space-y-1">
                <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                  {label}
                </div>
                <div className="flex flex-wrap gap-1">
                  {buckets.map(({ bucket, label: bucketLabel, count }) => {
                    const isSelected = activeFilters.nearby.some(
                      (n) => n.category === category && n.bucket === bucket
                    );
                    return (
                      <button
                        key={bucket}
                        type="button"
                        onClick={() => toggleNearby(category, bucket)}
                        className={`
                          px-2 py-1 text-xs rounded border transition-colors
                          ${
                            isSelected
                              ? 'bg-[var(--accent1)] text-white border-[var(--accent1)]'
                              : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent1)]'
                          }
                        `}
                      >
                        {bucketLabel} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Standout Features */}
      {hasStandoutData && (
        <CollapsibleSection title="What Stands Out" defaultOpen={false}>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {standoutOptions.map((option) => (
              <CheckboxItem
                key={option.key}
                label={option.label}
                count={option.count}
                checked={activeFilters.standoutTags.includes(option.key)}
                onChange={() => toggleStandoutTag(option.key)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CityFiltersPanel({
  aggregated,
  neighborhoods,
  totalBuffets,
  filteredCount,
}: CityFiltersPanelProps) {
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
      activeFilters.standoutTags.length > 0
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
      activeFilters.standoutTags.length
    );
  }, [activeFilters]);

  // Build new URL with updated filters
  const buildUrl = useCallback(
    (newFilters: ActiveFilters) => {
      const params = new URLSearchParams();

      if (newFilters.price.length > 0) params.set('price', newFilters.price.join(','));
      if (newFilters.rating) params.set('rating', newFilters.rating);
      if (newFilters.reviews) params.set('reviews', newFilters.reviews);
      if (newFilters.neighborhoods.length > 0)
        params.set('neighborhoods', newFilters.neighborhoods.join(','));
      if (newFilters.amenities.length > 0) params.set('amenities', newFilters.amenities.join(','));
      if (newFilters.dineOptions.length > 0) params.set('dine', newFilters.dineOptions.join(','));
      if (newFilters.standoutTags.length > 0) params.set('tags', newFilters.standoutTags.join(','));
      if (newFilters.nearby.length > 0) {
        params.set('nearby', newFilters.nearby.map((n) => nearbyKey(n.category, n.bucket)).join(','));
      }

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

  // Toggle functions
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

  const toggleNeighborhood = useCallback(
    (slug: string) => {
      const newNeighborhoods = activeFilters.neighborhoods.includes(slug)
        ? activeFilters.neighborhoods.filter((n) => n !== slug)
        : [...activeFilters.neighborhoods, slug];
      updateFilters({ ...activeFilters, neighborhoods: newNeighborhoods });
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
      const newDineOptions = activeFilters.dineOptions.includes(key)
        ? activeFilters.dineOptions.filter((d) => d !== key)
        : [...activeFilters.dineOptions, key];
      updateFilters({ ...activeFilters, dineOptions: newDineOptions });
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

  const toggleNearby = useCallback(
    (category: NearbyCategoryKey, bucket: DistanceBucketKey) => {
      const key = nearbyKey(category, bucket);
      const exists = activeFilters.nearby.some((n) => nearbyKey(n.category, n.bucket) === key);
      const newNearby = exists
        ? activeFilters.nearby.filter((n) => nearbyKey(n.category, n.bucket) !== key)
        : [...activeFilters.nearby, { category, bucket }];
      updateFilters({ ...activeFilters, nearby: newNearby });
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
    });
  }, [updateFilters]);

  const formatNeighborhoodLabel = (slug: string) => {
    const neighborhood = neighborhoods.find((n) => n.slug === slug);
    return neighborhood?.name || slug;
  };

  return (
    <>
      {/* Mobile: Filter button bar */}
      <div className="lg:hidden sticky top-[var(--header-offset-mobile,48px)] z-30 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--text)]">{filteredCount}</span> of {totalBuffets}{' '}
            buffets
          </div>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className={`
              inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-semibold transition-colors
              ${
                hasActiveFilters
                  ? 'bg-[var(--accent1)] text-white border-[var(--accent1)]'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent1)]'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span>Filters</span>
            {activeCount > 0 && (
              <span
                className={`flex items-center justify-center min-w-[20px] h-5 text-xs rounded-full ${hasActiveFilters ? 'bg-white/20' : 'bg-[var(--accent1)] text-white'}`}
              >
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Active filters chips - horizontal scroll */}
        {hasActiveFilters && (
          <div className="px-4 sm:px-6 pb-3 -mx-1">
            <div
              className="flex items-center gap-2 overflow-x-auto px-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {activeFilters.price.map((key) => (
                <span key={key} className="shrink-0">
                  <ActiveFilterChip label={PRICE_LABELS[key]} onRemove={() => togglePrice(key)} />
                </span>
              ))}
              {activeFilters.rating && (
                <span className="shrink-0">
                  <ActiveFilterChip
                    label={RATING_LABELS[activeFilters.rating]}
                    onRemove={() => toggleRating(activeFilters.rating!)}
                  />
                </span>
              )}
              {activeFilters.reviews && (
                <span className="shrink-0">
                  <ActiveFilterChip
                    label={REVIEWS_LABELS[activeFilters.reviews]}
                    onRemove={() => toggleReviews(activeFilters.reviews!)}
                  />
                </span>
              )}
              {activeFilters.neighborhoods.map((slug) => (
                <span key={slug} className="shrink-0">
                  <ActiveFilterChip
                    label={formatNeighborhoodLabel(slug)}
                    onRemove={() => toggleNeighborhood(slug)}
                  />
                </span>
              ))}
              {activeFilters.amenities.map((amenity) => (
                <span key={amenity} className="shrink-0">
                  <ActiveFilterChip
                    label={AMENITY_LABELS[amenity]}
                    onRemove={() => toggleAmenity(amenity)}
                  />
                </span>
              ))}
              {activeFilters.dineOptions.map((key) => (
                <span key={key} className="shrink-0">
                  <ActiveFilterChip
                    label={DINE_OPTION_LABELS[key]}
                    onRemove={() => toggleDineOption(key)}
                  />
                </span>
              ))}
              {activeFilters.nearby.map(({ category, bucket }) => (
                <span key={`${category}_${bucket}`} className="shrink-0">
                  <ActiveFilterChip
                    label={`Near ${CATEGORY_LABELS[category]} (${BUCKET_LABELS[bucket]})`}
                    onRemove={() => toggleNearby(category, bucket)}
                  />
                </span>
              ))}
              {activeFilters.standoutTags.map((tag) => (
                <span key={tag} className="shrink-0">
                  <ActiveFilterChip
                    label={STANDOUT_TAG_LABELS[tag]}
                    onRemove={() => toggleStandoutTag(tag)}
                  />
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="shrink-0 text-sm text-[var(--accent1)] hover:underline ml-2"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Sidebar */}
      <aside
        className={`
          hidden lg:block w-64 shrink-0
          ${isPending ? 'opacity-70' : ''}
        `}
      >
        <div className="sticky top-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[var(--text)]">Filters</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-[var(--accent1)] hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Result count */}
          <div className="text-sm text-[var(--muted)] mb-4">
            <span className="font-medium text-[var(--text)]">{filteredCount}</span> of {totalBuffets}{' '}
            buffets
          </div>

          {/* Filter sections */}
          <FiltersContent
            activeFilters={activeFilters}
            aggregated={aggregated}
            neighborhoods={neighborhoods}
            togglePrice={togglePrice}
            toggleRating={toggleRating}
            toggleReviews={toggleReviews}
            toggleNeighborhood={toggleNeighborhood}
            toggleAmenity={toggleAmenity}
            toggleDineOption={toggleDineOption}
            toggleNearby={toggleNearby}
            toggleStandoutTag={toggleStandoutTag}
          />
        </div>
      </aside>

      {/* Mobile: Filter Drawer */}
      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onClear={() => {
          clearFilters();
          setIsDrawerOpen(false);
        }}
        resultCount={filteredCount}
        totalCount={totalBuffets}
      >
        <FiltersContent
          activeFilters={activeFilters}
          aggregated={aggregated}
          neighborhoods={neighborhoods}
          togglePrice={togglePrice}
          toggleRating={toggleRating}
          toggleReviews={toggleReviews}
          toggleNeighborhood={toggleNeighborhood}
          toggleAmenity={toggleAmenity}
          toggleDineOption={toggleDineOption}
          toggleNearby={toggleNearby}
          toggleStandoutTag={toggleStandoutTag}
        />
      </FilterDrawer>
    </>
  );
}
