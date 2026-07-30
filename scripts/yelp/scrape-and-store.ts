// Yelp scrape + store batcher — STEP 3.
//
// Iterates over Indian buffets that have a HIGH-confidence resolved Yelp URL and
// no stored Yelp data yet, scrapes the 11 fields via the shared scrape-core
// (real Chrome over CDP), and stores them as a JSON blob in the buffet's
// `yelpData` field. Non-destructive: does NOT touch Google-sourced fields.
//
// Resumable: success sets `yelpData`, so a restart skips done buffets. Failures
// leave `yelpData` null and are retried on the next run. A DataDome block stops
// the batch cleanly (solve once in the Chrome window, then re-run).
//
// Setup (same real Chrome as the resolver/extractor):
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-yelp-scraper"
//
// Usage:
//   npx tsx scripts/yelp/scrape-and-store.ts --limit=3 --dry    # extract, no DB write
//   npx tsx scripts/yelp/scrape-and-store.ts --limit=3          # scrape + store 3
//   npx tsx scripts/yelp/scrape-and-store.ts --limit=2000       # full run

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { init } from "@instantdb/admin";
import { scrapeBuffet } from "./scrape-core";

// ---- args -----------------------------------------------------------------
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) out[body] = "true";
    else out[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const LIMIT = Number.parseInt(args["limit"] ?? "3", 10);
const CDP = args["cdp"] ?? "http://localhost:9222";
const DRY = args["dry"] === "true";
// Which confidence levels to scrape. Default high only (per the agreed policy);
// pass --confidence=high,medium to include reviewed mediums later.
const CONFIDENCE = (args["confidence"] ?? "high").split(",").map((s) => s.trim());
const CUISINE = args["cuisine"] ?? "indian";
// DataDome handling: on a block, scrapeBuffet waits BLOCK_WAIT ms for a manual
// solve; the batch retries the same buffet up to BLOCK_RETRIES times before
// giving up. Net: the run PAUSES at a block and auto-continues once you solve,
// instead of dying and needing a manual re-run.
const BLOCK_WAIT = Number.parseInt(args["block-wait-ms"] ?? "120000", 10);
const BLOCK_RETRIES = Number.parseInt(args["block-retries"] ?? "15", 10);
const OUT_DIR = path.join(process.cwd(), ".runtime", "yelp", "out");

// ---- env / db -------------------------------------------------------------
try {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  env.split("\n").forEach((l) => {
    const m = l.match(/^([^=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()])
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
} catch {
  /* env optional */
}
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || "709e0e09-3347-419b-8daa-bad6889e480d",
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
});

// ---- main -----------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Fetch candidates: resolved (confidence in CONFIDENCE), not yet scraped.
  // Paged minimal reads — a single query for a large cuisine returns a JSON
  // response bigger than Node's ~512MB string limit and crashes.
  const candidates: any[] = [];
  const PAGE = 1000;
  let fetchOffset = 0;
  while (candidates.length < LIMIT) {
    const res = await db.query({
      buffets: {
        $: {
          where: { cuisineType: CUISINE, yelpUrlConfidence: { $in: CONFIDENCE } },
          limit: PAGE,
          offset: fetchOffset,
        },
      },
    });
    const page = (res.buffets || []) as any[];
    for (const b of page) {
      if (b.yelpUrl && !b.yelpData) candidates.push({ id: b.id, name: b.name, yelpUrl: b.yelpUrl });
    }
    if (page.length < PAGE) break;
    fetchOffset += PAGE;
  }
  if (candidates.length > LIMIT) candidates.length = LIMIT;

  console.log(
    `Scraping ${candidates.length} buffets (confidence in [${CONFIDENCE}], unscraped) ${DRY ? "(DRY)" : ""}\n`,
  );
  if (!candidates.length) {
    console.log("Nothing to scrape.");
    return;
  }

  // Page-independent pacing so a dropped tab can't crash the sleep between items.
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  let browser = await chromium.connectOverCDP(CDP);
  let ctx = browser.contexts()[0] ?? (await browser.newContext());
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  // Over a long run the CDP connection drops — the tab closing, or the user
  // restarting the browser window. Re-attach WITHOUT closing the browser
  // (browser.close() on a CDP-attached browser can tear down real Chrome), and
  // retry patiently so a browser restart doesn't kill the batch.
  const reconnect = async () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        browser = await chromium.connectOverCDP(CDP);
        ctx = browser.contexts()[0] ?? (await browser.newContext());
        page = ctx.pages()[0] ?? (await ctx.newPage());
        return;
      } catch {
        await sleep(5000); // wait for Chrome/CDP to come back
      }
    }
    throw new Error("could not reconnect to Chrome after 6 attempts (~30s)");
  };

  let stored = 0;
  let failed = 0;
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    const tag = `[${i + 1}/${candidates.length}] ${b.name}`;

    if (page.isClosed()) {
      console.log(`${tag} — page closed, reconnecting to Chrome...`);
      try {
        await reconnect();
      } catch (e) {
        console.log(`reconnect failed: ${(e as Error).message}. Stopping (stored=${stored}).`);
        process.exit(5);
      }
    }

    let r;
    try {
      r = await scrapeBuffet(page, b.yelpUrl, { blockWaitMs: BLOCK_WAIT });
    } catch (e) {
      console.log(`${tag} — connection dropped (${(e as Error).message}); reconnecting...`);
      try {
        await reconnect();
        r = await scrapeBuffet(page, b.yelpUrl, { blockWaitMs: BLOCK_WAIT });
      } catch (e2) {
        console.log(`reconnect/retry failed: ${(e2 as Error).message}. Stopping (stored=${stored}).`);
        await browser.close().catch(() => {});
        process.exit(5);
      }
    }
    let blockRetries = 0;
    while (!r.ok && r.blocked && blockRetries < BLOCK_RETRIES) {
      blockRetries++;
      console.log(
        `${tag} — DataDome block. Solve it in the Chrome window; waiting (retry ${blockRetries}/${BLOCK_RETRIES})...`,
      );
      r = await scrapeBuffet(page, b.yelpUrl, { blockWaitMs: BLOCK_WAIT });
    }

    if (!r.ok) {
      if (r.blocked) {
        console.log(
          `${tag} — still BLOCKED after ${BLOCK_RETRIES} retries (~${Math.round((BLOCK_RETRIES * BLOCK_WAIT) / 60000)} min). Stopping (stored=${stored}). Re-run to resume.`,
        );
        await browser.close();
        process.exit(4);
      }
      failed++;
      console.log(`${tag} — fail: ${r.reason} (will retry next run)`);
      await sleep(3000);
      continue;
    }

    const d = r.data;
    const summary = `menu=${d.menuItems.length} dishes=${d.popularDishes.length} amen=${Object.keys(d.amenities).length} svc=${Object.keys(d.serviceOptions).length}`;
    if (DRY) {
      fs.writeFileSync(
        path.join(OUT_DIR, `scrape-${b.id}.json`),
        JSON.stringify(d, null, 2),
        "utf8",
      );
      console.log(`${tag} — ok (dry): ${summary}`);
    } else {
      try {
        await db.transact(db.tx.buffets[b.id].update({ yelpData: JSON.stringify(d) }));
        stored++;
        console.log(`${tag} — stored: ${summary}`);
      } catch (e) {
        failed++;
        console.log(`${tag} — STORE FAILED: ${(e as Error).message}`);
      }
    }

    if ((i + 1) % 20 === 0) console.log(`   --- progress ${i + 1}/${candidates.length}: stored=${stored} failed=${failed} ---`);
    await sleep(3000 + Math.floor(3000 * (i % 3) * 0.5)); // 3-6s pacing
  }

  console.log(`\nDone. stored=${stored} failed=${failed} of ${candidates.length}`);
  await browser.close();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
