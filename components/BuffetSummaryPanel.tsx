import { extractThemes, Review, Theme } from '@/lib/reviewThemes';
import ExpandableList from '@/components/ui/ExpandableList';

interface BuffetSummaryPanelProps {
  buffet: {
    name?: string;
    rating?: number;
    reviewsCount?: number;
    price?: string | null;
    address?: string | {
      street?: string;
      city?: string;
      state?: string;
      full?: string;
    };
    hours?: {
      hours?: any;
    };
    reviews?: Review[];
    amenities?: {
      'service options'?: Record<string, any> | Array<Record<string, boolean>>;
      payments?: Record<string, any> | Array<Record<string, boolean>>;
      'food and drink'?: Record<string, any> | Array<Record<string, boolean>>;
      planning?: Record<string, any> | Array<Record<string, boolean>>;
      [key: string]: any;
    };
    accessibility?: Record<string, any> | Array<Record<string, boolean>>;
    reserveTableUrl?: string | null;
    tableReservationLinks?: Array<{ url?: string; name?: string }> | null;
  };
}

interface HumanTheme {
  icon: string;
  phrase: string;
  context: string;
}

interface LogisticsItem {
  icon: string;
  label: string;
  context: string;
}

/**
 * Transform theme into human-readable phrase with icon and context
 */
function transformThemeToHuman(theme: Theme): HumanTheme {
  const themeMap: Record<string, { icon: string; phrase: string; context: string }> = {
    value: {
      icon: '💰',
      phrase: 'Great value for families',
      context: 'Generous portions at reasonable prices',
    },
    variety: {
      icon: '📋',
      phrase: 'Huge selection',
      context: 'Lots of options to choose from',
    },
    taste: {
      icon: '🍽️',
      phrase: 'Delicious food',
      context: 'Multiple reviewers praise the taste and flavor',
    },
    freshness: {
      icon: '✨',
      phrase: 'Fresh, quality food',
      context: 'Multiple reviewers mention the freshness',
    },
    service: {
      icon: '👥',
      phrase: 'Friendly service',
      context: 'Attentive and helpful staff',
    },
    cleanliness: {
      icon: '🧹',
      phrase: 'Clean, comfortable',
      context: 'Well-maintained dining area',
    },
    atmosphere: {
      icon: '🌟',
      phrase: 'Nice atmosphere',
      context: 'Pleasant and welcoming environment',
    },
    family: {
      icon: '👨‍👩‍👧‍👦',
      phrase: 'Great for families',
      context: 'Kid-friendly and family-oriented',
    },
    speed: {
      icon: '⚡',
      phrase: 'Quick service',
      context: 'No long waits',
    },
    dessert: {
      icon: '🍰',
      phrase: 'Great desserts',
      context: 'Wide selection of sweets',
    },
    sushi: {
      icon: '🍣',
      phrase: 'Fresh sushi',
      context: 'Quality sushi selection',
    },
    seafood: {
      icon: '🦀',
      phrase: 'Fresh seafood',
      context: 'Quality crab and seafood options',
    },
  };

  const mapped = themeMap[theme.key];
  if (mapped) {
    return mapped;
  }

  // Fallback for unknown themes
  return {
    icon: '⭐',
    phrase: theme.label,
    context: `Mentioned by multiple reviewers`,
  };
}

/**
 * Helper to check if a value is truthy/available
 */
function isAvailable(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    return normalized !== '' && normalized !== 'no' && normalized !== 'false';
  }
  if (typeof value === 'number') return value > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

/**
 * Extract prioritized logistics items (decision-critical only)
 * Returns items with icons, filtered and prioritized
 */
