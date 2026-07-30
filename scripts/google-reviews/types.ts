// Shared types for the self-hosted Google Maps review scraper.
// Step 1 scope: only the pieces needed for a one-restaurant, dry-run scrape.

export type ReviewSort = "newest" | "most_relevant" | "highest_rating" | "lowest_rating";

/**
 * A single public review parsed from the Google Maps reviews panel.
 * Optional fields are omitted (undefined) when not reliably available —
 * we never invent values.
 */
export type ScrapedGoogleReview = {
  source: "google_maps";
  /** Google's own review id (from the review card's data-review-id). */
  sourceReviewId?: string;
  restaurantId: string;
  googlePlaceId?: string;

  reviewerName?: string;
  reviewerProfileUrl?: string;
  reviewerLocalGuide?: boolean;
  reviewerReviewCount?: number;

  rating: number;
  text?: string;
  /** True when the visible text may still be truncated (expand failed). */
  textMaybeTruncated?: boolean;

  /**
   * Structured "review context" Google attaches to a review: e.g.
   * { "Meal type": "Dinner", "Price per person": "$20–30",
   *   "Noise level": "Moderate noise", "Food": "3", "Service": "4" }.
   * Empty/undefined when the review is a bare star rating with no details.
   */
  reviewContext?: Record<string, string>;

  publishedLabel?: string;
  /** Approximate ISO date derived from publishedLabel (e.g. "a week ago"). */
  publishedAt?: string;
  /** True whenever publishedAt was derived from a relative label. */
  publishedAtIsApproximate?: boolean;
  visitedDateLabel?: string;

  ownerResponseText?: string;
  ownerResponsePublishedLabel?: string;
  ownerResponsePublishedAt?: string;

  likesCount?: number;

  /**
   * Stable dedup key. Prefer source+sourceReviewId; when no sourceReviewId is
   * available this SHA-256 fingerprint (over normalized identity fields) is used.
   */
  fingerprint?: string;

  scrapedAt: string;
  scraperVersion: string;
};

/** Minimal shape of the restaurant record we read from InstantDB. */
export type SourceRestaurant = {
  id: string;
  name?: string;
  address?: string;
  placeId?: string;
  /** Existing stored Google Maps URL, if any (buffets.url). */
  url?: string;
  lat?: number;
  lng?: number;
  permanentlyClosed?: boolean;
};

/** Result of scraping one restaurant (step 1: in-memory only). */
export type RestaurantScrapeResult = {
  restaurantId: string;
  mapsUrl: string;
  listingName?: string;
  reviewsFound: number;
  duplicatesRemoved?: number;
  reviews: ScrapedGoogleReview[];
  sortApplied: ReviewSort | null;
  notes: string[];
};

/** Terminal outcome status for one restaurant's scrape. Mirrors job statuses. */
export type ScrapeStatus =
  | "completed"
  | "no_reviews"
  | "limited_view"
  | "blocked"
  | "review_panel_not_found"
  | "listing_not_found"
  | "skipped_missing_maps_identifier"
  | "navigation_timeout"
  | "parse_error";

/** Outcome of scraping one restaurant — no process side effects, no DB writes. */
export type ScrapeOutcome = {
  status: ScrapeStatus;
  /** Hard block (CAPTCHA/unusual traffic) → the batch runner stops the whole run. */
  hardBlock?: boolean;
  errorCode?: string;
  errorMessage?: string;
  screenshotPath?: string;
  listingName?: string;
  mapsUrl?: string;
  /** Normalized, deduped, trimmed reviews ready for storage. */
  reviews: ScrapedGoogleReview[];
  reviewsFoundRaw: number;
  duplicatesRemoved: number;
  sortApplied: ReviewSort | null;
  notes: string[];
};
