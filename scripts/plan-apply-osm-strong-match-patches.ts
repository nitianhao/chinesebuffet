import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

type PatchActionType =
  | 'add'
  | 'keep_existing'
  | 'upgrade_normalization'
  | 'skip_missing_source'
  | 'skip_conflict'
  | 'skip_no_change';

type ApplyStatus =
  | 'applied'
  | 'skipped_no_changes'
  | 'skipped_conflict'
  | 'skipped_missing_record'
  | 'failed';

type ExistingDbRow = {
  id: string;
  name?: string;
  slug?: string;
  website?: string | null;
  phone?: string | null;
  hours?: string | null;
  cuisineType?: string | null;
  facetIndex?: string | null;
  overpassPOIs?: string | null;
};

type EnrichmentRow = {
  sourceId: string;
  sourceName: string;
  sourceSlug?: string | null;
  matchClass: 'strong_match' | 'weak_match' | 'no_match';
  enrichmentPatch: {
    website?: string | null;
    phone?: string | null;
    rawOpeningHours?: string | null;
    hasHours?: boolean;
    timezone?: string | null;
    cuisineType?: string | null;
    operator?: string | null;
    brand?: string | null;
    wheelchairAccessible?: boolean | null;
    takeout?: boolean | null;
    delivery?: boolean | null;
    dineIn?: boolean | null;
    reservations?: boolean | null;
    outdoorSeating?: boolean | null;
    wifi?: boolean | null;
    alcohol?: boolean | null;
    kidsFriendly?: boolean | null;
    parking?: boolean | null;
    osmSourceObject?: {
      type?: string | null;
      id?: number | null;
      name?: string | null;
      matchScore?: number | null;
      distanceM?: number | null;
    };
    enrichmentSources?: string[];
    enrichmentNotes?: string[];
    osmTagsRaw?: Record<string, string>;
    facetIndexPatch?: {
      amenities?: {
        wheelchair_accessible?: boolean | null;
        reservations?: boolean | null;
        takeout?: boolean | null;
        delivery?: boolean | null;
        wifi?: boolean | null;
        alcohol?: boolean | null;
        outdoor_seating?: boolean | null;
        parking?: boolean | null;
      };
      dineOptions?: {
        dine_in?: boolean | null;
        takeout?: boolean | null;
        delivery?: boolean | null;
      };
      standoutTags?: string[];
    };
  };
};

type PlannedAction = {
  fieldPath: string;
  action: PatchActionType;
  existingValue: unknown;
  incomingValue: unknown;
  reason: string;
};

type PlannedRow = {
  sourceId: string;
  sourceName: string;
  sourceSlug: string | null;
  applyEligible: boolean;
  patchActions: PlannedAction[];
  finalPatch: Record<string, unknown>;
  provenancePatch: Record<string, unknown>;
  warnings: string[];
};

type ApplyReportRow = {
  sourceId: string;
  sourceName: string;
  sourceSlug: string | null;
  status: ApplyStatus;
  fieldsApplied: string[];
  fieldsSkipped: string[];
  reason: string;
  error?: string;
  warnings: string[];
};

const ENRICH_INPUT_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-enrichment-dry-run.json');
const PLAN_JSON_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-patch-plan.json');
const PLAN_CSV_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-patch-review.csv');
const APPLY_ROLLBACK_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-apply-rollback.json');
const APPLY_REPORT_JSON_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-apply-report.json');
const APPLY_REPORT_CSV_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-apply-report.csv');
const ENRICHMENT_VERSION = 'osm_strong_match_v1';
const PATCH_PLAN_VERSION = 'osm_strong_match_patch_plan_v1';

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const raw = args.find((a) => a.startsWith(prefix));
  if (!raw) return null;
  return raw.slice(prefix.length).trim();
}