function getLogisticsItems(buffet: BuffetSummaryPanelProps['buffet']): LogisticsItem[] {
  const items: LogisticsItem[] = [];

  // 1. Parking (highest priority - decision-critical)
  if (buffet.amenities?.parking) {
    const parking = buffet.amenities.parking;
    let hasParking = false;
    
    if (Array.isArray(parking)) {
      for (const item of parking) {
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            if (isAvailable(value)) {
              hasParking = true;
              break;
            }
          }
        }
      }
    } else if (typeof parking === 'object') {
      hasParking = Object.values(parking).some(value => isAvailable(value));
    }
    
    if (hasParking) {
      items.push({ icon: '🅿️', label: 'Parking available', context: 'Convenient parking for customers' });
    }
  }

  // 2. Wheelchair accessibility (important for some users)
  if (buffet.accessibility) {
    let hasWheelchair = false;
    
    if (Array.isArray(buffet.accessibility)) {
      for (const item of buffet.accessibility) {
        if (typeof item === 'string') {
          if (item.toLowerCase().includes('wheelchair') || item.toLowerCase().includes('accessible')) {
            hasWheelchair = true;
            break;
          }
        } else if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            const keyLower = key.toLowerCase();
            if (isAvailable(value) && (keyLower.includes('wheelchair') || keyLower.includes('accessible'))) {
              hasWheelchair = true;
              break;
            }
          }
        }
      }
    } else if (typeof buffet.accessibility === 'object') {
      for (const [key, value] of Object.entries(buffet.accessibility)) {
        const keyLower = key.toLowerCase();
        if (isAvailable(value) && (keyLower.includes('wheelchair') || keyLower.includes('accessible'))) {
          hasWheelchair = true;
          break;
        }
      }
    }
    
    if (hasWheelchair) {
      items.push({ icon: '♿', label: 'Wheelchair accessible', context: 'Accessible entrance and facilities' });
    }
  }

  // 3. Kid-friendly (decision-critical for families)
  if (buffet.amenities?.planning) {
    const planning = buffet.amenities.planning;
    let hasKids = false;
    
    if (Array.isArray(planning)) {
      for (const item of planning) {
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            const keyLower = key.toLowerCase();
            if (isAvailable(value) && (keyLower.includes('kid') || keyLower.includes('child') || keyLower.includes('family'))) {
              hasKids = true;
              break;
            }
          }
        }
      }
    } else if (typeof planning === 'object') {
      for (const [key, value] of Object.entries(planning)) {
        const keyLower = key.toLowerCase();
        if (isAvailable(value) && (keyLower.includes('kid') || keyLower.includes('child') || keyLower.includes('family'))) {
          hasKids = true;
          break;
        }
      }
    }
    
    if (hasKids) {
      items.push({ icon: '👨‍👩‍👧‍👦', label: 'Kid-friendly', context: 'Family-friendly environment' });
    }
  }

  // 4. Alcohol (decision factor for some)
  if (buffet.amenities?.['food and drink']) {
    const foodDrink = buffet.amenities['food and drink'];
    let hasAlcohol = false;
    
    if (Array.isArray(foodDrink)) {
      for (const item of foodDrink) {
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            const keyLower = key.toLowerCase();
            if (isAvailable(value) && (keyLower.includes('beer') || keyLower.includes('wine') || keyLower.includes('alcohol') || keyLower.includes('cocktail'))) {
              hasAlcohol = true;
              break;
            }
          }
        }
      }
    } else if (typeof foodDrink === 'object') {
      for (const [key, value] of Object.entries(foodDrink)) {
        const keyLower = key.toLowerCase();
        if (isAvailable(value) && (keyLower.includes('beer') || keyLower.includes('wine') || keyLower.includes('alcohol') || keyLower.includes('cocktail'))) {
          hasAlcohol = true;
          break;
        }
      }
    }
    
    if (hasAlcohol) {
      items.push({ icon: '🍺', label: 'Alcohol served', context: 'Beer, wine, and cocktails available' });
    }
  }

  // Fallback: Add service options if we have fewer than 3 items
  if (items.length < 3 && buffet.amenities?.['service options']) {
    const serviceOptions = buffet.amenities['service options'];
    const serviceLabels: string[] = [];
    
    if (Array.isArray(serviceOptions)) {
      for (const item of serviceOptions) {
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            if (isAvailable(value)) {
              const keyLower = key.toLowerCase();
              if (keyLower.includes('dine') || keyLower.includes('dining')) {
                if (!serviceLabels.includes('Dine-in')) serviceLabels.push('Dine-in');
              } else if (keyLower.includes('takeout') || keyLower.includes('take out') || keyLower.includes('take-out')) {
                if (!serviceLabels.includes('Takeout')) serviceLabels.push('Takeout');
              } else if (keyLower.includes('delivery')) {
                if (!serviceLabels.includes('Delivery')) serviceLabels.push('Delivery');
              }
            }
          }
        }
      }
    } else if (typeof serviceOptions === 'object') {
      for (const [key, value] of Object.entries(serviceOptions)) {
        if (isAvailable(value)) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes('dine') || keyLower.includes('dining')) {
            if (!serviceLabels.includes('Dine-in')) serviceLabels.push('Dine-in');
          } else if (keyLower.includes('takeout') || keyLower.includes('take out') || keyLower.includes('take-out')) {
            if (!serviceLabels.includes('Takeout')) serviceLabels.push('Takeout');
          } else if (keyLower.includes('delivery')) {
            if (!serviceLabels.includes('Delivery')) serviceLabels.push('Delivery');
          }
        }
      }
    }
    
    // Add service options with icons
    for (const label of serviceLabels) {
      if (items.length >= 5) break;
      if (label === 'Dine-in' && !items.some(item => item.label.includes('Dine'))) {
        items.push({ icon: '🍽️', label: 'Dine-in available', context: 'Eat in the restaurant' });
      } else if (label === 'Takeout' && !items.some(item => item.label.includes('Takeout'))) {
        items.push({ icon: '🥡', label: 'Takeout available', context: 'Order to go' });
      } else if (label === 'Delivery' && !items.some(item => item.label.includes('Delivery'))) {
        items.push({ icon: '🚚', label: 'Delivery available', context: 'Delivery service offered' });
      }
    }
  }

  // Fallback: Add reservations if we still have fewer than 3 items
  if (items.length < 3 && (buffet.reserveTableUrl || (buffet.tableReservationLinks && buffet.tableReservationLinks.length > 0))) {
    items.push({ icon: '📅', label: 'Reservations accepted', context: 'Book a table in advance' });
  }

  // Fallback: Add credit cards if we still have fewer than 3 items (only as fallback)
  if (items.length < 3 && buffet.amenities?.payments) {
    const payments = buffet.amenities.payments;
    let hasCreditCard = false;
    
    if (Array.isArray(payments)) {
      for (const item of payments) {
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            const keyLower = key.toLowerCase();
            if (isAvailable(value) && (keyLower.includes('credit') || keyLower.includes('card'))) {
              hasCreditCard = true;
              break;
            }
          }
        }
      }
    } else if (typeof payments === 'object') {
      for (const [key, value] of Object.entries(payments)) {
        const keyLower = key.toLowerCase();
        if (isAvailable(value) && (keyLower.includes('credit') || keyLower.includes('card'))) {
          hasCreditCard = true;
          break;
        }
      }
    }
    
    if (hasCreditCard) {
      items.push({ icon: '💳', label: 'Credit cards accepted', context: 'Major credit cards welcome' });
    }
  }

  return items.slice(0, 5); // Max 5 items
}

