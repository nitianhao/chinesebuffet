/**
 * Buffet Page Transforms - Cached CPU-heavy computations
 *
 * Heavy transforms (formatHoursList, POI extraction, orderBy parsing, etc.)
 * are cached via Next.js unstable_cache to reduce TTFB.
 *
 * Cache key: buffet-page-transforms-{cityState}-{slug}
 * Revalidation: 24h (86400s), tag: buffet-transforms-{cityState}-{slug}
 *
 * On-demand invalidation: revalidateTag('buffet-transforms-{cityState}-{slug}')
 * when buffet data is updated in DB.
 */

import { unstable_cache } from 'next/cache';
import { getCachedBuffet } from '@/lib/data-instantdb';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(time: string): string {
  if (!time) return '';
  const clean = time.replace(':', '');
  if (clean.length !== 4) return time;
  const hours = parseInt(clean.slice(0, 2), 10);
  const minutes = clean.slice(2);
  const period = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${minutes} ${period}`;
}

function formatHoursList(raw: any): Array<{ day: string; ranges: string }> {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && raw[0]?.day && raw[0]?.hours) {
    return raw
      .map((item: any) => ({ day: String(item.day), ranges: String(item.hours) }))
      .filter((item: any) => item.day && item.ranges);
  }
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]?.open)) {
    const byDay: Record<string, string[]> = {};
    raw[0].open.forEach((entry: any) => {
      const dayIndex = Number(entry.day);
      const day = dayNames[dayIndex] || String(entry.day);
      const start = formatTime(String(entry.start || ''));
      const end = formatTime(String(entry.end || ''));
      if (!byDay[day]) byDay[day] = [];
      if (start && end) byDay[day].push(`${start} - ${end}`);
    });
    return Object.entries(byDay).map(([day, ranges]) => ({ day, ranges: ranges.join(', ') }));
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw)
      .filter(([, value]) => typeof value === 'string')
      .map(([day, ranges]) => ({ day, ranges: String(ranges) }));
  }
  return [];
}

function summarizePopularTimes(raw: any): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return `Popular times available (${raw.length} day${raw.length === 1 ? '' : 's'})`;
  }
  if (typeof raw === 'object') {
    const days = Object.keys(raw).length;
    return `Popular times available (${days} day${days === 1 ? '' : 's'})`;
  }
  return 'Popular times available';
}

function normalizePopularTimes(raw: any): Array<{ day: string; entries: Array<{ hour: number; occupancyPercent: number }> }> {
  if (!raw || typeof raw !== 'object') return [];
  const dayOrder = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const dayLabels: Record<string, string> = {
    Su: 'Sun', Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat',
  };
  return dayOrder
    .map((day) => ({
      day: dayLabels[day] || day,
      entries: Array.isArray(raw[day]) ? raw[day] : [],
    }))
    .filter((item) => item.entries.length > 0);
}

function generateDecisionSummary(buffet: any): string {
  const parts: string[] = [];
  if (buffet.rating && buffet.rating >= 4.0) {
    parts.push(`${buffet.rating.toFixed(1)}-star`);
  }
  if (buffet.categories && buffet.categories.length > 0) {
    const cuisineTypes = buffet.categories
      .filter((cat: string) => !cat.toLowerCase().includes('restaurant') && !cat.toLowerCase().includes('buffet'))
      .slice(0, 2);
    if (cuisineTypes.length > 0) parts.push(cuisineTypes.join(', '));
  }
  if (buffet.address) {
    if (typeof buffet.address === 'object' && buffet.address.city) {
      parts.push(`in ${buffet.address.city}`);
    } else if (typeof buffet.address === 'string') {
      const cityMatch = buffet.address.match(/,?\s*([^,]+),\s*[A-Z]{2}/);
      if (cityMatch?.[1]) parts.push(`in ${cityMatch[1].trim()}`);
    }
  }
  if (buffet.price) parts.push(`(${buffet.price})`);
  if (buffet.reviewsCount && buffet.reviewsCount > 50) {
    parts.push(`with ${buffet.reviewsCount.toLocaleString()} reviews`);
  }
  let summary = parts.join(' ');
  if (buffet.description2 || buffet.description) {
    const desc = (buffet.description2 || buffet.description || '').substring(0, 100);
    if (desc.length > 0) {
      const sentences = desc.split(/[.!?]/).filter((s: string) => s.trim().length > 20 && s.trim().length < 80);
      if (sentences.length > 0) summary = `${sentences[0].trim()} ${summary}`;
    }
  }
  if (!summary || summary.trim().length === 0) {
    summary = `${buffet.name} offers authentic Chinese buffet cuisine`;
    if (buffet.address) {
      if (typeof buffet.address === 'object' && buffet.address.city) {
        summary += ` in ${buffet.address.city}`;
      } else if (typeof buffet.address === 'string') {
        const cityMatch = buffet.address.match(/,?\s*([^,]+),\s*[A-Z]{2}/);
        if (cityMatch?.[1]) summary += ` in ${cityMatch[1].trim()}`;
      }
    }
  }
  if (summary.length > 140) summary = summary.substring(0, 137) + '...';
  return summary;
}

function extractKeyPOIsForSchema(buffet: any): Array<{ name: string; category?: string; lat?: number; lng?: number; address?: string; distance?: string }> {
  const pois: Array<{ name: string; category?: string; lat?: number; lng?: number; address?: string; distance?: string; priority: number }> = [];
  const extractFromCategory = (data: any, category: string, priority: number) => {
    if (!data?.highlights) return;
    for (const highlight of data.highlights) {
      if (!highlight?.items) continue;
      for (const item of highlight.items.slice(0, 2)) {
        if (item?.name) {
          pois.push({
            name: item.name,
            category: highlight.label || category,
            lat: item.lat,
            lng: item.lng,
            distance: item.distance,
            priority,
          });
        }
      }
    }
  };
  extractFromCategory(buffet.transportationAutomotive, 'Transportation', 1);
  extractFromCategory(buffet.retailShopping, 'Shopping', 2);
  extractFromCategory(buffet.foodDining, 'Food & Dining', 3);
  extractFromCategory(buffet.recreationEntertainment, 'Entertainment', 4);
  extractFromCategory(buffet.healthcareMedicalServices, 'Healthcare', 5);
  return pois.sort((a, b) => a.priority - b.priority).slice(0, 5).map(({ priority, ...poi }) => poi);
}

function transformAdditionalInfoArray(arr: any[] | undefined): Record<string, any> | null {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  const result: Record<string, any> = {};
  arr.forEach((item: any) => {
    if (typeof item === 'object' && item !== null) {
      Object.entries(item).forEach(([key, value]) => { result[key] = value; });
    } else if (typeof item === 'string') {
      result[item] = true;
    }
  });
  return Object.keys(result).length > 0 ? result : null;
}

function parseOrderByItems(contactInfo: any): Array<{ name: string; url?: string }> {
  const orderByItems: Array<{ name: string; url?: string }> = [];
  if (!contactInfo?.orderBy) return orderByItems;
  const extractUrl = (item: any): string | undefined =>
    item.orderUrl || item.url || item.link || item.href;
  const orderBy = contactInfo.orderBy;
  if (typeof orderBy === 'string') {
    try {
      const parsed = JSON.parse(orderBy);
      if (Array.isArray(parsed)) {
        orderByItems.push(...parsed.map((item: any) => ({
          name: item.name || item.title || item.service || '',
          url: extractUrl(item),
        })).filter((item: any) => item.name));
      } else if (typeof parsed === 'object' && parsed !== null) {
        orderByItems.push(...Object.entries(parsed).map(([key, value]: [string, any]) => ({
          name: key,
          url: typeof value === 'string' && value.startsWith('http') ? value : extractUrl(value),
        })).filter((item: any) => item.name));
      }
    } catch {
      orderByItems.push({ name: orderBy });
    }
  } else if (Array.isArray(orderBy)) {
    orderByItems.push(...orderBy.map((item: any) => ({
      name: item.name || item.title || item.service || '',
      url: extractUrl(item),
    })).filter((item: any) => item.name));
  } else if (typeof orderBy === 'object' && orderBy !== null) {
    orderByItems.push(...Object.entries(orderBy).map(([key, value]: [string, any]) => ({
      name: key,
      url: typeof value === 'string' && value.startsWith('http') ? value : extractUrl(value),
    })).filter((item: any) => item.name));
  }
  return orderByItems.filter((item) => item.name && item.name.trim() !== '');
}

function sortImages(images: any[]): any[] {
  if (!images || images.length === 0) return [];
  const getArea = (img: any): number => {
    if (typeof img === 'object' && img.widthPx && img.heightPx) return img.widthPx * img.heightPx;
    return 0;
  };
  return [...images].sort((a, b) => getArea(b) - getArea(a));
}

const ADDITIONAL_INFO_KEYS = [
  'Accessibility',
  'Amenities',
  'Atmosphere',
  'Dining options',
  'Service options',
  'Payments',
  'Planning',
  'Highlights',
] as const;

export interface BuffetPageTransforms {
  regularHours: Array<{ day: string; ranges: string }>;
  secondaryHours: Array<{ day: string; ranges: string }>;
  popularTimesSummary: string | null;
  popularTimes: Array<{ day: string; entries: Array<{ hour: number; occupancyPercent: number }> }>;
  orderByItems: Array<{ name: string; url?: string }>;
  decisionSummary: string;
  nearbyPOIsForSchema: Array<{ name: string; category?: string; lat?: number; lng?: number; address?: string; distance?: string }>;
  sortedImages: any[];
  precomputedAdditionalInfo: Record<string, Record<string, any> | null>;
}

/** Uncached transform computation - use for fallback when cache fails */
export function computeTransforms(buffet: any): BuffetPageTransforms {
  const additionalInfo = (buffet as any).additionalInfo;
  const precomputedAdditionalInfo: Record<string, Record<string, any> | null> = {};
  for (const key of ADDITIONAL_INFO_KEYS) {
    const arr = additionalInfo?.[key];
    precomputedAdditionalInfo[key] = transformAdditionalInfoArray(Array.isArray(arr) ? arr : undefined);
  }

  return {
    regularHours: formatHoursList(buffet.hours?.hours),
    secondaryHours: formatHoursList(buffet.hours?.secondaryOpeningHours),
    popularTimesSummary: summarizePopularTimes(buffet.hours?.popularTimesHistogram),
    popularTimes: normalizePopularTimes(buffet.hours?.popularTimesHistogram),
    orderByItems: parseOrderByItems(buffet.contactInfo),
    decisionSummary: generateDecisionSummary(buffet),
    nearbyPOIsForSchema: extractKeyPOIsForSchema(buffet),
    sortedImages: sortImages(buffet.images || []),
    precomputedAdditionalInfo,
  };
}

const CACHE_REVALIDATE = 86400; // 24 hours

/**
 * Get cached page transforms. Fetches buffet internally (via getCachedBuffet)
 * to avoid serializing large objects in the cache key.
 *
 * Cache key: buffet-page-transforms-{cityState}-{slug}
 * Revalidation: 24h. Tag: buffet-transforms-{cityState}-{slug}
 * On-demand: revalidateTag(`buffet-transforms-${cityState}-${slug}`)
 */
export async function getCachedPageTransforms(
  cityState: string,
  slug: string
): Promise<BuffetPageTransforms> {
  const cacheTag = `buffet-transforms-${cityState}-${slug}`;
  const getTransforms = unstable_cache(
    async (cState: string, s: string) => {
      const buffet = await getCachedBuffet(cState, s);
      if (!buffet) throw new Error(`Buffet not found: ${cState}/${s}`);
      return computeTransforms(buffet);
    },
    ['buffet-page-transforms', cityState, slug],
    {
      revalidate: CACHE_REVALIDATE,
      tags: [cacheTag, 'buffet-transforms'],
    }
  );
  return getTransforms(cityState, slug);
}
