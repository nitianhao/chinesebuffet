// Data loading utilities using InstantDB Admin API
// This allows server-side rendering while reading directly from InstantDB

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { init } from '@instantdb/admin';
import MiniSearch from 'minisearch';
import schema from '@/src/instant.schema';
import rules from '@/src/instant.perms';

// Re-export types for convenience
export type { Review, Buffet, City, BuffetsByCity, BuffetsById, Summary } from '@/lib/data';

// Initialize admin client (server-side only)
// OPTIMIZATION: Cache the database connection to avoid re-initialization overhead
let cachedDb: ReturnType<typeof init> | null = null;

// InstantDB's admin SDK forces `cache: "no-store"` on Next 13/14 by default
// (see @instantdb/admin getDefaultFetchOpts). For the heavy "fetch-all" query
// used by most content pages we bypass this with `unstable_cache` (see below).
//
// For lighter per-entity queries (getCityBySlug, getBuffetBySlug, etc.) we
// override with `force-cache` so SSG can cache individual POST responses.
// Page-level ISR is handled via `export const revalidate` in each route file.
const contentFetchOpts: RequestInit = { cache: 'force-cache' };
const adminQuery = <Q>(
  db: ReturnType<typeof init>,
  query: Q,
) => db.query(query as any, { fetchOpts: contentFetchOpts });

function getAdminDb() {
  
  // OPTIMIZATION: Reuse cached connection
  if (cachedDb) {
    return cachedDb;
  }
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required for server-side data fetching');
  }

  try {
    const dbInitStart = Date.now();
    cachedDb = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });
    const dbInitDuration = Date.now() - dbInitStart;
    return cachedDb;
  } catch (error) {
    throw error;
  }
}

// OPTIMIZATION: Cache parsed JSON to avoid re-parsing the same strings
const jsonParseCache = new Map<string, any>();
const MAX_JSON_CACHE_SIZE = 10000; // Limit cache size to prevent memory issues

// Helper to parse JSON fields from InstantDB
function parseJsonField(value: any): any {
  if (!value) return null;
  if (typeof value === 'string') {
    // OPTIMIZATION: Use cache for frequently accessed JSON strings
    if (jsonParseCache.has(value)) {
      return jsonParseCache.get(value);
    }
    try {
      const parsed = JSON.parse(value);
      // Only cache if cache isn't too large
      if (jsonParseCache.size < MAX_JSON_CACHE_SIZE) {
        jsonParseCache.set(value, parsed);
      }
      return parsed;
    } catch (e) {
      return value;
    }
  }
  return value;
}

// Helper to safely parse JSON only if the string looks like JSON (starts with { or [)
// Returns null if not JSON or parsing fails - used for fields that expect JSON objects
function safeParseJsonObject(value: any): any {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  
  const trimmed = value.trim();
  // Only parse if it looks like JSON (starts with { or [)
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Format Arts & Culture JSON data into HTML
function formatArtsCultureHtml(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  
  let html = '';
  
  // Add summary paragraph if it exists
  if (data.summary && typeof data.summary === 'string') {
    html += `<p>${data.summary}</p>`;
  }
  
  // Add highlights if they exist
  if (data.highlights && Array.isArray(data.highlights) && data.highlights.length > 0) {
    data.highlights.forEach((group: any) => {
      if (group && group.label && Array.isArray(group.items) && group.items.length > 0) {
        html += `<h3>${group.label}</h3>`;
        html += '<ul>';
        group.items.forEach((item: any) => {
          if (item && item.name) {
            let itemText = item.name;
            if (item.distanceText) {
              itemText += ` — ${item.distanceText}`;
            }
            if (item.addressText) {
              itemText += ` — ${item.addressText}`;
            }
            html += `<li>${itemText}.</li>`;
          }
        });
        html += '</ul>';
      }
    });
  }
  
  return html || null;
}

// Format Communications & Technology JSON data into HTML (if stored as JSON)
function formatCommunicationsTechnologyHtml(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  
  let html = '';
  
  // Add summary paragraph if it exists
  if (data.summary && typeof data.summary === 'string') {
    html += `<p>${data.summary}</p>`;
  }
  
  // Add highlights if they exist
  if (data.highlights && Array.isArray(data.highlights) && data.highlights.length > 0) {
    data.highlights.forEach((group: any) => {
      if (group && group.label && Array.isArray(group.items) && group.items.length > 0) {
        html += `<h3>${group.label}</h3>`;
        html += '<ul>';
        group.items.forEach((item: any) => {
          if (item && item.name) {
            let itemText = item.name;
            if (item.distanceText) {
              itemText += ` — ${item.distanceText}`;
            }
            if (item.addressText) {
              itemText += ` — ${item.addressText}`;
            }
            html += `<li>${itemText}.</li>`;
          }
        });
        html += '</ul>';
      }
    });
  }
  
  // If it has HTML directly, use that
  if (data.html && typeof data.html === 'string') {
    return data.html;
  }
  
  return html || null;
}

// Transform InstantDB review to our Review interface
function transformReview(review: any): any {
  return {
    reviewerId: review.reviewerId || undefined,
    reviewerUrl: review.reviewerUrl || undefined,
    name: review.name || '',
    reviewerNumberOfReviews: review.reviewerNumberOfReviews || undefined,
    isLocalGuide: review.isLocalGuide || undefined,
    reviewerPhotoUrl: review.reviewerPhotoUrl || undefined,
    text: review.text || '',
    textTranslated: review.textTranslated || null,
    publishAt: review.publishAt || '',
    publishedAtDate: review.publishedAtDate || undefined,
    likesCount: review.likesCount || undefined,
    reviewId: review.reviewId || undefined,
    reviewUrl: review.reviewUrl || undefined,
    reviewOrigin: review.reviewOrigin || undefined,
    stars: review.stars || 0,
    rating: review.rating || null,
    responseFromOwnerDate: review.responseFromOwnerDate || null,
    responseFromOwnerText: review.responseFromOwnerText || null,
    reviewImageUrls: parseJsonField(review.reviewImageUrls) || undefined,
    reviewContext: parseJsonField(review.reviewContext) || undefined,
    reviewDetailedRating: parseJsonField(review.reviewDetailedRating) || undefined,
    visitedIn: review.visitedIn || null,
    originalLanguage: review.originalLanguage || null,
    translatedLanguage: review.translatedLanguage || null,
    // Legacy fields for backward compatibility
    author: review.author || review.name || undefined,
    time: review.time || review.publishAt || undefined,
    relativeTime: review.relativeTime || undefined,
  };
}

// Transform InstantDB buffet to our Buffet interface
// Optionally accepts reviews array to populate from link relationship
function transformBuffet(buffet: any, citySlug?: string, reviewsFromLink?: any[]): any {
  const addressString = typeof buffet.address === 'string' ? buffet.address : '';
  const addressParts = addressString.split(',').map((s: string) => s.trim());
  const parsedImages = parseJsonField(buffet.images) || [];
  const images = Array.isArray(parsedImages)
    ? parsedImages.filter(
        (img) =>
          img &&
          typeof img === 'object' &&
          typeof img.photoReference === 'string' &&
          img.photoReference.startsWith('places/')
      )
    : [];
  
  return {
    id: buffet.id,
    name: buffet.name || '',
    slug: buffet.slug || '',
    address: {
      street: buffet.street || addressParts[0] || '',
      city: buffet.cityName || addressParts[1] || '',
      state: buffet.state || addressParts[2] || '',
      stateAbbr: buffet.stateAbbr || '',
      postalCode: buffet.postalCode || addressParts[3] || '',
      full: buffet.address || '',
    },
    location: {
      lat: buffet.lat || 0,
      lng: buffet.lng || 0,
    },
    phone: buffet.phone || '',
    phoneUnformatted: buffet.phoneUnformatted || '',
    website: buffet.website || null,
    email: null,
    price: buffet.price || null,
    rating: buffet.rating || 0,
    reviewsCount: buffet.reviewsCount || 0,
    hours: parseJsonField(buffet.hours) || [],
    categories: parseJsonField(buffet.categories) || [],
    categoryName: buffet.categoryName || '',
    primaryType: buffet.primaryType || null,
    neighborhood: buffet.neighborhood || null,
    permanentlyClosed: buffet.permanentlyClosed || false,
    temporarilyClosed: buffet.temporarilyClosed || false,
    placeId: buffet.placeId || null,
    imagesCount: buffet.imagesCount || 0,
    images,
    imageCategories: parseJsonField(buffet.imageCategories) || [],
    citySlug: citySlug || buffet.city?.slug || '',
    description: buffet.description || null,
    subTitle: buffet.subTitle || null,
    // Prefer reviews from link relationship, fallback to JSON field for backward compatibility
    reviews: reviewsFromLink 
      ? reviewsFromLink.map(transformReview)
      : (parseJsonField(buffet.reviews) || []),
    reviewsDistribution: parseJsonField(buffet.reviewsDistribution) || null,
    reviewsTags: parseJsonField(buffet.reviewsTags) || null,
    popularTimesHistogram: parseJsonField(buffet.popularTimesHistogram) || null,
    popularTimesLiveText: buffet.popularTimesLiveText || null,
    popularTimesLivePercent: buffet.popularTimesLivePercent || null,
    additionalInfo: (() => {
      const additionalInfo = parseJsonField(buffet.additionalInfo) || {};
      // Transform serviceOptions object to Service options array format
      const serviceOptions = parseJsonField(buffet.serviceOptions);
      if (serviceOptions && typeof serviceOptions === 'object' && !Array.isArray(serviceOptions)) {
        // Convert object like {takeout: true, dineIn: true, delivery: false} to array like [{takeout: true}, {dineIn: true}, {delivery: false}]
        // Include ALL options (both true and false) so they can all be displayed
        const serviceOptionsArray = Object.entries(serviceOptions)
          .map(([key, value]) => ({ [key]: value }));
        if (serviceOptionsArray.length > 0) {
          additionalInfo['Service options'] = serviceOptionsArray;
        }
      }
      // Transform foodServiceOptions object to Food service options array format
      const foodServiceOptions = parseJsonField(buffet.foodServiceOptions);
      if (foodServiceOptions && typeof foodServiceOptions === 'object' && !Array.isArray(foodServiceOptions)) {
        // Convert object like {servesBreakfast: false, servesLunch: true} to array like [{servesBreakfast: false}, {servesLunch: true}]
        // Include ALL options (both true and false) so they can all be displayed
        const foodServiceOptionsArray = Object.entries(foodServiceOptions)
          .map(([key, value]) => ({ [key]: value }));
        if (foodServiceOptionsArray.length > 0) {
          additionalInfo['Food service options'] = foodServiceOptionsArray;
        }
      }
      // Transform additionalServiceOptions object to Additional service options array format
      const additionalServiceOptions = parseJsonField(buffet.additionalServiceOptions);
      if (additionalServiceOptions && typeof additionalServiceOptions === 'object' && !Array.isArray(additionalServiceOptions)) {
        // Convert object like {allowsDogs: false, curbsidePickup: false} to array like [{allowsDogs: false}, {curbsidePickup: false}]
        // Include ALL options (both true and false) so they can all be displayed
        const additionalServiceOptionsArray = Object.entries(additionalServiceOptions)
          .map(([key, value]) => ({ [key]: value }));
        if (additionalServiceOptionsArray.length > 0) {
          additionalInfo['Additional service options'] = additionalServiceOptionsArray;
        }
      }
      return Object.keys(additionalInfo).length > 0 ? additionalInfo : null;
    })(),
    questionsAndAnswers: parseJsonField(buffet.questionsAndAnswers) || null,
    ownerUpdates: parseJsonField(buffet.ownerUpdates) || null,
    reserveTableUrl: buffet.reserveTableUrl || null,
    tableReservationLinks: parseJsonField(buffet.tableReservationLinks) || null,
    googleFoodUrl: buffet.googleFoodUrl || null,
    orderBy: parseJsonField(buffet.orderBy) || null,
    // Menu: will be populated separately via getMenuForBuffet() if needed
    // Fallback to legacy menu field for backward compatibility
    menu: parseJsonField(buffet.menu) || null,
    webResults: parseJsonField(buffet.webResults) || null,
    peopleAlsoSearch: parseJsonField(buffet.peopleAlsoSearch) || null,
    updatesFromCustomers: parseJsonField(buffet.updatesFromCustomers) || null,
    locatedIn: buffet.locatedIn || null,
    plusCode: buffet.plusCode || null,
    what_customers_are_saying_seo: buffet.what_customers_are_saying_seo || null,
    reviewSummaryParagraph1: buffet.reviewSummaryParagraph1 || null,
    reviewSummaryParagraph2: buffet.reviewSummaryParagraph2 || null,
    iconInfo: parseJsonField(buffet.iconInfo) || null,
    addressFormats: parseJsonField(buffet.addressFormats) || null,
    adrFormatAddress: buffet.adrFormatAddress || (() => {
      // Also check if it's inside addressFormats
      const addressFormats = parseJsonField(buffet.addressFormats);
      return addressFormats?.adrFormatAddress || null;
    })(),
    secondaryOpeningHours: parseJsonField(buffet.secondaryOpeningHours) || null,
    googleMapsLinks: parseJsonField(buffet.googleMapsLinks) || null,
    priceRange: parseJsonField(buffet.priceRange) || null,
    yelpData: parseJsonField(buffet.yelpData) || null,
    yelpRating: buffet.yelpRating || null,
    yelpReviewsCount: buffet.yelpReviewsCount || null,
    tripadvisorData: parseJsonField(buffet.tripadvisorData) || null,
    tripadvisorRating: buffet.tripadvisorRating || null,
    tripadvisorReviewsCount: buffet.tripadvisorReviewsCount || null,
    healthInspection: (() => {
      // Try healthInspection field first, fallback to leadsEnrichment (temporary workaround until schema syncs)
      const healthData = parseJsonField(buffet.healthInspection) || parseJsonField(buffet.leadsEnrichment);
      // Only return if it looks like health inspection data (has currentGrade or currentScore)
      if (healthData && (healthData.currentGrade || healthData.currentScore !== undefined)) {
        return healthData;
      }
      return null;
    })(),
    noiseLevel: buffet.noiseLevel || null,
    goodForKids: buffet.goodForKids ?? null,
    goodForGroups: buffet.goodForGroups ?? null,
    hasTv: buffet.hasTv ?? null,
    healthScore: buffet.healthScore ?? null,
    alcohol: buffet.alcohol || null,
    waiterService: buffet.waiterService ?? null,
    wiFi: buffet.wiFi || null,
    wheelchairAccessible: buffet.wheelchairAccessible ?? null,
    genderNeutralRestrooms: buffet.genderNeutralRestrooms ?? null,
    outdoorSeating: buffet.outdoorSeating ?? null,
    businessAcceptsApplePay: buffet.businessAcceptsApplePay ?? null,
    acceptsGooglePay: buffet.acceptsGooglePay ?? null,
    openToAll: buffet.openToAll ?? null,
  };
}

// Transform InstantDB city to our City interface
function transformCity(city: any, buffets: any[]): any {
  return {
    rank: city.rank || 0,
    city: city.city || '',
    state: city.state || '',
    stateAbbr: city.stateAbbr || '',
    population: city.population || 0,
    slug: city.slug || '',
    buffets: buffets,
  };
}

// Cache for requests (in-memory, per-request)
// Note: In Next.js, this is per-server-instance, not per-request
// In development with hot reload, this can persist incorrectly
let requestCache: {
  cities?: any[];
  buffets?: any[];
  timestamp?: number;
} | null = null;
let requestCachePromise: Promise<typeof requestCache> | null = null;

const CACHE_TTL = 600000; // 10 minutes cache to avoid repeated full fetches

// Function to clear cache (useful for debugging)
export function clearCache() {
  requestCache = null;
  requestCachePromise = null;
  // OPTIMIZATION: Also clear JSON parse cache to prevent memory leaks
  jsonParseCache.clear();
  console.log('[data-instantdb] Cache cleared (including JSON parse cache)');
}

// ---------------------------------------------------------------------------
// unstable_cache wrapper: ensures the heavy "fetch everything" query runs at
// most once during `next build` (shared across workers via the Data Cache on
// disk). At runtime the result is revalidated every hour.
//
// Inside unstable_cache the SDK's `cache:"no-store"` fetch is harmless:
// unstable_cache caches the *function return value*, not the fetch response.
// ---------------------------------------------------------------------------
const _fetchAllDataFromDB = async (): Promise<{ cities: any[]; buffets: any[] }> => {
  const db = getAdminDb();

  console.log('[data-instantdb] Fetching cities...');
  const citiesStart = Date.now();
  const citiesResult = await db.query({ cities: {} });
  const cities = citiesResult.cities || [];
  console.log(`[data-instantdb] Fetched ${cities.length} cities in ${Date.now() - citiesStart}ms`);

  console.log('[data-instantdb] Fetching buffets...');
  let buffets: any[] = [];
  const buffetsStart = Date.now();
  try {
    const buffetsResult = await db.query({
      buffets: {
        $: { limit: 10000 },
        city: {},
      },
    });
    buffets = buffetsResult.buffets || [];
    console.log(`[data-instantdb] Fetched ${buffets.length} buffets in ${Date.now() - buffetsStart}ms`);
  } catch (e) {
    console.error('[data-instantdb] Error with buffets query:', e);
  }

  return { cities, buffets };
};

const fetchAllDataCached = unstable_cache(
  _fetchAllDataFromDB,
  ['instantdb-all-data'],
  { revalidate: 3600 },
);

async function getCachedData() {
  const now = Date.now();

  // Fast path: in-memory cache (same process, avoids deserialization)
  if (requestCache && requestCache.timestamp && (now - requestCache.timestamp) < CACHE_TTL) {
    return requestCache;
  }

  // Dedup within the same process (parallel calls share one promise)
  if (requestCachePromise) {
    return requestCachePromise;
  }

  requestCachePromise = (async () => {
    try {
      // Uses unstable_cache → disk-based Data Cache → shared across build workers
      const { cities, buffets } = await fetchAllDataCached();

      requestCache = { cities, buffets, timestamp: now };
      return requestCache;
    } catch (error) {
      console.error('[data-instantdb] Error fetching data:', error);
      throw error;
    }
  })();

  try {
    return await requestCachePromise;
  } finally {
    requestCachePromise = null;
  }
}

export async function getBuffetsByCity(): Promise<Record<string, any>> {
  const functionStartTime = Date.now();
  
  const getCachedDataStart = Date.now();
  const { cities, buffets } = await getCachedData();
  const getCachedDataDuration = Date.now() - getCachedDataStart;
  
  const buffetsByCity: Record<string, any> = {};
  let buffetsWithoutCity = 0;
  
  // Initialize cities
  cities.forEach((city: any) => {
    buffetsByCity[city.slug] = transformCity(city, []);
  });
  
  // OPTIMIZATION: Build city lookup map for O(1) matching instead of O(n) find()
  const cityLookupMap = new Map<string, any>();
  cities.forEach((city: any) => {
    const key = `${city.city.toLowerCase()}|${city.stateAbbr}`;
    cityLookupMap.set(key, city);
  });
  
  // Add buffets to cities
  const transformStart = Date.now();
  buffets.forEach((buffet: any) => {
    const citySlug = buffet.city?.slug;
    if (citySlug && buffetsByCity[citySlug]) {
      buffetsByCity[citySlug].buffets.push(transformBuffet(buffet, citySlug));
    } else {
      buffetsWithoutCity++;
      // OPTIMIZATION: Use Map lookup instead of find() for O(1) vs O(n)
      if (buffet.cityName && buffet.stateAbbr) {
        const key = `${buffet.cityName.toLowerCase()}|${buffet.stateAbbr}`;
        const matchingCity = cityLookupMap.get(key);
        if (matchingCity && buffetsByCity[matchingCity.slug]) {
          buffetsByCity[matchingCity.slug].buffets.push(transformBuffet(buffet, matchingCity.slug));
        }
      }
    }
  });
  const transformDuration = Date.now() - transformStart;
  
  if (buffetsWithoutCity > 0) {
    console.log(`[data-instantdb] Warning: ${buffetsWithoutCity} buffets without city links`);
  }
  
  // Sort buffets within each city by rating
  const sortStart = Date.now();
  Object.values(buffetsByCity).forEach((city: any) => {
    city.buffets.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
  });
  const sortDuration = Date.now() - sortStart;
  
  const totalDuration = Date.now() - functionStartTime;
  
  console.log(`[data-instantdb] getBuffetsByCity: ${Object.keys(buffetsByCity).length} cities with buffets`);
  
  return buffetsByCity;
}

export async function getBuffetsById(): Promise<Record<string, any>> {
  const { buffets } = await getCachedData();
  
  const buffetsById: Record<string, any> = {};
  
  buffets.forEach((buffet: any) => {
    const citySlug = buffet.city?.slug;
    buffetsById[buffet.id] = transformBuffet(buffet, citySlug);
  });
  
  console.log(`[data-instantdb] getBuffetsById: transformed ${Object.keys(buffetsById).length} buffets`);
  
  return buffetsById;
}

export async function getCityBySlug(citySlug: string): Promise<any | null> {
  const startTime = Date.now();

  try {
    const db = getAdminDb();
    const result = await adminQuery(db, {
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          city: {}
        }
      }
    });

    const cityRaw = result.cities?.[0];
    if (!cityRaw) {
      return null;
    }

    const buffetsRaw = cityRaw.buffets || [];
    const buffets = buffetsRaw.map((b: any) => transformBuffet({ ...b, city: { slug: citySlug } }, citySlug));
    const city = transformCity(cityRaw, buffets);


    return city;
  } catch (error) {
    throw error;
  }
}

