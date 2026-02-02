import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { createSitemapEntry, filterIndexableEntries } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';

/**
 * Homepage Sitemap
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  
  // Homepage is always indexable (tier-1)
  const entries = [
    createSitemapEntry(
      baseUrl,
      'home' as PageType,
      'tier-1' as IndexTier,
      new Date(), // Homepage lastmod is current date
      'daily',
      1.0,
      true // Always index homepage
    ),
  ].filter(Boolean);

  // Filter to only include indexable pages (excludes noindex)
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