export default function BuffetSummaryPanel({ buffet }: BuffetSummaryPanelProps) {
  const themes = buffet.reviews?.length
    ? extractThemes(buffet.reviews).slice(0, 4).map(transformThemeToHuman)
    : [];
  const logisticsItems = getLogisticsItems(buffet);
  const hasThemes = themes.length > 0;
  const hasLogistics = logisticsItems.length > 0;

  if (!hasThemes && !hasLogistics) {
    return null;
  }

  return (
    <section id="summary" className="mb-6 scroll-mt-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasThemes && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">What stands out</h3>
            <ExpandableList
              collapsedCount={3}
              showButtonThreshold={4}
              showMoreText={themes.length > 4 ? `Show ${themes.length - 3} more highlight${themes.length - 3 > 1 ? 's' : ''}` : undefined}
              className="space-y-3"
            >
              {themes.map((theme, index) => (
                <div key={index} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{theme.icon}</span>
                    <span className="text-base font-semibold text-gray-900">{theme.phrase}</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-7 leading-snug">{theme.context}</p>
                </div>
              ))}
            </ExpandableList>
            {buffet.reviews && buffet.reviews.length > 0 && (
              <a
                href="#reviews"
                className="inline-block mt-3 text-sm text-[var(--accent1)] hover:text-[var(--accent1)] hover:underline font-medium"
              >
                View reviews →
              </a>
            )}
          </div>
        )}

        {hasLogistics && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Before you go</h3>
            <ExpandableList
              collapsedCount={3}
              showButtonThreshold={4}
              showMoreText="Show more"
              className="space-y-3"
            >
              {logisticsItems.map((item, index) => (
                <div key={index} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-base font-semibold text-gray-900">{item.label}</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-7 leading-snug">{item.context}</p>
                </div>
              ))}
            </ExpandableList>
          </div>
        )}
      </div>
    </section>
  );
}
