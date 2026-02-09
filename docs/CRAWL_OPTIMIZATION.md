# Crawl Path Optimization

This document describes the crawl path optimization strategy for the Chinese Buffets directory site.

## Goals

1. **Maximum Depth ≤ 3 Clicks**: All key pages accessible from homepage in 3 clicks or less
2. **Clean, Consistent URLs**: Standardized URL format across all pages
3. **No Orphan Pages**: All pages have incoming links from parent pages or homepage

## Site Structure

### Current Hierarchy

```
Level 0: / (Homepage)
├─ Level 1: /chinese-buffets/states/[state] (State pages)
│  └─ Level 2: /chinese-buffets/[city-state] (City pages)
│     └─ Level 3: /chinese-buffets/[city-state]/[slug] (Buffet pages)
│        └─ Level 4: /chinese-buffets/[city-state]/neighborhoods/[neighborhood] (Neighborhood pages)
│
└─ Level 1: /chinese-buffets/near/[poi-type] (POI landing pages)
   └─ Links to relevant buffet pages
```

### Depth Analysis

- **Homepage**: Depth 0 ✅
- **State Pages**: Depth 1 ✅ (linked from homepage via StatesSection)
- **POI Pages**: Depth 1 ✅ (linked from homepage)
- **City Pages**: Depth 2 ✅ (linked from state pages)
- **Buffet Pages**: Depth 3 ✅ (linked from city pages)
- **Neighborhood Pages**: Depth 4 ⚠️ (linked from city pages, but still 4 clicks from homepage)

## Optimizations Implemented

### 1. Homepage Enhancements

**Added:**
- `StatesSection` component - Links to all state pages (depth 1)
- POI landing page links - Direct links to parking, shopping, highways, gas stations (depth 1)

**Result:** State and POI pages are now directly accessible from homepage, reducing their effective depth.

### 2. URL Consistency Fixes

**Fixed:**
- State page links in city pages now use correct format: `/chinese-buffets/states/[stateAbbr]`
- Previously used incorrect format: `/chinese-buffets/${city.state.toLowerCase().replace(/\s+/g, '-')}`

**Standard URL Format:**
- Homepage: `/`
- States: `/chinese-buffets/states/[state-abbr]` (lowercase, hyphenated)
- Cities: `/chinese-buffets/[city-state-slug]`
- Buffets: `/chinese-buffets/[city-state-slug]/[buffet-slug]`
- Neighborhoods: `/chinese-buffets/[city-state-slug]/neighborhoods/[neighborhood-slug]`
- POI Pages: `/chinese-buffets/near/[poi-type]`

### 3. Internal Linking Strategy

**Breadcrumbs:**
- All pages include breadcrumb navigation
- Links back to parent pages (city → state → home)

**Hub Links:**
- Buffet detail pages link back to city and state hubs
- CityStateHubLinks component provides prominent navigation

**Cross-linking:**
- Buffet pages link to other buffets in same city/road/radius
- InternalLinkingBlocks component ensures discoverability

### 4. Neighborhood Pages

**Current Status:**
- Neighborhood pages are at depth 4 (Home → State → City → Neighborhood)
- They are linked from city pages, making them discoverable
- Considered acceptable as they're secondary content

**Future Optimization:**
- Could add direct neighborhood links from state pages (would reduce to depth 3)
- Or add neighborhood index to homepage (would reduce to depth 2)

## Crawl Map Generation

### Scripts

1. **`npm run analyze-crawl`** - Analyzes crawl paths, identifies orphans and violations
2. **`npm run crawl-map`** - Generates visual crawl map visualization

### Output Files

- `crawl-analysis-report.txt` - Detailed analysis with statistics
- `crawl-map.txt` - Visual representation of site structure

## Verification Checklist

- [x] Homepage links to all state pages
- [x] Homepage links to all POI pages
- [x] State pages link to city pages
- [x] City pages link to buffet pages
- [x] City pages link to neighborhood pages
- [x] Buffet pages link back to city/state hubs
- [x] All URLs use consistent format
- [x] No trailing slashes (except homepage)
- [x] No double slashes in paths
- [x] Breadcrumbs on all pages

## Sample Crawl Paths

### Path 1: Home → State → City → Buffet (3 clicks)
```
/ → /chinese-buffets/states/ca → /chinese-buffets/los-angeles-ca → /chinese-buffets/los-angeles-ca/china-buffet
```

### Path 2: Home → POI → Buffet (2 clicks)
```
/ → /chinese-buffets/near/parking → [buffet links on page]
```

### Path 3: Home → City → Buffet (2 clicks)
```
/ → /chinese-buffets/new-york-ny → /chinese-buffets/new-york-ny/china-buffet
```

### Path 4: Home → State → City → Neighborhood (4 clicks)
```
/ → /chinese-buffets/states/ca → /chinese-buffets/los-angeles-ca → /chinese-buffets/los-angeles-ca/neighborhoods/downtown
```
⚠️ This is the only path exceeding 3 clicks, but neighborhoods are secondary content.

## Monitoring

Run crawl analysis regularly:
```bash
npm run analyze-crawl
npm run crawl-map
```

Check for:
- New orphan pages
- Depth violations
- URL inconsistencies
- Broken internal links

## Best Practices

1. **Always link back to parent pages** - Use breadcrumbs and hub links
2. **Use consistent URL format** - Follow the standard patterns
3. **Test new pages** - Ensure they're linked from appropriate parent pages
4. **Monitor depth** - Keep key pages at ≤3 clicks from homepage
5. **Update sitemap** - Ensure sitemap.ts includes all new pages
