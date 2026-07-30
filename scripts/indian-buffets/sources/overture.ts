import fs from 'fs';
import path from 'path';
import type { SourceCandidate, SourceContext } from '../types';

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { features?: unknown[] }).features)) {
    return (value as { features: unknown[] }).features;
  }
  return [];
}

function readJsonOrJsonl(filePath: string): unknown[] {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];

  if (raw.startsWith('[') || raw.startsWith('{')) {
    return asArray(JSON.parse(raw));
  }

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function discoverOvertureCandidates(context: SourceContext): Promise<SourceCandidate[]> {
  const filePath = context.config.overturePlacesPath;
  if (!filePath) {
    context.log('warn', 'overture_skipped', { reason: 'OVERTURE_PLACES_PATH is not set' });
    return [];
  }

  const absolutePath = path.resolve(filePath);
  const records = readJsonOrJsonl(absolutePath);
  const candidates: SourceCandidate[] = [];

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    const feature = record as Record<string, unknown>;
    const properties = ((feature.properties || feature) as Record<string, unknown>) || {};
    const geometry = feature.geometry as { coordinates?: unknown[] } | undefined;
    const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
    const names = properties.names as { primary?: string; common?: string[] } | undefined;
    const addresses = properties.addresses as { freeform?: string; locality?: string; region?: string; postcode?: string }[] | undefined;
    const address = Array.isArray(addresses) ? addresses[0] : undefined;
    const categories = properties.categories as { main?: string; alternate?: string[] } | undefined;

    const name = getString(names?.primary) || getString(properties.name);
    if (!name) continue;

    candidates.push({
      source: 'overture',
      sourceId: getString(properties.id) || `overture:${candidates.length}`,
      name,
      street: getString(address?.freeform),
      cityName: getString(address?.locality),
      state: getString(address?.region),
      stateAbbr: getString(address?.region),
      postalCode: getString(address?.postcode),
      address: [address?.freeform, address?.locality, address?.region, address?.postcode].filter(Boolean).join(', '),
      website: getString(properties.website),
      lat: getNumber(coordinates[1]),
      lng: getNumber(coordinates[0]),
      categories: [categories?.main, ...(categories?.alternate || [])].filter((value): value is string => Boolean(value)),
      rawTags: properties,
      discoveredAt: new Date().toISOString(),
    });
  }

  context.log('info', 'overture_candidates_loaded', { count: candidates.length, path: absolutePath });
  return candidates;
}
