/**
 * Build facet index from a buffet object.
 * This module extracts amenity, nearby POI, rating, price, dine options,
 * and standout tag data from buffets for efficient faceted filtering.
 *
 * Pure function - no DB calls, fully unit-testable.
 */

import {
  AMENITY_KEYS,
  NEARBY_CATEGORY_KEYS,
  DINE_OPTION_KEYS,
  bucketizeDistanceMiles,
  bucketizeRating,
  bucketizeReviewCount,
  parsePriceToBucket,
  extractStandoutTags,
  type AmenityKey,
  type NearbyCategoryKey,
  type DistanceBuckets,
  type RatingBucketKey,
  type ReviewCountBucketKey,
  type PriceBucketKey,
  type DineOptionKey,
  type StandoutTagKey,
} from './taxonomy';

// =============================================================================
// TYPES
// =============================================================================

/** Nearby category facet with distance buckets and count */
export interface NearbyCategoryFacet extends DistanceBuckets {
  /** Total number of POIs in this category within 1 mile */
  count: number;
}

/**
 * Time range for business hours.
 * Times are in minutes from midnight (0-1439).
 * Close can be > 1439 if business is open past midnight.
 */
export interface TimeRange {
  open: number;
  close: number;
}

/**
 * Parsed business hours indexed by day (0 = Sunday, 6 = Saturday).
 * Each day can have multiple time ranges (e.g., lunch and dinner).
 */
export type ParsedHours = Record<number, TimeRange[]>;

/** Result of building facet index for a buffet */
export interface BuffetFacetData {
  /** Amenity presence flags */
  amenities: Record<AmenityKey, boolean>;
  /** Nearby category facets with distance buckets */
  nearby: Record<NearbyCategoryKey, NearbyCategoryFacet>;
  /** Rating bucket flags (4.5+, 4.0+, 3.5+) */
  ratingBuckets: Record<RatingBucketKey, boolean>;
  /** Review count bucket flags (100+, 500+, 1000+) */
  reviewCountBuckets: Record<ReviewCountBucketKey, boolean>;
  /** Price bucket ($, $$, $$$, unknown) */
  priceBucket: PriceBucketKey;
  /** Dine option flags (dine_in, takeout, delivery) */
  dineOptions: Record<DineOptionKey, boolean>;
  /** Standout tags extracted from "What stands out" text */
  standoutTags: StandoutTagKey[];
  /** Neighborhood slug if present */
  neighborhood: string | null;
  /** Parsed business hours for "Open now" filtering */
  parsedHours: ParsedHours | null;
  /** IANA timezone string (e.g., "America/New_York") */
  timezone: string | null;
  /** Whether this buffet has valid hours data (for conditional "Open now" UI) */
  hasHours: boolean;
}

/** POI item structure as stored on buffet */
interface POIItem {
  name?: string;
  category?: string;
  distanceText?: string;
  distanceFt?: number;
}

/** POI highlight group */
interface POIHighlightGroup {
  label: string;
  items?: POIItem[];
}

/** POI section structure on buffet */
interface POISection {
  summary?: string;
  highlights?: POIHighlightGroup[];
  poiCount?: number;
}

/** Amenities data structure from structuredData */
interface AmenitiesData {
  amenities?: string[];
  takeout?: boolean | string;
  delivery?: boolean | string;
  dineIn?: boolean | string;
  reservable?: boolean | string;
  curbsidePickup?: boolean | string;
  allowsDogs?: boolean | string;
  hasTv?: boolean | string;
  restroom?: boolean | string;
  wifi?: boolean | string;
  outdoorSeating?: boolean | string;
  parking?: boolean | string | Record<string, unknown>;
  wheelchairAccessible?: boolean | string;
  alcohol?: boolean | string;
  creditCards?: boolean | string;
  [key: string]: unknown;
}

