'use client';

import { useState, useId } from 'react';
import { generateGroupSummary, POIGroupMetadata } from '@/lib/poiUtils';
import { generateIntentLabel } from '@/lib/poiIntentLabels';

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

interface POIGroupAccordionProps {
  group: {
    label: string;
    items?: POIItem[];
  };
  metadata: POIGroupMetadata;
  defaultExpanded?: boolean;
  accentColor?: string; // Tailwind color class (e.g., 'blue', 'green', 'purple')
  sectionSlug?: string; // For generating stable IDs
  groupIndex?: number; // For generating stable IDs
}

/**
 * POI Group Accordion Component
 * 
 * Renders a POI group as an accordion with:
 * - Group heading
 * - One-line summary
 * - Accordion control (Show/Hide places)
 * - Full POI list (always in DOM for SEO, collapsed via CSS)
 * 
 * SEO-SAFE: Content remains in DOM when collapsed, using CSS max-height + overflow.
 */
export default function POIGroupAccordion({
  group,
  metadata,
  defaultExpanded = false,
  accentColor = 'blue',
  sectionSlug = 'poi',
  groupIndex = 0,
}: POIGroupAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const accordionId = useId();
  const contentId = `${accordionId}-content`;
  const buttonId = `${accordionId}-button`;
  
  const summary = generateGroupSummary(metadata);
  
  // Generate stable color classes based on accent color
  const borderColorClass = `border-${accentColor}-500`;
  const textColorClass = `text-${accentColor}-600`;
  const hoverTextColorClass = `hover:text-${accentColor}-800`;
  
  // For dynamic colors, we'll use a fallback approach
  // Since Tailwind needs full class names, we'll use a map
  // Updated color map using theme colors - using warm neutrals and accent
  const colorMap: Record<string, { border: string; text: string; hover: string }> = {
    blue: { border: 'border-[var(--accent1)]', text: 'text-[var(--accent1)]', hover: 'hover:opacity-80' },
    green: { border: 'border-emerald-500', text: 'text-emerald-600', hover: 'hover:text-emerald-800' },
    purple: { border: 'border-[var(--accent1)]', text: 'text-[var(--accent1)]', hover: 'hover:opacity-80' },
    red: { border: 'border-[var(--accent1)]', text: 'text-[var(--accent1)]', hover: 'hover:opacity-80' },
    orange: { border: 'border-amber-500', text: 'text-amber-600', hover: 'hover:text-amber-800' },
    teal: { border: 'border-emerald-500', text: 'text-emerald-600', hover: 'hover:text-emerald-800' },
    indigo: { border: 'border-[var(--accent1)]', text: 'text-[var(--accent1)]', hover: 'hover:opacity-80' },
    pink: { border: 'border-rose-500', text: 'text-rose-600', hover: 'hover:text-rose-800' },
    cyan: { border: 'border-emerald-500', text: 'text-emerald-600', hover: 'hover:text-emerald-800' },
    amber: { border: 'border-amber-500', text: 'text-amber-600', hover: 'hover:text-amber-800' },
    fuchsia: { border: 'border-rose-500', text: 'text-rose-600', hover: 'hover:text-rose-800' },
    emerald: { border: 'border-emerald-500', text: 'text-emerald-600', hover: 'hover:text-emerald-800' },
    sky: { border: 'border-[var(--accent1)]', text: 'text-[var(--accent1)]', hover: 'hover:opacity-80' },
    stone: { border: 'border-stone-500', text: 'text-stone-600', hover: 'hover:text-stone-800' },
    yellow: { border: 'border-amber-500', text: 'text-amber-600', hover: 'hover:text-amber-800' },
    slate: { border: 'border-slate-500', text: 'text-slate-600', hover: 'hover:text-slate-800' },
    violet: { border: 'border-[var(--accent1)]', text: 'text-[var(--accent1)]', hover: 'hover:opacity-80' },
    rose: { border: 'border-rose-500', text: 'text-rose-600', hover: 'hover:text-rose-800' },
  };
  
  // Default to accent color (red) instead of blue
  const colors = colorMap[accentColor] || colorMap.red;
  
  return (
    <div className="mb-6">
      {/* Group Header with Accordion Control */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-gray-900 mb-1.5">{group.label}</h4>
          <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
        </div>
        <button
          id={buttonId}
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          className="flex-shrink-0 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface2)] hover:bg-[var(--surface)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent1)] min-h-[44px] flex items-center gap-2"
        >
          <span className="whitespace-nowrap">
            {isExpanded ? 'Hide places' : 'Show places'}
          </span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      {/* POI Items Container - Always in DOM for SEO */}
      <div className="relative">
        <div
          id={contentId}
          className={`transition-all duration-300 ease-in-out overflow-hidden relative ${
            isExpanded
              ? 'max-h-none'
              : 'max-h-[300px]'
          }`}
        >
          {/* Gradient fade when collapsed */}
          {!isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none z-10" />
          )}
          
          {/* POI Items List */}
          <div className="space-y-3 pt-2">
          {group.items && group.items.length > 0 ? (
            group.items.map((item, itemIndex) => (
              <div
                key={itemIndex}
                className={`border-l-4 ${colors.border} pl-4 py-2`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-medium text-gray-900">{item.name || 'Unnamed place'}</h4>
                      {generateIntentLabel(item, sectionSlug || '', group.label) && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                          {generateIntentLabel(item, sectionSlug || '', group.label)}
                        </span>
                      )}
                    </div>
                    {item.category && (
                      <p className="text-sm text-gray-600 mb-1">{item.category}</p>
                    )}
                    {item.addressText && (
                      <p className="text-sm text-gray-600 mb-1">{item.addressText}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {item.distanceText && (
                        <span className={`text-sm ${colors.text} font-medium`}>
                          {item.distanceText}
                        </span>
                      )}
                      {item.hoursText && (
                        <span className="text-sm text-gray-600">{item.hoursText}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {item.phone && (
                      <a
                        href={`tel:${item.phone}`}
                        className={`text-sm ${colors.text} ${colors.hover} hover:underline`}
                      >
                        {item.phone}
                      </a>
                    )}
                    {item.website && (
                      <a
                        href={item.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-sm ${colors.text} ${colors.hover} hover:underline inline-flex items-center gap-1`}
                      >
                        Website
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">No places listed.</p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
