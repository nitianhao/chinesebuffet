# Buffet Playbook

Operational reference for the Chinese Buffet directory. Documents how enrichment fields are computed, where they live in the DB, and how to re-run pipelines.

---

## Cuisine Classification

### What it is

Each buffet menu is classified into a cuisine type (e.g., `Sichuan`, `Cantonese`, `American-Chinese`) along with the most prevalent dish type (e.g., `Dim sum`, `Noodle dishes`, `Hotpot`). Mixed-cuisine restaurants — those with a full dedicated section for a second cuisine (Thai, Japanese, etc.) — are flagged separately.

### Where it lives

**Table:** `menus` (InstantDB)
**Join key:** `placeId` (Google Places ID, shared with the `buffets` table)

| Field | Type | Values |
|---|---|---|
| `cuisineType` | `string` | Free-form label, e.g. `"Sichuan"`, `"Cantonese"`, `"American-Chinese"` |
| `prevalentDishType` | `string` | Free-form label, e.g. `"Dim sum"`, `"Hotpot"`, `"Stir-fries"` |
| `isMixedCuisine` | `boolean` | `true` only when there is a full dedicated section for a second cuisine |
| `mixedCuisineTypes` | `string` (JSON) | JSON-encoded string array, e.g. `'["Thai","Japanese"]'` |
| `cuisineConfidence` | `string` | `"High"`, `"Medium"`, or `"Low"` |
| `cuisineAnalyzedAt` | `string` | ISO timestamp of the last analysis run |

### How it was computed

Analysis was performed manually by Claude (claude-sonnet-4-6) reading the `rawText` field of each menu record. No external LLM API calls were made — Claude analyzed the text directly in-context in batches of 30.

**Classification rules:**

- `isMixedCuisine: true` requires a **named section** with multiple items (threshold ~3–4+). A single pad thai on an otherwise Chinese menu does not qualify.
- Garbage pages (casino sites, aggregator carousels, Oracle cookie consent walls, JS-disabled error pages) → `cuisineConfidence: "Low"`.
- Non-Chinese restaurants are classified by their actual cuisine (e.g., `"Indian"`, `"Korean BBQ"`).
- `cuisineType` and `prevalentDishType` are free-form — not constrained to a fixed enum — to capture nuance like `"Shanghainese"`, `"Fujianese"`, `"Northern Chinese"`, `"Mongolian BBQ"`.

**Volume:** 969 menus analyzed across ~30 batches (March 2026).

### Pipeline scripts

```
scripts/fetch-menus-for-analysis.js   # Step 1: export rawText from InstantDB
scripts/analyze-menu-cuisine.js       # Step 3: write results back to InstantDB
```

**Intermediate files:**

| File | Purpose |
|---|---|
| `data/menus-for-analysis.json` | Input: menus with rawText, no cuisineType yet |
| `data/cuisine-analysis-results.json` | Output: analysis results, appended per batch |

**Step 1 — fetch menus:**
```bash
node scripts/fetch-menus-for-analysis.js
# Add --all to include already-analyzed records
```

**Step 2 — analyze:**
Run Claude manually in-context, reading batches of 30 from `data/menus-for-analysis.json` and appending to `data/cuisine-analysis-results.json`. Each batch entry shape:

```json
{
  "placeId": "ChIJ...",
  "name": "Restaurant Name",
  "analysis": {
    "cuisineType": "Sichuan",
    "prevalentDishType": "Noodle dishes",
    "isMixedCuisine": false,
    "mixedCuisineTypes": [],
    "cuisineConfidence": "High",
    "keyIndicators": ["dan dan noodle", "mapo tofu", "chili oil"]
  }
}
```

**Step 3 — write to DB:**
```bash
node scripts/analyze-menu-cuisine.js           # dry run (prints what would be written)
node scripts/analyze-menu-cuisine.js --write   # writes to InstantDB
```

If the schema has new fields that haven't been pushed yet, you'll get `Attributes are missing in your schema`. Fix with:
```bash
INSTANT_APP_ID=709e0e09-3347-419b-8daa-bad6889e480d npx instant-cli push schema
```

### Where it's displayed

Cuisine tags appear in the buffet hero section (`components/BuffetHeroHeader.tsx`) on both desktop and mobile:

- **Primary cuisine pill** — dark/neutral, always shown (when confidence ≥ Medium)
- **Prevalent dish pill** — muted, shown alongside cuisine type
- **Mixed cuisine pill(s)** — amber, shown only when `isMixedCuisine: true`

Tags are suppressed entirely when `cuisineConfidence === "Low"`.

Data is surfaced via `getMenuForBuffet(placeId)` in `lib/data-instantdb.ts`, which returns cuisine fields alongside menu categories and items.

### Re-running the analysis

To re-analyze all menus (e.g., after schema changes or new menus are scraped):

