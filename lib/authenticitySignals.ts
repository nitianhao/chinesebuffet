/**
 * Authenticity Signal Detection
 *
 * Detects signals of authentic regional Chinese cuisine in buffet listing data
 * using deterministic string matching — no external dependencies, no AI/LLM calls.
 *
 * Five signal types are detected:
 *   1. Explicit "authentic" keyword paired with a regional cuisine reference
 *   2. Chinese characters (CJK Unified Ideographs) in the restaurant name
 *   3. Regional Chinese cuisine specialization keywords
 *   4. Traditional preparation method keywords
 *   5. Specific regional dish names
 *
 * Scoring:
 *   Signal 1 (explicit authentic): 30 pts (once)
 *   Signal 2 (Chinese characters):  15 pts
 *   Signal 3 (regional cuisine):    20 pts first match, +5 per additional unique (cap 30)
 *   Signal 4 (traditional prep):    15 pts first match, +5 per additional unique (cap 25)
 *   Signal 5 (regional dishes):      5 pts per unique dish (cap 30)
 *   Maximum raw: 130 → capped at 100
 *
 * Tier classification:
 *   75–100 → "Verified Authentic 🔥"
 *   50–74  → "Regional Specialist 🏮"
 *   25–49  → "Traditional Touches 🥢"
 *   0–24   → null (no tier displayed)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthenticitySignal {
  /**
   * Which detection rule fired.
   * - "explicit_authentic" — the word "authentic" + regional cuisine reference
   * - "chinese_characters"  — CJK characters in the restaurant name
   * - "regional_cuisine"    — a regional cuisine keyword matched
   * - "traditional_prep"    — a traditional preparation method keyword matched
   * - "regional_dishes"     — a known regional dish name matched
   */
  signalType:
    | 'explicit_authentic'
    | 'chinese_characters'
    | 'regional_cuisine'
    | 'traditional_prep'
    | 'regional_dishes';
  /** The actual text snippet that triggered this signal. */
  evidence: string;
  /** Where in the buffet data the evidence was found. */
  source: 'name' | 'description' | 'faq_answer' | 'faq_question' | 'menu';
  /**
   * The Chinese regional cuisine implied by this signal, if determinable.
   * E.g. "Sichuan", "Taiwanese", "Cantonese". Undefined when the signal is
   * generic (e.g. "Hot Pot", "Chinese characters with no cuisine context").
   */
  impliedCuisine?: string;
}

export interface AuthenticityResult {
  /** Composite score, 0–100. */
  authenticityScore: number;
  /**
   * Descriptive tier based on authenticityScore, or null when score < 25.
   * - "Verified Authentic 🔥"   (75–100)
   * - "Regional Specialist 🏮"  (50–74)
   * - "Traditional Touches 🥢"  (25–49)
   */
  authenticityTier: string | null;
  /** Display emoji for the tier, or null. */
  authenticityTierEmoji: string | null;
  /** Unique list of detected regional cuisines across all signals. */
  cuisineOrigins: string[];
  /** The cuisine most frequently referenced across all signals, or null. */
  primaryCuisine: string | null;
  /** All detected signals in the order they were found. */
  signals: AuthenticitySignal[];
  /** Total number of signals detected. */
  signalCount: number;
}

/** The subset of Buffet fields used by this module. */
interface BuffetForAuthenticity {
  name?: string | null;
  description?: string | null;
  description2?: string | null;
  questionsAndAnswers?: Array<{
    question?: string;
    answer?: string;
    [key: string]: unknown;
  }> | null;
  menuItems?: Array<{
    name: string;
    description?: string;
    [key: string]: unknown;
  }> | null;
  /** reviewsTags titles (e.g. ["Delicious food", "Fresh ingredients"]) */
  reviewsTags?: Array<{ title: string; count?: number }> | null;
}

// ---------------------------------------------------------------------------
// Constants — Regional cuisine keyword dictionary
// ---------------------------------------------------------------------------

/**
 * Maps a canonical cuisine name to the terms that identify it.
 * Add or expand entries here to extend detection coverage.
 *
 * Keys are the canonical cuisine names used in AuthenticitySignal.impliedCuisine.
 * Values are the lowercase search terms (checked with whole-word or substring match).
 */
