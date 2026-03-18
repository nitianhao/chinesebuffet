/**
 * Signature Dish Extraction
 *
 * Extracts, deduplicates, and ranks the most-mentioned dishes from a buffet's
 * existing text data (FAQ Q&A pairs, description, and optional menu items).
 *
 * No external dependencies — pure deterministic string parsing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignatureDish {
  /** Title-cased dish name, e.g. "Cumin Beef" */
  name: string;
  /** Total times this dish appears across all text sources */
  mentionCount: number;
  /** Which data sources mentioned it */
  sources: Array<'faq_answer' | 'faq_question' | 'description' | 'menu'>;
  /** Price from menu if matched, otherwise undefined */
  price?: number;
  /**
   * true if mentionCount >= 2 OR it appeared in a "recommended/popular dishes"
   * FAQ answer
   */
  isTopPick: boolean;
}

export interface SignatureDishResult {
  /** Sorted: isTopPick first, then by mentionCount desc, max 10 */
  signatureDishes: SignatureDish[];
  /** Name of the #1 dish, or null if none extracted */
  topDish: string | null;
  /** Total unique dishes extracted */
  dishCount: number;
}

/** A buffet's Q&A pair (mirrors the questionsAndAnswers field in Buffet) */
interface QAPair {
  question?: string;
  answer?: string;
  [key: string]: unknown;
}

/** A single menu item as used in this extraction module */
interface MenuItem {
  name: string;
  description?: string;
  price?: number;
  priceNumber?: number;
  category?: string;
  categoryName?: string;
  [key: string]: unknown;
}

/** The subset of Buffet fields used for dish extraction */
interface BuffetForExtraction {
  questionsAndAnswers?: QAPair[] | null;
  description?: string | null;
  /** Menu items — may come from parsed menu data or a dedicated menuItems list */
  menuItems?: MenuItem[] | null;
}

// ---------------------------------------------------------------------------
// Internal accumulator type
// ---------------------------------------------------------------------------

