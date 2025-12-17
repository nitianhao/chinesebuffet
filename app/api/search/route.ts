import { NextResponse } from 'next/server';
import { getAllCitySlugs, getCityBySlug, getAllBuffets } from '@/lib/data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  const searchTerm = query.toLowerCase();
  const citySlugs = getAllCitySlugs();
  const buffets = getAllBuffets();
  const matches: Array<{ type: 'city' | 'buffet'; slug: string; name: string; citySlug?: string }> = [];

  // Search cities
  citySlugs.forEach(slug => {
    const city = getCityBySlug(slug);
    if (!city) return;

    if (
      city.city.toLowerCase().includes(searchTerm) ||
      city.state.toLowerCase().includes(searchTerm) ||
      slug.toLowerCase().includes(searchTerm)
    ) {
      matches.push({
        type: 'city',
        slug: slug,
        name: `${city.city}, ${city.state}`,
      });
    }
  });

  // Search buffets
  buffets.forEach(buffet => {
    if (
      buffet.name.toLowerCase().includes(searchTerm) ||
      buffet.address.city.toLowerCase().includes(searchTerm)
    ) {
      matches.push({
        type: 'buffet',
        slug: buffet.slug,
        name: buffet.name,
        citySlug: buffet.citySlug,
      });
    }
  });

  return NextResponse.json({ results: matches.slice(0, 10) });
}

