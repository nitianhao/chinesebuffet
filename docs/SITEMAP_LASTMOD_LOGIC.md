# Sitemap Lastmod Logic

The sitemap `lastmod` timestamps are updated **only for meaningful content changes**, not cosmetic updates.

## Meaningful Content Changes

### 1. Review Changes
- **Trigger**: New or updated reviews
- **Source**: Most recent review `publishAt` or `publishedAtDate`
- **Logic**: Checks all reviews in `data.reviews` or `data.reviewRecords` and uses the most recent publish date

### 2. Rating Changes
- **Trigger**: Rating updates (when rating exists and is > 0)
- **Source**: Buffet `updatedAt` timestamp
- **Logic**: If rating is meaningful (> 0), assumes rating was updated and uses `updatedAt`

### 3. POI Changes
- **Trigger**: Nearby POI data added or updated
- **Source**: Buffet `updatedAt` timestamp
- **Logic**: If POI-related fields exist (poiRecords, overpassPOIs, accommodationLodging, etc.) and buffet was updated, uses `updatedAt`

## Cosmetic Changes (Excluded)

These changes do **NOT** update lastmod:
- Description updates
- Image changes
- Hours updates
- Contact info changes
- Price updates
- Category changes
- Other metadata updates

## Implementation

### Function: `getLastModified(data: any): Date`

**Process:**
1. Collect all meaningful change dates:
   - Most recent review publish date
   - `updatedAt` if rating is meaningful
   - `updatedAt` if POI data exists and was updated

2. If meaningful dates found:
   - Return the most recent meaningful date

3. If no meaningful dates:
   - Check if `updatedAt` exists and is recent (within 30 days)
   - If recent, use `updatedAt` (might be a meaningful change we didn't detect)
   - Otherwise, use current date (for new pages)

### Example

```typescript
// Buffet with recent review
const buffet = {
  id: '123',
  name: 'Golden Dragon',
  rating: 4.5,
  reviews: [
    { publishAt: '2024-01-15T10:00:00Z' },
    { publishAt: '2024-01-20T14:30:00Z' }, // Most recent
  ],
  updatedAt: '2024-01-18T09:00:00Z', // Cosmetic change
};

// getLastModified(buffet) returns: 2024-01-20T14:30:00Z (most recent review)
```

## Benefits

1. **Accurate Timestamps**: Search engines see updates only when content changes
2. **Better Crawling**: Search engines prioritize pages with actual content updates
3. **Crawl Budget**: Avoids unnecessary re-crawling for cosmetic changes
4. **SEO Optimization**: Signals to search engines that content is fresh

## Notes

- Review dates are checked from both `reviews` array and `reviewRecords` (linked relationship)
- Rating changes are detected heuristically (if rating exists and is > 0)
- POI changes are detected heuristically (if POI data exists and buffet was updated)
- Fallback to `updatedAt` only if recent (within 30 days) to avoid stale dates
- New pages without meaningful changes get current date
