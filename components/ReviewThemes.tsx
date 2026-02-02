'use client';

import { useMemo } from 'react';
import { extractThemes, Review as ReviewType } from '@/lib/reviewThemes';

interface Review {
  reviewId?: string;
  name?: string;
  author?: string;
  rating?: number;
  stars?: number;
  text?: string;
  textTranslated?: string;
  publishAt?: string;
  relativeTime?: string;
  visitedIn?: string;
  likesCount?: number;
}

interface ReviewThemesProps {
  reviews?: Review[];
}

interface ThemeCluster {
  themeKey: string;
  themeLabel: string;
  sentiment: 'positive' | 'negative' | 'mixed';
  summary: string;
  quote: string;
  reviewCount: number;
}

// Theme mapping to user-requested themes
const THEME_MAPPING: Record<string, { label: string; keywords: string[] }> = {
  'food-quality': {
    label: 'Food Quality',
    keywords: ['taste', 'tasty', 'delicious', 'flavor', 'flavour', 'quality', 'fresh', 'freshness', 'variety', 'selection', 'good food', 'great food', 'excellent food', 'amazing food'],
  },
  'price-value': {
    label: 'Price & Value',
    keywords: ['value', 'price', 'affordable', 'worth', 'deal', 'cheap', 'inexpensive', 'budget', 'money', 'cost', 'priced', 'bang for buck'],
  },
  'cleanliness': {
    label: 'Cleanliness',
    keywords: ['clean', 'cleanliness', 'dirty', 'hygienic', 'sanitary', 'spotless', 'messy', 'unclean', 'filthy', 'neat', 'tidy'],
  },
  'service-speed': {
    label: 'Service Speed',
    keywords: ['service', 'speed', 'fast', 'slow', 'wait', 'waiting', 'wait time', 'quick', 'quickly', 'efficient', 'staff', 'server', 'waiter', 'waitress'],
  },
};

// Keywords for sentiment analysis
const POSITIVE_KEYWORDS = [
  'excellent', 'great', 'amazing', 'wonderful', 'delicious', 'fresh', 'clean',
  'friendly', 'helpful', 'fast', 'quick', 'good value', 'affordable', 'variety',
  'love', 'best', 'perfect', 'recommend', 'enjoyed', 'satisfied', 'happy',
  'tasty', 'flavorful', 'worth', 'deal', 'spotless', 'efficient',
];

const NEGATIVE_KEYWORDS = [
  'poor', 'bad', 'terrible', 'awful', 'dirty', 'slow', 'rude', 'expensive',
  'disappointed', 'worst', 'avoid', 'waste', 'overpriced', 'stale', 'cold',
  'unclean', 'unfriendly', 'horrible', 'disgusting', 'filthy', 'long wait',
  'slow service', 'bad service',
];

/**
 * Check if text matches theme keywords
 */
function matchesTheme(text: string, themeKeywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return themeKeywords.some(keyword => normalized.includes(keyword.toLowerCase()));
}

/**
 * Analyze sentiment of text
 */
function analyzeSentiment(text: string): 'positive' | 'negative' | 'mixed' {
  const normalized = text.toLowerCase();
  const hasPositive = POSITIVE_KEYWORDS.some(kw => normalized.includes(kw));
  const hasNegative = NEGATIVE_KEYWORDS.some(kw => normalized.includes(kw));
  
  if (hasPositive && hasNegative) return 'mixed';
  if (hasPositive) return 'positive';
  if (hasNegative) return 'negative';
  return 'mixed';
}

/**
 * Extract a short quote from review text
 */
function extractQuote(text: string, maxLength: number = 120): string {
  if (!text) return '';
  
  // Try to find a sentence that's not too long
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15 && s.trim().length < maxLength);
  
  if (sentences.length > 0) {
    // Prefer sentences with quotes or strong statements
    const quoted = sentences.find(s => s.includes('"') || s.includes("'"));
    if (quoted) {
      return quoted.trim();
    }
    return sentences[0].trim();
  }
  
  // Fallback: truncate the text
  if (text.length <= maxLength) {
    return text.trim();
  }
  
  // Find a good breaking point
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace).trim() + '...';
  }
  
  return truncated.trim() + '...';
}

/**
 * Generate sentiment summary for a theme
 * Optimized for answer engines - direct, quotable statements
 */
function generateSentimentSummary(
  themeKey: string,
  sentiment: 'positive' | 'negative' | 'mixed',
  reviewCount: number
): string {
  // Direct, quotable statements without filler
  if (themeKey === 'food-quality') {
    if (sentiment === 'positive') {
      return reviewCount >= 5 
        ? `Food quality rated highly by ${reviewCount} reviewers.`
        : 'Food quality rated positively.';
    }
    if (sentiment === 'negative') {
      return 'Food quality concerns noted in reviews.';
    }
    return 'Food quality receives mixed reviews.';
  }
  
  if (themeKey === 'price-value') {
    if (sentiment === 'positive') {
      return reviewCount >= 5
        ? `Good value for money cited by ${reviewCount} reviewers.`
        : 'Good value for money.';
    }
    if (sentiment === 'negative') {
      return 'Some reviewers find prices high.';
    }
    return 'Value perceptions vary among diners.';
  }
  
  if (themeKey === 'cleanliness') {
    if (sentiment === 'positive') {
      return 'Clean dining environment.';
    }
    if (sentiment === 'negative') {
      return 'Cleanliness concerns mentioned.';
    }
    return 'Cleanliness receives mixed feedback.';
  }
  
  if (themeKey === 'service-speed') {
    if (sentiment === 'positive') {
      return 'Service rated fast and efficient.';
    }
    if (sentiment === 'negative') {
      return 'Service speed concerns noted.';
    }
    return 'Service speed varies.';
  }
  
  // Fallback
  return sentiment === 'positive' ? 'Positive feedback.' : 
         sentiment === 'negative' ? 'Concerns noted.' : 'Mixed feedback.';
}

