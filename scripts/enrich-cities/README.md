# City SEO Enrichment

This directory contains scripts to enrich city data in the InstantDB database with SEO-optimized structured data for Phase 1 and Phase 2 of the city enrichment project.

## Overview

### Phase 1: Geographic & Restaurant Data

1. **MSA/Regional Data** - Metropolitan Statistical Area (MSA) and Combined Statistical Area (CSA) information
2. **ZIP Code Coverage** - ZIP code mappings for hyperlocal SEO
3. **Restaurant Density Metrics** - Restaurant counts and density calculations for dining scene context

### Phase 2: Content & Local Context

4. **Wikipedia Summaries** - Rich city descriptions and notable facts for SEO content
5. **Points of Interest (POIs)** - Nearby attractions, shopping centers, universities, and hotels

## Prerequisites

- Node.js installed
- `INSTANT_ADMIN_TOKEN` environment variable set (or in `.env.local`)
- InstantDB schema updated with Phase 1 fields (already done in `src/instant.schema.ts`)

## Usage

### Run All Enrichments (Phase 1 + Phase 2)

```bash
npm run enrich-cities:all
# or
node scripts/enrich-cities/index.js all
```

### Run Phase 1 Only

```bash
npm run enrich-cities:phase1
# or
node scripts/enrich-cities/index.js phase1
```

### Run Phase 2 Only

```bash
npm run enrich-cities:phase2
# or
node scripts/enrich-cities/index.js phase2
```

### Run Individual Enrichments

```bash
# Phase 1
npm run enrich-cities:msa
npm run enrich-cities:zip
npm run enrich-cities:restaurant

# Phase 2
npm run enrich-cities:wikipedia
npm run enrich-cities:poi
```

### Test with Limited Cities

```bash
# Test with 5 cities
node scripts/enrich-cities/index.js phase2 --limit 5

# Test Wikipedia enrichment only with 10 cities
node scripts/enrich-cities/index.js wikipedia --limit 10
```

## Scripts

### 1. MSA Enrichment (`msa-enrichment.js`)

**Purpose**: Adds Metropolitan Statistical Area (MSA) and Combined Statistical Area (CSA) data to cities.

**Data Source**: Static mapping based on US Census Bureau definitions (updated annually).

**Fields Added**:
- `msaName` - Full MSA name (e.g., "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area")
- `msaCode` - FIPS MSA code (e.g., "31080")
- `csaName` - Combined Statistical Area name (if applicable)

**Performance**: Fast - uses static mapping, no API calls required.

**Notes**: 
- Currently uses a hardcoded mapping of major US cities
- For production, consider loading from Census Bureau CSV or API
- Updates are rare (annually when Census releases new data)

### 2. ZIP Code Enrichment (`zip-code-enrichment.js`)

**Purpose**: Adds ZIP code coverage for each city.

**Data Source**: GeoNames API (free tier, no API key required for basic usage).

**Fields Added**:
- `zipCodes` - JSON array of all ZIP codes in the city
- `primaryZipCode` - Most common/primary ZIP code

**Performance**: Moderate - API calls with rate limiting (200ms between requests).

**Rate Limits**: 
- GeoNames free tier: 30,000 requests/day
- For better limits, register at http://www.geonames.org/login

**Fallback**: If GeoNames API fails, extracts ZIP codes from buffet postal codes in the database.

**Notes**:
- Uses "demo" username for GeoNames (limited rate)
- For production, register for a GeoNames account for better rate limits
- Fallback to buffet ZIP codes provides partial coverage

### 3. Restaurant Density Enrichment (`restaurant-density.js`)

**Purpose**: Adds restaurant counts and density metrics.

**Data Source**: OpenStreetMap Overpass API (free, no API key required).

**Fields Added**:
- `totalRestaurants` - Total restaurant count in city area
- `chineseRestaurants` - Chinese restaurant count
- `restaurantDensity` - Restaurants per 10,000 population
- `restaurantDistricts` - JSON array of restaurant district names (future enhancement)

**Performance**: Slow - API queries can take 5-10 seconds per city, with 1 second rate limiting.

**Rate Limits**:
- Overpass API: ~10,000 requests/day (unauthenticated)
- Recommended: 1 second delay between requests

**Search Radius**: 
- Large cities (>500k pop): 20km radius
- Medium cities (100k-500k pop): 15km radius
- Small cities (<100k pop): 10km radius

**Notes**:
- This is one of the slowest enrichments (can take hours for many cities)
- Consider running during off-peak hours
- Results depend on OpenStreetMap data completeness in your area

### 4. Wikipedia Enrichment (`wikipedia-enrichment.js`)

**Purpose**: Adds Wikipedia summaries and notable facts for rich SEO content.

**Data Source**: Wikipedia REST API (free, no API key required).

**Fields Added**:
- `wikipediaSummary` - First 2-3 sentences from Wikipedia page
- `wikipediaUrl` - URL to the Wikipedia page
- `notableFacts` - JSON array of notable facts (population, founding date, etc.)

**Performance**: Fast - ~100-200ms per city with 100ms rate limiting.

**Rate Limits**: 
- Wikipedia API: 200 requests/second (generous limits)
- Be respectful: 100ms delay between requests

**Notes**:
- Automatically handles city name disambiguation
- Falls back to different search patterns if first attempt fails
- Content must be attributed to Wikipedia (Creative Commons license)
- Some small cities may not have Wikipedia pages

