#!/usr/bin/env node

/**
 * Merge generated Indian SEO-summary drafts into the runtime map, preserving
 * all existing (Chinese) entries.
 *
 * Reads the generator's drafts JSONL (status === "ok" rows), converts each to
 * the runtime shape the app expects, and merges by pathname key into
 * lib/generated/llm-seo-summary-drafts.json.
 *
 * Runtime gate (lib/llmSeoSummaries.ts): an entry renders only if
 *   status === "draft" && qaStatus === "accepted".
 *
 * Usage:
 *   node scripts/merge-indian-seo-summaries.js --dry-run
 *   node scripts/merge-indian-seo-summaries.js            # write
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const DRAFTS = path.resolve(process.cwd(), argv.includes('--input') ? argv[argv.indexOf('--input') + 1] : 'scripts/output/indian-seo-summary-drafts-full.jsonl');
const MAP = path.resolve(process.cwd(), 'lib/generated/llm-seo-summary-drafts.json');

const MIN_WORDS = 40; // skip anything suspiciously short

function pathKey(url) { try { return new URL(url).pathname.replace(/\/$/, ''); } catch { return null; } }
function wordCount(s) { return (s || '').trim().split(/\s+/).filter(Boolean).length; }

function main() {
  const drafts = fs.readFileSync(DRAFTS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));

  const beforeCN = Object.keys(map).filter((k) => k.startsWith('/chinese-buffets/')).length;
  const beforeIN = Object.keys(map).filter((k) => k.startsWith('/indian-buffets/')).length;

  let added = 0, skippedErr = 0, skippedShort = 0;
  for (const d of drafts) {
    if (d.status !== 'ok') { skippedErr++; continue; }
    const summary = d.output && d.output.llmSeoSummary;
    const key = pathKey(d.url);
    if (!summary || !key) { skippedErr++; continue; }
    const wc = wordCount(summary);
    if (wc < MIN_WORDS) { skippedShort++; continue; }
    map[key] = {
      summary,
      status: 'draft',
      qaStatus: 'accepted',
      wordCount: wc,
      sourceMethod: 'llm_openrouter_gemini_2_5_flash_lite',
      generatedAt: d.generatedAt || new Date().toISOString(),
    };
    added++;
  }

  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const afterCN = Object.keys(sorted).filter((k) => k.startsWith('/chinese-buffets/')).length;
  const afterIN = Object.keys(sorted).filter((k) => k.startsWith('/indian-buffets/')).length;

  console.log(`drafts: ${drafts.length} | added indian: ${added} | skipped(err): ${skippedErr} | skipped(short): ${skippedShort}`);
  console.log(`chinese keys: ${beforeCN} -> ${afterCN} (must be unchanged)`);
  console.log(`indian keys:  ${beforeIN} -> ${afterIN}`);

  if (afterCN !== beforeCN) { console.error('ABORT: Chinese key count changed — refusing to write.'); process.exit(1); }
  if (DRY) { console.log('[DRY RUN] not written.'); return; }
  fs.writeFileSync(MAP, JSON.stringify(sorted, null, 2) + '\n');
  console.log('✅ merged and written.');
}

main();
