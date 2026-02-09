import { MetadataRoute } from 'next';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrlForRobotsAndSitemaps();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/_next/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`, // Sitemap index
  };
}