```bash
node scripts/fetch-menus-for-analysis.js --all   # fetch everything, not just unanalyzed
# then run Claude analysis in batches
node scripts/analyze-menu-cuisine.js --write
```

To analyze only new menus (no existing `cuisineType`):

```bash
node scripts/fetch-menus-for-analysis.js         # default: skips already-analyzed
# then run Claude analysis in batches
node scripts/analyze-menu-cuisine.js --write
```

---

## Cuisine Filter on City Pages

### How it works

Cuisine type is a filterable facet on city listing pages (`/chinese-buffets/[city-state]`). The filter pipeline:

```
menus.cuisineType (InstantDB)
  → backfillCuisineIntoFacetIndex.js → buffets.facetIndex (cuisineType field added)
  → rebuildRollups.js → cityFacets rollup (cuisineCounts: Record<string, number>)
  → /api/facets/city → AggregatedFacets.cuisineCounts
  → CityFilterBar (Cuisine dropdown + chips)
```

### Where it lives

- **`lib/facets/buildFacetIndex.ts`**: `BuffetFacetData.cuisineType` and `BuffetForFacets.cuisineType`
- **`lib/facets/aggregateFacets.ts`**: `AggregatedFacets.cuisineCounts`, `MIN_CUISINE_COUNT = 2`
- **`scripts/rebuildRollups.js`**: `aggregateFacetsJS` now counts cuisine types
- **`components/city/CityFilterBar.tsx`**: `ActiveFilters.cuisines[]`, `toggleCuisine`, Cuisine dropdown + drawer section + active chips

### Activating (first-time setup)

1. **Backfill `cuisineType` into `facetIndex` per buffet:**
   ```bash
   node scripts/backfillCuisineIntoFacetIndex.js           # dry run
   node scripts/backfillCuisineIntoFacetIndex.js --write   # write to DB
   ```

2. **Rebuild city facets rollups** (generates `cuisineCounts` in rollups):
   ```bash
   node scripts/rebuildRollups.js --city-facets-only
   ```

3. The filter will appear automatically on city pages with ≥ 2 buffets sharing a cuisine type.

### Re-running after new menu analysis

If new menus are analyzed (new `cuisineType` values), repeat both steps above.

### URL parameter

`cuisines` — comma-separated cuisine labels, e.g. `?cuisines=American-Chinese,Sichuan`

---

## Computed Insight Scores

This section documents the pattern for adding new computed insight scores to buffet listings. Three scores have been built so far; the Date Night Score is the most recent. All follow the same architecture.

### Pattern overview

```
lib/<scoreName>.ts          # Computation logic (pure TS, no dependencies)
  ↓ computeXxx(buffet)
components/XxxSection.tsx   # Display component (DisclosureCard wrapper)
  ↓ renders when score ≥ threshold
app/chinese-buffets/[city-state]/[slug]/page.tsx
  ↓ <XxxSection buffet={buffet} /> in Suspense/StreamableSection/PageSection
lib/data.ts                 # Buffet interface gets new optional fields
```

Key design rules:
- Computation functions are **pure** — they take a `Buffet` and return a result. No DB calls, no side effects.
- Components return `null` below the display threshold (no empty cards).
- All display components use the `DisclosureCard` primitive with `defaultOpen`, `titleAs="h2"`, and `className="page-block-gap"`.
- Section wrappers in the page always use `<Suspense fallback={<SectionFallback />}><StreamableSection><PageSection variant="alt"><section id="...">`.

---

## Date Night Score

### What it is

A computed score (0–100) that answers: "Is this a good place to take someone on a date?" Especially valuable for a buffet directory where most places are family/value-oriented — when one IS date-worthy, that's a strong differentiator.

### Output fields

Added to the `Buffet` interface in `lib/data.ts`:

| Field | Type | Description |
|---|---|---|
| `dateNightScore` | `number \| null` | 0–100 composite score |
| `dateNightTier` | `string \| null` | Tier label (see tiers below) |
| `dateNightTierEmoji` | `string \| null` | Display emoji for the tier |
| `dateNightSubScores` | `DateNightSubScores \| null` | Five sub-scores that sum to the total |
| `dateNightPositiveSignals` | `string[] \| null` | What makes it date-worthy |
| `dateNightNegativeSignals` | `string[] \| null` | What hurts it |

### Tiers

| Score | Tier | Emoji |
|---|---|---|
| 70–100 | Great Date Spot | 💕 |
| 45–69 | Decent Date Option | 🌙 |
| 25–44 | Casual Date at Best | 🍽️ |
| 0–24 | *(not displayed)* | — |

### Scoring formula — 5 sub-scores

**Sub-score 1: Ambiance (max 30)**

