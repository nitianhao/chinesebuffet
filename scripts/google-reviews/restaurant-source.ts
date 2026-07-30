// Restaurant selection + eligibility for batch processing.
//
// Backbone is the reviewScrapeJobs table (one row per restaurant). Eligibility:
//   - never scraped                        -> eligible (category "never")
//   - completed, but older than refresh    -> eligible (category "refresh")
//   - failed/soft-skipped, attempts < cap  -> eligible (category "retry")
//   - permanent outcome (no_reviews, mismatch, ...) -> not eligible
//   - currently locked by a live worker    -> not eligible
//   - attempts >= cap                       -> not eligible (needs manual review)
//
// Ordering is deterministic: never-attempted first, then retryable (fewest
// attempts first), tie-broken by buffet id, so repeated runs are predictable.

import fs from "node:fs";
import { init } from "@instantdb/admin";
import { SourceRestaurant } from "./types";

type AdminDb = ReturnType<typeof init>;

/** Job outcomes that should never be auto-retried. */
const PERMANENT_STATUSES = new Set([
  "no_reviews",
  "listing_mismatch",
  "listing_not_found",
  "skipped_missing_maps_identifier",
  "permanently_unavailable",
]);

export type SelectionCategory = "never" | "refresh" | "retry";

export type EligibleRestaurant = SourceRestaurant & {
  cityName?: string;
  category: SelectionCategory;
  attemptCount: number;
  jobStatus?: string;
  lastAttemptAt?: string;
};

export type SelectionOptions = {
  cuisine: string;
  refreshOlderThanDays: number;
  maxAttempts: number;
  failedOnly: boolean;
  limit: number | null;
  /** Skip buffets that already have >= this many stored reviews. null = no filter. */
  minReviews: number | null;
  /** Only process buffets whose placeId is a real Google place id (ChIJ…). */
  googlePlaceIdOnly: boolean;
  /**
   * Restrict selection to this pre-computed set of buffet ids (a cached eligible
   * list). When set, the expensive nested-review query is skipped — the snapshot
   * already encoded the review-count gate — so batch runs stay fast.
   */
  candidateIds?: Set<string> | null;
};

export type SelectionSummary = {
  eligible: EligibleRestaurant[];
  counts: {
    totalWithPlaceId: number;
    never: number;
    refresh: number;
    retry: number;
    skippedCompleted: number;
    skippedPermanent: number;
    skippedMaxedOut: number;
    skippedLocked: number;
    skippedMissingId: number;
    skippedEnoughReviews: number;
  };
};

type JobRow = {
  buffetId?: string;
  status?: string;
  attemptCount?: number | null;
  completedAt?: string | null;
  lastAttemptAt?: string | null;
  lockExpiresAt?: string | null;
};

