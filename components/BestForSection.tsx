interface BestForSectionProps {
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
 * Check if a value is available in nested objects/arrays
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
  if (typeof data === 'object' && data !== null) {
    return Object.values(data).some(checkValue);
  }
  return checkValue(data);
}

/**
 * Analyze reviews for keywords and sentiment
 */
function analyzeReviewText(reviews: BestForSectionProps['buffet']['reviews'] = []): {
  bestFor: Set<string>;
  notIdealFor: Set<string>;
} {
  const bestFor = new Set<string>();
  const notIdealFor = new Set<string>();

  const allText = reviews
    .map(r => (r.textTranslated || r.text || '').toLowerCase())
    .join(' ');

  // Best for indicators
  const familyKeywords = ['family', 'families', 'kids', 'children', 'child', 'kid-friendly', 'kid friendly'];
  const groupKeywords = ['group', 'groups', 'party', 'parties', 'large group', 'big group', 'many people'];
  const budgetKeywords = ['budget', 'affordable', 'cheap', 'inexpensive', 'value', 'worth the price', 'good price'];
  const quickKeywords = ['quick', 'fast', 'lunch', 'fast service', 'speedy', 'quick meal', 'quick lunch'];
  const casualKeywords = ['casual', 'relaxed', 'laid-back', 'informal'];

  // Not ideal for indicators
  const fineDiningKeywords = ['fine dining', 'fancy', 'upscale', 'elegant', 'sophisticated', 'gourmet'];
  const romanticKeywords = ['romantic', 'date', 'anniversary', 'intimate', 'romance'];

  // Check for best for
  if (familyKeywords.some(k => allText.includes(k))) {
    bestFor.add('Families');
  }
  if (groupKeywords.some(k => allText.includes(k))) {
    bestFor.add('Large groups');
  }
  if (budgetKeywords.some(k => allText.includes(k))) {
    bestFor.add('Budget dining');
  }
  if (quickKeywords.some(k => allText.includes(k))) {
    bestFor.add('Quick meals');
  }
  if (casualKeywords.some(k => allText.includes(k))) {
    bestFor.add('Casual dining');
  }

  // Check for not ideal for
  if (fineDiningKeywords.some(k => allText.includes(k))) {
    notIdealFor.add('Fine dining seekers');
  }
  if (romanticKeywords.some(k => allText.includes(k))) {
    notIdealFor.add('Romantic dinners');
  }
  
  // Check for quiet atmosphere mentions (negative sentiment)
  const noisyKeywords = ['noisy', 'loud', 'busy', 'crowded', 'chaotic', 'hectic'];
  const quietPositiveKeywords = ['quiet', 'peaceful', 'calm', 'serene', 'tranquil'];
  
  const noisyMentions = noisyKeywords.filter(k => allText.includes(k));
  const quietPositiveMentions = quietPositiveKeywords.filter(k => allText.includes(k));
  
  // If reviews mention noise/loudness more than quietness, or explicitly say "not quiet"
  if (noisyMentions.length > quietPositiveMentions.length || 
      allText.includes('not quiet') || 
      allText.includes('not peaceful') ||
      (noisyMentions.length > 0 && quietPositiveMentions.length === 0)) {
    notIdealFor.add('Quiet atmosphere');
  }

  return { bestFor, notIdealFor };
}

/**
 * Analyze amenities and other attributes
 */
function analyzeAttributes(buffet: BestForSectionProps['buffet']): {
  bestFor: Set<string>;
  notIdealFor: Set<string>;
} {
  const bestFor = new Set<string>();
  const amenities = buffet.amenities || {};
  const serviceOptions = amenities['service options'];
  
  // Check for family-friendly amenities
  if (checkAvailability(amenities, ['high chairs', 'highchairs', 'kids', 'children', 'family'])) {
    bestFor.add('Families');
  }
  
  // Check for group-friendly amenities
  if (checkAvailability(serviceOptions, ['reservations', 'reservation', 'large party', 'group'])) {
    bestFor.add('Large groups');
  }
  
  // Check for takeout/delivery (quick meals)
  if (checkAvailability(serviceOptions, ['takeout', 'take-out', 'delivery', 'to-go'])) {
    bestFor.add('Quick meals');
  }

  // Price-based indicators
  const price = buffet.price || '';
  if (price && (price.includes('$') || price.toLowerCase().includes('budget') || price.toLowerCase().includes('affordable'))) {
    bestFor.add('Budget dining');
  }

  return { bestFor, notIdealFor: new Set<string>() };
}

export default function BestForSection({ buffet }: BestForSectionProps) {
  const reviewAnalysis = analyzeReviewText(buffet.reviews);
  const attributeAnalysis = analyzeAttributes(buffet);
  const bestFor = new Set([...reviewAnalysis.bestFor, ...attributeAnalysis.bestFor]);
  const notIdealFor = new Set([...reviewAnalysis.notIdealFor, ...attributeAnalysis.notIdealFor]);

  // Add fallback items if we don't have enough data
  const bestForList = Array.from(bestFor);
  const notIdealForList = Array.from(notIdealFor);

  // Default best for items if no data
  if (bestForList.length === 0) {
    if (buffet.rating && buffet.rating >= 4.0) {
      bestForList.push('Well-reviewed dining');
    }
    if (buffet.price) {
      bestForList.push('Budget dining');
    }
    bestForList.push('Casual dining');
  }

  // Default not ideal for items if no data
  if (notIdealForList.length === 0) {
    notIdealForList.push('Fine dining seekers');
  }

  if (bestForList.length === 0 && notIdealForList.length === 0) {
    return null;
  }

  return (
    <section className="mb-6">
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Best for / Not ideal for</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Best for column */}
          <div>
            <h4 className="text-sm font-semibold text-green-700 mb-2.5 uppercase tracking-wide">Best for</h4>
            <ul className="space-y-2">
              {bestForList.map((item, index) => (
                <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Not ideal for column */}
          <div>
            <h4 className="text-sm font-semibold text-amber-700 mb-2.5 uppercase tracking-wide">Not ideal for</h4>
            <ul className="space-y-2">
              {notIdealForList.map((item, index) => (
                <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
