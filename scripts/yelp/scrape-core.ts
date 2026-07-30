// Shared Yelp scraping core — used by both extract-one.ts (single URL) and
// scrape-and-store.ts (batch). Extraction keys off JSON-LD + stable section
// markers, never hashed CSS classes. See the field notes in each extractor.
//
// The 11 stored fields:
//   5 isClosed · 8 ratingDistribution (relative bar widths) · 11 popularDishes
//   12 menuItems (from the Yelp-hosted menu page) · 13 menuUrl · 14 priceRange
//   19 hours · 20 website · 21 serviceOptions · 22 amenities · 23 ambience

import { Page } from "playwright";

export type MenuItem = { name: string; price: string | null; description: string | null };
export type PopularDish = { name: string; price: string | null; count: number | null };

export type YelpExtract = {
  sourceUrl: string;
  extractedAt: string;
  isClosed: boolean;
  ratingDistribution: Record<string, number> | null;
  popularDishes: PopularDish[];
  menuItems: MenuItem[];
  menuUrl: string | null;
  priceRange: string | null;
  hours: Record<string, string> | null;
  website: string | null;
  serviceOptions: Record<string, boolean>;
  amenities: Record<string, boolean>;
  ambience: string[];
};

// tsx/esbuild injects a `__name` helper into transpiled page functions; this
// shim (evaluated as a string, so it isn't transpiled) defines it in the page.
const NAME_SHIM = "window.__name = window.__name || function (t) { return t; };";

