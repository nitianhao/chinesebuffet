# Page Structure Quick Reference

## Page Count Summary

| Category | Count | Indexed? |
|----------|-------|----------|
| Homepage | 1 | ✅ Always |
| States Listing | 1 | ✅ Always |
| State Pages | ~50 | ✅ Always |
| City Pages | Hundreds | ⚠️ Staged |
| Buffet Pages | Thousands | ✅ Always* |
| Neighborhood Pages | Hundreds+ | ⚠️ Conditional |
| POI Pages | 4 | ⚠️ Conditional |
| **Total** | **Thousands** | **Varies** |

*Buffets inherit city's phase for sitemap inclusion

---

## URL Structure

```
/                                                    → Homepage
/chinese-buffets/states                              → States listing
/chinese-buffets/states/[state]                      → State page (e.g., /states/ca)
/chinese-buffets/[city-state]                         → City page (e.g., /san-francisco-ca)
/chinese-buffets/[city-state]/[slug]                  → Buffet detail
/chinese-buffets/[city-state]/neighborhoods/[name]    → Neighborhood
/chinese-buffets/near/[poi-type]                      → POI page (4 types)
```

---

## Index Tiers

| Tier | Pages | Default Behavior |
|------|-------|------------------|
| **Tier-1** | Home, States, Cities | Always index |
| **Tier-2** | Buffets, POI | Conditional (quality-based) |
| **Tier-3** | Neighborhoods | Default noindex, conditional index |

---

## Generation Methods

| Page Type | Method | Pre-rendered? |
|-----------|--------|---------------|
| Homepage | Static | ✅ Yes |
| States | SSG (generateStaticParams) | ✅ Yes |
| Cities | SSG (generateStaticParams) | ✅ Yes |
| Buffets | SSG (from city data) | ✅ Yes |
| Neighborhoods | Dynamic (ISR) | ❌ No |
| POI | SSG (generateStaticParams) | ✅ Yes |

---

## SEO Intent by Page Type

| Page Type | Primary Intent | Secondary Intent |
|-----------|----------------|------------------|
| Homepage | Informational | Navigational |
| States | Navigational | Local SEO |
| Cities | Local SEO | Navigational |
| Buffets | Local/Transactional | Informational |
| Neighborhoods | Long-tail Local | Navigational |
| POI | Feature Discovery | Local SEO |

---

## Internal Linking Flow

```
Homepage
  ├─→ All States (50 links)
  └─→ POI Pages (4 links)

State Page
  ├─→ All Cities in State (varies)
  └─→ Top Buffets (10 links)

City Page (CRAWL HUB)
  ├─→ ALL Buffets in City (varies, could be 100+)
  ├─→ Neighborhoods (if any)
  └─→ Nearby Cities (6 links)

Buffet Page
  ├─→ City Page
  ├─→ Similar Buffets (varies)
  └─→ POI Pages (if applicable)

Neighborhood Page
  ├─→ City Page
  └─→ Buffets in Neighborhood (varies)

POI Page
  └─→ Filtered Buffets (varies, min 5)
```

---

## Staged Indexing Phases

| Phase | Cities Included | Criteria |
|-------|----------------|----------|
| **Phase 1** | Top 50 | Rank ≤ 50, Pop ≥ 200k, ≥3 buffets |
| **Phase 2** | Top 200 | Rank ≤ 200, Pop ≥ 50k, ≥2 buffets |
| **Phase 3** | All | Pop ≥ 10k, ≥1 buffet |

**Impact:** Buffets and neighborhoods inherit city's phase status.

---

## Quality Controls

### POI Pages
- ✅ Minimum 5 buffets required
- ✅ Minimum 200 characters content
- ✅ Quality assessment system

### Neighborhood Pages
- ✅ Minimum 1 buffet required
- ✅ Inherits city's phase
- ✅ Tier-3 (default noindex)

### City Pages
- ✅ Duplicate content detection
- ✅ Staged rollout
- ✅ Page signature system

---

## Sitemap Structure

```
sitemap.xml (Index)
  ├─→ sitemap-home.xml
  ├─→ sitemap-states.xml
  ├─→ sitemap-cities.xml (respects staged rollout)
  ├─→ sitemap-buffets.xml (respects city phase)
  ├─→ sitemap-poi.xml (quality-filtered)
  └─→ sitemap-neighborhoods.xml (quality-filtered)
```

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Neighborhood explosion | ⚠️ Medium | Dynamic rendering, tier-3, conditional indexing |
| Duplicate content | ✅ Low | Signature system, canonical URLs |
| Thin content | ✅ Low | Quality controls, minimum thresholds |
| Crawl budget | ✅ Low | Staged rollout, tiered indexing |
| Combinatorial explosion | ✅ None | No combinatorial pages |

---

## Biggest SEO Opportunities

1. **City Pages** - Primary local SEO targets (hundreds of pages)
2. **Buffet Pages** - Transactional/local intent (thousands of pages)
3. **State Pages** - Navigational hubs (50 pages)
4. **Neighborhood Pages** - Long-tail local (hundreds+ pages, if optimized)

---

## Missing Page Types (Consider Adding)

- ❌ Informational guides ("How to Choose a Buffet")
- ❌ Utility pages (About, Contact, Privacy)
- ❌ Category pages (if category data exists)
- ❌ Rating-based hubs ("Top Rated Buffets")

---

*For detailed analysis, see `PAGE_STRUCTURE_ANALYSIS.md`*
