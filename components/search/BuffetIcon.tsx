import React from 'react';

// ============================================================================
// BUFFET ICON SYSTEM
// 
// Generates colorful, food-themed icons for buffets without photos.
// Uses Chinese food and restaurant motifs with design system colors.
// ============================================================================

// Chinese-themed color palette matching the design system
// Primary: Chinese Red (#C1121F), complemented by traditional Chinese colors
const BUFFET_COLORS = [
  // Chinese Reds (primary brand color)
  { bg: 'linear-gradient(135deg, #C1121F 0%, #7F0A12 100%)', text: '#fff' },  // Primary Chinese Red
  { bg: 'linear-gradient(135deg, #9B1B1B 0%, #C1121F 100%)', text: '#fff' },  // Deep to bright red
  { bg: 'linear-gradient(135deg, #C1121F 0%, #D4463A 100%)', text: '#fff' },  // Red gradient
  
  // Red + Gold (prosperity combination)
  { bg: 'linear-gradient(135deg, #C1121F 0%, #D4A84B 100%)', text: '#fff' },  // Red to gold
  { bg: 'linear-gradient(135deg, #8B0000 0%, #DAA520 100%)', text: '#fff' },  // Dark red to gold
  
  // Imperial Gold/Amber
  { bg: 'linear-gradient(135deg, #D4A84B 0%, #B8860B 100%)', text: '#fff' },  // Gold gradient
  { bg: 'linear-gradient(135deg, #CD853F 0%, #8B4513 100%)', text: '#fff' },  // Amber to brown
  
  // Jade Green (traditional Chinese color)
  { bg: 'linear-gradient(135deg, #2E8B57 0%, #1B5E3C 100%)', text: '#fff' },  // Jade green
  { bg: 'linear-gradient(135deg, #3D7A5D 0%, #1F4E3D 100%)', text: '#fff' },  // Deep jade
  
  // Imperial Blue/Navy (matching header #0B0B0C)
  { bg: 'linear-gradient(135deg, #1E3A5F 0%, #0B1929 100%)', text: '#fff' },  // Imperial navy
  { bg: 'linear-gradient(135deg, #2C3E50 0%, #1A252F 100%)', text: '#fff' },  // Deep slate
  
  // Black/Charcoal (elegant, matches header)
  { bg: 'linear-gradient(135deg, #2D2D2D 0%, #0B0B0C 100%)', text: '#fff' },  // Charcoal to black
  { bg: 'linear-gradient(135deg, #3D3D3D 0%, #1A1A1A 100%)', text: '#fff' },  // Slate gradient
  
  // Warm neutrals (matching design system surface colors)
  { bg: 'linear-gradient(135deg, #6B625A 0%, #4A4540 100%)', text: '#fff' },  // Warm gray
  { bg: 'linear-gradient(135deg, #8B7355 0%, #5C4D3D 100%)', text: '#fff' },  // Warm brown
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
// SVG PICTOGRAMS - Chinese Food & Restaurant Themes
// ============================================================================

const BuffetPictograms = {
  // Chinese food items
  dumpling: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 4C7 4 3 8 3 12c0 2 1 4 3 5.5C8 19 10 20 12 20s4-1 6-2.5c2-1.5 3-3.5 3-5.5 0-4-4-8-9-8z"/>
      <path d="M6 12c0-3 3-6 6-6s6 3 6 6" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5"/>
      <path d="M8 13c1.5 1 2.5 2 4 2s2.5-1 4-2" fill="none" stroke="white" strokeWidth="1" opacity="0.4"/>
    </svg>
  ),
  
  noodles: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M4 8c0-2 3-4 8-4s8 2 8 4v2c0 2-3 4-8 4S4 12 4 10V8z" opacity="0.3"/>
      <path d="M5 10c0 4 3 8 7 10 4-2 7-6 7-10"/>
      <path d="M7 8c1 6 3 10 5 12M12 8c0 6 1 10 2 12M17 8c-1 6-3 10-5 12" fill="none" stroke="white" strokeWidth="1" opacity="0.3"/>
    </svg>
  ),
  
  riceBowl: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M4 11c0 5 3 9 8 9s8-4 8-9H4z"/>
      <ellipse cx="12" cy="11" rx="8" ry="3"/>
      <path d="M7 9c0-1 2-2 5-2s5 1 5 2" fill="none" stroke="white" strokeWidth="1" opacity="0.4"/>
      <path d="M8 13h8M9 15h6" fill="none" stroke="white" strokeWidth="0.8" opacity="0.3"/>
    </svg>
  ),
  
  wok: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M3 10c0 6 4 10 9 10s9-4 9-10H3z"/>
      <ellipse cx="12" cy="10" rx="9" ry="3"/>
      <path d="M19 8l3-3M5 8L2 5" strokeWidth="2" stroke={color}/>
      <circle cx="8" cy="12" r="1" fill="white" opacity="0.5"/>
      <circle cx="12" cy="13" r="1.2" fill="white" opacity="0.5"/>
      <circle cx="15" cy="11" r="0.8" fill="white" opacity="0.5"/>
    </svg>
  ),
  
  chopsticks: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M6 2l3 18M9 2l3 18" strokeWidth="2" stroke={color} fill="none"/>
      <ellipse cx="12" cy="18" rx="6" ry="3" opacity="0.3"/>
      <path d="M8 18c0 1 2 2 4 2s4-1 4-2-2-2-4-2-4 1-4 2z"/>
    </svg>
  ),
  
  teapot: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <circle cx="11" cy="13" r="6"/>
      <path d="M17 11c2 0 3 1 3 2s-1 2-3 2"/>
      <path d="M8 7c0-2 1-3 3-3s3 1 3 3"/>
      <ellipse cx="11" cy="7" rx="3" ry="1"/>
      <path d="M11 4v-2" strokeWidth="1.5" stroke={color}/>
      <path d="M9 12a2 2 0 104 0" fill="none" stroke="white" strokeWidth="1" opacity="0.3"/>
    </svg>
  ),
  
  fortuneCookie: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M4 12c0-3 4-6 8-6s8 3 8 6c0 2-2 4-4 4-1 0-2-1-4-1s-3 1-4 1c-2 0-4-2-4-4z"/>
      <path d="M8 12c2 1 3 2 4 2s2-1 4-2" fill="none" stroke="white" strokeWidth="1.5" opacity="0.4"/>
      <path d="M6 14l-1 4h2M18 14l1 4h-2" fill="none" stroke={color} strokeWidth="1"/>
    </svg>
  ),
  
  steamBasket: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="12" cy="8" rx="8" ry="3"/>
      <path d="M4 8v6c0 2 4 4 8 4s8-2 8-4V8"/>
      <ellipse cx="12" cy="14" rx="8" ry="3" opacity="0.3"/>
      <circle cx="9" cy="11" r="1.5" fill="white" opacity="0.4"/>
      <circle cx="15" cy="11" r="1.5" fill="white" opacity="0.4"/>
      <circle cx="12" cy="13" r="1.5" fill="white" opacity="0.4"/>
      <path d="M8 4c0 0 1-2 4-2s4 2 4 2" fill="none" stroke={color} strokeWidth="1" opacity="0.5"/>
    </svg>
  ),
  
  springRoll: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <rect x="6" y="8" width="12" height="8" rx="4" ry="4"/>
      <path d="M8 10h8M8 14h8" fill="none" stroke="white" strokeWidth="1" opacity="0.3"/>
      <ellipse cx="6" cy="12" rx="2" ry="4" opacity="0.6"/>
      <ellipse cx="18" cy="12" rx="2" ry="4" opacity="0.6"/>
    </svg>
  ),
  
  lantern: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M12 3v2"/>
      <ellipse cx="12" cy="6" rx="3" ry="1"/>
      <path d="M9 6c-1 1-2 3-2 6s1 5 2 6h6c1-1 2-3 2-6s-1-5-2-6H9z"/>
      <ellipse cx="12" cy="18" rx="3" ry="1"/>
      <path d="M10 19v2M14 19v2"/>
      <path d="M9 9h6M9 12h6M9 15h6" fill="none" stroke="white" strokeWidth="0.8" opacity="0.3"/>
    </svg>
  ),
  
  dragon: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M4 12c0 0 2-4 5-4 2 0 3 2 5 2s3-1 4-1c2 0 3 2 3 4s-1 4-3 4c-1 0-2-1-4-1s-3 2-5 2c-3 0-5-4-5-6z"/>
      <circle cx="7" cy="11" r="1" fill="white" opacity="0.6"/>
      <path d="M4 12l-2-2M4 13l-2 1" strokeWidth="1.5" stroke={color}/>
      <path d="M18 10c1-1 2-1 3 0" fill="none" stroke={color} strokeWidth="1.5"/>
    </svg>
  ),
  
  buffetTray: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <rect x="3" y="12" width="18" height="8" rx="2"/>
      <path d="M5 12V10c0-1 3-2 7-2s7 1 7 2v2"/>
      <ellipse cx="12" cy="8" rx="7" ry="2" opacity="0.5"/>
      <path d="M12 5v-3" strokeWidth="2" stroke={color}/>
      <circle cx="12" cy="3" r="1.5"/>
      <path d="M6 15h4M14 15h4" fill="none" stroke="white" strokeWidth="1" opacity="0.3"/>
    </svg>
  ),
  
  soupBowl: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <path d="M3 10c0 6 4 10 9 10s9-4 9-10H3z"/>
      <ellipse cx="12" cy="10" rx="9" ry="3"/>
      <path d="M7 5c0-1 1-1 1 0 0 2-1 3-1 4M12 4c0-1 1-1 1 0 0 2-1 3-1 4M17 5c0-1 1-1 1 0 0 2-1 3-1 4" fill="none" stroke={color} strokeWidth="1" opacity="0.5"/>
      <circle cx="8" cy="12" r="1" fill="white" opacity="0.4"/>
      <circle cx="14" cy="13" r="1.2" fill="white" opacity="0.4"/>
    </svg>
  ),
  
  dimSum: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="8" cy="10" rx="4" ry="3"/>
      <ellipse cx="16" cy="10" rx="4" ry="3"/>
      <ellipse cx="12" cy="15" rx="4" ry="3"/>
      <path d="M8 8v-1c0-.5.5-1 0-1.5" fill="none" stroke="white" strokeWidth="0.8" opacity="0.5"/>
      <path d="M16 8v-1c0-.5.5-1 0-1.5" fill="none" stroke="white" strokeWidth="0.8" opacity="0.5"/>
      <path d="M12 13v-1c0-.5.5-1 0-1.5" fill="none" stroke="white" strokeWidth="0.8" opacity="0.5"/>
    </svg>
  ),
  
  plateFood: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <ellipse cx="12" cy="16" rx="10" ry="4"/>
      <ellipse cx="12" cy="14" rx="8" ry="3" opacity="0.6"/>
      <circle cx="9" cy="12" r="2"/>
      <circle cx="15" cy="12" r="2"/>
      <circle cx="12" cy="10" r="2.5"/>
      <path d="M10 9l2-2 2 2" fill="none" stroke="white" strokeWidth="0.8" opacity="0.4"/>
    </svg>
  ),
  
  chef: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} className="h-5 w-5">
      <circle cx="12" cy="10" r="6"/>
      <path d="M8 10c0-4 2-6 4-6s4 2 4 6" fill="white" opacity="0.3"/>
      <ellipse cx="12" cy="6" rx="5" ry="2"/>
      <path d="M7 16c0 2 2 4 5 4s5-2 5-4"/>
      <circle cx="10" cy="10" r="0.8" fill="white" opacity="0.5"/>
      <circle cx="14" cy="10" r="0.8" fill="white" opacity="0.5"/>
      <path d="M10 12c1 1 3 1 4 0" fill="none" stroke="white" strokeWidth="0.8" opacity="0.4"/>
    </svg>
  ),
};

