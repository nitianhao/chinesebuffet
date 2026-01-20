import { Buffet, City } from '@/lib/data';
import { getCityBySlug } from '@/lib/data-instantdb';

interface SchemaMarkupProps {
  type: 'homepage' | 'city' | 'buffet';
  data?: City | Buffet;
  citySlug?: string;
}

export default async function SchemaMarkup({ type, data, citySlug }: SchemaMarkupProps) {
  const baseUrl = 'https://yoursite.com'; // Update with your actual domain
  let schemas: any[] = [];

  if (type === 'homepage') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Chinese Buffets Directory',
      description: 'Find Chinese buffets across the USA',
      url: baseUrl,
    });
  } else if (type === 'city' && data && 'buffets' in data) {
    const city = data as City;
    
    // ItemList schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Chinese Buffets in ${city.city}, ${city.state}`,
      description: `Find ${city.buffets.length} Chinese buffets in ${city.city}, ${city.state}`,
      numberOfItems: city.buffets.length,
      itemListElement: city.buffets.map((buffet, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Restaurant',
          name: buffet.name,
          address: {
            '@type': 'PostalAddress',
            streetAddress: buffet.address.street,
            addressLocality: buffet.address.city,
            addressRegion: buffet.address.stateAbbr,
            postalCode: buffet.address.postalCode,
            addressCountry: 'US',
          },
          url: `${baseUrl}/chinese-buffets/${citySlug}/${buffet.slug}`,
        },
      })),
    });

    // Breadcrumb schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: baseUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: `Chinese Buffets in ${city.city}, ${city.state}`,
          item: `${baseUrl}/chinese-buffets/${citySlug}`,
        },
      ],
    });

    // FAQPage schema (if FAQs exist)
    // Note: FAQs should be passed separately if available
  } else if (type === 'buffet' && data && 'name' in data) {
    const buffet = data as Buffet;
    const city = citySlug ? await getCityBySlug(citySlug) : null;
    
    // Restaurant schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: buffet.name,
      description: `Chinese buffet restaurant in ${buffet.address.city}, ${buffet.address.state}`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: buffet.address.street,
        addressLocality: buffet.address.city,
        addressRegion: buffet.address.stateAbbr,
        postalCode: buffet.address.postalCode,
        addressCountry: 'US',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: buffet.location.lat,
        longitude: buffet.location.lng,
      },
      telephone: buffet.phone,
      url: buffet.website || `${baseUrl}/chinese-buffets/${citySlug}/${buffet.slug}`,
      priceRange: buffet.price || '$$',
      ...(buffet.rating > 0 && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: buffet.rating.toString(),
          reviewCount: buffet.reviewsCount.toString(),
          bestRating: '5',
          worstRating: '1',
        },
      }),
      ...(buffet.hours && buffet.hours.length > 0 && {
        openingHoursSpecification: buffet.hours.map(h => {
          const [open, close] = h.hours.split(' to ');
          return {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: h.day,
            opens: open?.trim(),
            closes: close?.trim(),
          };
        }),
      }),
    });

    // Breadcrumb schema
    if (city && citySlug) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: baseUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: `Chinese Buffets in ${city.city}, ${city.state}`,
            item: `${baseUrl}/chinese-buffets/${citySlug}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: buffet.name,
            item: `${baseUrl}/chinese-buffets/${citySlug}/${buffet.slug}`,
          },
        ],
      });
    }
  }

  if (schemas.length === 0) return null;

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}

