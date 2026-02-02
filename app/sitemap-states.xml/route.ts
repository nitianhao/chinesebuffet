import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getAllStateAbbrs, getStateByAbbr } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';

/**
 * State Pages Sitemap
 * Only includes indexable state pages.
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const stateAbbrs = await getAllStateAbbrs();
  
  const entries = [];
  
  for (const stateAbbr of stateAbbrs) {
    const stateData = await getStateByAbbr(stateAbbr);
    if (!stateData) continue;
    
    const pagePath = `/chinese-buffets/states/${stateAbbr.toLowerCase()}`;
    // Get last modified from state data (updatedAt, lastModified, or current date)
    const lastModified = getLastModified(stateData);
    
    // State pages are tier-1 (always indexable)
    const entry = createSitemapEntry(
      `${baseUrl}${pagePath}`,
      'state' as PageType,
      'tier-1' as IndexTier,
      lastModified,
      'weekly',
      0.8,
      true // State pages are always indexable (tier-1)
    );
    
    // Only add if entry is indexable (createSitemapEntry returns null for noindex)
    if (entry) {
      entries.push(entry);
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
