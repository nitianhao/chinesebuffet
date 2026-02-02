/**
 * Utility functions for generating and extracting summaries
 */

/**
 * Generate a 1–2 line human-friendly hero summary (NOT SEO fluff).
 * Used above the fold for quick decision support.
 */
export function getHeroSummary(buffet: {
  reviewSummaryParagraph1?: string | null;
  description2?: string | null;
  description?: string | null;
  categories?: string[] | null;
  price?: string | null;
  cityName?: string | null;
  address?: { city?: string } | string | null;
}): string {
  // Prefer review-derived summary (real customer voice)
  const reviewSummary = buffet.reviewSummaryParagraph1?.trim();
  if (reviewSummary && reviewSummary.length > 20 && reviewSummary.length < 180) {
    return extractPreviewSummary(reviewSummary, 1);
  }

  // Fallback: first sentence from description2/description (strip **bold**)
  const desc = (buffet.description2 || buffet.description || '').trim();
  if (desc.length > 30) {
    const stripped = desc.replace(/\*\*([^*]+)\*\*/g, '$1');
    const firstSentence = stripped.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 25 && firstSentence.length < 140) {
      return firstSentence + (firstSentence.endsWith('.') ? '' : '.');
    }
  }

  // Fallback: simple human line from categories + price
  const cuisineTypes = buffet.categories
    ?.filter((c: string) => !/restaurant|buffet/i.test(c))
    .slice(0, 2) || [];
  const cuisine = cuisineTypes.length > 0 ? cuisineTypes.join(', ') : 'Chinese buffet';
  const city = typeof buffet.address === 'object' && buffet.address?.city
    ? buffet.address.city
    : buffet.cityName || '';
  const location = city ? ` in ${city}` : '';
  const pricePart = buffet.price ? ` ${buffet.price}` : '';
  return `${cuisine}${location}.${pricePart}`;
}

/**
 * Extract the first 1-2 sentences from a summary text
 * Useful for creating preview summaries for collapsed sections
 */
export function extractPreviewSummary(fullSummary: string | null | undefined, maxSentences: number = 2): string {
  if (!fullSummary || typeof fullSummary !== 'string') {
    return '';
  }

  // Split by sentence-ending punctuation
  const sentences = fullSummary
    .split(/([.!?]+[\s\n]+)/)
    .filter(s => s.trim().length > 0)
    .reduce<string[]>((acc, curr, index, array) => {
      // Reattach punctuation to previous sentence
      if (index > 0 && /^[.!?]+\s*$/.test(curr)) {
        if (acc.length > 0) {
          acc[acc.length - 1] += curr;
        }
      } else if (curr.trim().length > 0) {
        acc.push(curr.trim());
      }
      return acc;
    }, []);

  // Take first 1-2 sentences
  const preview = sentences.slice(0, maxSentences).join(' ');

  // Ensure it ends with proper punctuation
  if (preview && !/[.!?]$/.test(preview.trim())) {
    return preview.trim() + '.';
  }

  return preview.trim();
}
