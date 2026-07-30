/**
 * Shard the monolithic LLM-generated content JSON files (lib/generated/*.json)
 * into per-state files under lib/generated/by-state/<map>/<state>.json.
 *
 * Motivation: the four monolithic files total ~8.5 MB and were statically
 * imported into the buffet detail server components, loading all of it into the
 * serverless function on every cold start. Sharding by state lets the loaders
 * lazily read only the state(s) actually requested.
 *
 * The monolithic files remain the source of truth for regeneration; this script
 * is idempotent — re-run it whenever the source files change.
 *
 *   npx tsx scripts/shard-llm-generated.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const GENERATED_DIR = path.join(process.cwd(), 'lib', 'generated');
const OUT_ROOT = path.join(GENERATED_DIR, 'by-state');

// source filename (without .json)  ->  shard subdirectory name
const MAPS: Record<string, string> = {
  'llm-seo-summary-drafts': 'seo-summary-drafts',
  'llm-menu-highlights': 'menu-highlights',
  'llm-good-to-know': 'good-to-know',
  'llm-customer-highlights': 'customer-highlights',
};

/** `/chinese-buffets/akron-oh/imperial-wok-oh` -> `oh` (unknown -> `_unknown`). */
function stateFromPath(pathname: string): string {
  const seg = pathname.split('/')[2] || '';
  const st = seg.split('-').pop() || '';
  return /^[a-z]{2}$/.test(st) ? st : '_unknown';
}

function rmDir(dir: string) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

let grandTotal = 0;
for (const [srcName, outName] of Object.entries(MAPS)) {
  const srcPath = path.join(GENERATED_DIR, `${srcName}.json`);
  if (!fs.existsSync(srcPath)) {
    console.warn(`skip: ${srcName}.json not found`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(srcPath, 'utf8')) as Record<string, unknown>;
  const keys = Object.keys(data);

  const byState: Record<string, Record<string, unknown>> = {};
  for (const key of keys) {
    const st = stateFromPath(key);
    (byState[st] ??= {})[key] = data[key];
  }

  const outDir = path.join(OUT_ROOT, outName);
  rmDir(outDir); // clean rebuild so removed keys don't linger
  fs.mkdirSync(outDir, { recursive: true });

  let written = 0;
  for (const [st, obj] of Object.entries(byState)) {
    fs.writeFileSync(path.join(outDir, `${st}.json`), JSON.stringify(obj));
    written += Object.keys(obj).length;
  }

  const states = Object.keys(byState).length;
  const ok = written === keys.length;
  console.log(
    `${outName.padEnd(20)} src:${String(keys.length).padStart(5)}  ` +
      `sharded:${String(written).padStart(5)}  states:${String(states).padStart(3)}  ${ok ? 'OK' : 'MISMATCH!'}`,
  );
  if (!ok) process.exitCode = 1;
  grandTotal += written;
}

console.log(`\nTotal entries sharded: ${grandTotal}`);
console.log(`Output: ${path.relative(process.cwd(), OUT_ROOT)}/<map>/<state>.json`);
