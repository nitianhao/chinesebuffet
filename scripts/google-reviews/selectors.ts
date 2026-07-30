// Centralized Google Maps DOM interaction + selectors.
//
// Google Maps markup changes often and uses generated class names, so every
// lookup here uses a LAYERED strategy and is kept in this one file:
//   1. ARIA role / accessible name
//   2. stable-ish attribute (data-review-id, jsaction)
//   3. visible text
//   4. narrowly-scoped class fallback (last resort, commented)
//
// Extraction of review cards is done inside a single page.evaluate so that all
// per-card fallbacks run in the browser against the live DOM.

import { Page, Locator, JSHandle } from "playwright";
import { ScraperConfig } from "./config";
import { ReviewSort, ScrapedGoogleReview, SourceRestaurant } from "./types";
import { SCRAPER_VERSION } from "./config";

const log = (verbose: boolean, ...args: unknown[]) => {
  if (verbose) console.log("   ·", ...args);
};

// ---------------------------------------------------------------------------
// Consent / block detection
// ---------------------------------------------------------------------------

/**
 * Dismiss Google's cookie/consent wall if present. Prefers the privacy-
 * preserving "Reject all"; falls back to "Accept all" only if reject is
 * unavailable (some maps variants only render accept). Returns true if a
 * dialog was handled.
 */
