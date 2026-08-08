import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getBuffetsByCity } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified, toLastmod } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';
import { isCityIndexable, getStagedIndexingConfig } from '@/lib/staged-indexing';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';
import { getCuisineBasePath } from '@/lib/cuisine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' } as const;
const MAX_SITEMAP_URLS = 50000; // Google supports up to 50k URLs per sitemap

/**
 * Indian Buffet Pages Sitemap
 *
 * Mirrors sitemap-buffets.xml but emits /indian-buffets/ URLs and filters the
 * shared buffet set down to Indian-cuisine records. Both sitemaps read the same
 * getBuffetsByCity() source and partition it by cuisine, so every buffet appears
 * in exactly one sitemap under exactly one canonical URL.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const baseUrl = getBaseUrlForRobotsAndSitemaps();
    const citiesBySlug = await getBuffetsByCity();

    const stagedConfig = getStagedIndexingConfig();

    const entries = [];

    for (const [slug, city] of Object.entries(citiesBySlug)) {
      const indianBuffets = (city.buffets as any[]).filter(
        (buffet) => getCuisineBasePath(buffet.cuisineType) === '/indian-buffets'
      );

      // Nothing Indian in this city — its /indian-buffets/<city> page 404s.
      if (indianBuffets.length === 0) continue;

      // Staged-indexing gate uses the Indian buffet count so a city qualifies on
      // the strength of its Indian listings, not its Chinese ones.
      const cityIndexable = isCityIndexable(
        {
          slug: city.slug,
          city: city.city,
          state: city.state,
          rank: city.rank,
          population: city.population,
          buffetCount: indianBuffets.length,
        },
        stagedConfig
      );

      if (!cityIndexable) continue;

      for (const buffet of indianBuffets) {
        const pagePath = `/indian-buffets/${slug}/${buffet.slug}`;
        const lastModified = getLastModified(buffet);

        const entry = createSitemapEntry(
          `${baseUrl}${pagePath}`,
          'buffet' as PageType,
          'tier-2' as IndexTier,
          lastModified,
          'monthly',
          0.6,
          true
        );

        if (entry) {
          entries.push(entry);

          if (entries.length >= MAX_SITEMAP_URLS) {
            console.warn(`sitemap-indian-buffets.xml: Reached ${MAX_SITEMAP_URLS} URL limit. Consider splitting into multiple sitemaps.`);
            break;
          }
        }
      }

      if (entries.length >= MAX_SITEMAP_URLS) {
        break;
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
    console.error('sitemap-indian-buffets.xml', err instanceof Error ? err.message : String(err));
    return new NextResponse(generateSitemapXML([]), {
      headers: { ...XML_HEADERS, 'Cache-Control': 'no-store' },
      status: 200,
    });
  }
}

function generateSitemapXML(routes: MetadataRoute.Sitemap): string {
  const urls = routes.map(route => {
    const lastmod = toLastmod(route.lastModified);
    return `  <url>
    <loc>${escapeXML(route.url)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
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
