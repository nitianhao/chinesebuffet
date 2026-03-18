/**
 * Location Vibe classification.
 *
 * Classifies the character of the area surrounding a buffet based on the
 * density and type of nearby points of interest (POIs). This is NOT about
 * the buffet itself — it describes what the neighbourhood feels like.
 *
 * There are 7 mutually-exclusive vibe tags. Rules are evaluated in strict
 * priority order and the first match wins:
 *
 *   1. Neighborhood Gem  — very few nearby places (quiet, destination dining)
 *   2. Business District — dominated by offices/banks (lunch-break crowd)
 *   3. Nightlife & Entertainment — bars + entertainment density
 *   4. Cultural Food Hub — dense food scene with cultural markers
 *   5. Shopping District — retail-heavy with solid food presence
 *   6. Suburban Center   — mid-size, balanced mix, no single dominant category
 *   7. Mixed Urban       — default fallback for dense, diverse urban areas
 *
 * Priority order matters because several rules can trigger simultaneously
 * (e.g., a location could qualify for both "Business District" and
 * "Cultural Food Hub"). The order encodes business intent: quiet areas are
 * classified first (Rule 1), then niche character types (Rules 2–5), then
 * generic buckets (Rules 6–7).
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All possible location vibe tags. */
export type LocationVibeTag =
  | 'Neighborhood Gem'
  | 'Business District'
  | 'Nightlife & Entertainment'
  | 'Cultural Food Hub'
  | 'Shopping District'
  | 'Suburban Center'
  | 'Mixed Urban';

