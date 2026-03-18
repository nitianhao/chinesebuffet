/**
 * Date Night Score computation.
 *
 * Answers the question: "Is this a good place to take someone on a date?"
 * This is a meaningful differentiator for a buffet directory, where most
 * places skew family/value-oriented — when one IS date-worthy, that's a
 * powerful signal.
 *
 * The score is composed of five independent sub-scores:
 *
 *   dateNightScore = ambiance (0–30)
 *                  + drinks (0–25)
 *                  + eveningViability (0–20)
 *                  + serviceAndExperience (0–15)
 *                  + surroundings (0–10)
 *
 * Total is clamped to [0, 100].
 *
 * Tier classification:
 *   70–100 → "Great Date Spot"     💕
 *   45–69  → "Decent Date Option"  🌙
 *   25–44  → "Casual Date at Best" 🍽️
 *   0–24   → null (not displayed)
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateNightSubScores {
  /** Ambiance sub-score (0–30). */
  ambiance: number;
  /** Drinks sub-score (0–25). */
  drinks: number;
  /** Evening viability sub-score (0–20). */
  eveningViability: number;
  /** Service & experience sub-score (0–15). */
  serviceAndExperience: number;
  /** Surroundings sub-score (0–10). */
  surroundings: number;
}

export interface DateNightResult {
  /** Composite date night score, 0–100. */
  dateNightScore: number;
  /**
   * Tier label, or null when score is 0–24.
   * - "Great Date Spot"     (70–100)
   * - "Decent Date Option"  (45–69)
   * - "Casual Date at Best" (25–44)
   */
  dateNightTier: string | null;
  /** Display emoji for the tier, or null when score is 0–24. */
  dateNightTierEmoji: string | null;
  /** Individual sub-scores that sum to dateNightScore. */
  subScores: DateNightSubScores;
  /** Human-readable signals that increase the date-worthiness. */
  positiveSignals: string[];
  /** Human-readable signals that reduce the date-worthiness. */
  negativeSignals: string[];
}

// ---------------------------------------------------------------------------
// Internal: raw data extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the true-valued keys from a `additionalInfo` section.
 *
 * Each section is stored as `Array<Record<string, boolean>>` where each
 * element is a single-key object like `{ "Romantic": true }`. This helper
 * returns the keys whose value is strictly `true`.
 */
