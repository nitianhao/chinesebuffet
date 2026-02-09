'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { AmenityKey, NearbyCategoryKey } from '@/lib/facets/taxonomy';
import type { AggregatedFacets, DistanceBucketKey } from '@/lib/facets/aggregateFacets';
import { nearbyKey } from '@/lib/facets/aggregateFacets';

// =============================================================================
// TYPES
// =============================================================================

interface ActiveFilters {
  amenities: AmenityKey[];
  nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }>;
}

interface CityFiltersProps {
  aggregated: AggregatedFacets;
  activeFilters: ActiveFilters;
  totalBuffets: number;
  filteredCount: number;
}

// =============================================================================
// DISPLAY LABELS
// =============================================================================

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

// Prioritized order for display
const AMENITY_DISPLAY_ORDER: AmenityKey[] = [
  'parking',
  'wheelchair_accessible',
  'wifi',
  'takeout',
  'delivery',
  'reservations',
  'kids_friendly',
  'alcohol',
  'credit_cards_accepted',
  'outdoor_seating',
  'private_dining',
];

const NEARBY_DISPLAY_ORDER: NearbyCategoryKey[] = [
  'hotel',
  'transit',
  'parking_lot',
  'grocery',
  'shopping',
  'park',
  'tourist_attraction',
  'nightlife',
  'gas_station',
  'education',
  'restaurant',
  'repair',
];

// =============================================================================
// FILTER CHECKBOX COMPONENT
// =============================================================================

function FilterCheckbox({
  label,
  count,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors
        ${checked ? 'bg-[var(--accent1)]/10' : 'hover:bg-[var(--surface2)]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent1)] focus:ring-[var(--accent1)]"
      />
      <span className="flex-1 text-sm text-[var(--text)]">{label}</span>
      <span className="text-xs text-[var(--muted)]">({count})</span>
    </label>
  );
}

// =============================================================================
// FILTER SECTION ACCORDION
// =============================================================================

function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 px-2 text-left hover:bg-[var(--surface2)] transition-colors"
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
      {isOpen && <div className="pb-3 px-1">{children}</div>}
    </div>
  );
}

// =============================================================================
// MOBILE DRAWER
// =============================================================================