async function fetchAll<T>(
  db: AdminDb,
  build: (limit: number, offset: number) => Record<string, unknown>,
  pick: (res: any) => T[],
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Retry on InstantDB timeouts (429/timeout) with linear backoff — heavy
    // nested queries (e.g. buffets + reviewRecords) occasionally time out.
    let res: any;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await db.query(build(pageSize, offset) as any);
        break;
      } catch (e: any) {
        const isTimeout = e?.status === 429 || e?.body?.type === "timeout";
        if (!isTimeout || attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    const rows = pick(res);
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

export async function selectRestaurants(
  db: AdminDb,
  opts: SelectionOptions,
): Promise<SelectionSummary> {
  const now = Date.now();
  const refreshCutoff = now - opts.refreshOlderThanDays * 24 * 60 * 60 * 1000;

  // A cached candidate list makes the review-count gate unnecessary, so we can
  // skip the expensive nested reviewRecords fetch (the source of DB timeouts).
  const gateOnReviews = opts.minReviews != null && !opts.candidateIds;
  const buffets = await fetchAll<Record<string, any>>(
    db,
    (limit, offset) => ({
      buffets: {
        $: { where: { cuisineType: opts.cuisine }, limit, offset },
        // Only pull reviews when we need to gate on count; cap at the threshold
        // since we only care whether a buffet has reached minReviews.
        ...(gateOnReviews ? { reviewRecords: { $: { limit: opts.minReviews! } } } : {}),
      },
    }),
    (res) => res.buffets ?? [],
    // Smaller pages when pulling nested reviews — keeps each query under the timeout.
    gateOnReviews ? 200 : 1000,
  );

  const jobs = await fetchAll<JobRow>(
    db,
    (limit, offset) => ({ reviewScrapeJobs: { $: { limit, offset } } }),
    (res) => res.reviewScrapeJobs ?? [],
  );
  const jobByBuffet = new Map<string, JobRow>();
  for (const j of jobs) if (j.buffetId) jobByBuffet.set(j.buffetId, j);

  const counts: SelectionSummary["counts"] = {
    totalWithPlaceId: 0,
    never: 0,
    refresh: 0,
    retry: 0,
    skippedCompleted: 0,
    skippedPermanent: 0,
    skippedMaxedOut: 0,
    skippedLocked: 0,
    skippedMissingId: 0,
    skippedEnoughReviews: 0,
  };

  const eligible: EligibleRestaurant[] = [];

  for (const b of buffets) {
    // Cached-list mode: consider only the pre-computed candidate ids.
    if (opts.candidateIds && !opts.candidateIds.has(b.id)) continue;

    // A usable id is any placeId, or — when googlePlaceIdOnly — a real Google
    // place id (ChIJ…). The scraper resolves listings via a place_id: Maps URL,
    // so non-Google ids (e.g. fsq:…) can't be looked up and are treated as missing.
    const hasUsableId =
      !!b.placeId && (!opts.googlePlaceIdOnly || String(b.placeId).startsWith("ChIJ"));
    if (!hasUsableId) {
      counts.skippedMissingId += 1;
      continue;
    }
    if (b.permanentlyClosed) {
      counts.skippedPermanent += 1;
      continue;
    }
    counts.totalWithPlaceId += 1;

    // Already has enough reviews? Skip regardless of job state. reviewRecords is
    // capped at minReviews by the query, so length === minReviews means ">=".
    // (Only when gating on reviews — a cached candidate list already encodes this.)
    if (gateOnReviews && (b.reviewRecords || []).length >= opts.minReviews!) {
      counts.skippedEnoughReviews += 1;
      continue;
    }

    const job = jobByBuffet.get(b.id);
    const attemptCount = job?.attemptCount ?? 0;

    // Locked by a live worker?
    if (job?.lockExpiresAt && Date.parse(job.lockExpiresAt) > now) {
      counts.skippedLocked += 1;
      continue;
    }

    const base: EligibleRestaurant = {
      id: b.id,
      name: b.name,
      address: b.address,
      placeId: b.placeId ?? undefined,
      url: b.url ?? undefined,
      lat: b.lat,
      lng: b.lng,
      permanentlyClosed: b.permanentlyClosed,
      cityName: b.cityName,
      category: "never",
      attemptCount,
      jobStatus: job?.status,
      lastAttemptAt: job?.lastAttemptAt ?? undefined,
    };

    if (!job) {
      if (opts.failedOnly) continue; // failed-only ignores never-attempted
      counts.never += 1;
      eligible.push({ ...base, category: "never" });
      continue;
    }

    if (job.status === "completed") {
      const stale = job.completedAt ? Date.parse(job.completedAt) < refreshCutoff : false;
      if (opts.failedOnly || !stale) {
        counts.skippedCompleted += 1;
        continue;
      }
      counts.refresh += 1;
      eligible.push({ ...base, category: "refresh" });
      continue;
    }

    if (job.status && PERMANENT_STATUSES.has(job.status)) {
      counts.skippedPermanent += 1;
      continue;
    }

    if (attemptCount >= opts.maxAttempts) {
      counts.skippedMaxedOut += 1;
      continue;
    }

    counts.retry += 1;
    eligible.push({ ...base, category: "retry" });
  }

  // Deterministic order: never first, then refresh, then retry; within each,
  // fewest attempts first, tie-broken by id.
  const rank: Record<SelectionCategory, number> = { never: 0, refresh: 1, retry: 2 };
  eligible.sort((a, b) => {
    if (rank[a.category] !== rank[b.category]) return rank[a.category] - rank[b.category];
    if (a.attemptCount !== b.attemptCount) return a.attemptCount - b.attemptCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const limited = opts.limit != null ? eligible.slice(0, opts.limit) : eligible;
  return { eligible: limited, counts };
}

type EligibleSnapshot = {
  generatedAt: string | null;
  cuisine: string;
  count: number;
  ids: string[];
};

/**
 * Write the full eligible id set to a JSON file. Run once (accepts the slow
 * nested-review query), then batch runs read it via loadCandidateIds and skip
 * that query entirely.
 */
export function writeEligibleSnapshot(file: string, cuisine: string, ids: string[]): void {
  const payload: EligibleSnapshot = { generatedAt: null, cuisine, count: ids.length, ids };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

/** Load a cached eligible id set produced by writeEligibleSnapshot. */
export function loadCandidateIds(file: string): Set<string> {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as EligibleSnapshot;
  return new Set(parsed.ids ?? []);
}
