# Homepage IA: Mobile-First Redesign

**Goals:** (1) Help users quickly find a buffet near them (search + location), (2) Provide browse paths (State → City → Neighborhood → Buffet), (3) Build SEO hub value with internal links + indexable content.

---

## Section Order (Top to Bottom)

| # | Section | Rationale |
|---|---------|-----------|
| 1 | **HomepageHero** | Immediate value prop + H1. Mobile-first: single glance to understand the site. |
| 2 | **LocationBar** | Primary action: "Where are you?" — fastest path to local results. Above-the-fold on mobile. |
| 3 | **PopularCitiesGrid** | High-intent browse: users often search by city. Strong internal links for SEO. |
| 4 | **TopStatesGrid** | Full browse path: State → City → Neighborhood → Buffet. Indexable hub links. |
| 5 | **CuisineFilters** | Secondary discovery: filter by feature (parking, near shopping, etc.). More internal links. |
| 6 | **RecentlyAdded** | Freshness signal + more buffet links. Drives crawl depth. |
| 7 | **BestRated** | Social proof + high-quality buffet links. |
| 8 | **FAQ** | Indexable Q&A content. FAQPage schema. Targets long-tail queries. |
| 9 | **SEOTextBlock** | Unique copy for hub authority. Targets "Chinese buffet near me" etc. |
| 10 | **Map** | Deferred load (below fold). Visual discovery, low priority on mobile. |
| 11 | **FooterLinks** | Site-wide nav + crawl paths. States, cities, legal. |

---

## Component Specs

### 1. HomepageHero
| Field | Value |
|-------|-------|
| **Purpose** | Brand + value prop. Clear H1, one-line tagline. |
| **Data** | None (static). |
| **CTA** | None (hero only). Scroll hint optional. |

---

### 2. LocationBar
| Field | Value |
|-------|-------|
| **Purpose** | Primary discovery: "Find buffets near you." Geo input or city autocomplete. |
| **Data** | `getTopCities(10)` for autocomplete suggestions; optional geolocation API. |
| **CTA** | Submit → `/chinese-buffets/near` (with lat/lng) or `/chinese-buffets/{city-state}`. |

---

### 3. PopularCitiesGrid
| Field | Value |
|-------|-------|
| **Purpose** | Browse by city. High-traffic cities as quick links. |
| **Data** | `getTopCities(12)` — slug, city, state, buffetCount. |
| **CTA** | Link → `/chinese-buffets/{city-state}`. |

---

### 4. TopStatesGrid
| Field | Value |
|-------|-------|
| **Purpose** | Browse path: State → City. Full coverage, SEO hub. |
| **Data** | `getStateCounts()` — state abbr, buffet count. |
| **CTA** | Link → `/chinese-buffets/states/{state}`. |

---

### 5. CuisineFilters
| Field | Value |
|-------|-------|
| **Purpose** | Filter by feature/context: parking, near shopping, highways, gas. |
| **Data** | Static POI types (parking, shopping-malls, highways, gas-stations). |
| **CTA** | Link → `/chinese-buffets/near/{poi-type}`. |

---

### 6. RecentlyAdded
| Field | Value |
|-------|-------|
| **Purpose** | Freshness + new buffet links. |
| **Data** | `getRecentlyAddedBuffets(6)` — id, name, slug, citySlug, city, state. *(Requires `scrapedAt` or `createdAt` sort; fallback: `getSampleBuffets` with "Featured" label.)* |
| **CTA** | Link → `/chinese-buffets/{city-state}/{slug}`. |

---

### 7. BestRated
| Field | Value |
|-------|-------|
| **Purpose** | Social proof. Top-rated buffets. |
| **Data** | `getBestRatedBuffets(6)` — id, name, slug, citySlug, rating, reviewsCount. |
| **CTA** | Link → `/chinese-buffets/{city-state}/{slug}`. |

---

