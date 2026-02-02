/**
 * Deterministic review theme extraction using keyword matching.
 * No ML/LLM - purely rule-based for fast, cheap, and reliable results.
 */

export interface Review {
  text?: string;
  textTranslated?: string;
  [key: string]: any;
}

export interface Theme {
  key: string;
  label: string;
  count: number;
}

// Theme keyword dictionary
const THEME_KEYWORDS: Record<string, string[]> = {
  value: [
    'value', 'price', 'affordable', 'cheap', 'inexpensive', 'worth', 'deal', 'bang for buck',
    'money', 'cost', 'priced', 'budget', 'economical', 'reasonable price', 'good price',
    'great value', 'excellent value', 'best value', 'worth the price', 'price point'
  ],
  variety: [
    'variety', 'selection', 'choice', 'options', 'many', 'lots of', 'wide', 'extensive',
    'diverse', 'different', 'assortment', 'range', 'plenty', 'abundant', 'huge selection',
    'great selection', 'large selection', 'big selection', 'so many', 'tons of'
  ],
  taste: [
    'taste', 'tasty', 'delicious', 'flavor', 'flavour', 'good', 'great', 'excellent',
    'amazing', 'wonderful', 'yummy', 'scrumptious', 'savory', 'savoury', 'flavorful',
    'tastes good', 'tastes great', 'tastes amazing', 'tastes delicious', 'taste good',
    'taste great', 'taste amazing', 'taste delicious'
  ],
  freshness: [
    'fresh', 'freshly', 'freshness', 'crisp', 'crispy', 'hot', 'warm', 'just made',
    'made fresh', 'freshly made', 'fresh food', 'fresh ingredients', 'freshly prepared',
    'freshly cooked', 'not stale', 'not old'
  ],
  service: [
    'service', 'staff', 'server', 'waiter', 'waitress', 'employee', 'worker', 'personnel',
    'attendant', 'helpful', 'friendly', 'polite', 'courteous', 'professional', 'efficient',
    'service was', 'staff was', 'staff is', 'service is', 'service staff', 'wait staff',
    'customer service', 'good service', 'great service', 'excellent service', 'poor service',
    'bad service', 'slow service', 'fast service', 'quick service'
  ],
  cleanliness: [
    'clean', 'cleanliness', 'dirty', 'messy', 'neat', 'tidy', 'hygienic', 'sanitary',
    'spotless', 'immaculate', 'well maintained', 'well-kept', 'clean restaurant',
    'clean place', 'clean environment', 'clean facility', 'very clean', 'super clean',
    'extremely clean', 'not clean', 'unclean', 'filthy'
  ],
  atmosphere: [
    'atmosphere', 'ambiance', 'ambience', 'vibe', 'environment', 'setting', 'decor',
    'decorated', 'decorative', 'interior', 'interior design', 'mood', 'feeling',
    'nice atmosphere', 'great atmosphere', 'good atmosphere', 'relaxing', 'cozy',
    'comfortable', 'pleasant', 'welcoming', 'inviting'
  ],
  family: [
    'family', 'kid', 'kids', 'children', 'child', 'family friendly', 'kid friendly',
    'children friendly', 'good for kids', 'great for kids', 'family place',
    'family restaurant', 'family oriented', 'family atmosphere', 'bring kids',
    'take kids', 'with kids', 'for families', 'for family'
  ],
  speed: [
    'fast', 'quick', 'quickly', 'speed', 'slow', 'slowly', 'wait', 'waiting', 'wait time',
    'waiting time', 'line', 'queue', 'crowded', 'busy', 'rush', 'rushed', 'hurry',
    'prompt', 'timely', 'efficient', 'inefficient', 'long wait', 'short wait',
    'no wait', 'waiting line', 'waiting queue'
  ],
  dessert: [
    'dessert', 'desserts', 'sweet', 'sweets', 'cake', 'cakes', 'ice cream', 'pudding',
    'pie', 'pies', 'cookie', 'cookies', 'chocolate', 'candy', 'candies', 'treat',
    'treats', 'sugar', 'sugary', 'sweet tooth', 'dessert bar', 'dessert selection',
    'dessert options', 'dessert area'
  ],
  sushi: [
    'sushi', 'sashimi', 'roll', 'rolls', 'nigiri', 'maki', 'california roll',
    'spicy tuna', 'salmon roll', 'tuna roll', 'sushi bar', 'sushi station',
    'sushi chef', 'fresh sushi', 'sushi selection', 'sushi options'
  ],
  seafood: [
    'crab', 'crabs', 'crab legs', 'lobster', 'lobsters', 'shrimp', 'shrimps', 'prawn',
    'prawns', 'fish', 'fishes', 'salmon', 'tuna', 'seafood', 'shellfish', 'oyster',
    'oysters', 'mussel', 'mussels', 'clam', 'clams', 'scallop', 'scallops',
    'crab station', 'seafood station', 'seafood bar', 'crab bar', 'fresh seafood'
  ],
};