function parseIdsArg(value: string | null): Set<string> | null {
  if (!value) return null;
  const ids = value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

function hasNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function normalizeComparableValue(fieldPath: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value).trim();
  if (!text) return '';

  if (fieldPath.includes('phone')) return text.replace(/\D/g, '');
  if (fieldPath.includes('website')) {
    try {
      const raw = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      const u = new URL(raw);
      return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname}`.replace(/\/$/, '');
    } catch {
      return text.toLowerCase();
    }
  }
  if (fieldPath === 'cuisineType') return text.toLowerCase().replace(/\s+/g, '_');
  return text.toLowerCase();
}

function isSafeOverwrite(fieldPath: string, existingValue: unknown, incomingValue: unknown): boolean {
  if (!hasNonEmpty(existingValue) || !hasNonEmpty(incomingValue)) return false;
  const existingNorm = normalizeComparableValue(fieldPath, existingValue);
  const incomingNorm = normalizeComparableValue(fieldPath, incomingValue);
  if (!existingNorm || !incomingNorm) return false;

  if (fieldPath === 'website' || fieldPath === 'phone' || fieldPath === 'cuisineType') {
    return existingNorm === incomingNorm && String(incomingValue).trim() !== String(existingValue).trim();
  }
  return false;
}

function decidePatchAction(fieldPath: string, existingValue: unknown, incomingValue: unknown): PlannedAction {
  if (!hasNonEmpty(incomingValue)) {
    return {
      fieldPath,
      action: 'skip_missing_source',
      existingValue,
      incomingValue,
      reason: 'Incoming value missing; no patch generated.',
    };
  }

  if (!hasNonEmpty(existingValue)) {
    return {
      fieldPath,
      action: 'add',
      existingValue,
      incomingValue,
      reason: 'Existing value empty and incoming value present.',
    };
  }

  const existingNorm = normalizeComparableValue(fieldPath, existingValue);
  const incomingNorm = normalizeComparableValue(fieldPath, incomingValue);
  if (existingNorm && incomingNorm && existingNorm === incomingNorm) {
    if (String(existingValue).trim() === String(incomingValue).trim()) {
      return {
        fieldPath,
        action: 'skip_no_change',
        existingValue,
        incomingValue,
        reason: 'Existing and incoming values are equivalent.',
      };
    }
    if (isSafeOverwrite(fieldPath, existingValue, incomingValue)) {
      return {
        fieldPath,
        action: 'upgrade_normalization',
        existingValue,
        incomingValue,
        reason: 'Equivalent value with safer normalization upgrade.',
      };
    }
    return {
      fieldPath,
      action: 'keep_existing',
      existingValue,
      incomingValue,
      reason: 'Equivalent normalized value; keep existing form.',
    };
  }

  return {
    fieldPath,
    action: 'skip_conflict',
    existingValue,
    incomingValue,
    reason: 'Existing non-empty value conflicts with incoming value; conservative skip.',
  };
}

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getDeep(obj: any, pathParts: string[]): unknown {
  let cur = obj;
  for (const part of pathParts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setDeep(target: Record<string, unknown>, pathParts: string[], value: unknown): void {
  let cur: any = target;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const p = pathParts[i];
    if (typeof cur[p] !== 'object' || cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  cur[pathParts[pathParts.length - 1]] = value;
}

function toCsvValue(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildProvenancePatch(row: EnrichmentRow): Record<string, unknown> {
  const p = row.enrichmentPatch;
  return {
    osmSourceObject: p.osmSourceObject || null,
    enrichmentSources: p.enrichmentSources || [],
    enrichmentNotes: p.enrichmentNotes || [],
    osmTagsRaw: p.osmTagsRaw || {},
    enrichedFrom: 'osm',
    enrichedAt: new Date().toISOString(),
    enrichmentVersion: ENRICHMENT_VERSION,
    patchPlanVersion: PATCH_PLAN_VERSION,
  };
}

function flattenActionsCount(rows: PlannedRow[]): Record<PatchActionType, number> {
  const totals: Record<PatchActionType, number> = {
    add: 0,
    keep_existing: 0,
    upgrade_normalization: 0,
    skip_missing_source: 0,
    skip_conflict: 0,
    skip_no_change: 0,
  };
  for (const row of rows) for (const action of row.patchActions) totals[action.action] += 1;
  return totals;
}

function getAdminDb() {
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) throw new Error('INSTANT_ADMIN_TOKEN is required for DB operations.');
  return init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });
}

async function loadExistingRows(ids: string[]): Promise<Map<string, ExistingDbRow>> {
  const byId = new Map<string, ExistingDbRow>();
  if (!ids.length) return byId;

  let db: any;
  try {
    db = getAdminDb();
  } catch {
    return byId;
  }

  for (const id of ids) {
    try {
      const result = await db.query({
        buffets: {
          $: { where: { id }, limit: 1 },
        },
      });
      const row = (result?.buffets || [])[0] as ExistingDbRow | undefined;
      if (row) byId.set(id, row);
    } catch {
      // keep planning robust in dry-run mode
    }
  }

  return byId;
}

function buildPlanRows(enrichmentRows: EnrichmentRow[], existingMap: Map<string, ExistingDbRow>): PlannedRow[] {
  const rows = enrichmentRows.filter((r) => r.matchClass === 'strong_match');
  const planRows: PlannedRow[] = [];

  for (const row of rows) {
    const warnings: string[] = [];
    const existing = existingMap.get(row.sourceId);
    if (!existing) warnings.push('existing_db_row_not_loaded; plan assumes empty existing values');

    const existingFacet = parseJsonSafe<Record<string, any>>(existing?.facetIndex, {});
    const filteredStandoutTags = (row.enrichmentPatch.facetIndexPatch?.standoutTags || []).filter(
      (tag) => String(tag).trim() !== 'dine_in'
    );

    const candidateFields: Array<{ fieldPath: string; incomingValue: unknown; existingValue: unknown }> = [
      { fieldPath: 'website', incomingValue: row.enrichmentPatch.website ?? null, existingValue: existing?.website ?? null },
      { fieldPath: 'phone', incomingValue: row.enrichmentPatch.phone ?? null, existingValue: existing?.phone ?? null },
      { fieldPath: 'rawOpeningHours', incomingValue: row.enrichmentPatch.rawOpeningHours ?? null, existingValue: null },
      {
        fieldPath: 'hasHours',
        incomingValue: row.enrichmentPatch.rawOpeningHours ? row.enrichmentPatch.hasHours ?? null : null,
        existingValue: null,
      },
      { fieldPath: 'timezone', incomingValue: row.enrichmentPatch.timezone ?? null, existingValue: null },
      {
        fieldPath: 'cuisineType',
        incomingValue: row.enrichmentPatch.cuisineType ?? null,
        existingValue: existing?.cuisineType ?? null,
      },
      { fieldPath: 'operator', incomingValue: row.enrichmentPatch.operator ?? null, existingValue: null },
      { fieldPath: 'brand', incomingValue: row.enrichmentPatch.brand ?? null, existingValue: null },
      {
        fieldPath: 'wheelchairAccessible',
        incomingValue: row.enrichmentPatch.wheelchairAccessible ?? null,
        existingValue: null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.wheelchair_accessible',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.wheelchair_accessible ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'wheelchair_accessible']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.reservations',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.reservations ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'reservations']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.takeout',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.takeout ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'takeout']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.delivery',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.delivery ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'delivery']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.wifi',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.wifi ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'wifi']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.alcohol',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.alcohol ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'alcohol']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.outdoor_seating',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.outdoor_seating ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'outdoor_seating']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.amenities.parking',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.amenities?.parking ?? null,
        existingValue: getDeep(existingFacet, ['amenities', 'parking']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.dineOptions.takeout',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.dineOptions?.takeout ?? null,
        existingValue: getDeep(existingFacet, ['dineOptions', 'takeout']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.dineOptions.delivery',
        incomingValue: row.enrichmentPatch.facetIndexPatch?.dineOptions?.delivery ?? null,
        existingValue: getDeep(existingFacet, ['dineOptions', 'delivery']) ?? null,
      },
      {
        fieldPath: 'facetIndexPatch.standoutTags',
        incomingValue: filteredStandoutTags,
        existingValue: getDeep(existingFacet, ['standoutTags']) ?? [],
      },
    ];

    const patchActions = candidateFields.map((c) => decidePatchAction(c.fieldPath, c.existingValue, c.incomingValue));
    const finalPatch: Record<string, unknown> = {};

    if (row.enrichmentPatch?.facetIndexPatch?.dineOptions?.dine_in !== undefined) {
      warnings.push('dine_in_incoming_ignored_by_policy');
    }

    for (const a of patchActions) {
      if (a.action !== 'add' && a.action !== 'upgrade_normalization') continue;
      if (a.fieldPath.startsWith('facetIndexPatch.')) {
        const subPath = a.fieldPath.replace(/^facetIndexPatch\./, '').split('.');
        if (!finalPatch.facetIndexPatch || typeof finalPatch.facetIndexPatch !== 'object') {
          finalPatch.facetIndexPatch = {};
        }
        setDeep(finalPatch.facetIndexPatch as Record<string, unknown>, subPath, a.incomingValue);
      } else {
        finalPatch[a.fieldPath] = a.incomingValue;
      }
    }

    const provenancePatch = buildProvenancePatch(row);
    const applyEligible = Object.keys(finalPatch).length > 0;
    if (!applyEligible) warnings.push('no_safe_mutations_planned');

    const conflictCount = patchActions.filter((x) => x.action === 'skip_conflict').length;
    if (conflictCount > 0) warnings.push(`conflicts_detected:${conflictCount}`);

    planRows.push({
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      sourceSlug: row.sourceSlug || null,
      applyEligible,
      patchActions,
      finalPatch,
      provenancePatch,
      warnings,
    });
  }

  return planRows;
}

function writePlanOutputs(planRows: PlannedRow[], applyMode: boolean): void {
  const totals = flattenActionsCount(planRows);
  const out = {
    generatedAt: new Date().toISOString(),
    mode: applyMode ? 'apply' : 'dry_run',
    inputFile: ENRICH_INPUT_PATH,
    patchPlanVersion: PATCH_PLAN_VERSION,
    enrichmentVersion: ENRICHMENT_VERSION,
    totals: {
      recordsProcessed: planRows.length,
      applyEligible: planRows.filter((r) => r.applyEligible).length,
      ...totals,
    },
    records: planRows,
  };

  fs.mkdirSync(path.dirname(PLAN_JSON_PATH), { recursive: true });
  fs.writeFileSync(PLAN_JSON_PATH, JSON.stringify(out, null, 2), 'utf8');

  const csvHeader = [
    'sourceId',
    'sourceName',
    'applyEligible',
    'adds',
    'upgrade_normalization',
    'keep_existing',
    'skip_conflict',
    'skip_no_change',
    'skip_missing_source',
    'fieldsToUpdate',
    'warnings',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const row of planRows) {
    const adds = row.patchActions.filter((a) => a.action === 'add').length;
    const upgrades = row.patchActions.filter((a) => a.action === 'upgrade_normalization').length;
    const keeps = row.patchActions.filter((a) => a.action === 'keep_existing').length;
    const conflicts = row.patchActions.filter((a) => a.action === 'skip_conflict').length;
    const noChange = row.patchActions.filter((a) => a.action === 'skip_no_change').length;
    const miss = row.patchActions.filter((a) => a.action === 'skip_missing_source').length;
    const fieldsToUpdate = row.patchActions
      .filter((a) => a.action === 'add' || a.action === 'upgrade_normalization')
      .map((a) => a.fieldPath)
      .join('|');

    csvLines.push(
      [
        row.sourceId,
        row.sourceName,
        row.applyEligible,
        adds,
        upgrades,
        keeps,
        conflicts,
        noChange,
        miss,
        fieldsToUpdate,
        row.warnings.join('|'),
      ]
        .map(toCsvValue)
        .join(',')
    );
  }
  fs.writeFileSync(PLAN_CSV_PATH, csvLines.join('\n'), 'utf8');

  console.log('Summary:');
  console.log(`  total eligible records: ${planRows.filter((r) => r.applyEligible).length}`);
  console.log(`  total planned adds: ${totals.add}`);
  console.log(`  total keep_existing: ${totals.keep_existing}`);
  console.log(`  total skip_conflict: ${totals.skip_conflict}`);
  console.log(`  total skip_no_change: ${totals.skip_no_change}`);
  console.log(`  total skipped because source missing: ${totals.skip_missing_source}`);

  console.log('\nPer-record review:');
  for (const row of planRows) {
    const adds = row.patchActions.filter((a) => a.action === 'add').length;
    const conflicts = row.patchActions.filter((a) => a.action === 'skip_conflict').length;
    const fields = row.patchActions
      .filter((a) => a.action === 'add' || a.action === 'upgrade_normalization')
      .map((a) => a.fieldPath);
    console.log(
      `  - ${row.sourceName}: adds=${adds}, conflicts=${conflicts}, fields=[${fields.join(', ') || 'none'}], warnings=[${row.warnings.join('; ') || 'none'}]`
    );
  }

  console.log('\nCreated files:');
  console.log(`  - ${PLAN_JSON_PATH}`);
  console.log(`  - ${PLAN_CSV_PATH}`);
}

function loadPlanForApply(): { records: PlannedRow[]; patchPlanVersion?: string; enrichmentVersion?: string } {
  if (!fs.existsSync(PLAN_JSON_PATH)) throw new Error(`Patch plan missing: ${PLAN_JSON_PATH}`);
  const parsed = JSON.parse(fs.readFileSync(PLAN_JSON_PATH, 'utf8')) as any;
  return {
    records: (parsed.records || []) as PlannedRow[],
    patchPlanVersion: parsed.patchPlanVersion,
    enrichmentVersion: parsed.enrichmentVersion,
  };
}

function applyFilters(rows: PlannedRow[], idsFilter: Set<string> | null, limit: number | null): PlannedRow[] {
  let out = rows;
  if (idsFilter && idsFilter.size > 0) out = out.filter((r) => idsFilter.has(r.sourceId));
  if (limit != null && limit >= 0) out = out.slice(0, limit);
  return out;
}

async function fetchCurrentRow(db: any, sourceId: string): Promise<ExistingDbRow | null> {
  const result = await db.query({
    buffets: {
      $: { where: { id: sourceId }, limit: 1 },
    },
  });
  const row = (result?.buffets || [])[0] as ExistingDbRow | undefined;
  return row || null;
}

function buildMappedUpdate(
  row: PlannedRow,
  current: ExistingDbRow,
  schemaIssues: string[]
): { mappedUpdate: Record<string, unknown>; fieldsApplied: string[]; fieldsSkipped: string[]; beforeSnapshot: Record<string, unknown> } {
  const mappedUpdate: Record<string, unknown> = {};
  const fieldsApplied: string[] = [];
  const fieldsSkipped: string[] = [];
  const beforeSnapshot: Record<string, unknown> = {};

  // Only fields from finalPatch are eligible.
  if (hasNonEmpty((row.finalPatch as any).timezone)) {
    schemaIssues.push('timezone_not_in_buffets_schema_skipped');
    fieldsSkipped.push('timezone');
  }

  if (hasNonEmpty((row.finalPatch as any).cuisineType)) {
    mappedUpdate.cuisineType = (row.finalPatch as any).cuisineType;
    fieldsApplied.push('cuisineType');
    beforeSnapshot.cuisineType = current.cuisineType ?? null;
  }

  if ((row.finalPatch as any).facetIndexPatch && hasNonEmpty((row.finalPatch as any).facetIndexPatch)) {
    const existingFacet = parseJsonSafe<Record<string, unknown>>(current.facetIndex, {});
    const nextFacet = {
      ...existingFacet,
      ...(row.finalPatch as any).facetIndexPatch,
    };
    mappedUpdate.facetIndex = JSON.stringify(nextFacet);
    fieldsApplied.push('facetIndex');
    beforeSnapshot.facetIndex = current.facetIndex ?? null;
  }

  // Provenance/meta writes only if schema-fit is safe.
  const existingOverpass = parseJsonSafe<Record<string, unknown>>(current.overpassPOIs, {});
  const nextOverpass = {
    ...existingOverpass,
    osmEnrichmentMeta: {
      ...(existingOverpass as any).osmEnrichmentMeta,
      ...row.provenancePatch,
    },
  };
  mappedUpdate.overpassPOIs = JSON.stringify(nextOverpass);
  fieldsApplied.push('overpassPOIs');
  beforeSnapshot.overpassPOIs = current.overpassPOIs ?? null;

  return { mappedUpdate, fieldsApplied, fieldsSkipped, beforeSnapshot };
}

function hasMaterialChangeSincePlanning(row: PlannedRow, current: ExistingDbRow): { conflict: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const cuisineAction = row.patchActions.find((a) => a.fieldPath === 'cuisineType');
  if (cuisineAction && (cuisineAction.action === 'add' || cuisineAction.action === 'upgrade_normalization')) {
    const plannedExisting = cuisineAction.existingValue;
    const currentExisting = current.cuisineType ?? null;
    const plannedNorm = normalizeComparableValue('cuisineType', plannedExisting);
    const currentNorm = normalizeComparableValue('cuisineType', currentExisting);
    if (plannedNorm !== currentNorm) reasons.push('cuisineType_changed_since_planning');
  }

  const standoutAction = row.patchActions.find((a) => a.fieldPath === 'facetIndexPatch.standoutTags');
  if (standoutAction && (standoutAction.action === 'add' || standoutAction.action === 'upgrade_normalization')) {
    const currentFacet = parseJsonSafe<Record<string, unknown>>(current.facetIndex, {});
    const currentStandout = JSON.stringify(getDeep(currentFacet, ['standoutTags']) ?? []);
    const plannedExisting = JSON.stringify(standoutAction.existingValue ?? []);
    if (currentStandout !== plannedExisting) reasons.push('facetIndex.standoutTags_changed_since_planning');
  }

  return { conflict: reasons.length > 0, reasons };
}

function writeApplyReports(
  reportRows: ApplyReportRow[],
  rollbackRows: Array<Record<string, unknown>>,
  consideredCount: number
): void {
  const totals = {
    recordsConsidered: consideredCount,
    recordsApplied: reportRows.filter((r) => r.status === 'applied').length,
    recordsSkipped: reportRows.filter((r) => r.status.startsWith('skipped_')).length,
    recordsFailed: reportRows.filter((r) => r.status === 'failed').length,
    totalFieldUpdatesApplied: reportRows
      .filter((r) => r.status === 'applied')
      .reduce((sum, r) => sum + r.fieldsApplied.length, 0),
  };

  fs.writeFileSync(
    APPLY_ROLLBACK_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        patchPlanVersion: PATCH_PLAN_VERSION,
        enrichmentVersion: ENRICHMENT_VERSION,
        rollback: rollbackRows,
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    APPLY_REPORT_JSON_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        patchPlanVersion: PATCH_PLAN_VERSION,
        enrichmentVersion: ENRICHMENT_VERSION,
        totals,
        records: reportRows,
      },
      null,
      2
    ),
    'utf8'
  );

  const csvHeader = [
    'sourceId',
    'sourceName',
    'status',
    'fieldsApplied',
    'fieldsSkipped',
    'reason',
    'error',
    'warnings',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const row of reportRows) {
    csvLines.push(
      [
        row.sourceId,
        row.sourceName,
        row.status,
        row.fieldsApplied.join('|'),
        row.fieldsSkipped.join('|'),
        row.reason,
        row.error || '',
        row.warnings.join('|'),
      ]
        .map(toCsvValue)
        .join(',')
    );
  }
  fs.writeFileSync(APPLY_REPORT_CSV_PATH, csvLines.join('\n'), 'utf8');

  console.log('\nApply summary:');
  console.log(`  records considered: ${totals.recordsConsidered}`);
  console.log(`  records applied: ${totals.recordsApplied}`);
  console.log(`  records skipped: ${totals.recordsSkipped}`);
  console.log(`  records failed: ${totals.recordsFailed}`);
  console.log(`  total field updates applied: ${totals.totalFieldUpdatesApplied}`);
  console.log(`  rollback file path: ${APPLY_ROLLBACK_PATH}`);
  console.log(`  apply report file path: ${APPLY_REPORT_JSON_PATH}`);
}

async function runApply(idsFilter: Set<string> | null, limit: number | null): Promise<void> {
  const db = getAdminDb();
  const loadedPlan = loadPlanForApply();
  const scopedRows = applyFilters(
    loadedPlan.records.filter((r) => r.applyEligible),
    idsFilter,
    limit
  );

  const reportRows: ApplyReportRow[] = [];
  const rollbackRows: Array<Record<string, unknown>> = [];

  for (const row of scopedRows) {
    const warnings = [...row.warnings];
    try {
      if (!row.applyEligible) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceSlug: row.sourceSlug,
          status: 'skipped_no_changes',
          fieldsApplied: [],
          fieldsSkipped: [],
          reason: 'applyEligible=false',
          warnings,
        });
        continue;
      }

      const current = await fetchCurrentRow(db, row.sourceId);
      if (!current) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceSlug: row.sourceSlug,
          status: 'skipped_missing_record',
          fieldsApplied: [],
          fieldsSkipped: [],
          reason: 'record_not_found',
          warnings,
        });
        continue;
      }

      const recheck = hasMaterialChangeSincePlanning(row, current);
      if (recheck.conflict) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceSlug: row.sourceSlug,
          status: 'skipped_conflict',
          fieldsApplied: [],
          fieldsSkipped: [],
          reason: `material_conflict:${recheck.reasons.join('|')}`,
          warnings,
        });
        continue;
      }

      const schemaIssues: string[] = [];
      const { mappedUpdate, fieldsApplied, fieldsSkipped, beforeSnapshot } = buildMappedUpdate(row, current, schemaIssues);
      if (schemaIssues.length) warnings.push(...schemaIssues);

      const actionable = Object.keys(mappedUpdate);
      if (!actionable.length) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceSlug: row.sourceSlug,
          status: 'skipped_no_changes',
          fieldsApplied: [],
          fieldsSkipped,
          reason: 'no_schema_fit_actionable_fields',
          warnings,
        });
        continue;
      }

      const allowedWriteKeys = new Set(['cuisineType', 'facetIndex', 'overpassPOIs']);
      const filteredUpdateEntries = Object.entries(mappedUpdate).filter(([k]) => allowedWriteKeys.has(k));
      const filteredUpdate = Object.fromEntries(filteredUpdateEntries);
      if (!Object.keys(filteredUpdate).length) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceSlug: row.sourceSlug,
          status: 'skipped_no_changes',
          fieldsApplied: [],
          fieldsSkipped: Object.keys(mappedUpdate),
          reason: 'no_allowed_write_keys_after_filter',
          warnings,
        });
        continue;
      }

      rollbackRows.push({
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceSlug: row.sourceSlug,
        beforeSnapshot,
        intendedPatch: row.finalPatch,
        provenancePatch: row.provenancePatch,
        timestamp: new Date().toISOString(),
        patchPlanVersion: loadedPlan.patchPlanVersion || PATCH_PLAN_VERSION,
        enrichmentVersion: loadedPlan.enrichmentVersion || ENRICHMENT_VERSION,
      });

      const actuallyApplied: string[] = [];
      const skippedAtWrite: string[] = [...fieldsSkipped];
      for (const [key, val] of Object.entries(filteredUpdate)) {
        try {
          await db.transact([db.tx.buffets[row.sourceId].update({ [key]: val })]);
          actuallyApplied.push(key);
        } catch (error) {
          const message = (error as Error)?.message || String(error);
          skippedAtWrite.push(key);
          if (/schema|attributes are missing/i.test(message)) {
            warnings.push(`schema_fit_skip:${key}`);
            continue;
          }
          throw error;
        }
      }

      if (!actuallyApplied.length) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceSlug: row.sourceSlug,
          status: 'skipped_no_changes',
          fieldsApplied: [],
          fieldsSkipped: skippedAtWrite,
          reason: 'all_candidate_fields_skipped_at_write_time',
          warnings,
        });
        continue;
      }

      reportRows.push({
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceSlug: row.sourceSlug,
        status: 'applied',
        fieldsApplied: actuallyApplied,
        fieldsSkipped: skippedAtWrite,
        reason: 'applied_successfully',
        warnings,
      });
    } catch (error) {
      reportRows.push({
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceSlug: row.sourceSlug,
        status: 'failed',
        fieldsApplied: [],
        fieldsSkipped: [],
        reason: 'exception_during_apply',
        error: (error as Error)?.message || String(error),
        warnings,
      });
    }
  }

  writeApplyReports(reportRows, rollbackRows, scopedRows.length);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const limitRaw = getArgValue(args, '--limit');
  const idsRaw = getArgValue(args, '--ids');
  const idsFilter = parseIdsArg(idsRaw);
  const limit = limitRaw != null ? Math.max(0, Number(limitRaw) || 0) : null;

  console.log(`Building OSM strong-match patch plan (mode: ${apply ? 'APPLY' : 'DRY_RUN'})...`);
  console.log('Safety: conservative, reversible planning with provenance.\n');

  if (!fs.existsSync(ENRICH_INPUT_PATH)) {
    throw new Error(`Input missing: ${ENRICH_INPUT_PATH}`);
  }

  const input = JSON.parse(fs.readFileSync(ENRICH_INPUT_PATH, 'utf8')) as { records?: EnrichmentRow[] };
  const enrichmentRows = input.records || [];
  const planningIds = enrichmentRows.filter((r) => r.matchClass === 'strong_match').map((r) => r.sourceId);
  const existingMap = await loadExistingRows(planningIds);
  const planRows = buildPlanRows(enrichmentRows, existingMap);
  writePlanOutputs(planRows, apply);

  if (!apply) {
    console.log('\nDry-run only. No database writes were performed.');
    return;
  }

  await runApply(idsFilter, limit);
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
