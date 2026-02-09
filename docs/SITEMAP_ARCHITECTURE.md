# Sitemap Architecture

The sitemap is organized as a **sitemap index** that references separate sitemaps by page type. This structure ensures:

1. **Separation by page type** - Each page type has its own sitemap
2. **Only indexable pages** - All noindex pages are excluded by default
3. **Proper lastmod timestamps** - Each URL includes accurate last modified dates
4. **Sitemap index** - Main sitemap.xml is a sitemap index file

## Structure

```
/sitemap.xml (sitemap index)
├── /sitemap-home.xml (homepage)
├── /sitemap-states.xml (state pages)
├── /sitemap-cities.xml (city pages)
├── /sitemap-buffets.xml (buffet detail pages)
├── /sitemap-poi.xml (POI landing pages)
└── /sitemap-neighborhoods.xml (neighborhood pages)
```

## Sitemap Index

**File**: `app/sitemap.xml/route.ts`

Returns a sitemap index XML that references all separate sitemaps:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://yoursite.com/sitemap-home.xml</loc>
    <lastmod>2024-01-01T00:00:00.000Z</lastmod>
  </sitemap>
  ...
</sitemapindex>
```

## Separate Sitemaps by Page Type

### 1. Homepage Sitemap
**File**: `app/sitemap-home.xml/route.ts`
- **Page Type**: `home`
- **Index Tier**: `tier-1` (always indexable)
- **Change Frequency**: `daily`
- **Priority**: `1.0`
- **Lastmod**: Current date

### 2. State Pages Sitemap
**File**: `app/sitemap-states.xml/route.ts`
- **Page Type**: `state`
- **Index Tier**: `tier-1` (always indexable)
- **Change Frequency**: `weekly`
- **Priority**: `0.8`
- **Lastmod**: From state data (`updatedAt`, `lastModified`, or current date)

### 3. City Pages Sitemap
**File**: `app/sitemap-cities.xml/route.ts`
- **Page Type**: `city`
- **Index Tier**: `tier-1` (always indexable)
- **Change Frequency**: `weekly`
- **Priority**: `0.8`
- **Lastmod**: From city data (`updatedAt`, `lastModified`, or current date)

### 4. Buffet Pages Sitemap
**File**: `app/sitemap-buffets.xml/route.ts`
- **Page Type**: `buffet`
- **Index Tier**: `tier-2` (always indexable per rules)
- **Change Frequency**: `monthly`
- **Priority**: `0.6`
- **Lastmod**: From buffet data (`updatedAt`, `lastModified`, or current date)
- **Note**: All buffet pages are included (enforced by buffet indexing rules)

### 5. POI Pages Sitemap
**File**: `app/sitemap-poi.xml/route.ts`
- **Page Type**: `poi`
- **Index Tier**: `tier-2` (conditional indexing)
- **Change Frequency**: `weekly`
- **Priority**: `0.7`
- **Lastmod**: Current date (POI pages don't have individual timestamps)
- **Note**: Only includes indexable POI pages (excludes noindex based on quality assessment)

### 6. Neighborhood Pages Sitemap
**File**: `app/sitemap-neighborhoods.xml/route.ts`
- **Page Type**: `neighborhood`
- **Index Tier**: `tier-3` (conditional indexing)
- **Change Frequency**: `monthly`
- **Priority**: `0.5`
- **Lastmod**: From neighborhood data (`updatedAt`, `lastModified`, or current date)
- **Note**: Only includes neighborhoods with buffets (excludes noindex pages)

## Noindex Exclusion

All sitemaps automatically exclude noindex pages:

1. **`createSitemapEntry()`** checks if page is indexable
2. Returns `null` if page is noindex
3. **`filterIndexableEntries()`** filters out null entries
4. Only indexable pages are included in final sitemap

**Exclusion happens at:**
- Page type level (tier-4, noindex tier)
- Conditional indexing level (POI quality checks, neighborhood content checks)
- Custom indexable flags

## Lastmod Timestamps

Last modified dates are determined by **meaningful content changes only**:

### Meaningful Changes (Updates lastmod):
1. **Review changes**: Most recent review `publishAt` or `publishedAtDate`
2. **Rating changes**: When rating exists and is meaningful (> 0), uses `updatedAt`
3. **POI changes**: When POI data exists and buffet was updated, uses `updatedAt`

### Cosmetic Changes (Does NOT update lastmod):
- Description updates
- Image changes
- Hours updates
- Contact info changes
- Other non-content metadata

### Fallback Logic:
1. If meaningful changes found → Use most recent meaningful change date
2. If no meaningful changes but `updatedAt` exists and is recent (within 30 days) → Use `updatedAt`
3. Otherwise → Use current date (for new pages)

**Implementation**: `lib/sitemap-utils.ts` → `getLastModified()`

**Note**: This ensures search engines only see updated lastmod when actual content (reviews, ratings, POIs) changes, not for cosmetic updates.

## XML Format

Each sitemap returns proper XML format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yoursite.com/chinese-buffets/los-angeles-ca</loc>
    <lastmod>2024-01-01T00:00:00.000Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  ...
</urlset>
```

## Robots.txt Integration

**File**: `app/robots.ts`

References the sitemap index:

```typescript
sitemap: `${baseUrl}/sitemap.xml`
```

## Files

- **Sitemap Index**: `app/sitemap.xml/route.ts`
- **Homepage**: `app/sitemap-home.xml/route.ts`
- **States**: `app/sitemap-states.xml/route.ts`
- **Cities**: `app/sitemap-cities.xml/route.ts`
- **Buffets**: `app/sitemap-buffets.xml/route.ts`
- **POI**: `app/sitemap-poi.xml/route.ts`
- **Neighborhoods**: `app/sitemap-neighborhoods.xml/route.ts`
- **Utilities**: `lib/sitemap-utils.ts`

## Benefits

1. **Organized Structure**: Easy to identify which pages are in which sitemap
2. **Efficient Crawling**: Search engines can prioritize by page type
3. **Noindex Exclusion**: Automatic filtering prevents indexing of excluded pages
4. **Accurate Timestamps**: Proper lastmod helps search engines prioritize updates
5. **Scalability**: Separate sitemaps prevent single large file issues
6. **Maintainability**: Each page type can be updated independently

## Notes

- All sitemaps are generated at build time
- Noindex pages are excluded automatically
- Lastmod timestamps are accurate when data is available
- Sitemap index is properly formatted for search engines
- Each sitemap can contain up to 50,000 URLs (recommended limit)
