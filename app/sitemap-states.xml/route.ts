import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getAllStateAbbrs, getStateByAbbr } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';

export const dynamic = 'force-dynamic';
// Note: Removed revalidate export - now using force-dynamic with edge caching via Cache-Control

/**
 * State Pages Sitemap
 * Only includes indexable state pages. All URLs are absolute.
 */
const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' } as const;

export async function GET(): Promise<NextResponse> {
  try {
    const baseUrl = getBaseUrlForRobotsAndSitemaps();
    const stateAbbrs = await getAllStateAbbrs();

    const entries = [];

    for (const stateAbbr of stateAbbrs) {
      const stateData = await getStateByAbbr(stateAbbr);
      if (!stateData) continue;

      const pagePath = `/chinese-buffets/states/${stateAbbr.toLowerCase()}`;
      const lastModified = getLastModified(stateData);

      const entry = createSitemapEntry(
        `${baseUrl}${pagePath}`,
        'state' as PageType,
        'tier-1' as IndexTier,
        lastModified,
        'weekly',
        0.8,
        true
      );

      if (entry) {
        entries.push(entry);
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
    console.error('sitemap-states.xml', err instanceof Error ? err.message : String(err));
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
