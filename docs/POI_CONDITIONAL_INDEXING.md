# POI Page Conditional Indexing

POI-based landing pages (e.g., `/chinese-buffets/near/parking`) use conditional indexing based on content quality and buffet count.

## Indexing Rules

### Rule 1: Buffet Count Threshold
- **Threshold**: Minimum 5 buffets
- **Action**: If buffet count < 5 → `noindex, follow`
- **Reason Code**: `BUFFET_COUNT_LOW` or `NO_BUFFETS` (if count is 0)

### Rule 2: Content Length Threshold
- **Threshold**: Minimum 200 characters
- **Action**: If content length < 200 → `noindex`
- **Reason Code**: `CONTENT_LENGTH_LOW`
- **Content includes**: Title + Description + Meta Description + Additional Content

### Rule 3: Intent Clarity
- **Requirement**: 
  - Title must be specific (≥4 words, includes "Chinese Buffets" or "Buffets")
  - Description must be informative (≥50 characters)
  - Meta description must be informative (≥50 characters)
- **Action**: If intent is unclear → `noindex`
- **Reason Code**: `INTENT_UNCLEAR`

## Implementation

### Quality Assessment
The `assessPOIPageQuality()` function evaluates all three rules:

```typescript
const qualityResult = assessPOIPageQuality(
  poiType,
  buffetCount,
  title,
  description,
  metaDescription,
  additionalContent,
  5,   // Buffet count threshold
  200  // Content length threshold
);
```

### Conditional Indexing
POI pages use conditional indexing based on quality assessment:

```typescript
const indexTierConfig = createIndexTierConfig(
  PAGE_TYPE,
  INDEX_TIER,
  qualityResult.indexable, // Conditional: true if all checks pass
  pagePath
);
```

**Result:**
- If `indexable: true` → `index, follow`
- If `indexable: false` → `noindex, follow` (always follows links)

## Exclusion Logging

All excluded pages are logged with reason codes:

### Development Mode
- Logs to console with detailed information
- Includes metrics, thresholds, and reason codes

### Production Mode
- Logs warnings with reason codes
- Can be captured by logging services

### Log Format
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "pageType": "POI",
  "poiType": "parking",
  "pagePath": "/chinese-buffets/near/parking",
  "exclusionReason": "BUFFET_COUNT_LOW",
  "reasonCode": "BUFFET_COUNT_LOW:3<5",
  "metrics": {
    "buffetCount": 3,
    "contentLength": 250,
    "intentClear": true
  },
  "thresholds": {
    "buffetCountThreshold": 5,
    "contentLengthThreshold": 200,
    "hasClearIntent": true
  }
}
```

## Exclusion Reason Codes

| Code | Description | Example |
|------|-------------|---------|
| `BUFFET_COUNT_LOW` | Buffet count below threshold | `BUFFET_COUNT_LOW:3<5` |
| `NO_BUFFETS` | No buffets found | `NO_BUFFETS:0<5` |
| `CONTENT_LENGTH_LOW` | Content length below threshold | `CONTENT_LENGTH_LOW:150<200` |
| `INTENT_UNCLEAR` | Intent is unclear | `INTENT_UNCLEAR:title_or_description_too_generic` |
| `INDEXABLE:all_checks_passed` | Page is indexable | All checks passed |

## Audit Script

Run the audit script to see all POI page exclusions:

```bash
npm run audit-poi-exclusions
```

**Output:**
- Total POI pages
- Number of indexable vs excluded pages
- Breakdown by exclusion reason
- Detailed report for each excluded page

## Thresholds

Current thresholds (configurable):

- **Buffet Count**: 5 minimum
- **Content Length**: 200 characters minimum
- **Intent Clarity**: 
  - Title: ≥4 words, includes "Chinese Buffets" or "Buffets"
  - Description: ≥50 characters
  - Meta Description: ≥50 characters

## Files

- **Quality Assessment**: `lib/poi-page-quality.ts`
- **Implementation**: `app/chinese-buffets/near/[poi-type]/page.tsx`
- **Audit Script**: `scripts/audit-poi-exclusions.ts`

## Notes

- Excluded pages still use `follow` directive to allow link discovery
- Quality assessment runs during metadata generation (build time)
- Logs are available in development and production
- Thresholds can be adjusted based on data quality and SEO strategy
