/**
 * Full Night Out Score computation.
 *
 * Answers the question: "Can I eat here AND keep the night going?"
 * This captures the total evening potential — a late dinner with drinks,
 * then bars and entertainment within walking distance. It is the inverse
 * of the Quick Bite Score. A suburban buffet that closes at 9PM with no
 * bars nearby scores near zero. A Chinatown spot open until 2AM with a
 * full bar and nightlife all around scores near 100.
 *
 * The score is composed of five independent sub-scores:
 *
 *   fullNightOutScore = lateNightDining     (0–30)
 *                     + drinksOnPremises    (0–20)
 *                     + nightlifeSurroundings (0–25)
 *                     + entertainmentAndEnergy (0–15)
 *                     + weekendPotential    (0–10)
 *
 * Total is clamped to [0, 100].
 *
 * Tier classification:
 *   75–100 → "Epic Night Out 🎉"         emoji "🎉"
 *   50–74  → "Solid Evening Plans 🌃"    emoji "🌃"
 *   25–49  → "Early Evening Only 🌇"     emoji "🌇"
 *   0–24   → null (not displayed)
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FullNightOutSubScores {
  /** Late-night dining sub-score (0–30). */
  lateNightDining: number;
  /** Drinks on premises sub-score (0–20). */
  drinksOnPremises: number;
  /** Nightlife surroundings sub-score (0–25). */
  nightlifeSurroundings: number;
  /** Entertainment & energy sub-score (0–15). */
  entertainmentAndEnergy: number;
  /** Weekend potential sub-score (0–10). */
  weekendPotential: number;
}

export interface FullNightOutResult {
  /** Composite full-night-out score, 0–100. */
  fullNightOutScore: number;
  /**
   * Tier label, or null when score is 0–24.
   * - "Epic Night Out 🎉"         (75–100)
   * - "Solid Evening Plans 🌃"    (50–74)
   * - "Early Evening Only 🌇"     (25–49)
   */
  fullNightOutTier: string | null;
  /** Display emoji for the tier, or null when score is 0–24. */
  fullNightOutTierEmoji: string | null;
  /** Individual sub-scores that sum to fullNightOutScore. */
  subScores: FullNightOutSubScores;
  /** Human-readable signals that increase the full-night-out score. */
  positiveSignals: string[];
  /** Human-readable signals that reduce the full-night-out score. */
  negativeSignals: string[];
}

// ---------------------------------------------------------------------------
// Internal: shared POI section type
// ---------------------------------------------------------------------------

interface POIItem {
  name?: string;
  category?: string;
  distanceText?: string;
  [key: string]: unknown;
}

interface POIGroup {
  label?: string;
  items?: POIItem[];
}

