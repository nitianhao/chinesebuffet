'use client';

import { useMemo, useState } from 'react';

interface AttributesSummaryProps {
  accessibility?: Record<string, any> | Array<Record<string, boolean>>;
  amenities?: Record<string, any>;
  defaultExpanded?: boolean;
}

/**
 * Generate a human-readable summary sentence from attributes
 */
function generateSummary(
  accessibility: AttributesSummaryProps['accessibility'],
  amenities: AttributesSummaryProps['amenities']
): string {
  const traits: string[] = [];

  // Check for casual/formal indicators
  const serviceOptions = amenities?.['service options'];
  const atmosphere = amenities?.atmosphere;
  
  // Check for casual indicators
  const hasCasual = checkForKeyword(amenities, ['casual', 'informal', 'relaxed']);
  const hasFormal = checkForKeyword(amenities, ['formal', 'upscale', 'elegant', 'fine dining']);
  
  if (hasCasual && !hasFormal) {
    traits.push('casual');
  }

  // Check for affordability
  const hasBudget = checkForKeyword(amenities, ['budget', 'affordable', 'inexpensive']);
  const hasExpensive = checkForKeyword(amenities, ['expensive', 'upscale', 'premium']);
  
  if (hasBudget && !hasExpensive) {
    traits.push('affordable');
  }

  // Check for family-friendly
  const hasFamilyFriendly = checkForKeyword(amenities, ['good for kids', 'children', 'family', 'kid-friendly']);
  const hasHighChairs = checkForKeyword(amenities, ['high chairs', 'highchairs']);
  
  if (hasFamilyFriendly || hasHighChairs) {
    traits.push('family-friendly');
  }

  // Check for quick service
  const hasTakeout = checkForKeyword(serviceOptions, ['takeout', 'take-out', 'to-go']);
  const hasDelivery = checkForKeyword(serviceOptions, ['delivery']);
  const hasQuickService = checkForKeyword(amenities, ['quick', 'fast', 'fast service']);
  
  if (hasTakeout || hasDelivery || hasQuickService) {
    traits.push('quick service');
  }

  // Check for group-friendly
  const hasGroups = checkForKeyword(amenities, ['good for groups', 'large groups', 'party']);
  const hasReservations = checkForKeyword(serviceOptions, ['reservations', 'reservation']);
  
  if (hasGroups || hasReservations) {
    traits.push('group-friendly');
  }

  // Check for accessibility
  const hasWheelchair = checkAccessibility(accessibility, ['wheelchair', 'accessible']);
  
  if (hasWheelchair) {
    traits.push('wheelchair accessible');
  }

  // Check for outdoor seating
  const hasOutdoor = checkForKeyword(amenities, ['outdoor seating', 'outdoor', 'patio', 'terrace']);
  
  if (hasOutdoor) {
    traits.push('outdoor seating');
  }

  // Check for WiFi
  const hasWifi = checkForKeyword(amenities, ['wifi', 'wi-fi', 'wireless', 'internet']);
  
  if (hasWifi) {
    traits.push('WiFi');
  }

  // Build the sentence with varied structures
  if (traits.length === 0) {
    // Fallback: check if we have any amenities at all
    if (amenities && Object.keys(amenities).length > 0) {
      return 'Amenities and services are listed below.';
    }
    return null; // Don't show summary if no traits
  }

  // Vary sentence structures to avoid repetition
  const traitCopy = [...traits];
  
  if (traitCopy.length === 1) {
    // Single trait - vary structure
    const variations = [
      `${traitCopy[0]}.`,
      `Known for ${traitCopy[0]}.`,
      `Features ${traitCopy[0]}.`,
    ];
    return variations[traitCopy[0].length % variations.length];
  }

  if (traitCopy.length === 2) {
    // Two traits - vary structure
    const variations = [
      `${traitCopy[0]} and ${traitCopy[1]}.`,
      `Known for ${traitCopy[0]} and ${traitCopy[1]}.`,
      `${traitCopy[0]}, ${traitCopy[1]}.`,
    ];
    return variations[(traitCopy[0].length + traitCopy[1].length) % variations.length];
  }

  // Three or more traits - use Oxford comma
  const lastTrait = traitCopy.pop()!;
  const variations = [
    `${traitCopy.join(', ')}, and ${lastTrait}.`,
    `Features ${traitCopy.join(', ')}, and ${lastTrait}.`,
    `Known for ${traitCopy.join(', ')}, and ${lastTrait}.`,
  ];
  return variations[traitCopy.length % variations.length];
}

/**
 * Check if a keyword exists in nested data structures
 */
function checkForKeyword(data: any, keywords: string[]): boolean {
  if (!data) return false;
  
  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return keywords.some(k => lower.includes(k.toLowerCase()));
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.some(checkValue);
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  if (Array.isArray(data)) {
    return data.some(checkValue);
  }
  if (typeof data === 'object' && data !== null) {
    return Object.values(data).some(checkValue);
  }
  return checkValue(data);
}

/**
 * Check accessibility data for keywords
 */
function checkAccessibility(
  accessibility: AttributesSummaryProps['accessibility'],
  keywords: string[]
): boolean {
  if (!accessibility) return false;
  
  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return keywords.some(k => lower.includes(k.toLowerCase()));
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.some(checkValue);
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).some(([key, val]) => {
        const keyLower = key.toLowerCase();
        if (keywords.some(k => keyLower.includes(k.toLowerCase()))) {
          return val === true || val === 'yes' || val === 'true';
        }
        return checkValue(val);
      });
    }
    return false;
  };

  if (Array.isArray(accessibility)) {
    return accessibility.some(checkValue);
  }
  if (typeof accessibility === 'object') {
    return Object.values(accessibility).some(checkValue);
  }
  return checkValue(accessibility);
}

export default function AttributesSummary({
  accessibility,
  amenities,
  children,
  defaultExpanded = false,
}: AttributesSummaryProps & { children: React.ReactNode }) {
  const summary = useMemo(
    () => generateSummary(accessibility, amenities),
    [accessibility, amenities]
  );

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // If no summary and no children content, don't render
  if (!summary && !children) {
    return null;
  }

  return (
    <div>
      {/* Summary Sentence */}
      {summary && (
        <p className="text-base text-gray-700 mb-4 leading-relaxed font-medium">
          {summary}
        </p>
      )}

      {/* Collapsible Detailed Breakdown - only show if there are children */}
      {children && (
        <div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-3 transition-colors"
            aria-expanded={isExpanded}
          >
            <span>{isExpanded ? 'Hide' : 'Show'} detailed breakdown</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              isExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="pt-2">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
