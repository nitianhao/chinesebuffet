export type CostModel = 'free' | 'free_quota' | 'paid';

export type ProviderName =
  | 'overture'
  | 'overpass'
  | 'website'
  | 'manual_review'
  | 'tomtom'
  | 'geoapify'
  | 'yelp'
  | 'google'
  | 'vertex'
  | 'gemini'
  | 'foursquare'
  | 'external_llm';

export interface ProviderDefinition {
  name: ProviderName;
  enabled: boolean;
  costModel: CostModel;
  requiresApiKey: boolean;
  dailyRequestLimit: number | null;
  perRunRequestLimit: number | null;
}

export interface PipelineLimits {
  maxExternalRequestsPerRun: number;
  maxOverpassRequestsPerRun: number;
  maxWebsiteRequestsPerRun: number;
  maxWebsitePagesPerDomain: number;
  maxWebsiteCrawlDepth: number;
  maxConcurrentWebsiteRequests: number;
  requestDelayMsPerDomain: number;
  maxCandidatesPerRun: number;
}

export interface PipelineConfig {
  allowPaidApis: boolean;
  dryRun: boolean;
  enableOverture: boolean;
  enableOverpass: boolean;
  enableTomTom: boolean;
  enableGeoapify: boolean;
  enableYelp: boolean;
  enableGoogle: boolean;
  enableVertex: boolean;
  enableGemini: boolean;
  enableExternalLlm: boolean;
  limits: PipelineLimits;
  checkpointPath: string;
  stagingOutputPath: string;
  overturePlacesPath?: string;
  overpassBbox?: string;
  overpassEndpoint: string;
}

export type CandidateSource = 'overture' | 'overpass' | 'website' | 'manual';

export interface SourceCandidate {
  source: CandidateSource;
  sourceId: string;
  name: string;
  street?: string;
  cityName?: string;
  state?: string;
  stateAbbr?: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  categories: string[];
  rawTags?: Record<string, unknown>;
  discoveredAt: string;
}

export type ClassificationStatus =
  | 'needs_review'
  | 'likely_indian_buffet'
  | 'not_indian_buffet'
  | 'duplicate'
  | 'insufficient_evidence';

export interface StagedCandidate extends SourceCandidate {
  candidateKey: string;
  normalizedName: string;
  normalizedAddress?: string;
  evidence: string[];
  classificationStatus: ClassificationStatus;
  confidence: number;
  enrichment?: CandidateEnrichment;
}

export interface SourceContext {
  config: PipelineConfig;
  log: (level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) => void;
}

export interface CandidateEnrichment {
  osm?: {
    openingHours?: string;
    cuisine?: string;
    takeaway?: string;
    delivery?: string;
    wheelchair?: string;
    outdoorSeating?: string;
    indoorSeating?: string;
    paymentMethods?: string[];
    diet?: string[];
  };
  website?: {
    crawledUrls: string[];
    menuUrls: string[];
    titles: string[];
    hoursSnippets: string[];
    menuSnippets: string[];
    buffetSnippets: string[];
    contactSnippets: string[];
    failedUrls: Array<{
      url: string;
      reason: string;
    }>;
  };
  healthInspection?: {
    source: 'nyc_dohmh';
    matchConfidence: number;
    matchReasons: string[];
    camis: string;
    dba: string;
    boro?: string;
    cuisineDescription?: string;
    address?: string;
    phone?: string;
    currentGrade?: string;
    currentScore?: string | number;
    inspectionDate?: string;
    gradeDate?: string;
    violations?: Array<{
      code?: string;
      description: string;
      category: 'Critical' | 'General';
    }>;
    criticalViolationsCount?: number;
    generalViolationsCount?: number;
    inspectionHistory?: Array<{
      date: string;
      score?: string | number;
      grade?: string;
      violationsCount?: number;
      criticalViolationsCount?: number;
    }>;
    dataSource: string;
    lastUpdated?: string;
    permitNumber?: string;
    healthDepartmentUrl?: string;
    rawLatestInspection?: Record<string, unknown>;
  };
  overture?: {
    matchConfidence: number;
    matchReasons: string[];
    id: string;
    name?: string;
    categoryPrimary?: string;
    basicCategory?: string;
    taxonomyPrimary?: string;
    taxonomyHierarchy?: string[];
    websites?: string[];
    emails?: string[];
    socials?: string[];
    phones?: string[];
    brand?: {
      wikidata?: string;
      primaryName?: string;
      commonNames?: Record<string, string>;
    };
    commonNames?: Record<string, string>;
    addresses?: Array<{
      freeform?: string;
      locality?: string;
      postcode?: string;
      region?: string;
      country?: string;
    }>;
    operatingStatus?: string;
    confidence?: number;
    lat?: number;
    lng?: number;
    sources?: Array<{
      dataset?: string;
      license?: string;
      record_id?: string;
      update_time?: string;
      confidence?: number;
    }>;
    sourceSummary?: {
      datasets: string[];
      licenses: string[];
      latestUpdateTime?: string;
      highestSourceConfidence?: number;
      operatingStatusSignals: number;
    };
  };
}