| Signal | Points |
|---|---|
| `atmosphere` includes "Romantic" or "Intimate" | +15 |
| `atmosphere` includes "Cozy" | +10 |
| `atmosphere` includes "Trendy" | +8 |
| `atmosphere` includes "Quiet" | +7 |
| `whatStandsOut` includes "Nice atmosphere" | +5 |
| `whatStandsOut` includes "Clean, comfortable" | +3 |
| `amenities` includes "Outdoor Seating" | +3 |
| `notIdealFor` includes "Romantic dinners" | −15 |
| `notIdealFor` includes "Quiet atmosphere" | −5 |
| `quickVerdict` includes "Can get crowded" | −3 |
| `atmosphere` empty AND no FAQ ambiance mentions | −5 |

**Sub-score 2: Drinks (max 25)**

| Signal | Points |
|---|---|
| Any alcohol detected (foodAndDrink, beforeYouGo, or Bar onsite) | +10 |
| `foodAndDrink` includes "Cocktails" | +5 |
| `foodAndDrink` includes "Wine" | +5 |
| `foodAndDrink` includes "Happy hour drinks/food" | +5 |
| `amenities` includes "Bar onsite" | +5 |
| None of the above | 0 + "No alcohol served" negative signal |

**Sub-score 3: Evening Viability (max 20)**

| Latest close | Points |
|---|---|
| ≥ midnight (24:00+) | 20 |
| ≥ 11 PM | 15 |
| ≥ 10 PM | 10 |
| ≥ 9 PM | 5 |
| < 9 PM | 0 |

+5 bonus if Fri or Sat closes later than Mon–Thu (weekend extension). Negative signal added when latest close < 8 PM.

Time parsing: AM times ≤ 5 AM are treated as next-day (1 AM → 25, 2 AM → 26), enabling correct comparison with PM times. Hours array comes from `buffet.hours: Array<{ day: string; hours: string }>`.

**Sub-score 4: Service & Experience (max 15)**

| Signal | Points |
|---|---|
| `serviceOptions` or `planning` includes reservations | +10 |
| `amenities` includes "Waiter Service" or `diningOptions` includes "Table service" | +5 |
| `highlights` includes "Live music" | +5 |
| `highlights` includes live entertainment keywords | +3 |
| Counter service only (no table service) | −5 |
| FAQ answer contains "self service" or "semi-self service" | −5 |

**Sub-score 5: Surroundings (max 10)**

Counts nearby bars/pubs/lounges/nightclubs/breweries from the `foodDining` POI section items.

| Bar count | Points |
|---|---|
| ≥ 3 | 10 |
| 1–2 | 5 |
| 0 | 0 |

### Data source mapping

The raw `Buffet` type stores structured attributes in `additionalInfo` as `Array<Record<string, boolean>>`. The score function extracts these with `sectionSet()` which normalises keys to lowercase Sets:

| Score input | Raw Buffet source |
|---|---|
| `atmosphere` | `buffet.additionalInfo['Atmosphere']` |
| `foodAndDrink` | `buffet.additionalInfo['Offerings']` |
| `amenities` | `buffet.additionalInfo['Amenities']` |
| `serviceOptions` | `buffet.additionalInfo['Service options']` |
| `diningOptions` | `buffet.additionalInfo['Dining options']` |
| `planning` | `buffet.additionalInfo['Planning']` |
| `highlights` | `buffet.additionalInfo['Highlights']` |
| `faqPairs` | `buffet.questionsAndAnswers` |
| `whatStandsOut` | `buffet.reviewsTags[].title` |
| `notIdealFor` | Derived from review text + FAQ answers |
| `quickVerdict` | `buffet.reviewsTags[].title` |
| `beforeYouGo` | Derived from `additionalInfo['Offerings']` |
| `nearbyBars` | `buffet.foodDining.highlights[].items[].category` |
| `hours` | `buffet.hours: Array<{ day, hours }>` |

### Files

| File | Purpose |
|---|---|
| `lib/dateNightScore.ts` | Full computation: `computeDateNightScore(buffet)`, `computeAllDateNightScores(allBuffets)`, `countNearbyBars(buffet)`, `getLatestClosingTime(buffet)` |
| `components/DateNightSection.tsx` | Display component — DisclosureCard with score bar, sub-score breakdown, and signal lists |
| `lib/data.ts` | `Buffet` interface extended with `dateNightScore`, `dateNightTier`, `dateNightTierEmoji`, `dateNightSubScores`, `dateNightPositiveSignals`, `dateNightNegativeSignals` |

### Where it's displayed

Inserted in `app/chinese-buffets/[city-state]/[slug]/page.tsx` immediately after `AuthenticitySection`, with `id="date-night"` for scroll anchoring. The component returns `null` when score < 25.

### Validation examples

| Buffet | Score | Tier |
|---|---|---|
| Malubianbian 马路边边 (Philadelphia) | 68 | Decent Date Option 🌙 |
| China Beijing (Denver) | 47 | Decent Date Option 🌙 |
| Bao Bao Cafe (New York) | 28 | Casual Date at Best 🍽️ |
| KPOT Korean BBQ & Hot Pot (Fullerton) | 20 | *(not displayed)* |
| Gulp (New York) | 58 | Decent Date Option 🌙 |