function extractAdditionalInfoKeys(
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
 * Build a normalised set of strings from an `additionalInfo` section for
 * case-insensitive membership checks.
 */
function sectionSet(
  section: Array<Record<string, boolean>> | undefined | null
): Set<string> {
  return new Set(extractAdditionalInfoKeys(section).map((k) => k.toLowerCase()));
}

/**
 * Check whether a Set contains any of the given search terms (case-insensitive).
 */
function hasAny(set: Set<string>, ...terms: string[]): boolean {
  return terms.some((t) => set.has(t.toLowerCase()));
}

/**
 * Extract the FAQ Q&A pairs from the buffet's `questionsAndAnswers` field.
 *
 * @returns Array of `{ question, answer }` strings (both may be empty).
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

// ---------------------------------------------------------------------------
// Public helper: countNearbyBars
// ---------------------------------------------------------------------------

/**
 * Count nearby bars, pubs, lounges, nightclubs, wine bars, and breweries
 * from the buffet's `foodDining` POI section.
 *
 * This drives Sub-Score 5 (Surroundings).
 *
 * @param buffet - A buffet object with the `foodDining` POI section populated.
 * @returns Number of nearby bar/nightlife establishments.
 */
export function countNearbyBars(buffet: Buffet): number {
  const b = buffet as Buffet & Record<string, unknown>;
  const foodDining = b['foodDining'] as
    | {
        highlights?: Array<{
          items?: Array<{ category?: string; name?: string }>;
        }>;
      }
    | undefined;

  if (!foodDining?.highlights) return 0;

  const BAR_TERMS = ['bar', 'pub', 'lounge', 'nightclub', 'wine', 'alcohol', 'brewery'];
  let count = 0;

  for (const group of foodDining.highlights) {
    if (!group.items) continue;
    for (const item of group.items) {
      const cat = (item.category ?? '').toLowerCase();
      const name = (item.name ?? '').toLowerCase();
      if (BAR_TERMS.some((t) => cat.includes(t) || name.includes(t))) {
        count++;
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Public helper: getLatestClosingTime
// ---------------------------------------------------------------------------

/**
 * Parse the buffet's `hours` array and return the latest closing time as a
 * numeric hour (e.g., 22 for 10 PM; 25 for 1 AM next day).
 *
 * Times after midnight are represented as > 24 so that comparisons work
 * intuitively (e.g., 2 AM = 26, midnight = 24).
 *
 * @param buffet - A buffet object with the `hours` array populated.
 * @returns Object with:
 *   - `latestClose`   – the latest closing hour across all open days
 *   - `weekdayClose`  – the latest closing hour Mon–Thu
 *   - `weekendClose`  – the latest closing hour Fri–Sat
 */
export function getLatestClosingTime(buffet: Buffet): {
  latestClose: number;
  weekdayClose: number;
  weekendClose: number;
} {
  const CLOSED = { latestClose: 0, weekdayClose: 0, weekendClose: 0 };
  if (!Array.isArray(buffet.hours) || buffet.hours.length === 0) return CLOSED;

  const WEEKDAY_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday'];
  const WEEKEND_DAYS = ['friday', 'saturday'];

  let latestClose = 0;
  let weekdayClose = 0;
  let weekendClose = 0;

  for (const entry of buffet.hours) {
    const dayRaw = (entry.day ?? '').toLowerCase();
    const hoursStr = (entry.hours ?? '').toLowerCase().trim();

    if (hoursStr === 'closed' || hoursStr === '') continue;

    const closeHour = parseCloseHour(hoursStr);
    if (closeHour === null) continue;

    if (closeHour > latestClose) latestClose = closeHour;
    if (WEEKDAY_DAYS.some((d) => dayRaw.includes(d)) && closeHour > weekdayClose) {
      weekdayClose = closeHour;
    }
    if (WEEKEND_DAYS.some((d) => dayRaw.includes(d)) && closeHour > weekendClose) {
      weekendClose = closeHour;
    }
  }

  return { latestClose, weekdayClose, weekendClose };
}

/**
 * Parse a close hour from an hours string like "12:00 PM – 10:00 PM" or
 * "11:00 AM–2:00 AM". Returns a numeric hour in 24h+ notation, or null if
 * unparseable. Times past midnight (AM) are treated as > 24.
 */
function parseCloseHour(hoursStr: string): number | null {
  // Match the last time in the string (the closing time)
  // Handles "12:00 PM–10:30 PM", "11AM - 2AM", "Open 24 hours", etc.
  if (hoursStr.includes('open 24')) return 24;

  // Split on en-dash, em-dash, or hyphen with optional spaces
  const parts = hoursStr.split(/\s*[–—-]\s*/);
  const closePart = parts[parts.length - 1]?.trim();
  if (!closePart) return null;

  return parseTimeToHour(closePart);
}

/**
 * Parse a time string like "10:30 PM", "2:00 AM", "10PM" into a numeric
 * hour in 24h+ notation. AM times that represent "next day" (≤ 5 AM) are
 * returned as 24+ (e.g., 1 AM → 25, 2 AM → 26).
 */
function parseTimeToHour(timeStr: string): number | null {
  // Match groups: hour, optional minute, optional AM/PM
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
    // Early AM times (1–5 AM) represent next day / "late night"
    if (hour >= 0 && hour <= 5) hour += 24;
  } else {
    // No meridiem — assume 24h format
    if (hour > 24) return null;
  }

  // Add fractional hour for minutes to preserve ordering when needed
  return hour + minutes / 60;
}

// ---------------------------------------------------------------------------
// Internal: sub-score computations
// ---------------------------------------------------------------------------

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Sub-Score 1: Ambiance (max 30 points).
 *
 * Evaluates atmosphere tags, notable attributes in `whatStandsOut`, outdoor
 * seating, and penalises places explicitly flagged as not-romantic.
 */
function computeAmbianceScore(
  atmosphere: Set<string>,
  whatStandsOut: Set<string>,
  amenities: Set<string>,
  notIdealFor: Set<string>,
  quickVerdict: Set<string>,
  faqPairs: Array<{ question: string; answer: string }>,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  let score = 0;

  // Positive signals
  if (hasAny(atmosphere, 'romantic') || hasAny(atmosphere, 'intimate')) {
    score += 15;
    positiveSignals.push('Romantic ambiance');
  }
  if (hasAny(atmosphere, 'cozy')) {
    score += 10;
    positiveSignals.push('Cozy atmosphere');
  }
  if (hasAny(atmosphere, 'trendy')) {
    score += 8;
    positiveSignals.push('Trendy vibe');
  }
  if (hasAny(atmosphere, 'quiet')) {
    score += 7;
    positiveSignals.push('Quiet setting');
  }
  if (hasAny(whatStandsOut, 'nice atmosphere')) {
    score += 5;
    positiveSignals.push('Nice atmosphere noted by reviewers');
  }
  if (hasAny(whatStandsOut, 'clean, comfortable') || hasAny(whatStandsOut, 'clean comfortable')) {
    score += 3;
    positiveSignals.push('Clean and comfortable');
  }
  if (hasAny(amenities, 'outdoor seating')) {
    score += 3;
    positiveSignals.push('Outdoor seating available');
  }

  // Negative signals
  if (hasAny(notIdealFor, 'romantic dinners')) {
    score -= 15;
    negativeSignals.push('Not ideal for romantic dinners');
  }
  if (hasAny(notIdealFor, 'quiet atmosphere')) {
    score -= 5;
    negativeSignals.push('Not known for quiet atmosphere');
  }
  if (hasAny(quickVerdict, 'can get crowded during peak hours') || hasAny(quickVerdict, 'can get crowded')) {
    score -= 3;
    negativeSignals.push('Can get crowded');
  }

  // Penalise empty atmosphere with no positive FAQ ambiance mentions
  if (atmosphere.size === 0) {
    const faqMentionsAmbiance = faqPairs.some(
      ({ answer, question }) =>
        /ambiance|atmosphere|cozy|romantic|intimate|quiet|dim|candle|vibe|decor/.test(
          answer + ' ' + question
        )
    );
    if (!faqMentionsAmbiance) {
      score -= 5;
      negativeSignals.push('No ambiance details');
    }
  }

  return clamp(score, 0, 30);
}

/**
 * Sub-Score 2: Drinks (max 25 points).
 *
 * Rewards bars, cocktail menus, wine, and happy hour programmes. A place
 * with no alcohol at all scores 0 for this sub-score.
 */
function computeDrinksScore(
  foodAndDrink: Set<string>,
  beforeYouGo: Set<string>,
  amenities: Set<string>,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  let score = 0;

  const hasAlcohol =
    hasAny(foodAndDrink, 'alcohol') ||
    hasAny(beforeYouGo, 'alcohol served') ||
    hasAny(amenities, 'bar onsite');

  if (hasAlcohol) {
    score += 10;
    positiveSignals.push('Alcohol available');
  }
  if (hasAny(foodAndDrink, 'cocktails')) {
    score += 5;
    positiveSignals.push('Cocktails available');
  }
  if (hasAny(foodAndDrink, 'wine')) {
    score += 5;
    positiveSignals.push('Wine available');
  }
  if (hasAny(foodAndDrink, 'happy hour drinks') || hasAny(foodAndDrink, 'happy hour food')) {
    score += 5;
    positiveSignals.push('Happy hour offered');
  }
  if (hasAny(amenities, 'bar onsite')) {
    score += 5;
    positiveSignals.push('Full bar onsite');
  }

  if (score === 0) {
    negativeSignals.push('No alcohol served');
  }

  return clamp(score, 0, 25);
}

/**
 * Sub-Score 3: Evening Viability (max 20 points).
 *
 * Parses the hours data to reward places that stay open late (past 10 PM)
 * and have extended Friday/Saturday hours.
 */
function computeEveningViabilityScore(
  latestClose: number,
  weekdayClose: number,
  weekendClose: number,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  let score = 0;

  if (latestClose >= 24) {
    score = 20; // midnight or later
  } else if (latestClose >= 23) {
    score = 15;
  } else if (latestClose >= 22) {
    score = 10;
  } else if (latestClose >= 21) {
    score = 5;
  } else {
    score = 0;
  }

  // Weekend extension bonus (+5 if Fri or Sat closes later than weekday)
  if (weekendClose > weekdayClose && weekendClose > 0) {
    score += 5;
    positiveSignals.push('Extended weekend hours');
  }

  if (latestClose < 20 && latestClose > 0) {
    negativeSignals.push('Closes too early for dinner dates');
  }
  if (latestClose >= 22) {
    positiveSignals.push('Open late');
  }

  return clamp(score, 0, 20);
}

/**
 * Sub-Score 4: Service & Experience (max 15 points).
 *
 * Rewards reservations, table service, and live entertainment. Penalises
 * pure self-service formats that break the date atmosphere.
 */
function computeServiceScore(
  serviceOptions: Set<string>,
  planning: Set<string>,
  amenities: Set<string>,
  diningOptions: Set<string>,
  highlights: Set<string>,
  faqPairs: Array<{ question: string; answer: string }>,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  let score = 0;

  const hasReservations =
    hasAny(serviceOptions, 'reservations') ||
    hasAny(planning, 'accepts reservations');

  if (hasReservations) {
    score += 10;
    positiveSignals.push('Accepts reservations');
  } else {
    negativeSignals.push('No reservations');
  }

  const hasTableService =
    hasAny(amenities, 'waiter service') ||
    hasAny(diningOptions, 'table service');

  if (hasTableService) {
    score += 5;
    positiveSignals.push('Table service');
  }

  if (hasAny(highlights, 'live music')) {
    score += 5;
    positiveSignals.push('Live music');
  }

  if (
    highlights.has('live performance') ||
    Array.from(highlights).some((h) =>
      /live\s+(band|dj|show|entertainment|act|performance)/i.test(h)
    )
  ) {
    score += 3;
    positiveSignals.push('Live entertainment');
  }

  // Penalty: counter-service only (no table service)
  const isCounterOnly =
    hasAny(diningOptions, 'counter service') && !hasTableService;
  if (isCounterOnly) {
    score -= 5;
    negativeSignals.push('Counter service only');
  }

  // Penalty: FAQ mentions self-service or semi-self-service
  const selfServiceInFaq = faqPairs.some(({ answer }) =>
    /self[\s-]?service|semi[\s-]?self[\s-]?service/i.test(answer)
  );
  if (selfServiceInFaq) {
    score -= 5;
    negativeSignals.push('Self-service format');
  }

  return clamp(score, 0, 15);
}

/**
 * Sub-Score 5: Surroundings (max 10 points).
 *
 * Rewards buffets located near bars, pubs, lounges, and nightlife venues —
 * places where a date can continue after dinner.
 */
function computeSurroundingsScore(
  barCount: number,
  positiveSignals: string[]
): number {
  if (barCount >= 3) {
    positiveSignals.push('Bars and nightlife within walking distance');
    return 10;
  }
  if (barCount >= 1) {
    positiveSignals.push('Nearby bar options');
    return 5;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Internal: derive flat string sets from raw Buffet fields
// ---------------------------------------------------------------------------

/**
 * Build the `whatStandsOut` set from `reviewsTags` and review text patterns.
 *
 * The canonical values that scoring rules reference are:
 *   "Nice atmosphere", "Clean, comfortable"
 */
function buildWhatStandsOut(buffet: Buffet): Set<string> {
  const out = new Set<string>();

  // reviewsTags is the primary source (e.g., { title: "Nice atmosphere", count: N })
  if (Array.isArray(buffet.reviewsTags)) {
    for (const tag of buffet.reviewsTags) {
      if (tag.title) out.add(tag.title.toLowerCase());
    }
  }

  return out;
}

/**
 * Build the `notIdealFor` set by looking for explicit signals in reviews and
 * amenities. We scan review text for strong romantic/fine-dining negative cues
 * and use the `reviewsTags` to find explicit "not good for" mentions.
 */
function buildNotIdealFor(buffet: Buffet): Set<string> {
  const out = new Set<string>();

  // Check review text for explicit "not for dates / romantic" sentiment
  const allReviewText = (buffet.reviews ?? [])
    .map((r) => ((r as any).textTranslated ?? (r as any).text ?? '').toLowerCase())
    .join(' ');

  if (/\bnot (romantic|for dates?|for a date)\b/.test(allReviewText)) {
    out.add('romantic dinners');
  }

  // Scan FAQ answers for explicit "not romantic" or "noisy" signals
  for (const qa of buffet.questionsAndAnswers ?? []) {
    const answer = (qa.answer ?? '').toLowerCase();
    if (/not (romantic|for dates?)|too (noisy|loud|busy)/.test(answer)) {
      out.add('romantic dinners');
    }
  }

  return out;
}

/**
 * Build the `quickVerdict` set from `reviewsTags` — tags that describe crowd
 * or volume conditions (e.g., "Can get crowded during peak hours").
 */
function buildQuickVerdict(buffet: Buffet): Set<string> {
  const out = new Set<string>();

  if (Array.isArray(buffet.reviewsTags)) {
    for (const tag of buffet.reviewsTags) {
      if (tag.title) out.add(tag.title.toLowerCase());
    }
  }

  return out;
}

/**
 * Build the `beforeYouGo` set from the `additionalInfo['Offerings']` section
 * and Yelp attributes. Primary use here is detecting "Alcohol served".
 */
function buildBeforeYouGo(buffet: Buffet): Set<string> {
  // Offerings often includes "Alcohol" — map it to "alcohol served" for check
  const offerings = sectionSet(buffet.additionalInfo?.['Offerings']);
  const out = new Set<string>();
  if (offerings.has('alcohol')) out.add('alcohol served');
  return out;
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/**
 * Derive the tier label and emoji from a numeric date night score.
 */
function scoreToDatNightTier(score: number): {
  dateNightTier: string | null;
  dateNightTierEmoji: string | null;
} {
  if (score >= 70) return { dateNightTier: 'Great Date Spot', dateNightTierEmoji: '💕' };
  if (score >= 45) return { dateNightTier: 'Decent Date Option', dateNightTierEmoji: '🌙' };
  if (score >= 25) return { dateNightTier: 'Casual Date at Best', dateNightTierEmoji: '🍽️' };
  return { dateNightTier: null, dateNightTierEmoji: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the Date Night Score and tier for a single buffet.
 *
 * The function reads directly from the raw `Buffet` type — it does not
 * require pre-processing by the UI layer. All five sub-scores are computed
 * independently and then summed.
 *
 * @param buffet - A single buffet object from the data pipeline.
 * @returns Full DateNightResult including score, tier, sub-scores, and signals.
 */
export function computeDateNightScore(buffet: Buffet): DateNightResult {
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  // ── Extract normalised sets from additionalInfo ─────────────────────────
  const atmosphere = sectionSet(buffet.additionalInfo?.['Atmosphere']);
  const amenities = sectionSet(buffet.additionalInfo?.['Amenities']);
  const serviceOptions = sectionSet(buffet.additionalInfo?.['Service options']);
  const highlights = sectionSet(buffet.additionalInfo?.['Highlights']);
  const diningOptions = sectionSet(buffet.additionalInfo?.['Dining options']);
  const planning = sectionSet(buffet.additionalInfo?.['Planning']);
  // "Offerings" is where food/drink attributes live (Alcohol, Cocktails, etc.)
  const foodAndDrink = sectionSet(buffet.additionalInfo?.['Offerings']);

  // ── Derive computed sets ────────────────────────────────────────────────
  const whatStandsOut = buildWhatStandsOut(buffet);
  const notIdealFor = buildNotIdealFor(buffet);
  const quickVerdict = buildQuickVerdict(buffet);
  const beforeYouGo = buildBeforeYouGo(buffet);
  const faqPairs = getFaqPairs(buffet);

  // ── Sub-score 1: Ambiance ───────────────────────────────────────────────
  const ambiance = computeAmbianceScore(
    atmosphere,
    whatStandsOut,
    amenities,
    notIdealFor,
    quickVerdict,
    faqPairs,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 2: Drinks ─────────────────────────────────────────────────
  const drinks = computeDrinksScore(
    foodAndDrink,
    beforeYouGo,
    amenities,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 3: Evening Viability ──────────────────────────────────────
  const { latestClose, weekdayClose, weekendClose } = getLatestClosingTime(buffet);
  const eveningViability = computeEveningViabilityScore(
    latestClose,
    weekdayClose,
    weekendClose,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 4: Service & Experience ───────────────────────────────────
  const serviceAndExperience = computeServiceScore(
    serviceOptions,
    planning,
    amenities,
    diningOptions,
    highlights,
    faqPairs,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 5: Surroundings ────────────────────────────────────────────
  const barCount = countNearbyBars(buffet);
  const surroundings = computeSurroundingsScore(barCount, positiveSignals);

  // ── Final score ──────────────────────────────────────────────────────────
  const rawTotal = ambiance + drinks + eveningViability + serviceAndExperience + surroundings;
  const dateNightScore = clamp(rawTotal, 0, 100);
  const { dateNightTier, dateNightTierEmoji } = scoreToDatNightTier(dateNightScore);

  return {
    dateNightScore,
    dateNightTier,
    dateNightTierEmoji,
    subScores: { ambiance, drinks, eveningViability, serviceAndExperience, surroundings },
    positiveSignals,
    negativeSignals,
  };
}

/**
 * Batch-compute date night scores for every buffet in the provided array.
 *
 * Each buffet is processed independently — unlike the hidden gem score,
 * there is no cross-buffet dependency, so this is a simple map.
 *
 * @param allBuffets - Flat array of buffets from any number of cities.
 * @returns A new array where each buffet is augmented with all dateNight*
 *          fields. Original objects are not mutated.
 */
export function computeAllDateNightScores(allBuffets: Buffet[]): Buffet[] {
  return allBuffets.map((buffet) => {
    const result = computeDateNightScore(buffet);
    return {
      ...buffet,
      dateNightScore: result.dateNightScore,
      dateNightTier: result.dateNightTier,
      dateNightTierEmoji: result.dateNightTierEmoji,
      dateNightSubScores: result.subScores,
      dateNightPositiveSignals: result.positiveSignals,
      dateNightNegativeSignals: result.negativeSignals,
    };
  });
}
