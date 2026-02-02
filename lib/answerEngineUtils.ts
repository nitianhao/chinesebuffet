/**
 * Answer Engine Optimization Utilities
 * 
 * Functions to generate clear, quotable content for answer engines.
 * All output is designed to be:
 * - Factually accurate
 * - Directly quotable
 * - Free of filler words
 * - Specific and concrete
 */

export interface BuffetData {
  name: string;
  rating?: number;
  reviewsCount?: number;
  price?: string | null;
  cityName?: string;
  state?: string;
  address?: string;
  phone?: string;
}

/**
 * Generate a one-sentence summary of the buffet
 * Optimized for featured snippets
 */
export function generateOneSentenceSummary(buffet: BuffetData): string {
  const parts: string[] = [];
  
  // Start with name and type
  parts.push(`${buffet.name} is a Chinese buffet`);
  
  // Add location
  if (buffet.cityName && buffet.state) {
    parts[0] += ` in ${buffet.cityName}, ${buffet.state}`;
  }
  
  // Add rating if available
  if (buffet.rating && buffet.reviewsCount && buffet.reviewsCount >= 5) {
    parts.push(`rated ${buffet.rating.toFixed(1)} stars by ${buffet.reviewsCount} customers`);
  }
  
  // Add price if available
  if (buffet.price) {
    parts.push(`with ${getPriceDescription(buffet.price)} prices`);
  }
  
  // Combine parts
  if (parts.length === 1) {
    return parts[0] + '.';
  }
  
  return parts[0] + ', ' + parts.slice(1).join(' and ') + '.';
}

/**
 * Generate a verdict statement
 * Clear, quotable assessment
 */
export function generateVerdictStatement(buffet: BuffetData): string {
  const rating = buffet.rating || 0;
  const reviewsCount = buffet.reviewsCount || 0;
  const name = buffet.name;

  if (rating >= 4.5 && reviewsCount >= 50) {
    return `${name} is highly recommended with ${rating.toFixed(1)} stars from ${reviewsCount} reviews.`;
  }
  
  if (rating >= 4.0 && reviewsCount >= 20) {
    return `${name} is a solid choice with ${rating.toFixed(1)} stars from ${reviewsCount} reviews.`;
  }
  
  if (rating >= 4.0) {
    return `${name} has a ${rating.toFixed(1)}-star rating.`;
  }
  
  if (rating >= 3.5 && reviewsCount >= 10) {
    return `${name} has mixed reviews with a ${rating.toFixed(1)}-star rating from ${reviewsCount} customers.`;
  }
  
  if (rating >= 3.0) {
    return `${name} has a ${rating.toFixed(1)}-star rating.`;
  }
  
  if (reviewsCount > 0) {
    return `${name} has limited reviews.`;
  }
  
  return `${name} is a Chinese buffet restaurant.`;
}

/**
 * Generate contact information sentence
 */
export function generateContactSentence(buffet: BuffetData): string {
  const parts: string[] = [];
  
  if (buffet.phone) {
    parts.push(`call ${buffet.phone}`);
  }
  
  if (buffet.address) {
    parts.push(`visit at ${buffet.address}`);
  }
  
  if (parts.length === 0) {
    return '';
  }
  
  return `To reach ${buffet.name}, ${parts.join(' or ')}.`;
}

/**
 * Generate price comparison sentence
 */
export function generatePriceSentence(buffet: BuffetData): string {
  if (!buffet.price) return '';
  
  const dollarCount = (buffet.price.match(/\$/g) || []).length;
  
  switch (dollarCount) {
    case 1:
      return `${buffet.name} offers budget-friendly prices, typically under $15 per person.`;
    case 2:
      return `${buffet.name} has moderate prices, typically $15-30 per person.`;
    case 3:
      return `${buffet.name} has higher prices, typically $30-60 per person.`;
    case 4:
      return `${buffet.name} is premium-priced, typically over $60 per person.`;
    default:
      return `${buffet.name} is priced at ${buffet.price}.`;
  }
}

/**
 * Generate rating explanation sentence
 */
export function generateRatingSentence(buffet: BuffetData): string {
  if (!buffet.rating) return '';
  
  const rating = buffet.rating;
  const count = buffet.reviewsCount || 0;
  const name = buffet.name;
  
  if (count === 0) {
    return `${name} has not yet received customer reviews.`;
  }
  
  if (rating >= 4.5) {
    return `${name} is rated excellent at ${rating.toFixed(1)} stars based on ${count} reviews.`;
  }
  
  if (rating >= 4.0) {
    return `${name} is rated very good at ${rating.toFixed(1)} stars based on ${count} reviews.`;
  }
  
  if (rating >= 3.5) {
    return `${name} is rated good at ${rating.toFixed(1)} stars based on ${count} reviews.`;
  }
  
  if (rating >= 3.0) {
    return `${name} is rated average at ${rating.toFixed(1)} stars based on ${count} reviews.`;
  }
  
  return `${name} has a ${rating.toFixed(1)}-star rating based on ${count} reviews.`;
}

/**
 * Helper: Convert price to description
 */
function getPriceDescription(price: string): string {
  const dollarCount = (price.match(/\$/g) || []).length;
  
  switch (dollarCount) {
    case 1: return 'budget-friendly';
    case 2: return 'moderate';
    case 3: return 'higher';
    case 4: return 'premium';
    default: return '';
  }
}

/**
 * Generate structured facts array for answer engines
 */
export function generateStructuredFacts(buffet: BuffetData): Array<{
  property: string;
  value: string;
  sentence: string;
}> {
  const facts: Array<{ property: string; value: string; sentence: string }> = [];
  
  // Name fact
  facts.push({
    property: 'Name',
    value: buffet.name,
    sentence: `The restaurant name is ${buffet.name}.`,
  });
  
  // Type fact
  facts.push({
    property: 'Type',
    value: 'Chinese Buffet',
    sentence: `${buffet.name} is a Chinese buffet restaurant.`,
  });
  
  // Location fact
  if (buffet.cityName && buffet.state) {
    facts.push({
      property: 'Location',
      value: `${buffet.cityName}, ${buffet.state}`,
      sentence: `${buffet.name} is located in ${buffet.cityName}, ${buffet.state}.`,
    });
  }
  
  // Address fact
  if (buffet.address) {
    facts.push({
      property: 'Address',
      value: buffet.address,
      sentence: `The address is ${buffet.address}.`,
    });
  }
  
  // Rating fact
  if (buffet.rating) {
    const ratingValue = `${buffet.rating.toFixed(1)} stars`;
    const reviewText = buffet.reviewsCount ? ` (${buffet.reviewsCount} reviews)` : '';
    facts.push({
      property: 'Rating',
      value: ratingValue + reviewText,
      sentence: generateRatingSentence(buffet),
    });
  }
  
  // Price fact
  if (buffet.price) {
    facts.push({
      property: 'Price',
      value: buffet.price,
      sentence: generatePriceSentence(buffet),
    });
  }
  
  // Phone fact
  if (buffet.phone) {
    facts.push({
      property: 'Phone',
      value: buffet.phone,
      sentence: `The phone number is ${buffet.phone}.`,
    });
  }
  
  return facts;
}
