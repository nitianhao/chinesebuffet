// Normalization, relative-date parsing, and fingerprinting for scraped reviews.
// All functions here are PURE (no browser, no network) so they are unit-tested
// in review-normalizer.test.ts without touching live Google Maps.

import { createHash } from "node:crypto";
import { ScrapedGoogleReview } from "./types";

/**
 * Normalize DISPLAY text: NFC Unicode form, unix line endings, collapse runs of
 * spaces/tabs and excess blank lines, trim. Does NOT lowercase — stored text
 * keeps its original casing and punctuation.
 */
export function normalizeText(input?: string): string | undefined {
  if (input == null) return undefined;
  const out = input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n") // CRLF / CR -> LF
    .replace(/[ \t ]+/g, " ") // collapse horizontal whitespace (incl. nbsp)
    .replace(/ *\n */g, "\n") // trim spaces around newlines
    .replace(/\n{3,}/g, "\n\n") // collapse 3+ blank lines to one
    .trim();
  return out.length ? out : undefined;
}

/** Aggressive normalization used ONLY as fingerprint input (safe to lowercase). */
function fingerprintText(input?: string): string {
  if (!input) return "";
  return input
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const MS = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000, // approximate
  year: 365 * 24 * 60 * 60 * 1000, // approximate
} as const;

type Unit = keyof typeof MS;

export type ParsedRelativeDate = { iso: string; approximate: true };

/**
 * Parse a Google relative label ("a week ago", "3 months ago", "yesterday",
 * "Edited 2 days ago", "just now") into an APPROXIMATE ISO timestamp relative to
 * `nowIso`. Returns null for labels we cannot confidently interpret. The result
 * is always flagged approximate — relative labels are never exact.
 */
export function parseRelativeDate(label?: string, nowIso?: string): ParsedRelativeDate | null {
  if (!label) return null;
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  if (Number.isNaN(now)) return null;

  // Strip a leading "Edited " that Google prepends to modified reviews.
  const cleaned = label.trim().replace(/^edited\s+/i, "");

  if (/^(just now|a few seconds ago|moments ago)$/i.test(cleaned)) {
    return { iso: new Date(now).toISOString(), approximate: true };
  }
  if (/^yesterday$/i.test(cleaned)) {
    return { iso: new Date(now - MS.day).toISOString(), approximate: true };
  }

  // "a/an <unit> ago"  or  "<n> <unit>s ago"
  const m = cleaned.match(
    /^(a|an|\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i,
  );
  if (!m) return null;

  const qty = /^(a|an)$/i.test(m[1]) ? 1 : Number.parseInt(m[1], 10);
  const unit = m[2].toLowerCase() as Unit;
  if (!Number.isFinite(qty)) return null;

  return { iso: new Date(now - qty * MS[unit]).toISOString(), approximate: true };
}

/**
 * Deterministic SHA-256 fingerprint over normalized identity fields. Used only
 * when a sourceReviewId is unavailable. Lowercasing happens on the fingerprint
 * INPUT only — never on stored text.
 */
export function fingerprintReview(review: ScrapedGoogleReview): string {
  const parts = [
    review.restaurantId,
    (review.reviewerName || "").trim().toLowerCase(),
    String(review.rating),
    fingerprintText(review.text),
    (review.publishedLabel || "").trim().toLowerCase(),
  ];
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/**
 * Enrich one scraped review: normalize display text, derive approximate dates
 * from relative labels, and attach a fingerprint. Returns a new object.
 */
export function normalizeReview(review: ScrapedGoogleReview): ScrapedGoogleReview {
  const text = normalizeText(review.text);
  const ownerResponseText = normalizeText(review.ownerResponseText);

  const published = parseRelativeDate(review.publishedLabel, review.scrapedAt);
  const ownerPublished = parseRelativeDate(review.ownerResponsePublishedLabel, review.scrapedAt);

  const enriched: ScrapedGoogleReview = {
    ...review,
    text,
    ownerResponseText,
    publishedAt: published?.iso,
    publishedAtIsApproximate: published ? true : undefined,
    ownerResponsePublishedAt: ownerPublished?.iso,
  };
  enriched.fingerprint = fingerprintReview(enriched);
  return enriched;
}
