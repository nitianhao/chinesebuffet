# Facets Module

This module provides faceted search/filtering capabilities for buffet listings.

## Overview

The facets system pre-computes filter data for:
- **Amenities**: Parking, WiFi, wheelchair accessible, reservations, etc.
- **Nearby categories**: Hotels, grocery stores, transit, parks, etc. with distance buckets

## Files

- `taxonomy.ts` - Defines canonical amenity/category keys and distance buckets
- `buildFacetIndex.ts` - Pure function to extract facet data from a buffet object
- `__tests__/buildFacetIndex.test.ts` - Unit tests

## Database Schema

The `facetIndex` column on `buffets` stores JSON-stringified `BuffetFacetData`:

```typescript
interface BuffetFacetData {
  amenities: Record<AmenityKey, boolean>;
  nearby: Record<NearbyCategoryKey, {
    within025: boolean;  // Within 0.25 miles
    within05: boolean;   // Within 0.5 miles
    within1: boolean;    // Within 1.0 mile
    count: number;       // Total POIs in category within 1 mile
  }>;
}
```

## Backfill Script

### Prerequisites

Before running the backfill, you must sync the schema to InstantDB:

```bash
# Option 1: Use the sync-schema script
npm run sync-schema

# Option 2: Use instant-cli directly
npx instant-cli push --app 709e0e09-3347-419b-8daa-bad6889e480d

# Option 3: Start the dev server briefly (auto-syncs schema)
npm run dev  # then Ctrl+C to stop
```

### Running the Backfill

To populate `facetIndex` for all existing buffets:

```bash
# Preview changes (dry run)
npm run backfill:facet-index:dry

# Run the full backfill
npm run backfill:facet-index

# Resume an interrupted backfill
npm run backfill:facet-index:resume
```

### Options

```bash
npx tsx scripts/backfillFacetIndex.ts [options]

Options:
  --dry-run           Preview changes without writing to database
  --force             Overwrite existing facetIndex values
  --limit N           Process only N buffets
  --batch-size N      Process N buffets per batch (default: 100)
  --resume            Resume from last checkpoint
  --buffet-id ID      Process a single buffet by ID
  --clear-checkpoint  Clear the checkpoint file
```

### Checkpoints

The script saves progress to `scripts/checkpoints/facet-index.checkpoint.json`.
If interrupted, use `--resume` to continue where it left off.

## Integration

### New Buffets

New buffets automatically get an initial `facetIndex` computed when created via the `/api/add-buffet` endpoint.

### After POI Updates

When POI data is updated for a buffet, re-run the backfill for that specific buffet:

```bash
npx tsx scripts/backfillFacetIndex.ts --buffet-id <buffet-id>
```

Or trigger a full re-backfill with `--force`:

```bash
npx tsx scripts/backfillFacetIndex.ts --force
```

## Running Tests

```bash
npx tsx lib/facets/__tests__/buildFacetIndex.test.ts
npx tsx lib/facets/__tests__/aggregateFacets.test.ts
```

## City Hub Page Integration

The facets system is integrated into city hub pages (`/chinese-buffets/[city-state]`):

### URL Parameters

Filters are stored in URL search params for shareable, bookmarkable filtered views:

- `?amenities=parking,wifi` - Filter by amenities (comma-separated)
- `?nearby=hotel_within05,transit_within1` - Filter by nearby places (category_bucket format)
- `?amenities=parking&nearby=hotel_within05` - Combine filters

### Components

- `CityFilterBar` (`components/city/CityFilterBar.tsx`) - Sticky top filter bar with:
  - Compact view with top amenities + nearby dropdowns
  - "More filters" expand/collapse for additional options
  - Active filter tags with remove buttons
  - Mobile-friendly horizontal scrolling chips
- `FilterBarSkeleton` - Loading skeleton for Suspense fallback

**Legacy:** `CityFilters` (`components/facets/CityFilters.tsx`) - Sidebar/drawer version (kept for reference)

### Server-Side Functions

```typescript
import { getCityFacets, parseFiltersFromParams, applyFilters } from '@/lib/facets';

// In your page component:
const facetsResult = await getCityFacets(citySlug);
const activeFilters = parseFiltersFromParams(searchParams);
const filteredIds = applyFilters(
  facetsResult.facetsByBuffetId,
  facetsResult.allBuffetIds,
  activeFilters
);
```

### Performance

- Facet data is fetched in parallel with rollup data
- Only `id` and `facetIndex` fields are fetched for filtering
- Filtering happens server-side, so only filtered buffets are rendered
- Mobile: Collapsible drawer to save screen space
- Desktop: Sticky sidebar that scrolls independently