export async function dismissConsent(page: Page, verbose = false): Promise<boolean> {
  const candidates: Locator[] = [
    page.getByRole("button", { name: /reject all/i }),
    page.getByRole("button", { name: /reject the use of cookies/i }),
    page.getByRole("button", { name: /accept all/i }),
    // Fallback: consent.google.com renders form buttons with these aria labels.
    page.locator('button[aria-label*="Reject" i]'),
    page.locator('button[aria-label*="Accept" i]'),
  ];
  for (const c of candidates) {
    try {
      const btn = c.first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click({ timeout: 3000 });
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        log(verbose, "consent dialog handled");
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}

/** Codes for pages that must halt/skip rather than be parsed. */
export type BlockCode = "CAPTCHA_DETECTED" | "CONSENT_BLOCKED" | "LIMITED_VIEW" | null;

/** Detect a captcha / "unusual traffic" wall. */
export async function detectBlockPage(page: Page): Promise<BlockCode> {
  const url = page.url();
  if (/\/sorry\/|ipv4\.google|unusual traffic/i.test(url)) return "CAPTCHA_DETECTED";
  const hasRecaptcha = await page
    .locator('iframe[src*="recaptcha"], form#captcha-form')
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (hasRecaptcha) return "CAPTCHA_DETECTED";
  return null;
}

/**
 * Detect Google's "limited view" listing. When Maps flags the client as
 * automation / not-signed-in it can serve a reduced listing with NO reviews
 * section at all. We must report this (skip) rather than record "0 reviews",
 * because the reviews exist — Google just didn't send them to this client.
 */
export async function detectLimitedView(page: Page): Promise<boolean> {
  return page
    .getByText(/limited view of google maps/i)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
}

// ---------------------------------------------------------------------------
// Listing identity
// ---------------------------------------------------------------------------

/** The listing's visible H1 title, used to verify we opened the right place. */
export async function getListingName(page: Page): Promise<string | undefined> {
  const h1 = page.locator('h1[class*="fontHeadlineLarge"], h1').first();
  try {
    const t = (await h1.textContent({ timeout: 5000 }))?.trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Reviews panel
// ---------------------------------------------------------------------------

/** Click into the Reviews tab/section and wait for review cards to appear. */
export async function openReviewsPanel(page: Page, verbose = false): Promise<boolean> {
  // Order matters. Note "Write a review" and the legal-disclosure link also
  // contain the word "review" — we must NOT click those, so the loose fallback
  // is a review-COUNT pattern ("1,234 reviews"), never a bare *review* match.
  // NOTE: only validated against a "limited view" listing so far; the full-
  // listing trigger needs live confirmation on a signed-in / residential run.
  const candidates: Locator[] = [
    page.getByRole("tab", { name: /^reviews$/i }),
    page.getByRole("tab", { name: /reviews for/i }),
    page.getByRole("button", { name: /reviews for/i }),
    // Review-count button, e.g. aria-label "1,234 reviews".
    page.locator('button[aria-label]').filter({ hasText: /^\s*[\d,.]+\s+reviews?\s*$/i }),
    page.locator('button[aria-label*="review" i]').filter({ hasNotText: /write|legal|disclosure/i }),
  ];
  for (const c of candidates) {
    try {
      const btn = c.first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ timeout: 4000 });
        break;
      }
    } catch {
      // try next
    }
  }
  // Confirm the feed rendered.
  try {
    await page.locator("[data-review-id]").first().waitFor({ state: "visible", timeout: 10_000 });
    log(verbose, "reviews panel open");
    return true;
  } catch {
    return false;
  }
}

const SORT_LABELS: Record<ReviewSort, RegExp> = {
  most_relevant: /most relevant/i,
  newest: /newest/i,
  highest_rating: /highest rating/i,
  lowest_rating: /lowest rating/i,
};

/**
 * Change review sort order. Returns true only if we actually applied it, so the
 * caller can record when sorting silently failed (never claim newest falsely).
 */
export async function setSort(page: Page, sort: ReviewSort, verbose = false): Promise<boolean> {
  const sortButton = page
    .locator(
      'button[aria-label*="Sort" i], button[data-value="Sort"], button[jsaction*="sort" i]',
    )
    .first();
  try {
    if (!(await sortButton.isVisible({ timeout: 3000 }))) return false;
    await sortButton.click({ timeout: 3000 });
  } catch {
    return false;
  }
  const option = page.getByRole("menuitemradio", { name: SORT_LABELS[sort] }).first();
  try {
    await option.waitFor({ state: "visible", timeout: 3000 });
    await option.click({ timeout: 3000 });
    // Let the feed reload under the new order.
    await page.waitForTimeout(1500);
    log(verbose, `sort applied: ${sort}`);
    return true;
  } catch {
    // Close the menu if it is stuck open.
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}

/** Find the scrollable ancestor that contains the review cards. */
async function getFeedHandle(page: Page): Promise<JSHandle<Element> | null> {
  const first = await page.$("[data-review-id]");
  if (!first) return null;
  const handle = await page.evaluateHandle((el) => {
    let node: Element | null = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement as Element;
  }, first);
  return handle as JSHandle<Element>;
}

/**
 * Scroll the review feed until enough unique reviews are loaded, no new ones
 * appear, or a time budget is exhausted. Bounded — never an infinite loop.
 */
async function scrollFeed(
  page: Page,
  maxReviews: number,
  deadline: number,
  verbose = false,
): Promise<void> {
  const feed = await getFeedHandle(page);
  if (!feed) return;
  let stagnant = 0;
  let lastCount = 0;
  while (stagnant < 5 && Date.now() < deadline) {
    // Count UNIQUE review ids: Google renders each card ~twice in the DOM, so a
    // raw node count would stop scrolling at half the requested reviews.
    const count = await page.evaluate(
      () =>
        new Set(
          Array.from(document.querySelectorAll("[data-review-id]")).map((e) =>
            e.getAttribute("data-review-id"),
          ),
        ).size,
    );
    if (count >= maxReviews) break;
    if (count === lastCount) stagnant += 1;
    else stagnant = 0;
    lastCount = count;

    await feed.evaluate((el) => {
      (el as Element).scrollTop = (el as Element).scrollHeight;
    });
    await page.waitForTimeout(900);
  }
  await feed.dispose();
  log(verbose, `scroll finished, unique reviews loaded: ${lastCount}`);
}

/** Expand truncated review text by clicking each card's "More" button. */
async function expandTruncatedText(page: Page): Promise<void> {
  // "See more" buttons scoped to review cards. aria-label is localized-safe via
  // our forced en-US, but we also match the legacy class as a fallback.
  const moreButtons = page.locator(
    '[data-review-id] button[aria-label*="See more" i], [data-review-id] button.w8nwRe',
  );
  const n = await moreButtons.count();
  for (let i = 0; i < n; i++) {
    await moreButtons
      .nth(i)
      .click({ timeout: 1000 })
      .catch(() => {});
  }
}

/**
 * Extract every currently-rendered review card into plain objects. All per-card
 * fallback selectors run here, inside the page.
 */
async function extractCards(page: Page): Promise<Array<Record<string, unknown>>> {
  // IMPORTANT: the function passed to $$eval is serialized and runs in the
  // browser. Do NOT define nested NAMED helpers here (e.g. `const textOf = ...`):
  // tsx/esbuild's keepNames wraps them in a `__name(...)` call whose helper is
  // module-scoped and never shipped to the page, causing "__name is not defined".
  // We therefore inline all fallbacks using anonymous array-method callbacks.
  // Each fallback is a single comma-separated querySelector (matches the first
  // element in DOM order satisfying ANY selector) so there are NO nested named
  // functions to trip esbuild's __name helper.
  return page.$$eval("[data-review-id]", (cards) =>
    cards.map((card) => {
      const sourceReviewId = card.getAttribute("data-review-id") || undefined;
      const reviewerName =
        card.querySelector('.d4r55, div[class*="d4r55"]')?.textContent?.trim() || undefined;
      const profileEl = card.querySelector('a[href*="/maps/contrib/"], button[data-href]');
      const reviewerProfileUrl =
        profileEl?.getAttribute("href") || profileEl?.getAttribute("data-href") || undefined;
      const meta =
        card.querySelector('.RfnDt, div[class*="RfnDt"]')?.textContent?.trim() || undefined;
      const reviewerLocalGuide = meta ? /local guide/i.test(meta) : undefined;
      const countMatch = meta?.match(/([\d,]+)\s+review/i);
      const reviewerReviewCount = countMatch
        ? Number.parseInt(countMatch[1].replace(/,/g, ""), 10)
        : undefined;

      // Rating: aria-label "5 stars", else newer "5/5" text.
      const starLabel = card
        .querySelector('[role="img"][aria-label*="star" i]')
        ?.getAttribute("aria-label");
      const fracText = card.querySelector('[class*="fzvQIb"]')?.textContent || "";
      const ratingMatch = (starLabel || fracText).match(/([0-5](?:\.\d)?)/);
      const rating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : undefined;

      const text =
        card.querySelector('.wiI7pd, span[class*="wiI7pd"]')?.textContent?.trim() || undefined;
      const publishedLabel =
        card.querySelector('.rsqaWe, span[class*="rsqaWe"], .xRkPPb')?.textContent?.trim() ||
        undefined;

      // Owner response block.
      const ownerBlock = card.querySelector('[class*="CDe7pd"]');
      const ownerResponseText =
        ownerBlock?.querySelector('[class*="wiI7pd"]')?.textContent?.trim() || undefined;
      const ownerResponsePublishedLabel =
        ownerBlock?.querySelector('[class*="DZSIDd"]')?.textContent?.trim() || undefined;

      const likesText = card.querySelector('[class*="pkWtMe"]')?.textContent?.trim() || undefined;
      const likesCount = likesText ? Number.parseInt(likesText.replace(/\D/g, ""), 10) : undefined;

      // Structured "review context": each item is a div.PBK6be with a bold key
      // span (Meal type / Price per person / Noise level / Food / Service ...)
      // and a value span. Capture every key/value pair generically.
      const reviewContext: Record<string, string> = {};
      card.querySelectorAll('.PBK6be, div[class*="PBK6be"]').forEach((block) => {
        const key = block
          .querySelector('span[style*="font-weight: bold"]')
          ?.textContent?.trim();
        if (!key) return;
        let value: string | undefined;
        const rfBlocks = Array.from(block.querySelectorAll(".RfDO5c"));
        for (const rf of rfBlocks) {
          if (rf.querySelector('span[style*="font-weight: bold"]')) continue; // key block
          const v = rf.querySelector("span")?.textContent?.trim() || rf.textContent?.trim();
          if (v) {
            value = v;
            break;
          }
        }
        if (value) reviewContext[key] = value;
      });

      return {
        sourceReviewId,
        reviewerName,
        reviewerProfileUrl,
        reviewerLocalGuide,
        reviewerReviewCount,
        rating,
        text,
        publishedLabel,
        ownerResponseText,
        ownerResponsePublishedLabel,
        likesCount: Number.isFinite(likesCount) ? likesCount : undefined,
        reviewContext: Object.keys(reviewContext).length ? reviewContext : undefined,
      };
    }),
  );
}

/**
 * Full collection flow for one open listing: sort, scroll, expand, extract,
 * and map to ScrapedGoogleReview. Caller must have already opened the panel.
 */
export async function collectReviews(
  page: Page,
  config: ScraperConfig,
  restaurant: SourceRestaurant,
): Promise<{ reviews: ScrapedGoogleReview[]; sortApplied: ReviewSort | null; notes: string[] }> {
  const notes: string[] = [];
  const deadline = Date.now() + config.restaurantTimeoutMs;

  const sorted = await setSort(page, config.sort, config.verbose);
  if (!sorted) notes.push(`sort "${config.sort}" could not be applied`);

  await scrollFeed(page, config.maxReviews, deadline, config.verbose);
  await expandTruncatedText(page);

  const raw = await extractCards(page);
  const scrapedAt = new Date().toISOString();

  const hasStructured = (ctx: unknown): ctx is Record<string, string> =>
    !!ctx && typeof ctx === "object" && Object.keys(ctx as object).length > 0;
  const hasContent = (r: Record<string, unknown>): boolean =>
    (typeof r.text === "string" && r.text.trim().length > 0) || hasStructured(r.reviewContext);

  const withRating = raw.filter((r) => typeof r.rating === "number");
  // Per requirement: keep only reviews with a written note OR structured data.
  // Bare star-only ratings (no text, no context) are dropped.
  const kept = withRating.filter(hasContent);
  const droppedNoContent = withRating.length - kept.length;
  if (droppedNoContent > 0) notes.push(`dropped ${droppedNoContent} rating-only review(s)`);

  // NOTE: no slice here — Google duplicates cards in the DOM, so the caller
  // dedupes first and then trims to maxReviews unique reviews.
  const reviews: ScrapedGoogleReview[] = kept.map((r) => ({
    source: "google_maps" as const,
    sourceReviewId: r.sourceReviewId as string | undefined,
    restaurantId: restaurant.id,
    googlePlaceId: restaurant.placeId,
    reviewerName: r.reviewerName as string | undefined,
    reviewerProfileUrl: r.reviewerProfileUrl as string | undefined,
    reviewerLocalGuide: r.reviewerLocalGuide as boolean | undefined,
    reviewerReviewCount: r.reviewerReviewCount as number | undefined,
    rating: r.rating as number,
    text: r.text as string | undefined,
    reviewContext: hasStructured(r.reviewContext) ? r.reviewContext : undefined,
    publishedLabel: r.publishedLabel as string | undefined,
    ownerResponseText: r.ownerResponseText as string | undefined,
    ownerResponsePublishedLabel: r.ownerResponsePublishedLabel as string | undefined,
    likesCount: r.likesCount as number | undefined,
    scrapedAt,
    scraperVersion: SCRAPER_VERSION,
  }));

  return { reviews, sortApplied: sorted ? config.sort : null, notes };
}

export type PlaceDetails = {
  phone?: string;
  website?: string;
  address?: string;
  category?: string;
  price?: string; // normalized "$10–20" or "$$"
  priceUnits?: { start: string; end: string }; // numeric range → priceRange object
  hours?: Array<{ day: string; times: string }>; // times "11 am to 2 am" | "Closed"
  serviceOptions?: string[];
  /** Google Maps "About" tab attribute groups, in the shape the buffet page
   *  renders (buffet.additionalInfo): { "Accessibility": [{ "Wheelchair
   *  accessible entrance": true }], ... }. */
  additionalInfo?: Record<string, Array<Record<string, boolean>>>;
};

/**
 * Extract the listing's hero photo URL (lh3.googleusercontent.com). Picks the
 * LARGEST such image on the page (by its =w<width> / =s<size> param) so we get
 * the place photo, not a small reviewer avatar. Returns undefined if none.
 */
export async function extractHeroPhoto(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const srcs: string[] = [];
    Array.from(document.querySelectorAll("img")).forEach((i) => {
      const s = (i as HTMLImageElement).src || "";
      if (/googleusercontent\.com|ggpht\.com/.test(s)) srcs.push(s);
    });
    // background-image URLs too (some heroes are CSS backgrounds)
    Array.from(document.querySelectorAll('[style*="googleusercontent"]')).forEach((e) => {
      const m = (e.getAttribute("style") || "").match(/url\(["']?(https:\/\/[^"')]+)/);
      if (m) srcs.push(m[1]);
    });
    const scored = srcs
      .map((s) => {
        const m = s.match(/=w(\d+)/) || s.match(/=s(\d+)/);
        return { s, w: m ? parseInt(m[1], 10) : 0 };
      })
      .sort((a, b) => b.w - a.w);
    // Hero photos are wide (≥200px); anything smaller is an avatar/icon.
    return scored[0] && scored[0].w >= 200 ? scored[0].s : undefined;
  });
}

/**
 * Extract structured place details from the Maps place page (overview panel).
 * Same page we scrape reviews from; used to backfill fsq-sourced buffets that
 * lack Google structured data. Everything runs inside one anonymous evaluate
 * with NO nested named helpers (tsx/esbuild keepNames → "__name is not defined").
 */
export async function extractPlaceDetails(page: Page): Promise<PlaceDetails> {
  return page.evaluate(() => {
    const out: Record<string, unknown> = {};

    const phoneEl = document.querySelector('button[data-item-id^="phone:tel:"]');
    if (phoneEl) {
      const id = phoneEl.getAttribute("data-item-id") || "";
      out.phone =
        id.replace("phone:tel:", "").trim() ||
        (phoneEl.getAttribute("aria-label") || "").replace(/^Phone:\s*/i, "").trim() ||
        undefined;
    }

    const webEl = document.querySelector('a[data-item-id="authority"]');
    if (webEl) out.website = webEl.getAttribute("href") || undefined;

    const addrEl = document.querySelector('button[data-item-id="address"]');
    if (addrEl)
      out.address =
        (addrEl.getAttribute("aria-label") || "").replace(/^Address:\s*/i, "").trim() || undefined;

    const catEl = document.querySelector('button[jsaction*="category"]');
    if (catEl) out.category = (catEl.textContent || "").trim() || undefined;

    // Price: Maps renders it as a range with a TRAILING "$", e.g. "10–20 $" or
    // "·10–20 $" (also plain "$$"). Normalize to "$10–20" / "$$".
    const priceCands = Array.from(document.querySelectorAll('[aria-label], span'))
      .map((e) => ((e.getAttribute && e.getAttribute("aria-label")) || e.textContent || "").trim())
      .filter((t) => t.length < 40 && /\$/.test(t));
    const range = priceCands.find((t) => /\d[\d,]*\s*[–-]\s*\d[\d,]*\s*\$/.test(t));
    const symbol = priceCands.find((t) => /^\${1,4}$/.test(t));
    const leading = priceCands.find((t) => /^\$\s*\d/.test(t));
    if (range) {
      const m = range.match(/(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)/);
      if (m) {
        out.price = `$${m[1]}–${m[2]}`;
        out.priceUnits = { start: m[1].replace(/,/g, ""), end: m[2].replace(/,/g, "") };
      }
    } else if (leading) {
      out.price = leading;
    } else if (symbol) {
      out.price = symbol;
    }

    // Weekly hours. Each row's day + times may be in cells OR an aria-label like
    // "Sunday, 11 AM to 9 PM". Read every cell's text and any aria-label, join.
    const rows = Array.from(document.querySelectorAll("table.eK4R0e tr"));
    if (rows.length) {
      out.hours = rows
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"))
            .map((c) => (c.getAttribute("aria-label") || c.textContent || "").replace(/\s+/g, " ").trim())
            .filter((s) => s.length > 0);
          const day = cells[0] || "";
          const times = cells.slice(1).find((c) => /\d/.test(c) || /closed/i.test(c)) || "";
          return { day, times };
        })
        .filter((r) => r.day && r.times);
    }

    // Service options — rough token scan (refined in step 2 if the proof warrants).
    const tokens = ["Dine-in", "Takeout", "Delivery", "Curbside pickup", "Drive-through", "Outdoor seating"];
    const bodyText = document.body.innerText || "";
    out.serviceOptions = tokens.filter((t) => bodyText.includes(t));

    return out as PlaceDetails;
  });
}

/** Click into the "About" tab and wait for the attribute groups to render.
 *  Mirrors openReviewsPanel. Returns true if the About content appears. */
export async function openAboutPanel(page: Page, verbose = false): Promise<boolean> {
  const candidates: Locator[] = [
    page.getByRole("tab", { name: /^about$/i }),
    page.getByRole("button", { name: /^about$/i }),
    page.getByRole("tab", { name: /about/i }),
  ];
  for (const c of candidates) {
    try {
      const btn = c.first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ timeout: 4000 });
        break;
      }
    } catch {
      // try next
    }
  }
  // The About pane renders attribute group headings (h2). Wait for at least one.
  try {
    await page.locator('h2').first().waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(600);
    log(verbose, "about panel open");
    return true;
  } catch {
    return false;
  }
}

