import { NextResponse } from 'next/server';
import { MetadataRoute } from 'next';
import { getAllCitySlugs, getCityBySlug } from '@/lib/data-instantdb';
import { createSitemapEntry, filterIndexableEntries, getLastModified } from '@/lib/sitemap-utils';
import { PageType, IndexTier } from '@/lib/index-tier';
import { isCityIndexable, getStagedIndexingConfig } from '@/lib/staged-indexing';

/**
 * City Pages Sitemap
 * Only includes indexable city pages.
 */
export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const citySlugs = await getAllCitySlugs();
  
  const entries = [];
  
  // Check staged indexing config
  const stagedConfig = getStagedIndexingConfig();
  
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
