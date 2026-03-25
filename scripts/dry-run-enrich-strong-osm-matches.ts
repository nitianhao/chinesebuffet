import fs from 'fs';
import path from 'path';

type MatchClass = 'strong_match' | 'weak_match' | 'no_match';

type MatchRecord = {
  source: {
    id: string;
    name?: string;
    slug?: string;
    stateAbbr?: string;
    state?: string;
    [key: string]: unknown;
  };
  finalClass: MatchClass;
  finalScore: number;
  bestCandidate?: {
    osmType?: 'node' | 'way' | 'relation';
    osmId?: number;
    osmName?: string;
    distanceM?: number;
    osmTagsRaw?: Record<string, string>;
  } | null;
};

type PatchRow = {
  sourceId: string;
  sourceName: string;
  sourceSlug: string | null;
  matchClass: MatchClass;
  enrichmentPatch: {
    website: string | null;
    phone: string | null;
    rawOpeningHours: string | null;
    hasHours: boolean;
    timezone: string | null;
    cuisineType: string | null;
    operator: string | null;
    brand: string | null;
    wheelchairAccessible: boolean | null;
    takeout: boolean | null;
    delivery: boolean | null;
    dineIn: boolean | null;
    reservations: boolean | null;
    outdoorSeating: boolean | null;
    wifi: boolean | null;
    alcohol: boolean | null;
    kidsFriendly: boolean | null;
    parking: boolean | null;
    osmType: string | null;
    osmId: number | null;
    osmName: string | null;
    osmMatchScore: number | null;
    osmDistanceM: number | null;
    osmSourceObject: {
      type: string | null;
      id: number | null;
      name: string | null;
      matchScore: number | null;
      distanceM: number | null;
    };
    facetIndexPatch: {
      amenities: {
        wheelchair_accessible: boolean | null;
        reservations: boolean | null;
        takeout: boolean | null;
        delivery: boolean | null;
        wifi: boolean | null;
        alcohol: boolean | null;
        outdoor_seating: boolean | null;
        parking: boolean | null;
      };
      dineOptions: {
        dine_in: boolean | null;
        takeout: boolean | null;
        delivery: boolean | null;
      };
      standoutTags: string[];
    };
    enrichmentSources: string[];
    osmTagsRaw: Record<string, string>;
    enrichmentNotes: string[];
  };
};

const INPUT_PATH = path.join(process.cwd(), 'data', 'foursquare-osm-match-dry-run.json');
const OUTPUT_JSON = path.join(process.cwd(), 'data', 'osm-strong-match-enrichment-dry-run.json');
const OUTPUT_CSV = path.join(process.cwd(), 'data', 'osm-strong-match-enrichment-review.csv');

// High-confidence only (single-timezone US states)
const SINGLE_TZ_BY_STATE: Record<string, string> = {
  AL: 'America/Chicago',
  AR: 'America/Chicago',
  AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DC: 'America/New_York',
  DE: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  IA: 'America/Chicago',
  IL: 'America/Chicago',
  LA: 'America/Chicago',
  MA: 'America/New_York',
  MD: 'America/New_York',
  ME: 'America/New_York',
  MN: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NC: 'America/New_York',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NV: 'America/Los_Angeles',
  NY: 'America/New_York',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  UT: 'America/Denver',
  VA: 'America/New_York',
  VT: 'America/New_York',
  WA: 'America/Los_Angeles',
  WI: 'America/Chicago',
  WV: 'America/New_York',
  WY: 'America/Denver',
};

