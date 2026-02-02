import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getAllCitySlugs, getCityBySlug } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';
import { isCityIndexable, getStagedIndexingConfig } from '@/lib/staged-indexing';

/**
 * Buffet Pages Sitemap
 * Only includes indexable buffet pages (all buffet pages should be indexable per rules).
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const citySlugs = await getAllCitySlugs();
  
  // Check staged indexing config
  const stagedConfig = getStagedIndexingConfig();
  
  const entries = [];
  
  for (const slug of citySlugs) {
    const city = await getCityBySlug(slug);
    if (!city) continue;
    
    // Check if city is indexable in current phase
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
    
    // Only include buffets from indexable cities
    if (!cityIndexable) continue;
    
    for (const buffet of city.buffets) {
      const pagePath = `/chinese-buffets/${slug}/${buffet.slug}`;
      // Get last modified from buffet data (updatedAt, lastModified, or current date)
      const lastModified = getLastModified(buffet);
      
      // All buffet pages should be indexable (enforced by buffet indexing rules)
      // Only include if indexable (excludes noindex pages)
      const entry = createSitemapEntry(
        `${baseUrl}${pagePath}`,
        'buffet' as PageType,
        'tier-2' as IndexTier,
        lastModified,
        'monthly',
        0.6,
        true // Buffet pages are always indexable per rules (if city is in phase)
      );
      
      // Only add if entry is indexable (createSitemapEntry returns null for noindex)
      if (entry) {
        entries.push(entry);
      }
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
