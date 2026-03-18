/**
 * Strength Profile computation.
 *
 * Maps each buffet's strengths into a 5-axis radar chart data structure,
 * providing a human-readable "shape" label for how well the buffet performs
 * across Food Quality, Service, Variety, Value, and Atmosphere.
 *
 * Each axis scores 0–20. Total max = 100.
 *
 * Axis scoring overview:
 *   Food Quality (0–20) — taste and freshness signals from reviewsTags and FAQs
 *   Service      (0–20) — friendliness and speed signals from reviewsTags and FAQs
 *   Variety      (0–20) — selection and range signals from reviewsTags, quickVerdict, FAQs, description
 *   Value        (0–20) — price-worthiness signals from reviewsTags, bestFor, price string, FAQs
 *   Atmosphere   (0–20) — environment signals from reviewsTags, additionalInfo.Atmosphere, FAQs
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrengthProfileAxes {
  /** Food Quality axis score, 0–20. */
  foodQuality: number;
  /** Service axis score, 0–20. */
  service: number;
  /** Variety axis score, 0–20. */
  variety: number;
  /** Value axis score, 0–20. */
  value: number;
  /** Atmosphere axis score, 0–20. */
  atmosphere: number;
}

export interface StrengthProfileResult {
  /** Individual axis scores (each 0–20). */
  axes: StrengthProfileAxes;
  /** Sum of all axis scores, 0–100. */
  totalScore: number;
  /** Label of the highest-scoring axis, e.g. "Food Quality". */
  dominantStrength: string;
  /** Label of the lowest-scoring axis, e.g. "Atmosphere". */
  weakestArea: string;
  /** All axes scoring >= 12, sorted descending by score. */
  dominantStrengths: string[];
  /**
   * Human-readable shape label, or null when totalScore < 30 with 0 strong axes.
   *   "All-Rounder"         — 4+ axes >= 12
   *   "Triple Threat"       — exactly 3 axes >= 12
   *   "[A] & [B]"           — exactly 2 axes >= 12
   *   "[A] Standout"        — exactly 1 axis >= 12
   *   "Solid Across the Board" — 0 axes >= 12, totalScore >= 30
   *   null                  — 0 axes >= 12, totalScore < 30
   */
  profileTag: string | null;
  /** Display emoji for the profileTag, or null. */
  profileTagEmoji: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Axis display labels keyed by property name. */
const AXIS_LABELS: Record<keyof StrengthProfileAxes, string> = {
  foodQuality: 'Food Quality',
  service: 'Service',
  variety: 'Variety',
  value: 'Value',
  atmosphere: 'Atmosphere',
};

/** Clamp a number to [0, max]. */
function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

/**
 * Build a lowercase set from `buffet.reviewsTags` titles.
 *
 * This is the canonical source for both `whatStandsOut` signals
 * (e.g. "Delicious food", "Friendly service") and `quickVerdict` signals
 * (e.g. "Good value for price", "Reviewers mention good variety").
 */
function buildTagsSet(buffet: Buffet): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(buffet.reviewsTags)) {
    for (const tag of buffet.reviewsTags) {
      if (tag.title) out.add(tag.title.toLowerCase());
    }
  }
  return out;
}

/**
 * Extract the true-valued keys from an `additionalInfo` section.
 *
 * Each section is stored as `Array<Record<string, boolean>>` where each
 * element is a single-key object like `{ "Cozy": true }`. Returns the keys
 * whose value is strictly `true`, lowercased.
 */
function extractInfoKeys(
  section: Array<Record<string, boolean>> | undefined | null
): string[] {
  if (!Array.isArray(section)) return [];
  const keys: string[] = [];
  for (const record of section) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, value] of Object.entries(record)) {
      if (value === true) keys.push(key.toLowerCase());
    }
  }
  return keys;
}

/**
 * Extract FAQ answer strings (lowercased) from `buffet.questionsAndAnswers`.
 */
