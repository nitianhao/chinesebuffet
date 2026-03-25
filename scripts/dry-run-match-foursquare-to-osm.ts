import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { type OverpassElement, type OverpassResponse } from '../lib/overpass-api';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

type MatchClass = 'strong_match' | 'weak_match' | 'no_match';

type FoursquareBuffetRecord = {
  id: string;
  name?: string | null;
  address?: string | null;
  street?: string | null;
  cityName?: string | null;
  state?: string | null;
  stateAbbr?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  placeId?: string | null;
  slug?: string | null;
  categories?: string | null;
  categoryName?: string | null;
};

type OSMCandidate = {
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  osmName: string;
  distanceM: number;
  lat: number;
  lng: number;
  osmTagsRaw: Record<string, string>;
};

type ScoreBreakdown = {
  name: number;
  nameStrict: number;
  nameLoose: number;
  nameEdit: number;
  distance: number;
  streetNumber: number;
  streetName: number;
  postcode: number;
  address: number;
  phone: number;
  cuisine: number;
  ambiguityPenalty: number;
  penalties: number;
  totalBeforeClamp: number;
  notes: string[];
};

type ScoredCandidate = OSMCandidate & {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  nameSimilarityStrict: number;
  nameSimilarityLoose: number;
  sourceNameGenericity: 'low' | 'medium' | 'high';
  ambiguityPenaltyApplied: boolean;
  matchedOnName: boolean;
  matchedOnStreet: boolean;
  matchedOnHouseNumber: boolean;
  matchedOnPhone: boolean;
  matchedOnPostcode: boolean;
};

const DEFAULT_MAX_RECORDS = 10;
const DEFAULT_SEARCH_RADII = [100, 200, 350];
const OUTPUT_JSON = path.join(process.cwd(), 'data', 'foursquare-osm-match-dry-run.json');
const OUTPUT_CSV = path.join(process.cwd(), 'data', 'foursquare-osm-match-review.csv');
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const MIN_OVERPASS_REQUEST_GAP_MS = 1000;
let OVERPASS_TIMEOUT_S = 40;
let OVERPASS_MAX_ATTEMPTS = 12;
let INTER_RADIUS_SLEEP_MS = 350;

let lastOverpassRequestAt = 0;

const CORE_GENERIC_NAME_TOKENS = new Set([
  'restaurant',
  'buffet',
  'chinese',
  'china',
  'grill',
  'cuisine',
  'cafe',
  'express',
]);

const SOFT_GENERIC_NAME_TOKENS = new Set([
  ...Array.from(CORE_GENERIC_NAME_TOKENS),
  'rest',
  'the',
  'inc',
  'llc',
  'ltd',
  'co',
  'corp',
  'company',
  'kitchen',
  'eatery',
  'bar',
  'asian',
  'super',
  'new',
  'food',
]);

function singularizeToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es') && token.length > 4 && !token.endsWith('ses')) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function normalizeNameToken(token: string): string {
  const base = singularizeToken(token);
  if (base === 'buffett' || base === 'buffette' || base === 'buffet') return 'buffet';
  if (base === 'habachi' || base === 'hibachi') return 'hibachi';
  return base;
}

function normalizeName(value: string, mode: 'strict' | 'core' = 'strict'): string {
  const cleaned = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => normalizeNameToken(t));

  if (mode === 'strict') return tokens.join(' ');

  const filtered = tokens.filter((t) => !CORE_GENERIC_NAME_TOKENS.has(t));
  return (filtered.length ? filtered : tokens).join(' ');
}

function computeSourceNameGenericity(name: string): 'low' | 'medium' | 'high' {
  const strictTokens = tokenize(normalizeName(name, 'strict'));
  const coreTokens = tokenize(normalizeName(name, 'core'));
  const genericCount = strictTokens.filter((t) => SOFT_GENERIC_NAME_TOKENS.has(t)).length;
  const genericRatio = strictTokens.length ? genericCount / strictTokens.length : 1;

  if (coreTokens.length === 0) return 'high';
  if (coreTokens.length === 1) {
    const token = coreTokens[0];
    if (SOFT_GENERIC_NAME_TOKENS.has(token)) return 'high';
    if (genericRatio >= 0.8) return 'high';
    return 'medium';
  }
  if (coreTokens.length <= 2 || genericRatio >= 0.45) return 'medium';
  return 'low';
}

function normalizedEditSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;

  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  const distance = dp[n];
  return 1 - distance / Math.max(m, n);
}

function applyGenericityPenalty(
  sourceGenericity: 'low' | 'medium' | 'high',
  strictSim: number,
  looseSim: number,
  corroboratingSignals: number,
  distanceM: number
): number {
  if (sourceGenericity === 'low') return 0;
  if (sourceGenericity === 'medium') {
    if (corroboratingSignals >= 1) return 0;
    if (strictSim >= 0.96 && distanceM <= 20) return 0;
    return -6;
  }
  if (strictSim >= 0.985 && distanceM <= 15) return 0;
  if (corroboratingSignals >= 2) return 0;
  if (looseSim >= 0.85 && corroboratingSignals >= 1 && distanceM <= 25) return 0;
  return -14;
}

