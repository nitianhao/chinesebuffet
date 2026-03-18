/**
 * Quick Bite Score computation.
 *
 * Answers the question: "Can I get in, eat well, and get out fast?"
 * This is a meaningful differentiator for a buffet directory because many
 * places — especially hot pot and BBQ formats — require 1–2 hours of
 * cook-at-table dining. When a place IS genuinely quick, that's useful
 * info for lunch breakers, travelers, and busy people.
 *
 * The score is composed of five independent sub-scores:
 *
 *   quickBiteScore = speed (0–30)
 *                  + grabAndGo (0–25)
 *                  + budget (0–20)
 *                  + timeCommitment (0–15)
 *                  + convenience (0–10)
 *
 * Total is clamped to [0, 100].
 *
 * Tier classification:
 *   70–100 → "Perfect Quick Bite"   ⚡
 *   45–69  → "Solid Quick Option"   👍
 *   25–44  → "Not the Fastest"      🕐
 *   0–24   → null (not displayed)
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickBiteSubScores {
  /** Speed signals sub-score (0–30). */
  speed: number;
  /** Grab-and-go sub-score (0–25). */
  grabAndGo: number;
  /** Budget-friendly sub-score (0–20). */
  budget: number;
  /** Low time commitment sub-score (0–15). */
  timeCommitment: number;
  /** Convenience sub-score (0–10). */
  convenience: number;
}

export interface QuickBiteResult {
  /** Composite quick bite score, 0–100. */
  quickBiteScore: number;
  /**
   * Tier label, or null when score is 0–24.
   * - "Perfect Quick Bite"  (70–100)
   * - "Solid Quick Option"  (45–69)
   * - "Not the Fastest"     (25–44)
   */
  quickBiteTier: string | null;
  /** Display emoji for the tier, or null when score is 0–24. */
  quickBiteTierEmoji: string | null;
  /** Individual sub-scores that sum to quickBiteScore. */
  subScores: QuickBiteSubScores;
  /** Human-readable signals that increase the quick-bite score. */
  positiveSignals: string[];
  /** Human-readable signals that reduce the quick-bite score. */
  negativeSignals: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Extract the true-valued keys from an `additionalInfo` section.
 *
 * Each section is stored as `Array<Record<string, boolean>>` where each
 * element is a single-key object like `{ "Takeout": true }`. This helper
 * returns the keys whose value is strictly `true`.
 */
function extractInfoKeys(
  section: Array<Record<string, boolean>> | undefined | null
): string[] {
  if (!Array.isArray(section)) return [];
  const keys: string[] = [];
  for (const record of section) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, value] of Object.entries(record)) {
      if (value === true) keys.push(key);
    }
  }
  return keys;
}

/**
 * Build a lowercase Set from an `additionalInfo` section for case-insensitive
 * membership tests.
 */
function infoSet(
  section: Array<Record<string, boolean>> | undefined | null
): Set<string> {
  return new Set(extractInfoKeys(section).map((k) => k.toLowerCase()));
}

/** Return true if the set contains any of the given terms (case-insensitive). */
function hasAny(set: Set<string>, ...terms: string[]): boolean {
  return terms.some((t) => set.has(t.toLowerCase()));
}

/** Return true if the set contains a term that includes the given substring. */
function hasSubstring(set: Set<string>, substring: string): boolean {
  const lower = substring.toLowerCase();
  return Array.from(set).some((v) => v.includes(lower));
}

/**
 * Extract and lowercase FAQ pairs from the buffet's `questionsAndAnswers`
 * field.
 */
function getFaqPairs(
  buffet: Buffet
): Array<{ question: string; answer: string }> {
  if (!Array.isArray(buffet.questionsAndAnswers)) return [];
  return buffet.questionsAndAnswers.map((qa) => ({
    question: (qa.question ?? '').toLowerCase(),
    answer: (qa.answer ?? '').toLowerCase(),
  }));
}

/**
 * Build a lowercase Set from `reviewsTags` titles.
 *
 * `reviewsTags` is the canonical source for both `whatStandsOut` and
 * `quickVerdict` signals.
 */
function reviewsTagsSet(buffet: Buffet): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(buffet.reviewsTags)) {
    for (const tag of buffet.reviewsTags) {
      if (tag.title) out.add(tag.title.toLowerCase());
    }
  }
  return out;
}

