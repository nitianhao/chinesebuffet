import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getBuffetsByCity, getNeighborhoodsByCity } from '@/lib/data-instantdb';
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
const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' } as const;

export async function GET(): Promise<NextResponse> {
  try {
    const baseUrl = getBaseUrlForRobotsAndSitemaps();
    const citiesBySlug = await getBuffetsByCity();

    const entries = [];

    // Check staged indexing config
    const stagedConfig = getStagedIndexingConfig();

    for (const [slug, city] of Object.entries(citiesBySlug)) {
      try {
        const cityIndexable = isCityIndexable(
          {
            slug: city.slug,
            city: city.city,
            state: city.state,
            rank: city.rank,
            population: city.population,
            buffetCount: (city.buffets as any[])?.length || 0,
          },
          stagedConfig
        );

        // Only process neighborhoods from indexable cities
        if (!cityIndexable) continue;

        // getNeighborhoodsByCity uses the shared bulk cache internally
        const neighborhoods = await getNeighborhoodsByCity(slug);

        for (const neighborhood of neighborhoods) {
          const pagePath = `/chinese-buffets/${slug}/neighborhoods/${neighborhood.slug}`;
          const lastModified = getLastModified(neighborhood);

          const entry = createSitemapEntry(
            `${baseUrl}${pagePath}`,
            'neighborhood' as PageType,
            'tier-3' as IndexTier,
            lastModified,
            'monthly',
            0.5,
            (neighborhood.buffetCount || 0) > 0
          );

          if (entry) {
            entries.push(entry);
          }
        }
      } catch (error) {
        console.error(`[Sitemap] Error processing neighborhoods for city ${slug}:`, error);
      }
    }

    const routes = filterIndexableEntries(entries);
    const xml = generateSitemapXML(routes);

    return new NextResponse(xml, {
      headers: {
        ...XML_HEADERS,
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('sitemap-neighborhoods.xml', err instanceof Error ? err.message : String(err));
    return new NextResponse(generateSitemapXML([]), {
      headers: { ...XML_HEADERS, 'Cache-Control': 'no-store' },
      status: 200,
    });
  }
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