/** Buffet object shape for facet extraction */
export interface BuffetForFacets {
  id?: string;
  amenities?: AmenitiesData;
  accessibility?: Record<string, unknown>;
  // Core fields for new facets
  rating?: number | null;
  reviewsCount?: number | null;
  price?: string | null;
  neighborhood?: string | null;
  // "What stands out" / customer highlights
  what_customers_are_saying_seo?: string | null;
  reviewSummaryParagraph1?: string | null;
  reviewSummaryParagraph2?: string | null;
  // Service options (for dine options)
  serviceOptions?: Record<string, unknown>;
  // Hours and timezone for "Open now" filtering
  hours?: unknown; // Can be various formats - array or object
  timezone?: string | null;
  // POI sections - all optional
  transportationAutomotive?: POISection;
  accomodationLodging?: POISection;
  accommodationLodging?: POISection; // alternate spelling
  retailShopping?: POISection;
  foodDining?: POISection;
  recreationEntertainment?: POISection;
  educationLearning?: POISection;
  repairMaintenance?: POISection;
  artsCulture?: POISection;
  travelTourismServices?: POISection;
  [key: string]: unknown;
}

// =============================================================================
// DISTANCE PARSING
// =============================================================================

/**
 * Parse distance text like "~800 ft" or "~0.5 mi" to miles.
 * Falls back to distanceFt if available, otherwise returns Infinity.
 */
export function parseDistanceToMiles(
  distanceText?: string,
  distanceFt?: number
): number {
  // Try parsing distanceText first
  if (distanceText) {
    const text = distanceText.toLowerCase().trim();

    // Match feet: "~800 ft", "800ft", "~800 feet"
    const ftMatch = text.match(/~?\s*([\d.]+)\s*(?:ft|feet)/);
    if (ftMatch) {
      const feet = parseFloat(ftMatch[1]);
      if (!isNaN(feet)) {
        return feet / 5280;
      }
    }

    // Match miles: "~0.5 mi", "0.5mi", "~0.5 miles"
    const miMatch = text.match(/~?\s*([\d.]+)\s*(?:mi|miles?)/);
    if (miMatch) {
      const miles = parseFloat(miMatch[1]);
      if (!isNaN(miles)) {
        return miles;
      }
    }
  }

  // Fall back to distanceFt if available
  if (typeof distanceFt === 'number' && isFinite(distanceFt) && distanceFt >= 0) {
    return distanceFt / 5280;
  }

  return Infinity;
}

// =============================================================================
// CATEGORY MAPPING
// =============================================================================

/**
 * Map POI section key + item category to our NearbyCategoryKey.
 * Returns null if no mapping exists.
 */
const POI_SECTION_CATEGORY_MAP: Record<string, NearbyCategoryKey[]> = {
  // Transportation section contains multiple categories
  transportationAutomotive: ['transit', 'parking_lot', 'gas_station'],
  // Lodging
  accomodationLodging: ['hotel'],
  accommodationLodging: ['hotel'],
  // Retail
  retailShopping: ['shopping', 'grocery'],
  // Food
  foodDining: ['restaurant'],
  // Recreation/Entertainment
  recreationEntertainment: ['park', 'nightlife', 'tourist_attraction'],
  // Education
  educationLearning: ['education'],
  // Repair
  repairMaintenance: ['repair'],
  // Travel/Tourism
  travelTourismServices: ['tourist_attraction', 'hotel'],
  // Arts & Culture
  artsCulture: ['tourist_attraction'],
};

/**
 * Map POI item category string to NearbyCategoryKey.
 * Uses fuzzy matching on common category patterns.
 */
const CATEGORY_STRING_MAP: Record<string, NearbyCategoryKey> = {
  // Hotels/Lodging
  hotel: 'hotel',
  motel: 'hotel',
  hostel: 'hotel',
  lodging: 'hotel',
  inn: 'hotel',
  // Transit
  bus_station: 'transit',
  train_station: 'transit',
  subway: 'transit',
  metro: 'transit',
  taxi: 'transit',
  rideshare: 'transit',
  public_transport: 'transit',
  transit: 'transit',
  // Parking
  parking: 'parking_lot',
  parking_lot: 'parking_lot',
  parking_space: 'parking_lot',
  garage: 'parking_lot',
  // Gas/Fuel
  gas_station: 'gas_station',
  fuel: 'gas_station',
  petrol: 'gas_station',
  // Shopping
  shopping_mall: 'shopping',
  shopping_center: 'shopping',
  mall: 'shopping',
  department_store: 'shopping',
  retail: 'shopping',
  shop: 'shopping',
  // Grocery
  supermarket: 'grocery',
  grocery: 'grocery',
  convenience: 'grocery',
  convenience_store: 'grocery',
  // Restaurant
  restaurant: 'restaurant',
  cafe: 'restaurant',
  fast_food: 'restaurant',
  // Parks
  park: 'park',
  playground: 'park',
  garden: 'park',
  // Nightlife
  bar: 'nightlife',
  pub: 'nightlife',
  nightclub: 'nightlife',
  club: 'nightlife',
  // Education
  school: 'education',
  university: 'education',
  college: 'education',
  library: 'education',
  // Tourist attractions
  museum: 'tourist_attraction',
  attraction: 'tourist_attraction',
  tourist_attraction: 'tourist_attraction',
  landmark: 'tourist_attraction',
  monument: 'tourist_attraction',
  // Repair
  repair: 'repair',
  car_repair: 'repair',
  mechanic: 'repair',
};

