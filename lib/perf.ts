/**
 * Lightweight server-side performance timing utility.
 *
 * All helpers are no-ops unless the environment variable PERF_LOG=1 is set,
 * so there is zero overhead in production unless explicitly enabled.
 *
 * Usage:
 *   import { perfMark, perfMs, queryDb } from '@/lib/perf';
 *
 *   const t0 = perfMark();
 *   const result = await queryDb(db, query, opts, 'city:los-angeles-ca');
 *   const ms = perfMs(t0);
 */

export const PERF_ENABLED = process.env.PERF_LOG === '1';

// ---------------------------------------------------------------------------
// Low-level timing
// ---------------------------------------------------------------------------

/** High-resolution start timestamp (ms). Always returns a number. */
export function perfMark(): number {
  return performance.now();
}

/** Milliseconds elapsed since `start`, rounded to 2 decimal places. */
export function perfMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Instrumented InstantDB query wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps `db.query()` with timing + size logging.
 *
 * Logs one JSON line when PERF_LOG=1:
 *   [perf][instantdb] {"label":"…","networkMs":…,"bytes":…,"items":…}
 *
 * Does NOT change caching or behavior — purely observational.
 */
export async function queryDb<T>(
  db: { query: (q: any, opts?: any) => Promise<T> },
  query: Record<string, unknown>,
  opts: Record<string, unknown> | undefined,
  label: string,
): Promise<T> {
  if (!PERF_ENABLED) {
    return db.query(query, opts);
  }

  const t0 = perfMark();
  const result = await db.query(query, opts);
  const networkMs = perfMs(t0);

  // Best-effort byte count and item count from the result
  let bytes = 0;
  let items = 0;
  try {
    const json = JSON.stringify(result);
    bytes = Buffer.byteLength(json, 'utf8');
    // Count top-level array lengths
    for (const val of Object.values(result as Record<string, unknown>)) {
      if (Array.isArray(val)) items += val.length;
    }
  } catch {
    // non-critical
  }

  console.log(
    `[perf][instantdb] ${JSON.stringify({ label, networkMs, bytes, items })}`,
  );

  // Size assertion: warn loudly if a single query returns > 1MB.
  // This catches runaway queries (e.g. fetching all buffet fields for a city).
  const ONE_MB = 1_048_576;
  if (bytes > ONE_MB) {
    console.error(
      `[perf][instantdb][ERROR] Response > 1MB! ${JSON.stringify({
        label,
        bytes,
        mbRounded: (bytes / ONE_MB).toFixed(1),
        queryKeys: Object.keys(query),
      })}`,
    );
  }

  return result;
}
