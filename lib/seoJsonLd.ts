/**
 * JSON-LD Structured Data Builders
 * 
 * This module provides utilities to build valid Schema.org JSON-LD structured data
 * for restaurant/buffet detail pages. All functions are designed to be safe and
 * omit missing data rather than including invalid fields.
 * 
 * LAYERED SCHEMA APPROACH:
 * - LocalBusiness: Base schema for any local business
 * - Restaurant: Extends LocalBusiness with food-specific fields
 * - Review: Individual customer reviews (can be standalone or nested)
 * - FAQPage: Questions and answers from customers
 * - Place: Nearby points of interest (POIs)
 * - BreadcrumbList: Navigation hierarchy
 * 
 * VALIDATION:
 * - All schemas are validated for required fields
 * - Invalid data is omitted rather than included with placeholders
 * - Dev mode logs warnings for incomplete schemas
 */

import { getSiteUrl } from '@/lib/site-url';

// Base URL configuration — single source of truth via getSiteUrl()
const DEFAULT_BASE_URL = getSiteUrl();

/**
 * Schema validation result interface
 */
export interface SchemaValidationResult {
  isValid: boolean;
  schemaType: string;
  errors: string[];
  warnings: string[];
}

/**
 * Utility: Convert value to number, returning null if invalid
 */
