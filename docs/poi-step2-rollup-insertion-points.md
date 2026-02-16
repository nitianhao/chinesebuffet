# POI Rollup Insertion Points

**File**: `scripts/rebuildRollups.js`

This file handles the aggregation of buffet data into "rollups" for efficient page rendering. We need to inject the POI Summary data into the city-level rollups so it's available on the city pages.

## 1. Buffet Object Injection

**Location**: Inside `buildCityBuffetsRollups`, where individual buffet objects are mapped for the city list.

**Line**: ~499

```javascript
    // Add buffet with minimal fields
    cityData.buffets.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      address: b.address,
      neighborhood: b.neighborhood,
      rating: b.rating,
      reviewsCount: b.reviewsCount,
      price: b.price,
      lat: b.lat,
      lng: b.lng,
      phone: b.phone,
      website: b.website,
      imagesCount: b.imagesCount,
      // INSERT buffet.poiSummary HERE
    });
```

**Variables Available**:
- `b`: The raw buffet object fetched from InstantDB (via `fetchBuffetsForState`).
  - *Note*: We must ensure `poiSummary` is selected in `fetchBuffetsForState` for it to be present here.
- `cityData`: The aggregator object for the current city.

## 2. City Object Injection

**Location**: Inside `buildCityBuffetsRollups`, where the final city rollup object is constructed.

**Line**: ~543

```javascript
    rollups.push({
      key: citySlug,
      data: {
        citySlug,
        cityName: cityData.cityName,
        state: cityData.state,
        stateAbbr: cityData.stateAbbr,
        population: cityData.population,
        buffetCount: sortedBuffets.length,
        buffets: sortedBuffets,
        neighborhoods,
        // INSERT city.cityPoiSummary HERE
      },
    });
```

**Variables Available**:
- `cityData`: The working object containing `buffets`, `neighborhoods`, etc.
- `sortedBuffets`: The list of buffets for this city (now potentially containing `poiSummary`).
- `neighborhoods`: Aggregated neighborhood stats.

**Goal**:
We will compute a `cityPoiSummary` (e.g., "Top categories in this city: Food & Dining (12), Healthcare (5)...") and attach it here.