export const REGIONAL_CUISINE_KEYWORDS: Record<string, string[]> = {
  Sichuan: [
    'sichuan',
    'szechuan',
    'szechwan',
    'ma la',
    'mala',
    'ma la tang',
    'malatang',
  ],
  Taiwanese: ['taiwanese', 'taiwan'],
  Cantonese: ['cantonese', 'canton', 'dim sum'],
  Hunanese: ['hunanese', 'hunan'],
  Shanghainese: ['shanghainese', 'shanghai'],
  Yunnan: ['yunnan'],
  Dongbei: ['dongbei', 'northeastern chinese', 'northeast chinese'],
  Fujian: ['fujian', 'hokkien'],
  Hakka: ['hakka'],
  Uyghur: ['uyghur', 'xinjiang'],
  Beijing: ['beijing', 'peking'],
  'Hot Pot': ['hot pot', 'hotpot', 'hot-pot'],
  BBQ: ['bbq', 'korean bbq', 'yakiniku'],
};

// ---------------------------------------------------------------------------
// Constants — Regional dish lookup table
// ---------------------------------------------------------------------------

/**
 * Maps a canonical cuisine name to an array of dish name fragments.
 * Each fragment is checked case-insensitively as a substring.
 *
 * Keys are the canonical cuisine names (same as REGIONAL_CUISINE_KEYWORDS keys).
 * Values are lowercase dish name fragments.
 */
export const REGIONAL_DISH_LOOKUP: Record<string, string[]> = {
  Sichuan: [
    'dan dan noodle',
    'ma po tofu',
    'mapo tofu',
    'kung pao',
    'cumin beef',
    'cumin lamb',
    'hot and sour',
    'mala tang',
    'malatang',
    'spicy dumpling',
    'sichuan peppercorn',
    'twice cooked pork',
    'water boiled fish',
    'fuqi feipian',
    'chongqing',
  ],
  Taiwanese: [
    'braised pork rice',
    'lu rou fan',
    'bubble milk tea',
    'boba',
    'gua bao',
    'oyster vermicelli',
    'beef noodle soup',
    'popcorn chicken',
    'scallion pancake',
    'fried chicken cutlet',
    'three cup chicken',
    'stinky tofu',
  ],
  Cantonese: [
    'dim sum',
    'har gow',
    'siu mai',
    'char siu',
    'roast duck',
    'congee',
    'wonton noodle',
    'rice noodle roll',
    'egg tart',
    'claypot rice',
  ],
  Hunanese: ['chairman mao', 'steamed fish head', 'stinky tofu', 'orange beef'],
  Shanghainese: [
    'soup dumpling',
    'xiao long bao',
    'xlb',
    "lion's head meatball",
    'shanghai noodle',
    'scallion oil noodle',
  ],
  Yunnan: ['crossing the bridge noodle', 'rice noodle'],
};

// ---------------------------------------------------------------------------
// Constants — Traditional preparation keywords
// ---------------------------------------------------------------------------

/**
 * Keywords that indicate artisanal or traditional preparation methods.
 * Each entry is a lowercase search term.
 */
export const TRADITIONAL_PREP_KEYWORDS: string[] = [
  'handmade',
  'homemade',
  'hand-pulled',
  'hand pulled',
  'from scratch',
  'cooked to order',
  'made to order',
  'house-made',
  'house made',
  'freshly made',
  'hand-crafted',
  'hand crafted',
];

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

interface TierDefinition {
  label: string;
  emoji: string;
  minScore: number;
}

const TIERS: TierDefinition[] = [
  { label: 'Verified Authentic 🔥', emoji: '🔥', minScore: 75 },
  { label: 'Regional Specialist 🏮', emoji: '🏮', minScore: 50 },
  { label: 'Traditional Touches 🥢', emoji: '🥢', minScore: 25 },
];

// ---------------------------------------------------------------------------
// Public helper: Chinese character detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the text contains any CJK Unified Ideographs (U+4E00–U+9FFF)
 * or CJK Compatibility Ideographs (U+F900–U+FAFF).
 *
 * @param text - The string to test.
 */
export function containsChineseCharacters(text: string): boolean {
  // CJK Unified Ideographs: U+4E00–U+9FFF
  // CJK Compatibility Ideographs: U+F900–U+FAFF
  return /[\u4E00-\u9FFF\uF900-\uFAFF]/.test(text);
}

// ---------------------------------------------------------------------------
// Public helper: Regional cuisine reference finder
// ---------------------------------------------------------------------------

/**
 * Scans a text string for references to specific Chinese regional cuisines.
 *
 * Checks each term in REGIONAL_CUISINE_KEYWORDS case-insensitively.  Returns
 * one result per cuisine per distinct matched term (deduplicates within a
 * single cuisine so "sichuan" appearing five times only produces one entry for
 * that term, but "sichuan" and "szechuan" in the same text produce two entries).
 *
 * @param text - The text to scan.
 * @returns Array of `{ cuisine, matchedTerm }` for every match found.
 */