// Fetch reviews for a specific buffet from the reviews table
export async function getReviewsForBuffet(buffetId: string): Promise<any[]> {
  try {
    const db = getAdminDb();
    // Query the buffet with its linked reviews
    const result = await adminQuery(db, {
      buffets: {
        $: { where: { id: buffetId } },
        reviewRecords: {
          $: { order: [{ field: 'publishAt', direction: 'desc' }] },
        },
      },
    });
    
    const buffet = result.buffets?.[0];
    const reviews = buffet?.reviewRecords || [];
    return reviews.map(transformReview);
  } catch (error) {
    console.error('[data-instantdb] Error fetching reviews for buffet:', error);
    return [];
  }
}

export async function getMenuForBuffet(placeId: string): Promise<any | null> {
  if (!placeId) return null;
  
  try {
    const db = getAdminDb();
    // Query menus with linked menuItems
    const result = await adminQuery(db, {
      menus: {
        $: {
          where: { placeId: placeId }
        },
        menuItems: {} // Fetch linked menuItems
      }
    });
    
    const menus = result.menus || [];
    if (menus.length === 0) return null;
    
    // Sort by scrapedAt in code (descending - most recent first)
    const sortedMenus = menus.sort((a: any, b: any) => {
      const aTime = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
      const bTime = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
      return bTime - aTime;
    });
    
    const menu = sortedMenus[0];
    const menuItems = (menu.menuItems || []) as Array<{
      id: string;
      name: string;
      description?: string | null;
      price?: string | null;
      priceNumber?: number | null;
      categoryName?: string;
      itemOrder?: number;
    }>;
    
    // If we have linked menuItems, build structured categories from them
    if (menuItems.length > 0) {
      // Group items by categoryName
      const categoriesMap = new Map<string, Array<{
        name: string;
        description?: string | null;
        price?: string | null;
        priceNumber?: number | null;
        itemOrder?: number;
      }>>();
      
      for (const item of menuItems) {
        const categoryName = item.categoryName || 'Menu Items';
        if (!categoriesMap.has(categoryName)) {
          categoriesMap.set(categoryName, []);
        }
        categoriesMap.get(categoryName)!.push({
          name: item.name,
          description: item.description,
          price: item.price,
          priceNumber: item.priceNumber,
          itemOrder: item.itemOrder,
        });
      }
      
      // Sort items within each category by itemOrder
      const categories = Array.from(categoriesMap.entries()).map(([name, items]) => ({
        name,
        items: items.sort((a, b) => (a.itemOrder || 0) - (b.itemOrder || 0)),
      }));
      
      return {
        id: menu.id,
        placeId: menu.placeId,
        sourceUrl: menu.sourceUrl,
        contentType: menu.contentType,
        scrapedAt: menu.scrapedAt,
        status: menu.status,
        // Return structured data built from menuItems
        categories,
        items: menuItems.map((item) => ({
          name: item.name,
          description: item.description,
          price: item.price,
          priceNumber: item.priceNumber,
          categoryName: item.categoryName,
        })),
        structuredData: { categories },
        _source: 'menuItems', // Flag to indicate data came from linked table
      };
    }
    
    // Fall back to JSON fields if no menuItems linked
    return {
      id: menu.id,
      placeId: menu.placeId,
      sourceUrl: menu.sourceUrl,
      contentType: menu.contentType,
      rawText: menu.rawText,
      structuredData: parseJsonField(menu.structuredData),
      categories: parseJsonField(menu.categories),
      items: parseJsonField(menu.items),
      scrapedAt: menu.scrapedAt,
      status: menu.status,
      errorMessage: menu.errorMessage,
      _source: 'json', // Flag to indicate data came from JSON fields
    };
  } catch (error) {
    console.error('[data-instantdb] Error fetching menu for buffet:', error);
    return null;
  }
}

