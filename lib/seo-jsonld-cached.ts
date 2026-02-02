/**
 * Cached JSON-LD schema generation for buffet detail pages.
 *
 * Schema is cached via Next.js unstable_cache to avoid rebuilding on every request.
 * Caps: Reviews 10, FAQ 10, POIs 5. On-page HTML content is unchanged.
 *
 * Cache key: seo-jsonld-{cityState}-{slug}
 * Revalidation: 24h. Tag: seo-jsonld-{cityState}-{slug}
 * On-demand: revalidateTag(`seo-jsonld-${cityState}-${slug}`)
 */

import { unstable_cache } from 'next/cache';
import { getCachedBuffet } from '@/lib/data-instantdb';
import { getCachedPageTransforms } from '@/lib/buffet-page-transforms';
import {
  buildRestaurantJsonLd,
  buildReviewsJsonLd,
  buildFaqPageJsonLd,
  buildBreadcrumbJsonLd,
  buildPOIsJsonLd,
  validateJsonLd,
} from '@/lib/seoJsonLd';

const CACHE_REVALIDATE = 86400; // 24 hours
const MAX_REVIEWS = 10;
const MAX_FAQ_ITEMS = 10;
const MAX_POIS = 5;

export interface CachedSeoSchemas {
  restaurantSchema: any | null;
  faqSchema: any | null;
  breadcrumbSchema: any | null;
  poiSchemas: any[];
}

function buildSchemas(buffet: any, cityStateSlug: string, nearbyPOIs: Array<{ name: string; category?: string; lat?: number; lng?: number; address?: string; distance?: string }>): CachedSeoSchemas {
  const siteBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const pageUrl = `${siteBaseUrl}/chinese-buffets/${cityStateSlug}/${buffet.slug}`;

  const restaurantSchema = buildRestaurantJsonLd(buffet, siteBaseUrl, cityStateSlug);
  if (restaurantSchema && buffet.reviews && Array.isArray(buffet.reviews)) {
    const reviewSchemas = buildReviewsJsonLd(buffet.reviews, MAX_REVIEWS);
    if (reviewSchemas.length > 0) {
      restaurantSchema.review = reviewSchemas;
    }
  }
  if (restaurantSchema && buffet.description) {
    restaurantSchema.description = buffet.description.substring(0, 500);
  }
  if (restaurantSchema && buffet.amenities?.['service options']) {
    const serviceOptions = buffet.amenities['service options'];
    if (typeof serviceOptions === 'object' && serviceOptions['Dine-in'] === true) {
      restaurantSchema.acceptsReservations = 'Yes';
    }
  }
  if (restaurantSchema) {
    validateJsonLd(restaurantSchema, 'Restaurant');
  }

  const faqSchema = buffet.questionsAndAnswers
    ? buildFaqPageJsonLd(buffet.questionsAndAnswers, pageUrl, MAX_FAQ_ITEMS)
    : null;
  if (faqSchema) {
    validateJsonLd(faqSchema, 'FAQPage');
  }

  let breadcrumbSchema: any = null;
  const [cityPart, statePart] = cityStateSlug.split('-').reduce((acc: [string, string], part, i, arr) => {
    if (i === arr.length - 1 && part.length === 2) {
      return [acc[0], part.toUpperCase()];
    }
    return [acc[0] ? `${acc[0]} ${part}` : part, acc[1]];
  }, ['', '']);
  const cityName = cityPart.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const addressObj = typeof buffet.address === 'object' ? buffet.address : null;
  const stateName = addressObj?.state || statePart || '';
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    ...(statePart ? [{ name: stateName || statePart, url: `/chinese-buffets/states/${statePart.toLowerCase()}` }] : []),
    ...(cityName ? [{ name: cityName, url: `/chinese-buffets/${cityStateSlug}` }] : []),
    { name: buffet.name, url: pageUrl },
  ];
  breadcrumbSchema = buildBreadcrumbJsonLd(breadcrumbItems, siteBaseUrl);
  if (breadcrumbSchema) {
    validateJsonLd(breadcrumbSchema, 'BreadcrumbList');
  }

  const poiSchemas = nearbyPOIs.length > 0
    ? buildPOIsJsonLd(nearbyPOIs, pageUrl, MAX_POIS)
    : [];
  if (poiSchemas.length > 0) {
    validateJsonLd(poiSchemas[0], 'Place');
  }

  return { restaurantSchema, faqSchema, breadcrumbSchema, poiSchemas };
}

/**
 * Get cached JSON-LD schemas for a buffet page.
 * Fetches buffet + transforms internally (via getCachedBuffet, getCachedPageTransforms).
 */
export async function getCachedSeoSchemas(
  cityState: string,
  slug: string
): Promise<CachedSeoSchemas | null> {
  const cacheTag = `seo-jsonld-${cityState}-${slug}`;
  const getSchemas = unstable_cache(
    async (cState: string, s: string) => {
      const buffet = await getCachedBuffet(cState, s);
      if (!buffet) return null;
      const transforms = await getCachedPageTransforms(cState, s);
      return buildSchemas(buffet, cState, transforms.nearbyPOIsForSchema);
    },
    ['seo-jsonld', cityState, slug],
    {
      revalidate: CACHE_REVALIDATE,
      tags: [cacheTag, 'seo-jsonld'],
    }
  );
  return getSchemas(cityState, slug);
}
