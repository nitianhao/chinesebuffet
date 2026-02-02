# Crawl Depth Analysis

Automated system to ensure all indexable pages are reachable within 3 clicks from:
- Homepage
- City pages
- Sitemap

## Requirements

All indexable pages must be reachable within **3 clicks** from:
1. **Homepage** (`/`)
2. **City pages** (any city page)
3. **Sitemap** (direct access, always 0 clicks)

## Current Structure

### From Homepage
- **Depth 0**: Homepage (`/`)
- **Depth 1**: State pages, POI pages
- **Depth 2**: City pages (via state pages)
- **Depth 3**: Buffet pages (via city pages)
- **Depth 4**: Neighborhood pages (via city pages) ⚠️

### From City Pages
- **Depth 0**: City page itself
- **Depth 1**: Buffet pages (direct links)
- **Depth 2**: Neighborhood pages (via city page)

### From Sitemap
- **Depth 0**: All pages (direct access via sitemap)

## Analysis System

### Library: `lib/crawl-depth-analysis.ts`

**Functions:**
- `buildPageGraph()` - Builds graph of all pages and their links
- `calculateCrawlDepths()` - Calculates shortest paths from all sources
- `generateCrawlDepthReport()` - Generates comprehensive report

**Features:**
- BFS (Breadth-First Search) for shortest path calculation
- Tracks links from homepage, city pages, and sitemap
- Identifies violations (>3 clicks)
- Detects unreachable pages

### Report Script: `scripts/generate-crawl-depth-report.ts`

**Usage:**
```bash
npm run crawl-depth-report
```

**Output:**
- Total pages analyzed
- Depth distribution (how many pages at each depth)
- Violations (>3 clicks from any source)
- Unreachable pages
- Shortest paths for violations

**Exit Codes:**
- `0` - No violations found
- `1` - Violations found

## Report Format

```
================================================================================
CRAWL DEPTH ANALYSIS REPORT
================================================================================

Total Pages: 1234
Homepage Violations (>3 clicks): 0
City Pages Violations (>3 clicks): 0
Sitemap Violations (>3 clicks): 0
Unreachable Pages: 0

DEPTH DISTRIBUTION
--------------------------------------------------------------------------------

From Homepage:
  0 clicks: 1 pages
  1 clicks: 54 pages
  2 clicks: 234 pages
  3 clicks: 945 pages

From City Pages:
  0 clicks: 234 pages
  1 clicks: 945 pages
  2 clicks: 55 pages

From Sitemap:
  0 clicks: 1234 pages

✅ ALL PAGES ARE REACHABLE WITHIN 3 CLICKS
```

## Violations

### Homepage Violations
Pages that require more than 3 clicks from homepage.

**Common Causes:**
- Missing links from homepage to state/POI pages
- Missing links from state pages to city pages
- Missing links from city pages to buffet pages

### City Pages Violations
Pages that require more than 3 clicks from any city page.

**Common Causes:**
- Missing links from city pages to buffet pages
- Missing links from city pages to neighborhood pages

### Sitemap Violations
Pages that require more than 3 clicks from sitemap (should never happen).

**Note:** Sitemap provides direct access (0 clicks), so violations here indicate a bug.

## Fixing Violations

### 1. Add Missing Links
- Ensure homepage links to all state pages (via `StatesSection`)
- Ensure homepage links to all POI pages
- Ensure state pages link to all city pages
- Ensure city pages link to all buffet pages

### 2. Optimize Paths
- Add direct links where possible
- Use hub pages (city/state pages) to reduce depth
- Consider adding links from homepage to popular city pages

### 3. Verify Sitemap
- Ensure all indexable pages are in sitemap
- Verify sitemap index includes all page type sitemaps

## Integration

### Build-Time Validation
Add to CI/CD pipeline:
```json
{
  "scripts": {
    "prebuild": "npm run crawl-depth-report"
  }
}
```

### Pre-Commit Hook
Validate before commits:
```bash
npm run crawl-depth-report
```

## Files

- **Analysis Library**: `lib/crawl-depth-analysis.ts`
- **Report Script**: `scripts/generate-crawl-depth-report.ts`
- **NPM Script**: `npm run crawl-depth-report`
- **Report Output**: `crawl-depth-report.txt`

## Notes

- Only analyzes **indexable pages** (excludes noindex pages)
- Uses BFS for accurate shortest path calculation
- Handles conditional indexing (POI pages, neighborhood pages)
- Reports include shortest paths for debugging
- Unreachable pages are flagged separately
