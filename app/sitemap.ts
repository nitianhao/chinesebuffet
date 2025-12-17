import { MetadataRoute } from 'next';
import { getAllCitySlugs, getCityBySlug } from '@/lib/data';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://yoursite.com'; // Update with your actual domain
  
  const citySlugs = getAllCitySlugs();
  const states = new Set<string>();
  
  // Homepage
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  // City pages and collect states
  citySlugs.forEach(slug => {
    const city = getCityBySlug(slug);
    if (city) {
      // Track states for state hub pages
      const stateSlug = city.state.toLowerCase().replace(/\s+/g, '-');
      states.add(stateSlug);
      
      routes.push({
        url: `${baseUrl}/chinese-buffets/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });

      // Individual buffet pages
      city.buffets.forEach(buffet => {
        routes.push({
          url: `${baseUrl}/chinese-buffets/${slug}/${buffet.slug}`,
          lastModified: new Date(),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      });
    }
  });

  // State hub pages - commented out due to routing conflict
  // TODO: Re-implement state pages with a different route structure (e.g., /states/[state])
  // states.forEach(stateSlug => {
  //   routes.push({
  //     url: `${baseUrl}/chinese-buffets/${stateSlug}`,
  //     lastModified: new Date(),
  //     changeFrequency: 'weekly',
  //     priority: 0.7,
  //   });
  // });

  return routes;
}

