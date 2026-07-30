import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { StagedCandidate } from './types';
import { enrichCandidatesWithNycDohmh, fetchNycIndianInspectionGroups } from './sources/nyc-dohmh';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

async function main(): Promise<void> {
  const inputPath = process.env.INDIAN_BUFFET_DOHMH_INPUT || 'data/indian-buffets/nyc-pilot-enriched-candidates.json';
  const outputPath = process.env.INDIAN_BUFFET_DOHMH_OUTPUT || 'data/indian-buffets/nyc-pilot-dohmh-enriched-candidates.json';
  const minimumConfidence = Number.parseFloat(process.env.NYC_DOHMH_MIN_CONFIDENCE || '0.65');

  log('nyc_dohmh_start', { inputPath, outputPath, minimumConfidence });
  const candidates = readJson<StagedCandidate[]>(inputPath);
  const groups = await fetchNycIndianInspectionGroups();
  const enriched = enrichCandidatesWithNycDohmh(candidates, groups, minimumConfidence);
  const matched = enriched.filter((candidate) => candidate.enrichment?.healthInspection);

  writeJson(outputPath, enriched);
  log('nyc_dohmh_finish', {
    candidates: candidates.length,
    dohmhGroups: groups.length,
    matched: matched.length,
    outputPath,
  });
}

main().catch((error) => {
  log('nyc_dohmh_failed', { errorMessage: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