/** Extract the biz-page fields (all but full menuItems). Runs in the page. */
export async function extractBizPage(page: Page, sourceUrl: string): Promise<YelpExtract> {
  await page.evaluate(NAME_SHIM);
  return page.evaluate((sourceUrl: string): YelpExtract => {
    const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

    const ldBlocks: any[] = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
      try {
        const parsed = JSON.parse(el.textContent || "");
        if (Array.isArray(parsed)) ldBlocks.push(...parsed);
        else ldBlocks.push(parsed);
      } catch {
        /* ignore */
      }
    });
    const ld =
      ldBlocks.find((b) => {
        const t = b?.["@type"];
        return (
          t === "Restaurant" ||
          (Array.isArray(t) && t.includes("Restaurant")) ||
          b?.aggregateRating
        );
      }) || {};

    const sectionByHeading = (labels: string[]): Element | null => {
      const wanted = labels.map((l) => l.toLowerCase());
      const headers = Array.from(
        document.querySelectorAll("h1,h2,h3,h4,section[aria-label],div[aria-label]"),
      );
      for (const h of headers) {
        const label = norm(h.getAttribute("aria-label") || h.textContent).toLowerCase();
        if (wanted.some((w) => label === w || label.startsWith(w))) {
          return h.closest("section") || h.parentElement || h;
        }
      }
      return null;
    };

    // (5) isClosed
    const isClosed = norm(document.body.innerText).toLowerCase().includes("permanently closed");

    // (14) priceRange
    let priceRange: string | null = typeof ld.priceRange === "string" ? ld.priceRange : null;
    if (!priceRange) {
      const m = norm(document.body.innerText).match(/(?<![\w$])(\${1,4})(?![\w$])/);
      priceRange = m ? m[1] : null;
    }

    // (19) hours — JSON-LD `openingHours` = array of "Monday 15:00-21:30"
    let hours: Record<string, string> | null = null;
    const oh = ld.openingHours;
    if (Array.isArray(oh) && oh.length) {
      hours = {};
      for (const line of oh) {
        const m = norm(String(line)).match(/^(\w+)\s+(.+)$/);
        if (!m) continue;
        const day = m[1].slice(0, 3);
        hours[day] = hours[day] ? `${hours[day]}, ${m[2]}` : m[2];
      }
      if (Object.keys(hours).length === 0) hours = null;
    }

    const bizRedir = (type: string): string | null => {
      const a = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(`a[href*="website_link_type=${type}"]`),
      )[0];
      if (!a) return null;
      try {
        return new URL(a.href).searchParams.get("url");
      } catch {
        return null;
      }
    };

    // (13) menuUrl
    let menuUrl: string | null = bizRedir("menu");
    if (!menuUrl) {
      const menuLink = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/menu/"]'),
      ).find(
        (a) =>
          /view full menu|full menu/i.test(norm(a.textContent)) ||
          a.href.split("/menu/")[1]?.split("/").filter(Boolean).length === 1,
      );
      if (menuLink) menuUrl = menuLink.href.split("?")[0];
    }
    if (!menuUrl && typeof ld.hasMenu === "string") menuUrl = ld.hasMenu;

    // (20) website
    const website: string | null = bizRedir("website");

    // (8) ratingDistribution — relative bar widths per star
    let ratingDistribution: Record<string, number> | null = null;
    const bars = Array.from(document.querySelectorAll('[data-testid="review-summary-bar"]'));
    if (bars.length) {
      const dist: Record<string, number> = {};
      for (const bar of bars) {
        const star = norm(bar.textContent).match(/([1-5])\s*stars?/);
        const fill = bar.querySelector<HTMLElement>('[style*="width"]');
        const w = (fill?.getAttribute("style") || "").match(/width:\s*([\d.]+)%/);
        if (star && w) dist[star[1]] = Number(w[1]);
      }
      if (Object.keys(dist).length) ratingDistribution = dist;
    }

    // (11) popularDishes
    const popularDishes: PopularDish[] = [];
    const pdRoot =
      document.querySelector("#popular_dishes") || sectionByHeading(["Popular Dishes"]);
    if (pdRoot) {
      const seen = new Set<string>();
      pdRoot.querySelectorAll<HTMLAnchorElement>('a[href*="/menu/"]').forEach((a) => {
        const parts = (a.getAttribute("href") || "").split("/menu/")[1]?.split("/") || [];
        if (parts.length < 2 || !parts[1]) return;
        const card = a.closest('[class*="dish__"]') || a.parentElement;
        const text = norm(card?.textContent);
        const price = text.match(/\$\d+(?:\.\d{2})?/);
        const rev = text.match(/(\d+)\s*Reviews?/i);
        const name = text
          .replace(/\$\d+(?:\.\d{2})?/g, " ")
          .replace(/\d+\s*Photos?/gi, " ")
          .replace(/\d+\s*Reviews?/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        const finalName =
          name || parts[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (finalName && !seen.has(finalName)) {
          seen.add(finalName);
          popularDishes.push({
            name: finalName,
            price: price ? price[0] : null,
            count: rev ? Number(rev[1]) : null,
          });
        }
      });
    }

    // (12) menuItems — populated separately from the menu page
    const menuItems: MenuItem[] = [];

    // (21/22/23) attributes from "Amenities and More" (expander already clicked)
    const amenities: Record<string, boolean> = {};
    const serviceOptions: Record<string, boolean> = {};
    const ambience: string[] = [];
    const SERVICE_KEYS =
      /(takeout|take-?out|delivery|dine-?in|curbside|reservation|outdoor seating|drive-?thru|catering|offers)/i;
    const AMBIENCE_KEYS =
      /(casual|trendy|romantic|hipster|classy|upscale|divey|intimate|touristy|cozy|good for (kids|groups|working|watching))/i;
    // Collect attribute labels from two places:
    //   (a) the always-visible rows in "Amenities and More" — semibold spans;
    //   (b) the "NN More Attributes" expander target (scrapeBuffet clicks it),
    //       whose overflow attributes render as PLAIN spans, not semibold.
    const labelTexts: string[] = [];
    const amSection = sectionByHeading(["Amenities and More", "Amenities", "More business info"]);
    if (amSection) {
      amSection
        .querySelectorAll<HTMLElement>('span[data-font-weight="semibold"]')
        .forEach((el) => labelTexts.push(norm(el.textContent)));
    }
    // The expanded overflow lands in [id^="expander-link-content"] containers.
    // Read them directly (the toggle button relabels itself once expanded, so
    // matching it by "More Attributes" text after the click would miss it).
    document.querySelectorAll('[id^="expander-link-content"]').forEach((cont) => {
      cont.querySelectorAll("span").forEach((s) => {
        if (s.querySelector("span")) return; // leaf spans only
        const t = norm(s.textContent);
        if (t) labelTexts.push(t);
      });
    });
    const seenAttr = new Set<string>();
    for (const raw of labelTexts) {
      if (!raw || raw.length > 48 || /amenities and more|more attributes/i.test(raw)) continue;
      const negative = /^(No|Not)\b/i.test(raw);
      const label = raw.replace(/^(No|Not)\s+/i, "");
      if (label.length < 2 || seenAttr.has(label)) continue;
      seenAttr.add(label);
      if (AMBIENCE_KEYS.test(label)) {
        if (!negative) ambience.push(label);
      } else if (SERVICE_KEYS.test(label)) {
        serviceOptions[label] = !negative;
      } else {
        amenities[label] = !negative;
      }
    }

    return {
      sourceUrl,
      extractedAt: new Date().toISOString(),
      isClosed,
      ratingDistribution,
      popularDishes,
      menuItems,
      menuUrl,
      priceRange,
      hours,
      website,
      serviceOptions,
      amenities,
      ambience: Array.from(new Set(ambience)),
    };
  }, sourceUrl);
}

