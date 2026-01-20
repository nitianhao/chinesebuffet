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
  images?: Array<{ photoUrl?: string; photoReference?: string; [key: string]: any }>;
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