// Keywords to match in buffet names
const KEYWORD_ICONS: Array<{ keywords: string[]; icon: (color: string) => React.ReactNode }> = [
  { keywords: ['dumpling', 'dim sum', 'dimsum', 'bao'], icon: BuffetPictograms.dumpling },
  { keywords: ['noodle', 'pho', 'ramen', 'lo mein', 'chow mein'], icon: BuffetPictograms.noodles },
  { keywords: ['wok', 'stir fry', 'grill', 'hibachi', 'teppan'], icon: BuffetPictograms.wok },
  { keywords: ['tea', 'boba', 'bubble'], icon: BuffetPictograms.teapot },
  { keywords: ['rice', 'fried rice'], icon: BuffetPictograms.riceBowl },
  { keywords: ['spring roll', 'egg roll', 'roll'], icon: BuffetPictograms.springRoll },
  { keywords: ['steam', 'steamed'], icon: BuffetPictograms.steamBasket },
  { keywords: ['soup', 'hot pot', 'hotpot'], icon: BuffetPictograms.soupBowl },
  { keywords: ['dragon', 'phoenix', 'lucky', 'fortune', 'golden'], icon: BuffetPictograms.dragon },
  { keywords: ['lantern', 'red', 'china', 'chinese', 'oriental', 'asia', 'asian'], icon: BuffetPictograms.lantern },
  { keywords: ['chef', 'kitchen', 'wok', 'cook'], icon: BuffetPictograms.chef },
  { keywords: ['buffet', 'all you can eat', 'feast'], icon: BuffetPictograms.buffetTray },
  { keywords: ['seafood', 'sushi', 'fish', 'crab', 'lobster', 'shrimp'], icon: BuffetPictograms.plateFood },
  { keywords: ['garden', 'jade', 'pearl', 'lotus', 'bamboo'], icon: BuffetPictograms.teapot },
  { keywords: ['palace', 'dynasty', 'emperor', 'king', 'royal'], icon: BuffetPictograms.lantern },
  { keywords: ['express', 'fast', 'quick'], icon: BuffetPictograms.chopsticks },
];

