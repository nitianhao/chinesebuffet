// Yelp URL resolver — STEP 2.
//
// For each Indian buffet (name + city + state) we find its Yelp business URL by
// searching DuckDuckGo (JS SERP, driven through the real-Chrome CDP session —
// html.duckduckgo.com challenges bots, but the normal SERP behaves like a real
// user). We take the top yelp.com/biz result and score confidence from name +
// city overlap. Resolution never loads Yelp itself, so DataDome is untouched
// here; the actual scrape (step 3) is the only thing that hits Yelp.
//
// This step DEFAULTS TO DRY-RUN (prints a table, writes a JSON report, no DB
// writes) so accuracy can be eyeballed on a small slice first.
//
// Setup (same real Chrome as the extractor):
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-yelp-scraper"
//
// Usage:
//   npx tsx scripts/yelp/resolve-urls.ts --limit=5           # dry-run, 5 buffets
//   npx tsx scripts/yelp/resolve-urls.ts --limit=5 --verbose

import fs from "node:fs";
import path from "node:path";
import { chromium, Page } from "playwright";
import { init } from "@instantdb/admin";

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
const LIMIT = Number.parseInt(args["limit"] ?? "5", 10);
const CDP = args["cdp"] ?? "http://localhost:9222";
const CUISINE = args["cuisine"] ?? "indian";
// DDG rate-limit self-heal: passive cooldown length and how many cooldowns to
// attempt before giving up (default 8min x 6 = up to ~48min of waiting).
const COOLDOWN_MS = Number.parseInt(args["cooldown-ms"] ?? "480000", 10);
const MAX_COOLDOWNS = Number.parseInt(args["max-cooldowns"] ?? "6", 10);
const VERBOSE = args["verbose"] === "true";
// --store: write high-confidence matches to the buffet (yelpUrl + confidence).
// medium/low always go to a review file, never auto-written.
const STORE = args["store"] === "true";
const OUT_DIR = path.join(process.cwd(), ".runtime", "yelp", "out");

// ---- env / db -------------------------------------------------------------
function loadEnv() {
  try {
    const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    env.split("\n").forEach((l) => {
      const m = l.match(/^([^=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()])
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
  } catch {
    /* env optional if already set */
  }
}
loadEnv();
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || "709e0e09-3347-419b-8daa-bad6889e480d",
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
});

// ---- helpers --------------------------------------------------------------
const STOP = new Set(["the", "and", "of", "a", "an", "restaurant", "cuisine", "indian", "&"]);
const tokens = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));

type Resolution = {
  buffetId: string;
  name: string;
  city: string;
  state: string;
  query: string;
  yelpUrl: string | null;
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
};

type DdgResult = { challenged: boolean; hits: { url: string; title: string; snippet: string }[] };

