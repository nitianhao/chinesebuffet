'use client';

import Link from 'next/link';

interface BuffetLink {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  rating?: number;
  distance?: number;
}

interface InternalLinkingBlocksProps {
  sameCityBuffets: BuffetLink[];
  sameRoadBuffets: BuffetLink[];
  nearbyBuffets: BuffetLink[];
  // City/State hub link props
  cityName?: string;
  stateName?: string;
  stateAbbr?: string;
  citySlug?: string;
  buffetCount?: number;
}

/**
 * Generate natural, varied anchor text for buffet links
 */
function generateAnchorText(buffet: BuffetLink, index: number, type: 'city' | 'road' | 'nearby'): string {
  const name = buffet.name;
  const rating = buffet.rating || 0;
  const distance = buffet.distance;
  
  // Anchor text variations based on type and context
  const variations: Record<string, string[]> = {
    city: [
      name,
      `${name} in the area`,
      `Visit ${name}`,
      `${name} nearby`,
      `Check out ${name}`,
      `${name} - ${rating >= 4 ? 'highly rated' : rating >= 3.5 ? 'well-reviewed' : 'local'} buffet`,
      `${name} restaurant`,
      `Explore ${name}`,
    ],
    road: [
      name,
      `${name} on this street`,
      `${name} nearby`,
      `Another option: ${name}`,
      `${name} in the area`,
      `Visit ${name}`,
      `${name} - ${rating >= 4 ? 'top-rated' : 'local'} choice`,
      `Check out ${name}`,
    ],
    nearby: [
      name,
      `${name} nearby`,
      distance ? `${name} (${distance.toFixed(1)} miles away)` : `${name} in the area`,
      `Visit ${name}`,
      `${name} - ${rating >= 4 ? 'highly rated' : 'local'} option`,
      `${name} restaurant`,
      `Explore ${name}`,
      distance ? `${name} (${distance < 1 ? '< 1 mile' : `${distance.toFixed(1)} mi`})` : name,
    ],
  };
  
  const typeVariations = variations[type] || variations.nearby;
  return typeVariations[index % typeVariations.length];
}

export default function InternalLinkingBlocks({
  sameCityBuffets,
  sameRoadBuffets,
  nearbyBuffets,
  cityName,
  stateName,
  stateAbbr,
  citySlug,
  buffetCount,
}: InternalLinkingBlocksProps) {
  // Only render if we have at least one block with links or hub links
  const hasBuffetLinks = sameCityBuffets.length > 0 || sameRoadBuffets.length > 0 || nearbyBuffets.length > 0;
  const hasHubLinks = cityName && stateName && stateAbbr && citySlug;
  
  if (!hasBuffetLinks && !hasHubLinks) return null;

  const stateSlug = stateAbbr?.toLowerCase();
  
  return (
    <section className="mb-8 md:mb-10 bg-[#C1121F]/5 rounded-lg border border-[#C1121F]/15 p-6">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-[#C1121F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-lg font-semibold text-[var(--text)]">Nearby Chinese Buffets</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Same City Block - Buffet Links */}
        {sameCityBuffets.length > 0 && (
          <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-[#C1121F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <h4 className="font-semibold text-[var(--text)] text-sm">
                In This City
              </h4>
            </div>
            <ul className="space-y-2">
              {sameCityBuffets.slice(0, 5).map((buffet) => (
                <li key={buffet.id}>
                  <Link
                    href={`/chinese-buffets/${buffet.citySlug}/${buffet.slug}`}
                    className="text-sm text-[#C1121F] hover:text-[#7F0A12] hover:underline transition-colors flex items-center gap-1.5 group"
                  >
                    <svg className="w-3 h-3 text-[var(--muted-light)] group-hover:text-[#C1121F] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="line-clamp-1">{buffet.name}</span>
                  </Link>
                </li>
              ))}
              {sameCityBuffets.length > 5 && (
                <li className="text-xs text-[var(--muted)] pt-1">
                  +{sameCityBuffets.length - 5} more in this city
                </li>
              )}
            </ul>
          </div>
        )}
        
        {/* City Hub Link */}
        {hasHubLinks && (
          <Link
            href={`/chinese-buffets/${citySlug}`}
            className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 hover:shadow-md hover:border-[#C1121F]/30 transition-all group flex flex-col"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-[#C1121F] group-hover:text-[#7F0A12]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h4 className="font-semibold text-[var(--text)] text-sm group-hover:text-[#C1121F] transition-colors">
                Buffets in {cityName}
              </h4>
            </div>
            <div className="flex-1">
              {buffetCount !== undefined && (
                <p className="text-sm text-[var(--muted)]">
                  {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} in {cityName}
                </p>
              )}
              <p className="text-xs text-[var(--muted-light)] mt-1">
                View all buffets, map & neighborhoods
              </p>
            </div>
            <div className="flex justify-end mt-2">
              <svg className="w-4 h-4 text-[var(--muted-light)] group-hover:text-[#C1121F] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}

        {/* State Hub Link */}
        {hasHubLinks && (
          <Link
            href={`/chinese-buffets/states/${stateSlug}`}
            className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 hover:shadow-md hover:border-[#C1121F]/30 transition-all group flex flex-col"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-[#C1121F] group-hover:text-[#7F0A12]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="font-semibold text-[var(--text)] text-sm group-hover:text-[#C1121F] transition-colors">
                Buffets in {stateName}
              </h4>
            </div>
            <div className="flex-1">
              <p className="text-sm text-[var(--muted)]">
                Browse all cities in {stateName}
              </p>
              <p className="text-xs text-[var(--muted-light)] mt-1">
                Find buffets across the entire state
              </p>
            </div>
            <div className="flex justify-end mt-2">
              <svg className="w-4 h-4 text-[var(--muted-light)] group-hover:text-[#C1121F] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
