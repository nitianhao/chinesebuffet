// InstantDB storage for scraped reviews. Reuses the existing `reviews` entity
// and its `buffet` link, plus the new `fingerprint` field and `reviewScrapeJobs`
// entity (see src/instant.schema.ts — a schema push is required before use).
//
// Guarantees:
//  - Never creates duplicate reviews (dedup by reviewId, then fingerprint, then
//    a legacy text/name/publishAt key so we also match Apify-imported rows).
//  - Only ENRICHES an existing row with strictly richer data; never overwrites
//    good data with poorer (e.g. won't blank an existing owner response).
//  - Safe to rerun.

import { init, id } from "@instantdb/admin";
import { ScrapedGoogleReview } from "./types";

type AdminDb = ReturnType<typeof init>;

const REVIEW_ORIGIN = "google_maps_playwright";
const TXN_BATCH = 20; // matches the existing Apify importer to avoid "too many parameters"

export type StoreResult = {
  found: number;
  newlyStored: number;
  updated: number;
  skippedExisting: number;
};

type ExistingReview = {
  id: string;
  reviewId?: string | null;
  fingerprint?: string | null;
  name?: string | null;
  text?: string | null;
  publishAt?: string | null;
  likesCount?: number | null;
  responseFromOwnerText?: string | null;
  reviewContext?: string | null;
};

const legacyKey = (r: { text?: string | null; name?: string | null; publishAt?: string | null }) =>
  `${r.text || ""}_${r.name || ""}_${r.publishAt || ""}`;

/** Map a scraped review onto the existing `reviews` entity's fields. */
function toReviewEntity(review: ScrapedGoogleReview): Record<string, unknown> {
  return {
    reviewId: review.sourceReviewId ?? null,
    fingerprint: review.fingerprint ?? null,
    name: review.reviewerName ?? "",
    text: review.text ?? "",
    stars: review.rating,
    rating: review.rating,
    // The site renders `new Date(publishAt).toLocaleDateString()` and sorts
    // reviews by publishAt DESC, so publishAt must hold an ISO date (like the
    // Apify rows) — NOT the relative label. The label goes in relativeTime,
    // which the site renders as the "3 weeks ago" line. Matches Chinese reviews.
    publishAt: review.publishedAt ?? "",
    relativeTime: review.publishedLabel ?? null,
    publishedAtDate: review.publishedAt ?? null,
    reviewerUrl: review.reviewerProfileUrl ?? null,
    isLocalGuide: review.reviewerLocalGuide ?? null,
    reviewerNumberOfReviews: review.reviewerReviewCount ?? null,
    likesCount: review.likesCount ?? null,
    responseFromOwnerText: review.ownerResponseText ?? null,
    responseFromOwnerDate: review.ownerResponsePublishedAt ?? null,
    reviewContext: review.reviewContext ? JSON.stringify(review.reviewContext) : null,
    reviewOrigin: REVIEW_ORIGIN,
    scraperVersion: review.scraperVersion,
    scrapedAt: review.scrapedAt,
  };
}

/** Build the enrich patch for an existing row — only strictly-richer changes. */
function enrichPatch(
  existing: ExistingReview,
  review: ScrapedGoogleReview,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  const existingText = (existing.text || "").trim();
  if (!existingText && review.text) patch.text = review.text;
  if (!existing.responseFromOwnerText && review.ownerResponseText) {
    patch.responseFromOwnerText = review.ownerResponseText;
    if (review.ownerResponsePublishedAt) patch.responseFromOwnerDate = review.ownerResponsePublishedAt;
  }
  if (review.likesCount != null && existing.likesCount !== review.likesCount) {
    patch.likesCount = review.likesCount;
  }
  if (!existing.reviewContext && review.reviewContext) {
    patch.reviewContext = JSON.stringify(review.reviewContext);
  }
  if (!existing.fingerprint && review.fingerprint) patch.fingerprint = review.fingerprint;
  return Object.keys(patch).length ? patch : null;
}

/**
 * Insert new reviews and enrich existing ones for a single buffet.
 * `dryRun` computes counts without writing.
 */