function toCsvValue(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cleanWebsite(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizePhone(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function parseYesNoUnknown(raw: string): boolean | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (['yes', 'true', '1', 'permissive', 'designated'].includes(value)) return true;
  if (['no', 'false', '0', 'private', 'customers'].includes(value)) return false;
  return null;
}

function normalizeCuisine(cuisineRaw: string): { normalized: string | null; raw: string | null } {
  const raw = String(cuisineRaw || '').trim().toLowerCase();
  if (!raw) return { normalized: null, raw: null };

  const parts = raw
    .split(/[;,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const hasChinese = parts.includes('chinese');
  const hasBuffet = parts.includes('buffet');
  if (hasChinese && hasBuffet) return { normalized: 'chinese_buffet', raw };
  if (hasChinese) return { normalized: 'chinese', raw };
  if (hasBuffet) return { normalized: 'buffet', raw };
  if (parts.length === 1 && /^[a-z_ -]+$/.test(parts[0])) return { normalized: parts[0].replace(/\s+/g, '_'), raw };
  return { normalized: null, raw };
}

function inferDineIn(tags: Record<string, string>): boolean | null {
  const amenity = String(tags.amenity || '').toLowerCase();
  const takeawayRaw = String(tags.takeaway || '').toLowerCase();
  const takeaway = parseYesNoUnknown(takeawayRaw);
  const delivery = parseYesNoUnknown(tags.delivery || '');
  if (takeawayRaw === 'only') return false;
  if (['restaurant', 'cafe', 'food_court'].includes(amenity)) return true;
  if (amenity === 'fast_food' && takeaway === true && delivery !== false) return null;
  if (amenity === 'fast_food' && takeaway === false) return true;
  return null;
}

function deriveTimezone(stateAbbr: string | null | undefined): string | null {
  const key = String(stateAbbr || '').toUpperCase().trim();
  if (!key) return null;
  return SINGLE_TZ_BY_STATE[key] || null;
}

function countAmenitySignals(patch: PatchRow['enrichmentPatch']): number {
  const values = [
    patch.takeout,
    patch.delivery,
    patch.dineIn,
    patch.reservations,
    patch.outdoorSeating,
    patch.wifi,
    patch.alcohol,
    patch.parking,
    patch.wheelchairAccessible,
  ];
  return values.filter((x) => x !== null).length;
}

function buildPatch(row: MatchRecord): PatchRow | null {
  if (row.finalClass !== 'strong_match') return null;
  if (!row.bestCandidate) return null;
  const tags = row.bestCandidate.osmTagsRaw || {};

  const website = cleanWebsite(tags.website || tags['contact:website'] || '');

  const contactPhoneRaw = String(tags['contact:phone'] || '').trim();
  const phoneRaw = String(tags.phone || '').trim();
  const chosenRawPhone = contactPhoneRaw.length >= phoneRaw.length ? contactPhoneRaw : phoneRaw;
  const phone = normalizePhone(chosenRawPhone);

  const rawOpeningHours = String(tags.opening_hours || '').trim() || null;
  const hasHours = Boolean(rawOpeningHours);

  const cuisine = normalizeCuisine(tags.cuisine || '');
  const wheelchairAccessible = parseYesNoUnknown(tags.wheelchair || '');

  const takeoutRaw = String(tags.takeaway || '').trim().toLowerCase();
  const takeout = takeoutRaw === 'only' ? true : parseYesNoUnknown(takeoutRaw);
  const delivery = parseYesNoUnknown(tags.delivery || '');
  const dineIn = inferDineIn(tags);
  const reservations = parseYesNoUnknown(tags.reservation || tags['reservation:yes'] || tags['contact:reservation'] || '');
  const outdoorSeating = parseYesNoUnknown(tags.outdoor_seating || '');

  const wifi = parseYesNoUnknown(tags.wifi || tags.internet_access || '');
  const alcohol = parseYesNoUnknown(tags.alcohol || '');
  const kidsFriendly = parseYesNoUnknown(tags.children || tags.kids_area || tags.family_friendly || '');

  let parking: boolean | null = parseYesNoUnknown(tags.parking || '');
  if (parking === null) {
    const parkingDerived = [
      parseYesNoUnknown(tags['parking:lane'] || ''),
      parseYesNoUnknown(tags['parking:street_side'] || ''),
      parseYesNoUnknown(tags['parking:condition'] || ''),
    ].find((x) => x !== null);
    parking = parkingDerived ?? null;
  }

  const notes: string[] = [];
  const sources: string[] = [
    'osm',
    'overpass',
    `osm:${row.bestCandidate.osmType || 'unknown'}/${row.bestCandidate.osmId || 'unknown'}`,
    'dry_run_patch_only',
  ];
  if (!website) notes.push('website_missing_in_osm_tags');
  if (!phone) notes.push('phone_missing_in_osm_tags');
  if (!hasHours) notes.push('opening_hours_missing_in_osm_tags');
  if (!cuisine.normalized) notes.push('cuisine_unclear_or_missing');
  if (cuisine.raw && !cuisine.normalized) notes.push(`raw_cuisine_preserved:${cuisine.raw}`);
  if (!deriveTimezone(row.source.stateAbbr || row.source.state || null)) {
    notes.push('timezone_not_set_unambiguous_lookup_unavailable');
  }
  if (chosenRawPhone && phone) notes.push(`raw_phone_source:${chosenRawPhone}`);

  const standoutTags: string[] = [];
  if (cuisine.normalized) standoutTags.push(`cuisine:${cuisine.normalized}`);
  if (wheelchairAccessible === true) standoutTags.push('wheelchair_accessible');
  if (takeout === true) standoutTags.push('takeout');
  if (delivery === true) standoutTags.push('delivery');
  if (dineIn === true) standoutTags.push('dine_in');
  if (reservations === true) standoutTags.push('reservations');
  if (wifi === true) standoutTags.push('wifi');
  if (alcohol === true) standoutTags.push('alcohol');
  if (outdoorSeating === true) standoutTags.push('outdoor_seating');
  if (parking === true) standoutTags.push('parking');

  return {
    sourceId: row.source.id,
    sourceName: row.source.name || '',
    sourceSlug: row.source.slug || null,
    matchClass: row.finalClass,
    enrichmentPatch: {
      website,
      phone,
      rawOpeningHours,
      hasHours,
      timezone: deriveTimezone(row.source.stateAbbr || row.source.state || null),
      cuisineType: cuisine.normalized,
      operator: String(tags.operator || '').trim() || null,
      brand: String(tags.brand || '').trim() || null,
      wheelchairAccessible,
      takeout,
      delivery,
      dineIn,
      reservations,
      outdoorSeating,
      wifi,
      alcohol,
      kidsFriendly,
      parking,
      osmType: row.bestCandidate.osmType || null,
      osmId: row.bestCandidate.osmId ?? null,
      osmName: row.bestCandidate.osmName || null,
      osmMatchScore: row.finalScore ?? null,
      osmDistanceM: Number.isFinite(row.bestCandidate.distanceM) ? Number((row.bestCandidate.distanceM || 0).toFixed(2)) : null,
      osmSourceObject: {
        type: row.bestCandidate.osmType || null,
        id: row.bestCandidate.osmId ?? null,
        name: row.bestCandidate.osmName || null,
        matchScore: row.finalScore ?? null,
        distanceM: Number.isFinite(row.bestCandidate.distanceM) ? Number((row.bestCandidate.distanceM || 0).toFixed(2)) : null,
      },
      facetIndexPatch: {
        amenities: {
          wheelchair_accessible: wheelchairAccessible,
          reservations,
          takeout,
          delivery,
          wifi,
          alcohol,
          outdoor_seating: outdoorSeating,
          parking,
        },
        dineOptions: {
          dine_in: dineIn,
          takeout,
          delivery,
        },
        standoutTags,
      },
      enrichmentSources: sources,
      osmTagsRaw: tags,
      enrichmentNotes: notes,
    },
  };
}

function main(): void {
  console.log('Building DRY-RUN enrichment patch from strong OSM matches only...');
  console.log('Safety: no DB writes, no schema changes.\n');

  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Missing input file: ${INPUT_PATH}`);
  }

  const input = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8')) as { records?: MatchRecord[] };
  const records = input.records || [];
  const strongRows = records.filter((r) => r.finalClass === 'strong_match');
  const patches = strongRows.map(buildPatch).filter(Boolean) as PatchRow[];

  const out = {
    generatedAt: new Date().toISOString(),
    mode: 'dry_run',
    source: 'foursquare-osm-match-dry-run',
    inputFile: INPUT_PATH,
    totals: {
      totalRows: records.length,
      strongRows: strongRows.length,
      enrichedRows: patches.length,
      skippedWeakOrNoMatch: records.length - strongRows.length,
    },
    records: patches,
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(out, null, 2), 'utf8');

  const csvHeader = [
    'sourceId',
    'sourceName',
    'osmName',
    'osmType',
    'osmId',
    'osmMatchScore',
    'osmDistanceM',
    'website',
    'phone',
    'hasHours',
    'cuisineType',
    'timezone',
    'wheelchairAccessible',
    'takeout',
    'delivery',
    'dineIn',
    'reservations',
    'outdoorSeating',
    'wifi',
    'alcohol',
    'kidsFriendly',
    'parking',
    'amenitiesCount',
    'notes',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const r of patches) {
    const p = r.enrichmentPatch;
    csvLines.push(
      [
        r.sourceId,
        r.sourceName,
        p.osmName,
        p.osmType,
        p.osmId,
        p.osmMatchScore,
        p.osmDistanceM,
        p.website,
        p.phone,
        p.hasHours,
        p.cuisineType,
        p.timezone,
        p.wheelchairAccessible,
        p.takeout,
        p.delivery,
        p.dineIn,
        p.reservations,
        p.outdoorSeating,
        p.wifi,
        p.alcohol,
        p.kidsFriendly,
        p.parking,
        countAmenitySignals(p),
        p.enrichmentNotes.join('|'),
      ]
        .map(toCsvValue)
        .join(',')
    );
  }
  fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n'), 'utf8');

  console.log('Summary:');
  const header = [
    'Source Name'.padEnd(28),
    'OSM Name'.padEnd(28),
    'Website'.padEnd(8),
    'Phone'.padEnd(8),
    'Hours'.padEnd(8),
    'Cuisine'.padEnd(10),
    'Amenities'.padEnd(10),
    'Notes',
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(Math.min(170, header.length + 20)));
  for (const r of patches) {
    const p = r.enrichmentPatch;
    const notes = p.enrichmentNotes.slice(0, 2).join('; ') || '-';
    console.log(
      [
        r.sourceName.slice(0, 28).padEnd(28),
        String(p.osmName || '').slice(0, 28).padEnd(28),
        (p.website ? 'yes' : 'no').padEnd(8),
        (p.phone ? 'yes' : 'no').padEnd(8),
        (p.hasHours ? 'yes' : 'no').padEnd(8),
        (p.cuisineType ? 'yes' : 'no').padEnd(10),
        String(countAmenitySignals(p)).padEnd(10),
        notes,
      ].join(' | ')
    );
  }

  console.log('\nCreated files:');
  console.log(`  - ${OUTPUT_JSON}`);
  console.log(`  - ${OUTPUT_CSV}`);
}

main();

