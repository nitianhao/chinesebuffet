// Shared per-restaurant scrape flow + the batch runner loop.
//
// scrapeOneRestaurant() does ONE listing end-to-end and returns a typed outcome
// with NO process.exit and NO DB writes — so both the single-restaurant CLI path
// and the batch loop reuse it. runBatch() iterates eligible restaurants with
// conservative pacing, hard-block stop / soft-block skip, lock via job row, and
// SIGINT-safe shutdown.

import fs from "node:fs";
import path from "node:path";
import { BrowserContext } from "playwright";
import { init } from "@instantdb/admin";

import { ScraperConfig, SCRAPER_VERSION } from "./config";
import { createSession, BrowserSession } from "./browser";
import {
  dismissConsent,
  detectBlockPage,
  detectLimitedView,
  getListingName,
  openReviewsPanel,
  collectReviews,
} from "./selectors";
import { normalizeReview } from "./review-normalizer";
import { dedupeReviews } from "./deduplication";
import { storeReviews, startJob, finishJob } from "./review-storage";
import { selectRestaurants, loadCandidateIds } from "./restaurant-source";
import { createLogger } from "./logger";
import { newRunSummary, recordRestaurant, finalizeAndWrite, RunSummaryState } from "./run-summary";
import { ScrapeOutcome, SourceRestaurant } from "./types";

type AdminDb = ReturnType<typeof init>;

// Context is recycled every N restaurants (fresh cookies/state, bounded memory).
const CONTEXT_RECYCLE_EVERY = 20;
// Longer breather after every N restaurants.
const BATCH_PAUSE_EVERY = 50;
const BATCH_PAUSE_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randBetween = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Resolve a Google Maps URL. Prefers an existing stored Maps URL; otherwise
 * builds a canonical place_id lookup URL (no broad text search).
 */