function buildWinningSignals(best: ScoredCandidate): string[] {
  const signals: string[] = [];
  if (best.nameSimilarityStrict >= 0.97) signals.push('exact_normalized_name_match');
  else if (best.nameSimilarityStrict >= 0.9) signals.push('near_exact_normalized_name_match');
  if (best.nameSimilarityLoose >= 0.75) signals.push('strong_core_token_overlap');
  if (best.distanceM <= 25) signals.push('very_close_distance');
  else if (best.distanceM <= 80) signals.push('close_distance');
  if (best.matchedOnHouseNumber) signals.push('street_number_match');
  if (best.matchedOnStreet) signals.push('street_name_match');
  if (best.matchedOnPostcode) signals.push('postcode_match');
  if (best.matchedOnPhone) signals.push('phone_match');
  if (best.scoreBreakdown.cuisine > 0) signals.push('cuisine_relevance');
  return signals;
}

function buildBestExplanation(best: ScoredCandidate | null): string {
  if (!best) return 'No OSM candidates found in 350m.';
  if (best.nameSimilarityStrict >= 0.97 && best.distanceM <= 30) {
    return 'Exact normalized name match and very close distance';
  }
  if (best.nameSimilarityLoose >= 0.75 && (best.matchedOnStreet || best.matchedOnHouseNumber || best.matchedOnPostcode)) {
    return 'Strong core-token overlap plus address agreement';
  }
  if (best.distanceM <= 60 && best.nameSimilarityStrict < 0.6) {
    return 'Rejected: close distance but weak name similarity';
  }
  if (best.sourceNameGenericity === 'high' && !best.matchedOnPhone && !best.matchedOnStreet && !best.matchedOnPostcode) {
    return 'Rejected: generic source name with insufficient corroborating evidence';
  }
  return 'Mixed signals; conservative review required';
}

function isWeakSingleSignal(best: ScoredCandidate): boolean {
  const weakName = best.nameSimilarityStrict < 0.75 && best.nameSimilarityLoose < 0.65;
  const distanceOnly =
    best.scoreBreakdown.distance > 0 &&
    best.scoreBreakdown.streetNumber === 0 &&
    best.scoreBreakdown.streetName === 0 &&
    best.scoreBreakdown.postcode === 0 &&
    best.scoreBreakdown.phone === 0 &&
    best.scoreBreakdown.cuisine === 0;
  return weakName && distanceOnly;
}