/**
 * Determine the NearbyCategoryKey for a POI item.
 */
function mapPOIToCategory(
  sectionKey: string,
  itemCategory?: string,
  groupLabel?: string
): NearbyCategoryKey | null {
  // First, try to match by item category string
  if (itemCategory) {
    const normalizedCategory = itemCategory.toLowerCase().replace(/[- ]/g, '_');
    if (normalizedCategory in CATEGORY_STRING_MAP) {
      return CATEGORY_STRING_MAP[normalizedCategory];
    }
    // Partial matching for compound categories
    for (const [pattern, key] of Object.entries(CATEGORY_STRING_MAP)) {
      if (normalizedCategory.includes(pattern)) {
        return key;
      }
    }
  }

  // Try to match by group label
  if (groupLabel) {
    const normalizedLabel = groupLabel.toLowerCase().replace(/[- ]/g, '_');
    if (normalizedLabel in CATEGORY_STRING_MAP) {
      return CATEGORY_STRING_MAP[normalizedLabel];
    }
    for (const [pattern, key] of Object.entries(CATEGORY_STRING_MAP)) {
      if (normalizedLabel.includes(pattern)) {
        return key;
      }
    }
  }

  // Fall back to section-level mapping (first category in list)
  const sectionCategories = POI_SECTION_CATEGORY_MAP[sectionKey];
  if (sectionCategories && sectionCategories.length > 0) {
    return sectionCategories[0];
  }

  return null;
}

// =============================================================================
// AMENITY EXTRACTION
// =============================================================================

/**
 * Normalize an amenity value to boolean.
 */
function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'yes' || value === 'true' || value === 1) return true;
  if (typeof value === 'object' && value !== null) {
    // Handle nested structures like { parking: true }
    const obj = value as Record<string, unknown>;
    return Object.values(obj).some((v) => toBool(v));
  }
  return false;
}

/**
 * Map amenities data to our canonical AmenityKey flags.
 * Handles various data formats and field name variations.
 */
const AMENITY_FIELD_MAP: Record<AmenityKey, string[]> = {
  parking: ['parking', 'freeParking', 'paidParking', 'parkingAvailable'],
  wheelchair_accessible: [
    'wheelchairAccessible',
    'wheelchair_accessible',
    'wheelchairAccessibleEntrance',
    'accessibleEntrance',
  ],
  kids_friendly: [
    'kidsFriendly',
    'kids_friendly',
    'goodForKids',
    'familyFriendly',
    'family_friendly',
    'family friendly',
    'highChair',
  ],
  reservations: ['reservable', 'reservations', 'acceptsReservations'],
  takeout: ['takeout', 'takeOut', 'toGo'],
  delivery: ['delivery', 'delivers', 'hasDelivery'],
  wifi: ['wifi', 'freeWifi', 'wiFi', 'hasWifi'],
  alcohol: ['alcohol', 'servesAlcohol', 'beer', 'wine', 'fullBar'],
  credit_cards_accepted: [
    'creditCards',
    'credit_cards_accepted',
    'acceptsCreditCards',
    'cards',
  ],
  outdoor_seating: [
    'outdoorSeating',
    'outdoor_seating',
    'patio',
    'terrace',
    'outsideSeating',
  ],
  private_dining: [
    'privateDining',
    'private_dining',
    'privateRoom',
    'privateParty',
  ],
};