interface DishAccumulator {
  name: string;
  mentionCount: number;
  sources: Set<'faq_answer' | 'faq_question' | 'description' | 'menu'>;
  price?: number;
  isTopPick: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Keywords in a FAQ question that indicate the answer contains a dish LIST.
 * Phase 1 trigger.
 */
const LIST_QUESTION_KEYWORDS = [
  'recommend',
  'popular',
  'dish',
  'dishes',
  'menu',
  'order',
  'must-try',
  'must try',
  'signature',
  'best',
  'try',
  'favorite',
  'favourite',
  'specialt',
];

/**
 * Trigger phrases that precede a comma-separated list of dish names.
 * Used in Phase 1 (FAQ answers) and Phase 3 (description).
 */
const LIST_TRIGGER_PHRASES = [
  'include ',
  'includes ',
  'including ',
  'such as ',
  'like ',
  'try the ',
  "try their ",
  "try our ",
  'recommend ',
  'recommends ',
  'recommended ',
  'rave about ',
  'raving about ',
  'known for ',
  'famous for ',
  'must-try ',
  'must try ',
  'signature dishes',
  'signature dish',
];

/**
 * Generic phrases that indicate a non-dish item (discard during cleaning).
 */
const GENERIC_PHRASES = [
  'a variety of',
  'many options',
  'wide selection',
  'all kinds of',
  'wide variety',
  'lots of',
  'many dishes',
  'everything',
  'everything on',
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Title-case a string — capitalises the first letter of every word.
 */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Strips common leading articles/possessives from a raw extracted string.
 * Used inside cleanDishName.
 */
function stripLeadingArticles(s: string): string {
  return s.replace(/^(the|their|our|a|an)\s+/i, '');
}

/**
 * Returns the normalisation key used when deduplicating dish names.
 * Lowercases, strips leading "the ", and trims whitespace.
 */
function normaliseKey(name: string): string {
  return name.toLowerCase().replace(/^the\s+/, '').trim();
}

/**
 * Cleans a raw dish name token extracted from text.
 *
 * Steps:
 *  1. Trim surrounding whitespace.
 *  2. Strip leading articles ("the ", "their ", "our ").
 *  3. Strip trailing periods.
 *  4. Title-case the result.
 *
 * Returns null if the cleaned name is too short (< 3 chars),
 * too long (> 60 chars), or looks like a generic description.
 */
export function cleanDishName(raw: string): string | null {
  let s = raw.trim();
  s = stripLeadingArticles(s);
  s = s.replace(/\.$/, '').trim();

  if (s.length < 3 || s.length > 60) return null;

  const lower = s.toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    if (lower.includes(phrase)) return null;
  }

  return titleCase(s);
}

/**
 * Splits a comma-and-"and"-separated list of dish names and returns cleaned,
 * valid names.
 *
 * E.g. "Dan Dan Noodles, Cumin Beef, and Spicy Dumplings"
 *   → ["Dan Dan Noodles", "Cumin Beef", "Spicy Dumplings"]
 */
function splitAndClean(text: string): string[] {
  const results: string[] = [];
  // Split on commas first, then split each segment on " and " to handle
  // "X, Y and Z" patterns.
  const commaParts = text.split(',');
  for (const part of commaParts) {
    const andParts = part.split(/\band\b/i);
    for (const segment of andParts) {
      const cleaned = cleanDishName(segment);
      if (cleaned) results.push(cleaned);
    }
  }
  return results;
}

/**
 * Fuzzy-matches an extracted dish name against a single menu item name.
 *
 * Returns true if:
 *  - One name contains the other (case-insensitive), OR
 *  - Their Levenshtein distance is <= 2
 *
 * Phase 4 helper.
 */
export function fuzzyMatchDish(extracted: string, menuItemName: string): boolean {
  const a = extracted.toLowerCase().trim();
  const b = menuItemName.toLowerCase().trim();

  if (a.includes(b) || b.includes(a)) return true;
  if (Math.abs(a.length - b.length) > 2) return false; // can't be ≤ 2 apart

  // Levenshtein distance (iterative row)
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length] <= 2;
}

// ---------------------------------------------------------------------------
// Extraction phases
// ---------------------------------------------------------------------------

/**
 * Phase 1 — Extract dish lists from FAQ answers whose questions contain
 * "recommend", "popular", "dishes", etc.
 *
 * Identifies trigger phrases inside the answer and splits the remainder into
 * individual dish names.  Marks all extracted dishes as isTopPick = true.
 */
function phase1ExtractFromFAQAnswerLists(
  qaPairs: QAPair[],
): Array<{ name: string; isTopPick: boolean }> {
  const results: Array<{ name: string; isTopPick: boolean }> = [];

  for (const pair of qaPairs) {
    const question = (pair.question ?? '').toLowerCase();
    const answer = pair.answer ?? '';

    const isListQuestion = LIST_QUESTION_KEYWORDS.some((kw) => question.includes(kw));
    if (!isListQuestion) continue;

    // Find trigger phrases in the answer and extract what follows.
    const answerLower = answer.toLowerCase();
    let remaining = '';

    for (const trigger of LIST_TRIGGER_PHRASES) {
      const idx = answerLower.indexOf(trigger);
      if (idx !== -1) {
        // Take text after the trigger phrase, up to the first sentence boundary.
        const afterTrigger = answer.slice(idx + trigger.length);
        // Stop at sentence end (period followed by space or end, or newline).
        const sentenceEnd = afterTrigger.search(/\.\s|\n|$/);
        remaining = sentenceEnd >= 0 ? afterTrigger.slice(0, sentenceEnd) : afterTrigger;
        break;
      }
    }

    if (!remaining) continue;

    const dishes = splitAndClean(remaining);
    for (const name of dishes) {
      results.push({ name, isTopPick: true });
    }
  }

  return results;
}

