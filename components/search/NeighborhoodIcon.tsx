'use client';

import React from 'react';

// ============================================================================
// NEIGHBORHOOD ICON
// 
// Generates unique, colorful icons for neighborhoods based on their name.
// Uses a house/building theme to distinguish from city skyline icons.
// ============================================================================

// Vibrant color palette - different shades than cities
const NEIGHBORHOOD_COLORS = [
  { bg: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', text: '#fff' }, // Indigo to Purple
  { bg: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)', text: '#fff' }, // Pink
  { bg: 'linear-gradient(135deg, #14B8A6 0%, #2DD4BF 100%)', text: '#fff' }, // Teal
  { bg: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)', text: '#fff' }, // Amber
  { bg: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)', text: '#fff' }, // Red
  { bg: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)', text: '#fff' }, // Blue
  { bg: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)', text: '#fff' }, // Emerald
  { bg: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)', text: '#fff' }, // Violet
  { bg: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)', text: '#fff' }, // Orange
  { bg: 'linear-gradient(135deg, #06B6D4 0%, #22D3EE 100%)', text: '#fff' }, // Cyan
  { bg: 'linear-gradient(135deg, #84CC16 0%, #A3E635 100%)', text: '#fff' }, // Lime
  { bg: 'linear-gradient(135deg, #D946EF 0%, #E879F9 100%)', text: '#fff' }, // Fuchsia
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Neighborhood-themed pictograms
const NeighborhoodPictograms = {
  // Residential - houses and buildings
  house: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 3L4 9v12h16V9l-8-6zm0 3l5 3.75V18h-3v-4H10v4H7V9.75L12 6z"/>
    </svg>
  ),
  
  buildings: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/>
    </svg>
  ),
  
  apartment: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/>
    </svg>
  ),
  
  townhouse: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M1 22h22V10L12 3 1 10v12zm3-2v-8l8-5 8 5v8H4zm2-6h4v6H6v-6zm6 0h4v6h-4v-6z"/>
    </svg>
  ),
  
  neighborhood: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3zm0 3.5l5 4.5v6h-2v-5H9v5H7v-6l5-4.5z"/>
    </svg>
  ),
  
  community: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93s3.06-7.44 7-7.93v15.86zm2-15.86c3.94.49 7 3.85 7 7.93s-3.06 7.44-7 7.93V4.07z"/>
    </svg>
  ),
};

// Get a consistent pictogram for a neighborhood
function getNeighborhoodPictogram(neighborhoodName: string, cityName: string): (color: string) => React.ReactNode {
  const hash = hashString(neighborhoodName + cityName);
  const pictograms = Object.values(NeighborhoodPictograms);
  return pictograms[hash % pictograms.length];
}

// ============================================================================
// COMPONENT
// ============================================================================

interface NeighborhoodIconProps {
  neighborhoodName: string;
  cityName: string;
  stateAbbr: string;
  size?: 'sm' | 'md' | 'lg';
  isHighlighted?: boolean;
}

export function NeighborhoodIcon({ 
  neighborhoodName, 
  cityName, 
  stateAbbr, 
  size = 'md', 
  isHighlighted = false 
}: NeighborhoodIconProps) {
  const hash = hashString(neighborhoodName + cityName + stateAbbr);
  const colorIndex = hash % NEIGHBORHOOD_COLORS.length;
  const color = NEIGHBORHOOD_COLORS[colorIndex];
  const pictogram = getNeighborhoodPictogram(neighborhoodName, cityName);
  
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  return (
    <div 
      className={`relative flex flex-shrink-0 items-center justify-center rounded-lg overflow-hidden transition-all duration-200 ${sizeClasses[size]} ${
        isHighlighted ? 'shadow-md ring-2 ring-white/50 scale-105' : 'shadow-sm'
      }`}
      style={{ background: color.bg }}
    >
      {pictogram(color.text)}
    </div>
  );
}
