/**
 * ModifierVariants Component
 * 
 * Generates natural, embedded modifier-based content variants within the page.
 * These help answer queries like:
 * - "best Chinese buffet for families"
 * - "cheap Chinese buffet near me"
 * - "late-night Chinese buffet"
 * - "Chinese buffet with parking"
 * 
 * Content is embedded naturally, not as separate sections.
 * Uses semantic HTML and structured data for discoverability.
 */

interface ModifierVariantsProps {
  buffet: {
    name: string;
    rating?: number;
    reviewsCount?: number;
    price?: string | null;
    hours?: {
      hours?: Array<{ day: string; hours: string }>;
    };
    amenities?: {
      parking?: any;
      'service options'?: any;
      [key: string]: any;
    };
    accessibility?: any;
    reviews?: Array<{
      text?: string;
      textTranslated?: string;
    }>;
  };
}

interface Modifier {
  type: 'family-friendly' | 'budget' | 'late-night' | 'parking' | 'takeout' | 'delivery';
  sentence: string;
  schemaValue?: string;
}

export default function ModifierVariants({ buffet }: ModifierVariantsProps) {
  const modifiers = generateModifiers(buffet);

  if (modifiers.length === 0) return null;

  // Generate structured data for modifiers
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: buffet.name,
    additionalProperty: modifiers
      .filter(m => m.schemaValue)
      .map(m => ({
        '@type': 'PropertyValue',
        name: m.type,
        value: m.schemaValue,
      })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      
      {/* Natural embedded content - screen reader visible, visually subtle */}
      <div className="sr-only" aria-label="Restaurant attributes">
        {modifiers.map((modifier, index) => (
          <p key={index} itemProp="description">
            {modifier.sentence}
          </p>
        ))}
      </div>
    </>
  );
}

/**
 * Generate natural modifier sentences based on buffet attributes
 */
function generateModifiers(buffet: ModifierVariantsProps['buffet']): Modifier[] {
  const modifiers: Modifier[] = [];
  const name = buffet.name;

  // Family-friendly modifier
  if (isFamilyFriendly(buffet)) {
    modifiers.push({
      type: 'family-friendly',
      sentence: `${name} is a family-friendly Chinese buffet suitable for dining with children.`,
      schemaValue: 'Family-friendly',
    });
  }

  // Budget/cheap modifier
  if (isBudgetFriendly(buffet)) {
    modifiers.push({
      type: 'budget',
      sentence: `${name} is a budget-friendly Chinese buffet with affordable prices.`,
      schemaValue: 'Budget-friendly',
    });
  }

  // Late-night modifier
  const lateNightInfo = isLateNight(buffet);
  if (lateNightInfo.isLateNight) {
    modifiers.push({
      type: 'late-night',
      sentence: `${name} is open late, serving until ${lateNightInfo.closingTime} on ${lateNightInfo.days}.`,
      schemaValue: 'Late-night dining',
    });
  }

  // Parking modifier
  if (hasParking(buffet)) {
    modifiers.push({
      type: 'parking',
      sentence: `${name} offers parking for customers.`,
      schemaValue: 'Parking available',
    });
  }

  // Takeout modifier
  if (hasTakeout(buffet)) {
    modifiers.push({
      type: 'takeout',
      sentence: `${name} offers takeout service for customers.`,
      schemaValue: 'Takeout available',
    });
  }

  // Delivery modifier
  if (hasDelivery(buffet)) {
    modifiers.push({
      type: 'delivery',
      sentence: `${name} offers delivery service.`,
      schemaValue: 'Delivery available',
    });
  }

  return modifiers;
}

/**
 * Check if buffet is family-friendly
 */
function isFamilyFriendly(buffet: ModifierVariantsProps['buffet']): boolean {
  // Check amenities for family indicators
  const amenities = buffet.amenities || {};
  const accessibility = buffet.accessibility || {};
  
  // Check for high chairs, kids menu, family-friendly indicators
  if (checkAvailability(amenities, ['high chairs', 'highchairs', 'kids', 'children', 'family'])) {
    return true;
  }
  
  if (checkAvailability(accessibility, ['family', 'children', 'kids'])) {
    return true;
  }
  
  // Check reviews for family mentions
  const reviews = buffet.reviews || [];
  const familyKeywords = ['family', 'families', 'kids', 'children', 'child', 'kid-friendly'];
  const hasFamilyMentions = reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return familyKeywords.some(keyword => text.includes(keyword));
  });
  
  return hasFamilyMentions;
}