### 5. Points of Interest Enrichment (`poi-enrichment.js`)

**Purpose**: Adds nearby attractions, shopping centers, universities, and hotels.

**Data Source**: OpenStreetMap Overpass API (free, no API key required).

**Fields Added**:
- `topAttractions` - JSON array: `[{name, category, distance}]` (top 10, sorted by distance)
- `shoppingCenters` - JSON array of shopping center/mall names
- `universities` - JSON array of university/college names
- `majorHotels` - JSON array of major hotel names (top 5)

**Performance**: Slow - 4-6 seconds per city (4 API calls per city) with 500ms delays.

**Rate Limits**:
- Overpass API: ~10,000 requests/day (unauthenticated)
- Recommended: 500ms delay between queries, 1 second between cities

**Search Radius**: 
- Large cities (>100k pop): 15km radius
- Medium cities (50k-100k pop): 10km radius
- Small cities (<50k pop): 8km radius

**Notes**:
- This is the slowest Phase 2 enrichment
- Makes 4 separate API calls per city (one per POI type)
- Results depend on OpenStreetMap data completeness
- Hotels filtered to only major ones (chains, resorts, inns)

## Schema Updates

### Phase 1 Fields

The following fields have been added to the `cities` entity in `src/instant.schema.ts`:

```typescript
// Phase 1 SEO enrichment fields
msaName: i.string().optional(), // Metropolitan Statistical Area name
msaCode: i.string().optional(), // MSA FIPS code
csaName: i.string().optional(), // Combined Statistical Area name
zipCodes: i.string().optional(), // JSON stringified array of ZIP codes
primaryZipCode: i.string().optional(), // Most common ZIP code in city
totalRestaurants: i.number().optional(), // Total restaurants in city (from OSM)
chineseRestaurants: i.number().optional(), // Chinese restaurants count (from OSM)
restaurantDensity: i.number().optional(), // Restaurants per 10,000 population
restaurantDistricts: i.string().optional(), // JSON array of restaurant district names

// Phase 2 SEO enrichment fields
wikipediaSummary: i.string().optional(), // First paragraph from Wikipedia
wikipediaUrl: i.string().optional(), // URL to Wikipedia page
notableFacts: i.string().optional(), // JSON array of notable facts about the city
topAttractions: i.string().optional(), // JSON array: [{name, category, distance}]
shoppingCenters: i.string().optional(), // JSON array of shopping center names
universities: i.string().optional(), // JSON array of university/college names
majorHotels: i.string().optional(), // JSON array of major hotel names
```

## Running Enrichments

### First Time Setup

1. Ensure schema is synced:
   ```bash
   npm run sync-schema
   ```

2. Verify environment variables are set:
   ```bash
   # Check .env.local has INSTANT_ADMIN_TOKEN
   ```

3. Run enrichments (recommended order):
   ```bash
   # Phase 1: Start with fast enrichments
   npm run enrich-cities:msa
   npm run enrich-cities:zip
   
   # Phase 1: Then run the slow one (restaurant density)
   npm run enrich-cities:restaurant
   
   # Phase 2: Run content enrichments
   npm run enrich-cities:wikipedia
   npm run enrich-cities:poi
   ```
   
   Or run all at once:
   ```bash
   npm run enrich-cities:all
   ```

### Re-running Enrichments

Scripts are idempotent - they skip cities that already have data:

**Phase 1:**
- MSA: Skips if `msaName` and `msaCode` exist
- ZIP: Skips if `zipCodes` exists
- Restaurant: Skips if `totalRestaurants` exists

**Phase 2:**
- Wikipedia: Skips if `wikipediaSummary` and `wikipediaUrl` exist
- POI: Skips if all POI fields exist (`topAttractions`, `shoppingCenters`, `universities`, `majorHotels`)

To re-enrich a city, manually clear the relevant fields in InstantDB, or modify the scripts to force updates.

## Troubleshooting

### GeoNames API Issues

**Problem**: "GeoNames API returned 403"

**Solution**: 
- Register for a free GeoNames account at http://www.geonames.org/login
- Update the script to use your username instead of "demo"
- Free accounts have better rate limits

### Overpass API Timeouts

**Problem**: "Overpass API timeout"

**Solution**:
- Reduce search radius in `restaurant-density.js`
- Increase timeout value in query (currently 25 seconds)
- Try a different Overpass API instance (see https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances)

### Missing City Coordinates

**Problem**: Cities skipped due to "No coordinates found"

**Solution**:
- Cities get coordinates from buffets
- Cities without buffets won't have coordinates
- You can manually add coordinates or skip these cities

## Data Stability

All data sources are stable and don't require frequent updates:

**Phase 1:**
- **MSA Data**: Updated annually (Census Bureau)
- **ZIP Codes**: Rarely change, update annually
- **Restaurant Density**: Changes slowly, update quarterly or annually

**Phase 2:**
- **Wikipedia Summaries**: Very stable, update annually or as needed
- **POIs**: Changes slowly, update annually

## Future Enhancements (Phase 3)

Potential future enrichments (not yet implemented):
- Demographics (income, age, education levels) - Data Commons API
- Climate data - Open-Meteo API
- Local events and festivals - Wikidata API

See `CITY_SEO_ENRICHMENT_RESEARCH.md` for full research and recommendations.

## Support

For issues or questions:
1. Check the main research document: `CITY_SEO_ENRICHMENT_RESEARCH.md`
2. Review API documentation for data sources
3. Check InstantDB logs for database errors
