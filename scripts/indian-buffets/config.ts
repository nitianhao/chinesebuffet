import { DEFAULT_CHECKPOINT_PATH, DEFAULT_LIMITS, DEFAULT_STAGING_OUTPUT_PATH, PAID_PROVIDER_CREDENTIAL_ENV_VARS } from './constants';
import type { PipelineConfig } from './types';

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

function readPositiveIntegerEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

export function loadPipelineConfig(): PipelineConfig {
  const allowPaidApis = process.env.ALLOW_PAID_APIS === 'true';

  return {
    allowPaidApis,
    dryRun: readBooleanEnv('DRY_RUN', true),
    enableOverture: readBooleanEnv('ENABLE_OVERTURE', true),
    enableOverpass: readBooleanEnv('ENABLE_OVERPASS', true),
    enableTomTom: readBooleanEnv('ENABLE_TOMTOM', false),
    enableGeoapify: readBooleanEnv('ENABLE_GEOAPIFY', false),
    enableYelp: readBooleanEnv('ENABLE_YELP', false),
    enableGoogle: readBooleanEnv('ENABLE_GOOGLE', false),
    enableVertex: readBooleanEnv('ENABLE_VERTEX', false),
    enableGemini: readBooleanEnv('ENABLE_GEMINI', false),
    enableExternalLlm: readBooleanEnv('ENABLE_EXTERNAL_LLM', false),
    limits: {
      maxExternalRequestsPerRun: readPositiveIntegerEnv('MAX_EXTERNAL_REQUESTS_PER_RUN', DEFAULT_LIMITS.maxExternalRequestsPerRun),
      maxOverpassRequestsPerRun: readPositiveIntegerEnv('MAX_OVERPASS_REQUESTS_PER_RUN', DEFAULT_LIMITS.maxOverpassRequestsPerRun),
      maxWebsiteRequestsPerRun: readPositiveIntegerEnv('MAX_WEBSITE_REQUESTS_PER_RUN', DEFAULT_LIMITS.maxWebsiteRequestsPerRun),
      maxWebsitePagesPerDomain: readPositiveIntegerEnv('MAX_WEBSITE_PAGES_PER_DOMAIN', DEFAULT_LIMITS.maxWebsitePagesPerDomain),
      maxWebsiteCrawlDepth: readPositiveIntegerEnv('MAX_WEBSITE_CRAWL_DEPTH', DEFAULT_LIMITS.maxWebsiteCrawlDepth),
      maxConcurrentWebsiteRequests: readPositiveIntegerEnv('MAX_CONCURRENT_WEBSITE_REQUESTS', DEFAULT_LIMITS.maxConcurrentWebsiteRequests),
      requestDelayMsPerDomain: readPositiveIntegerEnv('REQUEST_DELAY_MS_PER_DOMAIN', DEFAULT_LIMITS.requestDelayMsPerDomain),
      maxCandidatesPerRun: readPositiveIntegerEnv('MAX_CANDIDATES_PER_RUN', DEFAULT_LIMITS.maxCandidatesPerRun),
    },
    checkpointPath: process.env.INDIAN_BUFFET_CHECKPOINT_PATH || DEFAULT_CHECKPOINT_PATH,
    stagingOutputPath: process.env.INDIAN_BUFFET_STAGING_OUTPUT_PATH || DEFAULT_STAGING_OUTPUT_PATH,
    overturePlacesPath: process.env.OVERTURE_PLACES_PATH,
    overpassBbox: process.env.INDIAN_BUFFET_BBOX,
    overpassEndpoint: process.env.OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter',
  };
}

export function getDetectedPaidCredentialNames(env: NodeJS.ProcessEnv = process.env): string[] {
  return PAID_PROVIDER_CREDENTIAL_ENV_VARS.filter((name) => {
    const value = env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function assertNoPaidCredentialsWhenDisallowed(config: PipelineConfig, env: NodeJS.ProcessEnv = process.env): void {
  if (config.allowPaidApis) return;

  const detected = getDetectedPaidCredentialNames(env);
  if (detected.length > 0) {
    throw new Error(
      `Paid-provider credentials are present while ALLOW_PAID_APIS is not exactly "true": ${detected.join(', ')}. Values were not logged.`
    );
  }
}
