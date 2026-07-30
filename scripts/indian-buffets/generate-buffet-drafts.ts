import fs from 'fs';
import path from 'path';
import { init } from '@instantdb/admin';
import type { StagedCandidate } from './types';
import { mapStagedCandidateToBuffetDraftBundle } from './map/to-buffet-draft';

function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const envPath = path.join(process.cwd(), file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && trimmed !== '[]' && trimmed !== '{}' && trimmed !== 'null';
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function countFieldCoverage(rows: Array<Record<string, unknown>>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'id') continue;
      if (!counts.has(key)) counts.set(key, 0);
      if (isNonEmpty(value)) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function loadChineseBuffetFieldCoverage(): Promise<{ total: number; fields: Record<string, number> }> {
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required to build parity report from existing buffets');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
  });

  const rows: Array<Record<string, unknown>> = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit, offset },
      },
    });
    const batch = (result.buffets || []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return {
    total: rows.length,
    fields: countFieldCoverage(rows),
  };
}

function buildParityReport(
  chinese: { total: number; fields: Record<string, number> },
  indianDrafts: Array<Record<string, unknown>>
) {
  const indian = {
    total: indianDrafts.length,
    fields: countFieldCoverage(indianDrafts),
  };
  const allFields = Array.from(new Set([...Object.keys(chinese.fields), ...Object.keys(indian.fields)])).sort();
  const comparison = allFields.map((field) => {
    const chineseCount = chinese.fields[field] || 0;
    const indianCount = indian.fields[field] || 0;
    const chinesePct = chinese.total ? chineseCount / chinese.total : 0;
    const indianPct = indian.total ? indianCount / indian.total : 0;
    return {
      field,
      chineseCount,
      chinesePct: Number(chinesePct.toFixed(3)),
      indianCount,
      indianPct: Number(indianPct.toFixed(3)),
      gapPct: Number((chinesePct - indianPct).toFixed(3)),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    chinese,
    indian,
    comparison,
    highValueGaps: comparison
      .filter((row) => row.chinesePct >= 0.5 && row.indianPct < row.chinesePct)
      .sort((a, b) => b.gapPct - a.gapPct),
  };
}

async function main(): Promise<void> {
  loadEnv();
  const inputPath = process.env.INDIAN_BUFFET_DRAFT_INPUT || 'data/indian-buffets/nyc-pilot-overture-enriched-candidates.json';
  const draftsPath = process.env.INDIAN_BUFFET_DRAFT_OUTPUT || 'data/indian-buffets/nyc-pilot-buffet-drafts.json';
  const reportPath = process.env.INDIAN_BUFFET_PARITY_REPORT || 'data/indian-buffets/nyc-pilot-parity-report.json';

  const candidates = readJson<StagedCandidate[]>(inputPath);
  const bundles = candidates.map(mapStagedCandidateToBuffetDraftBundle);
  const buffetDrafts = bundles.map((bundle) => bundle.buffet as unknown as Record<string, unknown>);
  writeJson(draftsPath, bundles);

  const chinese = await loadChineseBuffetFieldCoverage();
  const report = buildParityReport(chinese, buffetDrafts);
  writeJson(reportPath, report);

  console.log(JSON.stringify({
    event: 'buffet_drafts_generated',
    candidates: candidates.length,
    draftsPath,
    reportPath,
    structuredDataDrafts: bundles.reduce((sum, bundle) => sum + bundle.structuredDataDrafts.length, 0),
    topRemainingGaps: report.highValueGaps.slice(0, 12),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