### Adding a new insight score (checklist)

1. Create `lib/<scoreName>.ts` — export `compute<ScoreName>(buffet): <Result>` and `computeAll<ScoreNames>(allBuffets): Buffet[]`
2. Add new optional fields to `Buffet` interface in `lib/data.ts`
3. Create `components/<ScoreName>Section.tsx` — `DisclosureCard`, return `null` below display threshold
4. Import component in `app/chinese-buffets/[city-state]/[slug]/page.tsx`
5. Insert `<Suspense><StreamableSection><PageSection variant="alt"><section id="..."><ScoreNameSection buffet={buffet} /></section></PageSection></StreamableSection></Suspense>` at appropriate position
6. Run `npx tsc --noEmit` and confirm zero new errors

---

## Quick Bite Score

### What it is

A computed score (0–100) that answers: "Can I get in, eat well, and get out fast?" Especially valuable for a buffet directory because many places — hot pot, Korean BBQ, AYCE grill — require 1–2 hours of cook-at-table dining. When a place IS genuinely quick, that's useful signal for lunch breakers, travelers, and busy diners.

### Output fields

Returned by `computeQuickBiteScore(buffet)` as a `QuickBiteResult`. The batch helper `computeAllQuickBiteScores` augments buffets with these fields (not yet persisted to DB — computed at render time):

| Field | Type | Description |
|---|---|---|
| `quickBiteScore` | `number` | 0–100 composite score |
| `quickBiteTier` | `string \| null` | Tier label (see tiers below) |
| `quickBiteTierEmoji` | `string \| null` | Display emoji for the tier |
| `quickBiteSubScores` | `QuickBiteSubScores` | Five sub-scores that sum to the total |
| `quickBitePositiveSignals` | `string[]` | What makes it fast |
| `quickBiteNegativeSignals` | `string[]` | What slows it down |

### Tiers

| Score | Tier | Emoji |
|---|---|---|
| 70–100 | Perfect Quick Bite | ⚡ |
| 45–69 | Solid Quick Option | 👍 |
| 25–44 | Not the Fastest | 🕐 |
| 0–24 | *(not displayed)* | — |

### Scoring formula — 5 sub-scores

**Sub-score 1: Speed Signals (max 30)**

| Signal | Points |
|---|---|
| `reviewsTags` contains "Quick service" (substring) | +15 |
| `additionalInfo.Highlights` contains "Fast service" | +10 |
| `additionalInfo['Dining options']` contains "Counter service" | +8 |
| Any FAQ answer contains "self service" or "semi-self service" | +5 |
| Any FAQ answer has food/order + quick/fast/no wait in same sentence | +5 |

**Sub-score 2: Grab-and-Go (max 25)**

| Signal | Points |
|---|---|
| `additionalInfo['Service options']` contains "Takeout" | +10 |
| `additionalInfo.Amenities` contains "Curbside Pickup" | +8 |
| `additionalInfo['Service options']` contains "Delivery" | +5 |
| `buffet.categories` contains "Meal Takeaway" | +2 |
| No takeout | "No takeout option" negative signal |

**Sub-score 3: Budget Friendly (max 20)**

| Signal | Points |
|---|---|
| Derived `bestFor` contains "Budget dining" | +7 |
| `reviewsTags` contains "Good value for price" | +5 |
| `reviewsTags` contains "Great value for families" | +3 |
| `buffet.price` lower bound < $16 | +10 |
| `buffet.price` lower bound $16–$24 | +5 |
| FAQ mentions price < $20/person or < $35 for two | +5 |

**Sub-score 4: Low Time Commitment (max 15, starts at 15 and subtracts)**

| Signal | Penalty |
|---|---|
| FAQ answer contains cook-at-table phrases | −10 |
| FAQ answer mentions iPad + order (multi-round ordering) | −3 |
| `buffet.name` contains "Hot Pot"/"HotPot" (not Fast Food) | −5 |
| `buffet.name` contains "BBQ"/"Grill" (not Fast Food) | −5 |
| `diningOptions` has "Table service" without "Counter service" | −3 |

Score ≤ 5 adds "Experiential dining — expect a longer meal". Score = 0 adds format-specific negative signal.

**Sub-score 5: Convenience (max 10)**

| Signal | Points |
|---|---|
| Derived `bestFor` contains "Quick meals" | +5 |
| `additionalInfo['Dining options']` contains "Lunch" | +3 |
| Earliest opening time across all days ≤ 11:30 AM | +2 |

### Data source mapping

