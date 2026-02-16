/**
 * SEO JSON-LD Component
 *
 * Renders layered JSON-LD structured data script tags for buffet detail pages.
 * Uses cached schema generation (lib/seo-jsonld-cached) to avoid rebuild on every request.
 *
 * SCHEMA HIERARCHY:
 * 1. Restaurant (extends LocalBusiness) - Main entity with ratings and reviews
 * 2. FAQPage - Questions and answers from customers (capped at 10)
 * 3. BreadcrumbList - Navigation hierarchy
 * 4. Place[] - Nearby points of interest (capped at 5)
 *
 * Caps: Reviews 10, FAQ 10, POIs 5. On-page HTML content is unchanged.
 */

import { getCachedSeoSchemas } from '@/lib/seo-jsonld-cached';
import JsonLdClient from '@/components/seo/JsonLdClient';

export type SeoSchemas = Awaited<ReturnType<typeof getCachedSeoSchemas>>;

interface SeoJsonLdProps {
  cityState: string;
  slug: string;
  /** When provided, skip fetching; use these schemas and do not render restaurant (handled by page). */
  initialSchemas?: SeoSchemas | null;
  /** When true, do not render Restaurant schema (page renders it with markers). */
  skipRestaurant?: boolean;
}

export default async function SeoJsonLd({ cityState, slug, initialSchemas, skipRestaurant }: SeoJsonLdProps) {
  const schemas = initialSchemas ?? (await getCachedSeoSchemas(cityState, slug));
  if (!schemas) return null;

  const { restaurantSchema, faqSchema, breadcrumbSchema, poiSchemas } = schemas;

  return (
    <>
      {!skipRestaurant && restaurantSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(restaurantSchema, null, 0),
          }}
        />
      )}
      {faqSchema && (
        <JsonLdClient
          id="faq-jsonld"
          dataBase64={Buffer.from(JSON.stringify(faqSchema)).toString('base64')}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema, null, 0),
          }}
        />
      )}
      {poiSchemas.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': poiSchemas.map(s => {
                const { '@context': _, ...rest } = s;
                return rest;
              }),
            }, null, 0),
          }}
        />
      )}
    </>
  );
}
