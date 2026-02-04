/**
 * Search API Route
 * 
 * IMPORTANT: This endpoint is cacheable. Do NOT add user-specific data.
 * 
 * ## Architecture
 * 
 * Caching layers (fastest to slowest):
 * 1. Client-side: SearchBar maintains in-memory LRU cache (60s TTL)
 * 2. Server-side: In-memory response cache per serverless instance (60s TTL)
 * 3. CDN (Vercel Edge): Cache-Control headers enable s-maxage caching
 * 
 * ## Performance Budget
 * - Target: < 200ms for cached, < 500ms for uncached
 * - Warning threshold: 800ms (logged in dev)
 * 
 * ## What NOT to do
 * - Do NOT read cookies or session data
 * - Do NOT add personalization (breaks CDN caching)
 * - Do NOT use `cache: "no-store"` in client fetches
 * - Do NOT add Vary headers for user-specific data
 */

import { NextRequest, NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import type { SearchResponse, SearchResult, SearchCityResult } from '@/lib/searchTypes';

const MAX_CITIES = 5; // Limit cities in results

export const runtime = 'nodejs';

const PERF_WARNING_THRESHOLD_MS = 800;
let hasWarnedSlowSearch = false;

let cachedDb: ReturnType<typeof init> | null = null;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;
const responseCache = new Map<string, { ts: number; data: SearchResponse }>();

function getAdminDb() {
  if (cachedDb) return cachedDb;

  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required for server-side search');
  }

  cachedDb = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });

  return cachedDb;
}

type RawImage = { photoReference?: string; widthPx?: number; heightPx?: number } | string;

