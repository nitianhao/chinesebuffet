'use client';

import { useMemo } from 'react';

interface NearbyBuffet {
  id: string;
  rating: number;
  price?: string | null;
  citySlug?: string;
}

interface ComparisonContextProps {
  currentRating?: number;
  currentPrice?: string | null;
  nearbyBuffets: NearbyBuffet[];
  cityName?: string;
}

/**
 * Extract price level from price string
 * Returns: 1 (cheapest), 2, 3, 4 (most expensive), or null
 */
function extractPriceLevel(price: string | null | undefined): number | null {
  if (!price) return null;
  
  const priceStr = price.toLowerCase();
  
  // Count dollar signs
  const dollarCount = (priceStr.match(/\$/g) || []).length;
  
  if (dollarCount === 0) return null;
  if (dollarCount === 1) return 1; // $
  if (dollarCount === 2) return 2; // $$
  if (dollarCount === 3) return 3; // $$$
  if (dollarCount >= 4) return 4; // $$$$
  
  return null;
}

/**
 * Generate rating comparison phrase
 */
function generateRatingComparison(
  currentRating: number,
  nearbyBuffets: NearbyBuffet[]
): string | null {
  if (!currentRating || nearbyBuffets.length === 0) return null;
  
  // Filter buffets with valid ratings
  const buffetsWithRatings = nearbyBuffets.filter(nb => nb.rating && nb.rating > 0);
  
  if (buffetsWithRatings.length < 3) return null; // Need at least 3 for meaningful comparison
  
  // Calculate how many have lower ratings
  const lowerRatings = buffetsWithRatings.filter(nb => nb.rating < currentRating).length;
  const higherRatings = buffetsWithRatings.filter(nb => nb.rating > currentRating).length;
  const sameRatings = buffetsWithRatings.filter(nb => Math.abs(nb.rating - currentRating) < 0.1).length;
  
  const total = buffetsWithRatings.length;
  const lowerPercent = (lowerRatings / total) * 100;
  const higherPercent = (higherRatings / total) * 100;
  
  // Generate phrases based on comparison - use natural, varied language
  if (lowerPercent >= 60) {
    return 'Rated higher than most nearby buffets';
  } else if (lowerPercent >= 40) {
    return 'Above average for the area';
  } else if (higherPercent >= 60) {
    return 'Similar ratings to nearby options';
  } else if (higherPercent >= 40) {
    return 'Comparable ratings nearby';
  }
  
  return null;
}

/**
 * Generate price comparison phrase
 */
function generatePriceComparison(
  currentPrice: string | null | undefined,
  nearbyBuffets: NearbyBuffet[],
  cityName?: string
): string | null {
  if (!currentPrice || nearbyBuffets.length === 0) return null;
  
  const currentPriceLevel = extractPriceLevel(currentPrice);
  if (currentPriceLevel === null) return null;
  
  // Filter buffets with valid prices
  const buffetsWithPrices = nearbyBuffets
    .map(nb => ({ ...nb, priceLevel: extractPriceLevel(nb.price) }))
    .filter(nb => nb.priceLevel !== null);
  
  if (buffetsWithPrices.length < 3) return null; // Need at least 3 for meaningful comparison
  
  // Calculate how many have higher price levels
  const higherPrices = buffetsWithPrices.filter(nb => (nb.priceLevel || 0) > currentPriceLevel).length;
  const lowerPrices = buffetsWithPrices.filter(nb => (nb.priceLevel || 0) < currentPriceLevel).length;
  const samePrices = buffetsWithPrices.filter(nb => (nb.priceLevel || 0) === currentPriceLevel).length;
  
  const total = buffetsWithPrices.length;
  const higherPercent = (higherPrices / total) * 100;
  const lowerPercent = (lowerPrices / total) * 100;
  
  // Generate phrases based on comparison - use natural, varied language
  const locationContext = cityName ? ` in ${cityName}` : '';
  
  if (lowerPercent >= 60) {
    return `More affordable than nearby options${locationContext}`;
  } else if (lowerPercent >= 40) {
    return `Budget-friendly for the area${locationContext}`;
  } else if (higherPercent >= 60) {
    return `Similar pricing nearby${locationContext}`;
  } else if (higherPercent >= 40) {
    return `Comparable prices${locationContext}`;
  }
  
  return null;
}

export default function ComparisonContext({
  currentRating,
  currentPrice,
  nearbyBuffets,
  cityName,
}: ComparisonContextProps) {
  const ratingComparison = useMemo(
    () => generateRatingComparison(currentRating || 0, nearbyBuffets),
    [currentRating, nearbyBuffets]
  );

  const priceComparison = useMemo(
    () => generatePriceComparison(currentPrice, nearbyBuffets, cityName),
    [currentPrice, nearbyBuffets, cityName]
  );

  if (!ratingComparison && !priceComparison) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mt-2">
      {ratingComparison && (
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="italic">{ratingComparison}</span>
        </span>
      )}
      {priceComparison && (
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V3m0 9v3m0 3.01V21M6 12H3.984a2 2 0 00-1.99 2.195L2 16a2 2 0 002 2h16a2 2 0 002-2l-.01-1.805A2 2 0 0020.016 12H18M6 12H3.984a2 2 0 00-1.99 2.195L2 16a2 2 0 002 2h16a2 2 0 002-2l-.01-1.805A2 2 0 0020.016 12H18" />
          </svg>
          <span className="italic">{priceComparison}</span>
        </span>
      )}
    </div>
  );
}