// Priority order for tie-breaking (higher priority themes first)
const THEME_PRIORITY: string[] = [
  'taste',
  'value',
  'variety',
  'service',
  'freshness',
  'cleanliness',
  'atmosphere',
  'family',
  'speed',
  'seafood',
  'sushi',
  'dessert',
];

// Minimum count threshold for a theme to be included
const MIN_THEME_COUNT = 2;

// Maximum number of reviews to process (for performance)
const MAX_REVIEWS_TO_PROCESS = 200;

/**
 * Normalize text for keyword matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if a review text matches any keywords for a theme
 */
function matchesTheme(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some(keyword => {
    // Use word boundaries for better matching
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return pattern.test(normalized);
  });
}

/**
 * Extract themes from reviews
 * @param reviews Array of review objects with text/textTranslated fields
 * @param maxReviews Maximum number of reviews to process (default: 200)
 * @param minCount Minimum count threshold for themes (default: 2)
 * @returns Array of themes sorted by count (descending), then by priority
 */
export function extractThemes(
  reviews: Review[],
  maxReviews: number = MAX_REVIEWS_TO_PROCESS,
  minCount: number = MIN_THEME_COUNT
): Theme[] {
  if (!reviews || reviews.length === 0) {
    return [];
  }

  // Limit reviews for performance
  const reviewsToProcess = reviews.slice(0, maxReviews);

  // Count theme mentions per review (de-duplicate per review)
  const themeCounts: Record<string, number> = {};

  for (const review of reviewsToProcess) {
    // Use textTranslated if available, otherwise use text
    const reviewText = review.textTranslated || review.text || '';
    
    if (!reviewText.trim()) {
      continue;
    }

    // Track which themes this review matches (to avoid double-counting)
    const matchedThemes = new Set<string>();

    // Check each theme
    for (const [themeKey, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (matchesTheme(reviewText, keywords)) {
        matchedThemes.add(themeKey);
      }
    }

    // Count each matched theme once per review
    for (const themeKey of matchedThemes) {
      themeCounts[themeKey] = (themeCounts[themeKey] || 0) + 1;
    }
  }

  // Convert to theme objects and filter by minimum count
  const themes: Theme[] = Object.entries(themeCounts)
    .filter(([, count]) => count >= minCount)
    .map(([key, count]) => ({
      key,
      label: formatThemeLabel(key),
      count,
    }));

  // Sort by count (descending), then by priority
  themes.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    const aPriority = THEME_PRIORITY.indexOf(a.key);
    const bPriority = THEME_PRIORITY.indexOf(b.key);
    // If not in priority list, put at end
    if (aPriority === -1 && bPriority === -1) return 0;
    if (aPriority === -1) return 1;
    if (bPriority === -1) return -1;
    return aPriority - bPriority;
  });

  // Return top 6 themes
  return themes.slice(0, 6);
}

/**
 * Format theme key into human-readable label
 */
function formatThemeLabel(key: string): string {
  const labels: Record<string, string> = {
    value: 'Value / Price',
    variety: 'Food Variety / Selection',
    taste: 'Taste / Flavor',
    freshness: 'Freshness',
    service: 'Service / Staff',
    cleanliness: 'Cleanliness',
    atmosphere: 'Atmosphere',
    family: 'Kid-Friendly / Family',
    speed: 'Speed / Wait Time',
    dessert: 'Dessert / Sweets',
    sushi: 'Sushi',
    seafood: 'Crab / Seafood',
  };

  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
}