| Score input | Raw Buffet source |
|---|---|
| `reviewsTags` / whatStandsOut / quickVerdict | `buffet.reviewsTags[].title` |
| `highlights` | `buffet.additionalInfo['Highlights']` — keys where value = `true` |
| `diningOptions` | `buffet.additionalInfo['Dining options']` |
| `serviceOptions` | `buffet.additionalInfo['Service options']` |
| `amenities` | `buffet.additionalInfo['Amenities']` |
| `faqPairs` | `buffet.questionsAndAnswers[].{question, answer}` |
| `placeTypes` | `buffet.categories` (e.g. `["Food", "Meal Takeaway"]`) |
| `priceRange` | `buffet.price` (e.g. `"14.29 - 22.50"`) |
| `hours` | `buffet.hours: Array<{ day: string; hours: string }>` |
| `bestFor` | Derived inline: review text keywords + serviceOptions + price symbol |

`bestFor` is not a raw field — it's computed inside `buildBestForSet()` using the same heuristics as `BestForSection.tsx` (review text patterns for "budget", "quick", "fast"; serviceOptions has takeout/delivery → "quick meals"; `buffet.price === "$" || "$$"` → "budget dining"; reviewsTags substring matches).

### Files

| File | Purpose |
|---|---|
| `lib/quickBiteScore.ts` | Full computation: `computeQuickBiteScore(buffet)`, `computeAllQuickBiteScores(allBuffets)` |
| `components/QuickBiteSection.tsx` | Display component — DisclosureCard with score bar, sub-score breakdown, and signal lists |

### Where it's displayed

Inserted in `app/chinese-buffets/[city-state]/[slug]/page.tsx` immediately after `SignatureDishesSection` and before `AuthenticitySection`, with `id="quick-bite"` for scroll anchoring. Order rationale: Quick Bite is a practical decision-helper (lunch feasibility) so it appears before the more niche signals (Authenticity, Date Night). The component returns `null` when score < 25.

### Validation examples

| Buffet | Speed | G&G | Budget | Time | Conv | Total | Tier |
|---|---|---|---|---|---|---|---|
| Bao Bao Cafe (New York) | 20 | 23 | 13 | 15 | 10 | **81** | Perfect Quick Bite ⚡ |
| China Beijing (Denver) | 10 | 15 | 20 | 12 | 10 | **67** | Solid Quick Option 👍 |
| So Hot HotPot (Cary) | 0 | 10–15 | 0–5 | 0–5 | 3–5 | **~20** | *(not displayed)* |

Bao Bao Cafe breakdown: "Quick service" in reviewsTags (+15) + FAQ "semi-self service" (+5) = 20 speed; Takeout+Curbside+Delivery = 23 grab-and-go; "Good value" +5, "Great value for families" +3, FAQ "$30 for 2" +5 = 13 budget; no cook-at-table penalties = 15 time; "Quick meals" +5, Lunch +3, opens 11AM +2 = 10 convenience.

---

## Strength Profile

### What it is

A computed 5-axis "radar" profile that maps each buffet's strengths across Food Quality, Service, Variety, Value, and Atmosphere. Each axis scores 0–20 (total max 100). The profile generates a human-readable shape label (e.g. "Triple Threat", "Value Standout") that summarises where the buffet excels. Unlike the score-based insights (Date Night, Quick Bite), the Strength Profile is always computed — it just isn't displayed when all axes are weak and the total is < 30.

### Output fields

`strengthProfile` is added as an optional field to the `Buffet` interface in `lib/data.ts`, containing a `StrengthProfileResult` object:

| Field | Type | Description |
|---|---|---|
| `axes.foodQuality` | `number` | 0–20 |
| `axes.service` | `number` | 0–20 |
| `axes.variety` | `number` | 0–20 |
| `axes.value` | `number` | 0–20 |
| `axes.atmosphere` | `number` | 0–20 |
| `totalScore` | `number` | 0–100 (sum of all axes) |
| `dominantStrength` | `string` | Label of the highest axis |
| `weakestArea` | `string` | Label of the lowest axis |
| `dominantStrengths` | `string[]` | All axes ≥ 12, sorted descending |
| `profileTag` | `string \| null` | Shape label (see classification below) |
| `profileTagEmoji` | `string \| null` | Display emoji |

### Profile tag classification

| Condition | Tag | Emoji |
|---|---|---|
| 4+ axes ≥ 12 | All-Rounder | ⭐ |
| Exactly 3 axes ≥ 12 | Triple Threat | 🔱 |
| Exactly 2 axes ≥ 12 | `[Top1] & [Top2]` | 💪 |
| Exactly 1 axis ≥ 12 | `[Top1] Standout` | 🎯 |
| 0 axes ≥ 12, totalScore ≥ 30 | Solid Across the Board | 👌 |
| 0 axes ≥ 12, totalScore < 30 | *(not displayed — returns null)* | — |

Ties in axis scores are broken alphabetically by label.

### Scoring formula — 5 axes (each max 20)

**Food Quality**

| Signal | Points |
|---|---|
| `reviewsTags` includes "Delicious food" | +8 |
| `reviewsTags` includes "Fresh, quality food" | +7 |
| FAQ answer contains "delicious", "amazing", "incredible", or "best" | +3 |
| FAQ answer contains "fresh" | +2 |