export async function storeReviews(
  db: AdminDb,
  buffetId: string,
  reviews: ScrapedGoogleReview[],
  opts: { dryRun?: boolean } = {},
): Promise<StoreResult> {
  const res = await db.query({
    buffets: { $: { where: { id: buffetId } }, reviewRecords: {} },
  });
  const existing = (res.buffets?.[0]?.reviewRecords ?? []) as ExistingReview[];

  const byReviewId = new Map<string, ExistingReview>();
  const byFingerprint = new Map<string, ExistingReview>();
  const byLegacy = new Map<string, ExistingReview>();
  for (const e of existing) {
    if (e.reviewId) byReviewId.set(e.reviewId, e);
    if (e.fingerprint) byFingerprint.set(e.fingerprint, e);
    byLegacy.set(legacyKey(e), e);
  }

  const creates: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let skippedExisting = 0;

  for (const review of reviews) {
    const match =
      (review.sourceReviewId && byReviewId.get(review.sourceReviewId)) ||
      (review.fingerprint && byFingerprint.get(review.fingerprint)) ||
      byLegacy.get(
        legacyKey({ text: review.text, name: review.reviewerName, publishAt: review.publishedLabel }),
      );

    if (!match) {
      creates.push(toReviewEntity(review));
      continue;
    }
    const patch = enrichPatch(match, review);
    if (patch) updates.push({ id: match.id, patch });
    else skippedExisting += 1;
  }

  const result: StoreResult = {
    found: reviews.length,
    newlyStored: creates.length,
    updated: updates.length,
    skippedExisting,
  };
  if (opts.dryRun) return result;

  // Commit creates in batches (link each to the buffet).
  for (let i = 0; i < creates.length; i += TXN_BATCH) {
    const batch = creates.slice(i, i + TXN_BATCH).map((data) => {
      const newId = id();
      return db.tx.reviews[newId].create(data).link({ buffet: buffetId });
    });
    if (batch.length) await db.transact(batch);
  }
  // Commit enrich updates in batches.
  for (let i = 0; i < updates.length; i += TXN_BATCH) {
    const batch = updates.slice(i, i + TXN_BATCH).map((u) => db.tx.reviews[u.id].update(u.patch));
    if (batch.length) await db.transact(batch);
  }

  return result;
}

// --------------------------------------------------------------------------
// Scrape-job lifecycle (status + resume + basic lock).
// --------------------------------------------------------------------------

const LOCK_MS = 15 * 60 * 1000;

export async function startJob(
  db: AdminDb,
  args: { buffetId: string; placeId?: string; workerId: string; scraperVersion: string },
): Promise<string> {
  const now = new Date();
  // One job row per restaurant: reuse the existing row if present (job history
  // lives in the counters/attemptCount), otherwise create it.
  const existingRes = await db.query({
    reviewScrapeJobs: { $: { where: { buffetId: args.buffetId }, limit: 1 } },
  });
  const existing = (existingRes.reviewScrapeJobs?.[0] ?? null) as
    | { id: string; attemptCount?: number | null }
    | null;

  const jobId = existing?.id ?? id();
  const payload = {
    buffetId: args.buffetId,
    placeId: args.placeId ?? null,
    status: "running",
    startedAt: now.toISOString(),
    lastAttemptAt: now.toISOString(),
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    scraperVersion: args.scraperVersion,
    workerId: args.workerId,
    lockedAt: now.toISOString(),
    lockExpiresAt: new Date(now.getTime() + LOCK_MS).toISOString(),
  };

  if (existing) {
    await db.transact(db.tx.reviewScrapeJobs[jobId].update(payload));
  } else {
    // Link from the buffet ("many") side — the reviewScrapeJobs.buffet forward
    // link does not attach via the admin SDK, but the reverse label does.
    await db.transact([
      db.tx.reviewScrapeJobs[jobId].create(payload),
      db.tx.buffets[args.buffetId].link({ reviewScrapeJobs: jobId }),
    ]);
  }
  return jobId;
}

export async function finishJob(
  db: AdminDb,
  jobId: string,
  args: {
    status: string;
    found?: number;
    newlyStored?: number;
    updated?: number;
    skipped?: number;
    errorCode?: string;
    errorMessage?: string;
    screenshotPath?: string;
  },
): Promise<void> {
  await db.transact(
    db.tx.reviewScrapeJobs[jobId].update({
      status: args.status,
      completedAt: new Date().toISOString(),
      reviewCountFound: args.found ?? null,
      newReviewsStored: args.newlyStored ?? null,
      existingReviewsUpdated: args.updated ?? null,
      existingReviewsSkipped: args.skipped ?? null,
      errorCode: args.errorCode ?? null,
      errorMessage: args.errorMessage ?? null,
      screenshotPath: args.screenshotPath ?? null,
      // Release the lock.
      lockedAt: null,
      lockExpiresAt: null,
    }),
  );
}
