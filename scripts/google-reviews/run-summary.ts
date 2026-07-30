// Run summary accumulator + report writer (JSON + Markdown).
// Reports land in .runtime/google-reviews/reports/ (git-ignored).

import fs from "node:fs";
import path from "node:path";

export type PerRestaurantEntry = {
  id: string;
  name?: string;
  status: string;
  newReviews: number;
  existingUnchanged: number;
  durationMs: number;
  errorCode?: string;
};

export type RunConfigSnapshot = {
  maxReviews: number;
  delayMinMs: number;
  delayMaxMs: number;
  limitRestaurants: number | null;
  refreshOlderThanDays: number;
  maxAttempts: number;
};

export type RunSummaryState = {
  runId: string;
  cuisine: string;
  startedAt: string;
  finishedAt?: string;
  eligible: number;
  config: RunConfigSnapshot;
  counts: {
    attempted: number;
    completed: number;
    noReviews: number;
    skipped: number;
    blocked: number;
    dbErrors: number;
  };
  reviews: { newInserted: number; existingEnriched: number; existingUnchanged: number };
  errorsByCode: Record<string, number>;
  byStatus: Record<string, number>;
  stoppedEarly: boolean;
  perRestaurant: PerRestaurantEntry[];
};

export function newRunSummary(
  runId: string,
  cuisine: string,
  config: RunConfigSnapshot,
  eligible: number,
): RunSummaryState {
  return {
    runId,
    cuisine,
    startedAt: new Date().toISOString(),
    eligible,
    config,
    counts: { attempted: 0, completed: 0, noReviews: 0, skipped: 0, blocked: 0, dbErrors: 0 },
    reviews: { newInserted: 0, existingEnriched: 0, existingUnchanged: 0 },
    errorsByCode: {},
    byStatus: {},
    stoppedEarly: false,
    perRestaurant: [],
  };
}

export function recordRestaurant(s: RunSummaryState, e: PerRestaurantEntry): void {
  s.counts.attempted += 1;
  s.byStatus[e.status] = (s.byStatus[e.status] ?? 0) + 1;
  if (e.errorCode) s.errorsByCode[e.errorCode] = (s.errorsByCode[e.errorCode] ?? 0) + 1;
  s.reviews.newInserted += e.newReviews;
  s.reviews.existingUnchanged += e.existingUnchanged;
  s.perRestaurant.push(e);
}

function reportsDir(): string {
  const dir = path.join(process.cwd(), ".runtime", "google-reviews", "reports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}h ` : ""}${m ? `${m}m ` : ""}${sec}s`;
}

function toMarkdown(s: RunSummaryState, totalMs: number, avgMs: number): string {
  const c = s.counts;
  const r = s.reviews;
  const statusLines = Object.entries(s.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const errorLines = Object.entries(s.errorsByCode)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return [
    `# Google Reviews run — ${s.runId}`,
    ``,
    `- Cuisine: **${s.cuisine}**`,
    `- Started: ${s.startedAt}`,
    `- Finished: ${s.finishedAt ?? "(in progress)"}`,
    `- Duration: **${fmtDuration(totalMs)}**  (avg ${fmtDuration(avgMs)}/restaurant)`,
    `- Eligible at start: ${s.eligible}`,
    `- Stopped early: ${s.stoppedEarly ? "**yes**" : "no"}`,
    ``,
    `## Restaurants`,
    `- Attempted: ${c.attempted}`,
    `- Completed: ${c.completed}`,
    `- No reviews: ${c.noReviews}`,
    `- Skipped (soft): ${c.skipped}`,
    `- Blocked (hard): ${c.blocked}`,
    `- DB errors: ${c.dbErrors}`,
    ``,
    `## Reviews`,
    `- New inserted: **${r.newInserted}**`,
    `- Existing enriched: ${r.existingEnriched}`,
    `- Existing unchanged: ${r.existingUnchanged}`,
    ``,
    `## Status breakdown`,
    statusLines || "- (none)",
    ``,
    `## Errors by code`,
    errorLines || "- (none)",
    ``,
  ].join("\n");
}

/** Finalize timing and write JSON + Markdown reports. Returns their paths. */
export function finalizeAndWrite(s: RunSummaryState): {
  jsonPath: string;
  mdPath: string;
  totalMs: number;
  avgMs: number;
} {
  s.finishedAt = new Date().toISOString();
  const totalMs = Date.parse(s.finishedAt) - Date.parse(s.startedAt);
  const durations = s.perRestaurant.map((p) => p.durationMs);
  const avgMs = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const dir = reportsDir();
  const jsonPath = path.join(dir, `${s.runId}.json`);
  const mdPath = path.join(dir, `${s.runId}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ ...s, totalMs, avgMs }, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(s, totalMs, avgMs));
  return { jsonPath, mdPath, totalMs, avgMs };
}
