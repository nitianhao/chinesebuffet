// Data loading utilities using InstantDB Admin API
// This allows server-side rendering while reading directly from InstantDB

import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import rules from '@/src/instant.perms';

// Re-export types for convenience
export type { Review, Buffet, City, BuffetsByCity, BuffetsById, Summary } from '@/lib/data';

// Initialize admin client (server-side only)
function getAdminDb() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:12',message:'getAdminDb entry',data:{hasAdminToken:!!process.env.INSTANT_ADMIN_TOKEN,hasAppId:!!(process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:15',message:'getAdminDb missing token error',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    throw new Error('INSTANT_ADMIN_TOKEN is required for server-side data fetching');
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:25',message:'getAdminDb init success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    return db;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:30',message:'getAdminDb init error',data:{errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

// Helper to parse JSON fields from InstantDB
function parseJsonField(value: any): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

// Transform InstantDB buffet to our Buffet interface
function transformBuffet(buffet: any, citySlug?: string): any {
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
    neighborhood: buffet.neighborhood || null,
    permanentlyClosed: buffet.permanentlyClosed || false,
    temporarilyClosed: buffet.temporarilyClosed || false,
    placeId: buffet.placeId || null,
    imagesCount: buffet.imagesCount || 0,
    imageUrls: parseJsonField(buffet.imageUrls) || [],
    citySlug: citySlug || buffet.city?.slug || '',
    description: buffet.description || null,
    subTitle: buffet.subTitle || null,
    reviewsDistribution: parseJsonField(buffet.reviewsDistribution) || null,
    reviewsTags: parseJsonField(buffet.reviewsTags) || null,
    popularTimesHistogram: parseJsonField(buffet.popularTimesHistogram) || null,
    popularTimesLiveText: buffet.popularTimesLiveText || null,
    popularTimesLivePercent: buffet.popularTimesLivePercent || null,
    additionalInfo: parseJsonField(buffet.additionalInfo) || null,
    questionsAndAnswers: parseJsonField(buffet.questionsAndAnswers) || null,
    ownerUpdates: parseJsonField(buffet.ownerUpdates) || null,
    reserveTableUrl: buffet.reserveTableUrl || null,
    tableReservationLinks: parseJsonField(buffet.tableReservationLinks) || null,
    googleFoodUrl: buffet.googleFoodUrl || null,
    orderBy: parseJsonField(buffet.orderBy) || null,
    menu: parseJsonField(buffet.menu) || null,
    webResults: parseJsonField(buffet.webResults) || null,
    peopleAlsoSearch: parseJsonField(buffet.peopleAlsoSearch) || null,
    updatesFromCustomers: parseJsonField(buffet.updatesFromCustomers) || null,
    locatedIn: buffet.locatedIn || null,
    plusCode: buffet.plusCode || null,
    what_customers_are_saying_seo: buffet.what_customers_are_saying_seo || null,
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
  console.log('[data-instantdb] Cache cleared');
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
    const citiesResult = await db.query({ cities: {} });
    const cities = citiesResult.cities || [];
    console.log(`[data-instantdb] Fetched ${cities.length} cities`);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:143',message:'getCachedData cities fetched',data:{citiesCount:cities.length,sampleCitySlugs:cities.slice(0,3).map((c:any)=>c.slug)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // Fetch all buffets with city links
    // Try multiple query approaches to ensure we get all records
    console.log('[data-instantdb] Fetching buffets...');
    
    // First, try query without limit to see what we get
    let buffetsResult;
    try {
      buffetsResult = await db.query({
        buffets: {
          city: {}
        }
      });
      console.log(`[data-instantdb] Query without limit returned ${buffetsResult.buffets?.length || 0} buffets`);
    } catch (e) {
      console.error('[data-instantdb] Error with query without limit:', e);
      buffetsResult = { buffets: [] };
    }
    
    let buffets = buffetsResult.buffets || [];
    
    // If we got fewer than expected, try with explicit limit
    if (buffets.length < 100) {
      console.log(`[data-instantdb] Only got ${buffets.length} buffets, trying with explicit limit...`);
      try {
        const buffetsResultWithLimit = await db.query({
          buffets: {
            $: {
              limit: 10000,
            },
            city: {}
          }
        });
        const buffetsWithLimit = buffetsResultWithLimit.buffets || [];
        console.log(`[data-instantdb] Query with limit returned ${buffetsWithLimit.length} buffets`);
        if (buffetsWithLimit.length > buffets.length) {
          buffets = buffetsWithLimit;
        }
      } catch (e) {
        console.error('[data-instantdb] Error with query with limit:', e);
      }
    }
    
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:206',message:'getBuffetsByCity entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  const { cities, buffets } = await getCachedData();
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:210',message:'getBuffetsByCity after getCachedData',data:{citiesCount:cities.length,buffetsCount:buffets.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  const buffetsByCity: Record<string, any> = {};
  let buffetsWithoutCity = 0;
  
  // Initialize cities
  cities.forEach((city: any) => {
    buffetsByCity[city.slug] = transformCity(city, []);
  });
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:218',message:'getBuffetsByCity after init cities',data:{citiesInitialized:Object.keys(buffetsByCity).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  // Add buffets to cities
  buffets.forEach((buffet: any) => {
    const citySlug = buffet.city?.slug;
    if (citySlug && buffetsByCity[citySlug]) {
      buffetsByCity[citySlug].buffets.push(transformBuffet(buffet, citySlug));
    } else {
      buffetsWithoutCity++;
      // If buffet doesn't have a city link, try to match by cityName
      if (buffet.cityName && buffet.stateAbbr) {
        // Try to find city by matching city name and state
        const matchingCity = cities.find((c: any) => 
          c.city.toLowerCase() === buffet.cityName.toLowerCase() && 
          c.stateAbbr === buffet.stateAbbr
        );
        if (matchingCity && buffetsByCity[matchingCity.slug]) {
          buffetsByCity[matchingCity.slug].buffets.push(transformBuffet(buffet, matchingCity.slug));
        }
      }
    }
  });
  
  if (buffetsWithoutCity > 0) {
    console.log(`[data-instantdb] Warning: ${buffetsWithoutCity} buffets without city links`);
  }
  
  // Sort buffets within each city by rating
  Object.values(buffetsByCity).forEach((city: any) => {
    city.buffets.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
  });
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:247',message:'getBuffetsByCity return',data:{totalCities:Object.keys(buffetsByCity).length,buffetsWithoutCity,sampleCitySlugs:Object.keys(buffetsByCity).slice(0,3),sampleCityBuffetsCount:Object.values(buffetsByCity).slice(0,3).map((c:any)=>c.buffets.length)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
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

export async function getBuffetById(buffetId: string): Promise<any | null> {
  const buffetsById = await getBuffetsById();
  return buffetsById[buffetId] || null;
}

export async function getBuffetBySlug(citySlug: string, buffetSlug: string): Promise<any | null> {
  const city = await getCityBySlug(citySlug);
  if (!city) return null;
  
  return city.buffets.find((b: any) => b.slug === buffetSlug) || null;
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

export async function getSampleBuffets(count: number = 100): Promise<any[]> {
  const startTime = Date.now();

  // Prefer cached buffets if available to avoid extra fetch
  if (requestCache?.buffets && requestCache.buffets.length > 0) {
    // Transform buffets before sorting (cache stores raw InstantDB objects)
    const transformed = requestCache.buffets.map((b: any) => transformBuffet(b, b.city?.slug));
    const sorted = transformed.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const result = sorted.slice(0, count);
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getSampleBuffets',message:'getSampleBuffets exit cached',data:{returned:result.length,durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'perf1',hypothesisId:'H2'})}).catch(()=>{});
    return result;
  }

  // If no cache, query a small sample directly to avoid full 5k fetch
  const db = getAdminDb();
  const sampleStart = Date.now();
  let result: any[] = [];
  try {
    const sampleResult = await db.query({
      buffets: {
        $: { limit: count, order: [{ field: 'rating', direction: 'desc' }] },
        city: {},
      },
    });
    result = (sampleResult.buffets || []).map((b: any) => transformBuffet(b, b.city?.slug));
  } catch (e) {
    console.error('[data-instantdb] getSampleBuffets: sample query failed, fallback to all buffets', e);
    const allBuffets = await getAllBuffets();
    const sorted = allBuffets.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    result = sorted.slice(0, count);
  }

  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/data-instantdb.ts:getSampleBuffets',message:'getSampleBuffets exit sample query',data:{returned:result.length,durationMs:Date.now()-sampleStart,totalDurationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',runId:'perf1',hypothesisId:'H2'})}).catch(()=>{});

  return result;
}

