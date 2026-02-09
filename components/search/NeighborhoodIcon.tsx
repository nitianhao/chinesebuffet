import React from 'react';

// ============================================================================
// NEIGHBORHOOD ICON
// 
// Generates unique, colorful icons for neighborhoods based on their name.
// Uses a house/building theme with Chinese-themed colors.
// ============================================================================

// Chinese-themed color palette matching the design system
const NEIGHBORHOOD_COLORS = [
  // Chinese Reds
  { bg: 'linear-gradient(135deg, #C1121F 0%, #8B0A14 100%)', text: '#fff' },  // Chinese red
  { bg: 'linear-gradient(135deg, #A51C1C 0%, #D43D3D 100%)', text: '#fff' },  // Bright red
  
  // Gold/Amber (prosperity)
  { bg: 'linear-gradient(135deg, #D4A84B 0%, #996515 100%)', text: '#fff' },  // Gold
  { bg: 'linear-gradient(135deg, #CD853F 0%, #A0522D 100%)', text: '#fff' },  // Amber
  
  // Jade Green
  { bg: 'linear-gradient(135deg, #2E8B57 0%, #1B5E3C 100%)', text: '#fff' },  // Jade
  { bg: 'linear-gradient(135deg, #3CB371 0%, #228B22 100%)', text: '#fff' },  // Forest jade
  
  // Imperial Blue/Navy
  { bg: 'linear-gradient(135deg, #1E3A5F 0%, #0D1F33 100%)', text: '#fff' },  // Navy
  { bg: 'linear-gradient(135deg, #34495E 0%, #1A252F 100%)', text: '#fff' },  // Slate blue
  
  // Black/Charcoal
  { bg: 'linear-gradient(135deg, #2D2D2D 0%, #111111 100%)', text: '#fff' },  // Charcoal
  { bg: 'linear-gradient(135deg, #3D3D3D 0%, #1E1E1E 100%)', text: '#fff' },  // Dark gray
  
  // Warm neutrals
  { bg: 'linear-gradient(135deg, #6B625A 0%, #4A4540 100%)', text: '#fff' },  // Warm gray
  { bg: 'linear-gradient(135deg, #7D6B5D 0%, #5C4D3D 100%)', text: '#fff' },  // Taupe
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