// Lightweight function to get buffet data - minimal query, minimal transformation
export async function getBuffetNameBySlug(citySlug: string, buffetSlug: string): Promise<{ 
  name: string; 
  id?: string;
  slug?: string;
  placeId?: string; // Google Places ID for menu lookup
  categories: string[]; 
  address: string; 
  cityName?: string;
  state?: string;
  stateAbbr?: string;
  location?: { lat: number; lng: number };
  description?: string; 
  description2?: string; 
  images: Array<{ photoReference: string; widthPx?: number; heightPx?: number }>; 
  imageCount: number; 
  imageCategories: string[]; 
  hours?: any; 
  contactInfo?: { menuUrl?: string; orderBy?: any; phone?: string; website?: string }; 
  price?: string; 
  rating?: number; 
  reviews?: any[];
  reviewsCount?: number;
  reviewsDistribution?: { [key: string]: number };
  reviewsTags?: Array<{ title: string; count?: number }>;
  webResults?: Array<{ title: string; displayedUrl?: string; url: string; description?: string }>;
  questionsAndAnswers?: Array<{ question?: string; answer?: string; [key: string]: any }>;
  accessibility?: any; // Parsed accessibility data from structuredData table
  amenities?: any; // Parsed amenities data from structuredData table
  accommodationLodging?: string; // HTML string for accommodation & lodging section
  agriculturalFarming?: string; // HTML string for agricultural & farming section
  artsCulture?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Arts & Culture data from buffets table
  communicationsTechnology?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Communications & Technology data from buffets table
  educationLearning?: string; // HTML string for education & learning section
  financialServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Financial services data from buffets table
  foodDining?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Food & Dining data from buffets table
  governmentPublicServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Government & Public Services data from buffets table
  healthcareMedicalServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Healthcare & Medical Services data from buffets table
  homeImprovementGarden?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Garden & Home Improvement data from buffets table
  industrialManufacturing?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Industrial Manufacturing data from buffets table
  miscellaneousServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Miscellaneous Services data from buffets table
  neighborhoodContext?: { neighborhoods: Array<{ name: string; type?: string }>; districts_or_areas?: Array<{ name: string; type?: string }>; county?: string | null; metro_area?: string | null; generatedAt?: string; model?: string; source?: string }; // Neighborhood context data from buffets table
  personalCareBeauty?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Personal Care & Beauty data from buffets table
  petCareVeterinary?: string; // Pet Care & Veterinary HTML string from buffets table
  professionalBusinessServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Professional & Business Services data from buffets table
  recreationEntertainment?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Recreation & Entertainment data from buffets table
  religiousSpiritual?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Religious & Spiritual data from buffets table
  repairMaintenance?: string; // Repair & Maintenance HTML string from buffets table
  retailShopping?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Retail & Shopping data from buffets table
  communitySocialServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Community & Social Services data from buffets table
  sportsFitness?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Sports & Fitness data from buffets table
  transportationAutomotive?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Transportation & Automotive data from buffets table
  travelTourismServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string }> }>; poiCount: number; generatedAt: string; model: string }; // Travel & Tourism Services data from buffets table
  utilitiesInfrastructure?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Utilities & Infrastructure data from buffets table
  accomodationLodging?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Accommodation & Lodging data from buffets table
  artsCulture?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Arts & Culture data from buffets table
  communicationsTechnology?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string }; // Communications & Technology data from buffets table
} | null> {
  const db = getAdminDb();
  
  try {
    // Query the buffet with structuredData link - fetch all structuredData to filter by group in code
    const result = await adminQuery(db, {
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          $: { where: { slug: buffetSlug } },
          structuredData: {
            $: {},
          },
        },
      },
    });
    
    const buffet = result.cities?.[0]?.buffets?.[0];
    if (!buffet) {
      console.error('[getBuffetNameBySlug] Buffet not found:', { citySlug, buffetSlug });
      return null;
    }
    
    // Log placeId availability for menu lookup
    console.log('[getBuffetNameBySlug] Buffet found, placeId:', buffet.placeId || 'NOT AVAILABLE');
    
    // Parse all structuredData into organized groups
    let accessibility: any | undefined;
    let amenities: any = {}; // Will collect all amenity-related data by group
    
    // Log what we got
    console.log('[getBuffetNameBySlug] Checking structuredData:', {
      hasStructuredData: !!buffet.structuredData,
      isArray: Array.isArray(buffet.structuredData),
      count: buffet.structuredData ? (Array.isArray(buffet.structuredData) ? buffet.structuredData.length : 1) : 0,
    });
    
    // Check if structuredData was returned (could be array or single object)
    const structuredDataList = buffet.structuredData 
      ? (Array.isArray(buffet.structuredData) ? buffet.structuredData : [buffet.structuredData])
      : [];
    
    if (structuredDataList.length > 0) {
      console.log('[getBuffetNameBySlug] Found structuredData records:', {
        count: structuredDataList.length,
        groups: [...new Set(structuredDataList.map((sd: any) => sd.group))],
        types: [...new Set(structuredDataList.map((sd: any) => sd.type))],
      });

      // Process all structuredData records
      for (const record of structuredDataList) {
        if (!record || !record.data) continue;
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          const group = record.group ?? null;
          const recordType = record.type || 'unknown';
          
          // Check if this is accessibility data
          if (group === 'accessibility') {
            accessibility = parsed;
            console.log('[getBuffetNameBySlug] ✅ Found accessibility');
            continue;
          }
          
          // List of all amenity-related groups to collect
          const amenityGroups = [
            'amenities', 'service options', 'food options', 'parking', 
            'payments', 'atmosphere', 'highlights', 'offerings', 
            'food and drink', 'planning'
          ];
          
          // Handle records with null group - use the type to categorize
          const normalizedGroup = group ? group.toLowerCase() : null;
          
          // If group is null, try to categorize by type (including non-amenity types)
          if (!normalizedGroup && recordType) {
            const category = mapRecordTypeToGroup(recordType);
            if (category === 'accessibility') {
              accessibility = parsed;
              console.log('[getBuffetNameBySlug] ✅ Found accessibility (type-based)');
              continue;
            }

            if (!amenities[category]) {
              amenities[category] = {};
            }
            
            if (typeof parsed === 'boolean' || typeof parsed === 'string' || typeof parsed === 'number') {
              amenities[category][recordType] = parsed;
            } else if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (typeof item === 'string') {
                  amenities[category][item] = true;
                }
              });
            } else if (typeof parsed === 'object' && parsed !== null) {
              const flattenedData = flattenNestedData(parsed);
              Object.assign(amenities[category], flattenedData);
            }
          }
          
          // Collect all amenity-related groups - use the group name as the category
          if (normalizedGroup && amenityGroups.includes(normalizedGroup)) {
            // Use the group as the category
            const category = normalizedGroup;
            if (!amenities[category]) {
              amenities[category] = {};
            }
            
            if (Array.isArray(parsed)) {
              // Array of strings like ["Restroom", "Free WiFi"] or ["Accepts reservations"]
              parsed.forEach((item: any) => {
                if (typeof item === 'string') {
                  amenities[category][item] = true;
                } else if (typeof item === 'object' && item !== null) {
                  Object.assign(amenities[category], flattenNestedData(item));
                }
              });
            } else if (typeof parsed === 'boolean' || typeof parsed === 'string' || typeof parsed === 'number') {
              // Simple value for a single amenity type
              amenities[category][recordType] = parsed;
            } else if (typeof parsed === 'object' && parsed !== null) {
              // Object value - flatten and merge into category
              const flattenedData = flattenNestedData(parsed);
              Object.assign(amenities[category], flattenedData);
            }
          } else if (normalizedGroup && !amenityGroups.includes(normalizedGroup) && recordType) {
            // If group is not in amenityGroups, try to map the type into a known group
            const fallbackCategory = mapRecordTypeToGroup(recordType);
            if (fallbackCategory === 'accessibility') {
              accessibility = parsed;
              continue;
            }
            if (!amenities[fallbackCategory]) {
              amenities[fallbackCategory] = {};
            }
            if (typeof parsed === 'boolean' || typeof parsed === 'string' || typeof parsed === 'number') {
              amenities[fallbackCategory][recordType] = parsed;
            } else if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (typeof item === 'string') {
                  amenities[fallbackCategory][item] = true;
                }
              });
            } else if (typeof parsed === 'object' && parsed !== null) {
              const flattenedData = flattenNestedData(parsed);
              Object.assign(amenities[fallbackCategory], flattenedData);
            }
          }
        } catch (parseError) {
          console.error('[getBuffetNameBySlug] Error parsing structuredData:', parseError);
        }
      }

      console.log('[getBuffetNameBySlug] Amenities collected:', {
        count: Object.keys(amenities).length,
        keys: Object.keys(amenities),
      });
    } else {
      console.log('[getBuffetNameBySlug] ❌ No structuredData linked to buffet:', buffet.id);
    }
    
    // Helper function to categorize amenities into groups
    function categorizeAmenity(type: string): string {
      const lower = type.toLowerCase();
      
      // Service Options
      if (['takeout', 'delivery', 'dinein', 'dine-in', 'reservable', 'curbsidepickup', 'curbside', 
           'drivethrough', 'waiterservice', 'selfservice', 'tablereservation'].some(k => lower.includes(k.toLowerCase()))) {
        return 'service options';
      }
      
      // Food Options
      if (['breakfast', 'brunch', 'lunch', 'dinner', 'beer', 'wine', 'cocktail', 'coffee', 
           'dessert', 'vegetarian', 'vegan', 'menu', 'children', 'kids', 'serves'].some(k => lower.includes(k.toLowerCase()))) {
        return 'food options';
      }
      
      // Parking
      if (['parking', 'valet', 'garage', 'lot', 'bike', 'street'].some(k => lower.includes(k.toLowerCase()))) {
        return 'parking';
      }
      
      // Payments
      if (['credit', 'card', 'pay', 'cash', 'payment', 'applepay', 'googlepay', 'accepts'].some(k => lower.includes(k.toLowerCase()))) {
        return 'payments';
      }
      
      // Atmosphere
      if (['noise', 'quiet', 'loud', 'casual', 'romantic', 'trendy', 'hip', 'upscale', 
           'classy', 'cozy', 'intimate', 'divey', 'touristy', 'ambiance', 'atmosphere'].some(k => lower.includes(k.toLowerCase()))) {
        return 'atmosphere';
      }
      
      // Planning (Groups & Events)
      if (['group', 'large', 'private', 'event', 'party', 'catering', 'goodforgroups', 
           'goodforkids', 'reservation'].some(k => lower.includes(k.toLowerCase()))) {
        return 'planning';
      }
      
      // Highlights
      if (['highlight', 'feature', 'specialty', 'special', 'signature', 'popular'].some(k => lower.includes(k.toLowerCase()))) {
        return 'highlights';
      }
      
      // Pets
      if (['dog', 'pet', 'animal', 'allowsdog'].some(k => lower.includes(k.toLowerCase()))) {
        return 'amenities';
      }
      
      // Entertainment/Tech
      if (['tv', 'wifi', 'internet', 'music', 'live', 'entertainment'].some(k => lower.includes(k.toLowerCase()))) {
        return 'amenities';
      }
      
      // Seating
      if (['outdoor', 'seating', 'patio', 'terrace', 'rooftop'].some(k => lower.includes(k.toLowerCase()))) {
        return 'amenities';
      }
      
      // Default
      return 'amenities';
    }

    function mapRecordTypeToGroup(type: string): string {
      const lower = type.toLowerCase();

      // Accessibility
      if (lower.includes('wheelchair') || lower.includes('accessible') || lower.includes('accessibility')) {
        return 'accessibility';
      }

      // Food & Drink
      if (lower.includes('alcohol') || lower.includes('offerings')) {
        return 'food and drink';
      }

      // Food Options
      if (lower.includes('foodserviceoptions') || lower.includes('diningoptions')) {
        return 'food options';
      }

      // Atmosphere
      if (lower.includes('noiselevel') || lower.includes('atmosphere')) {
        return 'atmosphere';
      }

      return categorizeAmenity(type);
    }
    
    // Helper function to flatten nested data like {allowsDogs: {allowsDogs: false}}
    function flattenNestedData(data: any): any {
      if (Array.isArray(data)) {
        return data;
      }
      if (typeof data !== 'object' || data === null) {
        return data;
      }
      
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Check if it's a nested structure like {allowsDogs: {allowsDogs: false}}
          const innerKeys = Object.keys(value);
          if (innerKeys.length === 1 && innerKeys[0] === key) {
            // Unwrap the nested value
            result[key] = (value as any)[key];
          } else {
            // Keep as nested object but flatten its contents
            result[key] = flattenNestedData(value);
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    
    // Fetch reviews - try linked reviewRecords first, then fall back to JSON field
    let reviews: any[] = [];
    
    console.log('[getBuffetNameBySlug] Checking for reviews:', {
      slug: buffetSlug,
      buffetId: buffet.id,
      hasReviewsField: !!buffet.reviews,
      reviewsFieldType: typeof buffet.reviews,
      reviewsFieldLength: typeof buffet.reviews === 'string' ? buffet.reviews.length : 'N/A',
    });
    
    // First, try to get reviews from the linked reviewRecords table
    try {
      const reviewsResult = await adminQuery(db, {
        buffets: {
          $: { where: { id: buffet.id } },
          reviewRecords: {
            $: { order: [{ field: 'publishAt', direction: 'desc' }], limit: 10 },
          },
        },
      });
      const buffetWithReviews = reviewsResult.buffets?.[0];
      if (buffetWithReviews && buffetWithReviews.reviewRecords && buffetWithReviews.reviewRecords.length > 0) {
        reviews = buffetWithReviews.reviewRecords.map(transformReview);
        console.log('[getBuffetNameBySlug] Got reviews from linked reviewRecords:', reviews.length);
      }
    } catch (reviewError) {
      console.error('[getBuffetNameBySlug] Error fetching linked reviews:', reviewError);
    }
    
    // If no linked reviews, fall back to JSON stringified reviews field in buffet
    if (reviews.length === 0 && buffet.reviews) {
      try {
        let parsedReviews: any[] = [];
        if (typeof buffet.reviews === 'string') {
          parsedReviews = JSON.parse(buffet.reviews);
        } else if (Array.isArray(buffet.reviews)) {
          parsedReviews = buffet.reviews;
        }
        
        if (Array.isArray(parsedReviews) && parsedReviews.length > 0) {
          reviews = parsedReviews.slice(0, 10).map(transformReview);
          console.log('[getBuffetNameBySlug] Got reviews from JSON field:', reviews.length);
        }
      } catch (parseError) {
        console.error('[getBuffetNameBySlug] Error parsing reviews JSON:', parseError);
      }
    }
    
    console.log('[getBuffetNameBySlug] Final reviews count:', reviews.length);
    
    // Parse categories if it's a JSON string, otherwise use as-is
    let categories: string[] = [];
    if (buffet.categories) {
      if (typeof buffet.categories === 'string') {
        try {
          categories = JSON.parse(buffet.categories);
        } catch {
          categories = [buffet.categories];
        }
      } else if (Array.isArray(buffet.categories)) {
        categories = buffet.categories;
      }
    }
    
    // Compile address from: address, neighborhood, city (cityName), state
    const addressParts: string[] = [];
    if (buffet.address) addressParts.push(buffet.address);
    if (buffet.neighborhood) addressParts.push(buffet.neighborhood);
    if (buffet.cityName) addressParts.push(buffet.cityName);
    if (buffet.state) addressParts.push(buffet.state);
    const address = addressParts.join(', ');
    
    // Helper to parse JSON fields
    const parseJsonField = (value: any): any => {
      if (!value) return null;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    };
    
    // Parse images field (JSON stringified array)
    const photoObjects: Array<{ photoReference: string; widthPx?: number; heightPx?: number }> = [];
    
    if (buffet.images) {
      let parsedImages: any[] = [];
      if (typeof buffet.images === 'string') {
        try {
          parsedImages = JSON.parse(buffet.images);
        } catch (e) {
          console.error('[getBuffetNameBySlug] Failed to parse images:', e);
        }
      } else if (Array.isArray(buffet.images)) {
        parsedImages = buffet.images;
      }
      
      parsedImages.forEach((img: any) => {
        if (typeof img === 'string') {
          if (img.startsWith('places/')) {
            photoObjects.push({ photoReference: img });
            return;
          }
          const placesMatch = img.match(/places\/([^\/]+)\/photos\/([^\/\?]+)/);
          if (placesMatch) {
            const placeId = placesMatch[1];
            const photoId = placesMatch[2];
            photoObjects.push({ photoReference: `places/${placeId}/photos/${photoId}` });
          }
          return;
        }
        if (img && typeof img === 'object' && typeof img.photoReference === 'string') {
          if (img.photoReference.startsWith('places/')) {
            photoObjects.push({
              photoReference: img.photoReference,
              widthPx: img.widthPx,
              heightPx: img.heightPx,
            });
          }
        }
      });
    }
    
    const allImages: Array<{ photoReference: string; widthPx?: number; heightPx?: number }> = [
      ...photoObjects,
    ];
    
    // Get imageCount (use imagesCount field or actual count of images)
    const imageCount = buffet.imagesCount || allImages.length;
    
    // Parse imageCategories
    const imageCategories = parseJsonField(buffet.imageCategories) || [];
    
    // Combine hours from hours, popularTimesHistogram, and secondaryOpeningHours
    const hoursData: any = {};
    
    // Parse hours
    const hours = parseJsonField(buffet.hours);
    if (hours && (Array.isArray(hours) || (typeof hours === 'object' && !Array.isArray(hours)))) {
      hoursData.hours = hours;
    }
    
    // Parse popularTimesHistogram
    const popularTimesHistogram = parseJsonField(buffet.popularTimesHistogram);
    if (popularTimesHistogram) {
      hoursData.popularTimesHistogram = popularTimesHistogram;
    }
    
    // Parse secondaryOpeningHours
    const secondaryOpeningHours = parseJsonField(buffet.secondaryOpeningHours);
    if (secondaryOpeningHours) {
      hoursData.secondaryOpeningHours = secondaryOpeningHours;
    }
    
    console.log('[getBuffetNameBySlug] Images debug:', {
      slug: buffetSlug,
      photoObjectsCount: photoObjects.length,
      totalImages: allImages.length,
      imageCount,
      imagesCountField: buffet.imagesCount,
      hasImagesField: !!buffet.images,
      imagesFieldType: typeof buffet.images,
      firstPhotoRef: photoObjects[0]?.photoReference?.substring(0, 50) || 'none',
    });
    
    // Collect contact info
    const contactInfo: { menuUrl?: string; orderBy?: any; phone?: string; website?: string } = {};
    
    // Check for menuUrl in various places - check ALL sources
    // Priority: buffet.menuUrl > buffet.menu field > menus table > buffet.url
    
    // First, check direct menuUrl field
    if (buffet.menuUrl && typeof buffet.menuUrl === 'string') {
      contactInfo.menuUrl = buffet.menuUrl;
      console.log('[getBuffetNameBySlug] ✅ Set menuUrl from buffet.menuUrl field:', buffet.menuUrl.substring(0, 50));
    }
    
    // Check buffet.menu field - can be a plain URL string or JSON object
    if (!contactInfo.menuUrl && buffet.menu) {
      console.log('[getBuffetNameBySlug] Checking buffet.menu field, type:', typeof buffet.menu);
      
      // First check if it's a plain URL string (most common case)
      if (typeof buffet.menu === 'string') {
        const menuStr = buffet.menu.trim();
        // Check if it looks like a URL (starts with http or https)
        if (menuStr.startsWith('http://') || menuStr.startsWith('https://')) {
          contactInfo.menuUrl = menuStr;
          console.log('[getBuffetNameBySlug] ✅ Set menuUrl from buffet.menu (plain URL):', menuStr.substring(0, 50));
        } else {
          // Try to parse as JSON
          const menuData = parseJsonField(buffet.menu);
          if (menuData && typeof menuData === 'object') {
            // Check multiple possible field names for menu URL
            const possibleUrl = menuData.sourceUrl || menuData.menuUrl || menuData.url || menuData.link;
            if (possibleUrl && typeof possibleUrl === 'string') {
              contactInfo.menuUrl = possibleUrl;
              console.log('[getBuffetNameBySlug] ✅ Set menuUrl from buffet.menu JSON:', possibleUrl.substring(0, 50));
            } else {
              console.log('[getBuffetNameBySlug] buffet.menu JSON exists but no URL found in:', Object.keys(menuData));
            }
          }
        }
      }
    }
    
    // Menu URL from menus table: fetched in page (parallel with city) to avoid waterfall.
    // Page merges menu.sourceUrl into contactInfo.menuUrl when menu is loaded.
    
    // Also check if there's a general URL field that might be a menu (lowest priority)
    if (!contactInfo.menuUrl && buffet.url && typeof buffet.url === 'string') {
      // Only use if it looks like a menu URL (contains menu, order, or food-related terms)
      const urlLower = buffet.url.toLowerCase();
      if (urlLower.includes('menu') || urlLower.includes('order') || urlLower.includes('food')) {
        contactInfo.menuUrl = buffet.url;
      }
    }
    
    // Parse orderBy - it might be JSON stringified array of objects with service names and URLs
    if (buffet.orderBy) {
      const orderByData = parseJsonField(buffet.orderBy);
      contactInfo.orderBy = orderByData || buffet.orderBy;
    }
    
    if (buffet.phone) contactInfo.phone = buffet.phone;
    if (buffet.website && typeof buffet.website === 'string') contactInfo.website = buffet.website;
    
    // Parse reviewsDistribution
    let reviewsDistribution: { [key: string]: number } | undefined;
    if (buffet.reviewsDistribution) {
      const parsed = parseJsonField(buffet.reviewsDistribution);
      if (parsed && typeof parsed === 'object') {
        reviewsDistribution = parsed;
      }
    }
    
    // Parse reviewsTags - can be array of objects {title, count} or array of strings
    let reviewsTags: Array<{ title: string; count?: number }> | undefined;
    if (buffet.reviewsTags) {
      const parsed = parseJsonField(buffet.reviewsTags);
      if (Array.isArray(parsed)) {
        // Handle both formats: [{title, count}] or just strings
        reviewsTags = parsed.map((item: any) => {
          if (typeof item === 'string') {
            return { title: item };
          } else if (item && typeof item === 'object' && item.title) {
            return { title: item.title, count: item.count };
          }
          return null;
        }).filter(Boolean);
      }
    }
    
    // Get reviewsCount - prefer from buffet field, fallback to reviews array length
    const reviewsCount = buffet.reviewsCount || reviews.length || undefined;
    
    // Parse webResults
    let webResults: Array<{ title: string; displayedUrl?: string; url: string; description?: string }> | undefined;
    if (buffet.webResults) {
      const parsed = parseJsonField(buffet.webResults);
      if (Array.isArray(parsed)) {
        webResults = parsed.map((item: any) => ({
          title: item.title || '',
          displayedUrl: item.displayedUrl,
          url: item.url || '',
          description: item.description,
        })).filter((item: any) => item.title && item.url);
      }
    }
    
    console.log('[getBuffetNameBySlug] Reviews summary:', {
      slug: buffetSlug,
      reviewsArrayLength: reviews.length,
      reviewsCount: reviewsCount,
      hasReviewsDistribution: !!reviewsDistribution,
      reviewsTagsCount: reviewsTags?.length || 0,
      webResultsCount: webResults?.length || 0,
    });
    
    const buffetData: { 
      name: string; 
      id: string;
      slug: string;
      placeId?: string;
      categories: string[]; 
      address: string; 
      cityName?: string;
      state?: string;
      stateAbbr?: string;
      location?: { lat: number; lng: number };
      description?: string; 
      description2?: string; 
      images: Array<{ photoReference: string; widthPx?: number; heightPx?: number }>; 
      imageCount: number; 
      imageCategories: string[]; 
      hours?: any; 
      contactInfo?: { menuUrl?: string; orderBy?: any; phone?: string; website?: string }; 
      price?: string; 
      rating?: number; 
      reviews?: any[];
      reviewsCount?: number;
      reviewsDistribution?: { [key: string]: number };
      reviewsTags?: Array<{ title: string; count?: number }>;
      webResults?: Array<{ title: string; displayedUrl?: string; url: string; description?: string }>;
      accessibility?: any;
      amenities?: any;
      accommodationLodging?: string;
      agriculturalFarming?: string;
      artsCulture?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      communicationsTechnology?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      educationLearning?: string;
      financialServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      foodDining?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      governmentPublicServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      healthcareMedicalServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      homeImprovementGarden?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      industrialManufacturing?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      miscellaneousServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      neighborhoodContext?: { neighborhoods: Array<{ name: string; type?: string }>; districts_or_areas?: Array<{ name: string; type?: string }>; county?: string | null; metro_area?: string | null; generatedAt?: string; model?: string; source?: string };
      personalCareBeauty?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      petCareVeterinary?: string;
      professionalBusinessServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      recreationEntertainment?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      religiousSpiritual?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      repairMaintenance?: string;
      retailShopping?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      communitySocialServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      sportsFitness?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      transportationAutomotive?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      travelTourismServices?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string }> }>; poiCount: number; generatedAt: string; model: string };
      utilitiesInfrastructure?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      accomodationLodging?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      artsCulture?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
      communicationsTechnology?: { summary: string; highlights: Array<{ label: string; items: Array<{ name: string; distanceText: string; category: string; addressText: string | null; hoursText: string | null; phone: string | null; website: string | null }> }>; poiCount: number; generatedAt: string; model: string };
    } = { 
      name: buffet.name || '',
      id: buffet.id || '',
      slug: buffet.slug || '',
      placeId: buffet.placeId || undefined,
      categories: categories || [],
      address: address || '',
      cityName: buffet.cityName || '',
      state: buffet.state || '',
      stateAbbr: buffet.stateAbbr || '',
      location: (buffet.lat && buffet.lng) ? { lat: buffet.lat, lng: buffet.lng } : undefined,
      images: allImages,
      imageCount: imageCount,
      imageCategories: imageCategories
    };
    
    // Only include description if it exists
    if (buffet.description) {
      buffetData.description = buffet.description;
    }
    
    // Only include description2 if it exists
    if (buffet.description2) {
      buffetData.description2 = buffet.description2;
    }
    
    // Include price if it exists
    if (buffet.price) {
      buffetData.price = buffet.price;
    }
    
    // Include rating if it exists and is a valid number
    if (buffet.rating && typeof buffet.rating === 'number' && buffet.rating > 0) {
      buffetData.rating = buffet.rating;
    }
    
    // Include reviews data
    if (reviews.length > 0) {
      buffetData.reviews = reviews;
    }
    if (reviewsCount) {
      buffetData.reviewsCount = reviewsCount;
    }
    if (reviewsDistribution) {
      buffetData.reviewsDistribution = reviewsDistribution;
    }
    if (reviewsTags && reviewsTags.length > 0) {
      buffetData.reviewsTags = reviewsTags;
    }
    if (webResults && webResults.length > 0) {
      buffetData.webResults = webResults;
    }
    
    // Include questionsAndAnswers if it exists
    // The data can be either an array directly or an object with { items: [...] }
    const questionsAndAnswersRaw = parseJsonField(buffet.questionsAndAnswers);
    let questionsAndAnswers: Array<{ question?: string; answer?: string; [key: string]: any }> | undefined;
    
    if (questionsAndAnswersRaw) {
      if (Array.isArray(questionsAndAnswersRaw)) {
        // Direct array format
        questionsAndAnswers = questionsAndAnswersRaw;
      } else if (questionsAndAnswersRaw.items && Array.isArray(questionsAndAnswersRaw.items)) {
        // Object with items array format (from AI-generated Q&A)
        questionsAndAnswers = questionsAndAnswersRaw.items;
      }
    }
    
    if (questionsAndAnswers && questionsAndAnswers.length > 0) {
      buffetData.questionsAndAnswers = questionsAndAnswers;
    }
    if (accessibility) {
      buffetData.accessibility = accessibility;
    }
    // Check if amenities has any content (not just empty object)
    if (amenities && Object.keys(amenities).length > 0) {
      buffetData.amenities = amenities;
    }
    
    // Include additionalInfo if it exists (contains original Google Places amenity/accessibility data)
    const additionalInfo = parseJsonField(buffet.additionalInfo);
    if (additionalInfo && typeof additionalInfo === 'object' && Object.keys(additionalInfo).length > 0) {
      (buffetData as any).additionalInfo = additionalInfo;
    }
    
    // Include accommodationLodging if it exists (HTML string)
    if (buffet.accommodationLodging && typeof buffet.accommodationLodging === 'string' && buffet.accommodationLodging.trim().length > 0) {
      buffetData.accommodationLodging = buffet.accommodationLodging;
    }
    
    // Include agriculturalFarming if it exists (HTML string)
    if (buffet.agriculturalFarming && typeof buffet.agriculturalFarming === 'string' && buffet.agriculturalFarming.trim().length > 0) {
      buffetData.agriculturalFarming = buffet.agriculturalFarming;
    }
    
    // Include artsCulture if it exists (JSON string)
    if (buffet.artsCulture && typeof buffet.artsCulture === 'string' && buffet.artsCulture.trim().length > 0) {
      const artsCultureData = safeParseJsonObject(buffet.artsCulture);
      if (artsCultureData) {
        buffetData.artsCulture = artsCultureData;
        console.log('[getBuffetNameBySlug] ✅ Found artsCulture');
      }
    }
    
    // Include communicationsTechnology if it exists (can be JSON string or HTML)
    if (buffet.communicationsTechnology && typeof buffet.communicationsTechnology === 'string' && buffet.communicationsTechnology.trim().length > 0) {
      const communicationsTechnologyData = safeParseJsonObject(buffet.communicationsTechnology);
      if (communicationsTechnologyData) {
        buffetData.communicationsTechnology = communicationsTechnologyData;
        console.log('[getBuffetNameBySlug] ✅ Found communicationsTechnology');
      }
    }
    
    // Include educationLearning if it exists (JSON string that needs to be formatted)
    if (buffet.educationLearning && typeof buffet.educationLearning === 'string' && buffet.educationLearning.trim().length > 0) {
      const educationLearningData = safeParseJsonObject(buffet.educationLearning);
      if (educationLearningData) {
        const formattedHtml = formatArtsCultureHtml(educationLearningData);
        if (formattedHtml) {
          buffetData.educationLearning = formattedHtml;
          console.log('[getBuffetNameBySlug] ✅ Found and formatted educationLearning');
        }
      } else if (buffet.educationLearning.trim().startsWith('<')) {
        // If it's HTML, use as-is
        buffetData.educationLearning = buffet.educationLearning;
      }
    }
    
    // Include financialServices if it exists (JSON string)
    if (buffet.financialServices && typeof buffet.financialServices === 'string' && buffet.financialServices.trim().length > 0) {
      const financialServicesData = safeParseJsonObject(buffet.financialServices);
      if (financialServicesData) {
        buffetData.financialServices = financialServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found financialServices');
      }
    }
    
    // Include foodDining if it exists (JSON string)
    if (buffet.foodDining && typeof buffet.foodDining === 'string' && buffet.foodDining.trim().length > 0) {
      const foodDiningData = safeParseJsonObject(buffet.foodDining);
      if (foodDiningData) {
        buffetData.foodDining = foodDiningData;
        console.log('[getBuffetNameBySlug] ✅ Found foodDining');
      }
    }
    
    // Include governmentPublicServices if it exists (JSON string)
    if (buffet.governmentPublicServices && typeof buffet.governmentPublicServices === 'string' && buffet.governmentPublicServices.trim().length > 0) {
      const governmentPublicServicesData = safeParseJsonObject(buffet.governmentPublicServices);
      if (governmentPublicServicesData) {
        buffetData.governmentPublicServices = governmentPublicServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found governmentPublicServices');
      }
    }
    
    // Include healthcareMedicalServices if it exists (JSON string)
    if (buffet.healthcareMedicalServices && typeof buffet.healthcareMedicalServices === 'string' && buffet.healthcareMedicalServices.trim().length > 0) {
      const healthcareMedicalServicesData = safeParseJsonObject(buffet.healthcareMedicalServices);
      if (healthcareMedicalServicesData) {
        buffetData.healthcareMedicalServices = healthcareMedicalServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found healthcareMedicalServices');
      }
    }
    
    // Include homeImprovementGarden if it exists (JSON string)
    if (buffet.homeImprovementGarden && typeof buffet.homeImprovementGarden === 'string' && buffet.homeImprovementGarden.trim().length > 0) {
      const homeImprovementGardenData = safeParseJsonObject(buffet.homeImprovementGarden);
      if (homeImprovementGardenData) {
        buffetData.homeImprovementGarden = homeImprovementGardenData;
        console.log('[getBuffetNameBySlug] ✅ Found homeImprovementGarden');
      }
    }
    
    // Include industrialManufacturing if it exists (JSON string)
    if (buffet.industrialManufacturing && typeof buffet.industrialManufacturing === 'string' && buffet.industrialManufacturing.trim().length > 0) {
      const industrialManufacturingData = safeParseJsonObject(buffet.industrialManufacturing);
      if (industrialManufacturingData) {
        buffetData.industrialManufacturing = industrialManufacturingData;
        console.log('[getBuffetNameBySlug] ✅ Found industrialManufacturing');
      }
    }
    
    // Include miscellaneousServices if it exists (JSON string)
    if (buffet.miscellaneousServices && typeof buffet.miscellaneousServices === 'string' && buffet.miscellaneousServices.trim().length > 0) {
      const miscellaneousServicesData = safeParseJsonObject(buffet.miscellaneousServices);
      if (miscellaneousServicesData) {
        buffetData.miscellaneousServices = miscellaneousServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found miscellaneousServices');
      }
    }
    
    // Include neighborhoodContext if it exists (JSON string)
    if (buffet.neighborhoodContext && typeof buffet.neighborhoodContext === 'string' && buffet.neighborhoodContext.trim().length > 0) {
      const neighborhoodContextData = safeParseJsonObject(buffet.neighborhoodContext);
      if (neighborhoodContextData) {
        buffetData.neighborhoodContext = neighborhoodContextData;
        console.log('[getBuffetNameBySlug] ✅ Found neighborhoodContext');
      }
    }
    
    // Include personalCareBeauty if it exists (JSON string)
    if (buffet.personalCareBeauty && typeof buffet.personalCareBeauty === 'string' && buffet.personalCareBeauty.trim().length > 0) {
      const personalCareBeautyData = safeParseJsonObject(buffet.personalCareBeauty);
      if (personalCareBeautyData) {
        buffetData.personalCareBeauty = personalCareBeautyData;
        console.log('[getBuffetNameBySlug] ✅ Found personalCareBeauty');
      }
    }
    
    // Include petCareVeterinary if it exists (HTML string)
    if (buffet.petCareVeterinary && typeof buffet.petCareVeterinary === 'string' && buffet.petCareVeterinary.trim().length > 0) {
      buffetData.petCareVeterinary = buffet.petCareVeterinary;
      console.log('[getBuffetNameBySlug] ✅ Found petCareVeterinary');
    }
    
    // Include professionalBusinessServices if it exists (JSON string)
    if (buffet.professionalBusinessServices && typeof buffet.professionalBusinessServices === 'string' && buffet.professionalBusinessServices.trim().length > 0) {
      const professionalBusinessServicesData = safeParseJsonObject(buffet.professionalBusinessServices);
      if (professionalBusinessServicesData) {
        buffetData.professionalBusinessServices = professionalBusinessServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found professionalBusinessServices');
      }
    }
    
    // Include recreationEntertainment if it exists (JSON string)
    if (buffet.recreationEntertainment && typeof buffet.recreationEntertainment === 'string' && buffet.recreationEntertainment.trim().length > 0) {
      const recreationEntertainmentData = safeParseJsonObject(buffet.recreationEntertainment);
      if (recreationEntertainmentData) {
        buffetData.recreationEntertainment = recreationEntertainmentData;
        console.log('[getBuffetNameBySlug] ✅ Found recreationEntertainment');
      }
    }
    
    // Include religiousSpiritual if it exists (JSON string)
    if (buffet.religiousSpiritual && typeof buffet.religiousSpiritual === 'string' && buffet.religiousSpiritual.trim().length > 0) {
      const religiousSpiritualData = safeParseJsonObject(buffet.religiousSpiritual);
      if (religiousSpiritualData) {
        buffetData.religiousSpiritual = religiousSpiritualData;
        console.log('[getBuffetNameBySlug] ✅ Found religiousSpiritual');
      }
    }
    
    // Include repairMaintenance if it exists (HTML string)
    if (buffet.repairMaintenance && typeof buffet.repairMaintenance === 'string' && buffet.repairMaintenance.trim().length > 0) {
      buffetData.repairMaintenance = buffet.repairMaintenance;
      console.log('[getBuffetNameBySlug] ✅ Found repairMaintenance');
    }
    
    // Include retailShopping if it exists (JSON string)
    if (buffet.retailShopping && typeof buffet.retailShopping === 'string' && buffet.retailShopping.trim().length > 0) {
      const retailShoppingData = safeParseJsonObject(buffet.retailShopping);
      if (retailShoppingData) {
        buffetData.retailShopping = retailShoppingData;
        console.log('[getBuffetNameBySlug] ✅ Found retailShopping');
      }
    }
    
    // Include communitySocialServices if it exists (JSON string)
    if (buffet.communitySocialServices && typeof buffet.communitySocialServices === 'string' && buffet.communitySocialServices.trim().length > 0) {
      const communitySocialServicesData = safeParseJsonObject(buffet.communitySocialServices);
      if (communitySocialServicesData) {
        buffetData.communitySocialServices = communitySocialServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found communitySocialServices');
      }
    }
    
    // Include sportsFitness if it exists (JSON string)
    if (buffet.sportsFitness && typeof buffet.sportsFitness === 'string' && buffet.sportsFitness.trim().length > 0) {
      const sportsFitnessData = safeParseJsonObject(buffet.sportsFitness);
      if (sportsFitnessData) {
        buffetData.sportsFitness = sportsFitnessData;
        console.log('[getBuffetNameBySlug] ✅ Found sportsFitness');
      }
    }
    
    // Include transportationAutomotive if it exists (JSON string)
    if (buffet.transportationAutomotive && typeof buffet.transportationAutomotive === 'string' && buffet.transportationAutomotive.trim().length > 0) {
      const transportationAutomotiveData = safeParseJsonObject(buffet.transportationAutomotive);
      if (transportationAutomotiveData) {
        buffetData.transportationAutomotive = transportationAutomotiveData;
        console.log('[getBuffetNameBySlug] ✅ Found transportationAutomotive');
      }
    }
    
    // Include travelTourismServices if it exists (JSON string)
    if (buffet.travelTourismServices && typeof buffet.travelTourismServices === 'string' && buffet.travelTourismServices.trim().length > 0) {
      const travelTourismServicesData = safeParseJsonObject(buffet.travelTourismServices);
      if (travelTourismServicesData) {
        buffetData.travelTourismServices = travelTourismServicesData;
        console.log('[getBuffetNameBySlug] ✅ Found travelTourismServices');
      }
    }
    
    // Include utilitiesInfrastructure if it exists (JSON string)
    if (buffet.utilitiesInfrastructure && typeof buffet.utilitiesInfrastructure === 'string' && buffet.utilitiesInfrastructure.trim().length > 0) {
      const utilitiesInfrastructureData = safeParseJsonObject(buffet.utilitiesInfrastructure);
      if (utilitiesInfrastructureData) {
        buffetData.utilitiesInfrastructure = utilitiesInfrastructureData;
        console.log('[getBuffetNameBySlug] ✅ Found utilitiesInfrastructure');
      }
    }
    
    // Include accomodationLodging if it exists (JSON string)
    if (buffet.accomodationLodging && typeof buffet.accomodationLodging === 'string' && buffet.accomodationLodging.trim().length > 0) {
      const accomodationLodgingData = safeParseJsonObject(buffet.accomodationLodging);
      if (accomodationLodgingData) {
        buffetData.accomodationLodging = accomodationLodgingData;
        console.log('[getBuffetNameBySlug] ✅ Found accomodationLodging');
      }
    }
    
    // Only include hours if any hours data exists
    if (Object.keys(hoursData).length > 0) {
      buffetData.hours = hoursData;
    }
    
    // Only include contactInfo if any contact info exists
    if (Object.keys(contactInfo).length > 0) {
      buffetData.contactInfo = contactInfo;
      console.log('[getBuffetNameBySlug] Final contactInfo:', { 
        hasPhone: !!contactInfo.phone, 
        hasMenuUrl: !!contactInfo.menuUrl,
        menuUrl: contactInfo.menuUrl?.substring(0, 50),
        hasOrderBy: !!contactInfo.orderBy 
      });
    } else {
      console.log('[getBuffetNameBySlug] No contactInfo to include');
    }
    
    return buffetData;
  } catch (e) {
    console.error('[data-instantdb] getBuffetNameBySlug error:', e);
    return null;
  }
}