function getFaqAnswers(buffet: Buffet): string[] {
  if (!Array.isArray(buffet.questionsAndAnswers)) return [];
  return buffet.questionsAndAnswers.map((qa) =>
    (qa.answer ?? '').toLowerCase()
  );
}

/**
 * Derive the bestFor set from reviewsTags and the buffet's price string.
 *
 * The canonical `bestFor` values referenced by scoring rules are:
 *   "budget dining"
 */
function buildBestForSet(buffet: Buffet): Set<string> {
  const out = new Set<string>();

  // Price symbol heuristic
  const price = (buffet.price ?? '').toLowerCase().trim();
  if (price === '$' || price === '$$') {
    out.add('budget dining');
  }

  // reviewsTags heuristics — tags that contain value/budget signals
  if (Array.isArray(buffet.reviewsTags)) {
    for (const tag of buffet.reviewsTags) {
      const title = (tag.title ?? '').toLowerCase();
      if (/\b(value|affordable|budget|inexpensive|cheap)\b/.test(title)) {
        out.add('budget dining');
      }
    }
  }

  return out;
}

/**
 * Parse the lower price bound from a price range string like "14.29 - 22.50"
 * or a Yelp-style price string like "$" / "$$". Returns null if unparseable.
 *
 * Only parses numeric strings (e.g. "14.29 - 22.50"); dollar-sign-only strings
 * are not treated as numeric ranges.
 */