/** Extract full menu items from a Yelp-hosted menu page. Runs in the page. */
export async function extractMenu(page: Page): Promise<MenuItem[]> {
  await page.evaluate(NAME_SHIM);
  return page.evaluate((): MenuItem[] => {
    const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
    const items: MenuItem[] = [];
    const seen = new Set<string>();
    document.querySelectorAll('[class*="menu-item__"], .menu-item').forEach((el) => {
      const name = norm(el.querySelector("h4")?.textContent);
      if (!name || seen.has(name)) return;
      const price = norm(el.querySelector(".menu-item-price-amount")?.textContent) || null;
      const description =
        norm(el.querySelector(".menu-item-details-description")?.textContent) || null;
      seen.add(name);
      items.push({ name, price, description });
    });
    return items;
  });
}

export type ScrapeResult =
  | { ok: true; data: YelpExtract }
  | { ok: false; blocked: boolean; reason: string };

/**
 * Full scrape of one Yelp business: navigate, get past DataDome (waits for a
 * manual solve up to blockWaitMs when non-headless), expand attributes, extract
 * the biz page, then follow a Yelp-hosted menu for full menu items.
 */
export async function scrapeBuffet(
  page: Page,
  url: string,
  opts: { blockWaitMs?: number } = {},
): Promise<ScrapeResult> {
  const blockWaitMs = opts.blockWaitMs ?? 120_000;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (e) {
    return { ok: false, blocked: false, reason: `goto failed: ${(e as Error).message}` };
  }

  // DataDome's challenge page auto-reloads, which can destroy the execution
  // context mid-check. Treat any such error as "still blocked" instead of
  // throwing (the polling loop then simply tries again).
  const isBlocked = async () => {
    try {
      return !(await page.$("h1")) || (await page.evaluate(() => document.body.innerText.length < 400));
    } catch {
      return true;
    }
  };

  if (await isBlocked()) {
    const deadline = Date.now() + blockWaitMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(3000);
      if (!(await isBlocked())) break;
    }
    if (await isBlocked()) return { ok: false, blocked: true, reason: "DataDome block" };
  }

  // Everything below can race a DataDome auto-reload that destroys the page's
  // execution context mid-evaluate. Catch that and report it as a (retryable)
  // block so the batcher waits for a manual solve — never crash the whole run.
  try {
    // Wait for meaningful content to hydrate — Yelp injects the Restaurant
    // JSON-LD and rating bars client-side, so a fixed sleep can extract too
    // early (seen: the first page in a batch losing hours + ratingDistribution).
    await page
      .waitForFunction(
        () => {
          const lds = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          const hasRestaurant = lds.some((e) => /"@type"\s*:\s*"Restaurant"/.test(e.textContent || ""));
          const hasBars = document.querySelectorAll('[data-testid="review-summary-bar"]').length > 0;
          return hasRestaurant || hasBars;
        },
        { timeout: 10_000 },
      )
      .catch(() => {
        /* proceed with whatever rendered */
      });

    // Hydrate lazy sections + expand the "NN More Attributes" toggle via a JS
    // click (a sticky header/overlay can intercept a Playwright click).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const clicked = await page.evaluate(
      "(function(){var b=Array.prototype.slice.call(document.querySelectorAll('button')).find(function(x){return /More Attributes/i.test(x.textContent||'')}); if(b){b.scrollIntoView({block:'center'});b.click();return true} return false})()",
    );
    if (clicked) await page.waitForTimeout(2200);

    const data = await extractBizPage(page, url);

    // Full menu items only when Yelp hosts the menu.
    if (data.menuUrl && /yelp\.com\/menu\//.test(data.menuUrl)) {
      try {
        await page.goto(data.menuUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(1800);
        data.menuItems = await extractMenu(page);
      } catch {
        /* menu optional */
      }
    }

    return { ok: true, data };
  } catch (e) {
    const msg = (e as Error).message || "";
    const navRace = /Execution context was destroyed|Target closed|frame was detached|navigating/i.test(msg);
    return { ok: false, blocked: navRace, reason: navRace ? "DataDome nav-race" : `extract error: ${msg}` };
  }
}
