# Overpass API Integration

This document describes the Overpass API integration for enriching location data in the Chinese Buffet directory.

## Overview

The Overpass API allows us to query OpenStreetMap data to get detailed location information including:
- Neighborhood names
- Administrative boundaries (city, county, state)
- Nearby points of interest (POIs)
- Address details
- Nearby restaurants and amenities

## Installation

No additional dependencies are required. The integration uses the native `fetch` API available in Node.js 18+.

## Usage

### Basic Query Functions

#### Get Neighborhood Information

```typescript
import { getNeighborhoodInfo } from '../lib/overpass-api';

const info = await getNeighborhoodInfo(37.7749, -122.4194);
// Returns: { neighborhood?, city?, county?, state?, postcode? }
```

#### Find Nearby Restaurants

```typescript
import { findNearbyRestaurants } from '../lib/overpass-api';

const restaurants = await findNearbyRestaurants(
  37.7749,  // lat
  -122.4194, // lon
  1000,      // radius in meters
  20         // limit
);
```

#### Find Chinese Restaurants

```typescript
import { findChineseRestaurants } from '../lib/overpass-api';

const chineseRestaurants = await findChineseRestaurants(
  37.7749,
  -122.4194,
  2000,  // radius in meters
  50     // limit
);
```

#### Get Administrative Boundaries

```typescript
import { getAdministrativeBoundaries } from '../lib/overpass-api';

const boundaries = await getAdministrativeBoundaries(
  37.7749,
  -122.4194,
  [4, 6, 8]  // admin levels: 4=state, 6=county, 8=city
);
```

#### Get Detailed Location Information

```typescript
import { getLocationDetails } from '../lib/overpass-api';

const details = await getLocationDetails(
  37.7749,
  -122.4194,
  50  // radius in meters
);
// Returns: { address?, boundaries?, nearbyPOIs? }
```

### Custom Queries

For custom Overpass QL queries:

```typescript
import { queryOverpass } from '../lib/overpass-api';

const query = `
  node["amenity"="restaurant"](around:500,37.7749,-122.4194);
  out center meta;
`;

const response = await queryOverpass(query);
```

## Scripts

### Test the Integration

Test the Overpass API integration with example queries:

```bash
npx tsx scripts/test-overpass-api.ts
```

### Enrich Buffet Data

Enrich all buffets with Overpass API location data:

```bash
# Enrich all buffets
npx tsx scripts/enrich-with-overpass.ts all

# Enrich with custom parameters
npx tsx scripts/enrich-with-overpass.ts all \
  data/buffets-by-id.json \
  data/buffets-by-id-enriched-overpass.json \
  10 \    # batch size
  1000    # delay in ms between batches
```

Enrich a single buffet:

```bash
npx tsx scripts/enrich-with-overpass.ts single <buffet-id>
```

## Data Structure

When enriching buffet data, the following structure is added:

```typescript
interface OverpassEnrichment {
  neighborhood?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  administrativeBoundaries?: Array<{
    name?: string;
    adminLevel: number;
    type: string;
  }>;
  nearbyPOIs?: Array<{
    name?: string;
    category?: string;
    distance: number; // in meters
  }>;
  enrichedAt: string;
}
```

## Rate Limiting

The Overpass API has rate limits. The scripts include:
- Batch processing with delays between batches
- Error handling for rate limit errors
- Configurable delay times

**Recommended settings:**
- Batch size: 10-20 buffets
- Delay: 1000-2000ms between batches

## API Endpoints

By default, the integration uses `https://overpass-api.de/api/interpreter`. You can specify a different endpoint:

```typescript
import { queryOverpass } from '../lib/overpass-api';

const response = await queryOverpass(
  query,
  'https://your-overpass-instance.com/api/interpreter',
  25  // timeout in seconds
);
```

## Error Handling

All functions throw errors that should be caught:

```typescript
try {
  const info = await getNeighborhoodInfo(lat, lon);
} catch (error) {
  console.error('Overpass API error:', error);
  // Handle error appropriately
}
```

## Use Cases

1. **Enrich Neighborhood Data**: Fill in missing neighborhood information for buffets
2. **Find Nearby Competitors**: Identify other restaurants near each buffet
3. **Administrative Boundaries**: Get accurate city, county, and state information
4. **Location Validation**: Verify and correct location data
5. **POI Discovery**: Find nearby amenities, parks, and points of interest

## Limitations

- Overpass API queries can be slow for large areas
- Some locations may not have complete OpenStreetMap data
- Rate limits apply - use delays between requests
- Administrative boundaries may vary by region

## References

- [Overpass API Documentation](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Overpass QL Language Guide](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [OpenStreetMap Wiki](https://wiki.openstreetmap.org/)






