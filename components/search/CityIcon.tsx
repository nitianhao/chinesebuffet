import React from 'react';

// ============================================================================
// CITY PICTOGRAM SYSTEM
// 
// 1. Major cities get specific iconic symbols (landmarks, culture)
// 2. Other cities get state-based regional symbols
// 3. Colors are still unique per city for visual variety
// ============================================================================

// Chinese-themed color palette matching the design system
const CITY_COLORS = [
  // Chinese Reds (primary)
  { bg: 'linear-gradient(135deg, #C1121F 0%, #7F0A12 100%)', text: '#fff' },  // Primary Chinese Red
  { bg: 'linear-gradient(135deg, #9B1B1B 0%, #C1121F 100%)', text: '#fff' },  // Deep to bright red
  { bg: 'linear-gradient(135deg, #B91C1C 0%, #DC2626 100%)', text: '#fff' },  // Vibrant red
  
  // Red + Gold combinations
  { bg: 'linear-gradient(135deg, #C1121F 0%, #D4A84B 100%)', text: '#fff' },  // Red to gold
  { bg: 'linear-gradient(135deg, #8B0000 0%, #DAA520 100%)', text: '#fff' },  // Dark red to gold
  
  // Imperial Gold/Amber
  { bg: 'linear-gradient(135deg, #D4A84B 0%, #B8860B 100%)', text: '#fff' },  // Gold gradient
  { bg: 'linear-gradient(135deg, #CD853F 0%, #996515 100%)', text: '#fff' },  // Amber
  { bg: 'linear-gradient(135deg, #DAA520 0%, #B8860B 100%)', text: '#fff' },  // Golden rod
  
  // Jade Green
  { bg: 'linear-gradient(135deg, #2E8B57 0%, #1B5E3C 100%)', text: '#fff' },  // Jade
  { bg: 'linear-gradient(135deg, #3D7A5D 0%, #1F4E3D 100%)', text: '#fff' },  // Deep jade
  
  // Imperial Navy/Blue
  { bg: 'linear-gradient(135deg, #1E3A5F 0%, #0B1929 100%)', text: '#fff' },  // Imperial navy
  { bg: 'linear-gradient(135deg, #2C3E50 0%, #1A252F 100%)', text: '#fff' },  // Deep slate
  
  // Black/Charcoal (matches header)
  { bg: 'linear-gradient(135deg, #2D2D2D 0%, #0B0B0C 100%)', text: '#fff' },  // Charcoal
  { bg: 'linear-gradient(135deg, #3D3D3D 0%, #1A1A1A 100%)', text: '#fff' },  // Dark slate
  
  // Warm neutrals (design system)
  { bg: 'linear-gradient(135deg, #6B625A 0%, #4A4540 100%)', text: '#fff' },  // Warm gray
  { bg: 'linear-gradient(135deg, #7D6B5D 0%, #4E4239 100%)', text: '#fff' },  // Taupe
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

// ============================================================================
// SVG PICTOGRAMS - Simple, recognizable symbols
// ============================================================================

const Pictograms = {
  // Landmarks & Buildings
  skyline: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M3 21h18v-2H3v2zm0-4h3v-3H3v3zm5 0h3v-6H8v6zm5 0h3v-9h-3v9zm5 0h3v-12h-3v12z"/>
    </svg>
  ),
  
  libertyTorch: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 2L9 9h6L12 2zm-1 9v4h2v-4h-2zm-1 5v2h4v-2h-4zm-1 3v3h6v-3H9z"/>
      <path d="M12 4l2 4h-4l2-4z" opacity="0.6"/>
    </svg>
  ),
  
  goldenGate: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M2 18h20v2H2v-2zm1-2h3v-6H3v6zm15 0h3v-6h-3v6zm-9 0h6v-8H9v8zm2-10h2v2h-2V6zm-8 4h3v2H3v-2zm15 0h3v2h-3v-2z"/>
    </svg>
  ),
  
  spaceNeedle: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M11 22h2v-8h-2v8zm-3-9h8l-1-3H9l-1 3zm4-4h-1V4l1-2 1 2v5h-1z"/>
      <ellipse cx="12" cy="9" rx="5" ry="1.5"/>
    </svg>
  ),
  
  arch: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M4 20h16v2H4v-2zm2-2c0-6 2.7-14 6-14s6 8 6 14h-2c0-5-2-11-4-11s-4 6-4 11H6z"/>
    </svg>
  ),
  
  // Nature & Geography
  palmTree: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M11 22h2V10h-2v12zm1-14c2 0 5-2 7-4-2-1-5 0-7 2V4c0-1-2-1-2 0v2c-2-2-5-3-7-2 2 2 5 4 7 4h2z"/>
      <path d="M12 8c1.5 0 3.5-1.5 5-3-1.5-.5-3.5.5-5 2-1.5-1.5-3.5-2.5-5-2 1.5 1.5 3.5 3 5 3z" opacity="0.7"/>
    </svg>
  ),
  
  cactus: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M10 22h4V8h-4v14zm5-10h2v-4c0-1-2-1-2 0v4zm-8 0h2V8c0-1-2-1-2 0v4zm3-6c0-2 4-2 4 0v2h-4V6z"/>
    </svg>
  ),
  
  mountain: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 4l8 16H4L12 4zm0 4l-4 8h8l-4-8z" opacity="0.6"/>
      <path d="M12 4l8 16H4L12 4z"/>
      <path d="M12 7l2 3-2 1-2-1 2-3z" fill="white" opacity="0.4"/>
    </svg>
  ),
  
  beach: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M2 18c2-1 4-1 6 0s4 1 6 0 4-1 6 0v3H2v-3z"/>
      <circle cx="18" cy="6" r="3" opacity="0.8"/>
      <path d="M7 8l1 9h2l-1-9c2-2 5-2 7 0l-1 9h2l1-9c-2-4-7-5-10-3l-1 3z"/>
    </svg>
  ),
  
  forest: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 2l-5 7h3l-4 6h4l-4 6h12l-4-6h4l-4-6h3L12 2z"/>
      <path d="M11 21h2v-3h-2v3z"/>
    </svg>
  ),
  
  plains: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M2 16c3-2 6-2 9 0s6 2 9 0v6H2v-6z"/>
      <circle cx="18" cy="6" r="2.5" opacity="0.7"/>
      <path d="M8 10c0-3 2-5 2-7 0 2 2 4 2 7s-1 4-2 4-2-1-2-4z" opacity="0.8"/>
    </svg>
  ),
  
  lake: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="12" cy="14" rx="9" ry="5"/>
      <path d="M6 10l6-8 6 8" opacity="0.6"/>
      <path d="M12 5l3 4H9l3-4z" fill="white" opacity="0.3"/>
    </svg>
  ),
  
  // Culture & Industry
  filmReel: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <circle cx="12" cy="12" r="9" opacity="0.3"/>
      <circle cx="12" cy="12" r="7"/>
      <circle cx="12" cy="12" r="2" fill="white" opacity="0.5"/>
      <circle cx="12" cy="6" r="1.5" fill="white" opacity="0.5"/>
      <circle cx="12" cy="18" r="1.5" fill="white" opacity="0.5"/>
      <circle cx="6" cy="12" r="1.5" fill="white" opacity="0.5"/>
      <circle cx="18" cy="12" r="1.5" fill="white" opacity="0.5"/>
    </svg>
  ),
  
  music: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 3v12.5c-.8-.5-2-.5-3 .5-1.5 1.5-1.5 3 0 4s3 .5 4-1V7l6-2v9.5c-.8-.5-2-.5-3 .5-1.5 1.5-1.5 3 0 4s3 .5 4-1V3l-8 2z"/>
    </svg>
  ),
  
  casino: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6l2-6z"/>
      <circle cx="12" cy="12" r="3" fill="white" opacity="0.3"/>
    </svg>
  ),
  
  capitol: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M3 21h18v-2H3v2zm2-3h14v-2H5v2zm1-3h12v-4H6v4zm5-5h2V7h-2v3zm-4 0h2V9H8v1zm6 0h2V9h-2v1z"/>
      <path d="M12 4c1 0 2 1 2 2h-4c0-1 1-2 2-2z"/>
      <circle cx="12" cy="4" r="1.5"/>
    </svg>
  ),
  
  tech: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <rect x="4" y="6" width="16" height="10" rx="1"/>
      <path d="M8 18h8v1H8v-1z"/>
      <path d="M12 18v2"/>
      <path d="M7 9h4m-4 2h6m-6 2h3" stroke="white" strokeWidth="1" opacity="0.5"/>
    </svg>
  ),
  
  oil: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M6 22h3v-8l-3-4v12zm9 0h3V10l-3 4v8zm-4-8l3-4 3 4v8h-6v-8z"/>
      <path d="M11 3h2l1 3h-4l1-3z"/>
      <path d="M10 6h4v2h-4V6z"/>
    </svg>
  ),
  
  // Regional symbols
  lobster: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="12" cy="14" rx="4" ry="6"/>
      <path d="M8 10c-2-2-4-1-5 1l3 2m8-3c2-2 4-1 5 1l-3 2"/>
      <circle cx="10" cy="11" r="1" fill="white" opacity="0.5"/>
      <circle cx="14" cy="11" r="1" fill="white" opacity="0.5"/>
      <path d="M10 19l-1 3m5-3l1 3m-3-3v3"/>
    </svg>
  ),
  
  corn: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="12" cy="12" rx="4" ry="7"/>
      <path d="M12 5c-1-2-2-3-4-3 1 1 2 3 2 5m4-2c1-2 2-3 4-3-1 1-2 3-2 5"/>
      <path d="M9 9h6m-6 2h6m-6 2h6m-5 2h4" stroke="white" strokeWidth="0.8" opacity="0.4"/>
    </svg>
  ),
  
  peach: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 20c-4 0-7-4-7-8s3-8 7-8 7 4 7 8-3 8-7 8z"/>
      <path d="M12 4c0-2 2-2 3-1-1 1-2 2-3 3"/>
      <path d="M10 6c2 0 3 1 3 2" stroke="white" strokeWidth="1" opacity="0.4" fill="none"/>
    </svg>
  ),
  
  cowboy: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="12" cy="16" rx="5" ry="3"/>
      <path d="M7 16c-2 0-4-1-4-2s3-1 4 0m10 2c2 0 4-1 4-2s-3-1-4 0"/>
      <path d="M8 13h8c0-3-2-5-4-5s-4 2-4 5z"/>
      <ellipse cx="12" cy="13" rx="5" ry="1.5"/>
    </svg>
  ),
  
  maple: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 2l1 4 3-2-1 4 4 1-3 2 2 3-4-1 1 4-3-2-1 4v-4l-3 2 1-4-4-1 3-2-2-3 4 1-1-4 3 2 1-4z"/>
      <path d="M11 19h2v3h-2v-3z"/>
    </svg>
  ),
  
  rocket: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 2c-3 3-4 8-4 12h8c0-4-1-9-4-12z"/>
      <path d="M8 14l-2 4h2v4l4-4-4-4zm8 0l2 4h-2v4l-4-4 4-4z" opacity="0.7"/>
      <circle cx="12" cy="9" r="2" fill="white" opacity="0.4"/>
    </svg>
  ),
};