function parsePriceLowerBound(priceStr: string | null | undefined): number | null {
  if (!priceStr) return null;
  // Match a leading numeric token (optionally prefixed with $)
  const match = priceStr.match(/^\$?([\d.]+)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

/**
 * Scan FAQ answer strings for any of the provided keywords.
 *
 * Performs case-insensitive, whole-word-ish matching: the keyword must appear
 * as a standalone word (not embedded inside a longer word). For example,
 * "friendly" matches "staff is friendly" but NOT "unfriendly".
 *
 * @param faqPairs - Array of FAQ objects with at least an `answer` field.
 * @param keywords - List of keywords to look for.
 * @returns true if ANY answer contains ANY keyword as a word boundary match.
 */
export function scanFaqsForKeywords(
  faqPairs: Array<{ answer?: string | null; [key: string]: any }> | null | undefined,
  keywords: string[]
): boolean {
  if (!Array.isArray(faqPairs) || faqPairs.length === 0) return false;
  if (keywords.length === 0) return false;

  // Build a single regex with word-boundary anchors for all keywords
  const pattern = new RegExp(
    `\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'i'
  );

  for (const qa of faqPairs) {
    const answer = qa.answer ?? '';
    if (pattern.test(answer)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Axis computations
// ---------------------------------------------------------------------------

/**
 * Compute the Food Quality axis score (max 20).
 *
 * Point sources:
 *   +8  — whatStandsOut includes "Delicious food" (reviewsTags title)
 *   +7  — whatStandsOut includes "Fresh, quality food" (reviewsTags title)
 *   +3  — any FAQ answer contains "delicious", "amazing", "incredible", or "best"
 *          when clearly about food quality
 *   +2  — any FAQ answer contains "fresh" when about food/ingredients
 *
 * @param tagsSet - Lowercased set built from reviewsTags titles.
 * @param faqAnswers - Lowercased FAQ answer strings.
 * @returns Clamped score in [0, 20].
 */
function computeFoodQualityScore(
  tagsSet: Set<string>,
  faqAnswers: string[]
): number {
  let score = 0;

  if (tagsSet.has('delicious food')) score += 8;
  if (tagsSet.has('fresh, quality food')) score += 7;

  // FAQ: taste keywords
  const tastePhrasePattern = /\b(delicious|amazing|incredible|best)\b/i;
  if (faqAnswers.some((a) => tastePhrasePattern.test(a))) score += 3;

  // FAQ: freshness keyword
  const freshPattern = /\bfresh\b/i;
  if (faqAnswers.some((a) => freshPattern.test(a))) score += 2;

  return clamp(score, 20);
}

/**
 * Compute the Service axis score (max 20).
 *
 * Point sources:
 *   +8  — whatStandsOut includes "Friendly service"
 *   +7  — whatStandsOut includes "Quick service"
 *   +3  — any FAQ answer contains "friendly", "attentive", "helpful", or
 *          "welcoming" when about staff/service
 *   +2  — any FAQ answer contains "fast", "quick", "no wait", or "efficient"
 *          when about service/wait time
 *
 * @param tagsSet - Lowercased set built from reviewsTags titles.
 * @param faqAnswers - Lowercased FAQ answer strings.
 * @returns Clamped score in [0, 20].
 */
function computeServiceScore(
  tagsSet: Set<string>,
  faqAnswers: string[]
): number {
  let score = 0;

  if (tagsSet.has('friendly service')) score += 8;
  if (tagsSet.has('quick service')) score += 7;

  // FAQ: friendliness keywords
  const friendlyPattern = /\b(friendly|attentive|helpful|welcoming)\b/i;
  if (faqAnswers.some((a) => friendlyPattern.test(a))) score += 3;

  // FAQ: speed keywords
  const speedPattern = /\b(fast|quick|no wait|efficient)\b/i;
  if (faqAnswers.some((a) => speedPattern.test(a))) score += 2;

  return clamp(score, 20);
}

/**
 * Compute the Variety axis score (max 20).
 *
 * Point sources:
 *   +10 — whatStandsOut includes "Huge selection"
 *   +5  — quickVerdict includes "Reviewers mention good variety"
 *   +3  — any FAQ answer contains "variety", "selection", "many options",
 *          "wide range", "lots of options", or "different food"
 *   +2  — buffet description contains "wide variety", "extensive",
 *          "array of options", "wide range", or "wide selection"
 *
 * @param tagsSet - Lowercased set built from reviewsTags titles.
 * @param faqAnswers - Lowercased FAQ answer strings.
 * @param description - Buffet description text (may be null/undefined).
 * @returns Clamped score in [0, 20].
 */
function computeVarietyScore(
  tagsSet: Set<string>,
  faqAnswers: string[],
  description: string | null | undefined
): number {
  let score = 0;

  if (tagsSet.has('huge selection')) score += 10;
  if (tagsSet.has('reviewers mention good variety')) score += 5;

  // FAQ: variety/selection keywords
  const varietyPattern = /\b(variety|selection|many options|wide range|lots of options|different food)\b/i;
  if (faqAnswers.some((a) => varietyPattern.test(a))) score += 3;

  // Description: breadth indicators
  if (description) {
    const desc = description.toLowerCase();
    const descPattern = /\b(wide variety|extensive|array of options|wide range|wide selection)\b/;
    if (descPattern.test(desc)) score += 2;
  }

  return clamp(score, 20);
}

/**
 * Compute the Value axis score (max 20).
 *
 * Point sources:
 *   +8  — whatStandsOut includes "Great value for families"
 *   +5  — quickVerdict includes "Good value for price"
 *   +4  — bestFor includes "Budget dining"
 *   +3  — priceRange exists and lower bound is < 20 (numeric range strings only)
 *   +3  — any FAQ answer contains "affordable", "reasonable", "worth the price",
 *          "good deal", or "great value"
 *
 * @param tagsSet - Lowercased set built from reviewsTags titles.
 * @param bestForSet - Derived bestFor set (lowercase).
 * @param priceStr - Raw price string from buffet.price (e.g. "14.29 - 22.50" or "$").
 * @param faqAnswers - Lowercased FAQ answer strings.
 * @returns Clamped score in [0, 20].
 */
function computeValueScore(
  tagsSet: Set<string>,
  bestForSet: Set<string>,
  priceStr: string | null | undefined,
  faqAnswers: string[]
): number {
  let score = 0;

  if (tagsSet.has('great value for families')) score += 8;
  if (tagsSet.has('good value for price')) score += 5;
  if (bestForSet.has('budget dining')) score += 4;

  // Price lower bound < $20 signals affordability
  const lowerBound = parsePriceLowerBound(priceStr);
  if (lowerBound !== null && lowerBound < 20) score += 3;

  // FAQ: value keywords
  const valuePattern = /\b(affordable|reasonable|worth the price|good deal|great value)\b/i;
  if (faqAnswers.some((a) => valuePattern.test(a))) score += 3;

  return clamp(score, 20);
}

/**
 * Compute the Atmosphere axis score (max 20).
 *
 * Point sources:
 *   +8  — whatStandsOut includes "Nice atmosphere"
 *   +7  — whatStandsOut includes "Clean, comfortable"
 *   +3  — additionalInfo.Atmosphere includes "Cozy"
 *   +2  — additionalInfo.Atmosphere includes "Trendy"
 *   +3  — additionalInfo.Atmosphere includes "Romantic" or "Intimate"
 *   +1  — additionalInfo.Atmosphere includes "Quiet"
 *   +2  — any FAQ answer contains "clean", "atmosphere", "ambiance",
 *          "comfortable", or "welcoming" when describing the environment
 *
 * @param tagsSet - Lowercased set built from reviewsTags titles.
 * @param atmosphereTags - Lowercased atmosphere tag strings from additionalInfo.Atmosphere.
 * @param faqAnswers - Lowercased FAQ answer strings.
 * @returns Clamped score in [0, 20].
 */
function computeAtmosphereScore(
  tagsSet: Set<string>,
  atmosphereTags: string[],
  faqAnswers: string[]
): number {
  let score = 0;

  if (tagsSet.has('nice atmosphere')) score += 8;
  if (tagsSet.has('clean, comfortable')) score += 7;

  const atmosSet = new Set(atmosphereTags.map((t) => t.toLowerCase()));
  if (atmosSet.has('cozy')) score += 3;
  if (atmosSet.has('trendy')) score += 2;
  if (atmosSet.has('romantic') || atmosSet.has('intimate')) score += 3;
  if (atmosSet.has('quiet')) score += 1;

  // FAQ: environment/ambiance keywords
  const envPattern = /\b(clean|atmosphere|ambiance|comfortable|welcoming)\b/i;
  if (faqAnswers.some((a) => envPattern.test(a))) score += 2;

  return clamp(score, 20);
}

// ---------------------------------------------------------------------------
// Profile tag classification
// ---------------------------------------------------------------------------

/**
 * Classify the profile shape from axis scores into a human-readable tag.
 *
 * Rules (first match wins):
 *   strongCount >= 4 → "All-Rounder" / "⭐"
 *   strongCount == 3 → "Triple Threat" / "🔱"
 *   strongCount == 2 → "[Top1] & [Top2]" / "💪"
 *   strongCount == 1 → "[Top1] Standout" / "🎯"
 *   strongCount == 0 and totalScore >= 30 → "Solid Across the Board" / "👌"
 *   strongCount == 0 and totalScore < 30  → null / null
 *
 * Tie-breaking for top axes uses alphabetical order by axis name.
 *
 * @param axes - The computed axis scores.
 * @param totalScore - Sum of all axis scores.
 * @returns { profileTag, profileTagEmoji }
 */
function classifyProfileTag(
  axes: StrengthProfileAxes,
  totalScore: number
): { profileTag: string | null; profileTagEmoji: string | null } {
  const entries = (Object.keys(axes) as Array<keyof StrengthProfileAxes>).map(
    (key) => ({ key, label: AXIS_LABELS[key], score: axes[key] })
  );

  const strongAxes = entries.filter((e) => e.score >= 12);
  const strongCount = strongAxes.length;

  // Sort descending by score, break ties alphabetically by label
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });

  if (strongCount >= 4) {
    return { profileTag: 'All-Rounder', profileTagEmoji: '⭐' };
  }
  if (strongCount === 3) {
    return { profileTag: 'Triple Threat', profileTagEmoji: '🔱' };
  }
  if (strongCount === 2) {
    const top = entries.slice(0, 2);
    return {
      profileTag: `${top[0].label} & ${top[1].label}`,
      profileTagEmoji: '💪',
    };
  }
  if (strongCount === 1) {
    const top = entries[0];
    return {
      profileTag: `${top.label} Standout`,
      profileTagEmoji: '🎯',
    };
  }
  if (totalScore >= 30) {
    return { profileTag: 'Solid Across the Board', profileTagEmoji: '👌' };
  }
  return { profileTag: null, profileTagEmoji: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the Strength Profile for a single buffet.
 *
 * Reads directly from the raw `Buffet` type and derives all signals from:
 *   - `reviewsTags`       → whatStandsOut + quickVerdict signals (lowercase set)
 *   - `questionsAndAnswers` → FAQ text scanning
 *   - `additionalInfo.Atmosphere` → atmosphere tags
 *   - `price`             → price range for affordability signal
 *   - `description`       → variety breadth indicator
 *
 * All axis scores are independently computed and clamped to [0, 20].
 *
 * @param buffet - A single buffet object from the data pipeline.
 * @returns Full StrengthProfileResult with axes, totals, labels, and tag.
 */
export function computeStrengthProfile(buffet: Buffet): StrengthProfileResult {
  // ── Normalise input signals ──────────────────────────────────────────────
  const tagsSet = buildTagsSet(buffet);
  const faqAnswers = getFaqAnswers(buffet);
  const bestForSet = buildBestForSet(buffet);
  const atmosphereTags = extractInfoKeys(buffet.additionalInfo?.['Atmosphere']);
  const description = buffet.description ?? null;
  const priceStr = buffet.price ?? null;

  // ── Compute each axis ────────────────────────────────────────────────────
  const axes: StrengthProfileAxes = {
    foodQuality: computeFoodQualityScore(tagsSet, faqAnswers),
    service: computeServiceScore(tagsSet, faqAnswers),
    variety: computeVarietyScore(tagsSet, faqAnswers, description),
    value: computeValueScore(tagsSet, bestForSet, priceStr, faqAnswers),
    atmosphere: computeAtmosphereScore(tagsSet, atmosphereTags, faqAnswers),
  };

  // ── Aggregate ────────────────────────────────────────────────────────────
  const totalScore = axes.foodQuality + axes.service + axes.variety + axes.value + axes.atmosphere;

  // Sorted entries for dominant/weakest determination (desc score, alpha tiebreak)
  const entries = (Object.keys(axes) as Array<keyof StrengthProfileAxes>).map(
    (key) => ({ key, label: AXIS_LABELS[key], score: axes[key] })
  );
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });

  const dominantStrength = entries[0].label;
  const weakestArea = entries[entries.length - 1].label;

  // dominantStrengths = all axes >= 12, sorted descending
  const dominantStrengths = entries
    .filter((e) => e.score >= 12)
    .map((e) => e.label);

  // ── Profile tag ──────────────────────────────────────────────────────────
  const { profileTag, profileTagEmoji } = classifyProfileTag(axes, totalScore);

  return {
    axes,
    totalScore,
    dominantStrength,
    weakestArea,
    dominantStrengths,
    profileTag,
    profileTagEmoji,
  };
}

/**
 * Compute Strength Profiles for every buffet in an array.
 *
 * @param allBuffets - Array of buffet objects to process.
 * @returns New array where each buffet object is augmented with a
 *          `strengthProfile` field containing its computed result.
 */
export function computeAllStrengthProfiles<T extends Buffet>(
  allBuffets: T[]
): (T & { strengthProfile: StrengthProfileResult })[] {
  return allBuffets.map((buffet) => ({
    ...buffet,
    strengthProfile: computeStrengthProfile(buffet),
  }));
}
