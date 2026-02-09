import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import {
  getBuffetsWithParking,
  getBuffetsNearShoppingMalls,
  getBuffetsNearHighways,
  getBuffetsNearGasStations,
} from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries } from '@/lib/sitemap-utils';
import { assessPOIPageQuality } from '@/lib/poi-page-quality';
import { PageType, IndexTier } from '@/lib/index-tier';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';

const POI_TYPES = {
  parking: {
    title: 'Chinese Buffets with Parking',
    description: 'Find Chinese buffets with convenient parking nearby. Perfect for families and groups who need easy access.',
    metaDescription: 'Discover Chinese buffets with parking available nearby. Browse locations with convenient parking options for easy access.',
    fetchFunction: getBuffetsWithParking,
  },
  'shopping-malls': {
    title: 'Chinese Buffets Near Shopping Malls',
    description: 'Chinese buffets conveniently located near shopping malls and retail centers. Great for combining shopping with dining.',
    metaDescription: 'Find Chinese buffets near shopping malls and retail centers. Perfect locations for combining shopping trips with buffet dining.',
    fetchFunction: getBuffetsNearShoppingMalls,
  },
  highways: {
    title: 'Chinese Buffets Near Highways',
    description: 'Chinese buffets located near major highways and freeways. Ideal for travelers and road trips.',
    metaDescription: 'Discover Chinese buffets near major highways and freeways. Convenient locations for travelers and road trip dining.',
    fetchFunction: getBuffetsNearHighways,
  },
  'gas-stations': {
    title: 'Chinese Buffets Near Gas Stations',
    description: 'Chinese buffets conveniently located near gas stations. Perfect for refueling and refueling yourself.',
    metaDescription: 'Find Chinese buffets near gas stations. Convenient locations for combining fuel stops with buffet dining.',
    fetchFunction: getBuffetsNearGasStations,
  },
} as const;

// ISR: regenerate sitemap at most once per hour at runtime
export const revalidate = 3600;

/**
 * POI Pages Sitemap
 * Only includes indexable POI pages. All URLs are absolute.
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = getBaseUrlForRobotsAndSitemaps();
  
  const entries = [];
  
  for (const [poiType, config] of Object.entries(POI_TYPES)) {
    try {
      // Fetch buffets to assess page quality
      const buffets = await config.fetchFunction(100);
      const buffetCount = buffets.length;
      
      // Additional content
      const additionalContent = config.description || '';
      
      // Assess POI page quality for conditional indexing
      const qualityResult = assessPOIPageQuality(
        poiType,
        buffetCount,
        config.title,
        config.description,
        config.metaDescription,
        additionalContent,
        5, // Buffet count threshold
        200 // Content length threshold
      );
      
      const pagePath = `/chinese-buffets/near/${poiType}`;
      // POI pages use current date as lastmod (they don't have individual timestamps)
      const lastModified = new Date();
      
      // Only include if indexable (qualityResult.indexable determines this)
      // createSitemapEntry will return null if page is noindex
      const entry = createSitemapEntry(
        `${baseUrl}${pagePath}`,
        'poi' as PageType,
        'tier-2' as IndexTier,
        lastModified,
        'weekly',
        0.7,
        qualityResult.indexable // Conditional: only if quality checks pass (excludes noindex)
      );
      
      // Only add if entry is indexable (excludes noindex pages)
      if (entry) {
        entries.push(entry);
      }
    } catch (error) {
      console.error(`[Sitemap] Error processing POI type ${poiType}:`, error);
    }
  }
  
  const routes = filterIndexableEntries(entries);
  
  // Return XML sitemap
  const xml = generateSitemapXML(routes);
  
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}

function generateSitemapXML(routes: MetadataRoute.Sitemap): string {
  const urls = routes.map(route => {
    const lastmod = route.lastModified ? route.lastModified.toISOString() : new Date().toISOString();
    return `  <url>
    <loc>${escapeXML(route.url)}</loc>
    <lastmod>${lastmod}</lastmod>
    ${route.changeFrequency ? `<changefreq>${route.changeFrequency}</changefreq>` : ''}
    ${route.priority !== undefined ? `<priority>${route.priority}</priority>` : ''}
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