/**
 * Check if buffet is budget-friendly
 */
function isBudgetFriendly(buffet: ModifierVariantsProps['buffet']): boolean {
  const price = buffet.price || '';
  
  // Single $ or "budget" in price indicates budget-friendly
  const dollarCount = (price.match(/\$/g) || []).length;
  if (dollarCount === 1 || price.toLowerCase().includes('budget')) {
    return true;
  }
  
  // Check reviews for value mentions
  const reviews = buffet.reviews || [];
  const valueKeywords = ['value', 'affordable', 'cheap', 'budget', 'worth', 'inexpensive'];
  const hasValueMentions = reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return valueKeywords.some(keyword => text.includes(keyword));
  });
  
  return hasValueMentions;
}

/**
 * Check if buffet is open late
 */
function isLateNight(buffet: ModifierVariantsProps['buffet']): {
  isLateNight: boolean;
  closingTime?: string;
  days?: string;
} {
  const hours = buffet.hours?.hours;
  if (!hours || !Array.isArray(hours)) {
    return { isLateNight: false };
  }

  // Check for closing times after 10 PM (22:00)
  const lateNights: Array<{ day: string; time: string }> = [];
  
  hours.forEach((dayHours: any) => {
    const hoursStr = String(dayHours.hours || '');
    // Parse time ranges like "11:00 AM - 10:00 PM" or "11:00-22:00"
    const timeMatch = hoursStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*-\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    
    if (timeMatch) {
      const closingHour = parseInt(timeMatch[4], 10);
      const closingPeriod = timeMatch[6]?.toUpperCase() || '';
      
      // Convert to 24-hour format
      let closing24 = closingHour;
      if (closingPeriod === 'PM' && closingHour !== 12) {
        closing24 += 12;
      } else if (closingPeriod === 'AM' && closingHour === 12) {
        closing24 = 0;
      }
      
      // Consider late-night if closing at 10 PM (22:00) or later
      if (closing24 >= 22) {
        const timeStr = closingPeriod 
          ? `${closingHour}:${timeMatch[5] || '00'} ${closingPeriod}`
          : `${closingHour}:${timeMatch[5] || '00'}`;
        lateNights.push({
          day: dayHours.day || '',
          time: timeStr,
        });
      }
    }
  });

  if (lateNights.length === 0) {
    return { isLateNight: false };
  }

  // Get most common closing time
  const latestTime = lateNights.reduce((latest, current) => {
    return current.time > latest.time ? current : latest;
  }, lateNights[0]);

  const days = lateNights.length === 7 
    ? 'all days'
    : lateNights.map(n => n.day).join(', ');

  return {
    isLateNight: true,
    closingTime: latestTime.time,
    days,
  };
}

/**
 * Check if buffet has parking
 */
function hasParking(buffet: ModifierVariantsProps['buffet']): boolean {
  const amenities = buffet.amenities || {};
  return checkAvailability(amenities.parking || amenities, [
    'parking',
    'parking lot',
    'parking available',
    'free parking',
    'valet parking',
    'street parking',
  ]);
}

/**
 * Check if buffet offers takeout
 */
function hasTakeout(buffet: ModifierVariantsProps['buffet']): boolean {
  const serviceOptions = buffet.amenities?.['service options'];
  return checkAvailability(serviceOptions, ['takeout', 'take-out', 'to-go', 'carryout']);
}

/**
 * Check if buffet offers delivery
 */
function hasDelivery(buffet: ModifierVariantsProps['buffet']): boolean {
  const serviceOptions = buffet.amenities?.['service options'];
  return checkAvailability(serviceOptions, ['delivery', 'delivers']);
}

/**
 * Helper to check availability in nested objects/arrays
 */
function checkAvailability(data: any, keywords: string[]): boolean {
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
      // Check keys
      const keysMatch = Object.keys(value).some(key => 
        keywords.some(k => key.toLowerCase().includes(k.toLowerCase()))
      );
      if (keysMatch) return true;
      // Check values
      return Object.values(value).some(checkValue);
    }
    return false;
  };
  
  if (Array.isArray(data)) {
    return data.some(checkValue);
  }
  if (typeof data === 'object') {
    return checkValue(data);
  }
  return checkValue(data);
}