/**
 * Phase 2 — Extract a specific dish name from FAQ questions that ask about
 * a single dish, e.g. "Are the dumplings delicious?".
 *
 * Does NOT mark as isTopPick by default — single-dish questions are
 * supporting evidence only.
 */
function phase2ExtractFromFAQQuestions(
  qaPairs: QAPair[],
): Array<{ name: string; isTopPick: boolean }> {
  const results: Array<{ name: string; isTopPick: boolean }> = [];

  // Pattern: "are the X at Y", "is the X good/delicious/fresh/...", "how is the X", etc.
  const pattern =
    /(?:are the|is the|how is the|how are the)\s+(.+?)(?:\s+at\s+|\s+good|\s+delicious|\s+fresh|\s+worth|\s+made|\s+authentic|\?|$)/i;

  for (const pair of qaPairs) {
    const question = pair.question ?? '';
    const match = question.match(pattern);
    if (!match) continue;

    const raw = match[1];
    const cleaned = cleanDishName(raw);
    if (cleaned) {
      results.push({ name: cleaned, isTopPick: false });
    }
  }

  return results;
}

/**
 * Phase 3 — Extract dish names from the buffet's description text.
 *
 * Searches for trigger phrases and splits the following text into individual
 * dishes.  Dishes after "signature" triggers are marked isTopPick = true.
 */
