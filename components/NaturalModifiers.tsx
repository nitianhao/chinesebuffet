/**
 * NaturalModifiers Utilities
 * 
 * Embeds modifier-based content naturally within existing sections.
 * Adds descriptive text that feels organic, not forced.
 * 
 * Examples:
 * - "This family-friendly buffet..." in the overview
 * - "As a budget-friendly option..." in the price section
 * - "Open late until 10 PM..." in hours section
 * - "Parking is available..." in amenities
 */

interface NaturalModifiersProps {
  buffet: {
    name: string;
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

export interface ModifierTexts {
  familyFriendly?: string;
  budgetFriendly?: string;
  lateNight?: string;
  parking?: string;
  takeout?: string;
  delivery?: string;
}

/**
 * Generate natural modifier texts that can be embedded in content
 */
export function generateModifierTexts(buffet: NaturalModifiersProps['buffet']): ModifierTexts {
  const texts: ModifierTexts = {};

  // Family-friendly text
  if (isFamilyFriendly(buffet)) {
    texts.familyFriendly = 'This family-friendly Chinese buffet welcomes diners of all ages.';
  }

  // Budget-friendly text
  if (isBudgetFriendly(buffet)) {
    const price = buffet.price || '';
    const dollarCount = (price.match(/\$/g) || []).length;
    if (dollarCount === 1) {
      texts.budgetFriendly = 'As a budget-friendly option, this buffet offers affordable dining.';
    } else {
      texts.budgetFriendly = 'This buffet provides good value for money.';
    }
  }

  // Late-night text
  const lateNightInfo = isLateNight(buffet);
  if (lateNightInfo.isLateNight) {
    texts.lateNight = `Open late until ${lateNightInfo.closingTime} on ${lateNightInfo.days}, making it a good option for late-night dining.`;
  }

  // Parking text
  if (hasParking(buffet)) {
    texts.parking = 'Parking is available for customers.';
  }

  // Takeout text
  if (hasTakeout(buffet)) {
    texts.takeout = 'Takeout service is available.';
  }

  // Delivery text
  if (hasDelivery(buffet)) {
    texts.delivery = 'Delivery service is offered.';
  }

  return texts;
}

/**
 * Check if buffet is family-friendly
 */
function isFamilyFriendly(buffet: NaturalModifiersProps['buffet']): boolean {
  const amenities = buffet.amenities || {};
  const accessibility = buffet.accessibility || {};
  
  if (checkAvailability(amenities, ['high chairs', 'highchairs', 'kids', 'children', 'family'])) {
    return true;
  }
  
  if (checkAvailability(accessibility, ['family', 'children', 'kids'])) {
    return true;
  }
  
  const reviews = buffet.reviews || [];
  const familyKeywords = ['family', 'families', 'kids', 'children', 'child', 'kid-friendly'];
  return reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return familyKeywords.some(keyword => text.includes(keyword));
  });
}

/**
 * Check if buffet is budget-friendly
 */
function isBudgetFriendly(buffet: NaturalModifiersProps['buffet']): boolean {
  const price = buffet.price || '';
  const dollarCount = (price.match(/\$/g) || []).length;
  if (dollarCount === 1 || price.toLowerCase().includes('budget')) {
    return true;
  }
  
  const reviews = buffet.reviews || [];
  const valueKeywords = ['value', 'affordable', 'cheap', 'budget', 'worth', 'inexpensive'];
  return reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return valueKeywords.some(keyword => text.includes(keyword));
  });
}

/**
 * Check if buffet is open late
 */
function isLateNight(buffet: NaturalModifiersProps['buffet']): {
  isLateNight: boolean;
  closingTime?: string;
  days?: string;
} {
  const hours = buffet.hours?.hours;
  if (!hours || !Array.isArray(hours)) {
    return { isLateNight: false };
  }

  const lateNights: Array<{ day: string; time: string }> = [];
  
  hours.forEach((dayHours: any) => {
    const hoursStr = String(dayHours.hours || '');
    const timeMatch = hoursStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*-\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    
    if (timeMatch) {
      const closingHour = parseInt(timeMatch[4], 10);
      const closingPeriod = timeMatch[6]?.toUpperCase() || '';
      
      let closing24 = closingHour;
      if (closingPeriod === 'PM' && closingHour !== 12) {
        closing24 += 12;
      } else if (closingPeriod === 'AM' && closingHour === 12) {
        closing24 = 0;
      }
      
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

  const latestTime = lateNights.reduce((latest, current) => {
    return current.time > latest.time ? latest : current;
  }, lateNights[0]);

  const days = lateNights.length === 7 
    ? 'most days'
    : lateNights.map(n => n.day).slice(0, 3).join(', ');

  return {
    isLateNight: true,
    closingTime: latestTime.time,
    days,
  };
}

/**
 * Check if buffet has parking
 */
function hasParking(buffet: NaturalModifiersProps['buffet']): boolean {
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
function hasTakeout(buffet: NaturalModifiersProps['buffet']): boolean {
  const serviceOptions = buffet.amenities?.['service options'];
  return checkAvailability(serviceOptions, ['takeout', 'take-out', 'to-go', 'carryout']);
}

/**
 * Check if buffet offers delivery
 */
function hasDelivery(buffet: NaturalModifiersProps['buffet']): boolean {
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
      const keysMatch = Object.keys(value).some(key => 
        keywords.some(k => key.toLowerCase().includes(k.toLowerCase()))
      );
      if (keysMatch) return true;
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
