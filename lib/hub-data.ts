import { CUISINES, type CuisineKey } from './cuisines';

export interface RawCityRow {
  slug: string;
  city?: string;
  state?: string;
  buffetCount?: number;
}

export interface CuisineAvailability {
  key: CuisineKey;
  label: string;
  count: number;
}

export interface NeutralCityRow {
  slug: string;
  city: string;
  state: string;
  totalCount: number;
  cuisines: CuisineAvailability[];
}

/**
 * Pure merge: union city rows across cuisines by slug. A cuisine only appears
 * in a row's `cuisines` list when it has a positive buffet count there.
 * Sorted by totalCount desc, then city name asc.
 */
export function mergeCityRollups(
  perCuisine: { key: CuisineKey; label: string; rows: RawCityRow[] }[],
): NeutralCityRow[] {
  const bySlug = new Map<string, NeutralCityRow>();

  for (const { key, label, rows } of perCuisine) {
    for (const row of rows) {
      const count = row.buffetCount ?? 0;
      let entry = bySlug.get(row.slug);
      if (!entry) {
        entry = {
          slug: row.slug,
          city: row.city ?? '',
          state: row.state ?? '',
          totalCount: 0,
          cuisines: [],
        };
        bySlug.set(row.slug, entry);
      }
      // Fill city/state if a later cuisine has them and we don't yet.
      if (!entry.city && row.city) entry.city = row.city;
      if (!entry.state && row.state) entry.state = row.state;
      if (count > 0) {
        entry.cuisines.push({ key, label, count });
        entry.totalCount += count;
      }
    }
  }

  return Array.from(bySlug.values())
    .filter((r) => r.cuisines.length > 0)
    .sort((a, b) => b.totalCount - a.totalCount || a.city.localeCompare(b.city));
}

/**
 * Async fetcher: pull each cuisine's cities rollup and merge.
 * Order of `rows` follows CUISINES so labels/keys stay stable.
 *
 * Rollup modules are imported dynamically (not at module top level) so this
 * file stays importable — and `mergeCityRollups` unit-testable — under plain
 * `tsx`, since `lib/rollups.ts` calls React's `cache()` at module load time,
 * which is only available in the Next.js/React Server Components runtime.
 */
export async function getNeutralCitiesRollup(): Promise<NeutralCityRow[]> {
  const [{ getCitiesRollup: getChineseCities }, { getCitiesRollup: getIndianCities }] =
    await Promise.all([import('./rollups'), import('./indian-rollups')]);
  const [chinese, indian] = await Promise.all([
    getChineseCities(),
    getIndianCities(),
  ]);
  const byKey: Record<CuisineKey, RawCityRow[]> = {
    chinese: (chinese.cities as RawCityRow[]) ?? [],
    indian: (indian.cities as RawCityRow[]) ?? [],
  };
  return mergeCityRollups(
    CUISINES.map((c) => ({ key: c.key, label: c.label, rows: byKey[c.key] ?? [] })),
  );
}
