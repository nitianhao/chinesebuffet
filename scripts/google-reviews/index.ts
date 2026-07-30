// CLI entry point for the self-hosted Google Maps review scraper.
//
// Modes (mutually exclusive, checked in this order):
//   --login                 open a visible browser to sign in to Google BY HAND
//   --plan                  preview which restaurants batch mode would process
//   --restaurant-id=<id>    scrape one restaurant (add --dry-run to skip writes)
//   (none of the above)     BATCH mode: process the eligible set with pacing
//
// Requires .env.local with INSTANT_ADMIN_TOKEN.

import path from "node:path";
import dotenv from "dotenv";
import { init } from "@instantdb/admin";

import { loadConfig, ScraperConfig, SCRAPER_VERSION } from "./config";
import { createSession } from "./browser";
import { storeReviews, startJob, finishJob } from "./review-storage";
import { selectRestaurants, writeEligibleSnapshot, loadCandidateIds } from "./restaurant-source";
import { scrapeOneRestaurant, runBatch } from "./scrape-runner";
import { SourceRestaurant } from "./types";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Matches the fallback app id used by the repo's existing DB scripts
// (see scripts/import-apify-reviews.js). NEXT_PUBLIC_INSTANT_APP_ID lives in
// .env, not .env.local, so we fall back to the known project app id.
const DEFAULT_INSTANT_APP_ID = "709e0e09-3347-419b-8daa-bad6889e480d";

let dbInstance: ReturnType<typeof init> | null = null;
function getDb() {
  if (dbInstance) return dbInstance;
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || DEFAULT_INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error("Missing INSTANT_ADMIN_TOKEN in environment (.env.local).");
  }
  dbInstance = init({ appId, adminToken });
  return dbInstance;
}

async function fetchRestaurant(id: string): Promise<SourceRestaurant | null> {
  const db = getDb();
  const res = await db.query({ buffets: { $: { where: { id } } } });
  // db is initialized without a schema generic, so rows are loosely typed.
  const b = res.buffets?.[0] as Record<string, any> | undefined;
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    placeId: b.placeId ?? undefined,
    url: b.url ?? undefined,
    lat: b.lat,
    lng: b.lng,
    permanentlyClosed: b.permanentlyClosed,
  };
}

/**
 * Manual sign-in flow. Opens a VISIBLE browser and waits for the user to sign
 * in to Google themselves. We never type or handle credentials — login
 * automation is intentionally not implemented. The persistent profile captures
 * the resulting session for reuse.
 */
async function runLogin(config: ScraperConfig): Promise<void> {
  console.log("\nOpening a visible browser for manual Google sign-in.");
  console.log("→ Sign in with YOUR OWN credentials in that window.");
  console.log("  (This script never sees or types your password.)");
  console.log(`  Session will be saved to: ${config.userDataDir}\n`);

  const session = await createSession(config, /* headlessOverride */ false);
  try {
    const page = await session.context.newPage();
    await page.goto("https://accounts.google.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    console.log("Waiting up to 15 minutes for sign-in to complete...");
    const deadline = Date.now() + 900_000;
    let signedIn = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(3000);
      const url = page.url();
      const avatar = await page
        .getByRole("button", { name: /google account|account:/i })
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (/myaccount\.google\.com/.test(url) || avatar) {
        signedIn = true;
        break;
      }
    }

    if (signedIn) {
      console.log(`\n✓ Signed-in session detected and saved to ${config.userDataDir}`);
      console.log("  You can now run a scrape; it will reuse this session.");
    } else {
      console.log(
        "\nDid not auto-detect sign-in. If you completed it, the session is still saved.\n" +
          "The browser will now close.",
      );
    }
    await page.waitForTimeout(1500);
  } finally {
    await session.close();
  }
}

/**
 * --plan: show which restaurants the batch runner WOULD process (no scraping).
 * Validates selection/eligibility before we wire the loop in the next step.
 */