// ============================================================================
// CITY → PICTOGRAM MAPPINGS
// ============================================================================

// Major cities with specific icons
const CITY_ICONS: Record<string, (color: string) => React.ReactNode> = {
  // New York
  'new york_ny': Pictograms.libertyTorch,
  'manhattan_ny': Pictograms.libertyTorch,
  'brooklyn_ny': Pictograms.skyline,
  'queens_ny': Pictograms.skyline,
  'bronx_ny': Pictograms.skyline,
  
  // California
  'los angeles_ca': Pictograms.filmReel,
  'hollywood_ca': Pictograms.filmReel,
  'san francisco_ca': Pictograms.goldenGate,
  'oakland_ca': Pictograms.goldenGate,
  'san diego_ca': Pictograms.beach,
  'san jose_ca': Pictograms.tech,
  'palo alto_ca': Pictograms.tech,
  'santa monica_ca': Pictograms.beach,
  'malibu_ca': Pictograms.beach,
  
  // Pacific Northwest
  'seattle_wa': Pictograms.spaceNeedle,
  'portland_or': Pictograms.forest,
  
  // Southwest
  'phoenix_az': Pictograms.cactus,
  'tucson_az': Pictograms.cactus,
  'scottsdale_az': Pictograms.cactus,
  'las vegas_nv': Pictograms.casino,
  'reno_nv': Pictograms.casino,
  'albuquerque_nm': Pictograms.cactus,
  'santa fe_nm': Pictograms.cactus,
  
  // Texas
  'houston_tx': Pictograms.rocket,
  'dallas_tx': Pictograms.cowboy,
  'austin_tx': Pictograms.music,
  'san antonio_tx': Pictograms.cowboy,
  'fort worth_tx': Pictograms.cowboy,
  'el paso_tx': Pictograms.cactus,
  
  // Midwest
  'chicago_il': Pictograms.skyline,
  'st. louis_mo': Pictograms.arch,
  'saint louis_mo': Pictograms.arch,
  'kansas city_mo': Pictograms.plains,
  'detroit_mi': Pictograms.skyline,
  'minneapolis_mn': Pictograms.lake,
  'milwaukee_wi': Pictograms.lake,
  'indianapolis_in': Pictograms.capitol,
  'columbus_oh': Pictograms.capitol,
  'cleveland_oh': Pictograms.lake,
  'cincinnati_oh': Pictograms.skyline,
  
  // South
  'miami_fl': Pictograms.palmTree,
  'orlando_fl': Pictograms.palmTree,
  'tampa_fl': Pictograms.beach,
  'jacksonville_fl': Pictograms.beach,
  'atlanta_ga': Pictograms.peach,
  'savannah_ga': Pictograms.peach,
  'nashville_tn': Pictograms.music,
  'memphis_tn': Pictograms.music,
  'new orleans_la': Pictograms.music,
  'charlotte_nc': Pictograms.forest,
  'raleigh_nc': Pictograms.forest,
  
  // Northeast
  'boston_ma': Pictograms.lobster,
  'cambridge_ma': Pictograms.lobster,
  'philadelphia_pa': Pictograms.capitol,
  'pittsburgh_pa': Pictograms.skyline,
  'washington_dc': Pictograms.capitol,
  'baltimore_md': Pictograms.lobster,
  
  // Mountain West
  'denver_co': Pictograms.mountain,
  'boulder_co': Pictograms.mountain,
  'salt lake city_ut': Pictograms.mountain,
  'boise_id': Pictograms.mountain,
};

