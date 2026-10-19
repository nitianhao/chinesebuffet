import { MetadataRoute } from 'next';
import { getBaseUrlForRobotsAndSitemaps } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrlForRobotsAndSitemaps();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/_next/',
        '/search',
        // Block faceted filter pages to reduce crawler load and ISR writes.
        // These are duplicate/filtered views of the main city pages and don't
        // need independent indexing. The main city page contains all content.
        '/chinese-buffets/*/best',
        '/chinese-buffets/*/cheap',
        '/chinese-buffets/*/top-rated',
        '/chinese-buffets/*/open-now',
        '/indian-buffets/*/best',
        '/indian-buffets/*/cheap',
        '/indian-buffets/*/top-rated',
        '/indian-buffets/*/open-now',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

