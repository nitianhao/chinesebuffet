import type { CandidateEnrichment, StagedCandidate } from '../types';

function readTag(tags: Record<string, unknown>, key: string): string | undefined {
  const value = tags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function collectPaymentMethods(tags: Record<string, unknown>): string[] {
  return Object.keys(tags)
    .filter((key) => key.startsWith('payment:') && tags[key] === 'yes')
    .map((key) => key.replace(/^payment:/, ''))
    .sort();
}

function collectDietTags(tags: Record<string, unknown>): string[] {
  return Object.keys(tags)
    .filter((key) => key.startsWith('diet:') && tags[key] === 'yes')
    .map((key) => key.replace(/^diet:/, ''))
    .sort();
}

export function enrichCandidateFromOsmTags(candidate: StagedCandidate): StagedCandidate {
  const tags = candidate.rawTags || {};
  const osm: CandidateEnrichment['osm'] = {
    openingHours: readTag(tags, 'opening_hours') || readTag(tags, 'opening_hours:signed'),
    cuisine: readTag(tags, 'cuisine'),
    takeaway: readTag(tags, 'takeaway'),
    delivery: readTag(tags, 'delivery'),
    wheelchair: readTag(tags, 'wheelchair'),
    outdoorSeating: readTag(tags, 'outdoor_seating'),
    indoorSeating: readTag(tags, 'indoor_seating'),
    paymentMethods: collectPaymentMethods(tags),
    diet: collectDietTags(tags),
  };

  const hasAnyValue = Object.values(osm).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

  if (!hasAnyValue) return candidate;

  return {
    ...candidate,
    enrichment: {
      ...candidate.enrichment,
      osm,
    },
  };
}
