/**
 * Search Suggestions API Route
 * 
 * IMPORTANT: This endpoint is cacheable. Do NOT add user-specific data.
 * 
 * ## Purpose
 * Returns popular search queries and places to show when search input is empty.
 * Called once on focus, then cached client-side for 1 hour.
 * 
 * ## Caching
 * - Server-side: In-memory cache (1 hour TTL)
 * - CDN: s-maxage=3600 (1 hour), stale-while-revalidate=86400 (24 hours)
 * - Client: Cached in SearchBar for session duration
 * 
 * ## What NOT to do
 * - Do NOT read cookies or session data
 * - Do NOT personalize results (breaks CDN caching)
 * - Do NOT use `cache: "no-store"` in client fetches
 */

import { NextRequest, NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import type { SearchSuggestionsResponse, SearchSuggestionPlace } from '@/lib/searchTypes';
import { createServerTiming } from '@/lib/server-timing';

export const runtime = 'nodejs';

let cachedDb: ReturnType<typeof init> | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const responseCache = new Map<string, { ts: number; data: SearchSuggestionsResponse }>();

const POPULAR_QUERIES = ['panda', 'buffet', 'hibachi', 'dim sum', 'sushi', 'mongolian'];
const SUGGESTION_LIMIT = 6;

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

function getCachedResponse(cacheKey: string): SearchSuggestionsResponse | null {
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

function setCachedResponse(cacheKey: string, data: SearchSuggestionsResponse) {
  responseCache.set(cacheKey, { ts: Date.now(), data });
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = responseCache.keys().next().value as string | undefined;
  if (oldestKey) responseCache.delete(oldestKey);
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming('api/search-suggestions');
  const { searchParams } = new URL(request.url);
  const citySlug = searchParams.get('citySlug') || null;
  const cacheKey = citySlug || 'global';
  const cached = getCachedResponse(cacheKey);

  if (cached) {
    timing.add('cache', 0.1, 'memory');
    timing.add('total', 0.1);
    timing.log();
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Server-Timing': timing.header(),
      },
    });
  }

  let popularPlaces: SearchSuggestionPlace[] = [];

  const start = Date.now();
  try {
    const db = getAdminDb();
    const whereClause = citySlug ? { 'city.slug': citySlug } : undefined;
    const fetchLimit = Math.min(SUGGESTION_LIMIT * 3, 50);

    const result = await timing.time('db.query', () =>
      db.query({
        buffets: {
          $: {
            ...(whereClause ? { where: whereClause } : {}),
            limit: fetchLimit,
            // Sort in JS to avoid DB validation issues with order clause
          },
          city: {},
        },
      })
    );

    const candidates = (result.buffets || [])
      .filter((buffet: any) => buffet?.name && buffet?.slug)
      .map((buffet: any) => ({
        name: buffet.name || '',
        slug: buffet.slug || '',
        city: buffet.city?.city || buffet.cityName || '',
        state: buffet.city?.stateAbbr || buffet.stateAbbr || buffet.state || '',
        citySlug: buffet.city?.slug || null,
        reviewCount: typeof buffet.reviewCount === 'number' ? buffet.reviewCount : 0,
        rating: typeof buffet.rating === 'number' ? buffet.rating : 0,
      }));

    popularPlaces = candidates
      .sort((a, b) => {
        const scoreA = a.reviewCount + a.rating * 100;
        const scoreB = b.reviewCount + b.rating * 100;
        return scoreB - scoreA;
      })
      .slice(0, SUGGESTION_LIMIT)
      .map(({ reviewCount: _reviews, rating: _rating, ...place }) => place);
    timing.add('total', Date.now() - start);
    timing.log();
  } catch (err) {
    console.error('[search-suggestions] failed', err);
    popularPlaces = [];
    timing.add('error', Date.now() - start);
    timing.log();
  }

  const response: SearchSuggestionsResponse = {
    citySlug,
    suggestions: {
      popularQueries: POPULAR_QUERIES.slice(0, SUGGESTION_LIMIT),
      popularPlaces,
    },
  };

  setCachedResponse(cacheKey, response);

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Server-Timing': timing.header(),
    },
  });
}