async function runPlan(config: ScraperConfig): Promise<void> {
  const db = getDb();
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

  console.log(
    `\n=== Selection plan (cuisine=${config.cuisine}${config.failedOnly ? ", failed-only" : ""}` +
      `${config.minReviews != null ? `, min-reviews=${config.minReviews}` : ""}` +
      `${config.googlePlaceIdOnly ? ", google-place-id-only" : ""}) ===`,
  );
  console.log(`Open restaurants with placeId: ${counts.totalWithPlaceId}`);
  console.log(`  never scraped:    ${counts.never}`);
  console.log(`  due for refresh:  ${counts.refresh}  (>${config.refreshOlderThanDays}d)`);
  console.log(`  retryable:        ${counts.retry}  (attempts < ${config.maxAttempts})`);
  console.log(
    `  skipped -> completed:${counts.skippedCompleted} permanent:${counts.skippedPermanent} ` +
      `maxedOut:${counts.skippedMaxedOut} locked:${counts.skippedLocked} missingId:${counts.skippedMissingId} ` +
      `enoughReviews:${counts.skippedEnoughReviews}`,
  );

  const shown = Math.min(eligible.length, 25);
  console.log(
    `\nWould process ${eligible.length} restaurant(s)` +
      `${config.limitRestaurants ? ` (limited to ${config.limitRestaurants})` : ""}. First ${shown}:`,
  );
  eligible.slice(0, shown).forEach((r, i) => {
    const last = r.jobStatus ? `, last ${r.jobStatus}` : "";
    console.log(
      `  ${String(i + 1).padStart(3)}. [${r.category}] ${r.name} — ${r.cityName ?? "?"} ` +
        `(attempts ${r.attemptCount}${last})  ${r.id}`,
    );
  });
}