/** In-request memoization: dedupe buffet fetch (metadata + page + transforms share) */
export const getCachedBuffet = cache(getBuffetNameBySlug);

export async function getBuffetById(buffetId: string): Promise<any | null> {
  const buffetsById = await getBuffetsById();
  return buffetsById[buffetId] || null;
}

export async function getBuffetBySlug(citySlug: string, buffetSlug: string, includeReviews: boolean = false, includeMenu: boolean = false): Promise<any | null> {
  // OPTIMIZATION: Single query approach - query directly by city and buffet slug in one go
  if (includeReviews || includeMenu) {
    try {
      const db = getAdminDb();
      const queryStart = Date.now();
      
      // OPTIMIZATION: Single query with all needed links
      const query: any = {
        cities: {
          $: { where: { slug: citySlug } },
          buffets: {
            $: { where: { slug: buffetSlug } },
            city: {},
          },
        },
      };
      
      // Add reviews link if needed
      if (includeReviews) {
        query.cities.buffets.reviewRecords = {
          $: { order: [{ field: 'publishAt', direction: 'desc' }] },
        };
      }
      
      const result = await adminQuery(db, query);
      const queryDuration = Date.now() - queryStart;
      
      const buffetRaw = result.cities?.[0]?.buffets?.[0];
      if (!buffetRaw) {
        return null;
      }
      
      const transformedBuffet = transformBuffet(buffetRaw, citySlug, buffetRaw.reviewRecords);
      
      // OPTIMIZATION: Fetch menu in parallel if needed (could be optimized further with link relationship)
      if (includeMenu && transformedBuffet.placeId) {
        const menuStart = Date.now();
        const menu = await getMenuForBuffet(transformedBuffet.placeId);
        const menuDuration = Date.now() - menuStart;
        if (menu) {
          transformedBuffet.menu = menu.structuredData || {
            sourceUrl: menu.sourceUrl,
            contentType: menu.contentType,
            categories: menu.categories,
            items: menu.items,
            rawText: menu.rawText
          };
        }
      }
      
      
      return transformedBuffet;
    } catch (error) {
      console.error('[data-instantdb] Error fetching buffet with links:', error);
      // Fallback to regular fetch
    }
  }
  
  // OPTIMIZATION: For non-linked queries, use direct query instead of full city fetch
  try {
    const db = getAdminDb();
    const result = await adminQuery(db, {
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          $: { where: { slug: buffetSlug } },
          city: {},
        },
      },
    });
    
    const buffetRaw = result.cities?.[0]?.buffets?.[0];
    if (!buffetRaw) return null;
    
    const buffet = transformBuffet(buffetRaw, citySlug);
    
    // If menu is requested, fetch it separately
    if (includeMenu && buffet.placeId) {
      const menu = await getMenuForBuffet(buffet.placeId);
      if (menu) {
        buffet.menu = menu.structuredData || {
          sourceUrl: menu.sourceUrl,
          contentType: menu.contentType,
          categories: menu.categories,
          items: menu.items,
          rawText: menu.rawText
        };
      }
    }
    
    return buffet;
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffet:', error);
    return null;
  }
}