/**
 * Cluster reviews by themes and extract summaries
 */
function clusterReviewsByThemes(reviews: Review[]): ThemeCluster[] {
  if (!reviews || reviews.length === 0) {
    return [];
  }

  const clusters: Map<string, { reviews: Review[]; sentiments: ('positive' | 'negative' | 'mixed')[] }> = new Map();

  // Initialize clusters
  Object.keys(THEME_MAPPING).forEach(themeKey => {
    clusters.set(themeKey, { reviews: [], sentiments: [] });
  });

  // Assign reviews to themes
  for (const review of reviews) {
    const text = (review.textTranslated || review.text || '').toLowerCase();
    if (!text) continue;

    const rating = review.rating || review.stars || 0;
    const sentiment = analyzeSentiment(text);

    // Check which themes this review matches
    for (const [themeKey, themeData] of Object.entries(THEME_MAPPING)) {
      if (matchesTheme(text, themeData.keywords)) {
        const cluster = clusters.get(themeKey)!;
        cluster.reviews.push(review);
        cluster.sentiments.push(sentiment);
      }
    }
  }

  // Generate clusters with summaries and quotes
  const themeClusters: ThemeCluster[] = [];

  for (const [themeKey, themeData] of Object.entries(THEME_MAPPING)) {
    const cluster = clusters.get(themeKey)!;
    
    if (cluster.reviews.length === 0) continue;

    // Determine overall sentiment based on ratings and sentiment analysis
    const positiveCount = cluster.sentiments.filter(s => s === 'positive').length;
    const negativeCount = cluster.sentiments.filter(s => s === 'negative').length;
    const mixedCount = cluster.sentiments.filter(s => s === 'mixed').length;
    
    // Also consider ratings
    const highRatings = cluster.reviews.filter(r => (r.rating || r.stars || 0) >= 4).length;
    const lowRatings = cluster.reviews.filter(r => (r.rating || r.stars || 0) <= 2).length;
    
    let overallSentiment: 'positive' | 'negative' | 'mixed';
    const totalPositive = positiveCount + highRatings;
    const totalNegative = negativeCount + lowRatings;
    
    if (totalPositive > totalNegative && totalPositive > mixedCount) {
      overallSentiment = 'positive';
    } else if (totalNegative > totalPositive && totalNegative > mixedCount) {
      overallSentiment = 'negative';
    } else {
      overallSentiment = 'mixed';
    }

    // Find best representative quote
    // Prefer quotes from reviews that match the overall sentiment
    let bestQuote = '';
    let bestReview: Review | null = null;

    // First, try to find a quote from a review matching overall sentiment
    for (const review of cluster.reviews) {
      const text = review.textTranslated || review.text || '';
      const reviewSentiment = analyzeSentiment(text);
      
      if (reviewSentiment === overallSentiment || overallSentiment === 'mixed') {
        const quote = extractQuote(text);
        if (quote.length > 30 && (!bestQuote || quote.length < bestQuote.length)) {
          bestQuote = quote;
          bestReview = review;
        }
      }
    }

    // Fallback: use any quote
    if (!bestQuote && cluster.reviews.length > 0) {
      const text = cluster.reviews[0].textTranslated || cluster.reviews[0].text || '';
      bestQuote = extractQuote(text);
    }

    // Generate summary
    const summary = generateSentimentSummary(themeKey, overallSentiment, cluster.reviews.length);

    themeClusters.push({
      themeKey,
      themeLabel: themeData.label,
      sentiment: overallSentiment,
      summary,
      quote: bestQuote,
      reviewCount: cluster.reviews.length,
    });
  }

  // Sort by review count (most mentioned themes first)
  return themeClusters.sort((a, b) => b.reviewCount - a.reviewCount);
}

export default function ReviewThemes({ reviews }: ReviewThemesProps) {
  const clusters = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];
    return clusterReviewsByThemes(reviews);
  }, [reviews]);

  if (clusters.length === 0) {
    return null;
  }

  const getSentimentColor = (sentiment: 'positive' | 'negative' | 'mixed') => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'negative':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'mixed':
        return 'text-amber-700 bg-amber-50 border-amber-200';
    }
  };

  const getSentimentIcon = (sentiment: 'positive' | 'negative' | 'mixed') => {
    switch (sentiment) {
      case 'positive':
        return (
          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'negative':
        return (
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'mixed':
        return (
          <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Highlights by Theme</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clusters.map((cluster) => (
          <div
            key={cluster.themeKey}
            className={`rounded-lg border-2 p-4 ${getSentimentColor(cluster.sentiment)}`}
          >
            <div className="flex items-start gap-3 mb-2">
              {getSentimentIcon(cluster.sentiment)}
              <div className="flex-1">
                <h4 className="font-semibold text-base mb-1">{cluster.themeLabel}</h4>
                <p className="text-sm font-medium mb-2">{cluster.summary}</p>
              </div>
            </div>
            {cluster.quote && (
              <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                <p className="text-sm italic leading-relaxed">
                  "{cluster.quote}"
                </p>
              </div>
            )}
            <div className="mt-2 text-xs opacity-75">
              Based on {cluster.reviewCount} review{cluster.reviewCount === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