**Service**

| Signal | Points |
|---|---|
| `reviewsTags` includes "Friendly service" | +8 |
| `reviewsTags` includes "Quick service" | +7 |
| FAQ answer contains "friendly", "attentive", "helpful", or "welcoming" | +3 |
| FAQ answer contains "fast", "quick", "no wait", or "efficient" | +2 |

**Variety**

| Signal | Points |
|---|---|
| `reviewsTags` includes "Huge selection" | +10 |
| `reviewsTags` includes "Reviewers mention good variety" | +5 |
| FAQ answer contains "variety", "selection", "many options", "wide range", "lots of options", or "different food" | +3 |
| `description` contains "wide variety", "extensive", "array of options", "wide range", or "wide selection" | +2 |

**Value**

| Signal | Points |
|---|---|
| `reviewsTags` includes "Great value for families" | +8 |
| `reviewsTags` includes "Good value for price" | +5 |
| Derived `bestFor` contains "Budget dining" | +4 |
| `buffet.price` lower bound parsed as float, and < $20 | +3 |
| FAQ answer contains "affordable", "reasonable", "worth the price", "good deal", or "great value" | +3 |

**Atmosphere**

| Signal | Points |
|---|---|
| `reviewsTags` includes "Nice atmosphere" | +8 |
| `reviewsTags` includes "Clean, comfortable" | +7 |
| `additionalInfo.Atmosphere` includes "Cozy" | +3 |
| `additionalInfo.Atmosphere` includes "Trendy" | +2 |
| `additionalInfo.Atmosphere` includes "Romantic" or "Intimate" | +3 |
| `additionalInfo.Atmosphere` includes "Quiet" | +1 |
| FAQ answer contains "clean", "atmosphere", "ambiance", "comfortable", or "welcoming" | +2 |

### Data source mapping

| Score input | Raw Buffet source |
|---|---|
| `whatStandsOut` / `quickVerdict` tags | `buffet.reviewsTags[].title` (lowercased Set) |
| `faqAnswers` | `buffet.questionsAndAnswers[].answer` |
| `atmosphereTags` | `buffet.additionalInfo['Atmosphere']` — keys where value = `true` |
| `priceStr` | `buffet.price` (e.g. `"14.29 - 22.50"` or `"$"`) |
| `description` | `buffet.description` |
| `bestFor` | Derived inline: price symbol + reviewsTags value/budget keywords |

FAQ scanning uses `scanFaqsForKeywords(faqPairs, keywords)` — exported helper that applies word-boundary regex across all answer strings. "friendly" matches "staff is friendly" but NOT "unfriendly".

### Validation examples

| Buffet | FQ | Svc | Var | Val | Atm | Total | Tag |
|---|---|---|---|---|---|---|---|
| Gulp (New York) | 11 | 13 | 0 | 12 | 17 | 53 | Triple Threat 🔱 |
| China Beijing (Denver) | 20 | 5 | 10 | 20 | 6 | 61 | Food Quality & Value 💪 |
| GAN-HOO BBQ (Queens) | 20 | 18 | 0 | 12 | 0 | 50 | Triple Threat 🔱 |
| Chopstickers (Denver) | 11 | 3 | 3 | 20 | 5 | 42 | Value Standout 🎯 |
| Mala Town (New York) | 8 | 8 | 18 | 5 | 9 | 48 | Variety Standout 🎯 |

### Files

| File | Purpose |
|---|---|
| `lib/strengthProfile.ts` | Full computation: `computeStrengthProfile(buffet)`, `computeAllStrengthProfiles(allBuffets)`, `scanFaqsForKeywords(faqPairs, keywords)` |
| `components/StrengthProfileSection.tsx` | Display component — DisclosureCard with per-axis bar chart and dominant-strength chips |
| `lib/data.ts` | `Buffet` interface extended with `strengthProfile?: StrengthProfileResult \| null` |

### Where it's displayed

Inserted in `app/chinese-buffets/[city-state]/[slug]/page.tsx` immediately after `DateNightSection`, with `id="strength-profile"` for scroll anchoring. The component returns `null` when `profileTag` is null (totalScore < 30 with no strong axes).

The display shows:
- Five horizontal bars (each scored /20), with strong axes (≥ 12) rendered at full opacity and weak axes at 50% opacity
- Pill chips for each dominant strength (axes ≥ 12)
- The `profileTag` + emoji as the card title

---

## Full Night Out Score

### What it is

A computed score (0–100) that answers: "Can I eat here AND keep the night going?" This captures total evening potential — a late dinner with drinks, then bars and entertainment within walking distance. It is the inverse of the Quick Bite Score. A suburban buffet that closes at 9PM with no bars nearby scores near zero. A Chinatown spot open until 2AM with a full bar and nightlife all around scores near 100.

### Output fields

Added to the `Buffet` interface in `lib/data.ts`:

| Field | Type | Description |
|---|---|---|
| `fullNightOutScore` | `number \| null` | 0–100 composite score |
| `fullNightOutTier` | `string \| null` | Tier label (see tiers below) |
| `fullNightOutTierEmoji` | `string \| null` | Display emoji for the tier |
| `fullNightOutSubScores` | `FullNightOutSubScores \| null` | Five sub-scores that sum to the total |
| `fullNightOutPositiveSignals` | `string[] \| null` | What makes it night-out worthy |
| `fullNightOutNegativeSignals` | `string[] \| null` | What hurts it |

### Tiers

| Score | Tier | Emoji |
|---|---|---|
| 75–100 | Epic Night Out 🎉 | 🎉 |
| 50–74 | Solid Evening Plans 🌃 | 🌃 |
| 25–49 | Early Evening Only 🌇 | 🌇 |
| 0–24 | *(not displayed)* | — |

### Scoring formula — 5 sub-scores

**Sub-score 1: Late Night Dining (max 30)**

Parse `buffet.hours` to find the latest closing time across all operating days. AM times ≤ 5 AM are treated as next-day (1 AM → 25, 2 AM → 26).

| Latest close | Points |
|---|---|
| ≥ 2:00 AM (26) | 30 |
| ≥ 1:00 AM (25) | 25 |
| ≥ midnight (24) | 20 |
| ≥ 11 PM (23) | 15 |
| ≥ 10 PM (22) | 8 |
| ≥ 9 PM (21) | 3 |
| < 9 PM | 0 |

+3 additive bonus if `additionalInfo['Offerings']` includes "Late-night food" (capped at 30). Negative signal added when latest close < 21.

**Sub-score 2: Drinks on Premises (max 20)**

| Signal | Points |
|---|---|
| Any alcohol detected (Offerings/Planning/Bar onsite) | +8 |
| `Offerings` includes "Cocktails" | +4 |
| `Offerings` includes "Wine" | +3 |
| `Offerings` includes "Beer" | +2 |
| `Offerings` includes "Happy hour drinks" or "Happy hour food" | +4 |
| `Amenities` includes "Bar onsite" | +4 |
| None of the above | 0 + "No alcohol" negative signal |

**Sub-score 3: Nightlife Surroundings (max 25)**

Counts items in the `foodDining` POI section whose category/name contains any of: Bar, Pub, Lounge, Nightclub, Club, Karaoke, Wine, Brewery, Spirits, Alcohol, Tavern. Items in `retailShopping` are excluded (shops, not venues).

| Venue count | Points |
|---|---|
| ≥ 5 | 25 |
| 3–4 | 18 |
| 1–2 | 10 |
| 0 | 0 + "No bars nearby" negative signal |

**Sub-score 4: Entertainment & Energy (max 15)**

| Signal | Points |
|---|---|
| Nearby Nightclub, Karaoke, or KTV | +5 |
| Nearby Cinema or Theatre | +3 |
| Nearby Bowling, Arcade, Escape Game, Billiards, or Pool Hall | +3 |
| `Highlights` includes "Live music" or "Live performance" | +5 |
| `Atmosphere` includes "Trendy" | +3 |

Scans `foodDining` and `recreationEntertainment` POI sections.

**Sub-score 5: Weekend Potential (max 10)**

| Signal | Points |
|---|---|
| Friday or Saturday closes later than Mon–Thu latest | +5 |
| Friday or Saturday closes at or after 11 PM | +5 |

Negative signal when both weekend days close before 10 PM.

### Data source mapping

| Score input | Raw Buffet source |
|---|---|
| `hours` | `buffet.hours: Array<{ day, hours }>` |
| `foodAndDrink` / `offerings` | `buffet.additionalInfo['Offerings']` |
| `amenities` | `buffet.additionalInfo['Amenities']` |
| `planning` | `buffet.additionalInfo['Planning']` |
| `highlights` | `buffet.additionalInfo['Highlights']` |
| `atmosphere` | `buffet.additionalInfo['Atmosphere']` |
| `nearbyNightlife` | `buffet.foodDining.highlights[].items[].category` |
| `nearbyEntertainment` | `buffet.foodDining` + `buffet.recreationEntertainment` highlights items |

### Files

| File | Purpose |
|---|---|
| `lib/fullNightOutScore.ts` | Full computation: `computeFullNightOutScore(buffet)`, `computeAllFullNightOutScores(allBuffets)`, `getLatestClosingHour(hours)`, `getWeekdayWeekendClose(hours)`, `countNightlifeVenues(buffet)`, `countEntertainmentVenues(buffet)` |
| `components/FullNightOutSection.tsx` | Display component — DisclosureCard with score bar, sub-score breakdown, and signal lists |
| `lib/data.ts` | `Buffet` interface extended with `fullNightOutScore`, `fullNightOutTier`, `fullNightOutTierEmoji`, `fullNightOutSubScores`, `fullNightOutPositiveSignals`, `fullNightOutNegativeSignals` |