function MobileFilterDrawer({
  isOpen,
  onClose,
  children,
  filteredCount,
  totalBuffets,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  filteredCount: number;
  totalBuffets: number;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute inset-y-0 left-0 w-full max-w-xs bg-[var(--surface)] shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold text-lg text-[var(--text)]">Filters</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface2)] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-4 py-3 bg-[var(--surface)]">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-[var(--accent1)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Show {filteredCount} of {totalBuffets} Results
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CityFilters({
  aggregated,
  activeFilters,
  totalBuffets,
  filteredCount,
}: CityFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Update URL with new filters
  const updateFilters = useCallback(
    (newFilters: ActiveFilters) => {
      const params = new URLSearchParams(searchParams.toString());

      // Update amenities param
      if (newFilters.amenities.length > 0) {
        params.set('amenities', newFilters.amenities.join(','));
      } else {
        params.delete('amenities');
      }

      // Update nearby param
      if (newFilters.nearby.length > 0) {
        const nearbyStrings = newFilters.nearby.map(
          ({ category, bucket }) => nearbyKey(category, bucket)
        );
        params.set('nearby', nearbyStrings.join(','));
      } else {
        params.delete('nearby');
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      startTransition(() => {
        router.push(newUrl, { scroll: false });
      });
    },
    [router, pathname, searchParams]
  );

  // Toggle amenity filter
  const toggleAmenity = useCallback(
    (amenity: AmenityKey, checked: boolean) => {
      const newAmenities = checked
        ? [...activeFilters.amenities, amenity]
        : activeFilters.amenities.filter((a) => a !== amenity);
      updateFilters({ ...activeFilters, amenities: newAmenities });
    },
    [activeFilters, updateFilters]
  );

  // Toggle nearby filter
  const toggleNearby = useCallback(
    (category: NearbyCategoryKey, bucket: DistanceBucketKey, checked: boolean) => {
      const key = nearbyKey(category, bucket);
      const newNearby = checked
        ? [...activeFilters.nearby, { category, bucket }]
        : activeFilters.nearby.filter(
            (n) => nearbyKey(n.category, n.bucket) !== key
          );
      updateFilters({ ...activeFilters, nearby: newNearby });
    },
    [activeFilters, updateFilters]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    updateFilters({ amenities: [], nearby: [] });
  }, [updateFilters]);

  const hasActiveFilters =
    activeFilters.amenities.length > 0 || activeFilters.nearby.length > 0;

  // Filter content (shared between desktop and mobile)
  const filterContent = (
    <div className={`${isPending ? 'opacity-60' : ''}`}>
      {/* Active Filters Count & Clear */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
          <span className="text-sm text-[var(--muted)]">
            {activeFilters.amenities.length + activeFilters.nearby.length} filters active
          </span>
          <button
            onClick={clearFilters}
            className="text-sm text-[var(--accent1)] hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Amenities Section */}
      <FilterSection title="Amenities">
        <div className="space-y-0.5">
          {AMENITY_DISPLAY_ORDER.map((amenity) => {
            const count = aggregated.amenityCounts[amenity] || 0;
            if (count === 0) return null;
            return (
              <FilterCheckbox
                key={amenity}
                label={AMENITY_LABELS[amenity]}
                count={count}
                checked={activeFilters.amenities.includes(amenity)}
                onChange={(checked) => toggleAmenity(amenity, checked)}
              />
            );
          })}
        </div>
      </FilterSection>

      {/* Nearby Places Section */}
      <FilterSection title="Nearby Places">
        <div className="space-y-3">
          {NEARBY_DISPLAY_ORDER.map((category) => {
            // Check if any bucket has counts
            const hasAnyCount = ['within025', 'within05', 'within1'].some(
              (bucket) => (aggregated.nearbyCounts[nearbyKey(category, bucket as DistanceBucketKey)] || 0) > 0
            );
            if (!hasAnyCount) return null;

            return (
              <div key={category} className="space-y-0.5">
                <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide px-2 pt-2">
                  {CATEGORY_LABELS[category]}
                </div>
                {(['within1', 'within05', 'within025'] as DistanceBucketKey[]).map((bucket) => {
                  const count = aggregated.nearbyCounts[nearbyKey(category, bucket)] || 0;
                  if (count === 0) return null;
                  const isActive = activeFilters.nearby.some(
                    (n) => n.category === category && n.bucket === bucket
                  );
                  return (
                    <FilterCheckbox
                      key={`${category}_${bucket}`}
                      label={`Within ${BUCKET_LABELS[bucket]}`}
                      count={count}
                      checked={isActive}
                      onChange={(checked) => toggleNearby(category, bucket, checked)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </FilterSection>
    </div>
  );

  return (
    <>
      {/* Mobile: Filter Button */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="bg-[var(--accent1)] text-white text-xs px-1.5 py-0.5 rounded-full">
              {activeFilters.amenities.length + activeFilters.nearby.length}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <span className="ml-3 text-sm text-[var(--muted)]">
            Showing {filteredCount} of {totalBuffets}
          </span>
        )}
      </div>

      {/* Mobile Drawer */}
      <MobileFilterDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        filteredCount={filteredCount}
        totalBuffets={totalBuffets}
      >
        {filterContent}
      </MobileFilterDrawer>

      {/* Desktop: Sidebar */}
      <div className="hidden lg:block w-64 flex-shrink-0">
        <div className="sticky top-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface2)]">
            <h2 className="font-semibold text-[var(--text)]">Filters</h2>
            {hasActiveFilters && (
              <p className="text-xs text-[var(--muted)] mt-1">
                Showing {filteredCount} of {totalBuffets}
              </p>
            )}
          </div>
          <div className="p-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {filterContent}
          </div>
        </div>
      </div>
    </>
  );
}
