/**
 * Generate the cross-cuisine redirect map (SEO Bet 1, Approach B).
 *
 * Problem: Indian-cuisine buffets were historically indexed under
 * /chinese-buffets/<city>/<slug> URLs titled "Chinese Buffet". Commit fbc328f
 * added a cuisine guard that notFound()s those URLs — discarding live SEO
 * equity instead of transferring it. Page-level permanentRedirect() does NOT
 * fire for these because the route is ISR-cached (revalidate=86400,
 * fetchCache='force-cache'): cached HTML is served without re-running the page
 * function, so the redirect is swallowed (verified in prod: delisted URLs 200
 * with x-vercel-cache: HIT). Middleware runs before the cache on every request,
 * so the redirect must live there.
 *
 * This script emits lib/generated/cross-cuisine-redirects.json — a flat map of
 *   "/chinese-buffets/<city>/<slug>" -> "/indian-buffets/<city>/<slug>"
 * for every non-delisted Indian buffet. middleware.ts loads it and 308s on hit.
 *
 * Path construction mirrors sitemap-indian-buffets.xml exactly:
 * `/<cuisine-base>/${city.slug}/${buffet.slug}`. Source and target share the
 * same buffet's city slug + own slug, so a redirect can never chain into a 404
 * of a different, non-existent page — the target is that buffet's own page.
 *
 * Self-contained: queries InstantDB via @instantdb/admin directly rather than
 * importing lib/data-instantdb.ts, which calls React cache() at module load and
 * cannot run outside the Next runtime.
 *
 * Target-existence guard: also fetches the live sitemap-indian-buffets.xml and
 * records which targets are present. Targets absent from the sitemap are
 * non-indexable (e.g. staged-indexing gated) but still render 200, so they are
 * emitted by default and written to a companion *-skipped-review.json for
 * visibility. Pass --sitemap-only to emit ONLY sitemap-present targets (the
 * strictest, pre-registered rule).
 *
 * Usage:
 *   npx tsx scripts/generate-cross-cuisine-redirects.ts
 *   npx tsx scripts/generate-cross-cuisine-redirects.ts --sitemap-only
 */

import * as fs from 'fs';
import * as path from 'path';
import { init } from '@instantdb/admin';

// --- env (load .env.local without a dotenv dependency) ---------------------
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
  process.env.INSTANT_APP_ID ||
  '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.error('INSTANT_ADMIN_TOKEN is required (set in .env.local).');
  process.exit(1);
}

const OUT_DIR = path.join(process.cwd(), 'lib', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'cross-cuisine-redirects.json');
const SKIPPED_FILE = path.join(OUT_DIR, 'cross-cuisine-redirects-skipped-review.json');
const SITEMAP_URL =
  process.env.SITEMAP_URL || 'https://buffetlocator.com/sitemap-indian-buffets.xml';
const SITEMAP_ONLY = process.argv.includes('--sitemap-only');
const PAGE = 500;

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

/**
 * Same predicate as lib/cuisine.ts getCuisineBasePath(): Indian when the type
 * string contains "indian"; everything else (incl. missing/legacy) is Chinese.
 * Inlined to avoid importing the Next-coupled module graph.
 */
function isIndian(cuisineType?: string | null): boolean {
  return (cuisineType || '').toLowerCase().includes('indian');
}

/** Fetch the live Indian sitemap and return the set of <loc> pathnames. */
async function fetchSitemapPaths(url: string): Promise<Set<string>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status} ${res.statusText} (${url})`);
  const xml = await res.text();
  const paths = new Set<string>();
  const locRe = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(xml)) !== null) {
    try {
      paths.add(new URL(m[1].trim()).pathname);
    } catch {
      /* skip malformed loc */
    }
  }
  return paths;
}

async function main() {
  console.log('Generating cross-cuisine redirect map (Bet 1, Approach B)…');
  console.log(`Mode: ${SITEMAP_ONLY ? 'sitemap-only (strict)' : 'emit-all + log non-indexable'}`);

  const sitemapPaths = await fetchSitemapPaths(SITEMAP_URL);
  console.log(`Indian sitemap: ${sitemapPaths.size} indexable target URLs (${SITEMAP_URL})`);
  if (sitemapPaths.size === 0) {
    throw new Error('Indian sitemap returned 0 URLs — refusing to generate against an empty target set.');
  }

  const redirects: Record<string, string> = {};
  const skipped: Array<{ source: string; target: string; reason: string }> = [];
  let indianScanned = 0;
  let noCitySlug = 0;
  let delistedSkipped = 0;

  // Paginate all Indian buffets with their linked city (for the slug segment).
  for (let offset = 0; ; offset += PAGE) {
    const r: any = await db.query({
      buffets: { $: { where: { cuisineType: 'indian' }, limit: PAGE, offset }, city: {} },
    });
    const batch: any[] = r.buffets || [];
    if (batch.length === 0) break;

    for (const b of batch) {
      // Belt-and-suspenders: honour the shared predicate even though we queried
      // on the exact value, in case of future variant cuisineType strings.
      if (!isIndian(b.cuisineType)) continue;
      indianScanned++;

      if (b.delisted) {
        delistedSkipped++;
        continue;
      }

      const cityEntity = Array.isArray(b.city) ? b.city[0] : b.city;
      const citySlug: string | undefined = cityEntity?.slug;
      if (!citySlug || !b.slug) {
        noCitySlug++;
        continue;
      }

      const source = `/chinese-buffets/${citySlug}/${b.slug}`;
      const target = `/indian-buffets/${citySlug}/${b.slug}`;

      if (!sitemapPaths.has(target)) {
        skipped.push({ source, target, reason: 'target-not-in-indian-sitemap (non-indexable; still renders 200)' });
        if (SITEMAP_ONLY) continue;
      }
      redirects[source] = target;
    }

    if (batch.length < PAGE) break;
  }

  const sortedKeys = Object.keys(redirects).sort();
  const sorted: Record<string, string> = {};
  for (const k of sortedKeys) sorted[k] = redirects[k];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n');
  fs.writeFileSync(SKIPPED_FILE, JSON.stringify(skipped, null, 2) + '\n');

  console.log('');
  console.log(`Indian buffets scanned:          ${indianScanned}`);
  console.log(`  delisted (excluded):           ${delistedSkipped}`);
  console.log(`  missing city slug (excluded):  ${noCitySlug}`);
  console.log(`Redirects emitted:               ${sortedKeys.length}`);
  console.log(`Non-indexable (not in sitemap):  ${skipped.length}` + (SITEMAP_ONLY ? ' (excluded)' : ' (included; logged)'));
  console.log('');
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Wrote ${SKIPPED_FILE}`);
}

main().catch((err) => {
  console.error('generate-cross-cuisine-redirects failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
