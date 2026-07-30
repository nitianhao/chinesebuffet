/**
 * Central cuisine-label helper.
 *
 * The directory serves multiple cuisines (Chinese, Indian, ...) from parallel
 * route trees. Shared copy/description code should derive the cuisine noun from
 * a buffet's `cuisineType` rather than hardcoding "Chinese".
 *
 * Defaults to "Chinese" when the type is missing/unknown so existing Chinese
 * pages and legacy records are unaffected.
 */

export function getCuisineNoun(cuisineType?: string | null): string {
  const c = (cuisineType || '').toLowerCase();
  if (c.includes('indian')) return 'Indian';
  if (c.includes('chinese')) return 'Chinese';
  return 'Chinese'; // backward-compatible default
}

/** e.g. "Chinese buffet" / "Indian buffet" */
export function getCuisineBuffetLabel(cuisineType?: string | null): string {
  return `${getCuisineNoun(cuisineType)} buffet`;
}

/** Route prefix for the cuisine's pages, e.g. "/chinese-buffets" / "/indian-buffets" */
export function getCuisineBasePath(cuisineType?: string | null): string {
  return getCuisineNoun(cuisineType) === 'Indian' ? '/indian-buffets' : '/chinese-buffets';
}