export function asNumber(value: any): number | null {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Utility: Clamp rating value to 1-5 range
 */
export function clampRating(value: any): number | null {
  const num = asNumber(value);
  if (num === null) return null;
  if (num < 1) return 1;
  if (num > 5) return 5;
  return num;
}

/**
 * Utility: Convert date to ISO string, returning null if invalid
 */
export function toIsoDate(value: any): string | null {
  if (!value) return null;
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  if (typeof value === 'string') {
    // Try parsing as ISO date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  
  return null;
}

/**
 * Utility: Strip HTML tags from text
 */
export function stripHtml(text: string | null | undefined): string {
  if (!text) return '';
  // Simple HTML tag removal - for more complex cases, consider using a library
  return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Utility: Truncate text to max length
 */
export function truncate(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  const cleaned = stripHtml(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

/**
 * Utility: Convert relative URL to absolute URL
 */
export function toAbsoluteUrl(url: string | null | undefined | any, baseUrl: string): string | null {
  if (!url) return null;
  
  // Convert to string if it's not already
  let urlString: string;
  if (typeof url === 'string') {
    urlString = url;
  } else if (typeof url === 'object' && url !== null) {
    // If it's an object, try to extract a URL property
    urlString = url.url || url.href || url.toString() || '';
  } else {
    // For functions or other types, skip
    return null;
  }
  
  if (!urlString || typeof urlString !== 'string') return null;
  
  // Already absolute
  if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
    return urlString;
  }
  
  // Relative URL - prepend base
  const base = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  const path = urlString.startsWith('/') ? urlString : `/${urlString}`;
  return `${base}${path}`;
}

/**
 * Utility: Extract address components from full address string
 * Attempts to parse: "Street, City, State ZIP" or similar formats
 */
export function parseAddress(addressString: string | null | undefined): {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry: string;
} {
  const result: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry: string;
  } = {
    addressCountry: 'US', // Default for this site
  };
  
  if (!addressString) return result;
  
  // Try to parse common address formats
  // Format 1: "123 Main St, City, State 12345"
  // Format 2: "123 Main St, City, State"
  const parts = addressString.split(',').map(s => s.trim()).filter(Boolean);
  
  if (parts.length >= 1) {
    result.streetAddress = parts[0];
  }
  
  if (parts.length >= 2) {
    result.addressLocality = parts[1];
  }
  
  if (parts.length >= 3) {
    // Last part might be "State ZIP" or just "State"
    const lastPart = parts[parts.length - 1];
    const zipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (zipMatch) {
      result.addressRegion = zipMatch[1];
      result.postalCode = zipMatch[2];
    } else {
      // Try to extract state abbreviation (2 letters) and ZIP separately
      const stateZipMatch = lastPart.match(/([A-Z]{2})\s+(.+)/);
      if (stateZipMatch) {
        result.addressRegion = stateZipMatch[1];
        result.postalCode = stateZipMatch[2];
      } else {
        // Assume it's just the state
        result.addressRegion = lastPart.length <= 2 ? lastPart : undefined;
      }
    }
  }
  
  return result;
}

/** Day name to schema.org DayOfWeek (full name) */
const DAY_TO_FULL: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  Monday: 'Monday', Tuesday: 'Tuesday', Wednesday: 'Wednesday', Thursday: 'Thursday',
  Friday: 'Friday', Saturday: 'Saturday', Sunday: 'Sunday',
};

/**
 * Get PostalAddress-shaped object from buffet (handles address as string or object with street, city, stateAbbr, postalCode, full).
 */
function getAddressForSchema(buffet: any): {
  '@type': 'PostalAddress';
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry: string;
} | null {
  const country = 'US';
  if (!buffet?.address) return null;

  const addr = buffet.address;
  if (typeof addr === 'object' && addr !== null) {
    const street = addr.street ?? addr.streetAddress ?? '';
    const locality = addr.city ?? addr.addressLocality ?? '';
    const region = addr.stateAbbr ?? addr.addressRegion ?? addr.state ?? '';
    const postal = addr.postalCode ?? '';
    if (!street && !locality) {
      const fromFull = typeof addr.full === 'string' ? parseAddress(addr.full) : null;
      if (fromFull && (fromFull.streetAddress || fromFull.addressLocality)) {
        return { '@type': 'PostalAddress', ...fromFull, addressCountry: country };
      }
      return null;
    }
    return {
      '@type': 'PostalAddress',
      ...(street && { streetAddress: String(street).trim() }),
      ...(locality && { addressLocality: String(locality).trim() }),
      ...(region && { addressRegion: String(region).trim() }),
      ...(postal && { postalCode: String(postal).trim() }),
      addressCountry: country,
    };
  }
  if (typeof addr === 'string') {
    const parts = parseAddress(addr);
    if (parts.streetAddress || parts.addressLocality) {
      return { '@type': 'PostalAddress', ...parts, addressCountry: country };
    }
  }
  return null;
}

/**
 * Build Restaurant JSON-LD schema
 * 
 * @param buffet - Buffet data object
 * @param siteBaseUrl - Base URL of the site (e.g., "https://chinesebuffetdirectory.com")
 * @param cityStateSlug - City-state slug for URL construction (e.g., "los-angeles-ca")
 * @returns JSON-LD object or null if insufficient data
 */
export function buildRestaurantJsonLd(
  buffet: any,
  siteBaseUrl: string,
  cityStateSlug: string
): any | null {
  if (!buffet?.name) return null;
  
  const pageUrl = `${siteBaseUrl}/chinese-buffets/${cityStateSlug}/${buffet.slug}`;
  const restaurantId = `${pageUrl}#restaurant`;
  
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': restaurantId,
    name: buffet.name,
    url: pageUrl,
  };
  
  // Address - PostalAddress (from string or object)
  const addressForSchema = getAddressForSchema(buffet);
  if (addressForSchema) {
    schema.address = addressForSchema;
  }
  
  // Geo coordinates - only if we have valid lat/lng
  // Check both buffet.location (transformed) and buffet.lat/lng (raw from DB)
  let lat: number | null = null;
  let lng: number | null = null;
  
  if (buffet.location?.lat && buffet.location?.lng) {
    lat = asNumber(buffet.location.lat);
    lng = asNumber(buffet.location.lng);
  } else if (buffet.lat && buffet.lng) {
    // Fallback to raw lat/lng from database
    lat = asNumber(buffet.lat);
    lng = asNumber(buffet.lng);
  }
  
  if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lng,
    };
  }
  
  // Telephone
  if (buffet.contactInfo?.phone || buffet.phone) {
    const phone = buffet.contactInfo?.phone || buffet.phone;
    if (phone && typeof phone === 'string' && phone.trim()) {
      schema.telephone = phone.trim();
    }
  }
  
  // Price range
  if (buffet.price && typeof buffet.price === 'string') {
    schema.priceRange = buffet.price.trim();
  }
  
  // Image(s) - use photoReference via local proxy
  const images: string[] = [];
  
  if (buffet.images && Array.isArray(buffet.images)) {
    buffet.images.slice(0, 5).forEach((img: any) => {
      if (img?.photoReference && typeof img.photoReference === 'string') {
        const proxyUrl = `/api/photo?photoReference=${encodeURIComponent(img.photoReference)}&w=800`;
        const absoluteUrl = toAbsoluteUrl(proxyUrl, siteBaseUrl);
        if (absoluteUrl) images.push(absoluteUrl);
      }
    });
  }
  
  // Image: array of absolute URLs (omit if none; schema.org accepts URL or array)
  if (images.length > 0) {
    schema.image = images;
  }

  // Cuisine type - required for Restaurant
  schema.servesCuisine = ['Chinese'];

  // Opening hours - support buffet.hours as array or buffet.hours.hours
  const hoursArray = Array.isArray(buffet.hours)
    ? buffet.hours
    : buffet.hours?.hours && Array.isArray(buffet.hours.hours)
      ? buffet.hours.hours
      : [];
  if (hoursArray.length > 0) {
    const openingHours: any[] = [];
    for (const dayHours of hoursArray) {
      const day = dayHours?.day;
      const ranges = dayHours?.hours ?? dayHours?.ranges ?? '';
      if (!day || !ranges) continue;
      // Parse "9:00 AM - 10:00 PM" or "11 AM – 9 PM"
      const match = String(ranges).match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
      if (match) {
        openingHours.push({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: DAY_TO_FULL[day] ?? day,
          opens: match[1].trim(),
          closes: match[2].trim(),
        });
      }
    }
    if (openingHours.length > 0) {
      schema.openingHoursSpecification = openingHours;
    }
  }
  
  // Menu URL - ensure it's a string, not a function
  if (buffet.contactInfo?.menuUrl) {
    const menuUrlValue = buffet.contactInfo.menuUrl;
    // Skip if it's a function (like Next.js Link component)
    if (typeof menuUrlValue === 'string') {
      const menuUrl = toAbsoluteUrl(menuUrlValue, siteBaseUrl);
      if (menuUrl) {
        schema.hasMenu = menuUrl;
      }
    }
  }
  
  // Website and sameAs links
  const sameAsLinks: string[] = [];
  
  // Check for website in multiple possible locations
  const website = buffet.website || buffet.contactInfo?.website;
  if (website && typeof website === 'string') {
    const websiteUrl = toAbsoluteUrl(website, siteBaseUrl);
    if (websiteUrl && websiteUrl.startsWith('http')) {
      sameAsLinks.push(websiteUrl);
    }
  }
  
  // Add Google Maps URL if we have location
  if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
    sameAsLinks.push(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  }
  
  if (sameAsLinks.length > 0) {
    schema.sameAs = sameAsLinks.length === 1 ? sameAsLinks[0] : sameAsLinks;
  }
  
  // AggregateRating - only if we have valid rating and review count
  const rating = clampRating(buffet.rating);
  const reviewCount = asNumber(buffet.reviewsCount);
  if (rating !== null && reviewCount !== null && reviewCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toString(),
      reviewCount: Math.floor(reviewCount),
      bestRating: '5',
      worstRating: '1',
    };
  }
  
  // Reviews - only include if we have complete review data
  // This will be handled separately by buildReviewsJsonLd
  
  return schema;
}