// Google Maps "About" tab group headings we keep (maps 1:1 to the buffet page's
// ADDITIONAL_INFO_KEYS plus a few extra Google groups that are safe to store).
const ABOUT_GROUP_WHITELIST = [
  "Accessibility",
  "Amenities",
  "Atmosphere",
  "Crowd",
  "Dining options",
  "Highlights",
  "Offerings",
  "Payments",
  "Planning",
  "Popular for",
  "Service options",
];

/**
 * Extract the "About" tab attribute groups into the buffet.additionalInfo shape.
 * Everything runs inside one anonymous evaluate with NO nested named helpers
 * (tsx/esbuild keepNames → "__name is not defined"), matching extractPlaceDetails.
 */
export async function extractAboutAttributes(
  page: Page,
): Promise<Record<string, Array<Record<string, boolean>>>> {
  return page.evaluate((whitelist: string[]) => {
    const groups: Record<string, Array<Record<string, boolean>>> = {};
    const wl = new Set(whitelist.map((w) => w.toLowerCase()));

    const headings = Array.from(document.querySelectorAll("h2, h3"));
    for (const h of headings) {
      const groupName = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (!groupName || groupName.length > 40) continue;
      if (!wl.has(groupName.toLowerCase())) continue;

      // Find the attribute list associated with this heading: look in the
      // heading's ancestors for a <ul>, then fall back to following siblings.
      let ul: Element | null = null;
      let container: Element | null = h.parentElement;
      for (let hop = 0; hop < 3 && container && !ul; hop++) {
        ul = container.querySelector("ul");
        container = container.parentElement;
      }
      if (!ul) {
        let sib: Element | null = h.nextElementSibling;
        while (sib && !ul) {
          if (sib.tagName === "UL") ul = sib;
          else ul = sib.querySelector ? sib.querySelector("ul") : null;
          sib = sib.nextElementSibling;
        }
      }
      if (!ul) continue;

      const items: Array<Record<string, boolean>> = [];
      const seen = new Set<string>();
      Array.from(ul.querySelectorAll("li")).forEach((li) => {
        const aria = (li.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const text = (li.textContent || "").replace(/\s+/g, " ").trim();
        let label = aria || text;
        if (!label) return;
        // Availability: Google prefixes unavailable attributes with a negation
        // ("No wheelchair…", "Doesn't have…") and/or a not-available icon.
        const available = !/^(no\b|not\b|doesn.?t\b|does not\b|unavailable\b)/i.test(label) &&
          !/\bnot available$/i.test(label);
        label = label
          .replace(/^(has|offers|serves)\s+/i, "")
          .replace(/^(no|doesn.?t have|does not have|doesn.?t offer|does not offer)\s+/i, "")
          .trim();
        if (!label || seen.has(label.toLowerCase())) return;
        seen.add(label.toLowerCase());
        items.push({ [label]: available });
      });

      if (items.length) groups[groupName] = items;
    }

    return groups;
  }, ABOUT_GROUP_WHITELIST);
}
