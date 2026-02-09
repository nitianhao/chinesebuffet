/**
 * Server-only structured data counts for pages and API.
 * Uses process.env only (no request.url). Never throws; returns safe fallbacks on error.
 * Cached with unstable_cache(revalidate: 3600) for ISR.
 */

import 'server-only';
import { unstable_cache } from 'next/cache';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

export interface StructuredDataCountResult {
  type: string;
  count: number;
  records: unknown[];
}

const DEFAULT_TYPE = 'hasTv';
const CACHE_TAG = 'structured-data-count';
const REVALIDATE_SEC = 3600;

async function fetchStructuredDataCountInternal(type: string): Promise<StructuredDataCountResult> {
  const token = process.env.INSTANT_ADMIN_TOKEN;
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';

  if (!token || typeof token !== 'string') {
    return { type, count: 0, records: [] };
  }

  try {
    const db = init({
      appId,
      adminToken: token,
      schema: (schema as any).default || schema,
    });

    const result = await db.query({
      structuredData: {
        $: {
          where: { type },
          limit: 100000,
        },
      },
    });

    const records = result.structuredData || [];
    return {
      type,
      count: records.length,
      records: records.length > 0 ? records.slice(0, 10) : [],
    };
  } catch (err) {
    console.error('[structuredDataCounts]', err instanceof Error ? err.message : String(err));
    return { type, count: 0, records: [] };
  }
}

/**
 * Returns structured data count (and sample records) for the given type.
 * Safe for use in pages and API: never throws, uses env only, cached 1h.
 */
export async function getStructuredDataCount(type: string = DEFAULT_TYPE): Promise<StructuredDataCountResult> {
  return unstable_cache(
    () => fetchStructuredDataCountInternal(type),
    [CACHE_TAG, type],
    { revalidate: REVALIDATE_SEC }
  )();
}