export function findRegionalCuisineReferences(
  text: string,
): Array<{ cuisine: string; matchedTerm: string }> {
  const lower = text.toLowerCase();
  const results: Array<{ cuisine: string; matchedTerm: string }> = [];

  for (const [cuisine, terms] of Object.entries(REGIONAL_CUISINE_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        results.push({ cuisine, matchedTerm: term });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public helper: Regional dish finder
// ---------------------------------------------------------------------------

/**
 * Scans a text string for names of dishes strongly associated with a specific
 * regional Chinese cuisine.
 *
 * Each dish fragment is matched case-insensitively.  Duplicate fragment hits
 * in the same text are returned only once.
 *
 * @param text - The text to scan.
 * @returns Array of `{ dish, cuisine }` for every distinct match found.
 */
export function findRegionalDishes(
  text: string,
): Array<{ dish: string; cuisine: string }> {
  const lower = text.toLowerCase();
  const results: Array<{ dish: string; cuisine: string }> = [];
  const seen = new Set<string>();

  for (const [cuisine, dishes] of Object.entries(REGIONAL_DISH_LOOKUP)) {
    for (const dish of dishes) {
      if (lower.includes(dish)) {
        const key = `${cuisine}::${dish}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ dish, cuisine });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the text contains "authentic" or "authenticity"
 * (case-insensitive).
 */
function containsAuthenticKeyword(text: string): boolean {
  return /\bauthentic(?:ity)?\b/i.test(text);
}

/**
 * Given a detected cuisine name, find the canonical cuisine name for display.
 * If the cuisine is "Hot Pot" or "BBQ" (which are not strongly regional),
 * returns undefined so it doesn't inflate the primaryCuisine calculation.
 */
function isMeaningfulCuisineOrigin(cuisine: string): boolean {
  return cuisine !== 'Hot Pot' && cuisine !== 'BBQ';
}

/**
 * Derive the tier label and emoji from a numeric authenticity score.
 *
 * @param score - authenticityScore (0–100).
 * @returns `{ authenticityTier, authenticityTierEmoji }` — both null when score < 25.
 */
function scoreToTier(score: number): {
  authenticityTier: string | null;
  authenticityTierEmoji: string | null;
} {
  for (const tier of TIERS) {
    if (score >= tier.minScore) {
      return {
        authenticityTier: tier.label,
        authenticityTierEmoji: tier.emoji,
      };
    }
  }
  return { authenticityTier: null, authenticityTierEmoji: null };
}

/**
 * Compute the cuisine that appears most often across all signals.
 * Excludes generic buckets (Hot Pot, BBQ) from the count.
 *
 * @param signals - All detected signals for a buffet.
 * @returns The most-frequently mentioned meaningful cuisine, or null.
 */
function derivePrimaryCuisine(signals: AuthenticitySignal[]): string | null {
  const counts = new Map<string, number>();

  for (const signal of signals) {
    const c = signal.impliedCuisine;
    if (c && isMeaningfulCuisineOrigin(c)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return null;

  let best: string | null = null;
  let bestCount = 0;
  for (const [cuisine, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = cuisine;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Detect authenticity signals for a single buffet and compute its score, tier,
 * cuisine origins, and primary cuisine.
 *
 * Runs all five signal detections:
 *   1. Explicit "authentic" keyword in FAQ answers or description
 *   2. Chinese characters (CJK) in the restaurant name
 *   3. Regional Chinese cuisine keywords across all text fields
 *   4. Traditional preparation method keywords
 *   5. Known regional dish names
 *
 * @param buffet - Buffet data object with name, description, questionsAndAnswers,
 *                 optional menuItems, and optional reviewsTags.
 * @returns AuthenticityResult with score, tier, cuisineOrigins, primaryCuisine,
 *          signals array, and signalCount.
 */
export function detectAuthenticitySignals(
  buffet: BuffetForAuthenticity,
): AuthenticityResult {
  const signals: AuthenticitySignal[] = [];

  const name = buffet.name ?? '';
  // Prefer description2 (SEO-enhanced) over description when available.
  const description = buffet.description2 || buffet.description || '';
  const qaPairs = buffet.questionsAndAnswers ?? [];
  const menuItems = buffet.menuItems ?? [];
  const reviewTags = (buffet.reviewsTags ?? []).map((t) => t.title ?? '');

  // ── Signal 2: Chinese characters in name ───────────────────────────────────
  // Checked first so we can reference it cheaply; Signal 1 ordering is cosmetic.
  if (name && containsChineseCharacters(name)) {
    signals.push({
      signalType: 'chinese_characters',
      evidence: name,
      source: 'name',
    });
  }

  // ── Signal 1: Explicit "authentic" keyword ─────────────────────────────────
  // Only one signal is created even if "authentic" appears many times.
  // Look in FAQ answers and description.
  let authenticSignalAdded = false;

  // Check FAQ answers first (higher fidelity source).
  for (const pair of qaPairs) {
    if (authenticSignalAdded) break;
    const answer = pair.answer ?? '';
    if (!containsAuthenticKeyword(answer)) continue;

    // Attempt to find an implied cuisine in the same answer.
    const cuisineMatches = findRegionalCuisineReferences(answer);
    const impliedCuisine =
      cuisineMatches.length > 0 ? cuisineMatches[0].cuisine : 'Chinese';

    signals.push({
      signalType: 'explicit_authentic',
      evidence: answer.slice(0, 200), // cap evidence snippet length
      source: 'faq_answer',
      impliedCuisine,
    });
    authenticSignalAdded = true;
  }

  // If not found in FAQs, check description.
  if (!authenticSignalAdded && containsAuthenticKeyword(description)) {
    const cuisineMatches = findRegionalCuisineReferences(description);
    const impliedCuisine =
      cuisineMatches.length > 0 ? cuisineMatches[0].cuisine : 'Chinese';

    signals.push({
      signalType: 'explicit_authentic',
      evidence: description.slice(0, 200),
      source: 'description',
      impliedCuisine,
    });
    authenticSignalAdded = true;
  }

  // ── Signal 3: Regional cuisine specialization ──────────────────────────────
  // Scan: name, description, FAQ answers + questions, review tags.
  // Track which (cuisine, term) pairs have already been emitted to avoid dupes.
  const seenCuisineTerm = new Set<string>();

  const textSources: Array<{
    text: string;
    source: AuthenticitySignal['source'];
  }> = [
    { text: name, source: 'name' },
    { text: description, source: 'description' },
    ...qaPairs.map((p) => ({
      text: p.answer ?? '',
      source: 'faq_answer' as AuthenticitySignal['source'],
    })),
    ...qaPairs.map((p) => ({
      text: p.question ?? '',
      source: 'faq_question' as AuthenticitySignal['source'],
    })),
    ...reviewTags.map((t) => ({
      text: t,
      source: 'faq_answer' as AuthenticitySignal['source'],
    })),
  ];

  for (const { text, source } of textSources) {
    if (!text) continue;
    for (const { cuisine, matchedTerm } of findRegionalCuisineReferences(text)) {
      const key = `${cuisine}::${matchedTerm}`;
      if (seenCuisineTerm.has(key)) continue;
      seenCuisineTerm.add(key);

      signals.push({
        signalType: 'regional_cuisine',
        evidence: matchedTerm,
        source,
        impliedCuisine: cuisine,
      });
    }
  }

  // ── Signal 4: Traditional preparation methods ──────────────────────────────
  // Scan: description, FAQ answers.
  const seenPrepKeyword = new Set<string>();

  const prepSources: Array<{
    text: string;
    source: AuthenticitySignal['source'];
  }> = [
    { text: description, source: 'description' },
    ...qaPairs.map((p) => ({
      text: p.answer ?? '',
      source: 'faq_answer' as AuthenticitySignal['source'],
    })),
  ];

  for (const { text, source } of prepSources) {
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const keyword of TRADITIONAL_PREP_KEYWORDS) {
      if (lower.includes(keyword) && !seenPrepKeyword.has(keyword)) {
        seenPrepKeyword.add(keyword);
        signals.push({
          signalType: 'traditional_prep',
          evidence: keyword,
          source,
        });
      }
    }
  }

  // ── Signal 5: Regional dish names ─────────────────────────────────────────
  // Scan: description, FAQ answers, menu item names.
  const seenDish = new Set<string>();

  const dishSources: Array<{
    text: string;
    source: AuthenticitySignal['source'];
  }> = [
    { text: description, source: 'description' },
    ...qaPairs.map((p) => ({
      text: p.answer ?? '',
      source: 'faq_answer' as AuthenticitySignal['source'],
    })),
    ...menuItems.map((m) => ({
      text: [m.name, m.description ?? ''].join(' '),
      source: 'menu' as AuthenticitySignal['source'],
    })),
  ];

  for (const { text, source } of dishSources) {
    if (!text) continue;
    for (const { dish, cuisine } of findRegionalDishes(text)) {
      if (!seenDish.has(dish)) {
        seenDish.add(dish);
        signals.push({
          signalType: 'regional_dishes',
          evidence: dish,
          source,
          impliedCuisine: cuisine,
        });
      }
    }
  }

  // ── Scoring ────────────────────────────────────────────────────────────────

  let score = 0;

  // Signal 1: 30 pts, once.
  const hasExplicitAuthentic = signals.some((s) => s.signalType === 'explicit_authentic');
  if (hasExplicitAuthentic) score += 30;

  // Signal 2: 15 pts, once.
  const hasChinese = signals.some((s) => s.signalType === 'chinese_characters');
  if (hasChinese) score += 15;

  // Signal 3: 20 pts first unique regional reference (cuisine::term pair),
  // +5 per additional unique reference, cap 30.
  // The spec says "first match, +5 for each additional UNIQUE regional reference"
  // where a "reference" is a distinct (cuisine, matched-term) combination.
  const uniqueRegionalRefs = new Set(
    signals
      .filter((s) => s.signalType === 'regional_cuisine')
      .map((s) => `${s.impliedCuisine ?? '__unknown__'}::${s.evidence}`),
  );
  if (uniqueRegionalRefs.size > 0) {
    score += Math.min(20 + (uniqueRegionalRefs.size - 1) * 5, 30);
  }

  // Signal 4: 15 pts first unique prep keyword, +5 per additional, cap 25.
  const uniquePrepKeywords = new Set(
    signals
      .filter((s) => s.signalType === 'traditional_prep')
      .map((s) => s.evidence),
  );
  if (uniquePrepKeywords.size > 0) {
    score += Math.min(15 + (uniquePrepKeywords.size - 1) * 5, 25);
  }

  // Signal 5: 5 pts per unique dish, cap 30.
  const uniqueDishes = new Set(
    signals.filter((s) => s.signalType === 'regional_dishes').map((s) => s.evidence),
  );
  score += Math.min(uniqueDishes.size * 5, 30);

  // Cap total at 100.
  const authenticityScore = Math.min(score, 100);

  // ── Tier ──────────────────────────────────────────────────────────────────
  const { authenticityTier, authenticityTierEmoji } = scoreToTier(authenticityScore);

  // ── Cuisine origins ───────────────────────────────────────────────────────
  const cuisineOriginsSet = new Set<string>();
  for (const signal of signals) {
    if (signal.impliedCuisine && isMeaningfulCuisineOrigin(signal.impliedCuisine)) {
      cuisineOriginsSet.add(signal.impliedCuisine);
    }
  }
  const cuisineOrigins = Array.from(cuisineOriginsSet);

  const primaryCuisine = derivePrimaryCuisine(signals);

  return {
    authenticityScore,
    authenticityTier,
    authenticityTierEmoji,
    cuisineOrigins,
    primaryCuisine,
    signals,
    signalCount: signals.length,
  };
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

/**
 * Run detectAuthenticitySignals on every buffet in an array and return a new
 * array where each buffet is augmented with authenticity fields.
 *
 * The original objects are not mutated.
 *
 * @param allBuffets - Array of buffets to process.
 * @returns Updated array with authenticityScore, authenticityTier,
 *          authenticityTierEmoji, cuisineOrigins, primaryCuisine,
 *          authenticitySignals, and authenticitySignalCount attached.
 */
export function detectAllAuthenticitySignals<T extends BuffetForAuthenticity>(
  allBuffets: T[],
): Array<
  T & {
    authenticityScore: number;
    authenticityTier: string | null;
    authenticityTierEmoji: string | null;
    cuisineOrigins: string[];
    primaryCuisine: string | null;
    authenticitySignals: AuthenticitySignal[];
    authenticitySignalCount: number;
  }
> {
  return allBuffets.map((buffet) => {
    const result = detectAuthenticitySignals(buffet);
    return {
      ...buffet,
      authenticityScore: result.authenticityScore,
      authenticityTier: result.authenticityTier,
      authenticityTierEmoji: result.authenticityTierEmoji,
      cuisineOrigins: result.cuisineOrigins,
      primaryCuisine: result.primaryCuisine,
      authenticitySignals: result.signals,
      authenticitySignalCount: result.signalCount,
    };
  });
}
