# Near-Duplicate Detection System

Automatically detects near-duplicate pages and applies canonical tags or noindex directives to prevent duplicate content issues.

## Detection Signals

### 1. Similar Headings
- Compares H1 headings using text similarity
- Weighted comparison: H1 similarity (50%) + average heading similarity (50%)
- Uses Jaccard similarity (word-based) for comparison

### 2. Similar Intro Text
- Compares introductory paragraph text
- Normalizes text (lowercase, removes extra whitespace)
- Calculates word-based similarity

### 3. Same Buffet Set
- Compares buffet IDs between pages
- Calculates overlap percentage (intersection / union)
- High overlap indicates duplicate content

## Risk Levels

| Level | Criteria | Action |
|-------|----------|--------|
| **Exact** | Similarity ≥ 0.95, Heading ≥ 0.9, Buffet Overlap ≥ 0.9 | Canonical |
| **High** | Similarity ≥ 0.8 OR (Heading ≥ 0.8 AND Buffet Overlap ≥ 0.7) | Canonical or Noindex |
| **Medium** | Similarity ≥ 0.6 OR Heading ≥ 0.7 OR Buffet Overlap ≥ 0.6 | Canonical |
| **Low** | Below medium thresholds | None |

## Actions

### Canonical
- Sets canonical URL to the more specific page
- Specificity order: Buffet > City > Neighborhood > State/POI
- If same specificity, prefers shorter/alphabetical path

### Noindex
- Applied when:
  - High risk AND same page type
  - Exact duplicate (if less specific page)
- Still uses `follow` directive to allow link discovery

### None
- No action taken for low-risk duplicates
- Pages indexed normally

## Implementation

### Page Signature
Each page creates a signature with:
- Page type
- Page path
- Headings (H1, H2, etc.)
- Intro text
- Buffet IDs

### Detection Flow
1. Page generates signature during metadata generation
2. Signature registered in build-time store
3. Compared against all other registered signatures
4. Duplicate detection result determines action
5. Canonical or noindex applied to metadata

### Similarity Calculation
- **Heading Similarity**: Weighted average of H1 and all headings
- **Intro Similarity**: Jaccard similarity of word sets
- **Buffet Overlap**: Intersection / Union of buffet ID sets
- **Overall Score**: Weighted average (30% headings, 30% intro, 40% buffets)

## Logging

### Development Mode
Detailed logs with:
- Page path and type
- Risk level
- Action taken
- Matching pages with similarity scores
- Signal breakdown (heading, intro, buffet overlap)

### Production Mode
Warning logs with:
- Action (CANONICAL/NOINDEX)
- Risk level
- Number of matches
- Reason

### Example Log
```
[Duplicate Detection] /chinese-buffets/los-angeles-ca:
{
  riskLevel: "high",
  action: "canonical",
  matches: [{
    pagePath: "/chinese-buffets/states/ca",
    similarityScore: 0.85,
    matchingSignals: {
      headingSimilarity: 0.9,
      introSimilarity: 0.8,
      buffetOverlap: 0.85
    }
  }]
}
```

## Page Types Supported

- ✅ City pages (`/chinese-buffets/[city-state]`)
- ✅ State pages (`/chinese-buffets/states/[state]`)
- ✅ POI pages (`/chinese-buffets/near/[poi-type]`)
- ✅ Neighborhood pages (`/chinese-buffets/[city-state]/neighborhoods/[neighborhood]`)

## Files

- **Detection Logic**: `lib/duplicate-detection.ts`
- **Signature Store**: `lib/page-signature-store.ts`
- **City Pages**: `app/chinese-buffets/[city-state]/page.tsx`
- **State Pages**: `app/chinese-buffets/states/[state]/page.tsx`
- **POI Pages**: `app/chinese-buffets/near/[poi-type]/page.tsx`
- **Neighborhood Pages**: `app/chinese-buffets/[city-state]/neighborhoods/[neighborhood]/page.tsx`

## Notes

- Detection runs during build-time metadata generation
- Signatures are stored in-memory during build
- Canonical URLs point to more specific pages
- Noindex is applied conservatively (only high-risk, same-type duplicates)
- All actions are logged for monitoring and optimization
