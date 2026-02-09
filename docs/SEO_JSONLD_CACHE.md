# SEO JSON-LD Schema Cache

## Overview

JSON-LD schema generation for buffet detail pages is cached via Next.js `unstable_cache` to reduce render cost. Schema is built once per buffet and cached for 24 hours.

## Cached Helper

**File:** `lib/seo-jsonld-cached.ts`

- **Function:** `getCachedSeoSchemas(cityState, slug)`
- **Cache key:** `seo-jsonld-{cityState}-{slug}`
- **Revalidation:** 24 hours (`revalidate: 86400`)
- **Tags:** `seo-jsonld-{cityState}-{slug}`, `seo-jsonld`

## Schema Caps (Prevents Bloat)

| Schema | Cap | Rationale |
|--------|-----|-----------|
| **Reviews** | 10 | Google recommends up to 10 reviews in Restaurant schema |
| **FAQ** | 10 | Prevents huge mainEntity arrays; 10 Q&As sufficient for rich results |
| **POIs (Place)** | 5 | Top 5 nearest per category; on-page HTML unchanged |

## Validation Notes

- **Restaurant:** Requires `@context`, `@type`, `name`. Validated in dev.
- **FAQPage:** Requires `mainEntity` with at least 3 valid Q&As. Each Question needs `name` and `acceptedAnswer.text`.
- **BreadcrumbList:** Requires `itemListElement` with `name` and `item` (URL).
- **Place:** Requires `name`; recommends `geo` or `address`. Skipped if neither present.

All schemas use `validateJsonLd()` in development. Invalid data is omitted rather than included with placeholders.

## On-Demand Invalidation

When buffet data changes:

```bash
POST /api/revalidate?secret=$REVALIDATE_SECRET&buffet=salem-or/golden-dragon
```

This invalidates:
- Page HTML (`revalidatePath`)
- Transforms cache (`buffet-transforms-{cityState}-{slug}`)
- Schema cache (`seo-jsonld-{cityState}-{slug}`)

## On-Page HTML

Schema caps apply **only** to JSON-LD. On-page content (FAQ list, POI sections, reviews) is unchanged and not capped.