function normalizePhone(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function normalizeStreet(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(avenue|ave)\b/g, 'ave')
    .replace(/\b(road|rd)\b/g, 'rd')
    .replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(drive|dr)\b/g, 'dr')
    .replace(/\b(lane|ln)\b/g, 'ln')
    .replace(/\b(highway|hwy)\b/g, 'hwy')
    .replace(/\s+/g, ' ')
    .trim();
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function tokenize(value: string): string[] {
  return value
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function tokenJaccard(a: string, b: string): number {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (!aSet.size && !bSet.size) return 1;
  if (!aSet.size || !bSet.size) return 0;

  let inter = 0;
  for (const token of aSet) {
    if (bSet.has(token)) inter += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union ? inter / union : 0;
}

function diceCoefficient(a: string, b: string): number {
  const x = a.replace(/\s+/g, '');
  const y = b.replace(/\s+/g, '');
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;

  const xBigrams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i += 1) {
    const bg = x.slice(i, i + 2);
    xBigrams.set(bg, (xBigrams.get(bg) || 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < y.length - 1; i += 1) {
    const bg = y.slice(i, i + 2);
    const count = xBigrams.get(bg) || 0;
    if (count > 0) {
      overlap += 1;
      xBigrams.set(bg, count - 1);
    }
  }

  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

function extractHouseNumber(street?: string | null): string {
  const match = String(street || '').trim().match(/^([0-9]+[a-zA-Z0-9-]*)/);
  return match ? match[1].toLowerCase() : '';
}

function parseCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean);
  } catch {
    // noop
  }
  return [];
}

function parseElementLatLon(element: OverpassElement): { lat: number; lon: number } | null {
  const anyEl = element as any;
  const lat = element.lat ?? anyEl?.center?.lat ?? element.geometry?.[0]?.lat;
  const lon = element.lon ?? anyEl?.center?.lon ?? element.geometry?.[0]?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function isReasonableEarlyCandidate(score: number, scored: ScoredCandidate): boolean {
  if (score >= 65) return true;
  if (scored.matchedOnPhone && score >= 58) return true;
  if (scored.matchedOnName && scored.distanceM <= 80 && score >= 58) return true;
  return false;
}

async function queryNearbyFoodCandidates(lat: number, lng: number, radius: number): Promise<OSMCandidate[]> {
  const query = `
    (
      node["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](around:${radius},${lat},${lng});
      way["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](around:${radius},${lat},${lng});
      relation["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](around:${radius},${lat},${lng});

      node["shop"~"^(deli|bakery|confectionery|pastry|greengrocer|butcher|seafood|cheese|convenience|supermarket)$"](around:${radius},${lat},${lng});
      way["shop"~"^(deli|bakery|confectionery|pastry|greengrocer|butcher|seafood|cheese|convenience|supermarket)$"](around:${radius},${lat},${lng});
      relation["shop"~"^(deli|bakery|confectionery|pastry|greengrocer|butcher|seafood|cheese|convenience|supermarket)$"](around:${radius},${lat},${lng});
    );
    out center tags;
  `;

  const response = await queryOverpassWithRetry(query, OVERPASS_TIMEOUT_S);
  const candidates: OSMCandidate[] = [];

  for (const element of response.elements) {
    const coords = parseElementLatLon(element);
    if (!coords) continue;
    const tags = element.tags || {};
    const name =
      tags.name ||
      tags.official_name ||
      tags.alt_name ||
      tags.old_name ||
      '';

    candidates.push({
      osmType: element.type,
      osmId: element.id,
      osmName: name,
      distanceM: distanceMeters(lat, lng, coords.lat, coords.lon),
      lat: coords.lat,
      lng: coords.lon,
      osmTagsRaw: {
        name: tags.name || '',
        official_name: tags.official_name || '',
        alt_name: tags.alt_name || '',
        old_name: tags.old_name || '',
        amenity: tags.amenity || '',
        shop: tags.shop || '',
        cuisine: tags.cuisine || '',
        'addr:housenumber': tags['addr:housenumber'] || '',
        'addr:street': tags['addr:street'] || '',
        'addr:postcode': tags['addr:postcode'] || '',
        phone: tags.phone || '',
        'contact:phone': tags['contact:phone'] || '',
        website: tags.website || '',
        opening_hours: tags.opening_hours || '',
        takeaway: tags.takeaway || '',
        delivery: tags.delivery || '',
        wheelchair: tags.wheelchair || '',
      },
    });
  }

  return candidates;
}

async function queryOverpassRaw(
  query: string,
  endpoint: string,
  timeout = 40
): Promise<OverpassResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `[out:json][timeout:${timeout}];${query}`,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText} :: ${bodyText.slice(0, 160)}`);
  }
  const trimmed = bodyText.trim();
  if (!trimmed.startsWith('{')) {
    throw new Error(`Overpass non-JSON response: ${trimmed.slice(0, 160)}`);
  }
  return JSON.parse(trimmed) as OverpassResponse;
}

async function queryOverpassWithRetry(query: string, timeout = 40): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= OVERPASS_MAX_ATTEMPTS; attempt += 1) {
    const endpoint = OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length];
    try {
      const now = Date.now();
      const waitMs = Math.max(0, MIN_OVERPASS_REQUEST_GAP_MS - (now - lastOverpassRequestAt));
      if (waitMs > 0) await sleep(waitMs);
      lastOverpassRequestAt = Date.now();
      return await queryOverpassRaw(query, endpoint, timeout);
    } catch (error) {
      lastError = error;
      const msg = String((error as Error)?.message || error || '').toLowerCase();
      const retriable =
        msg.includes('429') ||
        msg.includes('too many requests') ||
        msg.includes('non-json response') ||
        msg.includes('fetch failed') ||
        msg.includes('connect timeout') ||
        msg.includes('und_err_connect_timeout') ||
        msg.includes('econnreset') ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('503') ||
        msg.includes('502');

      if (!retriable || attempt === OVERPASS_MAX_ATTEMPTS) break;
      const backoffMs = Math.min(12000, 700 * 2 ** (attempt - 1));
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Overpass query failed'));
}

function scoreCandidate(source: FoursquareBuffetRecord, candidate: OSMCandidate): ScoredCandidate {
  const notes: string[] = [];
  const sourceNameStrict = normalizeName(source.name || '', 'strict');
  const sourceNameCore = normalizeName(source.name || '', 'core');
  const sourceGenericity = computeSourceNameGenericity(source.name || '');

  const osmCombinedName = [
    candidate.osmTagsRaw.name,
    candidate.osmTagsRaw.official_name,
    candidate.osmTagsRaw.alt_name,
  ]
    .filter(Boolean)
    .join(' ');

  const osmNameStrict = normalizeName(osmCombinedName, 'strict');
  const osmNameCore = normalizeName(osmCombinedName, 'core');

  const strictDice = diceCoefficient(sourceNameStrict, osmNameStrict);
  const looseDice = diceCoefficient(sourceNameCore, osmNameCore);
  const strictEdit = normalizedEditSimilarity(sourceNameStrict, osmNameStrict);
  const strictJaccard = tokenJaccard(sourceNameStrict, osmNameStrict);
  const looseJaccard = tokenJaccard(sourceNameCore, osmNameCore);

  const nameSimilarityStrict = Math.max(strictDice, strictEdit, strictJaccard);
  const nameSimilarityLoose = Math.max(looseDice, looseJaccard);

  let nameStrictScore = nameSimilarityStrict * 26;
  if (sourceNameStrict && sourceNameStrict === osmNameStrict) {
    nameStrictScore += 24;
    notes.push('signal:exact_strict_name');
  } else if (nameSimilarityStrict >= 0.93) {
    nameStrictScore += 14;
    notes.push('signal:near_exact_strict_name');
  }

  let nameLooseScore = nameSimilarityLoose * 24;
  if (nameSimilarityLoose >= 0.8) notes.push('signal:strong_core_token_overlap');
  const nameEditScore = strictEdit * 10;

  let penalties = 0;
  if (sourceNameCore && osmNameCore) {
    const srcCoreSet = new Set(tokenize(sourceNameCore));
    const osmCoreSet = new Set(tokenize(osmNameCore));
    let sharedCore = 0;
    for (const token of srcCoreSet) {
      if (osmCoreSet.has(token)) sharedCore += 1;
    }
    if (srcCoreSet.size > 0 && osmCoreSet.size > 0 && sharedCore === 0) {
      penalties -= 22;
      notes.push('penalty:no_shared_core_tokens');
    }
  }

  let nameScore = Math.min(68, Math.max(0, nameStrictScore + nameLooseScore + nameEditScore));

  let distanceScore = 0;
  if (candidate.distanceM <= 30) distanceScore = 18;
  else if (candidate.distanceM <= 60) distanceScore = 15;
  else if (candidate.distanceM <= 100) distanceScore = 12;
  else if (candidate.distanceM <= 150) distanceScore = 8;
  else if (candidate.distanceM <= 200) distanceScore = 5;
  else if (candidate.distanceM <= 350) distanceScore = 2;

  const sourceStreetNorm = normalizeStreet(source.street);
  const osmStreetNorm = normalizeStreet(candidate.osmTagsRaw['addr:street']);
  const sourceHouse = extractHouseNumber(source.street);
  const osmHouse = extractHouseNumber(candidate.osmTagsRaw['addr:housenumber']);
  const sourcePostcode = String(source.postalCode || '').trim();
  const osmPostcode = String(candidate.osmTagsRaw['addr:postcode'] || '').trim();

  let streetNumberScore = 0;
  let streetNameScore = 0;
  let postcodeScore = 0;
  let matchedOnStreet = false;
  let matchedOnHouseNumber = false;
  let matchedOnPostcode = false;

  if (sourceStreetNorm && osmStreetNorm) {
    const streetDice = diceCoefficient(sourceStreetNorm, osmStreetNorm);
    if (sourceStreetNorm === osmStreetNorm) {
      streetNameScore += 6;
      matchedOnStreet = true;
      notes.push('signal:street_exact_match');
    } else if (streetDice >= 0.82) {
      streetNameScore += 4;
      matchedOnStreet = true;
      notes.push('signal:street_near_match');
    }
  }

  if (sourceHouse && osmHouse && sourceHouse === osmHouse) {
    streetNumberScore += 6;
    matchedOnHouseNumber = true;
    notes.push('signal:housenumber_match');
  }

  if (sourcePostcode && osmPostcode && sourcePostcode === osmPostcode) {
    postcodeScore += 2;
    matchedOnPostcode = true;
    notes.push('signal:postcode_match');
  }
  const addressScore = Math.min(14, streetNumberScore + streetNameScore + postcodeScore);

  const sourcePhone = normalizePhone(source.phone);
  const osmPhone = normalizePhone(candidate.osmTagsRaw.phone || candidate.osmTagsRaw['contact:phone']);
  let phoneScore = 0;
  const matchedOnPhone = Boolean(sourcePhone && osmPhone && sourcePhone === osmPhone);
  if (matchedOnPhone) {
    phoneScore = 22;
    notes.push('signal:phone_exact_match');
  }

  const sourceHint = `${source.name || ''} ${(source.categoryName || '')} ${parseCategories(source.categories).join(' ')}`.toLowerCase();
  const sourceChinese = /\bchinese|asian|szechuan|sichuan|cantonese\b/.test(sourceHint);
  const sourceBuffet = /\bbuffet|all you can eat|ayce\b/.test(sourceHint);
  const cuisineRaw = (candidate.osmTagsRaw.cuisine || '').toLowerCase();
  let cuisineScore = 0;
  if (sourceChinese && /\bchinese\b/.test(cuisineRaw)) {
    cuisineScore += 3;
    notes.push('signal:cuisine_chinese');
  }
  if (sourceBuffet && candidate.osmTagsRaw.amenity === 'restaurant') {
    cuisineScore += 1;
  }
  cuisineScore = Math.min(4, cuisineScore);

  const corroboratingSignals = [
    streetNumberScore > 0,
    streetNameScore > 0,
    postcodeScore > 0,
    matchedOnPhone,
  ].filter(Boolean).length;
  const ambiguityPenalty = applyGenericityPenalty(
    sourceGenericity,
    nameSimilarityStrict,
    nameSimilarityLoose,
    corroboratingSignals,
    candidate.distanceM
  );
  if (ambiguityPenalty < 0) notes.push('penalty:generic_name_ambiguity');

  if (sourceGenericity === 'high' && nameSimilarityStrict < 0.92 && corroboratingSignals === 0) {
    nameScore = Math.min(nameScore, 42);
    notes.push('guard:generic_name_cap_without_corroboration');
  }

  const totalBeforeClamp =
    nameScore +
    distanceScore +
    addressScore +
    phoneScore +
    cuisineScore +
    ambiguityPenalty +
    penalties;
  const score = Math.max(0, Math.min(100, totalBeforeClamp));
  const matchedOnName = nameSimilarityStrict >= 0.88 || nameSimilarityLoose >= 0.75;
  const ambiguityPenaltyApplied = ambiguityPenalty < 0;

  return {
    ...candidate,
    score,
    nameSimilarityStrict: Number(nameSimilarityStrict.toFixed(4)),
    nameSimilarityLoose: Number(nameSimilarityLoose.toFixed(4)),
    sourceNameGenericity: sourceGenericity,
    ambiguityPenaltyApplied,
    scoreBreakdown: {
      name: Number(nameScore.toFixed(2)),
      nameStrict: Number(nameStrictScore.toFixed(2)),
      nameLoose: Number(nameLooseScore.toFixed(2)),
      nameEdit: Number(nameEditScore.toFixed(2)),
      distance: Number(distanceScore.toFixed(2)),
      streetNumber: Number(streetNumberScore.toFixed(2)),
      streetName: Number(streetNameScore.toFixed(2)),
      postcode: Number(postcodeScore.toFixed(2)),
      address: Number(addressScore.toFixed(2)),
      phone: Number(phoneScore.toFixed(2)),
      cuisine: Number(cuisineScore.toFixed(2)),
      ambiguityPenalty: Number(ambiguityPenalty.toFixed(2)),
      penalties: Number(penalties.toFixed(2)),
      totalBeforeClamp: Number(totalBeforeClamp.toFixed(2)),
      notes,
    },
    matchedOnName,
    matchedOnStreet,
    matchedOnHouseNumber,
    matchedOnPhone,
    matchedOnPostcode,
  };
}

function classifyMatch(topCandidates: ScoredCandidate[]): {
  finalClass: MatchClass;
  explanation: string;
  winningSignals: string[];
  rejectionReasons: string[];
  topCandidateGap: number;
} {
  if (!topCandidates.length) {
    return {
      finalClass: 'no_match',
      explanation: 'No OSM candidates found in 350m.',
      winningSignals: [],
      rejectionReasons: ['no_candidates_in_search_radius'],
      topCandidateGap: 0,
    };
  }

  const best = topCandidates[0];
  const second = topCandidates[1];
  const gap = second ? best.score - second.score : 100;
  const winningSignals = buildWinningSignals(best);
  const rejectionReasons: string[] = [];

  const closeEnough = best.distanceM <= 80;
  const veryClose = best.distanceM <= 40;
  const extremelyClose = best.distanceM <= 20;
  const strongName = best.nameSimilarityStrict >= 0.9 || best.nameSimilarityLoose >= 0.78;
  const veryStrongName = best.nameSimilarityStrict >= 0.96;
  const hasAddressSignal = best.matchedOnHouseNumber || best.matchedOnStreet || best.matchedOnPostcode;
  const distanceOnly =
    best.scoreBreakdown.distance > 0 &&
    best.nameSimilarityStrict < 0.65 &&
    best.nameSimilarityLoose < 0.6 &&
    !best.matchedOnPhone &&
    !hasAddressSignal;

  if (distanceOnly) {
    rejectionReasons.push('distance_only_not_enough');
    return {
      finalClass: 'no_match',
      explanation: 'Rejected: close distance but weak name similarity',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (best.sourceNameGenericity === 'high' && !best.matchedOnPhone && !hasAddressSignal && !extremelyClose) {
    rejectionReasons.push('generic_name_without_corroborating_evidence');
    return {
      finalClass: 'no_match',
      explanation: 'Rejected: generic source name with insufficient corroborating evidence',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (isWeakSingleSignal(best)) {
    rejectionReasons.push('best_relies_on_single_weak_signal');
    return {
      finalClass: 'no_match',
      explanation: 'Rejected: best candidate relies on one weak signal',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (second && gap < 8 && best.score >= 52 && second.score >= 50) {
    rejectionReasons.push('ambiguous_top_candidates_close_scores');
    return {
      finalClass: 'weak_match',
      explanation: 'Multiple plausible nearby candidates with close scores.',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (best.matchedOnPhone && best.score >= 72 && strongName && gap >= 8) {
    return {
      finalClass: 'strong_match',
      explanation: 'Strong name match with exact phone confirmation.',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (veryStrongName && veryClose && best.score >= 72 && gap >= 10) {
    return {
      finalClass: 'strong_match',
      explanation: 'Exact normalized name match and very close distance',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (strongName && closeEnough && hasAddressSignal && best.score >= 74 && gap >= 10) {
    return {
      finalClass: 'strong_match',
      explanation: 'Strong core-token overlap plus address agreement',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (best.sourceNameGenericity === 'high' && strongName && extremelyClose && best.score >= 70 && gap >= 9) {
    return {
      finalClass: 'strong_match',
      explanation: 'Near-exact generic name at extremely close distance with clear lead',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  if (best.score >= 48) {
    rejectionReasons.push('insufficient_multi_signal_evidence');
    return {
      finalClass: 'weak_match',
      explanation: 'Some matching evidence exists, but not enough for high confidence.',
      winningSignals,
      rejectionReasons,
      topCandidateGap: Number(gap.toFixed(2)),
    };
  }

  rejectionReasons.push('low_score_weak_name_or_supporting_signals');
  return {
    finalClass: 'no_match',
    explanation: buildBestExplanation(best),
    winningSignals,
    rejectionReasons,
    topCandidateGap: Number(gap.toFixed(2)),
  };
}

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const raw = args.find((a) => a.startsWith(prefix));
  if (!raw) return null;
  return raw.slice(prefix.length).trim();
}

async function loadFoursquareRecordsFromDb(limit = DEFAULT_MAX_RECORDS, sourceOffset = 0): Promise<FoursquareBuffetRecord[]> {
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required in environment.');
  }

  const db = init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });

  const matched: FoursquareBuffetRecord[] = [];
  const batchSize = 500;
  let offset = Math.max(0, sourceOffset);

  while (matched.length < limit) {
    let result: any = null;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        result = await db.query({
          buffets: {
            $: { limit: batchSize, offset },
          },
        });
        lastErr = null;
        break;
      } catch (error) {
        lastErr = error;
        const backoff = Math.min(8000, 400 * 2 ** (attempt - 1));
        await sleep(backoff);
      }
    }
    if (lastErr) {
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || 'DB query failed'));
    }
    const rows = (result?.buffets || []) as FoursquareBuffetRecord[];
    if (!rows.length) break;

    for (const row of rows) {
      if (!row) continue;
      const placeId = String(row.placeId || '');
      if (!placeId.startsWith('fsq:')) continue;
      if (!row.lat || !row.lng || !row.name) continue;
      matched.push(row);
      if (matched.length >= limit) break;
    }

    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  return matched.slice(0, limit);
}

function shortExplain(best: ScoredCandidate | null, explanation: string, winningSignals: string[]): string {
  if (!best) return explanation;
  return `${explanation}. Signals: ${winningSignals.join(', ') || 'none'}.`;
}

function toCsvValue(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = getArgValue(args, '--limit');
  const offsetArg = getArgValue(args, '--offset');
  const radiiArg = getArgValue(args, '--radii');
  const overpassTimeoutArg = getArgValue(args, '--overpass-timeout');
  const overpassAttemptsArg = getArgValue(args, '--overpass-attempts');
  const interRadiusSleepArg = getArgValue(args, '--inter-radius-sleep-ms');
  const requestedLimit = limitArg ? Math.max(1, Number(limitArg) || DEFAULT_MAX_RECORDS) : DEFAULT_MAX_RECORDS;
  const requestedOffset = offsetArg ? Math.max(0, Number(offsetArg) || 0) : 0;
  OVERPASS_TIMEOUT_S = overpassTimeoutArg ? Math.max(8, Number(overpassTimeoutArg) || OVERPASS_TIMEOUT_S) : OVERPASS_TIMEOUT_S;
  OVERPASS_MAX_ATTEMPTS = overpassAttemptsArg
    ? Math.max(1, Math.min(12, Number(overpassAttemptsArg) || OVERPASS_MAX_ATTEMPTS))
    : OVERPASS_MAX_ATTEMPTS;
  INTER_RADIUS_SLEEP_MS = interRadiusSleepArg
    ? Math.max(0, Number(interRadiusSleepArg) || INTER_RADIUS_SLEEP_MS)
    : INTER_RADIUS_SLEEP_MS;
  const searchRadii = (radiiArg
    ? radiiArg
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x) && x > 0 && x <= 1000)
    : DEFAULT_SEARCH_RADII
  ).slice(0, 5);
  const effectiveRadii = searchRadii.length ? searchRadii : DEFAULT_SEARCH_RADII;

  console.log('Dry-run OSM matching from InstantDB Foursquare records...');
  console.log('Mode: DRY RUN ONLY (no DB writes)\n');
  console.log(
    `Query params: limit=${requestedLimit}, offset=${requestedOffset}, radii=${effectiveRadii.join('/')}, ` +
      `overpassTimeout=${OVERPASS_TIMEOUT_S}s, overpassAttempts=${OVERPASS_MAX_ATTEMPTS}\n`
  );

  const sourceRecords = await loadFoursquareRecordsFromDb(requestedLimit, requestedOffset);
  if (!sourceRecords.length) {
    console.log('No Foursquare-imported records found (expected placeId prefix "fsq:").');
    return;
  }

  console.log(`Loaded ${sourceRecords.length} Foursquare-imported records from DB.\n`);

  const allResults: Array<{
    source: Record<string, unknown>;
    searchedRadii: number[];
    totalCandidatesSeen: number;
    finalClass: MatchClass;
    finalScore: number;
    sourceNameGenericity: 'low' | 'medium' | 'high';
    nameSimilarityStrict: number;
    nameSimilarityLoose: number;
    ambiguityPenaltyApplied: boolean;
    topCandidateGap: number;
    winningSignals: string[];
    rejectionReasons: string[];
    shortExplanation: string;
    whyBestCandidateWon: string;
    bestCandidate: ScoredCandidate | null;
    topCandidates: ScoredCandidate[];
  }> = [];

  for (let i = 0; i < sourceRecords.length; i += 1) {
    const source = sourceRecords[i];
    const sourceName = source.name || `record-${i + 1}`;
    const lat = Number(source.lat);
    const lng = Number(source.lng);
    console.log(`[${i + 1}/${sourceRecords.length}] ${sourceName}`);

    const candidateMap = new Map<string, OSMCandidate>();
    const searchedRadii: number[] = [];

    for (const radius of effectiveRadii) {
      searchedRadii.push(radius);
      const candidates = await queryNearbyFoodCandidates(lat, lng, radius);
      for (const c of candidates) {
        const key = `${c.osmType}:${c.osmId}`;
        if (!candidateMap.has(key)) candidateMap.set(key, c);
      }

      const scoredNow = Array.from(candidateMap.values())
        .map((c) => scoreCandidate(source, c))
        .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);

      if (scoredNow.length > 0 && isReasonableEarlyCandidate(scoredNow[0].score, scoredNow[0])) {
        break;
      }
      await sleep(INTER_RADIUS_SLEEP_MS);
    }

    const scoredCandidates = Array.from(candidateMap.values())
      .map((c) => scoreCandidate(source, c))
      .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);

    const top3 = scoredCandidates.slice(0, 3);
    const best = top3[0] || null;
    const classification = classifyMatch(top3);
    const sourceNameGenericity = computeSourceNameGenericity(source.name || '');
    const whyBestWon = best
      ? `Top score ${best.score.toFixed(2)} from name=${best.scoreBreakdown.name.toFixed(
          2
        )}, distance=${best.scoreBreakdown.distance.toFixed(2)}, address=${best.scoreBreakdown.address.toFixed(
          2
        )}, phone=${best.scoreBreakdown.phone.toFixed(2)}, strictSim=${best.nameSimilarityStrict.toFixed(
          3
        )}, looseSim=${best.nameSimilarityLoose.toFixed(3)}.`
      : 'No candidate qualified.';

    allResults.push({
      source: {
        id: source.id,
        name: source.name || '',
        address: source.address || '',
        street: source.street || '',
        cityName: source.cityName || '',
        state: source.state || '',
        stateAbbr: source.stateAbbr || '',
        postalCode: source.postalCode || '',
        lat,
        lng,
        phone: source.phone || '',
        placeId: source.placeId || '',
        slug: source.slug || '',
        categories: parseCategories(source.categories),
        categoryName: source.categoryName || '',
      },
      searchedRadii,
      totalCandidatesSeen: candidateMap.size,
      finalClass: classification.finalClass,
      finalScore: best ? Number(best.score.toFixed(2)) : 0,
      sourceNameGenericity: best?.sourceNameGenericity || sourceNameGenericity,
      nameSimilarityStrict: best?.nameSimilarityStrict || 0,
      nameSimilarityLoose: best?.nameSimilarityLoose || 0,
      ambiguityPenaltyApplied: Boolean(best?.ambiguityPenaltyApplied),
      topCandidateGap: classification.topCandidateGap,
      winningSignals: classification.winningSignals,
      rejectionReasons: classification.rejectionReasons,
      shortExplanation: shortExplain(best, classification.explanation, classification.winningSignals),
      whyBestCandidateWon: whyBestWon,
      bestCandidate: best,
      topCandidates: top3,
    });
  }

  const jsonOutput = {
    generatedAt: new Date().toISOString(),
    mode: 'dry_run',
    source: 'instantdb',
    input: {
      query: 'buffets filtered in-script by placeId prefix "fsq:"',
      requestedLimit,
      requestedOffset,
      searchRadii: effectiveRadii,
      actualCount: allResults.length,
    },
    totals: {
      strong_match: allResults.filter((r) => r.finalClass === 'strong_match').length,
      weak_match: allResults.filter((r) => r.finalClass === 'weak_match').length,
      no_match: allResults.filter((r) => r.finalClass === 'no_match').length,
    },
    records: allResults,
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(jsonOutput, null, 2), 'utf8');

  const csvHeader = [
    'sourceId',
    'sourceName',
    'city',
    'state',
    'finalClass',
    'finalScore',
    'bestOsmType',
    'bestOsmId',
    'bestOsmName',
    'distanceM',
    'sourceNameGenericity',
    'nameSimilarityStrict',
    'nameSimilarityLoose',
    'ambiguityPenaltyApplied',
    'topCandidateGap',
    'winningSignals',
    'rejectionReasons',
    'matchedOnName',
    'matchedOnStreet',
    'matchedOnHouseNumber',
    'matchedOnPhone',
    'matchedOnPostcode',
    'shortExplanation',
    'whyBestCandidateWon',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const row of allResults) {
    const best = row.bestCandidate;
    csvLines.push(
      [
        row.source.id,
        row.source.name,
        row.source.cityName,
        row.source.stateAbbr || row.source.state,
        row.finalClass,
        row.finalScore,
        best?.osmType || '',
        best?.osmId || '',
        best?.osmName || '',
        best ? Math.round(best.distanceM) : '',
        row.sourceNameGenericity,
        row.nameSimilarityStrict,
        row.nameSimilarityLoose,
        row.ambiguityPenaltyApplied,
        row.topCandidateGap,
        row.winningSignals.join('|'),
        row.rejectionReasons.join('|'),
        best?.matchedOnName || false,
        best?.matchedOnStreet || false,
        best?.matchedOnHouseNumber || false,
        best?.matchedOnPhone || false,
        best?.matchedOnPostcode || false,
        row.shortExplanation,
        row.whyBestCandidateWon,
      ]
        .map(toCsvValue)
        .join(',')
    );
  }
  fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n'), 'utf8');

  console.log('\nSummary:');
  const header = [
    'Source Name'.padEnd(30),
    'Best OSM Name'.padEnd(30),
    'Dist(m)'.padEnd(8),
    'Class'.padEnd(12),
    'Score'.padEnd(8),
    'Explanation',
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(Math.min(header.length + 20, 170)));
  for (const row of allResults) {
    const best = row.bestCandidate;
    console.log(
      [
        String(row.source.name || '').slice(0, 30).padEnd(30),
        String(best?.osmName || '(none)').slice(0, 30).padEnd(30),
        String(best ? Math.round(best.distanceM) : '-').padEnd(8),
        row.finalClass.padEnd(12),
        String(row.finalScore.toFixed(2)).padEnd(8),
        row.shortExplanation,
      ].join(' | ')
    );
  }

  for (const row of allResults) {
    console.log(`\nRecord: ${row.source.name} (${row.source.id})`);
    console.log(`  Final: ${row.finalClass} (${row.finalScore})`);
    console.log(`  Why best won: ${row.whyBestCandidateWon}`);
    console.log(`  Genericity: ${row.sourceNameGenericity}, strictSim=${row.nameSimilarityStrict.toFixed(3)}, looseSim=${row.nameSimilarityLoose.toFixed(3)}, gap=${row.topCandidateGap.toFixed(2)}`);
    if (row.winningSignals.length) {
      console.log(`  Winning signals: ${row.winningSignals.join(', ')}`);
    }
    if (row.rejectionReasons.length) {
      console.log(`  Rejection reasons: ${row.rejectionReasons.join(', ')}`);
    }
    if (!row.topCandidates.length) {
      console.log('  Top candidates: none');
      continue;
    }
    console.log('  Top 3 candidates:');
    row.topCandidates.forEach((c, idx) => {
      console.log(
        `    ${idx + 1}. ${c.osmType}/${c.osmId} "${c.osmName || '(unnamed)'}" ` +
          `d=${Math.round(c.distanceM)}m score=${c.score.toFixed(2)} ` +
          `name=${c.scoreBreakdown.name.toFixed(2)} addr=${c.scoreBreakdown.address.toFixed(
            2
          )} phone=${c.scoreBreakdown.phone.toFixed(2)}`
      );
    });
  }

  console.log('\nCreated files:');
  console.log(`  - ${OUTPUT_JSON}`);
  console.log(`  - ${OUTPUT_CSV}`);
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
