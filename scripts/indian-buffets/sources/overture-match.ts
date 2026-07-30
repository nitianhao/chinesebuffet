import fs from 'fs';
import type { CandidateEnrichment, StagedCandidate } from '../types';
import { normalizeAddress } from '../normalize/normalize-address';
import { normalizeName } from '../normalize/normalize-name';
import { normalizePhone } from '../normalize/normalize-phone';

interface OverturePlace {
  id: string;
  name?: string;
  category_primary?: string;
  basic_category?: string;
  taxonomy_primary?: string;
  taxonomy_hierarchy?: string[];
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
  operating_status?: string;
  confidence?: number;
  sources?: Array<{
    dataset?: string;
    property?: string;
    license?: string;
    record_id?: string;
    update_time?: string;
    confidence?: number;
  }>;
  lat?: number;
  lng?: number;
}

interface OvertureMatch {
  place: OverturePlace;
  confidence: number;
  reasons: string[];
}

function tokenize(value: string | undefined): Set<string> {
  return new Set(
    normalizeName(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  );
}

function jaccard(a: string | undefined, b: string | undefined): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.size || !bTokens.size) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  return intersection / new Set([...aTokens, ...bTokens]).size;
}

function distanceMeters(aLat?: number, aLng?: number, bLat?: number, bLng?: number): number {
  if ([aLat, aLng, bLat, bLng].some((value) => typeof value !== 'number' || Number.isNaN(value))) {
    return Number.POSITIVE_INFINITY;
  }

  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad((bLat as number) - (aLat as number));
  const dLng = toRad((bLng as number) - (aLng as number));
  const lat1 = toRad(aLat as number);
  const lat2 = toRad(bLat as number);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function primaryAddress(place: OverturePlace): string {
  const address = place.addresses?.[0];
  if (!address) return '';
  return [address.freeform, address.locality, address.region, address.postcode].filter(Boolean).join(', ');
}

function scoreMatch(candidate: StagedCandidate, place: OverturePlace): OvertureMatch {
  const reasons: string[] = [];
  let score = 0;

  const nameSimilarity = jaccard(candidate.name, place.name);
  if (nameSimilarity >= 0.9) {
    score += 0.5;
    reasons.push(`strong_name:${nameSimilarity.toFixed(2)}`);
  } else if (nameSimilarity >= 0.65) {
    score += 0.35;
    reasons.push(`medium_name:${nameSimilarity.toFixed(2)}`);
  } else if (nameSimilarity >= 0.45) {
    score += 0.2;
    reasons.push(`weak_name:${nameSimilarity.toFixed(2)}`);
  }

  const candidatePhone = normalizePhone(candidate.phone);
  const placePhones = (place.phones || []).map(normalizePhone).filter(Boolean);
  if (candidatePhone && placePhones.includes(candidatePhone)) {
    score += 0.25;
    reasons.push('phone_match');
  }

  const candidatePostcode = candidate.postalCode?.slice(0, 5);
  const placePostcodes = (place.addresses || []).map((address) => address.postcode?.slice(0, 5)).filter(Boolean);
  if (candidatePostcode && placePostcodes.includes(candidatePostcode)) {
    score += 0.15;
    reasons.push('zip_match');
  }

  const candidateStreet = normalizeAddress(candidate.street || candidate.address);
  const placeStreet = normalizeAddress(place.addresses?.[0]?.freeform);
  if (candidateStreet && placeStreet && (candidateStreet.includes(placeStreet) || placeStreet.includes(candidateStreet))) {
    score += 0.15;
    reasons.push('street_match');
  }

  const distance = distanceMeters(candidate.lat, candidate.lng, place.lat, place.lng);
  if (distance <= 50) {
    score += 0.2;
    reasons.push(`geo_50m:${Math.round(distance)}`);
  } else if (distance <= 150) {
    score += 0.1;
    reasons.push(`geo_150m:${Math.round(distance)}`);
  }

  if ((place.taxonomy_primary || place.category_primary || '').includes('indian')) {
    score += 0.05;
    reasons.push('category_indian');
  }

  return {
    place,
    confidence: Math.min(1, Number(score.toFixed(3))),
    reasons,
  };
}

function buildOvertureEnrichment(match: OvertureMatch): NonNullable<CandidateEnrichment['overture']> {
  const place = match.place;
  const updateTimes = (place.sources || [])
    .map((source) => source.update_time)
    .filter((value): value is string => Boolean(value))
    .sort();
  const sourceConfidences = (place.sources || [])
    .map((source) => source.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    matchConfidence: match.confidence,
    matchReasons: match.reasons,
    id: place.id,
    name: place.name,
    categoryPrimary: place.category_primary,
    basicCategory: place.basic_category,
    taxonomyPrimary: place.taxonomy_primary,
    taxonomyHierarchy: place.taxonomy_hierarchy,
    websites: place.websites,
    emails: place.emails,
    socials: place.socials,
    phones: place.phones,
    brand: place.brand,
    commonNames: place.commonNames,
    addresses: place.addresses,
    operatingStatus: place.operating_status,
    confidence: place.confidence,
    lat: place.lat,
    lng: place.lng,
    sources: place.sources,
    sourceSummary: {
      datasets: Array.from(new Set((place.sources || []).map((source) => source.dataset).filter((value): value is string => Boolean(value)))).sort(),
      licenses: Array.from(new Set((place.sources || []).map((source) => source.license).filter((value): value is string => Boolean(value)))).sort(),
      latestUpdateTime: updateTimes[updateTimes.length - 1],
      highestSourceConfidence: sourceConfidences.length ? Math.max(...sourceConfidences) : undefined,
      operatingStatusSignals: (place.sources || []).filter((source) => source.property === '/properties/operating_status').length,
    },
  };
}

export function loadOverturePlaces(filePath: string): OverturePlace[] {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as OverturePlace[];
}

export function enrichCandidatesWithOverture(
  candidates: StagedCandidate[],
  places: OverturePlace[],
  minimumConfidence = 0.65
): StagedCandidate[] {
  return candidates.map((candidate) => {
    const best = places
      .map((place) => scoreMatch(candidate, place))
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (!best || best.confidence < minimumConfidence) return candidate;

    const overture = buildOvertureEnrichment(best);
    const address = candidate.address || primaryAddress(best.place);
    const phone = candidate.phone || best.place.phones?.[0];
    const website = candidate.website || best.place.websites?.[0];
    const postalCode = candidate.postalCode || best.place.addresses?.[0]?.postcode;
    const stateAbbr = candidate.stateAbbr || best.place.addresses?.[0]?.region;
    const cityName = candidate.cityName || best.place.addresses?.[0]?.locality;
    const street = candidate.street || best.place.addresses?.[0]?.freeform;

    return {
      ...candidate,
      address,
      phone,
      website,
      postalCode,
      stateAbbr,
      cityName,
      street,
      categories: Array.from(new Set([
        ...candidate.categories,
        best.place.category_primary,
        best.place.taxonomy_primary,
      ].filter((value): value is string => Boolean(value)))),
      enrichment: {
        ...candidate.enrichment,
        overture,
      },
    };
  });
}