### Where it's displayed

Inserted in `app/chinese-buffets/[city-state]/[slug]/page.tsx` immediately after `DateNightSection` and before `StrengthProfileSection`, with `id="full-night-out"` for scroll anchoring. The component returns `null` when score < 25.

### Validation examples

| Buffet | Score | Tier |
|---|---|---|
| Malubianbian 马路边边 (Philadelphia) | 87 | Epic Night Out 🎉 |
| GAN-HOO BBQ (Queens) | 48 | Early Evening Only 🌇 |
| Gulp (New York) | 54 | Solid Evening Plans 🌃 |
| The Best Sichuan (New York) | 52 | Solid Evening Plans 🌃 |
| Mala Town (New York — UWS) | 28 | Early Evening Only 🌇 |
| Petals of a Peony (Memphis) | 3 | *(not displayed)* |

---

## Trusted Rating

### What it is

A Bayesian-weighted rating that answers: "How much should I actually trust this score?" A raw 5.0 from 10 reviews is statistically less reliable than a 4.8 from 2,000 reviews. The trusted rating blends the buffet's raw score with the city average, weighted by how much review volume the place has relative to its city peers.

### Algorithm

**Step 1 — City baselines (computed once per city):**
- `C` = mean `rating` of all buffets in the city
- `m` = median `reviewsCount` of all buffets in the city, floored at 50

**Step 2 — Per-buffet weighted average:**
```
trustedRating = ( (v / (v + m)) * R ) + ( (m / (v + m)) * C )
```
Where `R` = raw rating, `v` = review count. When `v` is small, the formula pulls the score toward `C`. When `v` is large, it converges to `R`.

**Step 3 — Confidence tier (comparing `v` to `m`):**

| Condition | Tier | Emoji |
|---|---|---|
| `v >= m * 5` | Rock Solid / Community Favorite | 🏆 |
| `v >= m * 2` | Highly Trusted | ✅ |
| `v >= m` | Trusted | 👍 |
| `v >= m * 0.5` | Needs More Reviews | ⚖️ |
| `v < m * 0.5` | Newly Discovered (Low Confidence) | 🆕 |

### Output fields

Added to the `Buffet` interface in `lib/data.ts`:

| Field | Type | Description |
|---|---|---|
| `trustedRating` | `number \| null` | Bayesian-weighted rating, 2 decimal places |
| `trustedRatingDisplay` | `string \| null` | Formatted to 1 decimal (e.g. "4.7") |
| `confidenceTier` | `string \| null` | Human-readable tier label |
| `confidenceTierEmoji` | `string \| null` | Visual indicator emoji |
| `cityAverageRating` | `number \| null` | The C value used in the formula |
| `cityMedianReviews` | `number \| null` | The m value used in the formula (≥ 50) |

### Validation examples (NYC baselines: C = 4.4, m = 400)

| Buffet | Raw | Reviews | Trusted | Tier |
|---|---|---|---|---|
| GAN-HOO BBQ (Flushing) | 4.9 | 5,408 | 4.85 → "4.9" | Rock Solid / Community Favorite 🏆 |
| Gulp (Manhattan) | 5.0 | 152 | 4.55 → "4.6" | Newly Discovered (Low Confidence) 🆕 |

### Files

| File | Purpose |
|---|---|
| `lib/trustedRating.ts` | Core math: `getMedian()`, `computeTrustedRating(buffet, cityMeanRating, cityMedianReviews)`, `computeAllTrustedRatings(allBuffets)` |
| `components/TrustedRatingSection.tsx` | Display component — DisclosureCard with weighted score, confidence badge, review-volume bar, and formula explainer |
| `lib/data.ts` | `Buffet` interface extended with 6 trusted rating fields |

### Where it's displayed

Inserted in `app/chinese-buffets/[city-state]/[slug]/page.tsx` immediately after `StrengthProfileSection`, with `id="trusted-rating"` for scroll anchoring. City peers are sourced from `cityInfo?.buffets` (already fetched in parallel for other city-peer computations like `computeHiddenGemScore`). Always rendered — the confidence tier communicates reliability even for well-reviewed places.

---

## Schema

The full InstantDB schema is in `src/instant.schema.ts`. Relevant excerpt for menus:

```ts
menus: i.entity({
  placeId: i.string().indexed(),
  sourceUrl: i.string(),
  contentType: i.string(),
  rawText: i.string().optional(),
  structuredData: i.string(),
  categories: i.string().optional(),
  items: i.string().optional(),
  scrapedAt: i.string(),
  status: i.string(),
  cuisineType: i.string().optional(),
  prevalentDishType: i.string().optional(),
  isMixedCuisine: i.boolean().optional(),
  mixedCuisineTypes: i.string().optional(),    // JSON-encoded string array
  cuisineConfidence: i.string().optional(),
  cuisineAnalyzedAt: i.string().optional(),
}),
```
