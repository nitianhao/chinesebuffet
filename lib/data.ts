// Data loading utilities

import fs from 'fs';
import path from 'path';

export interface Review {
  reviewerId?: string;
  reviewerUrl?: string;
  name: string;
  reviewerNumberOfReviews?: number;
  isLocalGuide?: boolean;
  reviewerPhotoUrl?: string;
  text: string;
  textTranslated?: string | null;
  publishAt: string;
  publishedAtDate?: string;
  likesCount?: number;
  reviewId?: string;
  reviewUrl?: string;
  reviewOrigin?: string;
  stars: number;
  rating?: number | null;
  responseFromOwnerDate?: string | null;
  responseFromOwnerText?: string | null;
  reviewImageUrls?: string[];
  reviewContext?: Record<string, string>;
  reviewDetailedRating?: Record<string, number>;
  visitedIn?: string | null;
  originalLanguage?: string | null;
  translatedLanguage?: string | null;
  // Legacy fields for backward compatibility
  author?: string;
  time?: string;
  relativeTime?: string;
}

export interface Buffet {
  id: string;
  name: string;
  slug: string;
  address: {
    street: string;
    city: string;
    state: string;
    stateAbbr: string;
    postalCode: string;
    full: string;
  };
  location: {
    lat: number;
    lng: number;
  };
  phone: string;
  phoneUnformatted: string;
  website: string | null;
  email?: string | null;
  price: string | null;
  rating: number;
  reviewsCount: number;
  hours: Array<{ day: string; hours: string }>;
  categories: string[];
  categoryName: string;
  primaryType?: string | null;
  neighborhood: string | null;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
  placeId: string | null;
  imagesCount: number;
  imageUrls?: string[];
  images?: Array<{ photoReference?: string; [key: string]: any }>;
  imageCategories?: string[];
  citySlug?: string;
  reviews?: Review[];
  description?: string | null;
  subTitle?: string | null;
  reviewsDistribution?: {
    oneStar?: number;
    twoStar?: number;
    threeStar?: number;
    fourStar?: number;
    fiveStar?: number;
  } | null;
  reviewsTags?: Array<{
    title: string;
    count: number;
  }> | null;
  popularTimesHistogram?: {
    [key: string]: Array<{
      hour: number;
      occupancyPercent: number;
    }>;
  } | null;
  popularTimesLiveText?: string | null;
  popularTimesLivePercent?: number | null;
  additionalInfo?: {
    'Service options'?: Array<Record<string, boolean>>;
    Highlights?: Array<Record<string, boolean>>;
    Offerings?: Array<Record<string, boolean>>;
    'Dining options'?: Array<Record<string, boolean>>;
    Amenities?: Array<Record<string, boolean>>;
    Atmosphere?: Array<Record<string, boolean>>;
    Crowd?: Array<Record<string, boolean>>;
    Planning?: Array<Record<string, boolean>>;
    Payments?: Array<Record<string, boolean>>;
    Accessibility?: Array<Record<string, boolean>>;
    [key: string]: any;
  } | null;
  questionsAndAnswers?: Array<{
    question?: string;
    answer?: string;
    answerDate?: string;
    questionDate?: string;
    [key: string]: any;
  }> | null;
  ownerUpdates?: Array<{
    updateText?: string;
    updateDate?: string;
    [key: string]: any;
  }> | null;
  reserveTableUrl?: string | null;
  tableReservationLinks?: Array<{
    url?: string;
    name?: string;
    [key: string]: any;
  }> | null;
  googleFoodUrl?: string | null;
  orderBy?: Array<{
    name?: string;
    orderUrl?: string;
    [key: string]: any;
  }> | null;
  menu?: string | {
    [key: string]: any;
  } | null;
  webResults?: Array<{
    title?: string;
    url?: string;
    displayedUrl?: string;
    description?: string;
    [key: string]: any;
  }> | null;
  peopleAlsoSearch?: Array<{
    title?: string;
    placeId?: string;
    [key: string]: any;
  }> | null;
  updatesFromCustomers?: Array<{
    updateText?: string;
    updateDate?: string;
    [key: string]: any;
  }> | null;
  locatedIn?: string | null;
  plusCode?: string | null;
  what_customers_are_saying_seo?: string | null;
  reviewSummaryParagraph1?: string | null;
  reviewSummaryParagraph2?: string | null;
  iconInfo?: {
    iconMaskBaseUri?: string;
    iconBackgroundColor?: string;
    [key: string]: any;
  } | null;
  // Yelp data
  yelpData?: {
    yelpId?: string;
    yelpName?: string;
    url?: string;
    rating?: number;
    reviewCount?: number;
    priceRange?: string;
    address?: string;
    phone?: string;
    website?: string;
    categories?: string[];
    hours?: Record<string, string>;
    photos?: string[];
    attributes?: Record<string, boolean>;
    // Current Yelp-scraper shape (scripts/yelp/scrape-core.ts)
    ratingDistribution?: Record<string, number> | null; // relative bar widths per star (1–5), NOT counts
    serviceOptions?: Record<string, boolean> | null; // e.g. { "Offers delivery": true, "Takes reservations": true }
    popularDishes?: Array<{ name: string; price?: string | null; count?: number | null }> | null; // "reviews mention" dishes
    menuItems?: Array<{ name: string; price?: string | null; description?: string | null }> | null; // full Yelp-hosted menu
    ambience?: string[] | null; // vibe tags, e.g. ["Casual","Good for groups"] (some comma-joined)
    amenities?: Record<string, boolean> | null; // facility flags — noisy, needs whitelist before display
    reviews?: Array<{
      text?: string;
      rating?: number;
      author?: string;
      date?: string;
    }>;
    scrapedAt?: string;
  } | null;
  yelpRating?: number | null;
  yelpReviewsCount?: number | null;
  // TripAdvisor data
  tripadvisorData?: {
    tripadvisorId?: string;
    tripadvisorName?: string;
    url?: string;
    rating?: number;
    reviewCount?: number;
    priceRange?: string;
    address?: string;
    phone?: string;
    website?: string;
    cuisines?: string[];
    hours?: Record<string, string>;
    photos?: string[];
    features?: string[];
    popularDishes?: string[];
    reviews?: Array<{
      text?: string;
      rating?: number;
      author?: string;
      date?: string;
      title?: string;
    }>;
    ranking?: number;
    scrapedAt?: string;
  } | null;
  tripadvisorRating?: number | null;
  tripadvisorReviewsCount?: number | null;
  addressFormats?: {
    addressDescriptor?: {
      landmarks?: Array<{
        name?: string;
        placeId?: string;
        displayName?: {
          text?: string;
          languageCode?: string;
        };
        types?: string[];
        straightLineDistanceMeters?: number;
        travelDistanceMeters?: number;
        spatialRelationship?: string;
        [key: string]: any;
      }>;
      areas?: Array<{
        name?: string;
        placeId?: string;
        displayName?: {
          text?: string;
          languageCode?: string;
        };
        containment?: string;
        [key: string]: any;
      }>;
      [key: string]: any;
    };
    adrFormatAddress?: string;
    shortFormattedAddress?: string;
    postalAddress?: {
      [key: string]: any;
    };
    [key: string]: any;
  } | null;
  adrFormatAddress?: string | null; // HTML formatted address string (also available in addressFormats.adrFormatAddress)
  secondaryOpeningHours?: {
    regular?: Array<{
      openNow?: boolean;
      periods?: Array<{
        open?: {
          day?: number;
          hour?: number;
          minute?: number;
        };
        close?: {
          day?: number;
          hour?: number;
          minute?: number;
        };
        [key: string]: any;
      }>;
      [key: string]: any;
    }> | null;
    current?: Array<{
      openNow?: boolean;
      periods?: Array<{
        open?: {
          day?: number;
          hour?: number;
          minute?: number;
        };
        close?: {
          day?: number;
          hour?: number;
          minute?: number;
        };
        [key: string]: any;
      }>;
      [key: string]: any;
    }> | null;
    [key: string]: any;
  } | null;
  googleMapsLinks?: {
    directionsUri?: string;
    placeUri?: string;
    writeAReviewUri?: string;
    reviewsUri?: string;
    photosUri?: string;
    [key: string]: any;
  } | null;
  priceRange?: {
    startPrice?: {
      currencyCode?: string;
      units?: string;
      [key: string]: any;
    };
    endPrice?: {
      currencyCode?: string;
      units?: string;
      [key: string]: any;
    };
    [key: string]: any;
  } | null;
  // Health inspection data
  healthInspection?: {
    // Current inspection
    currentScore?: string | number; // "A", "B", "C" or numeric
    currentGrade?: string;
    inspectionDate?: string;
    inspectorName?: string;
    
    // Violations
    violations?: Array<{
      code?: string;
      description: string;
      category: 'Critical' | 'General';
      severity?: 'High' | 'Medium' | 'Low';
      corrected?: boolean;
      correctionDate?: string;
    }>;
    criticalViolationsCount?: number;
    generalViolationsCount?: number;
    
    // History
    inspectionHistory?: Array<{
      date: string;
      score?: string | number;
      grade?: string;
      violationsCount?: number;
      criticalViolationsCount?: number;
    }>;
    
    // Closures
    closureHistory?: Array<{
      closureDate: string;
      reopenDate?: string;
      reason: string;
      duration?: number; // days
    }>;
    hasRecentClosure?: boolean; // within last 2 years
    
    // Regulatory Actions
    regulatoryActions?: Array<{
      date: string;
      type: 'Fine' | 'Citation' | 'Warning' | 'Suspension' | 'License Revocation';
      amount?: number;
      description: string;
    }>;
    
    // Metadata
    dataSource?: string; // "NYC DOHMH", "CA Health Dept", etc.
    lastUpdated?: string;
    inspectionFrequency?: string; // "Annual", "Semi-annual", etc.
    permitNumber?: string;
    healthDepartmentUrl?: string;
  } | null;
  noiseLevel?: string | null; // Noise level (e.g., "quiet", "moderate", "loud")
  goodForKids?: boolean | null; // Whether the restaurant is good for kids
  goodForGroups?: boolean | null; // Whether the restaurant is good for groups
  hasTv?: boolean | null; // Whether the restaurant has TV
  healthScore?: boolean | null; // Whether the restaurant has a health score available
  alcohol?: string | null; // Alcohol availability (e.g., "none", "beer_and_wine", "full_bar")
  waiterService?: boolean | null; // Whether the restaurant has waiter service
  wiFi?: string | null; // WiFi availability (e.g., "no", "free", "paid")
  wheelchairAccessible?: boolean | null; // Whether the restaurant is wheelchair accessible
  genderNeutralRestrooms?: boolean | null; // Whether the restaurant has gender-neutral restrooms
  outdoorSeating?: boolean | null; // Whether the restaurant has outdoor seating
  businessAcceptsApplePay?: boolean | null; // Whether the restaurant accepts Apple Pay
  acceptsGooglePay?: boolean | null; // Whether the restaurant accepts Google Pay
  openToAll?: boolean | null; // Whether the restaurant is open to all
  /** Computed score (0–100) identifying high-quality, under-the-radar places. Null when rating < 4.3. */
  hiddenGemScore?: number | null;
  /** Tier label derived from hiddenGemScore. Null when score is 0–24 or ineligible. */
  hiddenGemTier?: string | null;
  /** Classification of the surrounding area's character based on nearby POIs. */
  locationVibe?: string | null;
  /** Display emoji for the locationVibe tag. */
  locationVibeEmoji?: string | null;
  /** One-sentence description of the surrounding area. */
  locationVibeDescription?: string | null;
  /** Total number of nearby POIs across all categories. */
  nearbyTotalCount?: number | null;
  /** The POI category with the highest count near this buffet. */
  dominantCategory?: string | null;
  /** POI count per category display name. */
  categoryBreakdown?: Record<string, number> | null;
  /** Extracted signature / popular dishes derived from FAQ answers, description, and menu data. */
  signatureDishes?: import('./signatureDishes').SignatureDish[] | null;
  /** Name of the top-ranked signature dish, or null if none were extracted. */
  topDish?: string | null;
  /** Total number of unique signature dishes extracted. */
  dishCount?: number | null;
  /** Composite authenticity score (0–100) derived from regional cuisine signals. */
  authenticityScore?: number | null;
  /** Tier label derived from authenticityScore. Null when score < 25. */
  authenticityTier?: string | null;
  /** Display emoji for the authenticityTier. Null when score < 25. */
  authenticityTierEmoji?: string | null;
  /** Unique list of detected regional Chinese cuisines (e.g. ["Sichuan", "Taiwanese"]). */
  cuisineOrigins?: string[] | null;
  /** The regional cuisine most frequently referenced across all signals, or null. */
  primaryCuisine?: string | null;
  /** All detected authenticity signals. */
  authenticitySignals?: import('./authenticitySignals').AuthenticitySignal[] | null;
  /** Total number of authenticity signals detected. */
  authenticitySignalCount?: number | null;
  /** Computed 5-axis Strength Profile (Food Quality, Service, Variety, Value, Atmosphere). */
  strengthProfile?: import('./strengthProfile').StrengthProfileResult | null;
  /** Composite date night score (0–100). Null when not yet computed. */
  dateNightScore?: number | null;
  /** Tier label derived from dateNightScore. Null when score is 0–24. */
  dateNightTier?: string | null;
  /** Display emoji for the dateNightTier. Null when score is 0–24. */
  dateNightTierEmoji?: string | null;
  /** Individual sub-scores that sum to dateNightScore. */
  dateNightSubScores?: import('./dateNightScore').DateNightSubScores | null;
  /** Human-readable signals that increase the date-worthiness. */
  dateNightPositiveSignals?: string[] | null;
  /** Human-readable signals that reduce the date-worthiness. */
  dateNightNegativeSignals?: string[] | null;
  /** Whether this buffet ranks #1 in its neighborhood AND has at least one competitor. */
  isNeighborhoodChampion?: boolean | null;
  /** 1-based rank within the neighborhood, sorted by rating desc → reviewsCount desc → name asc. Null when no neighborhood. */
  neighborhoodRank?: number | null;
  /** Total number of buffets sharing this neighborhood in the same city. Null when no neighborhood. */
  neighborhoodBuffetCount?: number | null;
  /**
   * Rating gap between this buffet (#1) and the #2 buffet, rounded to 1 decimal.
   * Set to 0.0 when champion and #2 are tied on rating.
   * Null when not champion or no neighborhood.
   */
  ratingGap?: number | null;
  /**
   * Badge text for the champion only. E.g. "#1 of 9 in Montrose 🏆".
   * The 🏆 emoji is embedded in this string as part of the display label.
   * Null for all non-champion ranks.
   */
  neighborhoodBadgeText?: string | null;
  /**
   * Standalone medal emoji for use in compact/icon contexts (e.g. table cells, map pins).
   * "🏆" for rank 1 (count≥2), "🥈" for rank 2 (count≥3), "🥉" for rank 3 (count≥4).
   * Null for rank 2 with count=2, rank 4+, sole occupant, or no neighborhood.
   * Note: for rank 1 this duplicates the emoji embedded in neighborhoodBadgeText — both
   * fields serve different rendering purposes (full label vs. standalone icon).
   */
  neighborhoodBadgeEmoji?: string | null;
  /**
   * Human-readable rank string. Always set when `neighborhood` is non-null.
   * - Sole occupant: "Only buffet in {neighborhood}"
   * - Otherwise: "#{rank} of {count} in {neighborhood}"
   * Null when no neighborhood.
   */
  neighborhoodRankText?: string | null;
  /** True when this buffet is the sole occupant of its neighborhood in the city. */
  isOnlyInNeighborhood?: boolean | null;
  /** Composite full-night-out score (0–100). Null when not yet computed. */
  fullNightOutScore?: number | null;
  /** Tier label derived from fullNightOutScore. Null when score is 0–24. */
  fullNightOutTier?: string | null;
  /** Display emoji for the fullNightOutTier. Null when score is 0–24. */
  fullNightOutTierEmoji?: string | null;
  /** Individual sub-scores that sum to fullNightOutScore. */
  fullNightOutSubScores?: import('./fullNightOutScore').FullNightOutSubScores | null;
  /** Human-readable signals that increase the full-night-out score. */
  fullNightOutPositiveSignals?: string[] | null;
  /** Human-readable signals that reduce the full-night-out score. */
  fullNightOutNegativeSignals?: string[] | null;
  /**
   * Bayesian-weighted rating that adjusts the raw score based on review volume
   * relative to the city median. Rounds to 2 decimal places. Null when not yet computed.
   * See lib/trustedRating.ts for the formula.
   */
  trustedRating?: number | null;
  /** trustedRating formatted to 1 decimal place, e.g. "4.7". Null when not yet computed. */
  trustedRatingDisplay?: string | null;
  /** Human-readable confidence label derived from review count vs. city median. */
  confidenceTier?: string | null;
  /** Visual indicator emoji for confidenceTier. */
  confidenceTierEmoji?: string | null;
  /** The city average rating (C) used in the trusted rating formula. */
  cityAverageRating?: number | null;
  /** The city median review count (m, ≥ 50) used in the trusted rating formula. */
  cityMedianReviews?: number | null;
}