export interface LocationVibeResult {
  /** One of the 7 classification tags. */
  locationVibe: LocationVibeTag;
  /** Display emoji for the vibe tag. */
  locationVibeEmoji: string;
  /** One-sentence human-readable description of the surrounding area. */
  locationVibeDescription: string;
  /** Total number of nearby POIs across all categories. */
  nearbyTotalCount: number;
  /** The category with the highest POI count. Empty string when no POIs. */
  dominantCategory: string;
  /** POI count per category display name. */
  categoryBreakdown: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Internal: POI section → display category mapping
// ---------------------------------------------------------------------------

/**
 * Maps from the camelCase POI section key on the Buffet object to the
 * canonical human-readable category name used in classification rules.
 */
const SECTION_TO_CATEGORY: Record<string, string> = {
  foodDining: 'Food & Dining',
  retailShopping: 'Retail & Shopping',
  recreationEntertainment: 'Recreation & Entertainment',
  financialServices: 'Financial Services',
  professionalBusinessServices: 'Professional Services',
  healthcareMedicalServices: 'Healthcare & Medical',
  transportationAutomotive: 'Transportation & Automotive',
  miscellaneousServices: 'Miscellaneous Services',
  governmentPublicServices: 'Government & Public Services',
  personalCareBeauty: 'Personal Care & Beauty',
  artsCulture: 'Arts & Culture',
  religiousSpiritual: 'Religious & Spiritual',
  sportsFitness: 'Sports & Fitness',
  travelTourismServices: 'Travel & Tourism',
  utilitiesInfrastructure: 'Utilities & Infrastructure',
  // Handle legacy/alternate spellings
  accomodationLodging: 'Accommodation & Lodging',
  accommodationLodging: 'Accommodation & Lodging',
  communitySocialServices: 'Community & Social Services',
  homeImprovementGarden: 'Home & Garden',
  industrialManufacturing: 'Industrial & Manufacturing',
  communicationsTechnology: 'Communications & Technology',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface POISection {
  poiCount?: number;
  highlights?: Array<{
    label?: string;
    items?: Array<{
      name?: string;
      category?: string;
      distanceText?: string;
      [key: string]: unknown;
    }>;
  }>;
  [key: string]: unknown;
}

/**
 * Extract all POI items from a section's highlights array.
 * Returns a flat array of item `category` strings (subtypes).
 */
function extractItemCategories(section: POISection): string[] {
  const categories: string[] = [];
  if (!section.highlights) return categories;
  for (const group of section.highlights) {
    if (!group.items) continue;
    for (const item of group.items) {
      if (item.category) categories.push(item.category);
    }
  }
  return categories;
}

/**
 * Case-insensitive substring test.
 */
function containsAny(value: string, terms: string[]): boolean {
  const lower = value.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Internal: count Food & Dining subtypes
// ---------------------------------------------------------------------------

interface FoodSubtypeCounts {
  barPubCount: number;
  cafeCount: number;
  fastFoodCount: number;
  sitDownRestaurantCount: number;
}

function countFoodSubtypes(foodDiningSection: POISection | undefined): FoodSubtypeCounts {
  if (!foodDiningSection) {
    return { barPubCount: 0, cafeCount: 0, fastFoodCount: 0, sitDownRestaurantCount: 0 };
  }

  const itemCategories = extractItemCategories(foodDiningSection);

  let barPubCount = 0;
  let cafeCount = 0;
  let fastFoodCount = 0;
  let sitDownRestaurantCount = 0;

  for (const cat of itemCategories) {
    if (containsAny(cat, ['Bar', 'Pub', 'Lounge', 'Nightclub'])) {
      barPubCount++;
    } else if (containsAny(cat, ['Cafe', 'Coffee', 'Tea'])) {
      cafeCount++;
    } else if (containsAny(cat, ['Fast Food'])) {
      fastFoodCount++;
    } else if (containsAny(cat, ['Restaurant'])) {
      sitDownRestaurantCount++;
    }
  }

  return { barPubCount, cafeCount, fastFoodCount, sitDownRestaurantCount };
}

// ---------------------------------------------------------------------------
// Internal: classification rules
// ---------------------------------------------------------------------------

/**
 * Rule 1 — Neighborhood Gem
 *
 * Very few nearby places signals a quiet, off-the-beaten-path location.
 * People drive here intentionally rather than stumbling upon it.
 */
function isNeighborhoodGem(nearbyTotalCount: number): boolean {
  return nearbyTotalCount <= 25;
}

/**
 * Rule 2 — Business District
 *
 * A meaningful share of professional + financial services alongside a
 * critical mass of total POIs suggests an office-centric environment.
 * The combined 12% threshold (with ≥60 total places) filters out suburban
 * strips that happen to have a couple of banks.
 */
function isBusinessDistrict(
  professionalCount: number,
  financialCount: number,
  nearbyTotalCount: number
): boolean {
  if (nearbyTotalCount < 60) return false;
  const pct = (professionalCount + financialCount) / nearbyTotalCount;
  return pct >= 0.12;
}

/**
 * Rule 3 — Nightlife & Entertainment
 *
 * At least 3 bars/pubs combined with meaningful entertainment density (8%
 * of total) and a minimum threshold of 40 total places to exclude tiny
 * suburban towns with a bar and a bowling alley.
 */
function isNightlifeEntertainment(
  barPubCount: number,
  recreationCount: number,
  nearbyTotalCount: number
): boolean {
  if (nearbyTotalCount < 40) return false;
  if (barPubCount < 3) return false;
  return recreationCount / nearbyTotalCount >= 0.08;
}

/**
 * Rule 4 — Cultural Food Hub
 *
 * Dense food scene (≥25% of nearby places, ≥70 total) AND at least one
 * cultural anchor (arts venue, religious institution, or a meaningful café
 * scene with ≥5 cafés). This distinguishes a culturally rich food district
 * from a generic fast-food strip.
 */
function isCulturalFoodHub(
  foodDiningCount: number,
  nearbyTotalCount: number,
  artsCultureCount: number,
  religiousSpiritualCount: number,
  cafeCount: number
): boolean {
  if (nearbyTotalCount < 70) return false;
  if (foodDiningCount / nearbyTotalCount < 0.25) return false;
  return artsCultureCount >= 1 || religiousSpiritualCount >= 1 || cafeCount >= 5;
}

/**
 * Rule 5 — Shopping District
 *
 * Retail makes up at least 10% of nearby places (≥35 total), and there are
 * enough restaurants (≥5) to confirm this is a genuine commercial corridor
 * rather than an industrial park with a few shops.
 */
function isShoppingDistrict(
  retailCount: number,
  nearbyTotalCount: number,
  foodDiningCount: number
): boolean {
  if (nearbyTotalCount < 35) return false;
  if (retailCount / nearbyTotalCount < 0.10) return false;
  return foodDiningCount >= 5;
}

/**
 * Rule 6 — Suburban Center
 *
 * Mid-size area (26–99 places) with no single non-Food category dominating
 * more than 25% of the total. This captures well-rounded suburbs that don't
 * fit a more specific niche.
 */
function isSuburbanCenter(
  nearbyTotalCount: number,
  categoryBreakdown: Record<string, number>,
  foodDiningCategory: string
): boolean {
  if (nearbyTotalCount < 26 || nearbyTotalCount > 99) return false;
  for (const [cat, count] of Object.entries(categoryBreakdown)) {
    if (cat === foodDiningCategory) continue;
    if (count / nearbyTotalCount > 0.25) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the location vibe for a single buffet.
 *
 * Reads the POI section fields on the buffet object (e.g., `foodDining`,
 * `retailShopping`) which are populated by the data pipeline and stored as
 * parsed objects after `transformBuffet()` runs.
 *
 * Rules are evaluated in priority order — the first match wins:
 *   1. Neighborhood Gem  (total ≤ 25)
 *   2. Business District (professional+financial ≥ 12%, total ≥ 60)
 *   3. Nightlife & Entertainment (bars ≥ 3, recreation ≥ 8%, total ≥ 40)
 *   4. Cultural Food Hub (food ≥ 25%, cultural anchor, total ≥ 70)
 *   5. Shopping District (retail ≥ 10%, food ≥ 5 places, total ≥ 35)
 *   6. Suburban Center   (total 26–99, no non-food cat > 25%)
 *   7. Mixed Urban       (default fallback)
 *
 * @param buffet - A single buffet object with POI section fields populated.
 * @returns Full LocationVibeResult including breakdown counts.
 */
export function computeLocationVibe(buffet: Buffet): LocationVibeResult {
  const b = buffet as Buffet & Record<string, unknown>;

  // ── Step 1: Build category breakdown from section poiCounts ─────────────
  const categoryBreakdown: Record<string, number> = {};
  let nearbyTotalCount = 0;

  for (const [sectionKey, categoryName] of Object.entries(SECTION_TO_CATEGORY)) {
    const section = b[sectionKey] as POISection | undefined;
    if (!section) continue;
    const count = section.poiCount ?? 0;
    if (count <= 0) continue;
    // Accumulate into the canonical category (multiple section keys may map
    // to the same display category name, e.g. artsCulture appears twice)
    categoryBreakdown[categoryName] = (categoryBreakdown[categoryName] ?? 0) + count;
    nearbyTotalCount += count;
  }

  // Edge case: no POI data
  if (nearbyTotalCount === 0) {
    return {
      locationVibe: 'Neighborhood Gem',
      locationVibeEmoji: '📍',
      locationVibeDescription: 'A standout spot in a quiet area — people come here on purpose.',
      nearbyTotalCount: 0,
      dominantCategory: '',
      categoryBreakdown: {},
    };
  }

  // ── Step 2: Derive per-category counts used by rules ────────────────────
  const foodDiningCount = categoryBreakdown['Food & Dining'] ?? 0;
  const retailCount = categoryBreakdown['Retail & Shopping'] ?? 0;
  const recreationCount = categoryBreakdown['Recreation & Entertainment'] ?? 0;
  const financialCount = categoryBreakdown['Financial Services'] ?? 0;
  const professionalCount = categoryBreakdown['Professional Services'] ?? 0;
  const artsCultureCount = categoryBreakdown['Arts & Culture'] ?? 0;
  const religiousSpiritualCount = categoryBreakdown['Religious & Spiritual'] ?? 0;

  // ── Step 3: Count Food & Dining subtypes ────────────────────────────────
  const foodDiningSection = b['foodDining'] as POISection | undefined;
  const { barPubCount, cafeCount } = countFoodSubtypes(foodDiningSection);

  // ── Step 4: Dominant category ────────────────────────────────────────────
  let dominantCategory = '';
  let dominantCount = -1;
  for (const [cat, count] of Object.entries(categoryBreakdown)) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantCategory = cat;
    }
  }

  // ── Step 5: Apply classification rules in priority order ────────────────

  // Rule 1 — Neighborhood Gem
  if (isNeighborhoodGem(nearbyTotalCount)) {
    return {
      locationVibe: 'Neighborhood Gem',
      locationVibeEmoji: '📍',
      locationVibeDescription: 'A standout spot in a quiet area — people come here on purpose.',
      nearbyTotalCount,
      dominantCategory,
      categoryBreakdown,
    };
  }

  // Rule 2 — Business District
  if (isBusinessDistrict(professionalCount, financialCount, nearbyTotalCount)) {
    return {
      locationVibe: 'Business District',
      locationVibeEmoji: '🏙️',
      locationVibeDescription:
        'Surrounded by offices and banks — ideal for a lunch break or after-work dinner.',
      nearbyTotalCount,
      dominantCategory,
      categoryBreakdown,
    };
  }

  // Rule 3 — Nightlife & Entertainment
  if (isNightlifeEntertainment(barPubCount, recreationCount, nearbyTotalCount)) {
    return {
      locationVibe: 'Nightlife & Entertainment',
      locationVibeEmoji: '🌃',
      locationVibeDescription:
        'In the heart of the action — bars, lounges, and entertainment nearby.',
      nearbyTotalCount,
      dominantCategory,
      categoryBreakdown,
    };
  }

  // Rule 4 — Cultural Food Hub
  if (
    isCulturalFoodHub(
      foodDiningCount,
      nearbyTotalCount,
      artsCultureCount,
      religiousSpiritualCount,
      cafeCount
    )
  ) {
    return {
      locationVibe: 'Cultural Food Hub',
      locationVibeEmoji: '🍜',
      locationVibeDescription:
        'A vibrant food district with diverse eateries, cafes, and cultural landmarks.',
      nearbyTotalCount,
      dominantCategory,
      categoryBreakdown,
    };
  }

  // Rule 5 — Shopping District
  if (isShoppingDistrict(retailCount, nearbyTotalCount, foodDiningCount)) {
    return {
      locationVibe: 'Shopping District',
      locationVibeEmoji: '🛍️',
      locationVibeDescription:
        'Set in a busy shopping area — great for combining dining with errands or browsing.',
      nearbyTotalCount,
      dominantCategory,
      categoryBreakdown,
    };
  }

  // Rule 6 — Suburban Center
  if (isSuburbanCenter(nearbyTotalCount, categoryBreakdown, 'Food & Dining')) {
    return {
      locationVibe: 'Suburban Center',
      locationVibeEmoji: '🏘️',
      locationVibeDescription:
        'A well-connected suburban area with a solid mix of dining, shopping, and services.',
      nearbyTotalCount,
      dominantCategory,
      categoryBreakdown,
    };
  }

  // Rule 7 — Mixed Urban (default fallback)
  return {
    locationVibe: 'Mixed Urban',
    locationVibeEmoji: '🌆',
    locationVibeDescription:
      'A dense, diverse urban area with plenty happening in every direction.',
    nearbyTotalCount,
    dominantCategory,
    categoryBreakdown,
  };
}

/**
 * Batch-compute location vibes for every buffet in the provided array.
 *
 * Each buffet is processed independently — there are no cross-buffet
 * statistics needed (unlike hiddenGemScore which requires city-level max
 * review counts).
 *
 * @param allBuffets - Flat array of buffets from any number of cities.
 * @returns A new array where each buffet is augmented with all
 *          LocationVibeResult fields. The original objects are not mutated.
 */
export function computeAllLocationVibes(allBuffets: Buffet[]): Buffet[] {
  return allBuffets.map((buffet) => {
    const vibeResult = computeLocationVibe(buffet);
    return { ...buffet, ...vibeResult };
  });
}