export async function getSummary(): Promise<any> {
  const buffetsByCity = await getBuffetsByCity();
  const cities = Object.values(buffetsByCity);
  const citiesWithBuffets = cities.filter((c: any) => c.buffets.length > 0);
  
  const totalBuffets = cities.reduce((sum: number, city: any) => sum + city.buffets.length, 0);
  
  const citiesList = citiesWithBuffets
    .map((city: any) => ({
      slug: city.slug,
      city: city.city,
      state: city.state,
      buffetCount: city.buffets.length,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  console.log(`[data-instantdb] getSummary: ${cities.length} total cities, ${citiesWithBuffets.length} with buffets, ${totalBuffets} total buffets`);
  
  return {
    totalCities: cities.length,
    totalBuffets: totalBuffets,
    citiesWithBuffets: citiesWithBuffets.length,
    cities: citiesList,
  };
}

// State-level functions
export async function getBuffetsByState(): Promise<Record<string, any>> {
  const { cities, buffets } = await getCachedData();
  
  const buffetsByState: Record<string, any> = {};
  
  // Group buffets by state
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
  
  // Convert Sets to arrays and sort
  Object.keys(buffetsByState).forEach(stateAbbr => {
    const stateData = buffetsByState[stateAbbr];
    stateData.cities = Array.from(stateData.cities).sort();
    stateData.buffets.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
  });
  
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