interface POISection {
  poiCount?: number;
  highlights?: POIGroup[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal: helpers
// ---------------------------------------------------------------------------

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Extract the true-valued keys from an `additionalInfo` section.
 *
 * Each section is `Array<Record<string, boolean>>` where each element is a
 * single-key object like `{ "Cocktails": true }`. Returns only keys whose
 * value is strictly `true`.
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

/** Build a lowercase Set from an `additionalInfo` section. */
function infoSet(
  section: Array<Record<string, boolean>> | undefined | null
): Set<string> {
  return new Set(extractInfoKeys(section).map((k) => k.toLowerCase()));
}

/** Return true if the set contains any of the given terms (case-insensitive). */
function hasAny(set: Set<string>, ...terms: string[]): boolean {
  return terms.some((t) => set.has(t.toLowerCase()));
}

/**
 * Parse a closing-time string like "10:30 PM", "2:00 AM", "10PM" into a
 * numeric hour in 24h+ notation.
 *
 * Times past midnight (1–5 AM) are returned as 24+ (e.g., 1 AM → 25, 2 AM → 26)
 * so comparisons work intuitively across midnight.
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
    // Early AM (1–5 AM) = next day / "late night"
    if (hour >= 0 && hour <= 5) hour += 24;
  }
  // No meridiem: assume 24h

  return hour + minutes / 60;
}

/**
 * Parse the closing hour from an hours range string like "12:00 PM–2:00 AM"
 * or "11:00 AM - 10:00 PM". Returns null if unparseable.
 */
function parseCloseHour(hoursStr: string): number | null {
  if (hoursStr.includes('open 24')) return 24;

  // Split on en-dash, em-dash, or hyphen with optional spaces
  const parts = hoursStr.split(/\s*[–—-]\s*/);
  const closePart = parts[parts.length - 1]?.trim();
  if (!closePart) return null;

  return parseTimeToHour(closePart);
}

// ---------------------------------------------------------------------------
// Public helper: getLatestClosingHour
// ---------------------------------------------------------------------------

/**
 * Parse the buffet's `hours` array and return the latest closing time as a
 * numeric 24h+ decimal (e.g. 21.0 for 9:00 PM, 22.5 for 10:30 PM, 25.0 for
 * 1:00 AM, 26.0 for 2:00 AM).
 *
 * "Closed" days are skipped. Returns 0 when no open hours are found.
 *
 * Used by Sub-Score 1 (Late Night Dining).
 *
 * @param hours - The `hours` array from a buffet object.
 */
export function getLatestClosingHour(
  hours: Array<{ day: string; hours: string }> | null | undefined
): number {
  if (!Array.isArray(hours) || hours.length === 0) return 0;

  let latest = 0;

  for (const entry of hours) {
    const hoursStr = (entry.hours ?? '').toLowerCase().trim();
    if (hoursStr === 'closed' || hoursStr === '') continue;

    const closeHour = parseCloseHour(hoursStr);
    if (closeHour === null) continue;
    if (closeHour > latest) latest = closeHour;
  }

  return latest;
}

// ---------------------------------------------------------------------------
// Public helper: getWeekdayWeekendClose
// ---------------------------------------------------------------------------

const WEEKDAY_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday'];
const FRIDAY_DAYS = ['friday'];
const SATURDAY_DAYS = ['saturday'];

/**
 * Separately extract Mon–Thu latest close, Friday close, and Saturday close
 * for the weekend extension check used in Sub-Score 5 (Weekend Potential).
 *
 * Each value is a 24h+ decimal hour. Returns 0 for any group with no data.
 *
 * @param hours - The `hours` array from a buffet object.
 */
export function getWeekdayWeekendClose(
  hours: Array<{ day: string; hours: string }> | null | undefined
): { weekdayLatest: number; fridayClose: number; saturdayClose: number } {
  const result = { weekdayLatest: 0, fridayClose: 0, saturdayClose: 0 };

  if (!Array.isArray(hours) || hours.length === 0) return result;

  for (const entry of hours) {
    const dayRaw = (entry.day ?? '').toLowerCase();
    const hoursStr = (entry.hours ?? '').toLowerCase().trim();
    if (hoursStr === 'closed' || hoursStr === '') continue;

    const closeHour = parseCloseHour(hoursStr);
    if (closeHour === null) continue;

    if (WEEKDAY_DAYS.some((d) => dayRaw.includes(d))) {
      if (closeHour > result.weekdayLatest) result.weekdayLatest = closeHour;
    }
    if (FRIDAY_DAYS.some((d) => dayRaw.includes(d))) {
      if (closeHour > result.fridayClose) result.fridayClose = closeHour;
    }
    if (SATURDAY_DAYS.some((d) => dayRaw.includes(d))) {
      if (closeHour > result.saturdayClose) result.saturdayClose = closeHour;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public helper: countNightlifeVenues
// ---------------------------------------------------------------------------

/** Keywords that identify a nightlife/bar-type venue (case-insensitive). */
const NIGHTLIFE_KEYWORDS = [
  'bar', 'pub', 'lounge', 'nightclub', 'club', 'karaoke', 'wine',
  'brewery', 'spirits', 'alcohol', 'tavern',
];

/** Category groups that represent retail (exclude them when subtype is wine/spirits). */
const RETAIL_GROUPS = ['retail & shopping', 'retail'];

/**
 * Count nearby nightlife venues (bars, pubs, lounges, nightclubs, karaoke,
 * wine bars, breweries, etc.) from the buffet's POI category sections.
 *
 * Uses keyword matching on item category/subtype strings. Excludes items
 * whose parent section is retail (e.g. "Wine & Spirits" stores in
 * `retailShopping`). `foodDining` items that match the keywords are always
 * counted regardless of their specific category name.
 *
 * Used by Sub-Score 3 (Nightlife Surroundings).
 *
 * @param buffet - A buffet object with populated POI category fields.
 */
export function countNightlifeVenues(buffet: Buffet): number {
  const b = buffet as Buffet & Record<string, unknown>;
  let count = 0;

  // The sections to scan and whether they are considered "retail"
  const sectionsToScan: Array<{ key: string; isRetail: boolean }> = [
    { key: 'foodDining', isRetail: false },
    { key: 'retailShopping', isRetail: true },
    // Other sections unlikely to contain bars but included for completeness
    { key: 'recreationEntertainment', isRetail: false },
    { key: 'miscellaneousServices', isRetail: false },
    { key: 'artsCulture', isRetail: false },
  ];

  for (const { key, isRetail } of sectionsToScan) {
    let section = b[key] as POISection | string | undefined;
    if (!section) continue;

    if (typeof section === 'string') {
      try {
        section = JSON.parse(section) as POISection;
      } catch {
        continue;
      }
    }

    if (!section.highlights) continue;

    for (const group of section.highlights) {
      if (!group.items) continue;
      for (const item of group.items) {
        const cat = (item.category ?? '').toLowerCase();
        const name = (item.name ?? '').toLowerCase();

        const matchesKeyword = NIGHTLIFE_KEYWORDS.some(
          (kw) => cat.includes(kw) || name.includes(kw)
        );

        if (!matchesKeyword) continue;

        // Skip retail venues with wine/spirits keywords — they are shops, not bars
        if (isRetail) continue;

        count++;
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Public helper: countEntertainmentVenues
// ---------------------------------------------------------------------------

/**
 * Scan nearby places for entertainment-type POIs: nightclubs/karaoke, cinemas,
 * and other activity venues (bowling, arcade, escape games, billiards).
 *
 * Checks `foodDining` and `recreationEntertainment` sections.
 *
 * Used by Sub-Score 4 (Entertainment & Energy).
 *
 * @param buffet - A buffet object with populated POI category fields.
 */
export function countEntertainmentVenues(buffet: Buffet): {
  hasNightclub: boolean;
  hasCinema: boolean;
  hasGameVenue: boolean;
} {
  const b = buffet as Buffet & Record<string, unknown>;
  const result = { hasNightclub: false, hasCinema: false, hasGameVenue: false };

  const NIGHTCLUB_TERMS = ['nightclub', 'karaoke', 'ktv'];
  const CINEMA_TERMS = ['cinema', 'theatre', 'theater', 'movie'];
  const GAME_TERMS = ['bowling', 'arcade', 'escape game', 'billiards', 'pool hall', 'game'];

  const sectionsToScan = ['foodDining', 'recreationEntertainment', 'artsCulture'];

  for (const key of sectionsToScan) {
    let section = b[key] as POISection | string | undefined;
    if (!section) continue;

    if (typeof section === 'string') {
      try {
        section = JSON.parse(section) as POISection;
      } catch {
        continue;
      }
    }

    if (!section.highlights) continue;

    for (const group of section.highlights) {
      if (!group.items) continue;
      for (const item of group.items) {
        const cat = (item.category ?? '').toLowerCase();
        const name = (item.name ?? '').toLowerCase();
        const combined = `${cat} ${name}`;

        if (!result.hasNightclub && NIGHTCLUB_TERMS.some((t) => combined.includes(t))) {
          result.hasNightclub = true;
        }
        if (!result.hasCinema && CINEMA_TERMS.some((t) => combined.includes(t))) {
          result.hasCinema = true;
        }
        if (!result.hasGameVenue && GAME_TERMS.some((t) => combined.includes(t))) {
          result.hasGameVenue = true;
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sub-score computations
// ---------------------------------------------------------------------------

/**
 * Sub-Score 1: Late Night Dining (max 30 points).
 *
 * Rewards buffets that stay open late so the evening can start at the table.
 * The tier is determined by the latest closing hour across all operating days.
 * A "Late-night food" signal adds a bonus.
 *
 * @param buffet - Buffet object.
 * @param positiveSignals - Accumulator for positive signal strings.
 * @param negativeSignals - Accumulator for negative signal strings.
 */
function computeLateNightDiningScore(
  buffet: Buffet,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  const latestClose = getLatestClosingHour(buffet.hours);

  let score = 0;

  // Tier-based score (only the highest matching tier applies)
  if (latestClose >= 26) {
    score = 30;
    positiveSignals.push('Open until 2AM');
  } else if (latestClose >= 25) {
    score = 25;
    positiveSignals.push('Open until 1AM');
  } else if (latestClose >= 24) {
    score = 20;
    positiveSignals.push('Open until midnight');
  } else if (latestClose >= 23) {
    score = 15;
    positiveSignals.push('Open until 11PM');
  } else if (latestClose >= 22) {
    score = 8;
    positiveSignals.push('Open until 10PM');
  } else if (latestClose >= 21) {
    score = 3;
    // No positive signal — tight for evening plans
    negativeSignals.push('Closes by 9PM — tight for evening plans');
  } else {
    score = 0;
    if (latestClose > 0) {
      negativeSignals.push('Closes before 9PM — not viable for a night out');
    }
  }

  // Bonus: "Late-night food" in Offerings
  const offerings = infoSet(buffet.additionalInfo?.['Offerings']);
  if (hasAny(offerings, 'late-night food')) {
    score += 3;
    positiveSignals.push('Late-night food available');
  }

  return clamp(score, 0, 30);
}

/**
 * Sub-Score 2: Drinks on Premises (max 20 points).
 *
 * Rewards buffets with a bar, cocktails, wine, beer, and happy hour
 * programmes. Checks `additionalInfo['Offerings']`, `additionalInfo['Planning']`,
 * and `additionalInfo['Amenities']`.
 *
 * @param buffet - Buffet object.
 * @param positiveSignals - Accumulator for positive signal strings.
 * @param negativeSignals - Accumulator for negative signal strings.
 */
function computeDrinksOnPremisesScore(
  buffet: Buffet,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  const offerings = infoSet(buffet.additionalInfo?.['Offerings']);
  const planning = infoSet(buffet.additionalInfo?.['Planning']);
  const amenities = infoSet(buffet.additionalInfo?.['Amenities']);

  // Detect the base alcohol signal (any one of these counts as "+8")
  const hasAlcohol =
    hasAny(offerings, 'alcohol') ||
    hasAny(planning, 'alcohol served') ||
    hasAny(amenities, 'bar onsite');

  let score = 0;

  if (hasAlcohol) {
    score += 8;
    positiveSignals.push('Alcohol available');
  }
  if (hasAny(offerings, 'cocktails')) {
    score += 4;
    positiveSignals.push('Cocktails available');
  }
  if (hasAny(offerings, 'wine')) {
    score += 3;
    positiveSignals.push('Wine available');
  }
  if (hasAny(offerings, 'beer')) {
    score += 2;
    positiveSignals.push('Beer available');
  }
  if (hasAny(offerings, 'happy hour drinks') || hasAny(offerings, 'happy hour food')) {
    score += 4;
    positiveSignals.push('Happy hour offered');
  }
  if (hasAny(amenities, 'bar onsite')) {
    score += 4;
    positiveSignals.push('Full bar onsite');
  }

  if (score === 0) {
    negativeSignals.push('No alcohol — you\'ll need to go elsewhere for drinks');
  }

  return clamp(score, 0, 20);
}

/**
 * Sub-Score 3: Nightlife Surroundings (max 25 points).
 *
 * Rewards buffets surrounded by bars, pubs, lounges, nightclubs, karaoke
 * venues, wine bars, and breweries within walking distance. Uses
 * {@link countNightlifeVenues} which scans the buffet's POI category fields.
 *
 * @param buffet - Buffet object.
 * @param positiveSignals - Accumulator for positive signal strings.
 * @param negativeSignals - Accumulator for negative signal strings.
 */
function computeNightlifeSurroundingsScore(
  buffet: Buffet,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  const venueCount = countNightlifeVenues(buffet);

  if (venueCount >= 5) {
    positiveSignals.push('5+ bars and nightlife venues within walking distance');
    return 25;
  }
  if (venueCount >= 3) {
    positiveSignals.push(`${venueCount} bars and nightlife venues within walking distance`);
    return 18;
  }
  if (venueCount >= 1) {
    positiveSignals.push('Nearby bar options');
    return 10;
  }

  negativeSignals.push('No bars or nightlife within walking distance');
  return 0;
}

/**
 * Sub-Score 4: Entertainment & Energy (max 15 points).
 *
 * Rewards buffets near nightclubs, karaoke, cinemas, and game venues,
 * as well as buffets with live music or a trendy atmosphere on-premises.
 * Uses {@link countEntertainmentVenues} for the POI scan.
 *
 * @param buffet - Buffet object.
 * @param positiveSignals - Accumulator for positive signal strings.
 */
function computeEntertainmentAndEnergyScore(
  buffet: Buffet,
  positiveSignals: string[]
): number {
  let score = 0;

  const { hasNightclub, hasCinema, hasGameVenue } = countEntertainmentVenues(buffet);

  if (hasNightclub) {
    score += 5;
    positiveSignals.push('Karaoke and nightclubs nearby');
  }
  if (hasCinema) {
    score += 3;
    positiveSignals.push('Cinema within walking distance');
  }
  if (hasGameVenue) {
    score += 3;
    positiveSignals.push('Entertainment nearby');
  }

  // On-premises signals from the buffet's own attributes
  const highlights = infoSet(buffet.additionalInfo?.['Highlights']);
  if (hasAny(highlights, 'live music') || hasAny(highlights, 'live performance')) {
    score += 5;
    positiveSignals.push('Live music at the restaurant');
  }

  const atmosphere = infoSet(buffet.additionalInfo?.['Atmosphere']);
  if (hasAny(atmosphere, 'trendy')) {
    score += 3;
    positiveSignals.push('Trendy atmosphere');
  }

  return clamp(score, 0, 15);
}

/**
 * Sub-Score 5: Weekend Potential (max 10 points).
 *
 * Rewards buffets that extend their hours on Friday/Saturday compared to
 * the weekday baseline, and stay open past 11PM on weekends.
 * Uses {@link getWeekdayWeekendClose} for per-day closing analysis.
 *
 * @param buffet - Buffet object.
 * @param positiveSignals - Accumulator for positive signal strings.
 * @param negativeSignals - Accumulator for negative signal strings.
 */
function computeWeekendPotentialScore(
  buffet: Buffet,
  positiveSignals: string[],
  negativeSignals: string[]
): number {
  const { weekdayLatest, fridayClose, saturdayClose } = getWeekdayWeekendClose(
    buffet.hours
  );

  let score = 0;

  // Weekend extension: either Fri or Sat closes later than the weekday peak
  const weekendPeak = Math.max(fridayClose, saturdayClose);
  if (weekendPeak > weekdayLatest && weekendPeak > 0) {
    score += 5;
    positiveSignals.push('Extended weekend hours');
  }

  // At least one weekend day closes at or after 11PM (23:00)
  if (fridayClose >= 23 || saturdayClose >= 23) {
    score += 5;
    positiveSignals.push('Open past 11PM on weekends');
  }

  // Negative signal: both weekend days close before 10PM
  if (
    (fridayClose > 0 || saturdayClose > 0) &&
    fridayClose < 22 &&
    saturdayClose < 22
  ) {
    negativeSignals.push('Closes early on weekends');
  }

  return clamp(score, 0, 10);
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/**
 * Derive the tier label and emoji from a numeric full-night-out score.
 */
function scoreToFullNightOutTier(score: number): {
  fullNightOutTier: string | null;
  fullNightOutTierEmoji: string | null;
} {
  if (score >= 75)
    return { fullNightOutTier: 'Epic Night Out 🎉', fullNightOutTierEmoji: '🎉' };
  if (score >= 50)
    return { fullNightOutTier: 'Solid Evening Plans 🌃', fullNightOutTierEmoji: '🌃' };
  if (score >= 25)
    return { fullNightOutTier: 'Early Evening Only 🌇', fullNightOutTierEmoji: '🌇' };
  return { fullNightOutTier: null, fullNightOutTierEmoji: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the Full Night Out Score and tier for a single buffet.
 *
 * Reads directly from the raw `Buffet` type — no pre-processing required.
 * All five sub-scores are computed independently and summed.
 *
 * @param buffet - A single buffet object from the data pipeline.
 * @returns Full FullNightOutResult including score, tier, sub-scores, and signals.
 */
export function computeFullNightOutScore(buffet: Buffet): FullNightOutResult {
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  // ── Sub-score 1: Late Night Dining ────────────────────────────────────────
  const lateNightDining = computeLateNightDiningScore(
    buffet,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 2: Drinks on Premises ───────────────────────────────────────
  const drinksOnPremises = computeDrinksOnPremisesScore(
    buffet,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 3: Nightlife Surroundings ───────────────────────────────────
  const nightlifeSurroundings = computeNightlifeSurroundingsScore(
    buffet,
    positiveSignals,
    negativeSignals
  );

  // ── Sub-score 4: Entertainment & Energy ───────────────────────────────────
  const entertainmentAndEnergy = computeEntertainmentAndEnergyScore(
    buffet,
    positiveSignals
  );

  // ── Sub-score 5: Weekend Potential ────────────────────────────────────────
  const weekendPotential = computeWeekendPotentialScore(
    buffet,
    positiveSignals,
    negativeSignals
  );

  // ── Final score ───────────────────────────────────────────────────────────
  const rawTotal =
    lateNightDining +
    drinksOnPremises +
    nightlifeSurroundings +
    entertainmentAndEnergy +
    weekendPotential;
  const fullNightOutScore = clamp(rawTotal, 0, 100);
  const { fullNightOutTier, fullNightOutTierEmoji } =
    scoreToFullNightOutTier(fullNightOutScore);

  return {
    fullNightOutScore,
    fullNightOutTier,
    fullNightOutTierEmoji,
    subScores: {
      lateNightDining,
      drinksOnPremises,
      nightlifeSurroundings,
      entertainmentAndEnergy,
      weekendPotential,
    },
    positiveSignals,
    negativeSignals,
  };
}

/**
 * Batch-compute full-night-out scores for every buffet in the provided array.
 *
 * Each buffet is processed independently — no cross-buffet dependency.
 *
 * @param allBuffets - Flat array of buffets from any number of cities.
 * @returns A new array where each buffet is augmented with all fullNightOut*
 *          fields. Original objects are not mutated.
 */
export function computeAllFullNightOutScores(allBuffets: Buffet[]): Buffet[] {
  return allBuffets.map((buffet) => {
    const result = computeFullNightOutScore(buffet);
    return {
      ...buffet,
      fullNightOutScore: result.fullNightOutScore,
      fullNightOutTier: result.fullNightOutTier,
      fullNightOutTierEmoji: result.fullNightOutTierEmoji,
      fullNightOutSubScores: result.subScores,
      fullNightOutPositiveSignals: result.positiveSignals,
      fullNightOutNegativeSignals: result.negativeSignals,
    };
  });
}
