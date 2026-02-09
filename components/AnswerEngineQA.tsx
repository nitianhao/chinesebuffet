/**
 * AnswerEngineQA Component
 * 
 * Generates direct Q&A blocks optimized for featured snippets.
 * Questions are phrased as users would ask them.
 * Answers are concise, factual, and quotable.
 * 
 * Answer Engine Optimization:
 * - Uses question-answer HTML structure
 * - Answers start with the direct answer (no preamble)
 * - Includes specific data points
 * - Schema.org FAQPage markup included
 */

interface AnswerEngineQAProps {
  buffet: {
    name: string;
    address?: string;
    cityName?: string;
    state?: string;
    rating?: number;
    reviewsCount?: number;
    price?: string | null;
    phone?: string;
    hours?: {
      isOpen?: boolean;
      hours?: Array<{ day: string; hours: string }>;
    };
    contactInfo?: {
      phone?: string;
      website?: string;
      menuUrl?: string;
    };
    amenities?: {
      'service options'?: any;
      [key: string]: any;
    };
    reviews?: Array<{
      rating?: number;
      text?: string;
      textTranslated?: string;
    }>;
    questionsAndAnswers?: Array<{
      question?: string;
      answer?: string;
      citations?: Array<{ reviewId?: string; snippet?: string }>;
      confidence?: string;
    }>;
  };
}

interface QAItem {
  question: string;
  answer: string;
}

