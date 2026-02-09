import dynamic from 'next/dynamic';

// Dynamically import comparison-related components to create separate bundle
const BuffetComparisonGrid = dynamic(() => import('@/components/BuffetComparisonGrid'), { ssr: false });
const InternalLinkingBlocks = dynamic(() => import('@/components/InternalLinkingBlocks'), { ssr: false });

interface ComparisonBundleProps {
  nearbyBuffetsForComparison: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating: number;
    reviewsCount?: number;
    price?: string | null;
    distance: number;
  }>;
  sameCityBuffets: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating?: number;
  }>;
  sameRoadBuffets: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating?: number;
  }>;
  nearbyBuffetsForLinking: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating?: number;
    distance?: number;
  }>;
  cityName?: string;
  stateName?: string;
  stateAbbr?: string;
  citySlug?: string;
  buffetCount?: number;
}

/**
 * ComparisonBundle Component
 * 
 * Separate bundle for comparison and linking sections.
 * Includes:
 * - BuffetComparisonGrid (compare with nearby buffets)
 * - InternalLinkingBlocks (same city/road/nearby + city/state hub links)
 * 
 * Loads components dynamically to create isolated chunk.
 */
export default function ComparisonBundle({
  nearbyBuffetsForComparison,
  sameCityBuffets,
  sameRoadBuffets,
  nearbyBuffetsForLinking,
  cityName,
  stateName,
  stateAbbr,
  citySlug,
  buffetCount,
}: ComparisonBundleProps) {
  return (
    <>
      {/* Buffet Comparison Grid - Compare with similar buffets nearby */}
      {nearbyBuffetsForComparison.length > 0 && (
        <div className="mb-8 md:mb-10">
          <BuffetComparisonGrid buffets={nearbyBuffetsForComparison} />
        </div>
      )}

      {/* Internal Linking Blocks - includes city/state hub links */}
      <InternalLinkingBlocks
        sameCityBuffets={sameCityBuffets}
        sameRoadBuffets={sameRoadBuffets}
        nearbyBuffets={nearbyBuffetsForLinking}
        cityName={cityName}
        stateName={stateName}
        stateAbbr={stateAbbr}
        citySlug={citySlug}
        buffetCount={buffetCount}
      />
    </>
  );
}
