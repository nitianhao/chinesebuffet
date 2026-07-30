/**
 * Lazy, memoized reader for the per-state LLM-content shards produced by
 * scripts/shard-llm-generated.ts (lib/generated/by-state/<map>/<state>.json).
 *
 * Replaces the previous pattern of statically importing the ~8.5 MB monolithic
 * JSON maps into the buffet detail server components. Only the state shard(s)
 * actually requested are read from disk, and each is cached in module scope for
 * the lifetime of the (warm) server instance.
 *
 * Server-only: reads from the filesystem. The shard files are shipped with the
 * relevant routes via `experimental.outputFileTracingIncludes` in next.config.js.
 */
import fs from 'node:fs';
import path from 'node:path';

const SHARD_ROOT = path.join(process.cwd(), 'lib', 'generated', 'by-state');

// `${map}/${state}` -> parsed shard (or {} when the shard file is absent).
const shardCache = new Map<string, Record<string, unknown>>();

/** `/chinese-buffets/akron-oh/imperial-wok-oh` -> `oh` (malformed -> `_unknown`). */
function stateFromPath(pathname: string): string {
  const seg = pathname.split('/')[2] || '';
  const st = seg.split('-').pop() || '';
  return /^[a-z]{2}$/.test(st) ? st : '_unknown';
}

function loadShard(map: string, state: string): Record<string, unknown> {
  const cacheKey = `${map}/${state}`;
  const cached = shardCache.get(cacheKey);
  if (cached) return cached;

  let shard: Record<string, unknown> = {};
  try {
    shard = JSON.parse(fs.readFileSync(path.join(SHARD_ROOT, map, `${state}.json`), 'utf8'));
  } catch {
    // Missing shard (no generated content for this state) -> treat as empty.
    shard = {};
  }
  shardCache.set(cacheKey, shard);
  return shard;
}

/**
 * Look up a single page's generated entry within its state shard.
 * `map` is the shard subdirectory name, e.g. 'seo-summary-drafts'.
 */
export function lookupStateShard<T>(map: string, pathname: string): T | null {
  const shard = loadShard(map, stateFromPath(pathname));
  const normalizedPath = pathname.replace(/\/$/, '');
  return (shard[normalizedPath] as T) ?? null;
}
