import fs from 'fs';
import path from 'path';
import type { StagedCandidate } from './types';
import { enrichCandidatesWithOverture, loadOverturePlaces } from './sources/overture-match';

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
  const inputPath = process.env.INDIAN_BUFFET_OVERTURE_INPUT || 'data/indian-buffets/nyc-pilot-dohmh-enriched-candidates.json';
  const placesPath = process.env.INDIAN_BUFFET_OVERTURE_PLACES || 'data/indian-buffets/overture-nyc-places.json';
  const outputPath = process.env.INDIAN_BUFFET_OVERTURE_OUTPUT || 'data/indian-buffets/nyc-pilot-overture-enriched-candidates.json';
  const minimumConfidence = Number.parseFloat(process.env.OVERTURE_MATCH_MIN_CONFIDENCE || '0.65');

  log('overture_enrichment_start', { inputPath, placesPath, outputPath, minimumConfidence });
  const candidates = readJson<StagedCandidate[]>(inputPath);
  const places = loadOverturePlaces(placesPath);
  const enriched = enrichCandidatesWithOverture(candidates, places, minimumConfidence);
  const matched = enriched.filter((candidate) => candidate.enrichment?.overture);
  writeJson(outputPath, enriched);

  log('overture_enrichment_finish', {
    candidates: candidates.length,
    places: places.length,
    matched: matched.length,
    outputPath,
  });
}

main().catch((error) => {
  log('overture_enrichment_failed', { errorMessage: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
