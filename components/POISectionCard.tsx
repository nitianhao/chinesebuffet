'use client';

import { useState } from 'react';
import POISection from './POISection';
import { extractGroupMetadata, POIGroupMetadata } from '@/lib/poiUtils';

interface POIItem {
  name?: string;
  category?: string;
  addressText?: string;
  distanceText?: string;
  distanceFt?: number;
  hoursText?: string;
  phone?: string;
  website?: string;
}

interface POIGroup {
  label: string;
  items?: POIItem[];
}

interface POISectionCardProps {
  sectionTitle: string;
  sectionSlug: string;
  summary?: string;
  highlights?: POIGroup[];
  accentColor?: string;
  defaultExpanded?: boolean;
}

/**
 * Calculate distance range from all groups
 */
function calculateDistanceRange(highlights: POIGroup[]): {
  min: number;
  max: number;
  minText: string;
  maxText: string;
} {
  let min = Infinity;
  let max = 0;
  
  for (const group of highlights) {
    const metadata = extractGroupMetadata(group);
    if (metadata.nearestDistanceFt < min) {
      min = metadata.nearestDistanceFt;
    }
    if (metadata.farthestDistanceFt > max && metadata.farthestDistanceFt !== Infinity) {
      max = metadata.farthestDistanceFt;
    }
  }
  
  const formatDistance = (distanceFt: number): string => {
    if (!distanceFt || distanceFt === Infinity) return 'unknown';
    if (distanceFt < 1056) {
      const rounded = Math.round(distanceFt / 10) * 10;
      return `~${rounded} ft`;
    }
    const miles = distanceFt / 5280;
    const roundedMiles = Math.round(miles * 10) / 10;
    return `~${roundedMiles} mi`;
  };
  
  return {
    min,
    max,
    minText: formatDistance(min),
    maxText: formatDistance(max),
  };
}

/**
 * Get total count of places across all groups
 */
function getTotalPlaceCount(highlights: POIGroup[]): number {
  return highlights.reduce((total, group) => {
    return total + (group.items?.length || 0);
  }, 0);
}

/**
 * Get closest notable place across all groups
 */
function getClosestNotablePlace(highlights: POIGroup[]): {
  name: string;
  distanceText: string;
} | null {
  let closest: POIItem | null = null;
  let closestDistance = Infinity;
  
  for (const group of highlights) {
    if (!group.items || group.items.length === 0) continue;
    
    for (const item of group.items) {
      const distance = item.distanceFt ?? Infinity;
      if (distance < closestDistance && item.name) {
        closestDistance = distance;
        closest = item;
      }
    }
  }
  
  if (!closest || !closest.name) return null;
  
  return {
    name: closest.name,
    distanceText: closest.distanceText || (closest.distanceFt ? 
      (closest.distanceFt < 1056 
        ? `~${Math.round(closest.distanceFt / 10) * 10} ft`
        : `~${Math.round((closest.distanceFt / 5280) * 10) / 10} mi`)
      : 'unknown distance'),
  };
}

export default function POISectionCard({
  sectionTitle,
  sectionSlug,
  summary,
  highlights = [],
  accentColor = 'blue',
  defaultExpanded = false,
}: POISectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (!highlights || highlights.length === 0) {
    return null;
  }
  
  const totalPlaces = getTotalPlaceCount(highlights);
  const distanceRange = calculateDistanceRange(highlights);
  const closestPlace = getClosestNotablePlace(highlights);
  
  // Generate color classes - using theme colors
  const colorMap: Record<string, { border: string; text: string; bg: string; hover: string }> = {
    blue: { border: 'border-[var(--border)]', text: 'text-[var(--accent1)]', bg: 'bg-[var(--surface2)]', hover: 'hover:bg-[var(--surface)]' },
    green: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100' },
    purple: { border: 'border-[var(--border)]', text: 'text-[var(--accent1)]', bg: 'bg-[var(--surface2)]', hover: 'hover:bg-[var(--surface)]' },
    red: { border: 'border-[var(--border)]', text: 'text-[var(--accent1)]', bg: 'bg-[var(--surface2)]', hover: 'hover:bg-[var(--surface)]' },
    orange: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50', hover: 'hover:bg-amber-100' },
    teal: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100' },
    indigo: { border: 'border-[var(--border)]', text: 'text-[var(--accent1)]', bg: 'bg-[var(--surface2)]', hover: 'hover:bg-[var(--surface)]' },
    pink: { border: 'border-rose-200', text: 'text-rose-700', bg: 'bg-rose-50', hover: 'hover:bg-rose-100' },
    cyan: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100' },
    amber: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50', hover: 'hover:bg-amber-100' },
    fuchsia: { border: 'border-rose-200', text: 'text-rose-700', bg: 'bg-rose-50', hover: 'hover:bg-rose-100' },
    emerald: { border: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', hover: 'hover:bg-emerald-100' },
    sky: { border: 'border-[var(--border)]', text: 'text-[var(--accent1)]', bg: 'bg-[var(--surface2)]', hover: 'hover:bg-[var(--surface)]' },
    stone: { border: 'border-stone-200', text: 'text-stone-700', bg: 'bg-stone-50', hover: 'hover:bg-stone-100' },
    yellow: { border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50', hover: 'hover:bg-amber-100' },
    slate: { border: 'border-slate-200', text: 'text-slate-700', bg: 'bg-slate-50', hover: 'hover:bg-slate-100' },
    violet: { border: 'border-[var(--border)]', text: 'text-[var(--accent1)]', bg: 'bg-[var(--surface2)]', hover: 'hover:bg-[var(--surface)]' },
    rose: { border: 'border-rose-200', text: 'text-rose-700', bg: 'bg-rose-50', hover: 'hover:bg-rose-100' },
  };
  
  // Default to accent color (red) instead of blue
  const colors = colorMap[accentColor] || colorMap.red;
  
  // Format distance range text
  const distanceRangeText = distanceRange.min === Infinity 
    ? 'Distance unknown'
    : distanceRange.min === distanceRange.max || distanceRange.max === Infinity
    ? distanceRange.minText
    : `${distanceRange.minText} - ${distanceRange.maxText}`;
  
  return (
    <div className={`mb-4 md:mb-6 rounded-lg border ${colors.border} bg-white shadow-sm overflow-hidden transition-all`}>
      {/* Collapsed Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full text-left p-4 ${colors.bg} ${colors.hover} transition-colors`}
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{sectionTitle}</h3>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {totalPlaces > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-600">Places:</span>
                  <span className={`font-medium ${colors.text}`}>{totalPlaces}</span>
                </div>
              )}
              {distanceRange.min !== Infinity && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-600">Distance:</span>
                  <span className={`font-medium ${colors.text}`}>{distanceRangeText}</span>
                </div>
              )}
              {closestPlace && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-600">Closest:</span>
                  <span className={`font-medium ${colors.text}`}>
                    {closestPlace.name} ({closestPlace.distanceText})
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>
      
      {/* Expanded Content */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4">
          <POISection
            sectionTitle={sectionTitle}
            sectionSlug={sectionSlug}
            summary={summary}
            highlights={highlights}
            accentColor={accentColor}
            hideTitle={true}
          />
        </div>
      </div>
    </div>
  );
}