// Get icon based on buffet name
function getBuffetPictogram(name: string): (color: string) => React.ReactNode {
  const lowerName = name.toLowerCase();
  
  // Check for keyword matches
  for (const { keywords, icon } of KEYWORD_ICONS) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        return icon;
      }
    }
  }
  
  // Default: use hash to pick a random food icon
  const hash = hashString(name);
  const allIcons = Object.values(BuffetPictograms);
  return allIcons[hash % allIcons.length];
}

// ============================================================================
// COMPONENT
// ============================================================================

interface BuffetIconProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isHighlighted?: boolean;
}

export function BuffetIcon({ name, size = 'md', isHighlighted = false }: BuffetIconProps) {
  const hash = hashString(name);
  const colorIndex = hash % BUFFET_COLORS.length;
  const color = BUFFET_COLORS[colorIndex];
  const pictogram = getBuffetPictogram(name);
  
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-24 w-24 sm:h-32 sm:w-32',
    xl: 'h-32 w-32',
  };
  
  const iconSizeClasses = {
    sm: '[&_svg]:h-4 [&_svg]:w-4',
    md: '[&_svg]:h-5 [&_svg]:w-5',
    lg: '[&_svg]:h-12 [&_svg]:w-12 sm:[&_svg]:h-16 sm:[&_svg]:w-16',
    xl: '[&_svg]:h-16 [&_svg]:w-16',
  };

  return (
    <div 
      className={`relative flex flex-shrink-0 items-center justify-center rounded-lg overflow-hidden transition-all duration-200 ${sizeClasses[size]} ${iconSizeClasses[size]} ${
        isHighlighted ? 'shadow-md ring-2 ring-white/50 scale-105' : 'shadow-sm'
      }`}
      style={{ background: color.bg }}
    >
      {pictogram(color.text)}
    </div>
  );
}
