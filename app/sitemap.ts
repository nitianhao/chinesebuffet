import { MetadataRoute } from 'next';
import { getAllCitySlugs, getCityBySlug, getAllStateAbbrs, getNeighborhoodsByCity } from '@/lib/data-instantdb';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://yoursite.com'; // Update with your actual domain
  
  const citySlugs = await getAllCitySlugs();
  const stateAbbrs = await getAllStateAbbrs();
  
  // Homepage
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  // State pages
  for (const stateAbbr of stateAbbrs) {
    routes.push({
      url: `${baseUrl}/chinese-buffets/states/${stateAbbr.toLowerCase()}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // City pages and neighborhoods
  for (const slug of citySlugs) {
    const city = await getCityBySlug(slug);
    if (city) {
      routes.push({
        url: `${baseUrl}/chinese-buffets/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });

      // Individual buffet pages
      for (const buffet of city.buffets) {
        routes.push({
          url: `${baseUrl}/chinese-buffets/${slug}/${buffet.slug}`,
          lastModified: new Date(),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }

      // Neighborhood pages
      const neighborhoods = await getNeighborhoodsByCity(slug);
      for (const neighborhood of neighborhoods) {
        routes.push({
          url: `${baseUrl}/chinese-buffets/${slug}/neighborhoods/${neighborhood.slug}`,
          lastModified: new Date(),
          changeFrequency: 'monthly',
          priority: 0.5,
        });
      }
    }
  }

  return routes;
}