export async function getAllCitySlugs(): Promise<string[]> {
  const buffetsByCity = await getBuffetsByCity();
  return Object.keys(buffetsByCity);
}

// Neighborhood helpers
export function buildNeighborhoodsFromBuffets(buffets: any[], citySlug: string, cityName?: string, stateAbbr?: string): any[] {
  const startTime = Date.now();

  const neighborhoods: Record<string, any> = {};

  buffets.forEach((buffet: any) => {
    const neighborhood = buffet.neighborhood;
    if (!neighborhood) return;
    const key = neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    if (!neighborhoods[key]) {
      neighborhoods[key] = {
        neighborhood,
        slug: key,
        citySlug,
        cityName: cityName || buffet.cityName || buffet.city?.city || '',
        stateAbbr: stateAbbr || buffet.stateAbbr || '',
        buffets: [],
      };
    }
    neighborhoods[key].buffets.push(transformBuffet(buffet, citySlug));
  });

  return Object.values(neighborhoods)
    .map((n: any) => ({
      ...n,
      buffetCount: n.buffets.length,
    }))
    .sort((a: any, b: any) => b.buffetCount - a.buffetCount);

}

// Legacy neighborhood fetch (uses full cache)
// Legacy neighborhood fetch (uses full cache) - keep for compatibility under new name
export async function getNeighborhoodsByCityLegacy(citySlug: string): Promise<any[]> {
  const buffetsByNeighborhood = await getBuffetsByNeighborhood();
  
  const neighborhoods = Object.values(buffetsByNeighborhood)
    .filter((n: any) => n.citySlug === citySlug)
    .map((n: any) => ({
      neighborhood: n.neighborhood,
      slug: n.neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
      buffetCount: n.buffets.length,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  return neighborhoods;
}

export async function getAllBuffets(): Promise<any[]> {
  const buffetsById = await getBuffetsById();
  return Object.values(buffetsById);
}

// Fast search function that searches restaurant names, cities, and neighborhoods
// Fast search function using pre-built search index for instant lookups
type SearchDoc = {
  id: string;
  type: 'city' | 'buffet';
  slug: string;
  name: string;
  citySlug?: string;
  cityName?: string;
  state?: string;
  stateAbbr?: string;
  cityState?: string;
};

type SearchIndexCache = {
  index: MiniSearch<SearchDoc>;
  builtAt: number;
};

const SEARCH_INDEX_TTL_MS = 10 * 60 * 1000;
let searchIndexCache: SearchIndexCache | null = null;
let searchIndexPromise: Promise<SearchIndexCache> | null = null;

function normalizeSearchQuery(query: string) {
  return query.toLowerCase().trim();
}

async function buildSearchIndex(): Promise<SearchIndexCache> {
  const { cities, buffets } = await getCachedData();
  const docs: SearchDoc[] = [];

  cities.forEach((city: any) => {
    if (!city.city || !city.slug) return;
    const cityName = String(city.city).trim();
    const state = String(city.state || '').trim();
    const stateAbbr = String(city.stateAbbr || '').trim();
    const cityState = [cityName, state || stateAbbr].filter(Boolean).join(', ');
    docs.push({
      id: `city:${city.slug}`,
      type: 'city',
      slug: String(city.slug),
      name: cityState || cityName,
      cityName,
      state,
      stateAbbr,
      cityState,
    });
  });

  buffets.forEach((buffet: any) => {
    if (!buffet.name || !buffet.slug) return;
    const citySlug = String(buffet.city?.slug || '');
    const cityName = String(buffet.city?.city || buffet.cityName || '').trim();
    const stateAbbr = String(buffet.city?.stateAbbr || buffet.stateAbbr || '').trim();
    const state = String(buffet.city?.state || buffet.state || '').trim();
    const cityState = [cityName, state || stateAbbr].filter(Boolean).join(', ');
    docs.push({
      id: `buffet:${citySlug || 'unknown'}:${buffet.slug}`,
      type: 'buffet',
      slug: String(buffet.slug),
      name: String(buffet.name),
      citySlug,
      cityName,
      state,
      stateAbbr,
      cityState,
    });
  });

  const index = new MiniSearch<SearchDoc>({
    fields: ['name', 'cityName', 'state', 'stateAbbr', 'cityState'],
    storeFields: ['type', 'slug', 'name', 'citySlug', 'cityName', 'state', 'stateAbbr', 'cityState'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: {
        name: 2,
        cityName: 1.2,
        cityState: 1.4,
        state: 0.5,
        stateAbbr: 0.6,
      },
    },
  });

  index.addAll(docs);

  return {
    index,
    builtAt: Date.now(),
  };
}

async function getSearchIndex(): Promise<SearchIndexCache> {
  const now = Date.now();
  if (searchIndexCache && now - searchIndexCache.builtAt < SEARCH_INDEX_TTL_MS) {
    return searchIndexCache;
  }
  if (searchIndexPromise) {
    return searchIndexPromise;
  }

  searchIndexPromise = buildSearchIndex();
  try {
    searchIndexCache = await searchIndexPromise;
    return searchIndexCache;
  } finally {
    searchIndexPromise = null;
  }
}

async function searchAllLegacy(query: string, limit: number = 20) {
  const db = getAdminDb();
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  const results: Array<{ type: 'city' | 'buffet'; slug: string; name: string; citySlug?: string; score: number }> = [];
  try {
    const [buffetsResult, citiesResult] = await Promise.all([
      adminQuery(db, {
        buffets: {
          $: { limit: 500 },
          city: {},
        },
      }),
      adminQuery(db, {
        cities: {
          $: { limit: 200 },
        },
      }),
    ]);

    const buffets = (buffetsResult.buffets || []) as Array<{
      name?: string;
      slug?: string;
      cityName?: string;
      city?: { slug?: string; city?: string };
    }>;
    const cities = (citiesResult.cities || []) as Array<{
      city?: string;
      slug?: string;
      state?: string;
      stateAbbr?: string;
    }>;

    for (const city of cities) {
      if (!city.city || !city.slug) continue;

      const cityName = String(city.city).toLowerCase();
      const stateName = String(city.state || '').toLowerCase();
      const stateAbbr = String(city.stateAbbr || '').toLowerCase();
      const fullName = `${cityName}, ${stateName}`;
      const fullNameAbbr = `${cityName}, ${stateAbbr}`;

      let score = 0;

      if (cityName === normalizedQuery) {
        score = 100;
      } else if (fullName === normalizedQuery || fullNameAbbr === normalizedQuery) {
        score = 95;
      } else if (cityName.startsWith(normalizedQuery)) {
        score = 80;
      } else if (fullName.startsWith(normalizedQuery) || fullNameAbbr.startsWith(normalizedQuery)) {
        score = 75;
      } else if (cityName.includes(normalizedQuery)) {
        score = 60;
      } else if (fullName.includes(normalizedQuery) || fullNameAbbr.includes(normalizedQuery)) {
        score = 50;
      }

      if (score > 0) {
        results.push({
          type: 'city',
          slug: String(city.slug),
          name: `${city.city}, ${city.stateAbbr || city.state}`,
          score,
        });
      }
    }

    for (const buffet of buffets) {
      if (!buffet.name || !buffet.slug) continue;

      const buffetName = String(buffet.name).toLowerCase();
      const citySlug = String(buffet.city?.slug || '');
      const cityName = String(buffet.city?.city || buffet.cityName || '').toLowerCase();

      let score = 0;

      if (buffetName === normalizedQuery) {
        score = 90;
      } else if (buffetName.startsWith(normalizedQuery)) {
        score = 70;
      } else if (buffetName.includes(normalizedQuery)) {
        score = 50;
      } else if (cityName.includes(normalizedQuery)) {
        score = 30;
      }

      if (score > 0) {
        results.push({
          type: 'buffet',
          slug: String(buffet.slug),
          name: String(buffet.name),
          citySlug,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(({ score, ...rest }) => rest);
  } catch (error) {
    console.error('[data-instantdb] searchAllLegacy error:', error);
    return [];
  }
}

export async function searchAll(query: string, limit: number = 20): Promise<Array<{ type: 'city' | 'buffet'; slug: string; name: string; citySlug?: string }>> {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  try {
    const { index } = await getSearchIndex();
    const matches = index.search(normalizedQuery);
    return matches
      .filter((match) => match.name && match.slug && match.type)
      .slice(0, limit)
      .map((match) => ({
        type: match.type,
        slug: match.slug,
        name: match.name,
        citySlug: match.citySlug,
      }));
  } catch (error) {
    console.error('[data-instantdb] searchAll error:', error);
    return searchAllLegacy(query, limit);
  }
}

// Lightweight function to get buffet pins for homepage map - no cache, direct minimal query
// Limit ~150-200 for performance; clustering handles display
export async function getBuffetsForMap(
  limit: number = 150,
): Promise<Array<{ id: string; name: string; slug: string; lat: number; lng: number; rating?: number; citySlug: string }>> {
  const db = getAdminDb();
  try {
    const result = await adminQuery(db, {
      buffets: {
        $: { limit: limit * 2 }, // Fetch extra to account for filtering out invalid coords
        city: {},
      },
    });
    const buffets = result.buffets || [];
    return buffets
      .filter((b: any) => b.lat != null && b.lng != null && typeof b.lat === 'number' && typeof b.lng === 'number')
      .slice(0, limit)
      .map((b: any) => ({
        id: b.id,
        name: b.name || '',
        slug: b.slug || '',
        lat: b.lat,
        lng: b.lng,
        rating: b.rating ?? undefined,
        citySlug: b.city?.slug || '',
      }));
  } catch (e) {
    console.error('[data-instantdb] getBuffetsForMap error:', e);
    return [];
  }
}

/**
 * Top rated buffets: rating >= 4.3, min 50 reviews. Direct DB query, no cache.
 */
export async function getTopRatedBuffets(limit: number = 10): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  city: string;
  state: string;
  rating: number;
  reviewsCount: number;
}>> {
  const db = getAdminDb();
  try {
    const result = await adminQuery(db, {
      buffets: {
        $: {
          limit: 200,
          where: { rating: { $gte: 4.3 } },
          order: { rating: 'desc' },
        },
        city: {},
      },
    });
    const buffets = (result.buffets || [])
      .filter((b: any) => (b.reviewsCount ?? 0) >= 50 && b.city?.slug)
      .slice(0, limit)
      .map((b: any) => ({
        id: b.id,
        name: b.name || '',
        slug: b.slug || '',
        citySlug: b.city?.slug || '',
        city: b.cityName || b.city?.city || '',
        state: b.stateAbbr || b.state || '',
        rating: b.rating ?? 0,
        reviewsCount: b.reviewsCount ?? 0,
      }));
    return buffets;
  } catch (e) {
    console.error('[data-instantdb] getTopRatedBuffets error:', e);
    return [];
  }
}

/** First photo reference from buffet.images JSON for homepage thumb */
function firstPhotoReferenceFromImages(imagesJson: unknown): string | undefined {
  if (!imagesJson || typeof imagesJson !== 'string') return undefined;
  try {
    const arr = JSON.parse(imagesJson);
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const first = arr[0];
    const ref = first && typeof first === 'object' && first !== null && 'photoReference' in first
      ? (first as { photoReference?: string }).photoReference
      : undefined;
    return typeof ref === 'string' && ref.startsWith('places/') ? ref : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Top-rated buffets for homepage: name, slug, city, stateAbbr, rating, reviewCount, optional thumb.
 * Uses same criteria as getTopRatedBuffets (rating >= 4.3, min 50 reviews). Direct DB query.
 */
export async function getTopRatedBuffetsForHomepage(limit: number = 12): Promise<Array<{
  name: string;
  slug: string;
  city: string;
  stateAbbr: string;
  rating: number;
  reviewCount: number;
  thumbPhotoReference?: string;
}>> {
  try {
    const db = getAdminDb();
    const result = await adminQuery(db, {
      buffets: {
        $: {
          limit: 200,
          where: { rating: { $gte: 4.3 } },
          order: { rating: 'desc' },
        },
        city: {},
      },
    });
    const buffets = (result.buffets || [])
      .filter((b: any) => (b.reviewsCount ?? 0) >= 50 && b.city?.slug)
      .slice(0, limit)
      .map((b: any) => ({
        name: b.name || '',
        slug: b.slug || '',
        city: b.cityName || b.city?.city || '',
        stateAbbr: b.stateAbbr || b.state || '',
        rating: b.rating ?? 0,
        reviewCount: b.reviewsCount ?? 0,
        thumbPhotoReference: firstPhotoReferenceFromImages(b.images),
      }));
    return buffets;
  } catch (e) {
    console.error('[data-instantdb] getTopRatedBuffetsForHomepage error:', e);
    return [];
  }
}

/**
 * Most reviewed buffets: sorted by reviewsCount desc. Direct DB query, no cache.
 */
export async function getMostReviewedBuffets(limit: number = 10): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  city: string;
  state: string;
  rating: number;
  reviewsCount: number;
}>> {
  const db = getAdminDb();
  try {
    const result = await adminQuery(db, {
      buffets: {
        $: { limit: 500 },
        city: {},
      },
    });
    const buffets = (result.buffets || [])
      .filter((b: any) => (b.reviewsCount ?? 0) > 0 && b.city?.slug)
      .sort((a: any, b: any) => (b.reviewsCount ?? 0) - (a.reviewsCount ?? 0))
      .slice(0, limit)
      .map((b: any) => ({
        id: b.id,
        name: b.name || '',
        slug: b.slug || '',
        citySlug: b.city?.slug || '',
        city: b.cityName || b.city?.city || '',
        state: b.stateAbbr || b.state || '',
        rating: b.rating ?? 0,
        reviewsCount: b.reviewsCount ?? 0,
      }));
    return buffets;
  } catch (e) {
    console.error('[data-instantdb] getMostReviewedBuffets error:', e);
    return [];
  }
}

// Lightweight function to get first few buffets for homepage - no cache, direct minimal query
export async function getSampleBuffets(count: number = 2): Promise<any[]> {
  const db = getAdminDb();
  
  try {
    const result = await adminQuery(db, {
      buffets: {
        $: { limit: count },
        city: {},
      },
    });
    
    // Return minimal data needed for links
    return (result.buffets || []).map((b: any) => ({
      id: b.id,
      name: b.name || '',
      slug: b.slug || '',
      citySlug: b.city?.slug || '',
      address: {
        city: b.cityName || '',
        state: b.state || '',
      },
    }));
  } catch (e) {
    console.error('[data-instantdb] getSampleBuffets error:', e);
    return [];
  }
}

export async function getSummary(): Promise<any> {
  const functionStartTime = Date.now();
  // Use shared cache - this allows parallel calls to share the same data fetch
  const { cities, buffets } = await getCachedData();
  
  // Count buffets per city without full transformation
  const cityBuffetCounts: Record<string, number> = {};
  const cityData: Record<string, { slug: string; city: string; state: string }> = {};
  
  cities.forEach((city: any) => {
    cityBuffetCounts[city.slug] = 0;
    cityData[city.slug] = {
      slug: city.slug,
      city: city.city || '',
      state: city.state || '',
    };
  });
  
  // Just count, don't transform - only iterate through buffets
  buffets.forEach((buffet: any) => {
    const citySlug = buffet.city?.slug;
    if (citySlug && cityBuffetCounts[citySlug] !== undefined) {
      cityBuffetCounts[citySlug]++;
    }
  });
  
  const citiesList = Object.entries(cityBuffetCounts)
    .filter(([slug, count]) => count > 0)
    .map(([slug, count]) => ({
      slug,
      city: cityData[slug].city,
      state: cityData[slug].state,
      buffetCount: count,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  const totalBuffets = Object.values(cityBuffetCounts).reduce((sum, count) => sum + count, 0);
  const citiesWithBuffets = citiesList.length;
  
  const totalDuration = Date.now() - functionStartTime;
  console.log(`[data-instantdb] getSummary: ${cities.length} total cities, ${citiesWithBuffets} with buffets, ${totalBuffets} total buffets`);
  
  return {
    totalCities: cities.length,
    totalBuffets: totalBuffets,
    citiesWithBuffets: citiesWithBuffets,
    cities: citiesList,
  };
}

/**
 * Get the most recent buffet update timestamp (scrapedAt) for "Last updated" display.
 * Uses shared cache. Returns null if no buffets or no timestamps.
 */
export async function getLatestBuffetUpdateTimestamp(): Promise<string | null> {
  try {
    const { buffets } = await getCachedData();
    if (!buffets?.length) return null;
    let latest: Date | null = null;
    for (const b of buffets) {
      const ts = b.scrapedAt || b.updatedAt;
      if (ts) {
        const d = new Date(ts);
        if (!isNaN(d.getTime()) && (!latest || d > latest)) {
          latest = d;
        }
      }
    }
    return latest ? latest.toISOString() : null;
  } catch (e) {
    console.error('[data-instantdb] getLatestBuffetUpdateTimestamp error:', e);
    return null;
  }
}

// Lightweight function to get top cities with buffet counts - uses cached summary data
// This is more efficient as it reuses already-fetched data
export async function getTopCities(
  limit: number = 10,
): Promise<Array<{ slug: string; city: string; state: string; buffetCount: number }>> {
  try {
    // Use getSummary which has caching, but only get the cities part
    // This reuses the shared cache from getCachedData
    const summary = await getSummary();
    return (summary?.cities || []).slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] getTopCities error:', error);
    // Fallback: return empty array or a static list of known top cities
    return [];
  }
}

/** State abbr -> full name for display */
export const STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

/** Normalize state to 2-letter key for grouping (handles "TX" or "Texas") */
function stateKey(state: string): string {
  if (!state) return '';
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  const abbr: Record<string, string> = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
    kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
    michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
    nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
    'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
    oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
    tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
    'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
  };
  return abbr[s.toLowerCase()] || s.toUpperCase().slice(0, 2);
}

/**
 * Top cities with geographic diversity - prefer highest buffet counts but limit per state
 * to avoid showing only one region. Returns 12-24 cities.
 */
export async function getTopCitiesWithDiversity(
  limit: number = 24,
  maxPerState: number = 3,
): Promise<Array<{ slug: string; city: string; state: string; buffetCount: number }>> {
  try {
    const summary = await getSummary();
    const cities = summary?.cities || [];
    if (cities.length === 0) return [];

    const stateCount: Record<string, number> = {};
    const result: Array<{ slug: string; city: string; state: string; buffetCount: number }> = [];

    for (const c of cities) {
      if (result.length >= limit) break;
      const key = stateKey(c.state);
      const count = stateCount[key] || 0;
      if (count < maxPerState) {
        result.push(c);
        stateCount[key] = count + 1;
      }
    }

    return result;
  } catch (error) {
    console.error('[data-instantdb] getTopCitiesWithDiversity error:', error);
    return [];
  }
}

/**
 * States with top cities for Browse by State - uses getSummary
 */
export async function getStatesBrowseData(): Promise<Array<{
  stateAbbr: string;
  stateName: string;
  buffetCount: number;
  topCities: string[];
}>> {
  try {
    const summary = await getSummary();
    const cities = summary?.cities || [];
    if (cities.length === 0) return [];

    const byState: Record<string, { buffetCount: number; cities: Array<{ city: string; count: number }> }> = {};

    for (const c of cities) {
      const parts = c.slug.split('-');
      const stateAbbr = (parts[parts.length - 1] || '').toUpperCase();
      if (!stateAbbr || stateAbbr.length !== 2) continue;

      if (!byState[stateAbbr]) {
        byState[stateAbbr] = { buffetCount: 0, cities: [] };
      }
      byState[stateAbbr].buffetCount += c.buffetCount;
      byState[stateAbbr].cities.push({ city: c.city, count: c.buffetCount });
    }

    return Object.entries(byState).map(([abbr, data]) => {
      const topCities = data.cities
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((x) => x.city);
      return {
        stateAbbr: abbr,
        stateName: STATE_ABBR_TO_NAME[abbr] || abbr,
        buffetCount: data.buffetCount,
        topCities,
      };
    });
  } catch (error) {
    console.error('[data-instantdb] getStatesBrowseData error:', error);
    return [];
  }
}

// Lightweight function to get just state counts - uses shared cache
export async function getStateCounts(): Promise<Record<string, number>> {
  const functionStartTime = Date.now();
  // Use shared cache to avoid duplicate queries - counts from already-fetched buffets
  const { buffets } = await getCachedData();
  
  const stateCounts: Record<string, number> = {};
  
  // Count buffets per state without transformation
  buffets.forEach((buffet: any) => {
    const stateAbbr = buffet.stateAbbr || '';
    if (!stateAbbr) return;
    stateCounts[stateAbbr] = (stateCounts[stateAbbr] || 0) + 1;
  });
  
  const totalDuration = Date.now() - functionStartTime;
  
  return stateCounts;
}

// State-level functions
export async function getBuffetsByState(): Promise<Record<string, any>> {
  const functionStartTime = Date.now();
  const getCachedDataStart = Date.now();
  const { cities, buffets } = await getCachedData();
  const getCachedDataDuration = Date.now() - getCachedDataStart;
  
  const buffetsByState: Record<string, any> = {};
  
  // Group buffets by state
  const transformStart = Date.now();
  buffets.forEach((buffet: any) => {
    const stateAbbr = buffet.stateAbbr || '';
    const stateName = buffet.state || '';
    
    if (!stateAbbr) return;
    
    if (!buffetsByState[stateAbbr]) {
      buffetsByState[stateAbbr] = {
        state: stateName,
        stateAbbr: stateAbbr,
        buffets: [],
        cities: new Set(),
      };
    }
    
    buffetsByState[stateAbbr].buffets.push(transformBuffet(buffet, buffet.city?.slug));
    
    if (buffet.city?.city) {
      buffetsByState[stateAbbr].cities.add(buffet.city.city);
    }
  });
  const transformDuration = Date.now() - transformStart;
  
  // Convert Sets to arrays and sort
  const sortStart = Date.now();
  Object.keys(buffetsByState).forEach(stateAbbr => {
    const stateData = buffetsByState[stateAbbr];
    stateData.cities = Array.from(stateData.cities).sort();
    stateData.buffets.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
  });
  const sortDuration = Date.now() - sortStart;
  
  const totalDuration = Date.now() - functionStartTime;
  console.log(`[data-instantdb] getBuffetsByState: ${Object.keys(buffetsByState).length} states with buffets`);
  
  return buffetsByState;
}

export async function getStateByAbbr(stateAbbr: string): Promise<any | null> {
  const buffetsByState = await getBuffetsByState();
  const stateData = buffetsByState[stateAbbr.toUpperCase()];
  
  if (!stateData) return null;
  
  return {
    state: stateData.state,
    stateAbbr: stateData.stateAbbr,
    buffets: stateData.buffets,
    cities: stateData.cities,
    buffetCount: stateData.buffets.length,
    cityCount: stateData.cities.length,
  };
}

export async function getAllStateAbbrs(): Promise<string[]> {
  const buffetsByState = await getBuffetsByState();
  return Object.keys(buffetsByState).sort();
}

// Neighborhood-level functions
export async function getBuffetsByNeighborhood(): Promise<Record<string, any>> {
  const { cities, buffets } = await getCachedData();
  
  const buffetsByNeighborhood: Record<string, any> = {};
  
  // Group buffets by neighborhood within each city
  buffets.forEach((buffet: any) => {
    const neighborhood = buffet.neighborhood;
    const citySlug = buffet.city?.slug;
    const cityName = buffet.cityName || buffet.city?.city || '';
    const stateAbbr = buffet.stateAbbr || '';
    
    if (!neighborhood || !citySlug) return;
    
    // Create a unique key: citySlug-neighborhood
    const key = `${citySlug}-${neighborhood.toLowerCase().replace(/\s+/g, '-')}`;
    
    if (!buffetsByNeighborhood[key]) {
      buffetsByNeighborhood[key] = {
        neighborhood: neighborhood,
        citySlug: citySlug,
        cityName: cityName,
        stateAbbr: stateAbbr,
        buffets: [],
      };
    }
    
    buffetsByNeighborhood[key].buffets.push(transformBuffet(buffet, citySlug));
  });
  
  // Sort buffets within each neighborhood by rating
  Object.values(buffetsByNeighborhood).forEach((neighborhood: any) => {
    neighborhood.buffets.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
  });
  
  console.log(`[data-instantdb] getBuffetsByNeighborhood: ${Object.keys(buffetsByNeighborhood).length} neighborhoods with buffets`);
  
  return buffetsByNeighborhood;
}

/**
 * Top neighborhoods by buffet count for homepage. Uses getBuffetsByNeighborhood.
 * Returns empty if no neighborhood data - section should hide.
 */
export async function getTopNeighborhoods(limit: number = 12): Promise<Array<{
  neighborhood: string;
  slug: string;
  citySlug: string;
  cityName: string;
  stateAbbr: string;
  buffetCount: number;
}>> {
  try {
    const buffetsByNeighborhood = await getBuffetsByNeighborhood();
    const neighborhoods = Object.values(buffetsByNeighborhood)
      .map((n: any) => ({
        neighborhood: n.neighborhood,
        slug: n.neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
        citySlug: n.citySlug,
        cityName: n.cityName || '',
        stateAbbr: n.stateAbbr || '',
        buffetCount: n.buffets?.length || 0,
      }))
      .filter((n) => n.buffetCount > 0)
      .sort((a, b) => b.buffetCount - a.buffetCount)
      .slice(0, limit);
    return neighborhoods;
  } catch (error) {
    console.error('[data-instantdb] getTopNeighborhoods error:', error);
    return [];
  }
}

export async function getNeighborhoodsByCity(citySlug: string): Promise<any[]> {
  const buffetsByNeighborhood = await getBuffetsByNeighborhood();
  
  const neighborhoods = Object.values(buffetsByNeighborhood)
    .filter((n: any) => n.citySlug === citySlug)
    .map((n: any) => {
      // Generate slug that matches the key format
      const slug = n.neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      return {
        neighborhood: n.neighborhood,
        slug: slug,
        buffetCount: n.buffets.length,
      };
    })
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  return neighborhoods;
}

export async function getNeighborhoodBySlug(citySlug: string, neighborhoodSlug: string): Promise<any | null> {
  const buffetsByNeighborhood = await getBuffetsByNeighborhood();
  
  // Try to find by matching the slug pattern
  // The key format is: citySlug-neighborhood-slug
  // But we need to match by neighborhood slug
  for (const [key, neighborhoodData] of Object.entries(buffetsByNeighborhood)) {
    const data = neighborhoodData as any;
    if (data.citySlug === citySlug) {
      const dataSlug = data.neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      if (dataSlug === neighborhoodSlug) {
        return {
          neighborhood: data.neighborhood,
          citySlug: data.citySlug,
          cityName: data.cityName,
          stateAbbr: data.stateAbbr,
          buffets: data.buffets,
          buffetCount: data.buffets.length,
        };
      }
    }
  }
  
  return null;
}

export async function getNearbyBuffets(
  lat: number,
  lng: number,
  maxDistance: number = 10,
  excludeId?: string
): Promise<any[]> {
  const allBuffets = await getAllBuffets();
  const nearby: Array<{ buffet: any; distance: number }> = [];
  
  for (const buffet of allBuffets) {
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

/**
 * Get buffets in the same city (excluding the current buffet)
 */
export async function getBuffetsInSameCity(
  citySlug: string,
  excludeId?: string,
  limit: number = 8
): Promise<any[]> {
  try {
    const city = await getCityBySlug(citySlug);
    if (!city || !city.buffets) return [];
    
    return city.buffets
      .filter((b: any) => !excludeId || b.id !== excludeId)
      .slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets in same city:', error);
    return [];
  }
}

/**
 * Extract major road/street name from address string
 */
function extractRoadName(address: string): string | null {
  if (!address || typeof address !== 'string') return null;
  
  // Common road suffixes
  const roadSuffixes = [
    'St', 'Street', 'Ave', 'Avenue', 'Rd', 'Road', 'Blvd', 'Boulevard',
    'Dr', 'Drive', 'Ln', 'Lane', 'Pkwy', 'Parkway', 'Hwy', 'Highway',
    'Way', 'Ct', 'Court', 'Pl', 'Place', 'Cir', 'Circle'
  ];
  
  // Try to match patterns like "123 Main St" or "Main Street"
  const parts = address.split(',').map(s => s.trim());
  const firstPart = parts[0] || '';
  
  // Match road name patterns
  for (const suffix of roadSuffixes) {
    const regex = new RegExp(`\\b([A-Za-z0-9\\s]+)\\s+${suffix}\\b`, 'i');
    const match = firstPart.match(regex);
    if (match && match[1]) {
      const roadName = match[1].trim();
      // Skip if it's just a number
      if (!/^\d+$/.test(roadName)) {
        return `${roadName} ${suffix}`;
      }
    }
  }
  
  // Fallback: try to extract first meaningful word sequence
  const words = firstPart.split(/\s+/);
  if (words.length >= 2) {
    // Skip house number, take next 1-2 words
    const roadWords = words.slice(1, 3).join(' ');
    if (roadWords && roadWords.length > 2) {
      return roadWords;
    }
  }
  
  return null;
}

/**
 * Get buffets on the same major road/area (within 2 miles and same road name)
 */
export async function getBuffetsOnSameRoad(
  currentBuffet: any,
  limit: number = 8
): Promise<any[]> {
  try {
    if (!currentBuffet.location?.lat || !currentBuffet.location?.lng) return [];
    if (!currentBuffet.address) return [];
    
    const currentRoad = extractRoadName(
      typeof currentBuffet.address === 'string' 
        ? currentBuffet.address 
        : currentBuffet.address.full || ''
    );
    
    if (!currentRoad) return [];
    
    // Get nearby buffets within 2 miles
    const nearby = await getNearbyBuffets(
      currentBuffet.location.lat,
      currentBuffet.location.lng,
      2, // 2 miles radius
      currentBuffet.id
    );
    
    // Filter by same road name
    const sameRoad = nearby.filter((buffet: any) => {
      if (!buffet.address) return false;
      const buffetRoad = extractRoadName(
        typeof buffet.address === 'string'
          ? buffet.address
          : buffet.address.full || ''
      );
      return buffetRoad && buffetRoad.toLowerCase() === currentRoad.toLowerCase();
    });
    
    return sameRoad.slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets on same road:', error);
    return [];
  }
}

/**
 * Get buffets within radius (for internal linking)
 */
export async function getBuffetsWithinRadius(
  lat: number,
  lng: number,
  radiusMiles: number = 5,
  excludeId?: string,
  limit: number = 8
): Promise<any[]> {
  try {
    const nearby = await getNearbyBuffets(lat, lng, radiusMiles, excludeId);
    return nearby.slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets within radius:', error);
    return [];
  }
}

/**
 * Get all buffets (for filtering by POI data)
 */
async function getAllBuffetsForPOI(): Promise<any[]> {
  const { buffets } = await getCachedData();
  return buffets.map((b: any) => transformBuffet(b, b.city?.slug));
}

/**
 * Get buffets with parking nearby
 */
export async function getBuffetsWithParking(limit: number = 50): Promise<any[]> {
  try {
    const allBuffets = await getAllBuffetsForPOI();
    
    return allBuffets
      .filter((buffet: any) => {
        // Check if buffet has parking in amenities
        if (buffet.amenities?.parking) return true;
        
        // Check if buffet has parking in transportationAutomotive
        if (buffet.transportationAutomotive?.highlights) {
          for (const group of buffet.transportationAutomotive.highlights) {
            const labelLower = (group.label || '').toLowerCase();
            if (labelLower.includes('parking') || labelLower.includes('parking lot')) {
              if (group.items && group.items.length > 0) {
                return true;
              }
            }
          }
        }
        
        return false;
      })
      .slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets with parking:', error);
    return [];
  }
}

/**
 * Get buffets near shopping malls
 */
export async function getBuffetsNearShoppingMalls(limit: number = 50): Promise<any[]> {
  try {
    const allBuffets = await getAllBuffetsForPOI();
    
    return allBuffets
      .filter((buffet: any) => {
        if (!buffet.retailShopping?.highlights) return false;
        
        // Check if any retail shopping group contains malls or large shopping centers
        for (const group of buffet.retailShopping.highlights) {
          const labelLower = (group.label || '').toLowerCase();
          const hasMall = labelLower.includes('mall') || 
                         labelLower.includes('shopping center') ||
                         labelLower.includes('shopping centre');
          
          if (hasMall && group.items && group.items.length > 0) {
            return true;
          }
          
          // Also check item names for mall keywords
          if (group.items) {
            for (const item of group.items) {
              const nameLower = (item.name || '').toLowerCase();
              if (nameLower.includes('mall') || 
                  nameLower.includes('shopping center') ||
                  nameLower.includes('shopping centre')) {
                return true;
              }
            }
          }
        }
        
        return false;
      })
      .slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets near shopping malls:', error);
    return [];
  }
}

/**
 * Get buffets near highways
 */
export async function getBuffetsNearHighways(limit: number = 50): Promise<any[]> {
  try {
    const allBuffets = await getAllBuffetsForPOI();
    
    return allBuffets
      .filter((buffet: any) => {
        if (!buffet.transportationAutomotive?.highlights) return false;
        
        // Check if any transportation group contains highways or major roads
        for (const group of buffet.transportationAutomotive.highlights) {
          const labelLower = (group.label || '').toLowerCase();
          const hasHighway = labelLower.includes('highway') || 
                            labelLower.includes('freeway') ||
                            labelLower.includes('interstate') ||
                            labelLower.includes('major road');
          
          if (hasHighway && group.items && group.items.length > 0) {
            return true;
          }
          
          // Also check item names for highway keywords
          if (group.items) {
            for (const item of group.items) {
              const nameLower = (item.name || '').toLowerCase();
              const categoryLower = (item.category || '').toLowerCase();
              if (nameLower.includes('highway') || 
                  nameLower.includes('freeway') ||
                  nameLower.includes('interstate') ||
                  nameLower.includes('i-') ||
                  nameLower.includes('us-') ||
                  categoryLower.includes('highway')) {
                return true;
              }
            }
          }
        }
        
        return false;
      })
      .slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets near highways:', error);
    return [];
  }
}

/**
 * Get buffets near gas stations
 */
export async function getBuffetsNearGasStations(limit: number = 50): Promise<any[]> {
  try {
    const allBuffets = await getAllBuffetsForPOI();
    
    return allBuffets
      .filter((buffet: any) => {
        if (!buffet.transportationAutomotive?.highlights) return false;
        
        // Check if any transportation group contains gas stations
        for (const group of buffet.transportationAutomotive.highlights) {
          const labelLower = (group.label || '').toLowerCase();
          const hasGas = labelLower.includes('gas') || 
                        labelLower.includes('fuel') ||
                        labelLower.includes('service station');
          
          if (hasGas && group.items && group.items.length > 0) {
            return true;
          }
          
          // Also check item names for gas station keywords
          if (group.items) {
            for (const item of group.items) {
              const nameLower = (item.name || '').toLowerCase();
              const categoryLower = (item.category || '').toLowerCase();
              if (nameLower.includes('gas') || 
                  nameLower.includes('fuel') ||
                  nameLower.includes('shell') ||
                  nameLower.includes('bp') ||
                  nameLower.includes('chevron') ||
                  nameLower.includes('exxon') ||
                  nameLower.includes('mobil') ||
                  categoryLower.includes('fuel') ||
                  categoryLower.includes('gas')) {
                return true;
              }
            }
          }
        }
        
        return false;
      })
      .slice(0, limit);
  } catch (error) {
    console.error('[data-instantdb] Error fetching buffets near gas stations:', error);
    return [];
  }
}

// ============================================================================
// Hub Page Data Helpers
// ============================================================================

const isDev = process.env.NODE_ENV !== 'production';
const HUB_TIMEOUT_DEV = 3000;
const HUB_TIMEOUT_PROD = 8000;

/**
 * Debug info structure for hub pages
 */
export interface HubDebugInfo {
  table: string;
  fields: string[];
  sampleKeys?: string[];
  rawCounts?: { cities: number; buffets: number };
  error?: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Helper to wrap hub queries with timeout
 */
async function withHubTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<{ result: T; durationMs: number; timedOut: boolean; error?: string }> {
  const timeout = isDev ? HUB_TIMEOUT_DEV : HUB_TIMEOUT_PROD;
  const start = Date.now();
  
  let timeoutId: NodeJS.Timeout | null = null;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${timeout}ms`));
    }, timeout);
  });
  
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    
    const durationMs = Date.now() - start;
    if (isDev) {
      console.log(`[Hub] ${label}: ${durationMs}ms`);
    }
    
    return { result, durationMs, timedOut: false };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const durationMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.startsWith('TIMEOUT:')) {
      console.warn(`[Hub] ${label}: TIMED OUT after ${durationMs}ms`);
      return { result: fallback, durationMs, timedOut: true, error: errorMsg };
    }
    
    console.error(`[Hub] ${label}: ERROR after ${durationMs}ms`, error);
    return { result: fallback, durationMs, timedOut: false, error: errorMsg };
  }
}

/**
 * Get all states with buffet counts and city counts for the states index page.
 * Returns states sorted by buffet count (descending).
 */
export async function getAllStatesWithCounts(): Promise<{
  states: Array<{
    stateAbbr: string;
    stateName: string;
    buffetCount: number;
    cityCount: number;
  }>;
  debug: HubDebugInfo;
}> {
  const start = Date.now();
  
  const { result: buffetsByState, durationMs, timedOut, error } = await withHubTimeout(
    'getAllStatesWithCounts',
    async () => {
      const data = await getBuffetsByState();
      return data;
    },
    {} as Record<string, any>
  );
  
  // Get raw counts for debug info
  let rawCounts = { cities: 0, buffets: 0 };
  try {
    const cached = requestCache;
    if (cached) {
      rawCounts = {
        cities: cached.cities?.length || 0,
        buffets: cached.buffets?.length || 0,
      };
    }
  } catch (e) {
    // ignore
  }
  
  const states = Object.entries(buffetsByState)
    .map(([stateAbbr, data]: [string, any]) => ({
      stateAbbr,
      stateName: STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr,
      buffetCount: data.buffets?.length || 0,
      cityCount: data.cities?.length || 0,
    }))
    .filter(s => s.buffetCount > 0)
    .sort((a, b) => b.buffetCount - a.buffetCount);

  if (isDev) {
    console.log(`[Hub] getAllStatesWithCounts: ${states.length} states, raw: ${rawCounts.buffets} buffets`);
  }

  return {
    states,
    debug: {
      table: 'buffets (grouped by stateAbbr)',
      fields: ['stateAbbr', 'state', 'city.slug', 'city.city'],
      sampleKeys: Object.keys(buffetsByState).slice(0, 5),
      rawCounts,
      error,
      durationMs,
      timedOut,
    },
  };
}

/**
 * Get all cities with buffet counts for the cities index page.
 * Returns cities sorted by buffet count (descending).
 */
export async function getAllCitiesWithCounts(): Promise<{
  cities: Array<{
    slug: string;
    city: string;
    state: string;
    stateAbbr: string;
    buffetCount: number;
  }>;
  debug: HubDebugInfo;
}> {
  const start = Date.now();
  
  const { result: buffetsByCity, durationMs, timedOut, error } = await withHubTimeout(
    'getAllCitiesWithCounts',
    async () => {
      const data = await getBuffetsByCity();
      return data;
    },
    {} as Record<string, any>
  );
  
  // Get raw counts for debug info
  let rawCounts = { cities: 0, buffets: 0 };
  try {
    const cached = requestCache;
    if (cached) {
      rawCounts = {
        cities: cached.cities?.length || 0,
        buffets: cached.buffets?.length || 0,
      };
    }
  } catch (e) {
    // ignore
  }
  
  const cities = Object.entries(buffetsByCity)
    .map(([slug, data]: [string, any]) => ({
      slug,
      city: data.city || '',
      state: data.state || '',
      stateAbbr: data.stateAbbr || '',
      buffetCount: data.buffets?.length || 0,
    }))
    .filter(c => c.buffetCount > 0 && c.city)
    .sort((a, b) => b.buffetCount - a.buffetCount);

  if (isDev) {
    console.log(`[Hub] getAllCitiesWithCounts: ${cities.length} cities, raw: ${rawCounts.buffets} buffets`);
  }

  return {
    cities,
    debug: {
      table: 'buffets (grouped by city.slug)',
      fields: ['city.slug', 'city.city', 'city.state', 'city.stateAbbr'],
      sampleKeys: Object.keys(buffetsByCity).slice(0, 5),
      rawCounts,
      error,
      durationMs,
      timedOut,
    },
  };
}

/**
 * Get neighborhoods for a city with buffet counts for the neighborhoods index page.
 * Returns neighborhoods sorted by buffet count (descending).
 */
export async function getCityNeighborhoodsWithCounts(citySlug: string): Promise<{
  cityName: string;
  stateAbbr: string;
  state: string;
  neighborhoods: Array<{
    neighborhood: string;
    slug: string;
    buffetCount: number;
  }>;
  debug: HubDebugInfo;
} | null> {
  const start = Date.now();
  
  const { result: city, durationMs, timedOut, error } = await withHubTimeout(
    `getCityNeighborhoodsWithCounts(${citySlug})`,
    async () => {
      const data = await getCityBySlug(citySlug);
      return data;
    },
    null
  );
  
  if (!city) {
    return null;
  }
  
  const neighborhoods = buildNeighborhoodsFromBuffets(
    city.buffets || [],
    citySlug,
    city.city,
    city.stateAbbr
  );
  
  const filteredNeighborhoods = neighborhoods
    .filter((n: any) => n.neighborhood && n.buffetCount > 0)
    .sort((a: any, b: any) => b.buffetCount - a.buffetCount);

  if (isDev) {
    console.log(`[Hub] getCityNeighborhoodsWithCounts(${citySlug}): ${filteredNeighborhoods.length} neighborhoods from ${city.buffets?.length || 0} buffets`);
  }
  
  return {
    cityName: city.city,
    stateAbbr: city.stateAbbr,
    state: city.state,
    neighborhoods: filteredNeighborhoods,
    debug: {
      table: 'buffets (filtered by city, grouped by neighborhood)',
      fields: ['neighborhood', 'citySlug', 'cityName', 'stateAbbr'],
      sampleKeys: filteredNeighborhoods.slice(0, 5).map((n: any) => n.neighborhood),
      rawCounts: { cities: 1, buffets: city.buffets?.length || 0 },
      error,
      durationMs,
      timedOut,
    },
  };
}
