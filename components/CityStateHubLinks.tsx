'use client';

import Link from 'next/link';

interface CityStateHubLinksProps {
  cityName: string;
  stateName: string;
  stateAbbr: string;
  citySlug: string;
  buffetCount?: number;
}

/**
 * CityStateHubLinks Component
 * 
 * Displays navigation links back to city and state landing pages.
 * Helps users navigate back to broader listings and improves internal linking.
 */
export default function CityStateHubLinks({
  cityName,
  stateName,
  stateAbbr,
  citySlug,
  buffetCount,
}: CityStateHubLinksProps) {
  // Generate state slug from state name or abbreviation
  const stateSlug = stateAbbr.toLowerCase();

  return (
    <section className="mb-8 md:mb-10 bg-[#C1121F]/5 rounded-lg border border-[#C1121F]/15 p-6">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-[#C1121F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <h3 className="text-lg font-semibold text-[var(--text)]">Explore More Chinese Buffets</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* City Hub Link */}
        <Link
          href={`/chinese-buffets/${citySlug}`}
          className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 hover:shadow-md hover:border-[#C1121F]/30 transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-[#C1121F] group-hover:text-[#7F0A12]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h4 className="font-semibold text-[var(--text)] group-hover:text-[#C1121F] transition-colors">
                  Chinese Buffets in {cityName}
                </h4>
              </div>
              {buffetCount !== undefined && (
                <p className="text-sm text-[var(--muted)]">
                  {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} in {cityName}
                </p>
              )}
              <p className="text-sm text-[var(--muted-light)] mt-1">
                View all buffets, map, and neighborhood listings
              </p>
            </div>
            <svg className="w-5 h-5 text-[var(--muted-light)] group-hover:text-[#C1121F] transition-colors flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* State Hub Link */}
        <Link
          href={`/chinese-buffets/states/${stateSlug}`}
          className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 hover:shadow-md hover:border-[#C1121F]/30 transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-[#C1121F] group-hover:text-[#7F0A12]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="font-semibold text-[var(--text)] group-hover:text-[#C1121F] transition-colors">
                  Chinese Buffets in {stateName}
                </h4>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Browse all cities in {stateName}
              </p>
              <p className="text-sm text-[var(--muted-light)] mt-1">
                Find buffets across the entire state
              </p>
            </div>
            <svg className="w-5 h-5 text-[var(--muted-light)] group-hover:text-[#C1121F] transition-colors flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>
    </section>
  );
}
