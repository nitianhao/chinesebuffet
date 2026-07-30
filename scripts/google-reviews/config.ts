// Typed configuration for the Google Maps review scraper.
// Precedence: CLI flags > environment variables > defaults.
// Step 1 only wires the subset of options needed for a one-restaurant dry run;
// the shape is intentionally forward-compatible with later batch options.

import path from "node:path";
import { ReviewSort } from "./types";

export const SCRAPER_VERSION = "0.1.0-step1";

export type ScraperConfig = {
  restaurantId: string | null;
  maxReviews: number;
  headless: boolean;
  sort: ReviewSort;
  dryRun: boolean;
  verbose: boolean;
  /** Max wall-clock time spent collecting reviews for one restaurant. */
  restaurantTimeoutMs: number;
  locale: string;
  timezone: string;
  /**
   * Persistent Chromium profile directory. Signing in once (via --login) stores
   * the Google session here so later runs reuse it — this is what gets past the
   * "limited view" that Google serves anonymous/automation clients. Git-ignored.
   */
  userDataDir: string;
  /** --login: open a visible browser so the user can sign in to Google BY HAND. */
  login: boolean;

  // ---- Batch selection (step 4) ----
  /** Restaurant cuisine to process in batch mode. */
  cuisine: string;
  /** Max restaurants to process/plan in one invocation (chunk size). null = all. */
  limitRestaurants: number | null;
  /** Skip buffets that already have >= this many stored reviews. null = no filter. */
  minReviews: number | null;
  /** Only process buffets whose placeId is a real Google place id (ChIJ…). */
  googlePlaceIdOnly: boolean;
  /** --snapshot-eligible=<file>: compute the eligible set once, write ids, exit. */
  snapshotEligible: string | null;
  /** --from-id-list=<file>: restrict selection to a cached eligible id set (fast). */
  fromIdList: string | null;
  /** A completed restaurant becomes eligible again after this many days. */
  refreshOlderThanDays: number;
  /** Max scrape attempts before a restaurant is set aside as needs-manual-review. */
  maxAttempts: number;
  /** --failed-only: only reprocess previously failed/skipped restaurants. */
  failedOnly: boolean;
  /** --plan: print the restaurants that WOULD be processed, then exit (no scraping). */
  plan: boolean;
  /** Random inter-restaurant delay bounds (ms). */
  delayMinMs: number;
  delayMaxMs: number;
};

const VALID_SORTS: ReviewSort[] = ["newest", "most_relevant", "highest_rating", "lowest_rating"];

/** Parse `--key=value` / `--flag` style args into a map. */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) {
      out[body] = "true";
    } else {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return out;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["false", "0", "no", "off"].includes(value.toLowerCase());
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toSort(value: string | undefined, fallback: ReviewSort): ReviewSort {
  if (value && (VALID_SORTS as string[]).includes(value)) return value as ReviewSort;
  return fallback;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): ScraperConfig {
  const args = parseArgs(argv);
  const env = process.env;

  const config: ScraperConfig = {
    restaurantId: args["restaurant-id"] ?? null,
    maxReviews: toInt(args["max-reviews"] ?? env.GOOGLE_REVIEWS_MAX_REVIEWS, 50),
    headless: toBool(args["headless"] ?? env.GOOGLE_REVIEWS_HEADLESS, true),
    sort: toSort(args["sort"], "newest"),
    dryRun: toBool(args["dry-run"], false),
    verbose: toBool(args["verbose"], false),
    restaurantTimeoutMs: toInt(env.GOOGLE_REVIEWS_RESTAURANT_TIMEOUT_MS, 120_000),
    locale: env.GOOGLE_REVIEWS_LOCALE || "en-US",
    timezone: env.GOOGLE_REVIEWS_TIMEZONE || "America/New_York",
    userDataDir:
      args["user-data-dir"] ||
      env.GOOGLE_REVIEWS_USER_DATA_DIR ||
      path.join(process.cwd(), ".runtime", "google-reviews", "profile"),
    login: toBool(args["login"], false),

    cuisine: args["cuisine"] || env.GOOGLE_REVIEWS_CUISINE || "indian",
    limitRestaurants:
      args["limit-restaurants"] !== undefined ? toInt(args["limit-restaurants"], 0) || null : null,
    minReviews:
      args["min-reviews"] !== undefined ? toInt(args["min-reviews"], 0) || null : null,
    googlePlaceIdOnly: toBool(args["google-place-id-only"], false),
    snapshotEligible: args["snapshot-eligible"] ?? null,
    fromIdList: args["from-id-list"] ?? null,
    refreshOlderThanDays: toInt(
      args["refresh-older-than-days"] ?? env.GOOGLE_REVIEWS_REFRESH_DAYS,
      90,
    ),
    maxAttempts: toInt(args["max-attempts"] ?? env.GOOGLE_REVIEWS_MAX_ATTEMPTS, 3),
    failedOnly: toBool(args["failed-only"], false),
    plan: toBool(args["plan"], false),
    delayMinMs: toInt(args["delay-min-ms"] ?? env.GOOGLE_REVIEWS_DELAY_MIN_MS, 4000),
    delayMaxMs: toInt(args["delay-max-ms"] ?? env.GOOGLE_REVIEWS_DELAY_MAX_MS, 9000),
  };

  return config;
}
