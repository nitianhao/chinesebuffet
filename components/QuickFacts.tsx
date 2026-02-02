'use client';

/**
 * QuickFacts Component
 * 
 * Displays clear, factual statements optimized for answer engines.
 * Each fact is designed to be quotable verbatim.
 * 
 * Answer Engine Optimization:
 * - Short, declarative sentences
 * - Specific data points (ratings, prices, hours)
 * - No filler words or hedging language
 * - Structured for easy extraction
 */

interface QuickFactsProps {
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
  };
}

export default function QuickFacts({ buffet }: QuickFactsProps) {
  const facts: Array<{ label: string; value: string; quotable: string }> = [];

  // Location fact
  if (buffet.cityName && buffet.state) {
    facts.push({
      label: 'Location',
      value: `${buffet.cityName}, ${buffet.state}`,
      quotable: `${buffet.name} is located in ${buffet.cityName}, ${buffet.state}.`,
    });
  }

  // Rating fact - specific and quotable
  if (buffet.rating && buffet.reviewsCount) {
    const ratingText = buffet.rating.toFixed(1);
    facts.push({
      label: 'Rating',
      value: `${ratingText} stars (${buffet.reviewsCount} reviews)`,
      quotable: `${buffet.name} has a ${ratingText}-star rating based on ${buffet.reviewsCount} customer reviews.`,
    });
  } else if (buffet.rating) {
    facts.push({
      label: 'Rating',
      value: `${buffet.rating.toFixed(1)} stars`,
      quotable: `${buffet.name} has a ${buffet.rating.toFixed(1)}-star rating.`,
    });
  }

  // Price fact
  if (buffet.price) {
    const priceDesc = getPriceDescription(buffet.price);
    facts.push({
      label: 'Price',
      value: buffet.price,
      quotable: `${buffet.name} is ${priceDesc}.`,
    });
  }

  // Phone fact
  const phone = buffet.contactInfo?.phone || buffet.phone;
  if (phone) {
    facts.push({
      label: 'Phone',
      value: phone,
      quotable: `The phone number for ${buffet.name} is ${phone}.`,
    });
  }

  // Address fact
  if (buffet.address) {
    facts.push({
      label: 'Address',
      value: buffet.address,
      quotable: `${buffet.name} is located at ${buffet.address}.`,
    });
  }

  // Hours summary - today's status
  if (buffet.hours?.isOpen !== undefined) {
    const status = buffet.hours.isOpen ? 'currently open' : 'currently closed';
    facts.push({
      label: 'Status',
      value: buffet.hours.isOpen ? 'Open now' : 'Closed',
      quotable: `${buffet.name} is ${status}.`,
    });
  }

  if (facts.length === 0) return null;

  return (
    <section 
      className="mb-6"
      aria-label="Quick facts"
      itemScope 
      itemType="https://schema.org/Restaurant"
    >
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Quick Facts
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {facts.map((fact, index) => (
            <div key={index} className="flex flex-col">
              <dt className="text-xs text-gray-500 font-medium">{fact.label}</dt>
              <dd className="text-sm font-semibold text-gray-900">{fact.value}</dd>
              {/* Hidden quotable text for search engines */}
              <span className="sr-only">{fact.quotable}</span>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * Convert price symbol to description
 */
function getPriceDescription(price: string): string {
  const dollarCount = (price.match(/\$/g) || []).length;
  
  switch (dollarCount) {
    case 1:
      return 'budget-friendly with prices under $15 per person';
    case 2:
      return 'moderately priced at $15-30 per person';
    case 3:
      return 'higher-priced at $30-60 per person';
    case 4:
      return 'premium-priced at over $60 per person';
    default:
      return `priced at ${price}`;
  }
}