/** Run one DuckDuckGo search in the CDP browser; return top yelp/biz hits. */
async function ddgSearch(page: Page, query: string): Promise<DdgResult> {
  await page.goto("https://duckduckgo.com/?ia=web&q=" + encodeURIComponent(query), {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const body = document.body.innerText || "";
    const challenged =
      /unusual (traffic|activity)|verify you are human|complete the following challenge|are you a robot/i.test(
        body,
      ) && body.length < 1500;
    const hits: { url: string; title: string; snippet: string }[] = [];
    document.querySelectorAll('article[data-testid="result"]').forEach((art) => {
      const a = art.querySelector<HTMLAnchorElement>('a[data-testid="result-title-a"]');
      if (!a || !/yelp\.com\/biz\//.test(a.href)) return;
      hits.push({
        url: a.href.split("?")[0],
        title: (a.textContent || "").replace(/\s+/g, " ").trim(),
        snippet: (art.textContent || "").replace(/\s+/g, " ").trim(),
      });
    });
    return { challenged, hits };
  });
}

function score(
  b: { name: string; city: string },
  hit: { url: string; snippet: string },
): { confidence: Resolution["confidence"]; reason: string } {
  const slug = hit.url.split("/biz/")[1] || "";
  const slugToks = new Set(tokens(slug.replace(/-/g, " ")));
  const nameToks = tokens(b.name);
  const overlap = nameToks.length
    ? nameToks.filter((t) => slugToks.has(t)).length / nameToks.length
    : 0;
  const cityMatch = b.city ? hit.snippet.toLowerCase().includes(b.city.toLowerCase()) : false;
  const reason = `nameOverlap=${overlap.toFixed(2)} cityInSnippet=${cityMatch}`;
  if (overlap >= 0.6 && cityMatch) return { confidence: "high", reason };
  if (overlap >= 0.4 || (overlap >= 0.3 && cityMatch)) return { confidence: "medium", reason };
  return { confidence: "low", reason };
}

// ---- main -----------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Resumable: only buffets not yet processed (no yelpUrlConfidence). Each
  // processed buffet gets a confidence written, so a restart continues cleanly.
  // Fetch in PAGES and keep only the fields we need — a single query for a large
  // cuisine (6,757 Chinese) returns a JSON response bigger than Node's ~512MB
  // string limit and crashes; paged minimal reads avoid both that and high memory.
  const buffets: any[] = [];
  const PAGE = 1000;
  let fetchOffset = 0;
  while (buffets.length < LIMIT) {
    const res = await db.query({
      buffets: {
        $: {
          where: { cuisineType: CUISINE, yelpUrlConfidence: { $isNull: true } },
          limit: PAGE,
          offset: fetchOffset,
        },
      },
    });
    const page = (res.buffets || []) as any[];
    for (const x of page)
      buffets.push({
        id: x.id,
        name: x.name,
        cityName: x.cityName,
        city: x.city,
        stateAbbr: x.stateAbbr,
        state: x.state,
      });
    if (page.length < PAGE) break;
    fetchOffset += PAGE;
  }
  if (buffets.length > LIMIT) buffets.length = LIMIT;
  console.log(
    `Resolving ${buffets.length} unprocessed ${CUISINE} buffets ${STORE ? "(STORE)" : "(dry-run)"}\n`,
  );

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const out: Resolution[] = [];
  const writeReview = () =>
    fs.writeFileSync(
      path.join(OUT_DIR, "resolution-review.json"),
      JSON.stringify(
        out.filter((r) => r.confidence === "medium" || r.confidence === "low"),
        null,
        2,
      ),
      "utf8",
    );

  for (let i = 0; i < buffets.length; i++) {
    const b = buffets[i];
    const city = b.cityName || b.city || "";
    const state = b.stateAbbr || b.state || "";
    const query = `site:yelp.com/biz ${b.name} ${city} ${state}`.trim();
    let rec: Resolution = {
      buffetId: b.id,
      name: b.name,
      city,
      state,
      query,
      yelpUrl: null,
      confidence: "none",
      reason: "no yelp result",
    };
    try {
      let r = await ddgSearch(page, query);
      // Self-heal DDG rate-limits: a passive cooldown (waiting WITHOUT hammering
      // the page) reliably clears them. Loop cooldowns before giving up, so a
      // long run rides out the ~every-few-hundred-searches rate-limit unattended.
      let cooldowns = 0;
      while (r.challenged && cooldowns < MAX_COOLDOWNS) {
        cooldowns++;
        console.log(
          `>>> DDG rate-limit — passive cooldown ${Math.round(COOLDOWN_MS / 60000)}min (${cooldowns}/${MAX_COOLDOWNS})...`,
        );
        await page.waitForTimeout(COOLDOWN_MS);
        r = await ddgSearch(page, query);
      }
      if (r.challenged) {
        console.log(
          `>>> Still challenged after ${MAX_COOLDOWNS} cooldowns. Stopping — state saved, re-run to resume.`,
        );
        writeReview();
        await browser.close();
        process.exit(4);
      }
      if (r.hits.length) {
        const top = r.hits[0];
        const { confidence, reason } = score({ name: b.name, city }, top);
        rec = { ...rec, yelpUrl: top.url, confidence, reason };
      }
    } catch (e) {
      rec.reason = `error: ${(e as Error).message}`;
    }

    // Persist processed-marker for EVERY buffet (yelpUrlConfidence), plus the
    // URL when found. Only "high" is used by step 3; medium/low await review.
    let stored = "";
    if (STORE) {
      try {
        await db.transact(
          db.tx.buffets[b.id].update({
            yelpUrl: rec.yelpUrl ?? null,
            yelpUrlConfidence: rec.confidence,
          }),
        );
        stored = rec.confidence === "high" ? " [stored]" : " [marked]";
      } catch (e) {
        stored = ` [STORE FAILED: ${(e as Error).message}]`;
      }
    }

    out.push(rec);
    console.log(
      `[${i + 1}/${buffets.length}] ${b.name} — ${city}, ${state}\n   -> ${rec.yelpUrl || "(none)"}  [${rec.confidence}]${stored} ${VERBOSE ? rec.reason : ""}`,
    );

    if ((i + 1) % 25 === 0) {
      const so = out.reduce<Record<string, number>>((m, r) => ((m[r.confidence] = (m[r.confidence] || 0) + 1), m), {});
      console.log(`   --- progress ${i + 1}/${buffets.length}: ${JSON.stringify(so)} ---`);
      writeReview();
    }
    await page.waitForTimeout(2500 + Math.floor(2500 * (i % 3) * 0.5)); // 2.5-5s pacing
  }

  const outPath = path.join(OUT_DIR, `resolution-${STORE ? "store" : "dryrun"}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  writeReview();
  const review = out.filter((r) => r.confidence === "medium" || r.confidence === "low");
  const byConf = out.reduce<Record<string, number>>((m, r) => ((m[r.confidence] = (m[r.confidence] || 0) + 1), m), {});
  console.log(`\nConfidence breakdown: ${JSON.stringify(byConf)}`);
  console.log(`${STORE ? "Stored high + marked all. " : ""}Review file: ${review.length} medium/low.`);
  console.log(`Saved: ${outPath}`);

  await browser.close();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