### 8. FAQ
| Field | Value |
|-------|-------|
| **Purpose** | Indexable Q&A. FAQPage schema. Long-tail SEO. |
| **Data** | Static homepage FAQs (e.g., "What is a Chinese buffet?", "How much does a Chinese buffet cost?", "How do I find buffets near me?"). |
| **CTA** | Accordion expand. No outbound CTA. |

---

### 9. SEOTextBlock
| Field | Value |
|-------|-------|
| **Purpose** | Unique hub copy. Targets "Chinese buffet near me", "all-you-can-eat Chinese", etc. |
| **Data** | Static or templated copy. Optional: city/state counts for dynamic sentences. |
| **CTA** | Inline links to `/chinese-buffets/states`, Popular Cities. |

---

### 10. Map
| Field | Value |
|-------|-------|
| **Purpose** | Visual discovery. Deferred load for performance. |
| **Data** | `getBuffetsForMap(150)` — id, name, slug, lat, lng, citySlug. |
| **CTA** | Marker click → `/chinese-buffets/{city-state}/{slug}`. |

---

### 11. FooterLinks
| Field | Value |
|-------|-------|
| **Purpose** | Site nav, crawl paths, legal. |
| **Data** | Static: States index, Cities index, Add buffet, Privacy, etc. Optional: top 5–10 state links. |
| **CTA** | Links to `/chinese-buffets/states`, `/`, `/chinese-buffets/near`, etc. |

---

## Data Gaps

| Component | Status | Action |
|-----------|--------|--------|
| `getRecentlyAddedBuffets` | Missing | Add to `data-instantdb.ts` (sort by `scrapedAt` desc) or use `getSampleBuffets` as "Featured". |
| `getBestRatedBuffets` | Missing | Add to `data-instantdb.ts` (sort by `rating` desc, min reviewsCount). |

---

## Final Ordered Outline (Implementation Checklist)

```
1. HomepageHero
   - H1: "Chinese Buffets Directory"
   - Tagline: "Find all-you-can-eat Chinese buffets near you"

2. LocationBar
   - Search input (city or "Use my location")
   - Uses getTopCities for suggestions
   - CTA: Navigate to near/{city-state}

3. PopularCitiesGrid
   - 12 city cards (2×6 mobile, 4×3 desktop)
   - Data: getTopCities(12)
   - Links: /chinese-buffets/{city-state}

4. TopStatesGrid
   - State grid (2×6 mobile, 4×6 desktop)
   - Data: getStateCounts()
   - Links: /chinese-buffets/states/{state}

5. CuisineFilters
   - 4 feature chips: Parking, Near Shopping, Near Highways, Near Gas
   - Links: /chinese-buffets/near/{poi-type}

6. RecentlyAdded
   - 6 buffet cards (2×3 mobile)
   - Data: getRecentlyAddedBuffets(6) or getSampleBuffets(6) as "Featured"
   - Links: /chinese-buffets/{city-state}/{slug}

7. BestRated
   - 6 buffet cards with rating
   - Data: getBestRatedBuffets(6)
   - Links: /chinese-buffets/{city-state}/{slug}

8. FAQ
   - 4–6 accordion items
   - FAQPage JSON-LD
   - Static content

9. SEOTextBlock
   - 2–3 paragraphs
   - Inline links to states, cities

10. Map
    - DeferredSection (threshold 600px)
    - Data: getBuffetsForMap(150)
    - Existing HomePageMap component

11. FooterLinks
    - States | Cities | Near Me | Add Buffet
    - Optional: Privacy, Terms
```

---

## Mobile-First Notes

- **LocationBar** and **PopularCitiesGrid** are above the fold; **TopStatesGrid** is one scroll.
- **Map** loads only when scrolled into view (DeferredSection).
- **CuisineFilters** = compact chip row on mobile.
- **RecentlyAdded** and **BestRated** = horizontal scroll or 2-column grid on mobile.
- **FAQ** = accordion (collapsed by default).
- **SEOTextBlock** = readable, not hidden; supports SEO.
