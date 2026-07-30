import type { PipelineConfig, ProviderDefinition } from '../types';

export function buildProviderRegistry(config: PipelineConfig): ProviderDefinition[] {
  return [
    {
      name: 'overture',
      enabled: config.enableOverture,
      costModel: 'free',
      requiresApiKey: false,
      dailyRequestLimit: null,
      perRunRequestLimit: config.limits.maxExternalRequestsPerRun,
    },
    {
      name: 'overpass',
      enabled: config.enableOverpass,
      costModel: 'free',
      requiresApiKey: false,
      dailyRequestLimit: null,
      perRunRequestLimit: config.limits.maxOverpassRequestsPerRun,
    },
    {
      name: 'website',
      enabled: true,
      costModel: 'free',
      requiresApiKey: false,
      dailyRequestLimit: null,
      perRunRequestLimit: config.limits.maxWebsiteRequestsPerRun,
    },
    {
      name: 'manual_review',
      enabled: true,
      costModel: 'free',
      requiresApiKey: false,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'tomtom',
      enabled: config.enableTomTom,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'geoapify',
      enabled: config.enableGeoapify,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'yelp',
      enabled: config.enableYelp,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'google',
      enabled: config.enableGoogle,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'vertex',
      enabled: config.enableVertex,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'gemini',
      enabled: config.enableGemini,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'foursquare',
      enabled: false,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
    {
      name: 'external_llm',
      enabled: config.enableExternalLlm,
      costModel: 'paid',
      requiresApiKey: true,
      dailyRequestLimit: null,
      perRunRequestLimit: null,
    },
  ];
}

export function assertProviderRegistryIsSafe(config: PipelineConfig, providers: ProviderDefinition[]): void {
  if (config.allowPaidApis) return;

  const enabledPaidProviders = providers
    .filter((provider) => provider.enabled && provider.costModel === 'paid')
    .map((provider) => provider.name);

  if (enabledPaidProviders.length > 0) {
    throw new Error(
      `Paid providers cannot run unless ALLOW_PAID_APIS is exactly "true": ${enabledPaidProviders.join(', ')}`
    );
  }
}

export function getEnabledProviders(providers: ProviderDefinition[]): ProviderDefinition[] {
  return providers.filter((provider) => provider.enabled);
}