/**
 * Build a lowercase Set from `additionalInfo.Planning` keys.
 * This represents `beforeYouGo` signals (e.g., "Parking available",
 * "Takeout available", "Delivery available").
 */
function buildBeforeYouGoSet(buffet: Buffet): Set<string> {
  return infoSet(buffet.additionalInfo?.['Planning']);
}

/**
 * Derive a `bestFor` Set from review text and additionalInfo attributes.
 *
 * Mirrors the logic in `BestForSection` so the scoring function can operate
 * on the same signals without importing UI components.
 */
function buildBestForSet(buffet: Buffet): Set<string> {
  const out = new Set<string>();

  // Review text heuristics
  const allText = (buffet.reviews ?? [])
    .map((r: any) =>
      ((r.textTranslated ?? r.text ?? '') as string).toLowerCase()
    )
    .join(' ');

  if (/\b(budget|affordable|cheap|inexpensive|value|good price|worth the price)\b/.test(allText)) {
    out.add('budget dining');
  }
  if (/\b(quick|fast|speedy|quick meal|quick lunch|fast service)\b/.test(allText)) {
    out.add('quick meals');
  }

  // Attribute heuristics: takeout/delivery = quick meals
  const serviceOptions = infoSet(buffet.additionalInfo?.['Service options']);
  if (hasAny(serviceOptions, 'takeout', 'delivery', 'take-out', 'to-go')) {
    out.add('quick meals');
  }

  // Price-string heuristic ($ or $$)
  const price = (buffet.price ?? '').toLowerCase();
  if (price === '$' || price === '$$') {
    out.add('budget dining');
  }

  // reviewsTags heuristics
  const tags = reviewsTagsSet(buffet);
  if (hasSubstring(tags, 'value') || hasSubstring(tags, 'affordable') || hasSubstring(tags, 'budget')) {
    out.add('budget dining');
  }
  if (hasSubstring(tags, 'quick') || hasSubstring(tags, 'fast')) {
    out.add('quick meals');
  }

  return out;
}

/**
 * Parse the lower price bound from a price range string like "14.29 - 22.50".
 * Returns null if the string is absent or unparseable.
 */
