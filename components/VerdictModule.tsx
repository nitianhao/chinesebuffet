interface VerdictModuleProps {
  buffet: {
    rating?: number;
    reviewsCount?: number;
    price?: string | null;
    reviews?: Array<{
      rating?: number;
      stars?: number;
      text?: string;
      textTranslated?: string;
    }>;
    amenities?: {
      'service options'?: Record<string, any> | Array<Record<string, boolean>>;
      'food and drink'?: Record<string, any> | Array<Record<string, boolean>>;
      planning?: Record<string, any> | Array<Record<string, boolean>>;
      [key: string]: any;
    };
    accessibility?: Record<string, any> | Array<Record<string, boolean>>;
  };
}

/**
 * Generate verdict label based on rating, reviews, and price
 */
function generateVerdict(buffet: VerdictModuleProps['buffet']): string {
  const rating = buffet.rating || 0;
  const reviewsCount = buffet.reviewsCount || 0;
  const price = buffet.price || '';

  // High rating with many reviews
  if (rating >= 4.5 && reviewsCount >= 50) {
    return 'Highly rated';
  }
  
  // Good rating with decent reviews
  if (rating >= 4.0 && reviewsCount >= 20) {
    if (price.includes('$') || price.toLowerCase().includes('budget')) {
      return 'Good value';
    }
    return 'Solid choice';
  }
  
  // Moderate rating
  if (rating >= 3.5) {
    if (reviewsCount < 10) {
      return 'Few reviews';
    }
    return 'Mixed feedback';
  }
  
  // Lower rating
  if (rating >= 3.0) {
    return 'Mixed feedback';
  }
  
  // Very low rating
  if (rating > 0) {
    return 'Consider alternatives';
  }
  
  // No rating
  if (reviewsCount > 0) {
    return 'New listing';
  }
  
  return 'Worth checking out';
}

/**
 * Generate suitability bullets from buffet data
 */
function generateBullets(buffet: VerdictModuleProps['buffet']): string[] {
  const bullets: string[] = [];
  const rating = buffet.rating || 0;
  const reviewsCount = buffet.reviewsCount || 0;
  const price = buffet.price || '';
  const reviews = buffet.reviews || [];
  const amenities = buffet.amenities || {};
  const accessibility = buffet.accessibility || {};

  // Check for family-friendly indicators
  const serviceOptions = amenities['service options'];
  const hasDelivery = checkAvailability(serviceOptions, ['delivery', 'takeout']);
  const hasDineIn = checkAvailability(serviceOptions, ['dine-in', 'dining']);
  const hasHighChairs = checkAvailability(amenities, ['high chairs', 'highchairs', 'kids']);
  const hasWheelchairAccess = checkAvailability(accessibility, ['wheelchair', 'accessible']);
  
  // Check reviews for family mentions
  const familyKeywords = ['family', 'kids', 'children', 'child', 'kid-friendly'];
  const hasFamilyMentions = reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return familyKeywords.some(keyword => text.includes(keyword));
  });

  // Check for value indicators
  const valueKeywords = ['value', 'affordable', 'cheap', 'budget', 'worth', 'price'];
  const hasValueMentions = reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return valueKeywords.some(keyword => text.includes(keyword));
  });

  // Check for quick service indicators
  const quickKeywords = ['quick', 'fast', 'lunch', 'fast service', 'speedy'];
  const hasQuickMentions = reviews.some(r => {
    const text = (r.textTranslated || r.text || '').toLowerCase();
    return quickKeywords.some(keyword => text.includes(keyword));
  });

  // Generate bullets based on data - use concrete, varied phrasing
  if (hasFamilyMentions || hasHighChairs) {
    bullets.push('Family-friendly');
  } else if (hasDineIn && rating >= 4.0) {
    bullets.push('Popular with diners');
  }

  if (hasValueMentions || (price && (price.includes('$') || price.toLowerCase().includes('budget')))) {
    bullets.push('Budget-friendly');
  } else if (rating >= 4.0 && reviewsCount >= 20) {
    bullets.push('Consistently rated well');
  }

  if (hasQuickMentions || hasDelivery) {
    bullets.push('Quick service');
  } else if (hasWheelchairAccess) {
    bullets.push('Wheelchair accessible');
  } else if (rating >= 4.5) {
    bullets.push('Top-rated');
  }

  // Fallback bullets if we don't have enough - use concrete language
  const fallbacks = [
    rating >= 4.0 && 'Strong ratings',
    reviewsCount >= 50 && 'Many diner reviews',
    hasDineIn && 'Dine-in service',
    hasDelivery && 'Delivery service',
    rating >= 3.5 && 'Solid ratings',
    reviewsCount >= 10 && 'Reviewed by diners',
    price && 'Price range listed',
    'Chinese buffet',
  ].filter(Boolean) as string[];

  // Add fallbacks until we have 3 bullets
  while (bullets.length < 3 && fallbacks.length > 0) {
    const fallback = fallbacks.shift();
    if (fallback && !bullets.includes(fallback)) {
      bullets.push(fallback);
    }
  }

  // Return top 3 bullets
  return bullets.slice(0, 3);
}