/**
 * Build AggregateRating JSON-LD (standalone)
 * Only returns if all required fields are valid
 */
export function buildAggregateRatingJsonLd(
  rating: any,
  reviewCount: any
): any | null {
  const validRating = clampRating(rating);
  const validCount = asNumber(reviewCount);
  
  if (validRating === null || validCount === null || validCount <= 0) {
    return null;
  }
  
  return {
    '@type': 'AggregateRating',
    ratingValue: validRating.toString(),
    reviewCount: Math.floor(validCount).toString(),
    bestRating: '5',
    worstRating: '1',
  };
}

/**
 * Build individual Review JSON-LD objects
 * Only includes reviews with complete required fields
 * 
 * @param reviews - Array of review objects
 * @param maxReviews - Maximum number of reviews to include (default: 10)
 * @returns Array of Review JSON-LD objects
 */
export function buildReviewsJsonLd(
  reviews: any[],
  maxReviews: number = 10
): any[] {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return [];
  }
  
  const validReviews: any[] = [];
  
  for (const review of reviews.slice(0, maxReviews)) {
    // Required fields: rating, text, datePublished
    const rating = clampRating(review.rating || review.stars);
    const reviewBody = stripHtml(review.text || review.reviewBody || '');
    const datePublished = toIsoDate(review.publishAt || review.publishedAtDate || review.date || review.time);
    const authorName = review.name || review.author || 'Anonymous';
    
    // Skip if missing critical fields
    if (rating === null || !reviewBody || reviewBody.length < 10 || !datePublished) {
      continue;
    }
    
    const reviewSchema: any = {
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: rating.toString(),
        bestRating: '5',
        worstRating: '1',
      },
      reviewBody: truncate(reviewBody, 1200),
      datePublished,
    };
    
    // Author - include if we have a name
    if (authorName && authorName !== 'Anonymous') {
      reviewSchema.author = {
        '@type': 'Person',
        name: authorName,
      };
    }
    
    validReviews.push(reviewSchema);
  }
  
  return validReviews;
}