function parsePriceLowerBound(priceRangeStr: string | null | undefined): number | null {
  if (!priceRangeStr) return null;
  // Match a leading numeric token (optionally prefixed with $)
  const match = priceRangeStr.match(/^\$?([\d.]+)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

/**
 * Parse the earliest opening hour across all days in the buffet's `hours`
 * array. Returns the hour as a decimal (e.g., 11.5 for 11:30 AM), or null
 * if hours are unavailable.
 */
function parseEarliestOpenHour(buffet: Buffet): number | null {
  if (!Array.isArray(buffet.hours) || buffet.hours.length === 0) return null;

  let earliest: number | null = null;

  for (const entry of buffet.hours) {
    const hoursStr = (entry.hours ?? '').toLowerCase().trim();
    if (hoursStr === 'closed' || hoursStr === '') continue;
    if (hoursStr.includes('open 24')) {
      // Treat 24h places as opening at midnight (0)
      earliest = earliest === null ? 0 : Math.min(earliest, 0);
      continue;
    }

    // Extract the first time token (the opening time) before any dash separator
    const parts = hoursStr.split(/\s*[–—-]\s*/);
    const openPart = parts[0]?.trim();
    if (!openPart) continue;

    const hour = parseTimeToHour(openPart);
    if (hour === null) continue;
    earliest = earliest === null ? hour : Math.min(earliest, hour);
  }

  return earliest;
}

/**
 * Parse a time string like "11:30 am", "11am", "9:00" into a decimal hour.
 * Returns null if unparseable.
 */
function parseTimeToHour(timeStr: string): number | null {
  const match = timeStr
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const meridiem = (match[3] ?? '').toLowerCase();

  if (meridiem === 'pm') {
    if (hour !== 12) hour += 12;
  } else if (meridiem === 'am') {
    if (hour === 12) hour = 0;
  }
  // No meridiem: assume 24h

  return hour + minutes / 60;
}

// ---------------------------------------------------------------------------
// Sub-score computations
// ---------------------------------------------------------------------------

/**
 * Sub-Score 1: Speed Signals (max 30 points).
 *
 * Rewards explicit speed mentions in review tags, highlights, dining format,
 * and FAQ text.
 */
function computeSpeedScore(
  reviewTags: Set<string>,
  highlights: Set<string>,
  diningOptions: Set<string>,
  faqPairs: Array<{ question: string; answer: string }>,
  positiveSignals: string[]
): number {
  let score = 0;

  // "Quick service" in reviewsTags (+15)
  if (hasSubstring(reviewTags, 'quick service')) {
    score += 15;
    positiveSignals.push('Quick service noted by reviewers');
  }

  // "Fast service" in highlights (+10)
  if (hasSubstring(highlights, 'fast service')) {
    score += 10;
    positiveSignals.push('Fast service');
  }

  // "Counter service" in diningOptions (+8)
  if (hasAny(diningOptions, 'counter service')) {
    score += 8;
    positiveSignals.push('Counter service available');
  }

  // FAQ answer contains "self service" or "semi-self service" (+5)
  const selfServiceInFaq = faqPairs.some(({ answer }) =>
    /self[\s-]?service|semi[\s-]?self[\s-]?service/i.test(answer)
  );
  if (selfServiceInFaq) {
    score += 5;
    positiveSignals.push('Semi-self service format');
  }

  // FAQ answer contains food/order + quick/fast/no wait/right away/came out fast
  // within the same sentence (+5)
  const quickFoodInFaq = faqPairs.some(({ answer }) => {
    const sentences = answer.split(/[.!?]+/);
    return sentences.some(
      (s) =>
        /\b(food|order)\b/.test(s) &&
        /\b(quick|fast|no wait|right away|came out fast)\b/.test(s)
    );
  });
  if (quickFoodInFaq) {
    score += 5;
    positiveSignals.push('Fast food turnaround noted in FAQ');
  }

  return clamp(score, 0, 30);
}

/**
 * Sub-Score 2: Grab-and-Go (max 25 points).
 *
 * Rewards takeout, curbside pickup, delivery, and meal-takeaway place types.
 */
function computeGrabAndGoScore(
  serviceOptions: Set<string>,
  amenities: Set<string>,
  placeTypes: Set<string>,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  let score = 0;

  // Takeout (+10)
  if (hasAny(serviceOptions, 'takeout', 'take-out', 'take out')) {
    score += 10;
    positiveSignals.push('Takeout available');
  } else {
    negativeSignals.push('No takeout option');
  }

  // Curbside Pickup (+8)
  if (hasAny(amenities, 'curbside pickup', 'curbside')) {
    score += 8;
    positiveSignals.push('Curbside pickup');
  }

  // Delivery (+5)
  if (hasAny(serviceOptions, 'delivery')) {
    score += 5;
    positiveSignals.push('Delivery available');
  }

  // "Meal Takeaway" in placeTypes/categories (+2)
  if (hasSubstring(placeTypes, 'meal takeaway')) {
    score += 2;
  }

  return clamp(score, 0, 25);
}

/**
 * Sub-Score 3: Budget Friendly (max 20 points).
 *
 * Rewards explicit budget signals, affordable pricing, and price FAQ mentions.
 */
function computeBudgetScore(
  bestFor: Set<string>,
  reviewTags: Set<string>,
  priceStr: string | null | undefined,
  faqPairs: Array<{ question: string; answer: string }>,
  positiveSignals: string[]
): number {
  let score = 0;

  // "Budget dining" in bestFor (+7)
  if (hasSubstring(bestFor, 'budget dining') || hasAny(bestFor, 'budget dining')) {
    score += 7;
    positiveSignals.push('Budget-friendly pricing');
  }

  // "Good value for price" in quickVerdict/reviewTags (+5)
  if (hasSubstring(reviewTags, 'good value for price') || hasSubstring(reviewTags, 'good value')) {
    score += 5;
    positiveSignals.push('Good value for price');
  }

  // "Great value for families" in whatStandsOut/reviewTags (+3)
  if (hasSubstring(reviewTags, 'great value for families') || hasSubstring(reviewTags, 'great value')) {
    score += 3;
    positiveSignals.push('Great value for families');
  }

  // Price range: parse lower bound
  const lowerBound = parsePriceLowerBound(priceStr);
  if (lowerBound !== null) {
    if (lowerBound < 16) {
      score += 10;
      positiveSignals.push('Under $16 per person');
    } else if (lowerBound < 25) {
      score += 5;
      positiveSignals.push('Moderate pricing');
    }
  }

  // FAQ price pattern: per-person < $20 or for-two < $35 (+5)
  const affordableFaq = faqPairs.some(({ answer }) => {
    // Look for "$XX" or "XX dollars" patterns
    const priceMatches = Array.from(answer.matchAll(/\$(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*dollars/gi));
    for (const m of priceMatches) {
      const amount = parseFloat(m[1] ?? m[2] ?? '');
      if (isNaN(amount)) continue;
      // Per-person context
      if (/per person|each|per head/i.test(answer) && amount < 20) return true;
      // For two context
      if (/for (two|2)|two people|2 people/i.test(answer) && amount < 35) return true;
    }
    return false;
  });
  if (affordableFaq) {
    score += 5;
    positiveSignals.push('Affordable for two');
  }

  return clamp(score, 0, 20);
}

/**
 * Sub-Score 4: Low Time Commitment (max 15 points).
 *
 * Starts at 15 and applies penalties for cook-at-table and other
 * experiential formats that guarantee a long meal.
 */
function computeTimeCommitmentScore(
  name: string,
  placeTypes: Set<string>,
  diningOptions: Set<string>,
  faqPairs: Array<{ question: string; answer: string }>,
  negativeSignals: string[]
): number {
  let score = 15;

  // Cook-at-table FAQ penalty (-10)
  const cookAtTable = faqPairs.some(({ answer }) =>
    /cook at the table|cook your food|cook your own|cook all your food|grill at your table|cook it yourself/i.test(answer)
  );
  if (cookAtTable) {
    score -= 10;
    negativeSignals.push('Cook-at-table format');
  }

  // iPad multi-round ordering penalty (-3)
  const ipadOrdering = faqPairs.some(({ answer }) =>
    /ipad/i.test(answer) && /order|ordering/i.test(answer)
  );
  if (ipadOrdering) {
    score -= 3;
    negativeSignals.push('Multi-round tablet ordering');
  }

  // Hot pot name penalty (-5, not Fast Food)
  if (/hot\s?pot/i.test(name) && !hasSubstring(placeTypes, 'fast food')) {
    score -= 5;
  }

  // BBQ / Grill name penalty (-5, not Fast Food)
  if (/\bbbq\b|\bgrill\b/i.test(name) && !hasSubstring(placeTypes, 'fast food')) {
    score -= 5;
  }

  // Table service without Counter service penalty (-3)
  if (
    hasAny(diningOptions, 'table service') &&
    !hasAny(diningOptions, 'counter service')
  ) {
    score -= 3;
  }

  score = clamp(score, 0, 15);

  if (score <= 5) {
    negativeSignals.push('Experiential dining — expect a longer meal');
    if (score <= 0) {
      if (/hot\s?pot/i.test(name)) {
        negativeSignals.push('Multi-course hot pot experience');
      }
    }
  }

  return score;
}

/**
 * Sub-Score 5: Convenience (max 10 points).
 *
 * Rewards places explicitly suited for quick meals, offering lunch service,
 * and opening early.
 */
function computeConvenienceScore(
  bestFor: Set<string>,
  diningOptions: Set<string>,
  buffet: Buffet,
  positiveSignals: string[]
): number {
  let score = 0;

  // "Quick meals" in bestFor (+5)
  if (hasSubstring(bestFor, 'quick meals') || hasAny(bestFor, 'quick meals')) {
    score += 5;
    positiveSignals.push('Ideal for quick meals');
  }

  // "Lunch" in diningOptions (+3)
  if (hasAny(diningOptions, 'lunch')) {
    score += 3;
    positiveSignals.push('Lunch service available');
  }

  // Opens at 11:30 AM or earlier (+2)
  const earliestOpen = parseEarliestOpenHour(buffet);
  if (earliestOpen !== null && earliestOpen <= 11.5) {
    score += 2;
    positiveSignals.push('Opens early');
  }

  return clamp(score, 0, 10);
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

function scoreToTier(score: number): {
  quickBiteTier: string | null;
  quickBiteTierEmoji: string | null;
} {
  if (score >= 70) return { quickBiteTier: 'Perfect Quick Bite', quickBiteTierEmoji: '⚡' };
  if (score >= 45) return { quickBiteTier: 'Solid Quick Option', quickBiteTierEmoji: '👍' };
  if (score >= 25) return { quickBiteTier: 'Not the Fastest', quickBiteTierEmoji: '🕐' };
  return { quickBiteTier: null, quickBiteTierEmoji: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the Quick Bite Score and tier for a single buffet.
 *
 * Reads directly from the raw `Buffet` type — no pre-processing required.
 * All five sub-scores are computed independently and summed.
 *
 * @param buffet - A single buffet object from the data pipeline.
 * @returns Full QuickBiteResult including score, tier, sub-scores, and signals.
 */
export function computeQuickBiteScore(buffet: Buffet): QuickBiteResult {
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  // ── Extract normalised sets from additionalInfo ──────────────────────────
  const highlights = infoSet(buffet.additionalInfo?.['Highlights']);
  const diningOptions = infoSet(buffet.additionalInfo?.['Dining options']);
  const serviceOptions = infoSet(buffet.additionalInfo?.['Service options']);
  const amenities = infoSet(buffet.additionalInfo?.['Amenities']);

  // ── Derived sets ─────────────────────────────────────────────────────────
  const reviewTags = reviewsTagsSet(buffet);
  const bestFor = buildBestForSet(buffet);
  const faqPairs = getFaqPairs(buffet);

  // placeTypes → buffet.categories (e.g. ["Food", "Meal Takeaway", "Fast Food"])
  const placeTypes = new Set<string>(
    (buffet.categories ?? []).map((c) => c.toLowerCase())
  );

  // priceRange → buffet.price (e.g. "14.29 - 22.50" or "$" / "$$")
  const priceStr = buffet.price ?? null;

  // ── Sub-score 1: Speed ────────────────────────────────────────────────────
  const speed = computeSpeedScore(
    reviewTags,
    highlights,
    diningOptions,
    faqPairs,
    positiveSignals
  );

  // ── Sub-score 2: Grab-and-Go ─────────────────────────────────────────────
  const grabAndGo = computeGrabAndGoScore(
    serviceOptions,
    amenities,
    placeTypes,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 3: Budget ───────────────────────────────────────────────────
  const budget = computeBudgetScore(
    bestFor,
    reviewTags,
    priceStr,
    faqPairs,
    positiveSignals
  );

  // ── Sub-score 4: Time Commitment ─────────────────────────────────────────
  const timeCommitment = computeTimeCommitmentScore(
    buffet.name ?? '',
    placeTypes,
    diningOptions,
    faqPairs,
    negativeSignals
  );

  // ── Sub-score 5: Convenience ─────────────────────────────────────────────
  const convenience = computeConvenienceScore(
    bestFor,
    diningOptions,
    buffet,
    positiveSignals
  );

  // ── Final score ───────────────────────────────────────────────────────────
  const rawTotal = speed + grabAndGo + budget + timeCommitment + convenience;
  const quickBiteScore = clamp(rawTotal, 0, 100);
  const { quickBiteTier, quickBiteTierEmoji } = scoreToTier(quickBiteScore);

  return {
    quickBiteScore,
    quickBiteTier,
    quickBiteTierEmoji,
    subScores: { speed, grabAndGo, budget, timeCommitment, convenience },
    positiveSignals,
    negativeSignals,
  };
}

/**
 * Batch-compute quick bite scores for every buffet in the provided array.
 *
 * Each buffet is processed independently — no cross-buffet dependency.
 *
 * @param allBuffets - Flat array of buffets from any number of cities.
 * @returns A new array where each buffet is augmented with all quickBite*
 *          fields. Original objects are not mutated.
 */
export function computeAllQuickBiteScores(allBuffets: Buffet[]): Buffet[] {
  return allBuffets.map((buffet) => {
    const result = computeQuickBiteScore(buffet);
    return {
      ...buffet,
      quickBiteScore: result.quickBiteScore,
      quickBiteTier: result.quickBiteTier,
      quickBiteTierEmoji: result.quickBiteTierEmoji,
      quickBiteSubScores: result.subScores,
      quickBitePositiveSignals: result.positiveSignals,
      quickBiteNegativeSignals: result.negativeSignals,
    };
  });
}
