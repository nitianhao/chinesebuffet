import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

type RollbackRow = {
  sourceId: string;
  sourceName?: string;
  sourceSlug?: string | null;
  beforeSnapshot?: Record<string, unknown>;
  timestamp?: string;
  patchPlanVersion?: string;
  enrichmentVersion?: string;
};

type RollbackStatus = 'rolled_back' | 'skipped_no_snapshot' | 'skipped_missing_record' | 'failed' | 'dry_run_preview';

type RollbackReportRow = {
  sourceId: string;
  sourceName: string;
  status: RollbackStatus;
  fieldsToRestore: string[];
  reason: string;
  error?: string;
};

const ROLLBACK_INPUT_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-apply-rollback.json');
const ROLLBACK_REPORT_PATH = path.join(process.cwd(), 'data', 'osm-strong-match-rollback-report.json');

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const raw = args.find((a) => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length).trim() : null;
}

function parseIdsArg(value: string | null): Set<string> | null {
  if (!value) return null;
  const ids = value.split(',').map((x) => x.trim()).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

function getAdminDb() {
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) throw new Error('INSTANT_ADMIN_TOKEN is required for --apply rollback.');
  return init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });
}

async function recordExists(db: any, id: string): Promise<boolean> {
  const result = await db.query({
    buffets: {
      $: { where: { id }, limit: 1 },
    },
  });
  return Boolean((result?.buffets || [])[0]);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const idsFilter = parseIdsArg(getArgValue(args, '--ids'));
  const limitRaw = getArgValue(args, '--limit');
  const limit = limitRaw != null ? Math.max(0, Number(limitRaw) || 0) : null;

  if (!fs.existsSync(ROLLBACK_INPUT_PATH)) {
    throw new Error(`Rollback input missing: ${ROLLBACK_INPUT_PATH}`);
  }

  const payload = JSON.parse(fs.readFileSync(ROLLBACK_INPUT_PATH, 'utf8')) as { rollback?: RollbackRow[] };
  let rows = payload.rollback || [];
  if (idsFilter && idsFilter.size) rows = rows.filter((r) => idsFilter.has(r.sourceId));
  if (limit != null) rows = rows.slice(0, limit);

  const reportRows: RollbackReportRow[] = [];
  const db = apply ? getAdminDb() : null;

  console.log(`Rollback mode: ${apply ? 'APPLY' : 'DRY_RUN'}`);
  console.log(`Rows selected: ${rows.length}`);

  for (const row of rows) {
    const sourceName = row.sourceName || row.sourceId;
    const before = row.beforeSnapshot || {};
    const fieldsToRestore = Object.keys(before);

    if (!fieldsToRestore.length) {
      reportRows.push({
        sourceId: row.sourceId,
        sourceName,
        status: 'skipped_no_snapshot',
        fieldsToRestore: [],
        reason: 'No beforeSnapshot fields found.',
      });
      continue;
    }

    if (!apply) {
      reportRows.push({
        sourceId: row.sourceId,
        sourceName,
        status: 'dry_run_preview',
        fieldsToRestore,
        reason: 'Dry-run preview only; no writes.',
      });
      continue;
    }

    try {
      const exists = await recordExists(db, row.sourceId);
      if (!exists) {
        reportRows.push({
          sourceId: row.sourceId,
          sourceName,
          status: 'skipped_missing_record',
          fieldsToRestore,
          reason: 'Target record missing.',
        });
        continue;
      }

      await db.transact([db.tx.buffets[row.sourceId].update(before)]);
      reportRows.push({
        sourceId: row.sourceId,
        sourceName,
        status: 'rolled_back',
        fieldsToRestore,
        reason: 'Rollback update applied.',
      });
    } catch (error) {
      reportRows.push({
        sourceId: row.sourceId,
        sourceName,
        status: 'failed',
        fieldsToRestore,
        reason: 'Rollback update failed.',
        error: (error as Error)?.message || String(error),
      });
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry_run',
    input: ROLLBACK_INPUT_PATH,
    totals: {
      selected: rows.length,
      rolled_back: reportRows.filter((r) => r.status === 'rolled_back').length,
      dry_run_preview: reportRows.filter((r) => r.status === 'dry_run_preview').length,
      skipped_no_snapshot: reportRows.filter((r) => r.status === 'skipped_no_snapshot').length,
      skipped_missing_record: reportRows.filter((r) => r.status === 'skipped_missing_record').length,
      failed: reportRows.filter((r) => r.status === 'failed').length,
    },
    records: reportRows,
  };

  fs.writeFileSync(ROLLBACK_REPORT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Rollback report written: ${ROLLBACK_REPORT_PATH}`);
}

main().catch((error) => {
  console.error('Rollback script failed:', error);
  process.exit(1);
});

