# Buffet Detail Page Indexing Rules

All buffet detail pages must comply with the following indexing rules to ensure proper SEO and search engine indexing.

## Required Rules

### 1. index, follow (Always)
- **Requirement**: All buffet pages must have `robots: { index: true, follow: true }`
- **Enforcement**: Enforced at build time via `enforceBuffetIndexingRules()`
- **Override**: Page quality checks do NOT override this - buffet pages ALWAYS index

### 2. Self-Referencing Canonical URL
- **Requirement**: Canonical URL must match the page's own URL exactly
- **Format**: `{baseUrl}/chinese-buffets/{city-slug}/{buffet-slug}`
- **Enforcement**: Validated in `validateBuffetIndexing()`
- **Example**: 
  - Page: `/chinese-buffets/los-angeles-ca/golden-buffet`
  - Canonical: `https://yoursite.com/chinese-buffets/los-angeles-ca/golden-buffet`

### 3. Included in Primary XML Sitemap
- **Requirement**: All buffet pages must be included in `/sitemap-buffets.xml` (referenced by sitemap index)
- **Priority**: 0.6
- **Change Frequency**: monthly
- **Enforcement**: Validated via `checkBuffetSitemapInclusion()`
- **Location**: `app/sitemap-buffets.xml/route.ts` - automatically includes all buffets from city data

### 4. Linked from City and State Pages
- **Requirement**: Buffet pages must be linked from:
  - City page (`/chinese-buffets/{city-slug}`)
  - State page (`/chinese-buffets/states/{state}`) - when buffet appears in state listings
- **Implementation**: Uses `BuffetCard` component which automatically links to buffet pages
- **Enforcement**: Validated via `verifyBuffetLinkedFromPages()`

## Implementation

### Metadata Generation
Buffet pages use `generateMetadata()` which:
1. Creates metadata with enforced `index: true, follow: true`
2. Sets self-referencing canonical URL
3. Validates rules via `enforceBuffetIndexingRules()`

```typescript
// app/chinese-buffets/[city-state]/[slug]/page.tsx
const metadata = {
  robots: {
    index: true,  // Always true for buffet pages
    follow: true, // Always true for buffet pages
  },
  alternates: {
    canonical: canonicalUrl, // Self-referencing
  },
};

// Enforce rules - throws error if validation fails
enforceBuffetIndexingRules(metadata, pagePath, baseUrl);
```

### Sitemap Inclusion
Sitemap automatically includes all buffet pages:
```typescript
// app/sitemap-buffets.xml/route.ts
for (const buffet of city.buffets) {
  routes.push({
    url: `${baseUrl}/chinese-buffets/${slug}/${buffet.slug}`,
    priority: 0.6,
    changeFrequency: 'monthly',
  });
}
```

### Linking from City/State Pages
City and state pages use `BuffetCard` component which links to buffet pages:
```typescript
// components/BuffetCard.tsx
<Link href={`/chinese-buffets/${citySlug}/${buffet.slug}`}>
  {buffet.name}
</Link>
```

## Validation

### Build-Time Validation
Run validation scripts to ensure compliance:

```bash
# Validate all buffet indexing rules
npm run validate-buffet-indexing

# Check sitemap inclusion
npm run check-buffet-sitemap
```

### Automated Checks
- **Build-time**: `enforceBuffetIndexingRules()` throws error if rules violated
- **Pre-deployment**: Run validation scripts in CI/CD pipeline
- **Development**: Validation runs in development mode with detailed logging

## Error Handling

If validation fails, the build will fail with clear error messages:

```
[Buffet Indexing Rules Violation] 
- Buffet page must have index=true, follow=true
- Buffet page canonical must be self-referencing
```

## Files

- **Validation**: `lib/buffet-indexing-rules.ts`
- **Validation Script**: `scripts/validate-buffet-indexing.ts`
- **Sitemap Check**: `scripts/check-buffet-sitemap.ts`
- **Implementation**: `app/chinese-buffets/[city-state]/[slug]/page.tsx`
- **Sitemap Index**: `app/sitemap.xml/route.ts`
- **Buffet Sitemap**: `app/sitemap-buffets.xml/route.ts`

## Notes

- Page quality checks (`computeBuffetPageQuality`) are used for logging/debugging but do NOT affect indexing
- All buffet pages index regardless of quality score
- Canonical URLs must exactly match the page path (no query params, trailing slashes, etc.)
- Sitemap includes all buffets from all cities automatically
