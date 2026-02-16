import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getAllCitySlugs, getNeighborhoodsByCity, getCityBySlug } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';
import { isCityIndexable, getStagedIndexingConfig } from '@/lib/staged-indexing';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';

export const dynamic = 'force-dynamic';
// Note: Removed revalidate export - now using force-dynamic with edge caching via Cache-Control

/**
 * Neighborhood Pages Sitemap
 * Only includes indexable neighborhood pages. All URLs are absolute.
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = getBaseUrlForRobotsAndSitemaps();
  const citySlugs = await getAllCitySlugs();

  const entries = [];

  // Check staged indexing config
  const stagedConfig = getStagedIndexingConfig();

  for (const slug of citySlugs) {
    try {
      // Check if city is indexable in current phase
      const city = await getCityBySlug(slug);
      if (!city) continue;

      const cityIndexable = isCityIndexable(
        {
          slug: city.slug,
          city: city.city,
          state: city.state,
          rank: city.rank,
          population: city.population,
          buffetCount: city.buffets?.length || 0,
        },
        stagedConfig
      );

      // Only process neighborhoods from indexable cities
      if (!cityIndexable) continue;

      const neighborhoods = await getNeighborhoodsByCity(slug);

      for (const neighborhood of neighborhoods) {
        const pagePath = `/chinese-buffets/${slug}/neighborhoods/${neighborhood.slug}`;
        // Get last modified from neighborhood data (updatedAt, lastModified, or current date)
        const lastModified = getLastModified(neighborhood);

        // Neighborhood pages are tier-3 (conditional indexing)
        // Default is noindex, but can be overridden if they have good content
        // Only include if indexable (excludes noindex pages)
        const entry = createSitemapEntry(
          `${baseUrl}${pagePath}`,
          'neighborhood' as PageType,
          'tier-3' as IndexTier,
          lastModified,
          'monthly',
          0.5,
          // Only index if neighborhood has buffets (has content)
          // createSitemapEntry will return null if this is false (noindex)
          (neighborhood.buffetCount || 0) > 0
        );

        // Only add if entry is indexable (excludes noindex pages)
        if (entry) {
          entries.push(entry);
        }
      }
    } catch (error) {
      console.error(`[Sitemap] Error processing neighborhoods for city ${slug}:`, error);
    }
  }

  const routes = filterIndexableEntries(entries);

  // Return XML sitemap
  const xml = generateSitemapXML(routes);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
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
