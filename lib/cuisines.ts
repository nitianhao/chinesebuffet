export type CuisineKey = 'chinese' | 'indian';

export interface CuisineDef {
  key: CuisineKey;
  label: string;
  /** Absolute route prefix for this cuisine's tree, no trailing slash. */
  routePrefix: string;
}

/**
 * Single source of truth for cuisines the directory serves.
 * Neutral hub/nav surfaces iterate this instead of hardcoding "chinese".
 * To add a cuisine: add an entry here, its route tree, and its rollup module.
 */
export const CUISINES: readonly CuisineDef[] = [
  { key: 'chinese', label: 'Chinese', routePrefix: '/chinese-buffets' },
  { key: 'indian', label: 'Indian', routePrefix: '/indian-buffets' },
] as const;

export function cuisineByKey(key: string): CuisineDef | undefined {
  return CUISINES.find((c) => c.key === key);
}
