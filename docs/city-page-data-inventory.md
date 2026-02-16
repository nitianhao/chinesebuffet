# City Page Data Inventory Report

**Date:** 2026-02-13
**Scope:** `/chinese-buffets/[city-state]` (e.g. `/chinese-buffets/pekin-il`)

## 1. Where the City Page Lives
- **Route File:** `app/chinese-buffets/[city-state]/page.tsx`
- **Layout:** `app/layout.tsx` (Global), `components/layout/SiteShell.tsx` (Page Wrapper)
- **Metadata:** `generateMetadata` function in `page.tsx`

## 2. How Data is Fetched
The page uses **Incremental Static Regeneration (ISR)** with `unstable_cache` to fetch pre-computed "rollups" from InstantDB. It does **not** query the raw `buffets` table directly at runtime.

### Call Graph
1. `CityPage(params)` -> calls `getCityBuffetsCached(citySlug)`
2. `getCityBuffetsCached` -> calls `getCityBuffetsRollup` (`@/lib/rollups.ts`)
3. `getCityBuffetsRollup` -> queries `directoryRollups` table in InstantDB (type: `cityBuffets`, key: `citySlug`)
4. **Result:** Returns a large JSON blob containing the city metadata and list of buffets.

### Caching & Constraints
- **Revalidation:** Every 6 hours (prod) / 1 hour (dev).
- **Fetch Cache:** `force-cache` enabled.
- **Dynamic Params:** `searchParams` are restricted. Accessing them forces dynamic rendering, so filtering is client-side only (`CityFacetsLoader`).
- **Data Source:** The rollups are built periodically by `scripts/rebuildRollups.js`.

## 3. Data Inventory (Render Time)

### A. City-Level Fields Available
These fields are available directly on the city data object:
- `cityName` (string)
- `state` (string)
- `stateAbbr` (string)
- `population` (number | null)
- `buffetCount` (number)
- `neighborhoods` (Array of facets)

### B. Buffet-Level Fields Available
Each buffet in the list (`CityBuffetRow`) has:
- `id` (string)
- `slug` (string)
- `name` (string)
- `address` (string)
- `neighborhood` (string | null)
- `rating` (number | null)
- `reviewsCount` (number | null)
- `price` (string | null) - *Note: Unstructured string, e.g. "$15"*
- `lat` (number)
- `lng` (number)
- `phone` (string | null)
- `website` (string | null)
- `imagesCount` (number | null)

### C. Derived Metrics (Computed in `page.tsx`)
- **Price Range:** Computed from buffet properties (e.g., "$10-$25").
- **Top Rated:** First item after sorting by rating.
- **Nearby Cities:** Calculated at runtime using geometric distance (Euclidean) between the centroid of city buffets and other cities in the state.
- **Other Cities in State:** List of other cities in the same state (fetched via `getStateCitiesRollup`).

## 4. Missing Data & Opportunities

### A. "Open Now" / Hours
- **Current State:** The `CityBuffetRow` **does not** have hours data.
- **Availability:** The rollup script (`rebuildRollups.js`) *does* access `hasHours` (boolean) inside a `facetIndex` blob, but strictly excludes it from the `buffets` array sent to the page.
- **Impact:** We cannot show "Open Now" badges or hours on the cards without modifying the rollup script.

### B. Amenities (WiFi, Parking, etc.)
- **Current State:** Not available on the server-side `CityBuffetRow`.
- **Availability:** Available in the source `facetIndex` but excluded from the render object.

### C. "Nearby Places" / POIs
- **Current State:** Not available on the page.
- **Availability (Source 1):** The rollup script counts "nearby" POIs (e.g. "Near 3 Hotels") for facets, but discards specific names.
- **Availability (Source 2):** A local file `cityDescriptions/cities_2.json` contains rich data like `topAttractions`, `majorHotels`, and `shoppingCenters` for many cities. **This is currently unused.**

### D. Detailed Descriptions
- **Current State:** Generic "We found X buffets in Y..." text.
- **Availability:** No dynamic descriptions currently exist in the rollup data.

## 5. Examples & Shapes

### City Page Input
```typescript
interface CityPageProps {
  params: {
    'city-state': string; // e.g., "pekin-il"
  };
}
```

### Buffet Record (Runtime)
```typescript
interface CityBuffetRow {
  id: "..."
  name: "Super China Buffet"
  rating: 4.2
  // ... (see list above)
  
  // MISSING (not in current shape):
  // hours: string | object
  // amenities: string[]
  // isOpen: boolean
}
```

### Unused "Rich" City Data (`cityDescriptions/cities_2.json`)
This data exists locally but is not ingested into the DB or Rollups:
```typescript
interface RichCityData {
  city: "San Pablo"
  topAttractions: [
    { name: "Alvarado Park", category: "Park", distance: 1 }
  ]
  majorHotels: string[]
  shoppingCenters: string[]
  universities: string[]
}
```

## 6. Recommendations (No Code Changes Yet)

1.  **Ingest Rich Data:** The `cityDescriptions/cities_2.json` file is a goldmine for SEO content ("Best Chinese Buffets near Alvarado Park"). We should ingest this into InstantDB and include it in the `CityBuffetsRollup`.
2.  **Expose Hours/Amenities:** Modify `scripts/rebuildRollups.js` to include `hours` (or at least `openNow` status) and top amenities in the `CityBuffetRow` so we can render badges.
3.  **Use Static Data Fallback:** If DB schema changes are too heavy, we could import `cities_2.json` directly in `page.tsx` as a fallback lookup for "Things to do nearby" sections.
