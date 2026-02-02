import { NextResponse } from 'next/server';

/**
 * Sitemap Index
 * 
 * Returns a sitemap index XML that references separate sitemaps by page type.
 * Only includes sitemaps that contain indexable pages.
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const now = new Date();
  
  // Sitemap index entries pointing to separate sitemaps by page type
  const sitemapIndexEntries = [
    {
      loc: `${baseUrl}/sitemap-home.xml`,
      lastmod: now.toISOString(),
    },
    {
      loc: `${baseUrl}/sitemap-states.xml`,
      lastmod: now.toISOString(),
    },
    {
      loc: `${baseUrl}/sitemap-cities.xml`,
      lastmod: now.toISOString(),
    },
    {
      loc: `${baseUrl}/sitemap-buffets.xml`,
      lastmod: now.toISOString(),
    },
    {
      loc: `${baseUrl}/sitemap-poi.xml`,
      lastmod: now.toISOString(),
    },
    {
      loc: `${baseUrl}/sitemap-neighborhoods.xml`,
      lastmod: now.toISOString(),
    },
  ];
  
  // Generate sitemap index XML
  const sitemaps = sitemapIndexEntries.map(entry => {
    return `  <sitemap>
    <loc>${escapeXML(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
  </sitemap>`;
  }).join('\n');
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>`;
  
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