export interface City {
  rank: number;
  city: string;
  state: string;
  stateAbbr: string;
  population: number;
  slug: string;
  buffets: Buffet[];
}

export interface BuffetsByCity {
  [citySlug: string]: City;
}

export interface BuffetsById {
  [buffetId: string]: Buffet;
}

export interface Summary {
  totalCities: number;
  totalBuffets: number;
  unmatchedBuffets: number;
  cities: Array<{
    slug: string;
    city: string;
    state: string;
    buffetCount: number;
  }>;
}

// Cache data in memory
let buffetsByCityCache: BuffetsByCity | null = null;
let buffetsByIdCache: BuffetsById | null = null;
let summaryCache: Summary | null = null;

function getDataPath(filename: string): string {
  return path.join(process.cwd(), 'data', filename);
}

export function getBuffetsByCity(): BuffetsByCity {
  if (buffetsByCityCache) {
    return buffetsByCityCache;
  }
  
  try {
    const filePath = getDataPath('buffets-by-city.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    buffetsByCityCache = JSON.parse(fileContents);
    return buffetsByCityCache || {};
  } catch (error) {
    console.error('Error loading buffets-by-city.json:', error);
    return {};
  }
}

export function getBuffetsById(): BuffetsById {
  if (buffetsByIdCache) {
    return buffetsByIdCache;
  }
  
  try {
    const filePath = getDataPath('buffets-by-id.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    buffetsByIdCache = JSON.parse(fileContents);
    return buffetsByIdCache || {};
  } catch (error) {
    console.error('Error loading buffets-by-id.json:', error);
    return {};
  }
}

export function getSummary(): Summary | null {
  if (summaryCache) {
    return summaryCache;
  }
  
  try {
    const filePath = getDataPath('summary.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    summaryCache = JSON.parse(fileContents);
    return summaryCache;
  } catch (error) {
    console.error('Error loading summary.json:', error);
    return null;
  }
}

export function getCityBySlug(citySlug: string): City | null {
  const buffetsByCity = getBuffetsByCity();
  return buffetsByCity[citySlug] || null;
}

export function getBuffetById(buffetId: string): Buffet | null {
  const buffetsById = getBuffetsById();
  return buffetsById[buffetId] || null;
}

export function getBuffetBySlug(citySlug: string, buffetSlug: string): Buffet | null {
  const city = getCityBySlug(citySlug);
  if (!city) return null;
  
  return city.buffets.find(b => b.slug === buffetSlug) || null;
}

export function getAllCitySlugs(): string[] {
  const buffetsByCity = getBuffetsByCity();
  return Object.keys(buffetsByCity);
}

export function getNearbyBuffets(
  lat: number,
  lng: number,
  maxDistance: number = 10,
  excludeId?: string
): Buffet[] {
  const buffetsById = getBuffetsById();
  const nearby: Array<{ buffet: Buffet; distance: number }> = [];
  
  for (const buffet of Object.values(buffetsById)) {
    if (excludeId && buffet.id === excludeId) continue;
    if (!buffet.location || !buffet.location.lat || !buffet.location.lng) continue;
    
    const distance = calculateDistance(
      lat,
      lng,
      buffet.location.lat,
      buffet.location.lng
    );
    
    if (distance <= maxDistance) {
      nearby.push({ buffet, distance });
    }
  }
  
  return nearby
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10)
    .map(item => item.buffet);
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getAllBuffets(): Buffet[] {
  const buffetsById = getBuffetsById();
  return Object.values(buffetsById);
}

export function getSampleBuffets(count: number = 100): Buffet[] {
  const allBuffets = getAllBuffets();
  // Return a sample, prioritizing higher-rated buffets
  return allBuffets
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, count);
}

