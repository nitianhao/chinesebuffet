# Crawl Hub Strategy

City and state pages serve as **crawl hubs** - central pages that link to all content in their scope, ensuring search engines can discover all buffet pages efficiently.

## Requirements

### 1. Linked from Main Navigation or Sitemap Index

**State Pages:**
- ✅ Linked from homepage via `StatesSection` component
- ✅ Included in sitemap with priority 0.8
- ✅ Accessible in 1 click from homepage

**City Pages:**
- ✅ Linked from state pages (which are linked from homepage)
- ✅ Included in sitemap with priority 0.8
- ✅ Accessible in 2 clicks from homepage

### 2. Link to ALL Buffet Pages in Scope

**City Pages:**
- Must link to **ALL** buffets in the city
- Currently shows all buffets in "All Chinese Buffets" section
- Uses `BuffetCard` component which links to each buffet page
- No pagination currently (all buffets shown on single page)

**State Pages:**
- Must link to **ALL** buffets in the state
- Currently shows all buffets in "All Chinese Buffets" section
- Also links to cities, which link to their buffets (dual linking strategy)
- No pagination currently (all buffets shown on single page)

### 3. Fresh Internal Links When New Buffets Added

**Automatic Updates:**
- City pages fetch buffets from database: `getCityBySlug()`
- State pages fetch buffets from database: `getStateByAbbr()`
- When new buffets are added to database, they automatically appear on hub pages
- Sitemap regenerates on each build, including new buffet pages

**Change Frequency:**
- Sitemap marks city/state pages with `changeFrequency: 'weekly'`
- Pages are regenerated on each build, ensuring fresh links

## Implementation

### City Pages (`app/chinese-buffets/[city-state]/page.tsx`)

```typescript
// Fetches all buffets for the city
const city = await getCityBySlug(params['city-state']);

// Shows ALL buffets in "All Buffets Section"
{sortedBuffets.map((buffet) => (
  <BuffetCard
    key={buffet.id}
    buffet={buffet}
    citySlug={params['city-state']}
  />
))}
```

**Validation:**
- Validates that all buffets are linked via `validateCityHub()`
- Logs warnings in development if buffets are missing

### State Pages (`app/chinese-buffets/states/[state]/page.tsx`)

```typescript
// Fetches all buffets for the state
const stateData = await getStateByAbbr(params.state.toUpperCase());

// Shows ALL buffets in "All Buffets Section"
{sortedBuffets.map((buffet: any) => (
  <BuffetCard
    key={buffet.id}
    buffet={buffet}
    citySlug={buffet.citySlug || ''}
  />
))}
```

**Validation:**
- Validates that all buffets are linked via `validateStateHub()`
- Logs warnings in development if buffets are missing

### Sitemap (`app/sitemap.xml/route.ts`)

```typescript
// State pages - Crawl Hubs
routes.push({
  url: `${baseUrl}/chinese-buffets/states/${stateAbbr.toLowerCase()}`,
  priority: 0.8, // High priority as crawl hubs
  changeFrequency: 'weekly',
});

// City pages - Crawl Hubs
routes.push({
  url: `${baseUrl}/chinese-buffets/${slug}`,
  priority: 0.8, // High priority as crawl hubs
  changeFrequency: 'weekly',
});
```

## Pagination (Future Enhancement)

Currently, all buffets are shown on a single page. For cities/states with many buffets (>50), pagination can be added:

```typescript
const ITEMS_PER_PAGE = 50;
const shouldPaginate = needsPagination(buffetCount, ITEMS_PER_PAGE);

if (shouldPaginate) {
  // Implement pagination
  // Ensure all pages are linked from sitemap
  // Ensure all buffets are accessible via pagination
}
```

**Pagination Requirements:**
- All paginated pages must be in sitemap
- All buffets must be accessible via pagination
- Pagination links must be crawlable (not JavaScript-only)

## Validation

### Automated Checks

Run validation to ensure crawl hub rules are followed:

```bash
npm run validate-crawl-hubs
```

**Checks:**
1. City/state pages are linked from homepage or sitemap
2. All buffets in scope are linked from hub pages
3. Buffet counts match between database and displayed pages

### Build-Time Validation

In development mode, pages validate themselves:
- Logs warnings if buffets are missing
- Validates crawl hub structure
- Ensures all buffets are accessible

## Benefits

1. **Efficient Crawling**: Search engines can discover all content from hub pages
2. **Fresh Links**: New buffets automatically appear on hub pages
3. **Clear Structure**: Hierarchical linking (Home → State → City → Buffet)
4. **No Orphan Pages**: All buffet pages are linked from hubs
5. **High Priority**: Hub pages have priority 0.8 in sitemap

## Files

- **Validation**: `lib/crawl-hub-validation.ts`
- **Validation Script**: `scripts/validate-crawl-hubs.ts`
- **City Pages**: `app/chinese-buffets/[city-state]/page.tsx`
- **State Pages**: `app/chinese-buffets/states/[state]/page.tsx`
- **Sitemap Index**: `app/sitemap.xml/route.ts`
- **City Sitemap**: `app/sitemap-cities.xml/route.ts`
- **State Sitemap**: `app/sitemap-states.xml/route.ts`
- **Homepage**: `app/page.tsx` (StatesSection component)

## Notes

- Hub pages show ALL buffets on a single page (no pagination currently)
- BuffetCard component ensures all buffets are properly linked
- Sitemap includes all hub pages with high priority
- Validation ensures compliance with crawl hub rules