function phase3ExtractFromDescription(
  description: string,
): Array<{ name: string; isTopPick: boolean }> {
  const results: Array<{ name: string; isTopPick: boolean }> = [];

  const descLower = description.toLowerCase();

  for (const trigger of LIST_TRIGGER_PHRASES) {
    let searchFrom = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idx = descLower.indexOf(trigger, searchFrom);
      if (idx === -1) break;

      const afterTrigger = description.slice(idx + trigger.length);
      // Stop at next sentence boundary.
      const sentenceEnd = afterTrigger.search(/\.\s|\n|$/);
      const remaining =
        sentenceEnd >= 0 ? afterTrigger.slice(0, sentenceEnd) : afterTrigger;

      const isSignatureTrigger =
        trigger.includes('signature') ||
        trigger.includes('rave') ||
        trigger.includes('must');

      const dishes = splitAndClean(remaining);
      for (const name of dishes) {
        results.push({ name, isTopPick: isSignatureTrigger });
      }

      searchFrom = idx + trigger.length;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extracts an array of signature dishes from a single buffet's existing text
 * data.  Runs Phases 1–6 of the extraction algorithm:
 *
 *  Phase 1 — FAQ answers that list recommended/popular dishes
 *  Phase 2 — FAQ questions that mention a specific dish
 *  Phase 3 — Description text with trigger phrases
 *  Phase 4 — Cross-reference with menu items for prices
 *  Phase 5 — Deduplicate and merge
 *  Phase 6 — Rank (isTopPick, mentionCount desc) and cap at 10
 *
 * @param buffet - Object with questionsAndAnswers, description, and optional menuItems
 * @returns SignatureDishResult with sorted dishes, topDish, and dishCount
 */
export function extractSignatureDishes(buffet: BuffetForExtraction): SignatureDishResult {
  const qaPairs: QAPair[] = buffet.questionsAndAnswers ?? [];
  const description = buffet.description ?? '';
  const menuItems: MenuItem[] = buffet.menuItems ?? [];

  // --- Collect raw candidates ---

  type RawCandidate = {
    name: string;
    source: 'faq_answer' | 'faq_question' | 'description';
    isTopPick: boolean;
  };

  const candidates: RawCandidate[] = [];

  for (const { name, isTopPick } of phase1ExtractFromFAQAnswerLists(qaPairs)) {
    candidates.push({ name, source: 'faq_answer', isTopPick });
  }

  for (const { name, isTopPick } of phase2ExtractFromFAQQuestions(qaPairs)) {
    candidates.push({ name, source: 'faq_question', isTopPick });
  }

  if (description) {
    for (const { name, isTopPick } of phase3ExtractFromDescription(description)) {
      candidates.push({ name, source: 'description', isTopPick });
    }
  }

  // --- Phase 5: Deduplicate and merge ---

  // Map from normalised key → accumulator
  const byKey = new Map<string, DishAccumulator>();

  for (const candidate of candidates) {
    const key = normaliseKey(candidate.name);
    const existing = byKey.get(key);
    if (existing) {
      existing.mentionCount += 1;
      existing.sources.add(candidate.source);
      if (candidate.isTopPick) existing.isTopPick = true;
    } else {
      byKey.set(key, {
        name: candidate.name,
        mentionCount: 1,
        sources: new Set([candidate.source]),
        isTopPick: candidate.isTopPick,
      });
    }
  }

  // Substring deduplication: if one key is a substring of another, merge the
  // shorter one's counts into the more specific (longer) one.
  const keys = Array.from(byKey.keys());
  const toMergeInto = new Map<string, string>(); // shorter key → longer key

  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const shorter = keys[i];
      const longer = keys[j];
      if (shorter.length < longer.length && longer.includes(shorter)) {
        toMergeInto.set(shorter, longer);
      }
    }
  }

  Array.from(toMergeInto.entries()).forEach(([shorterKey, longerKey]) => {
    const shortEntry = byKey.get(shorterKey);
    const longEntry = byKey.get(longerKey);
    if (!shortEntry || !longEntry) return;

    longEntry.mentionCount += shortEntry.mentionCount;
    Array.from(shortEntry.sources).forEach((src) => longEntry.sources.add(src));
    if (shortEntry.isTopPick) longEntry.isTopPick = true;
    byKey.delete(shorterKey);
  });

  // Apply isTopPick rule: also true if mentionCount >= 2
  Array.from(byKey.values()).forEach((acc) => {
    if (acc.mentionCount >= 2) acc.isTopPick = true;
  });

  // --- Phase 4: Cross-reference with menu items for prices ---

  if (menuItems.length > 0) {
    Array.from(byKey.values()).forEach((acc) => {
      for (const menuItem of menuItems) {
        if (!menuItem.name) continue;
        if (fuzzyMatchDish(acc.name, menuItem.name)) {
          // Resolve price — prefer explicit price field, then priceNumber
          const price =
            typeof menuItem.price === 'number'
              ? menuItem.price
              : typeof menuItem.priceNumber === 'number'
              ? menuItem.priceNumber
              : undefined;

          if (price !== undefined && acc.price === undefined) {
            acc.price = price;
          }
          acc.sources.add('menu');
          break;
        }
      }
    });
  }

  // --- Phase 6: Rank and cap ---

  const dishes: SignatureDish[] = Array.from(byKey.values()).map((acc) => ({
    name: acc.name,
    mentionCount: acc.mentionCount,
    sources: Array.from(acc.sources),
    price: acc.price,
    isTopPick: acc.isTopPick,
  }));

  dishes.sort((a, b) => {
    if (a.isTopPick !== b.isTopPick) return a.isTopPick ? -1 : 1;
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    return a.name.localeCompare(b.name);
  });

  const capped = dishes.slice(0, 10);

  return {
    signatureDishes: capped,
    topDish: capped.length > 0 ? capped[0].name : null,
    dishCount: capped.length,
  };
}

/**
 * Runs extractSignatureDishes on every buffet in an array and returns a new
 * array where each buffet has signatureDishes, topDish, and dishCount set.
 *
 * @param allBuffets - Array of buffets to process
 * @returns Updated array with signature dish fields attached
 */
export function extractAllSignatureDishes<T extends BuffetForExtraction>(
  allBuffets: T[],
): Array<T & { signatureDishes: SignatureDish[]; topDish: string | null; dishCount: number }> {
  return allBuffets.map((buffet) => {
    const result = extractSignatureDishes(buffet);
    return {
      ...buffet,
      signatureDishes: result.signatureDishes,
      topDish: result.topDish,
      dishCount: result.dishCount,
    };
  });
}
