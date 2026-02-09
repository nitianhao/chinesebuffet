'use client';

import { useState } from 'react';
import POIGroupAccordion from './POIGroupAccordion';
import {
  extractGroupMetadata,
  shouldDefaultOpen,
  isUltraThin,
  POIGroupMetadata,
} from '@/lib/poiUtils';

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

interface POISectionProps {
  sectionTitle: string;
  sectionSlug: string;
  summary?: string;
  highlights?: POIGroup[];
  accentColor?: string; // Tailwind color class
  hideTitle?: boolean; // Hide title when used inside a card
}

/**
 * POI Section Component
 * 
 * Handles the two-layer approach:
 * - Layer 1: High-signal groups (rendered inline with accordions)
 * - Layer 2: Ultra-thin groups (hidden behind "Show all" toggle)
 * 
 * SEO-SAFE: All groups remain in DOM, just visually organized.
 */
export default function POISection({
  sectionTitle,
  sectionSlug,
  summary,
  highlights = [],
  accentColor = 'blue',
  hideTitle = false,
}: POISectionProps) {
  const [showAllGroups, setShowAllGroups] = useState(false);
  
  // Process groups: extract metadata and categorize
  const processedGroups = highlights.map((group) => {
    const metadata = extractGroupMetadata(group);
    const defaultExpanded = shouldDefaultOpen(sectionSlug, group.label, metadata);
    const ultraThin = isUltraThin(sectionSlug, group.label, metadata);
    
    return {
      group,
      metadata,
      defaultExpanded,
      ultraThin,
    };
  });
  
  // Split into visible (high-signal) and hidden (ultra-thin) groups
  const visibleGroups = processedGroups.filter((p) => !p.ultraThin);
  const hiddenGroups = processedGroups.filter((p) => p.ultraThin);
  
  // If no highlights, don't render the section
  if (highlights.length === 0) {
    return null;
  }
  
  return (
    <div className="mb-6">
      {!hideTitle && <h3 className="text-lg font-semibold text-gray-900 mb-4">{sectionTitle}</h3>}
      <div className={`${hideTitle ? '' : 'bg-white rounded-lg border border-gray-200'} p-4 sm:p-6 ${hideTitle ? '' : 'shadow-sm'}`}>
        {/* Section Summary */}
        {summary && (
          <div className="mb-6">
            <p className="text-gray-700 leading-relaxed">{summary}</p>
          </div>
        )}
        
        {/* Layer 1: High-Signal Groups (Always Visible) */}
        {visibleGroups.length > 0 && (
          <div className="space-y-6">
            {visibleGroups.map((processed, index) => (
              <POIGroupAccordion
                key={index}
                group={processed.group}
                metadata={processed.metadata}
                defaultExpanded={processed.defaultExpanded}
                accentColor={accentColor}
                sectionSlug={sectionSlug}
                groupIndex={index}
              />
            ))}
          </div>
        )}
        
        {/* Layer 2: "Show All" Toggle for Ultra-Thin Groups */}
        {hiddenGroups.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowAllGroups(!showAllGroups)}
              aria-expanded={showAllGroups}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-[var(--muted)] bg-[var(--surface2)] hover:bg-[var(--surface)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C1121F]/40 flex items-center justify-center gap-2 min-h-[44px]"
            >
              <span>
                {showAllGroups
                  ? 'Hide additional place categories'
                  : `Show all nearby place categories (${hiddenGroups.length} more)`}
              </span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${showAllGroups ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Ultra-Thin Groups (Hidden by Default) */}
            <div
              className={`mt-4 transition-all duration-300 ease-in-out overflow-hidden ${
                showAllGroups ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="space-y-6 pt-2">
                {hiddenGroups.map((processed, index) => (
                  <POIGroupAccordion
                    key={`hidden-${index}`}
                    group={processed.group}
                    metadata={processed.metadata}
                    defaultExpanded={false} // Always collapsed when in hidden layer
                    accentColor={accentColor}
                    sectionSlug={sectionSlug}
                    groupIndex={visibleGroups.length + index}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
