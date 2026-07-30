import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getBuffetsByCity } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';
import { isCityIndexable, getStagedIndexingConfig } from '@/lib/staged-indexing';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';
import { getCuisineBasePath } from '@/lib/cuisine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Note: Removed revalidate export - now using force-dynamic with edge caching via Cache-Control

// Inline to avoid loading city-filter-pages (which calls getSiteUrl() at module load and breaks build when env is unset)
const CITY_FILTERS = ['best', 'cheap', 'open-now', 'top-rated'] as const;

const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' } as const;

/**
 * City Pages Sitemap
 * Only includes indexable city pages. All URLs are absolute.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const baseUrl = getBaseUrlForRobotsAndSitemaps();
    const citiesBySlug = await getBuffetsByCity();

    const entries = [];

    // Check staged indexing config
    const stagedConfig = getStagedIndexingConfig();

    for (const [slug, city] of Object.entries(citiesBySlug)) {
      // Count Chinese buffets only. getBuffetsByCity() spans every cuisine, so
      // an Indian-only city would otherwise be emitted as /chinese-buffets/<city>
      // — a URL whose page reads Chinese rollups and 404s.
      const chineseBuffets = ((city.buffets as any[]) || []).filter(
        (buffet) => getCuisineBasePath(buffet.cuisineType) === '/chinese-buffets'
      );
      if (chineseBuffets.length === 0) continue;

      // Check if city is indexable in current phase
      const cityIndexable = isCityIndexable(
        {
          slug: city.slug,
          city: city.city,
          state: city.state,
          rank: city.rank,
          population: city.population,
          buffetCount: chineseBuffets.length,
        },
        stagedConfig
      );

      const pagePath = `/chinese-buffets/${slug}`;
      // Get last modified from city data (updatedAt, lastModified, or current date)
      const lastModified = getLastModified(city);

      // City pages are tier-1, but respect staged indexing rollout
      const entry = createSitemapEntry(
        `${baseUrl}${pagePath}`,
        'city' as PageType,
        'tier-1' as IndexTier,
        lastModified,
        'weekly',
        0.8,
        cityIndexable // Only indexable if in current phase
      );

      // Only add if entry is indexable (createSitemapEntry returns null for noindex)
      if (entry) {
        entries.push(entry);

        // Also add curated filter pages for indexable cities with enough buffets.
        // Threshold uses the Chinese count so filter pages aren't emitted on the
        // strength of a city's Indian listings, which they never render.
        const buffetCount = chineseBuffets.length;
        if (buffetCount >= 5) {
          for (const filter of CITY_FILTERS) {
            const filterEntry = createSitemapEntry(
              `${baseUrl}/chinese-buffets/${slug}/${filter}`,
              'city' as PageType,
              'tier-2' as IndexTier,
              lastModified,
              'weekly',
              0.6,
              true
            );
            if (filterEntry) {
              entries.push(filterEntry);
            }
          }
        }
      }
    }

    const routes = filterIndexableEntries(entries);
    const xml = generateSitemapXML(routes);
    return new NextResponse(xml, {
      headers: {
        ...XML_HEADERS,
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
      }
    });
  } catch (err) {
    console.error('sitemap-cities.xml', err instanceof Error ? err.message : String(err));
    const emptyXml = generateSitemapXML([]);
    return new NextResponse(emptyXml, {
      headers: { ...XML_HEADERS, 'Cache-Control': 'no-store' },
      status: 200
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