/**
 * Helper to check if a value is available in nested objects/arrays
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
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  if (Array.isArray(data)) {
    return data.some(checkValue);
  }
  if (typeof data === 'object') {
    return Object.values(data).some(checkValue);
  }
  return checkValue(data);
}

/**
 * Generate a quotable verdict sentence for answer engines
 */
function generateQuotableSummary(buffet: VerdictModuleProps['buffet'], verdict: string): string {
  const rating = buffet.rating || 0;
  const reviewsCount = buffet.reviewsCount || 0;
  
  if (rating >= 4.5 && reviewsCount >= 50) {
    return `Highly rated at ${rating.toFixed(1)} stars with ${reviewsCount} reviews.`;
  }
  if (rating >= 4.0 && reviewsCount >= 20) {
    return `Rated ${rating.toFixed(1)} stars based on ${reviewsCount} reviews.`;
  }
  if (rating >= 4.0) {
    return `Rated ${rating.toFixed(1)} stars.`;
  }
  if (rating >= 3.5 && reviewsCount >= 10) {
    return `${rating.toFixed(1)}-star rating from ${reviewsCount} reviews.`;
  }
  if (rating > 0) {
    return `${rating.toFixed(1)}-star rating.`;
  }
  if (reviewsCount > 0) {
    return `${reviewsCount} customer reviews.`;
  }
  return 'Chinese buffet restaurant.';
}

export default function VerdictModule({ buffet }: VerdictModuleProps) {
  const verdict = generateVerdict(buffet);
  const bullets = generateBullets(buffet);
  const quotableSummary = generateQuotableSummary(buffet, verdict);

  // Determine verdict color based on rating
  const rating = buffet.rating || 0;
  let verdictColor = 'bg-amber-50/80 border-amber-200 text-amber-900';
  let verdictBadgeColor = 'bg-amber-100 text-amber-800';

  if (rating >= 4.5) {
    verdictColor = 'bg-emerald-50/80 border-emerald-200 text-emerald-900';
    verdictBadgeColor = 'bg-emerald-100 text-emerald-800';
  } else if (rating >= 4.0) {
    verdictColor = 'bg-amber-50/80 border-amber-200 text-amber-900';
    verdictBadgeColor = 'bg-amber-100 text-amber-800';
  } else if (rating >= 3.5) {
    verdictColor = 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text)]';
    verdictBadgeColor = 'bg-[var(--surface2)] text-[var(--muted)]';
  } else if (rating > 0) {
    verdictColor = 'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)]';
    verdictBadgeColor = 'bg-[var(--surface2)] text-[var(--muted)]';
  }

  return (
    <div className={`rounded-lg border-2 ${verdictColor} p-4 mb-6 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${verdictBadgeColor}`}>
              {verdict}
            </span>
          </div>
          {/* Quotable summary sentence - optimized for answer engines */}
          <p className="text-sm font-medium mb-3 leading-snug">
            {quotableSummary}
          </p>
          <ul className="space-y-1.5">
            {bullets.map((bullet, index) => (
              <li key={index} className="text-sm font-medium flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="leading-tight">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