/**
 * Extract amenity flags from buffet amenities data.
 */
function extractAmenities(
  amenitiesData?: AmenitiesData,
  accessibilityData?: Record<string, unknown>
): Record<AmenityKey, boolean> {
  const result: Record<AmenityKey, boolean> = {} as Record<AmenityKey, boolean>;

  // Initialize all to false
  for (const key of AMENITY_KEYS) {
    result[key] = false;
  }

  if (!amenitiesData && !accessibilityData) {
    return result;
  }

  // Merge amenities and accessibility data
  const combined = { ...amenitiesData, ...accessibilityData };

  // Check each amenity key against its possible field names
  for (const [amenityKey, fieldNames] of Object.entries(AMENITY_FIELD_MAP)) {
    for (const fieldName of fieldNames) {
      if (fieldName in combined && toBool(combined[fieldName])) {
        result[amenityKey as AmenityKey] = true;
        break;
      }
    }
  }

  // Also check the amenities string array
  if (amenitiesData?.amenities && Array.isArray(amenitiesData.amenities)) {
    for (const amenityStr of amenitiesData.amenities) {
      if (typeof amenityStr !== 'string') continue;
      // Normalize: lowercase, replace spaces/hyphens with underscores
      const normalized = amenityStr.toLowerCase().replace(/[- ]/g, '_');

      // Check if this string matches any of our amenity patterns
      for (const [amenityKey, fieldNames] of Object.entries(AMENITY_FIELD_MAP)) {
        for (const fieldName of fieldNames) {
          // Normalize the field name the same way
          const normalizedFieldName = fieldName.toLowerCase().replace(/[- ]/g, '_');
          if (
            normalized.includes(normalizedFieldName) ||
            normalizedFieldName.includes(normalized)
          ) {
            result[amenityKey as AmenityKey] = true;
            break;
          }
        }
      }
    }
  }

  return result;
}

// =============================================================================
// DINE OPTIONS EXTRACTION
// =============================================================================

/**
 * Field names that map to dine option keys.
 */
const DINE_OPTION_FIELD_MAP: Record<DineOptionKey, string[]> = {
  dine_in: ['dineIn', 'dine_in', 'dinein', 'seatIn', 'eatIn'],
  takeout: ['takeout', 'takeOut', 'take_out', 'toGo', 'carryOut', 'carryout'],
  delivery: ['delivery', 'delivers', 'hasDelivery', 'deliveryAvailable'],
};

/**
 * Extract dine option flags from buffet data.
 * Checks amenities, serviceOptions, and other relevant fields.
 */
function extractDineOptions(
  amenitiesData?: AmenitiesData,
  serviceOptions?: Record<string, unknown>
): Record<DineOptionKey, boolean> {
  const result: Record<DineOptionKey, boolean> = {
    dine_in: false,
    takeout: false,
    delivery: false,
  };

  // Merge all potential sources
  const combined = { ...amenitiesData, ...serviceOptions };

  // Check each dine option against its possible field names
  for (const [optionKey, fieldNames] of Object.entries(DINE_OPTION_FIELD_MAP)) {
    for (const fieldName of fieldNames) {
      if (fieldName in combined && toBool(combined[fieldName])) {
        result[optionKey as DineOptionKey] = true;
        break;
      }
    }
  }

  // Also check amenities string array
  if (amenitiesData?.amenities && Array.isArray(amenitiesData.amenities)) {
    for (const amenityStr of amenitiesData.amenities) {
      if (typeof amenityStr !== 'string') continue;
      const normalized = amenityStr.toLowerCase().replace(/[- ]/g, '_');

      if (normalized.includes('dine') && normalized.includes('in')) {
        result.dine_in = true;
      }
      if (normalized.includes('takeout') || normalized.includes('take_out') || normalized.includes('to_go')) {
        result.takeout = true;
      }
      if (normalized.includes('delivery') || normalized.includes('deliver')) {
        result.delivery = true;
      }
    }
  }

  // Special case: if we detected takeout/delivery from amenities, apply here too
  if (amenitiesData?.takeout) result.takeout = toBool(amenitiesData.takeout);
  if (amenitiesData?.delivery) result.delivery = toBool(amenitiesData.delivery);
  if (amenitiesData?.dineIn) result.dine_in = toBool(amenitiesData.dineIn);

  return result;
}