function parseImages(raw: unknown): RawImage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as RawImage[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RawImage[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildThumbUrl(images: RawImage[]): string | null {
  const first = images[0];
  if (!first) return null;
  if (typeof first === 'string') {
    if (first.startsWith('places/')) {
      return `/api/photo?photoReference=${encodeURIComponent(first)}&w=400`;
    }
    return null;
  }
  if (first.photoReference && first.photoReference.startsWith('places/')) {
    return `/api/photo?photoReference=${encodeURIComponent(first.photoReference)}&w=400`;
  }
  return null;
}

function clampLimit(rawLimit: string | null): number {
  if (!rawLimit) return 8;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return Math.min(parsed, 12);
}

function normalizeForIndex(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCachedResponse(cacheKey: string): SearchResponse | null {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }
  responseCache.delete(cacheKey);
  responseCache.set(cacheKey, entry);
  return entry.data;
}

function setCachedResponse(cacheKey: string, data: SearchResponse) {
  responseCache.set(cacheKey, { ts: Date.now(), data });
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = responseCache.keys().next().value as string | undefined;
  if (oldestKey) responseCache.delete(oldestKey);
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('q') || '';
  const trimmedQuery = rawQuery.trim().slice(0, 80);
  const limit = clampLimit(searchParams.get('limit'));
  const citySlug = searchParams.get('citySlug') || null;
  const normalizedQuery = normalizeForIndex(trimmedQuery);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[search] q=', trimmedQuery, 'qn=', normalizedQuery);
  }

  if (normalizedQuery.length < 2) {
    const tookMs = Date.now() - start;
    const response: SearchResponse = { q: normalizedQuery, tookMs, results: [], cities: [] };
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[search-api] q=${trimmedQuery} normalized=${normalizedQuery} candidates=0 deduped=0 returned=0 cacheHit=false tookMs=${tookMs}`
      );
    }
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  }

  const cacheKey = `${normalizedQuery}:${limit}:${citySlug || ''}`;
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[search-api] q=${trimmedQuery} normalized=${normalizedQuery} candidates=0 deduped=0 returned=${cached.results.length} cacheHit=true tookMs=${Date.now() - start}`
      );
    }
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  }

  const db = getAdminDb();

  try {
    const queryStart = Date.now();
    const fetchLimit = Math.min(limit * 5, 50);
    const useContains = normalizedQuery.length >= 3;
    const pattern = useContains ? `%${normalizedQuery}%` : `${normalizedQuery}%`;
    const [buffetResult, cityResult] = await Promise.all([
      db.query({
        buffets: {
          $: {
            where: {
              searchName: { $like: pattern },
            },
            limit: fetchLimit,
          },
          city: {},
        },
      }),
      db.query({
        cities: {
          $: {
            where: {
              city: { $ilike: pattern },
            },
            limit: useContains ? 100 : MAX_CITIES * 3,
          },
        },
      }),
    ]);
    const queryMs = Date.now() - queryStart;

    if (process.env.NODE_ENV !== 'production') {
      const raw = (cityResult.cities || []).slice(0, 20).map((c: any) => ({
        city: c.city,
        stateAbbr: c.stateAbbr,
        slug: c.slug,
        population: c.population,
        rank: c.rank,
        searchName: c.searchName,
      }));
      console.log('[debug-city-raw]', {
        qn: normalizedQuery,
        pattern,
        count: cityResult.cities?.length ?? 0,
        raw,
      });
    }

    let cityRows: any[] = cityResult.cities || [];
    let buffetRows: any[] = buffetResult.buffets || [];

    // Fallback: if searchName query returned nothing, try fetching and filtering in-memory
    // This handles cases where searchName isn't populated in the DB
    if (cityRows.length === 0 || buffetRows.length === 0) {
      const needsCityFallback = cityRows.length === 0;
      const needsBuffetFallback = buffetRows.length === 0;
      
      const fallbackPromises: Promise<any>[] = [];
      if (needsCityFallback) {
        fallbackPromises.push(db.query({ cities: { $: { limit: 100 } } }));
      }
      if (needsBuffetFallback) {
        fallbackPromises.push(db.query({ buffets: { $: { limit: 100 }, city: {} } }));
      }
      
      const fallbackResults = await Promise.all(fallbackPromises);
      let fallbackIdx = 0;
      
      if (needsCityFallback) {
        const fallbackCities = fallbackResults[fallbackIdx++];
        cityRows = (fallbackCities.cities || []).filter((city: any) => {
          const citySearch = normalizeForIndex(`${city.city || ''} ${city.stateAbbr || ''}`);
          return citySearch.startsWith(normalizedQuery);
        });
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[search] city fallback: found ${cityRows.length} matches`);
        }
      }
      if (needsBuffetFallback) {
        const fallbackBuffets = fallbackResults[fallbackIdx++];
        buffetRows = (fallbackBuffets.buffets || []).filter((buffet: any) => {
          const buffetSearch = normalizeForIndex(buffet.name || '');
          return buffetSearch.startsWith(normalizedQuery);
        });
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[search] buffet fallback: found ${buffetRows.length} matches`);
        }
      }
    }

    const qn = normalizedQuery;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[search-match]', {
        qn,
        useContains,
        pattern,
        citiesCandidates: cityResult.cities?.length ?? 0,
        buffetsCandidates: buffetResult.buffets?.length ?? 0,
      });
    }
    const cityCandidates = cityRows.map((city: any) => ({
      id: city.id,
      city: city.city || '',
      stateAbbr: city.stateAbbr || '',
      slug: city.slug || '',
      population: typeof city.population === 'number' ? city.population : 0,
      rank: typeof city.rank === 'number' ? city.rank : 9999,
      searchName: city.searchName || '',
    }));

    cityCandidates.sort(
      (a: any, b: any) =>
        (b.population || 0) - (a.population || 0) || a.city.localeCompare(b.city)
    );

    // Score and sort cities
    const scoredCities = cityCandidates.map((city: any) => {
      let score = 0;
      // Use searchName if available, otherwise compute it
      const searchName = city.searchName || normalizeForIndex(`${city.city} ${city.stateAbbr}`);
      const tokens = searchName.split(' ').filter(Boolean);

      if (searchName === qn) {
        score += 100;
      } else if (searchName.startsWith(qn)) {
        score += 80;
      } else if (tokens.some((token: string) => token.startsWith(qn))) {
        score += 60;
      } else if (useContains && searchName.includes(qn)) {
        score += 30;
      }
      
      // Boost by rank (lower rank = more important city)
      score += Math.max(0, 10 - city.rank / 100);
      
      // Boost by population (higher = more relevant)
      score += Math.min(city.population / 100000, 10);
      score += Math.min((city.population || 0) / 1_000_000, 25);
      
      return { city, score };
    });

    const minCityScore = useContains ? 30 : 60;
    // Filter to only cities that match
    const cities: SearchCityResult[] = scoredCities
      .filter((s: any) => s.score >= minCityScore)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, MAX_CITIES)
      .map(({ city }: any) => ({
        id: city.id,
        city: city.city,
        stateAbbr: city.stateAbbr,
        slug: city.slug,
        population: city.population,
      }));
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[city-rank-debug]',
        qn,
        cities.slice(0, 5).map((c) => `${c.city},${c.stateAbbr}:${c.population}`)
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[search-debug2] qn=',
        normalizedQuery,
        'pattern=',
        pattern,
        'cities=',
        cityResult.cities?.length ?? 0,
        'buffets=',
        buffetResult.buffets?.length ?? 0
      );
    }

    // Process buffets (existing logic)
    const candidates: SearchResult[] = buffetRows
      .filter((buffet: any) => buffet?.id && buffet?.name && buffet?.slug)
      .map((buffet: any) => {
        const images = parseImages(buffet.images || buffet.imageUrls);
        return {
          id: buffet.id,
          name: buffet.name || '',
          slug: buffet.slug || '',
          city: buffet.city?.city || buffet.cityName || '',
          state: buffet.city?.stateAbbr || buffet.stateAbbr || buffet.state || '',
          neighborhood: buffet.neighborhood || null,
          rating: typeof buffet.rating === 'number' ? buffet.rating : null,
          reviewCount:
            typeof buffet.reviewCount === 'number'
              ? buffet.reviewCount
              : typeof buffet.reviewsCount === 'number'
                ? buffet.reviewsCount
                : null,
          thumbUrl: buildThumbUrl(images),
          citySlug: buffet.city?.slug || null,
        };
      })
      .slice(0, fetchLimit);

    const dedupedMap = new Map<string, { candidate: SearchResult; score: number }>();

    const scoreCandidate = (candidate: SearchResult) => {
      const searchName = normalizeForIndex(candidate.name);
      const tokens = searchName.split(' ').filter(Boolean);
      let score = 0;

      if (searchName === qn) {
        score += 100;
      } else if (searchName.startsWith(qn)) {
        score += 80;
      } else if (qn.length > 0 && tokens.some((token) => token.startsWith(qn))) {
        score += 60;
      } else if (useContains && searchName.includes(qn)) {
        score += 30;
      }

      if (citySlug && candidate.citySlug === citySlug) {
        score += 25;
      }

      const reviewCount = candidate.reviewCount ?? 0;
      score += Math.min(reviewCount, 2000) / 200;

      const rating = candidate.rating ?? 0;
      score += rating * 2;

      if (!candidate.citySlug) {
        score -= 10;
      }

      return score;
    };

    for (const candidate of candidates) {
      const nameLower = candidate.name.toLowerCase();
      const cityKey = candidate.citySlug
        ? candidate.citySlug.toLowerCase()
        : `${(candidate.city || '').toLowerCase()}|${(candidate.state || '').toLowerCase()}`;
      const dedupeKey = `${nameLower}|${cityKey}`;
      const score = scoreCandidate(candidate);

      const existing = dedupedMap.get(dedupeKey);
      if (!existing || score > existing.score) {
        dedupedMap.set(dedupeKey, { candidate, score });
      }
    }

    const deduped = Array.from(dedupedMap.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const reviewA = a.candidate.reviewCount ?? 0;
        const reviewB = b.candidate.reviewCount ?? 0;
        if (reviewB !== reviewA) return reviewB - reviewA;
        return a.candidate.name.localeCompare(b.candidate.name);
      })
      .map((entry) => entry.candidate)
      .slice(0, limit);

    const tookMs = Date.now() - start;
    const response: SearchResponse = { q: normalizedQuery, tookMs, results: deduped, cities };
    setCachedResponse(cacheKey, response);
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[search-api] q=${trimmedQuery} normalized=${normalizedQuery} buffets=${deduped.length} cities=${cities.length} cacheHit=false tookMs=${tookMs} queryMs=${queryMs}`
      );
      // Performance warning (once per session)
      if (tookMs > PERF_WARNING_THRESHOLD_MS && !hasWarnedSlowSearch) {
        hasWarnedSlowSearch = true;
        console.warn(
          `[search-api] ⚠️ SLOW SEARCH: ${tookMs}ms exceeds ${PERF_WARNING_THRESHOLD_MS}ms threshold. Check DB query or network.`
        );
      }
    }
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[search-api] error', error);
    const tookMs = Date.now() - start;
    const response: SearchResponse = { q: normalizedQuery, tookMs, results: [], cities: [] };
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[search-api] q=${trimmedQuery} normalized=${normalizedQuery} cacheHit=false tookMs=${tookMs} resultCount=0`
      );
    }
    return NextResponse.json(response, {
      status: 500,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  }
}