export function resolveMapsUrl(r: SourceRestaurant): string | null {
  const isMapsUrl = (u?: string) => !!u && /google\.[a-z.]+\/maps/i.test(u);
  if (isMapsUrl(r.url)) {
    const u = new URL(r.url!);
    if (!u.searchParams.has("hl")) u.searchParams.set("hl", "en");
    return u.toString();
  }
  if (r.placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(r.placeId)}&hl=en`;
  }
  return null;
}

/** Loose identity check: does the listing title resemble the stored name? */
export function identityMatches(stored?: string, listing?: string): boolean {
  if (!stored || !listing) return false;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(stored);
  const b = norm(listing);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0];
}

function screenshotDir(): string {
  const dir = path.join(process.cwd(), ".runtime", "google-reviews", "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Scrape a single restaurant end-to-end. Never throws for expected failures. */
export async function scrapeOneRestaurant(
  context: BrowserContext,
  config: ScraperConfig,
  restaurant: SourceRestaurant,
): Promise<ScrapeOutcome> {
  const base: ScrapeOutcome = {
    status: "completed",
    reviews: [],
    reviewsFoundRaw: 0,
    duplicatesRemoved: 0,
    sortApplied: null,
    notes: [],
  };

  const mapsUrl = resolveMapsUrl(restaurant);
  if (!mapsUrl) {
    return {
      ...base,
      status: "skipped_missing_maps_identifier",
      errorCode: "MISSING_MAPS_IDENTIFIER",
    };
  }
  base.mapsUrl = mapsUrl;

  const page = await context.newPage();
  const shot = async (code: string): Promise<string | undefined> => {
    try {
      const file = path.join(
        screenshotDir(),
        `${new Date().toISOString().slice(0, 10)}_${restaurant.id}_${code}.png`,
      );
      await page.screenshot({ path: file });
      return file;
    } catch {
      return undefined;
    }
  };

  try {
    try {
      await page.goto(mapsUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (err) {
      return {
        ...base,
        status: "navigation_timeout",
        errorCode: "NAVIGATION_TIMEOUT",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }

    await dismissConsent(page, config.verbose);

    const block = await detectBlockPage(page);
    if (block) {
      return {
        ...base,
        status: "blocked",
        hardBlock: true,
        errorCode: block,
        screenshotPath: await shot(block),
      };
    }

    const listingName = await getListingName(page);
    base.listingName = listingName;

    if (await detectLimitedView(page)) {
      return {
        ...base,
        status: "limited_view",
        errorCode: "LIMITED_VIEW",
        screenshotPath: await shot("LIMITED_VIEW"),
      };
    }

    if (!identityMatches(restaurant.name, listingName)) {
      base.notes.push(`identity uncertain: stored "${restaurant.name}" vs listing "${listingName}"`);
    }

    const opened = await openReviewsPanel(page, config.verbose);
    if (!opened) {
      return {
        ...base,
        status: "review_panel_not_found",
        errorCode: "REVIEW_PANEL_NOT_FOUND",
        screenshotPath: await shot("REVIEW_PANEL_NOT_FOUND"),
      };
    }

    const { reviews, sortApplied, notes } = await collectReviews(page, config, restaurant);
    const normalized = reviews.map(normalizeReview);
    const { unique, duplicatesRemoved } = dedupeReviews(normalized);
    const trimmed = unique.slice(0, config.maxReviews);

    return {
      ...base,
      status: trimmed.length ? "completed" : "no_reviews",
      reviews: trimmed,
      reviewsFoundRaw: reviews.length,
      duplicatesRemoved,
      sortApplied,
      notes: [...base.notes, ...notes],
    };
  } catch (err) {
    return {
      ...base,
      status: "parse_error",
      errorCode: "PARSER_ERROR",
      errorMessage: err instanceof Error ? err.message : String(err),
      screenshotPath: await shot("PARSER_ERROR"),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export type BatchResult = {
  summary: RunSummaryState;
  reportJsonPath: string;
  reportMdPath: string;
  logPath: string;
};

/** Iterate eligible restaurants with conservative pacing, job tracking, logs. */
export async function runBatch(db: AdminDb, config: ScraperConfig): Promise<BatchResult> {
  const { eligible, counts } = await selectRestaurants(db, {
    cuisine: config.cuisine,
    refreshOlderThanDays: config.refreshOlderThanDays,
    maxAttempts: config.maxAttempts,
    failedOnly: config.failedOnly,
    limit: config.limitRestaurants,
    minReviews: config.minReviews,
    googlePlaceIdOnly: config.googlePlaceIdOnly,
    candidateIds: config.fromIdList ? loadCandidateIds(config.fromIdList) : null,
  });

  const runId = `${config.cuisine}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const logger = createLogger(runId);
  const summary = newRunSummary(
    runId,
    config.cuisine,
    {
      maxReviews: config.maxReviews,
      delayMinMs: config.delayMinMs,
      delayMaxMs: config.delayMaxMs,
      limitRestaurants: config.limitRestaurants,
      refreshOlderThanDays: config.refreshOlderThanDays,
      maxAttempts: config.maxAttempts,
    },
    eligible.length,
  );
  logger.log({ event: "run.start", runId, cuisine: config.cuisine, eligible: eligible.length, counts });

  console.log(
    `\n=== Batch run ${runId} ===\n` +
      `Eligible: ${eligible.length} (never ${counts.never}, refresh ${counts.refresh}, retry ${counts.retry})\n` +
      `Pacing: delay ${config.delayMinMs}-${config.delayMaxMs}ms, pause every ${BATCH_PAUSE_EVERY}, ` +
      `context recycle every ${CONTEXT_RECYCLE_EVERY}\n` +
      `Log: ${logger.logPath}\n`,
  );

  if (eligible.length) {
    const workerId = `local-${process.pid}`;
    let session: BrowserSession = await createSession(config);
    let sinceRecycle = 0;

    // SIGINT/SIGTERM: stop accepting new restaurants; second signal force-exits.
    let stopRequested = false;
    let sigCount = 0;
    const onSignal = () => {
      sigCount += 1;
      if (sigCount >= 2) {
        console.error("\nForce exit.");
        process.exit(130);
      }
      stopRequested = true;
      console.log("\n⏹ Stop requested — finishing current restaurant, then exiting cleanly...");
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
      for (let i = 0; i < eligible.length; i++) {
        if (stopRequested) {
          summary.stoppedEarly = true;
          break;
        }
        const r = eligible[i];
        const label = `[${i + 1}/${eligible.length}] ${r.name}`;
        const t0 = Date.now();

        const jobId = await startJob(db, {
          buffetId: r.id,
          placeId: r.placeId,
          workerId,
          scraperVersion: SCRAPER_VERSION,
        });

        const outcome = await scrapeOneRestaurant(session.context, config, r);
        let newReviews = 0;
        let existingUnchanged = 0;
        let finalStatus: string = outcome.status;

        if (outcome.status === "completed") {
          try {
            const store = await storeReviews(db, r.id, outcome.reviews);
            await finishJob(db, jobId, {
              status: "completed",
              found: store.found,
              newlyStored: store.newlyStored,
              updated: store.updated,
              skipped: store.skippedExisting,
            });
            newReviews = store.newlyStored;
            existingUnchanged = store.skippedExisting;
            summary.counts.completed += 1;
            summary.reviews.existingEnriched += store.updated;
            console.log(
              `${label}: completed, +${store.newlyStored} new / ${store.skippedExisting} existing ` +
                `(${((Date.now() - t0) / 1000).toFixed(1)}s)`,
            );
          } catch (err) {
            finalStatus = "database_error";
            summary.counts.dbErrors += 1;
            await finishJob(db, jobId, {
              status: "database_error",
              errorCode: "DATABASE_WRITE_ERROR",
              errorMessage: err instanceof Error ? err.message : String(err),
            }).catch(() => {});
            console.error(`${label}: DB write error — ${err instanceof Error ? err.message : err}`);
          }
        } else {
          await finishJob(db, jobId, {
            status: outcome.status,
            errorCode: outcome.errorCode,
            errorMessage: outcome.errorMessage,
            screenshotPath: outcome.screenshotPath,
          });
          if (outcome.status === "no_reviews") summary.counts.noReviews += 1;
          else if (outcome.hardBlock) summary.counts.blocked += 1;
          else summary.counts.skipped += 1;
          console.log(`${label}: ${outcome.status}${outcome.errorCode ? ` (${outcome.errorCode})` : ""}`);
        }

        const durationMs = Date.now() - t0;
        recordRestaurant(summary, {
          id: r.id,
          name: r.name,
          status: finalStatus,
          newReviews,
          existingUnchanged,
          durationMs,
          errorCode: outcome.errorCode,
        });
        logger.log({
          event: "restaurant",
          index: i + 1,
          id: r.id,
          name: r.name,
          status: finalStatus,
          newReviews,
          durationMs,
          errorCode: outcome.errorCode,
          screenshotPath: outcome.screenshotPath,
        });

        // Hard block → stop the whole run to protect the account.
        if (outcome.hardBlock) {
          console.error(`\n✋ Hard block (${outcome.errorCode}) — stopping run. Checkpoint preserved.`);
          summary.stoppedEarly = true;
          logger.log({ event: "run.hardblock", errorCode: outcome.errorCode });
          break;
        }

        // Recycle the context periodically.
        sinceRecycle += 1;
        if (sinceRecycle >= CONTEXT_RECYCLE_EVERY && i + 1 < eligible.length) {
          await session.close();
          session = await createSession(config);
          sinceRecycle = 0;
        }

        const isLast = i + 1 >= eligible.length;
        if (!isLast && !stopRequested) {
          if ((i + 1) % BATCH_PAUSE_EVERY === 0) {
            console.log(`   …batch pause ${(BATCH_PAUSE_MS / 1000).toFixed(0)}s`);
            await sleep(BATCH_PAUSE_MS);
          }
          await sleep(randBetween(config.delayMinMs, config.delayMaxMs));
        }
      }
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      await session.close().catch(() => {});
    }
  }

  const { jsonPath, mdPath } = finalizeAndWrite(summary);
  logger.log({ event: "run.end", summary: summary.counts, reviews: summary.reviews });
  logger.close();
  return { summary, reportJsonPath: jsonPath, reportMdPath: mdPath, logPath: logger.logPath };
}