/** Scrape one restaurant by --restaurant-id (reuses the shared runner). */
async function runSingle(config: ScraperConfig): Promise<void> {
  const restaurant = await fetchRestaurant(config.restaurantId!);
  if (!restaurant) {
    console.error(`No buffet found with id ${config.restaurantId}. Aborting.`);
    process.exit(1);
  }
  if (restaurant.permanentlyClosed) {
    console.warn("⚠ Restaurant is marked permanentlyClosed — continuing anyway.");
  }

  console.log(`\nGoogle reviews scraper — restaurant ${restaurant.name} (${restaurant.id})`);
  console.log(
    `  headless=${config.headless} maxReviews=${config.maxReviews} sort=${config.sort} dryRun=${config.dryRun}\n`,
  );

  const session = await createSession(config);
  let outcome;
  try {
    outcome = await scrapeOneRestaurant(session.context, config, restaurant);
  } finally {
    await session.close();
  }

  // Report.
  console.log(`\n=== ${config.dryRun ? "Dry-run" : "Scrape"} result ===`);
  console.log(`Listing:                  ${outcome.listingName ?? "(not found)"}`);
  console.log(`Status:                   ${outcome.status}${outcome.errorCode ? ` (${outcome.errorCode})` : ""}`);
  console.log(`With content (pre-dedupe): ${outcome.reviewsFoundRaw}`);
  console.log(`Unique after dedupe:      ${outcome.reviews.length}`);
  console.log(`Duplicates removed:       ${outcome.duplicatesRemoved}`);
  console.log(`Sort applied:             ${outcome.sortApplied ?? "NONE (recorded)"}`);
  if (outcome.notes.length) console.log(`Notes:                    ${outcome.notes.join("; ")}`);
  if (outcome.screenshotPath) console.log(`Screenshot:               ${outcome.screenshotPath}`);
  console.log(`\nSample (up to 3):`);
  for (const r of outcome.reviews.slice(0, 3)) {
    console.log(
      JSON.stringify(
        {
          sourceReviewId: r.sourceReviewId,
          fingerprint: r.fingerprint?.slice(0, 12),
          reviewerName: r.reviewerName,
          rating: r.rating,
          publishedLabel: r.publishedLabel,
          publishedAt: r.publishedAt,
          text: r.text ? r.text.slice(0, 140) + (r.text.length > 140 ? "…" : "") : undefined,
          reviewContext: r.reviewContext,
          ownerResponse: r.ownerResponseText ? "(present)" : undefined,
        },
        null,
        2,
      ),
    );
  }

  if (config.dryRun) {
    console.log(`\nDone (dry-run — no database writes).`);
    return;
  }

  // Persist + job record.
  const db = getDb();
  const jobId = await startJob(db, {
    buffetId: restaurant.id,
    placeId: restaurant.placeId,
    workerId: `local-${process.pid}`,
    scraperVersion: SCRAPER_VERSION,
  });
  try {
    if (outcome.status === "completed") {
      const store = await storeReviews(db, restaurant.id, outcome.reviews);
      await finishJob(db, jobId, {
        status: "completed",
        found: store.found,
        newlyStored: store.newlyStored,
        updated: store.updated,
        skipped: store.skippedExisting,
      });
      console.log(`\n=== Stored to InstantDB ===`);
      console.log(`New reviews inserted:  ${store.newlyStored}`);
      console.log(`Existing enriched:     ${store.updated}`);
      console.log(`Existing unchanged:    ${store.skippedExisting}`);
    } else {
      await finishJob(db, jobId, {
        status: outcome.status,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        screenshotPath: outcome.screenshotPath,
      });
      console.log(`\nRecorded job status: ${outcome.status} (no reviews stored).`);
    }
    console.log(`Scrape job id:         ${jobId}`);
  } catch (err) {
    await finishJob(db, jobId, {
      status: "database_error",
      errorCode: "DATABASE_WRITE_ERROR",
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    throw err;
  }
  console.log(`\nDone.`);
}

/** Batch mode: process the eligible set with pacing + job tracking. */
async function runBatchCli(config: ScraperConfig): Promise<void> {
  if (config.dryRun) {
    console.log("Batch mode does not support --dry-run; use --plan to preview. Aborting.");
    process.exit(1);
  }
  const db = getDb();
  const { summary: s, reportJsonPath, reportMdPath, logPath } = await runBatch(db, config);
  console.log(`\n=== Batch summary ===`);
  console.log(`Attempted:        ${s.counts.attempted}`);
  console.log(`Completed:        ${s.counts.completed}`);
  console.log(`No reviews:       ${s.counts.noReviews}`);
  console.log(`Skipped (soft):   ${s.counts.skipped}`);
  console.log(`Blocked (hard):   ${s.counts.blocked}`);
  console.log(`DB errors:        ${s.counts.dbErrors}`);
  console.log(`New reviews:      ${s.reviews.newInserted}`);
  console.log(`Existing enriched:${s.reviews.existingEnriched}`);
  console.log(`By status:        ${JSON.stringify(s.byStatus)}`);
  if (Object.keys(s.errorsByCode).length) {
    console.log(`Errors by code:   ${JSON.stringify(s.errorsByCode)}`);
  }
  if (s.stoppedEarly) console.log(`⚠ Run stopped early (block or interrupt) — rerun to resume.`);
  console.log(`\nReports:  ${reportMdPath}\n          ${reportJsonPath}`);
  console.log(`Log:      ${logPath}`);
}

/**
 * --snapshot-eligible=<file>: run the full (slow) selection once and cache the
 * eligible id set to disk. Batch runs then use --from-id-list to skip the query.
 */
async function runSnapshot(config: ScraperConfig): Promise<void> {
  const db = getDb();
  console.log(`Computing eligible set (cuisine=${config.cuisine})… this runs the full query once.`);
  const { eligible, counts } = await selectRestaurants(db, {
    cuisine: config.cuisine,
    refreshOlderThanDays: config.refreshOlderThanDays,
    maxAttempts: config.maxAttempts,
    failedOnly: config.failedOnly,
    limit: null, // capture the ENTIRE eligible set
    minReviews: config.minReviews,
    googlePlaceIdOnly: config.googlePlaceIdOnly,
  });
  writeEligibleSnapshot(config.snapshotEligible!, config.cuisine, eligible.map((r) => r.id));
  console.log(`Wrote ${eligible.length} eligible ids to ${config.snapshotEligible}`);
  console.log(`  (never ${counts.never}, retry ${counts.retry}, enoughReviews ${counts.skippedEnoughReviews})`);
}

async function main() {
  const config = loadConfig();

  if (config.login) return runLogin(config);
  if (config.snapshotEligible) return runSnapshot(config);
  if (config.plan) return runPlan(config);
  if (config.restaurantId) return runSingle(config);
  return runBatchCli(config);
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err);
  process.exit(1);
});
