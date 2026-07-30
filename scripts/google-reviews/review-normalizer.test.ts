// Unit tests for the pure normalization / dedup logic. No browser, no network.
// Run: npx tsx --test scripts/google-reviews/review-normalizer.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeText,
  parseRelativeDate,
  fingerprintReview,
  normalizeReview,
} from "./review-normalizer";
import { dedupeReviews } from "./deduplication";
import { ScrapedGoogleReview } from "./types";

const NOW = "2026-07-18T12:00:00.000Z";

function makeReview(overrides: Partial<ScrapedGoogleReview> = {}): ScrapedGoogleReview {
  return {
    source: "google_maps",
    restaurantId: "rest-1",
    rating: 4,
    scrapedAt: NOW,
    scraperVersion: "test",
    ...overrides,
  };
}

test("normalizeText collapses whitespace and normalizes line endings, no lowercasing", () => {
  assert.equal(normalizeText("  Hello   World  "), "Hello World");
  assert.equal(normalizeText("a\r\nb\r\nc"), "a\nb\nc");
  assert.equal(normalizeText("line1\n\n\n\nline2"), "line1\n\nline2");
  assert.equal(normalizeText("MixedCase KEEPS Case"), "MixedCase KEEPS Case");
  assert.equal(normalizeText("   "), undefined);
  assert.equal(normalizeText(undefined), undefined);
});

test("parseRelativeDate handles singular, plural, yesterday, just now", () => {
  assert.equal(parseRelativeDate("a week ago", NOW)?.iso, "2026-07-11T12:00:00.000Z");
  assert.equal(parseRelativeDate("3 days ago", NOW)?.iso, "2026-07-15T12:00:00.000Z");
  assert.equal(parseRelativeDate("an hour ago", NOW)?.iso, "2026-07-18T11:00:00.000Z");
  assert.equal(parseRelativeDate("yesterday", NOW)?.iso, "2026-07-17T12:00:00.000Z");
  assert.equal(parseRelativeDate("just now", NOW)?.iso, NOW);
});

test("parseRelativeDate strips 'Edited' prefix and always flags approximate", () => {
  const r = parseRelativeDate("Edited 2 months ago", NOW);
  assert.equal(r?.approximate, true);
  assert.equal(r?.iso, "2026-05-19T12:00:00.000Z"); // 60 days back (30d months)
});

test("parseRelativeDate returns null for unknown labels", () => {
  assert.equal(parseRelativeDate("March 2024", NOW), null);
  assert.equal(parseRelativeDate("", NOW), null);
  assert.equal(parseRelativeDate(undefined, NOW), null);
});

test("fingerprintReview is deterministic and case/whitespace-insensitive on input", () => {
  const a = fingerprintReview(makeReview({ reviewerName: "Jane Doe", text: "Great  food!" }));
  const b = fingerprintReview(makeReview({ reviewerName: "jane doe", text: "great food!" }));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("fingerprintReview differs when identity fields differ", () => {
  const a = fingerprintReview(makeReview({ reviewerName: "Jane", rating: 5 }));
  const b = fingerprintReview(makeReview({ reviewerName: "Jane", rating: 1 }));
  assert.notEqual(a, b);
});

test("normalizeReview attaches approximate date and fingerprint", () => {
  const out = normalizeReview(
    makeReview({ publishedLabel: "a week ago", text: "  nice   place  " }),
  );
  assert.equal(out.text, "nice place");
  assert.equal(out.publishedAt, "2026-07-11T12:00:00.000Z");
  assert.equal(out.publishedAtIsApproximate, true);
  assert.match(out.fingerprint!, /^[0-9a-f]{64}$/);
});

test("dedupeReviews collapses by sourceReviewId, first wins", () => {
  const reviews = [
    makeReview({ sourceReviewId: "X", reviewerName: "A" }),
    makeReview({ sourceReviewId: "X", reviewerName: "A-dup" }),
    makeReview({ sourceReviewId: "Y", reviewerName: "B" }),
  ];
  const { unique, duplicatesRemoved } = dedupeReviews(reviews);
  assert.equal(unique.length, 2);
  assert.equal(duplicatesRemoved, 1);
  assert.equal(unique[0].reviewerName, "A");
});

test("dedupeReviews falls back to fingerprint when no sourceReviewId", () => {
  const r1 = normalizeReview(makeReview({ reviewerName: "Sam", text: "yum", publishedLabel: "a day ago" }));
  const r2 = normalizeReview(makeReview({ reviewerName: "Sam", text: "yum", publishedLabel: "a day ago" }));
  const { unique, duplicatesRemoved } = dedupeReviews([r1, r2]);
  assert.equal(unique.length, 1);
  assert.equal(duplicatesRemoved, 1);
});