// =============================================================================
// STANDOUT TAGS EXTRACTION
// =============================================================================

/**
 * Extract standout tags from buffet's "What stands out" / review summary text.
 */
function extractStandoutTagsFromBuffet(buffet: BuffetForFacets): StandoutTagKey[] {
  const textParts: string[] = [];

  // Gather all text sources
  if (buffet.what_customers_are_saying_seo) {
    textParts.push(buffet.what_customers_are_saying_seo);
  }
  if (buffet.reviewSummaryParagraph1) {
    textParts.push(buffet.reviewSummaryParagraph1);
  }
  if (buffet.reviewSummaryParagraph2) {
    textParts.push(buffet.reviewSummaryParagraph2);
  }

  // Combine and extract tags
  const combinedText = textParts.join(' ');
  return extractStandoutTags(combinedText);
}

// =============================================================================
// NEIGHBORHOOD EXTRACTION
// =============================================================================

/**
 * Normalize neighborhood string to a slug format.
 */
export function normalizeNeighborhoodSlug(neighborhood: string | null | undefined): string | null {
  if (!neighborhood || typeof neighborhood !== 'string') {
    return null;
  }

  const trimmed = neighborhood.trim();
  if (!trimmed) return null;

  // Convert to lowercase, replace spaces/special chars with hyphens
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

// =============================================================================
// NEARBY POI EXTRACTION
// =============================================================================

/** POI section keys to scan on buffet object */
const POI_SECTION_KEYS = [
  'transportationAutomotive',
  'accomodationLodging',
  'accommodationLodging',
  'retailShopping',
  'foodDining',
  'recreationEntertainment',
  'educationLearning',
  'repairMaintenance',
  'artsCulture',
  'travelTourismServices',
] as const;

/**
 * Create empty nearby category facet.
 */
function emptyNearbyFacet(): NearbyCategoryFacet {
  return {
    within025: false,
    within05: false,
    within1: false,
    count: 0,
  };
}

/**
 * Extract nearby POI facets from buffet POI sections.
 */
function extractNearbyPOIs(
  buffet: BuffetForFacets
): Record<NearbyCategoryKey, NearbyCategoryFacet> {
  const result: Record<NearbyCategoryKey, NearbyCategoryFacet> = {} as Record<
    NearbyCategoryKey,
    NearbyCategoryFacet
  >;

  // Initialize all categories with empty facets
  for (const key of NEARBY_CATEGORY_KEYS) {
    result[key] = emptyNearbyFacet();
  }

  // Scan each POI section
  for (const sectionKey of POI_SECTION_KEYS) {
    const section = buffet[sectionKey] as POISection | undefined;
    if (!section?.highlights) continue;

    for (const group of section.highlights) {
      if (!group.items) continue;

      for (const item of group.items) {
        // Determine category for this POI
        const categoryKey = mapPOIToCategory(
          sectionKey,
          item.category,
          group.label
        );
        if (!categoryKey) continue;

        // Parse distance
        const distanceMiles = parseDistanceToMiles(
          item.distanceText,
          item.distanceFt
        );

        // Skip POIs beyond 1 mile
        if (distanceMiles > 1.0) continue;

        // Get bucket flags
        const buckets = bucketizeDistanceMiles(distanceMiles);

        // Update the category facet
        const facet = result[categoryKey];
        facet.count++;
        facet.within025 = facet.within025 || buckets.within025;
        facet.within05 = facet.within05 || buckets.within05;
        facet.within1 = facet.within1 || buckets.within1;
      }
    }
  }

  return result;
}

// =============================================================================
// HOURS PARSING
// =============================================================================

/** Day name to index mapping */
const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Parse a time string like "11:00 AM", "1100", "11:00" to minutes from midnight.
 */
function parseTimeToMinutes(time: string): number | null {
  if (!time) return null;
  
  const trimmed = time.trim().toLowerCase();
  
  // Handle "11:00 AM" or "11:00 PM" format
  const amPmMatch = trimmed.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (amPmMatch) {
    let hours = parseInt(amPmMatch[1], 10);
    const minutes = amPmMatch[2] ? parseInt(amPmMatch[2], 10) : 0;
    const period = amPmMatch[3];
    
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }
  
  // Handle "1100" format (military time without colon)
  const militaryMatch = trimmed.match(/^(\d{3,4})$/);
  if (militaryMatch) {
    const str = militaryMatch[1].padStart(4, '0');
    const hours = parseInt(str.slice(0, 2), 10);
    const minutes = parseInt(str.slice(2), 10);
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }
  
  return null;
}

/**
 * Parse a day name or index to a day index (0 = Sunday).
 */
function parseDayIndex(day: string | number): number | null {
  if (typeof day === 'number') {
    return day >= 0 && day <= 6 ? day : null;
  }
  
  const normalized = day.toLowerCase().trim();
  return DAY_NAME_TO_INDEX[normalized] ?? null;
}

/**
 * Parse hours string like "11:00 AM - 9:00 PM" into time ranges.
 */
function parseHoursRange(hoursStr: string): TimeRange[] {
  if (!hoursStr) return [];
  
  const ranges: TimeRange[] = [];
  
  // Split by comma for multiple ranges (e.g., "11:00 AM - 2:00 PM, 5:00 PM - 9:00 PM")
  const parts = hoursStr.split(',');
  
  for (const part of parts) {
    // Match "11:00 AM - 9:00 PM" or "11:00-21:00" etc.
    const match = part.match(/(\d{1,2}:?\d{0,2}\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm)?)/i);
    if (match) {
      const openMinutes = parseTimeToMinutes(match[1]);
      let closeMinutes = parseTimeToMinutes(match[2]);
      
      if (openMinutes !== null && closeMinutes !== null) {
        // Handle overnight hours (close < open means next day)
        if (closeMinutes < openMinutes) {
          closeMinutes += 24 * 60; // Add 24 hours
        }
        ranges.push({ open: openMinutes, close: closeMinutes });
      }
    }
  }
  
  return ranges;
}