export default function AnswerEngineQA({ buffet }: AnswerEngineQAProps) {
  // Generate dynamic Q&A items from buffet data
  const generatedItems = generateQAItems(buffet);
  
  // Get Q&A items from database (questionsAndAnswers field)
  const dbItems: QAItem[] = [];
  if (buffet.questionsAndAnswers && Array.isArray(buffet.questionsAndAnswers)) {
    buffet.questionsAndAnswers.forEach(item => {
      if (item.question && item.answer) {
        dbItems.push({
          question: item.question,
          answer: item.answer,
        });
      }
    });
  }
  
  // Merge: database items first (more specific), then generated items
  // Deduplicate by checking if questions are similar
  const seenQuestions = new Set<string>();
  const qaItems: QAItem[] = [];
  
  // Add database items first (they're more specific to this buffet)
  dbItems.forEach(item => {
    const normalizedQ = item.question.toLowerCase().trim();
    if (!seenQuestions.has(normalizedQ)) {
      seenQuestions.add(normalizedQ);
      qaItems.push(item);
    }
  });
  
  // Add generated items that don't overlap
  generatedItems.forEach(item => {
    const normalizedQ = item.question.toLowerCase().trim();
    // Check for similar questions (not exact match)
    const isDuplicate = Array.from(seenQuestions).some(existing => {
      // Simple similarity check - if both contain the same key terms
      const existingWords = existing.split(/\s+/).filter(w => w.length > 3);
      const newWords = normalizedQ.split(/\s+/).filter(w => w.length > 3);
      const overlap = existingWords.filter(w => newWords.includes(w)).length;
      return overlap >= 2; // If 2+ significant words overlap, consider it duplicate
    });
    
    if (!isDuplicate) {
      seenQuestions.add(normalizedQ);
      qaItems.push(item);
    }
  });

  if (qaItems.length === 0) return null;

  const INITIAL_QA_LIMIT = 8;
  const visibleItems = qaItems.slice(0, INITIAL_QA_LIMIT);
  const hiddenItems = qaItems.slice(INITIAL_QA_LIMIT);
  const hasMoreQA = hiddenItems.length > 0;

  // Generate JSON-LD for FAQPage (all items for SEO)
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qaItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      
      <div className="space-y-3">
        {visibleItems.map((item, index) => (
          <div
            key={index}
            className="border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] transition-colors"
            itemScope
            itemProp="mainEntity"
            itemType="https://schema.org/Question"
          >
            <div className="flex items-start gap-2 mb-2">
              <svg className="w-5 h-5 text-[#C1121F] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="font-semibold text-[var(--text)]" itemProp="name">
                {item.question}
              </h4>
            </div>
            <div className="ml-7" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[var(--text-secondary)] leading-relaxed" itemProp="text">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        ))}
        {hasMoreQA && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--accent1)] hover:underline list-none py-2">
              Show {hiddenItems.length} more questions
            </summary>
            <div className="space-y-3 mt-2 pl-2 border-l-2 border-[var(--border)]">
              {hiddenItems.map((item, index) => (
                <div
                  key={index}
                  className="border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] transition-colors"
                  itemScope
                  itemProp="mainEntity"
                  itemType="https://schema.org/Question"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <svg className="w-5 h-5 text-[#C1121F] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="font-semibold text-[var(--text)]" itemProp="name">
                      {item.question}
                    </h4>
                  </div>
                  <div className="ml-7" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-[var(--text-secondary)] leading-relaxed" itemProp="text">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}

/**
 * Generate Q&A items from buffet data
 * Each answer is direct and quotable
 */
function generateQAItems(buffet: AnswerEngineQAProps['buffet']): QAItem[] {
  const items: QAItem[] = [];
  const name = buffet.name;

  // Q: What is the rating?
  if (buffet.rating && buffet.reviewsCount) {
    items.push({
      question: `What is the rating of ${name}?`,
      answer: `${name} has a ${buffet.rating.toFixed(1)}-star rating based on ${buffet.reviewsCount} customer reviews.`,
    });
  }

  // Q: Where is it located?
  if (buffet.address) {
    items.push({
      question: `Where is ${name} located?`,
      answer: `${name} is located at ${buffet.address}.`,
    });
  }

  // Q: What is the price range?
  if (buffet.price) {
    const priceDesc = getPriceDescription(buffet.price);
    items.push({
      question: `How much does ${name} cost?`,
      answer: `${name} is ${priceDesc}. The price range is ${buffet.price}.`,
    });
  }

  // Q: What is the phone number?
  const phone = buffet.contactInfo?.phone || buffet.phone;
  if (phone) {
    items.push({
      question: `What is the phone number for ${name}?`,
      answer: `The phone number for ${name} is ${phone}.`,
    });
  }

  // Q: Is it open now?
  if (buffet.hours?.isOpen !== undefined) {
    const status = buffet.hours.isOpen ? 'open' : 'closed';
    items.push({
      question: `Is ${name} open now?`,
      answer: `${name} is currently ${status}.`,
    });
  }

  // Q: Does it offer delivery/takeout?
  const serviceOptions = buffet.amenities?.['service options'];
  if (serviceOptions) {
    const services: string[] = [];
    if (hasService(serviceOptions, ['delivery'])) services.push('delivery');
    if (hasService(serviceOptions, ['takeout', 'take-out'])) services.push('takeout');
    if (hasService(serviceOptions, ['dine-in'])) services.push('dine-in');
    
    if (services.length > 0) {
      items.push({
        question: `Does ${name} offer delivery or takeout?`,
        answer: `${name} offers ${services.join(', ')}.`,
      });
    }
  }

  // Q: Is it good? (rating-based)
  if (buffet.rating) {
    const verdict = getVerdictSentence(buffet.rating, buffet.reviewsCount || 0, name);
    if (verdict) {
      items.push({
        question: `Is ${name} good?`,
        answer: verdict,
      });
    }
  }

  return items; // Return all items, limiting happens in the component
}

/**
 * Check if a service option is available
 */
function hasService(data: any, keywords: string[]): boolean {
  if (!data) return false;
  
  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return keywords.some(k => value.toLowerCase().includes(k.toLowerCase()));
    }
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.some(checkValue);
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).some(([key, val]) => {
        if (keywords.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
          return val === true || val === 'Yes';
        }
        return checkValue(val);
      });
    }
    return false;
  };
  
  return checkValue(data);
}

/**
 * Generate verdict sentence based on rating
 */
function getVerdictSentence(rating: number, reviewsCount: number, name: string): string {
  if (rating >= 4.5 && reviewsCount >= 50) {
    return `Yes, ${name} is highly rated with ${rating.toFixed(1)} stars from ${reviewsCount} reviews.`;
  }
  if (rating >= 4.0 && reviewsCount >= 20) {
    return `${name} is well-rated with ${rating.toFixed(1)} stars from ${reviewsCount} reviews.`;
  }
  if (rating >= 3.5) {
    return `${name} has a ${rating.toFixed(1)}-star rating. Reviews are generally positive.`;
  }
  if (rating >= 3.0) {
    return `${name} has a ${rating.toFixed(1)}-star rating. Reviews are mixed.`;
  }
  return `${name} has a ${rating.toFixed(1)}-star rating.`;
}

/**
 * Convert price symbol to description
 */
function getPriceDescription(price: string): string {
  const dollarCount = (price.match(/\$/g) || []).length;
  
  switch (dollarCount) {
    case 1:
      return 'budget-friendly';
    case 2:
      return 'moderately priced';
    case 3:
      return 'higher-priced';
    case 4:
      return 'premium-priced';
    default:
      return 'priced';
  }
}