/**
 * Build FAQPage JSON-LD schema
 * 
 * @param questionsAndAnswers - Array of Q&A objects with question and answer fields
 * @param pageUrl - Canonical URL of the page
 * @param maxItems - Max Q&As to include (default 10, prevents schema bloat)
 * @returns FAQPage JSON-LD object or null if insufficient data
 */
export function buildFaqPageJsonLd(
  questionsAndAnswers: any[],
  pageUrl: string,
  maxItems: number = 10
): any | null {
  if (!Array.isArray(questionsAndAnswers) || questionsAndAnswers.length < 3) {
    return null;
  }
  
  const mainEntity: any[] = [];
  
  for (const qa of questionsAndAnswers.slice(0, maxItems)) {
    const question = stripHtml(qa.question);
    const answer = stripHtml(qa.answer);
    
    // Skip if missing question or answer
    if (!question || question.length < 5 || !answer || answer.length < 10) {
      continue;
    }
    
    mainEntity.push({
      '@type': 'Question',
      name: truncate(question, 200),
      acceptedAnswer: {
        '@type': 'Answer',
        text: truncate(answer, 800),
      },
    });
  }
  
  // Need at least 3 valid Q&As
  if (mainEntity.length < 3) {
    return null;
  }
  
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity,
  };
}

/**
 * Build LocalBusiness JSON-LD schema (base schema)
 * Restaurant extends this schema
 */
export function buildLocalBusinessJsonLd(
  buffet: any,
  siteBaseUrl: string,
  cityStateSlug: string
): any | null {
  if (!buffet?.name) return null;
  
  const pageUrl = `${siteBaseUrl}/chinese-buffets/${cityStateSlug}/${buffet.slug}`;
  
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${pageUrl}#localbusiness`,
    name: buffet.name,
    url: pageUrl,
  };
  
  // Address
  if (buffet.address) {
    const addressParts = parseAddress(buffet.address);
    if (addressParts.streetAddress || addressParts.addressLocality) {
      schema.address = {
        '@type': 'PostalAddress',
        ...addressParts,
      };
    }
  }
  
  // Geo coordinates
  let lat: number | null = null;
  let lng: number | null = null;
  
  if (buffet.location?.lat && buffet.location?.lng) {
    lat = asNumber(buffet.location.lat);
    lng = asNumber(buffet.location.lng);
  } else if (buffet.lat && buffet.lng) {
    lat = asNumber(buffet.lat);
    lng = asNumber(buffet.lng);
  }
  
  if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lng,
    };
  }
  
  // Telephone
  const phone = buffet.contactInfo?.phone || buffet.phone;
  if (phone && typeof phone === 'string' && phone.trim()) {
    schema.telephone = phone.trim();
  }
  
  // Price range
  if (buffet.price && typeof buffet.price === 'string') {
    schema.priceRange = buffet.price.trim();
  }
  
  return schema;
}

/**
 * Build Place JSON-LD schema for POIs (Points of Interest)
 */
export function buildPlaceJsonLd(
  poi: {
    name: string;
    category?: string;
    lat?: number;
    lng?: number;
    address?: string;
    distance?: string;
  },
  parentPageUrl: string,
  index: number
): any | null {
  if (!poi?.name) return null;
  
  // Only create Place schema if we have at least geo or address
  // This prevents warnings about missing location data
  const hasGeo = poi.lat && poi.lng;
  const hasAddress = poi.address && typeof poi.address === 'string' && poi.address.trim().length > 0;
  
  if (!hasGeo && !hasAddress) {
    // Skip POIs without location data to avoid validation warnings
    return null;
  }
  
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    '@id': `${parentPageUrl}#poi-${index}`,
    name: poi.name,
  };
  
  // Add additional type based on category
  if (poi.category) {
    const categoryLower = poi.category.toLowerCase();
    if (categoryLower.includes('parking')) {
      schema.additionalType = 'https://schema.org/ParkingFacility';
    } else if (categoryLower.includes('gas') || categoryLower.includes('fuel')) {
      schema.additionalType = 'https://schema.org/GasStation';
    } else if (categoryLower.includes('shop') || categoryLower.includes('store') || categoryLower.includes('mall')) {
      schema.additionalType = 'https://schema.org/Store';
    } else if (categoryLower.includes('restaurant') || categoryLower.includes('food')) {
      schema.additionalType = 'https://schema.org/FoodEstablishment';
    } else if (categoryLower.includes('hotel') || categoryLower.includes('lodging')) {
      schema.additionalType = 'https://schema.org/LodgingBusiness';
    } else if (categoryLower.includes('hospital') || categoryLower.includes('clinic')) {
      schema.additionalType = 'https://schema.org/MedicalBusiness';
    } else if (categoryLower.includes('bank') || categoryLower.includes('atm')) {
      schema.additionalType = 'https://schema.org/FinancialService';
    }
  }
  
  // Geo coordinates
  if (hasGeo) {
    const lat = asNumber(poi.lat);
    const lng = asNumber(poi.lng);
    if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
      schema.geo = {
        '@type': 'GeoCoordinates',
        latitude: lat,
        longitude: lng,
      };
    }
  }
  
  // Address
  if (hasAddress) {
    schema.address = poi.address.trim();
  }
  
  return schema;
}