/**
 * Parse various hours formats into normalized ParsedHours structure.
 * Handles:
 * - Array of { day: string, hours: string }
 * - Array with open property: [{ open: [{ day: number, start: string, end: string }] }]
 * - Object with day keys: { Monday: "11:00 AM - 9:00 PM", ... }
 */
function parseBusinessHours(hours: unknown): ParsedHours | null {
  if (!hours) return null;
  
  const result: ParsedHours = {};
  
  // Format 1: Array of { day: string, hours: string }
  if (Array.isArray(hours) && hours.length > 0 && hours[0]?.day && hours[0]?.hours) {
    for (const item of hours) {
      const dayIndex = parseDayIndex(item.day);
      if (dayIndex !== null && item.hours) {
        const ranges = parseHoursRange(String(item.hours));
        if (ranges.length > 0) {
          result[dayIndex] = ranges;
        }
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }
  
  // Format 2: Array with open property [{ open: [{ day, start, end }] }]
  if (Array.isArray(hours) && hours.length > 0 && Array.isArray(hours[0]?.open)) {
    for (const entry of hours[0].open) {
      const dayIndex = parseDayIndex(entry.day);
      if (dayIndex !== null) {
        const openMinutes = parseTimeToMinutes(String(entry.start || ''));
        let closeMinutes = parseTimeToMinutes(String(entry.end || ''));
        
        if (openMinutes !== null && closeMinutes !== null) {
          if (closeMinutes < openMinutes) {
            closeMinutes += 24 * 60;
          }
          if (!result[dayIndex]) result[dayIndex] = [];
          result[dayIndex].push({ open: openMinutes, close: closeMinutes });
        }
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }
  
  // Format 3: Object with day keys { Monday: "11:00 AM - 9:00 PM" }
  if (typeof hours === 'object' && !Array.isArray(hours)) {
    for (const [day, hoursStr] of Object.entries(hours as Record<string, unknown>)) {
      if (typeof hoursStr !== 'string') continue;
      const dayIndex = parseDayIndex(day);
      if (dayIndex !== null) {
        const ranges = parseHoursRange(hoursStr);
        if (ranges.length > 0) {
          result[dayIndex] = ranges;
        }
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }
  
  return null;
}

/**
 * Check if a buffet is currently open based on parsed hours and timezone.
 * 
 * @param parsedHours - Parsed business hours from facet data
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @param now - Optional Date for testing (defaults to current time)
 * @returns true if open, false if closed, null if hours data unavailable
 */
export function isOpenNow(
  parsedHours: ParsedHours | null,
  timezone: string | null,
  now: Date = new Date()
): boolean | null {
  if (!parsedHours || Object.keys(parsedHours).length === 0) {
    return null; // Unknown - no hours data
  }
  
  // Get current time in the buffet's timezone
  let dayIndex: number;
  let currentMinutes: number;
  
  try {
    if (timezone) {
      // Use Intl to get time in specific timezone
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false,
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(now);
      
      const weekdayPart = parts.find(p => p.type === 'weekday')?.value?.toLowerCase();
      const hourPart = parts.find(p => p.type === 'hour')?.value;
      const minutePart = parts.find(p => p.type === 'minute')?.value;
      
      dayIndex = DAY_NAME_TO_INDEX[weekdayPart || ''] ?? now.getDay();
      currentMinutes = (parseInt(hourPart || '0', 10) * 60) + parseInt(minutePart || '0', 10);
    } else {
      // Fall back to local time
      dayIndex = now.getDay();
      currentMinutes = now.getHours() * 60 + now.getMinutes();
    }
  } catch {
    // Fall back to UTC
    dayIndex = now.getUTCDay();
    currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  
  // Check today's hours
  const todayRanges = parsedHours[dayIndex];
  if (todayRanges) {
    for (const range of todayRanges) {
      if (currentMinutes >= range.open && currentMinutes < range.close) {
        return true;
      }
    }
  }
  
  // Check yesterday for overnight hours (close > 24*60)
  const yesterdayIndex = (dayIndex + 6) % 7;
  const yesterdayRanges = parsedHours[yesterdayIndex];
  if (yesterdayRanges) {
    for (const range of yesterdayRanges) {
      // Overnight hours: if close > 1440, check if we're still in that range
      if (range.close > 24 * 60) {
        const adjustedClose = range.close - 24 * 60;
        if (currentMinutes < adjustedClose) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Build facet data from a buffet object.
 *
 * This is a pure function with no side effects or DB calls.
 * It inspects the buffet's amenities, nearby POI sections, rating,
 * reviews, price, dine options, and standout tags.
 *
 * @param buffet - Buffet object with all relevant data
 * @returns Structured facet data for efficient filtering
 *
 * @example
 * const facets = buildFacetIndex(buffet);
 * // facets.amenities.parking === true
 * // facets.ratingBuckets.rating_45 === true
 * // facets.priceBucket === 'price_2'
 * // facets.standoutTags === ['crab_legs', 'fresh_food']
 */
export function buildFacetIndex(buffet: BuffetForFacets): BuffetFacetData {
  // Parse hours once for efficiency
  const parsedHours = parseBusinessHours(buffet.hours);
  const hasHours = parsedHours !== null && Object.keys(parsedHours).length > 0;

  return {
    // Amenities (parking, wifi, etc.)
    amenities: extractAmenities(
      buffet.amenities,
      buffet.accessibility as Record<string, unknown>
    ),
    // Nearby POIs with distance buckets
    nearby: extractNearbyPOIs(buffet),
    // Rating buckets (4.5+, 4.0+, 3.5+)
    ratingBuckets: bucketizeRating(buffet.rating),
    // Review count buckets (100+, 500+, 1000+)
    reviewCountBuckets: bucketizeReviewCount(buffet.reviewsCount),
    // Price bucket ($, $$, $$$, unknown)
    priceBucket: parsePriceToBucket(buffet.price),
    // Dine options (dine_in, takeout, delivery)
    dineOptions: extractDineOptions(
      buffet.amenities,
      buffet.serviceOptions as Record<string, unknown>
    ),
    // Standout tags from reviews/summaries
    standoutTags: extractStandoutTagsFromBuffet(buffet),
    // Neighborhood slug
    neighborhood: normalizeNeighborhoodSlug(buffet.neighborhood),
    // Parsed business hours for "Open now" filtering
    parsedHours,
    // Timezone for correct time calculation
    timezone: buffet.timezone || null,
    // Whether this buffet has valid hours data (for conditional "Open now" UI)
    hasHours,
  };
}
