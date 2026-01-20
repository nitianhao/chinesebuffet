// Data loading utilities using InstantDB Admin API
// This allows server-side rendering while reading directly from InstantDB

import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import rules from '@/src/instant.perms';

// Re-export types for convenience
export type { Review, Buffet, City, BuffetsByCity, BuffetsById, Summary } from '@/lib/data';

// Initialize admin client (server-side only)
// OPTIMIZATION: Cache the database connection to avoid re-initialization overhead
let cachedDb: ReturnType<typeof init> | null = null;

function getAdminDb() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:12',message:'getAdminDb entry',data:{hasCachedDb:!!cachedDb,hasAdminToken:!!process.env.INSTANT_ADMIN_TOKEN,hasAppId:!!(process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID)},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  
  // OPTIMIZATION: Reuse cached connection
  if (cachedDb) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getAdminDb',message:'getAdminDb using cached connection',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return cachedDb;
  }
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:15',message:'getAdminDb missing token error',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:30',message:'getAdminDb init new connection',data:{dbInitDurationMs:dbInitDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return cachedDb;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:30',message:'getAdminDb init error',data:{errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
    imageUrls: parseJsonField(buffet.imageUrls) || [],
    images: parseJsonField(buffet.images) || [], // Array of photo objects with photoUrl
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

async function getCachedData() {
  const startTime = Date.now();
  const now = Date.now();
  if (requestCache && requestCache.timestamp && (now - requestCache.timestamp) < CACHE_TTL) {
    console.log(`[data-instantdb] Using cached data: ${requestCache.cities?.length || 0} cities, ${requestCache.buffets?.length || 0} buffets`);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:128',message:'getCachedData using cache',data:{citiesCount:requestCache.cities?.length,buffetsCount:requestCache.buffets?.length,durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'P'})}).catch(()=>{});
    // #endregion
    return requestCache;
  }

  if (requestCachePromise) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getCachedData',message:'awaiting in-flight cache promise',data:{timestamp:requestCachePromise ? true : false},timestamp:Date.now(),sessionId:'debug-session',runId:'perf1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    return requestCachePromise;
  }

  const db = getAdminDb();
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:135',message:'getCachedData fetching from DB',data:{hasAdminToken:!!process.env.INSTANT_ADMIN_TOKEN},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  requestCachePromise = (async () => {
    try {
    // Fetch all cities
    console.log('[data-instantdb] Fetching cities...');
    const citiesQueryStart = Date.now();
    const citiesResult = await db.query({ cities: {} });
    const citiesQueryDuration = Date.now() - citiesQueryStart;
    const cities = citiesResult.cities || [];
    console.log(`[data-instantdb] Fetched ${cities.length} cities`);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:281',message:'getCachedData cities query complete',data:{citiesCount:cities.length,citiesQueryDurationMs:citiesQueryDuration,sampleCitySlugs:cities.slice(0,3).map((c:any)=>c.slug)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    // Fetch all buffets with city links
    // Try multiple query approaches to ensure we get all records
    console.log('[data-instantdb] Fetching buffets...');
    
    // OPTIMIZATION: Use explicit limit and ordering for better performance
    // Fetch all buffets with city links in a single optimized query
    let buffetsResult;
    const buffetsQueryStart = Date.now();
    try {
      buffetsResult = await db.query({
        buffets: {
          $: {
            limit: 10000, // Explicit limit for performance
            // No order needed for cache - will sort later if needed
          },
          city: {}
        }
      });
      const buffetsQueryDuration = Date.now() - buffetsQueryStart;
      console.log(`[data-instantdb] Buffets query returned ${buffetsResult.buffets?.length || 0} buffets in ${buffetsQueryDuration}ms`);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:296',message:'getCachedData buffets query complete (optimized)',data:{buffetsCount:buffetsResult.buffets?.length || 0,buffetsQueryDurationMs:buffetsQueryDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
    } catch (e) {
      console.error('[data-instantdb] Error with buffets query:', e);
      buffetsResult = { buffets: [] };
    }
    
    const buffets = buffetsResult.buffets || [];
    
    // Log detailed info
    console.log(`[data-instantdb] Final result: ${cities.length} cities and ${buffets.length} buffets`);
    if (buffets.length > 0) {
      console.log(`[data-instantdb] Sample buffet IDs: ${buffets.slice(0, 3).map((b: any) => b.id).join(', ')}`);
      console.log(`[data-instantdb] Buffets with city links: ${buffets.filter((b: any) => b.city).length}`);
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:187',message:'getCachedData final result',data:{citiesCount:cities.length,buffetsCount:buffets.length,buffetsWithCityLinks:buffets.filter((b:any)=>b.city).length,durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'P'})}).catch(()=>{});
    // #endregion

    requestCache = {
      cities,
      buffets,
      timestamp: now,
    };

    return requestCache;
  } catch (error) {
    console.error('[data-instantdb] Error fetching data:', error);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:201',message:'getCachedData error',data:{errorMessage:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:365',message:'getBuffetsByCity entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  
  const getCachedDataStart = Date.now();
  const { cities, buffets } = await getCachedData();
  const getCachedDataDuration = Date.now() - getCachedDataStart;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:370',message:'getBuffetsByCity after getCachedData',data:{citiesCount:cities.length,buffetsCount:buffets.length,getCachedDataDurationMs:getCachedDataDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:420',message:'getBuffetsByCity return',data:{totalCities:Object.keys(buffetsByCity).length,buffetsWithoutCity,transformDurationMs:transformDuration,sortDurationMs:sortDuration,totalDurationMs:totalDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:188',message:'getCityBySlug entry',data:{citySlug},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'P'})}).catch(()=>{});
  // #endregion

  try {
    const db = getAdminDb();
    const result = await db.query({
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          city: {}
        }
      }
    });

    const cityRaw = result.cities?.[0];
    if (!cityRaw) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:205',message:'getCityBySlug city not found',data:{citySlug},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'P'})}).catch(()=>{});
      // #endregion
      return null;
    }

    const buffetsRaw = cityRaw.buffets || [];
    const buffets = buffetsRaw.map((b: any) => transformBuffet({ ...b, city: { slug: citySlug } }, citySlug));
    const city = transformCity(cityRaw, buffets);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:214',message:'getCityBySlug return',data:{found:true,cityName:city.city,buffetsCount:city.buffets.length,durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'P'})}).catch(()=>{});
    // #endregion

    return city;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:220',message:'getCityBySlug error',data:{citySlug,errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'P'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

// Fetch reviews for a specific buffet from the reviews table
export async function getReviewsForBuffet(buffetId: string): Promise<any[]> {
  try {
    const db = getAdminDb();
    // Query the buffet with its linked reviews
    const result = await db.query({
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
    const result = await db.query({
      menus: {
        $: {
          where: { placeId: placeId },
          order: [{ field: 'scrapedAt', direction: 'desc' }]
        }
      }
    });
    
    const menu = result.menus?.[0];
    if (!menu) return null;
    
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
      errorMessage: menu.errorMessage
    };
  } catch (error) {
    console.error('[data-instantdb] Error fetching menu for buffet:', error);
    return null;
  }
}

// Lightweight function to get buffet data - minimal query, minimal transformation
export async function getBuffetNameBySlug(citySlug: string, buffetSlug: string): Promise<{ 
  name: string; 
  categories: string[]; 
  address: string; 
  description?: string; 
  images: string[]; 
  imageCount: number; 
  imageCategories: string[]; 
  hours?: any; 
  contactInfo?: { menuUrl?: string; orderBy?: any; phone?: string }; 
  price?: string; 
  rating?: number; 
  reviews?: any[];
  reviewsCount?: number;
  reviewsDistribution?: { [key: string]: number };
  reviewsTags?: Array<{ title: string; count?: number }>;
  webResults?: Array<{ title: string; displayedUrl?: string; url: string; description?: string }>;
  accessibility?: any; // Parsed accessibility data from structuredData table
  amenities?: any; // Parsed amenities data from structuredData table
} | null> {
  const db = getAdminDb();
  
  try {
    // Query the buffet with structuredData link - fetch all structuredData to filter by group in code
    const result = await db.query({
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
      const reviewsResult = await db.query({
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
    const imageUrls: string[] = [];
    
    // First, try to get photos from Yelp data (these are publicly accessible)
    if (buffet.yelpData) {
      let yelpData: any = null;
      if (typeof buffet.yelpData === 'string') {
        try {
          yelpData = JSON.parse(buffet.yelpData);
          console.log('[getBuffetNameBySlug] Parsed yelpData:', {
            hasDetails: !!yelpData?.details,
            hasPhotos: !!yelpData?.details?.photos,
            photosLength: Array.isArray(yelpData?.details?.photos) ? yelpData.details.photos.length : 0,
            yelpDataKeys: yelpData ? Object.keys(yelpData) : [],
          });
        } catch (e) {
          console.error('[getBuffetNameBySlug] Failed to parse yelpData:', e);
        }
      } else if (typeof buffet.yelpData === 'object') {
        yelpData = buffet.yelpData;
        console.log('[getBuffetNameBySlug] yelpData is object:', {
          hasDetails: !!yelpData?.details,
          hasPhotos: !!yelpData?.details?.photos,
          photosLength: Array.isArray(yelpData?.details?.photos) ? yelpData.details.photos.length : 0,
        });
      }
      
      // Extract photos from Yelp data - check multiple possible paths
      let yelpPhotos: any[] = [];
      
      if (yelpData) {
        // Try yelpData.details.photos
        if (yelpData.details && Array.isArray(yelpData.details.photos)) {
          yelpPhotos = yelpData.details.photos;
        }
        // Try yelpData.photos
        else if (Array.isArray(yelpData.photos)) {
          yelpPhotos = yelpData.photos;
        }
        
        yelpPhotos.forEach((url: any) => {
          if (typeof url === 'string' && url.includes('yelpcdn.com')) {
            imageUrls.push(url);
          }
        });
        
        console.log('[getBuffetNameBySlug] Yelp photos found:', yelpPhotos.length, 'added:', imageUrls.length);
      }
    }
    
    // If no Yelp photos, fall back to images field (Google Places URLs)
    if (imageUrls.length === 0 && buffet.images) {
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
      
      // Images can be either strings (URLs) or objects with photoUrl
      parsedImages.forEach((img: any) => {
        if (typeof img === 'string') {
          imageUrls.push(img);
        } else if (img && typeof img === 'object' && img.photoUrl) {
          imageUrls.push(img.photoUrl);
        }
      });
    }
    
    // Get imageCount (use imagesCount field or actual count of images)
    const imageCount = buffet.imagesCount || imageUrls.length;
    
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
      imageUrlsExtracted: imageUrls.length,
      imageCount,
      imagesCountField: buffet.imagesCount,
      hasImagesField: !!buffet.images,
      imagesFieldType: typeof buffet.images,
      firstImageUrl: imageUrls[0] || 'none',
    });
    
    // Collect contact info
    const contactInfo: { menuUrl?: string; orderBy?: any; phone?: string } = {};
    
    // Check for menuUrl in various places
    if (buffet.menuUrl) {
      contactInfo.menuUrl = buffet.menuUrl;
    } else if (buffet.menu) {
      // Try to extract menuUrl from menu JSON
      const menuData = parseJsonField(buffet.menu);
      if (menuData) {
        // Check multiple possible field names for menu URL
        contactInfo.menuUrl = menuData.sourceUrl || menuData.menuUrl || menuData.url || menuData.link;
      }
    }
    
    // Also check if there's a general URL field that might be a menu
    if (!contactInfo.menuUrl && buffet.url) {
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
      categories: string[]; 
      address: string; 
      description?: string; 
      images: string[]; 
      imageCount: number; 
      imageCategories: string[]; 
      hours?: any; 
      contactInfo?: { menuUrl?: string; orderBy?: any; phone?: string }; 
      price?: string; 
      rating?: number; 
      reviews?: any[];
      reviewsCount?: number;
      reviewsDistribution?: { [key: string]: number };
      reviewsTags?: Array<{ title: string; count?: number }>;
      webResults?: Array<{ title: string; displayedUrl?: string; url: string; description?: string }>;
      accessibility?: any;
      amenities?: any;
    } = { 
      name: buffet.name || '',
      categories: categories || [],
      address: address || '',
      images: imageUrls,
      imageCount: imageCount,
      imageCategories: imageCategories
    };
    
    // Only include description if it exists
    if (buffet.description) {
      buffetData.description = buffet.description;
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
    if (accessibility) {
      buffetData.accessibility = accessibility;
    }
    if (amenities) {
      buffetData.amenities = amenities;
    }
    
    // Only include hours if any hours data exists
    if (Object.keys(hoursData).length > 0) {
      buffetData.hours = hoursData;
    }
    
    // Only include contactInfo if any contact info exists
    if (Object.keys(contactInfo).length > 0) {
      buffetData.contactInfo = contactInfo;
    }
    
    return buffetData;
  } catch (e) {
    console.error('[data-instantdb] getBuffetNameBySlug error:', e);
    return null;
  }
}

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
      
      const result = await db.query(query);
      const queryDuration = Date.now() - queryStart;
      
      const buffetRaw = result.cities?.[0]?.buffets?.[0];
      if (!buffetRaw) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getBuffetBySlug',message:'getBuffetBySlug not found',data:{citySlug,buffetSlug,queryDurationMs:queryDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
        return null;
      }
      
      const transformedBuffet = transformBuffet(buffetRaw, citySlug, buffetRaw.reviewRecords);
      
      // OPTIMIZATION: Fetch menu in parallel if needed (could be optimized further with link relationship)
      if (includeMenu && transformedBuffet.placeId) {
        const menuStart = Date.now();
        const menu = await getMenuForBuffet(transformedBuffet.placeId);
        const menuDuration = Date.now() - menuStart;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getBuffetBySlug',message:'getBuffetBySlug menu fetch',data:{menuFound:!!menu,menuDurationMs:menuDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H7'})}).catch(()=>{});
        // #endregion
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
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getBuffetBySlug',message:'getBuffetBySlug success (optimized)',data:{citySlug,buffetSlug,includeReviews,includeMenu,queryDurationMs:queryDuration,hasReviews:!!transformedBuffet.reviews?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H7'})}).catch(()=>{});
      // #endregion
      
      return transformedBuffet;
    } catch (error) {
      console.error('[data-instantdb] Error fetching buffet with links:', error);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getBuffetBySlug',message:'getBuffetBySlug error',data:{errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'perf-opt',hypothesisId:'H7'})}).catch(()=>{});
      // #endregion
      // Fallback to regular fetch
    }
  }
  
  // OPTIMIZATION: For non-linked queries, use direct query instead of full city fetch
  try {
    const db = getAdminDb();
    const result = await db.query({
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:buildNeighborhoodsFromBuffets',message:'buildNeighborhoodsFromBuffets entry',data:{buffetsCount:buffets?.length || 0,citySlug},timestamp:Date.now(),sessionId:'debug-session',runId:'perf1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

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

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:buildNeighborhoodsFromBuffets',message:'buildNeighborhoodsFromBuffets exit',data:{neighborhoodCount:Object.keys(neighborhoods).length,durationMs:Date.now()-startTime,citySlug},timestamp:Date.now(),sessionId:'debug-session',runId:'perf1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
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
export async function searchAll(query: string, limit: number = 20): Promise<Array<{ type: 'city' | 'buffet'; slug: string; name: string; citySlug?: string }>> {
  // Search functionality temporarily disabled - will be re-added later
  return [];
}

// Lightweight function to get first few buffets for homepage - no cache, direct minimal query
export async function getSampleBuffets(count: number = 2): Promise<any[]> {
  const db = getAdminDb();
  
  try {
    const result = await db.query({
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:758',message:'getSummary using shared cache',data:{citiesCount:cities.length,buffetsCount:buffets.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:799',message:'getSummary return (using shared cache)',data:{totalCities:cities.length,totalBuffets,citiesWithBuffets,totalDurationMs:totalDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  return {
    totalCities: cities.length,
    totalBuffets: totalBuffets,
    citiesWithBuffets: citiesWithBuffets,
    cities: citiesList,
  };
}

// Lightweight function to get just state counts - uses shared cache
export async function getStateCounts(): Promise<Record<string, number>> {
  const functionStartTime = Date.now();
  // Use shared cache to avoid duplicate queries - counts from already-fetched buffets
  const { buffets } = await getCachedData();
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:827',message:'getStateCounts using shared cache',data:{buffetsCount:buffets.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  const stateCounts: Record<string, number> = {};
  
  // Count buffets per state without transformation
  buffets.forEach((buffet: any) => {
    const stateAbbr = buffet.stateAbbr || '';
    if (!stateAbbr) return;
    stateCounts[stateAbbr] = (stateCounts[stateAbbr] || 0) + 1;
  });
  
  const totalDuration = Date.now() - functionStartTime;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:843',message:'getStateCounts return',data:{statesCount:Object.keys(stateCounts).length,totalDurationMs:totalDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  return stateCounts;
}

// State-level functions
export async function getBuffetsByState(): Promise<Record<string, any>> {
  const functionStartTime = Date.now();
  const getCachedDataStart = Date.now();
  const { cities, buffets } = await getCachedData();
  const getCachedDataDuration = Date.now() - getCachedDataStart;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:777',message:'getBuffetsByState after getCachedData',data:{citiesCount:cities.length,buffetsCount:buffets.length,getCachedDataDurationMs:getCachedDataDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:810',message:'getBuffetsByState return',data:{statesCount:Object.keys(buffetsByState).length,transformDurationMs:transformDuration,sortDurationMs:sortDuration,totalDurationMs:totalDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  
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





