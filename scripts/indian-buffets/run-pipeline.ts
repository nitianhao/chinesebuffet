import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { assertNoPaidCredentialsWhenDisallowed, loadPipelineConfig } from './config';
import { classifyCandidate } from './classify';
import { buildProviderRegistry, assertProviderRegistryIsSafe, getEnabledProviders } from './sources/source-registry';
import type { SourceCandidate, StagedCandidate } from './types';
import { discoverOvertureCandidates } from './sources/overture';
import { discoverOverpassCandidates } from './sources/overpass';
import { enrichCandidatesFromWebsites } from './sources/website';
import { enrichCandidateFromOsmTags } from './enrich/osm-tags';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields }));
}

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function hashId(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function loadFixtureCandidates(filePath: string | undefined): SourceCandidate[] {
  if (!filePath) return [];

  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as SourceCandidate[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Fixture candidate file must contain an array: ${absolutePath}`);
  }

  return parsed;
}

async function writeStagingCandidates(config: ReturnType<typeof loadPipelineConfig>, candidates: StagedCandidate[]): Promise<number> {
  if (config.dryRun) return 0;

  const [{ init }, schemaModule] = await Promise.all([
    import('@instantdb/admin'),
    import('../../src/instant.schema'),
  ]);

  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required when DRY_RUN=false');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schemaModule.default,
  });

  const transactions = candidates.map((candidate) => {
    const entityId = hashId(candidate.candidateKey);
    return db.tx.indianBuffetCandidates[entityId].update({
      candidateKey: candidate.candidateKey,
      name: candidate.name,
      normalizedName: candidate.normalizedName,
      source: candidate.source,
      sourceIds: JSON.stringify([candidate.sourceId]),
      status: 'needs_review',
      classificationStatus: candidate.classificationStatus,
      confidence: candidate.confidence,
      cityName: candidate.cityName,
      state: candidate.state,
      stateAbbr: candidate.stateAbbr,
      street: candidate.street,
      postalCode: candidate.postalCode,
      address: candidate.address,
      normalizedAddress: candidate.normalizedAddress,
      phone: candidate.phone,
      website: candidate.website,
      lat: candidate.lat,
      lng: candidate.lng,
      categories: JSON.stringify(candidate.categories),
      evidence: JSON.stringify(candidate.evidence),
      rawSources: JSON.stringify([candidate.rawTags || {}]),
      discoveredAt: candidate.discoveredAt,
      updatedAt: new Date().toISOString(),
    });
  });

  for (let i = 0; i < transactions.length; i += 50) {
    await db.transact(transactions.slice(i, i + 50));
  }

  return candidates.length;
}

async function main(): Promise<void> {
  const runId = `indian-buffets-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const config = loadPipelineConfig();
  const providers = buildProviderRegistry(config);

  assertNoPaidCredentialsWhenDisallowed(config);
  assertProviderRegistryIsSafe(config, providers);

  log('info', 'pipeline_start', {
    runId,
    dryRun: config.dryRun,
    enabledProviders: getEnabledProviders(providers).map((provider) => provider.name),
    limits: config.limits,
  });

  const checkpoint = readJsonFile(config.checkpointPath, {
    runIds: [] as string[],
    processedCandidateKeys: [] as string[],
    updatedAt: new Date().toISOString(),
  });
  checkpoint.runIds.push(runId);

  const context = { config, log };
  const fixturePath = process.env.INDIAN_BUFFET_FIXTURE_CANDIDATES;
  const sourceCandidates: SourceCandidate[] = [
    ...loadFixtureCandidates(fixturePath),
    ...(config.enableOverture ? await discoverOvertureCandidates(context) : []),
    ...(config.enableOverpass ? await discoverOverpassCandidates(context) : []),
  ].slice(0, config.limits.maxCandidatesPerRun);

  const stagedByKey = new Map<string, StagedCandidate>();
  for (const candidate of sourceCandidates.map(classifyCandidate)) {
    const existing = stagedByKey.get(candidate.candidateKey);
    if (!existing || candidate.confidence > existing.confidence) {
      stagedByKey.set(candidate.candidateKey, candidate);
    }
  }

  const stagedCandidates = await enrichCandidatesFromWebsites(
    Array.from(stagedByKey.values()).map(enrichCandidateFromOsmTags),
    context
  );

  writeJsonFile(config.stagingOutputPath, stagedCandidates);
  const databaseWrites = await writeStagingCandidates(config, stagedCandidates);

  checkpoint.processedCandidateKeys = Array.from(
    new Set([...checkpoint.processedCandidateKeys, ...stagedCandidates.map((candidate) => candidate.candidateKey)])
  );
  checkpoint.updatedAt = new Date().toISOString();
  writeJsonFile(config.checkpointPath, checkpoint);

  log('info', 'pipeline_finish', {
    runId,
    sourceCandidates: sourceCandidates.length,
    stagedCandidates: stagedCandidates.length,
    likelyIndianBuffets: stagedCandidates.filter((candidate) => candidate.classificationStatus === 'likely_indian_buffet').length,
    stagingOutputPath: config.stagingOutputPath,
    checkpointPath: config.checkpointPath,
    databaseWrites,
  });
}

main().catch((error) => {
  log('error', 'pipeline_failed', { errorMessage: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