/**
 * Build an array of Place schemas for POIs
 */
export function buildPOIsJsonLd(
  pois: Array<{
    name: string;
    category?: string;
    lat?: number;
    lng?: number;
    address?: string;
    distance?: string;
  }>,
  parentPageUrl: string,
  maxPois: number = 10
): any[] {
  if (!Array.isArray(pois) || pois.length === 0) {
    return [];
  }
  
  const schemas: any[] = [];
  
  pois.slice(0, maxPois).forEach((poi, index) => {
    const schema = buildPlaceJsonLd(poi, parentPageUrl, index);
    if (schema) {
      schemas.push(schema);
    }
  });
  
  return schemas;
}

/**
 * Build BreadcrumbList JSON-LD schema
 */
export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
  siteBaseUrl: string
): any | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  
  const itemListElement = items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url.startsWith('http') ? item.url : `${siteBaseUrl}${item.url}`,
  }));
  
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  };
}

/**
 * Build standalone Review JSON-LD schema
 */
export function buildStandaloneReviewJsonLd(
  review: any,
  itemReviewed: { name: string; url: string; type?: string },
  siteBaseUrl: string
): any | null {
  const rating = clampRating(review.rating || review.stars);
  const reviewBody = stripHtml(review.text || review.reviewBody || '');
  const datePublished = toIsoDate(review.publishAt || review.publishedAtDate || review.date || review.time);
  const authorName = review.name || review.author || 'Anonymous';
  
  if (rating === null || !reviewBody || reviewBody.length < 10 || !datePublished) {
    return null;
  }
  
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: {
      '@type': itemReviewed.type || 'Restaurant',
      name: itemReviewed.name,
      url: itemReviewed.url,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: rating.toString(),
      bestRating: '5',
      worstRating: '1',
    },
    reviewBody: truncate(reviewBody, 1200),
    datePublished,
  };
  
  if (authorName && authorName !== 'Anonymous') {
    schema.author = {
      '@type': 'Person',
      name: authorName,
    };
  }
  
  return schema;
}

/**
 * Validate JSON-LD schema and return detailed result
 */