// State-based fallback icons
const STATE_ICONS: Record<string, (color: string) => React.ReactNode> = {
  // Northeast - Coastal/Historic
  'MA': Pictograms.lobster,
  'ME': Pictograms.lobster,
  'NH': Pictograms.forest,
  'VT': Pictograms.maple,
  'CT': Pictograms.forest,
  'RI': Pictograms.beach,
  'NY': Pictograms.skyline,
  'NJ': Pictograms.beach,
  'PA': Pictograms.forest,
  'DE': Pictograms.beach,
  'MD': Pictograms.lobster,
  'DC': Pictograms.capitol,
  
  // Southeast - Warm/Coastal
  'VA': Pictograms.forest,
  'WV': Pictograms.mountain,
  'NC': Pictograms.forest,
  'SC': Pictograms.palmTree,
  'GA': Pictograms.peach,
  'FL': Pictograms.palmTree,
  'AL': Pictograms.forest,
  'MS': Pictograms.music,
  'LA': Pictograms.music,
  'TN': Pictograms.music,
  'KY': Pictograms.forest,
  'AR': Pictograms.forest,
  
  // Midwest - Plains/Lakes
  'OH': Pictograms.lake,
  'MI': Pictograms.lake,
  'IN': Pictograms.corn,
  'IL': Pictograms.skyline,
  'WI': Pictograms.lake,
  'MN': Pictograms.lake,
  'IA': Pictograms.corn,
  'MO': Pictograms.arch,
  'ND': Pictograms.plains,
  'SD': Pictograms.plains,
  'NE': Pictograms.corn,
  'KS': Pictograms.plains,
  
  // Southwest - Desert
  'TX': Pictograms.cowboy,
  'OK': Pictograms.oil,
  'NM': Pictograms.cactus,
  'AZ': Pictograms.cactus,
  'NV': Pictograms.casino,
  
  // Mountain West
  'CO': Pictograms.mountain,
  'UT': Pictograms.mountain,
  'WY': Pictograms.mountain,
  'MT': Pictograms.mountain,
  'ID': Pictograms.mountain,
  
  // Pacific
  'WA': Pictograms.forest,
  'OR': Pictograms.forest,
  'CA': Pictograms.palmTree,
  'AK': Pictograms.mountain,
  'HI': Pictograms.beach,
};

// Get the appropriate icon for a city
function getCityPictogram(cityName: string, stateAbbr: string): (color: string) => React.ReactNode {
  // Normalize for lookup
  const cityKey = `${cityName.toLowerCase()}_${stateAbbr.toLowerCase()}`;
  
  // Check for specific city icon first
  if (CITY_ICONS[cityKey]) {
    return CITY_ICONS[cityKey];
  }
  
  // Fall back to state icon
  if (STATE_ICONS[stateAbbr.toUpperCase()]) {
    return STATE_ICONS[stateAbbr.toUpperCase()];
  }
  
  // Default fallback
  return Pictograms.skyline;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface CityIconProps {
  cityName: string;
  stateAbbr: string;
  size?: 'sm' | 'md' | 'lg';
  isHighlighted?: boolean;
}

export function CityIcon({ cityName, stateAbbr, size = 'md', isHighlighted = false }: CityIconProps) {
  const hash = hashString(cityName + stateAbbr);
  const colorIndex = hash % CITY_COLORS.length;
  const color = CITY_COLORS[colorIndex];
  const pictogram = getCityPictogram(cityName, stateAbbr);
  
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
