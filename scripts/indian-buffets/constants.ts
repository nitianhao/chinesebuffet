export const DEFAULT_LIMITS = {
  maxExternalRequestsPerRun: 200,
  maxOverpassRequestsPerRun: 50,
  maxWebsiteRequestsPerRun: 500,
  maxWebsitePagesPerDomain: 20,
  maxWebsiteCrawlDepth: 2,
  maxConcurrentWebsiteRequests: 3,
  requestDelayMsPerDomain: 1500,
  maxCandidatesPerRun: 1000,
} as const;

export const PAID_PROVIDER_CREDENTIAL_ENV_VARS = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_API_KEY',
  'VERTEX_API_KEY',
  'GEMINI_API_KEY',
  'FOURSQUARE_API_KEY',
] as const;

export const DEFAULT_CHECKPOINT_PATH = 'data/indian-buffets/pipeline-checkpoint.json';
export const DEFAULT_STAGING_OUTPUT_PATH = 'data/indian-buffets/staging-candidates.json';

export const INDIAN_CUISINE_TERMS = [
  'indian',
  'india',
  'tandoor',
  'tandoori',
  'curry',
  'biryani',
  'masala',
  'punjabi',
  'gujarati',
  'south indian',
  'hyderabadi',
  'chaat',
] as const;

export const BUFFET_TERMS = [
  'buffet',
  'lunch buffet',
  'dinner buffet',
  'all you can eat',
  'all-you-can-eat',
  'ayce',
] as const;