export function validateSchema(schema: any, schemaType: string): SchemaValidationResult {
  const result: SchemaValidationResult = {
    isValid: true,
    schemaType,
    errors: [],
    warnings: [],
  };
  
  if (!schema) {
    result.isValid = false;
    result.errors.push('Schema is null or undefined');
    return result;
  }
  
  // Check required fields
  if (!schema['@context']) {
    result.isValid = false;
    result.errors.push('Missing @context');
  }
  
  if (!schema['@type']) {
    result.isValid = false;
    result.errors.push('Missing @type');
  }
  
  // Type-specific validation
  switch (schemaType) {
    case 'Restaurant':
    case 'LocalBusiness':
      if (!schema.name) {
        result.isValid = false;
        result.errors.push('Missing required field: name');
      }
      if (!schema.address && !schema.geo) {
        result.warnings.push('Missing address and geo - at least one is recommended');
      }
      if (schema.aggregateRating) {
        const rating = asNumber(schema.aggregateRating.ratingValue);
        if (rating === null || rating < 1 || rating > 5) {
          result.errors.push('Invalid aggregateRating.ratingValue (must be 1-5)');
        }
        const reviewCount = asNumber(schema.aggregateRating.reviewCount);
        if (reviewCount === null || reviewCount < 0) {
          result.errors.push('Invalid aggregateRating.reviewCount');
        }
      }
      break;
      
    case 'Review':
      if (!schema.reviewRating?.ratingValue) {
        result.isValid = false;
        result.errors.push('Missing required field: reviewRating.ratingValue');
      }
      if (!schema.reviewBody) {
        result.isValid = false;
        result.errors.push('Missing required field: reviewBody');
      }
      if (!schema.datePublished) {
        result.warnings.push('Missing datePublished - recommended for reviews');
      }
      break;
      
    case 'FAQPage':
      if (!schema.mainEntity || !Array.isArray(schema.mainEntity) || schema.mainEntity.length === 0) {
        result.isValid = false;
        result.errors.push('FAQPage must have at least one Question in mainEntity');
      } else {
        schema.mainEntity.forEach((q: any, i: number) => {
          if (!q.name) {
            result.errors.push(`Question ${i + 1}: Missing question text (name)`);
          }
          if (!q.acceptedAnswer?.text) {
            result.errors.push(`Question ${i + 1}: Missing answer text`);
          }
        });
      }
      break;
      
    case 'Place':
      if (!schema.name) {
        result.isValid = false;
        result.errors.push('Missing required field: name');
      }
      if (!schema.geo && !schema.address) {
        result.warnings.push('Missing geo and address - at least one is recommended');
      }
      break;
      
    case 'BreadcrumbList':
      if (!schema.itemListElement || !Array.isArray(schema.itemListElement) || schema.itemListElement.length === 0) {
        result.isValid = false;
        result.errors.push('BreadcrumbList must have at least one item');
      } else {
        schema.itemListElement.forEach((item: any, i: number) => {
          if (!item.name) {
            result.errors.push(`Breadcrumb ${i + 1}: Missing name`);
          }
          if (!item.item && !item['@id']) {
            result.warnings.push(`Breadcrumb ${i + 1}: Missing URL (item or @id)`);
          }
        });
      }
      break;
  }
  
  // Update isValid based on errors
  if (result.errors.length > 0) {
    result.isValid = false;
  }
  
  return result;
}

/**
 * Validate JSON-LD object (dev-only helper - logs to console)
 */
export function validateJsonLd(schema: any, schemaName: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  
  const result = validateSchema(schema, schemaName);
  
  if (!result.isValid) {
    console.warn(`[JSON-LD] ${schemaName}: Schema validation failed`);
    result.errors.forEach(err => console.warn(`  Error: ${err}`));
  }
  
  result.warnings.forEach(warn => console.warn(`[JSON-LD] ${schemaName} Warning: ${warn}`));
}

/**
 * Validate all schemas for a buffet page
 */
export function validateBuffetPageSchemas(
  buffet: any,
  siteBaseUrl: string,
  cityStateSlug: string
): {
  overall: boolean;
  results: SchemaValidationResult[];
} {
  const pageUrl = `${siteBaseUrl}/chinese-buffets/${cityStateSlug}/${buffet.slug}`;
  const results: SchemaValidationResult[] = [];
  
  // Validate Restaurant schema
  const restaurantSchema = buildRestaurantJsonLd(buffet, siteBaseUrl, cityStateSlug);
  if (restaurantSchema) {
    results.push(validateSchema(restaurantSchema, 'Restaurant'));
  } else {
    results.push({
      isValid: false,
      schemaType: 'Restaurant',
      errors: ['Failed to build Restaurant schema - missing required data'],
      warnings: [],
    });
  }
  
  // Validate FAQ schema if Q&A exists
  if (buffet.questionsAndAnswers && Array.isArray(buffet.questionsAndAnswers)) {
    const faqSchema = buildFaqPageJsonLd(buffet.questionsAndAnswers, pageUrl);
    if (faqSchema) {
      results.push(validateSchema(faqSchema, 'FAQPage'));
    }
  }
  
  // Validate Reviews if they exist
  if (buffet.reviews && Array.isArray(buffet.reviews) && buffet.reviews.length > 0) {
    const reviewSchemas = buildReviewsJsonLd(buffet.reviews, 3);
    if (reviewSchemas.length > 0) {
      // Validate first review as sample
      const sampleReview = reviewSchemas[0];
      results.push(validateSchema({ '@context': 'https://schema.org', ...sampleReview }, 'Review'));
    }
  }
  
  const overall = results.every(r => r.isValid);
  
  return { overall, results };
}
