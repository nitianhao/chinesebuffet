// Yelp single-page extractor — thin wrapper over scrape-core (used for spot
// checks / debugging a single URL). Attaches over CDP to a REAL Chrome you
// launch yourself (DataDome hard-blocks Playwright's bundled Chromium):
//
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-yelp-scraper"
//
//   npx tsx scripts/yelp/extract-one.ts --url="https://www.yelp.com/biz/india-garden-indianapolis"
//
// If DataDome shows a slider/press-and-hold in that window, solve it by hand;
// the scraper waits for the real page, then extracts and writes JSON.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { scrapeBuffet } from "./scrape-core";

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
const URL = args["url"] ?? "https://www.yelp.com/biz/india-garden-indianapolis";
const CDP = args["cdp"] ?? "http://localhost:9222";
const OUT_DIR = path.join(process.cwd(), ".runtime", "yelp", "out");

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP);
  } catch {
    console.error(
      `Could not attach to Chrome at ${CDP}. Launch it with:\n` +
        `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\\n` +
        `    --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-yelp-scraper"\n`,
    );
    process.exit(3);
  }

  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log(`Scraping (via real Chrome @ ${CDP}): ${URL}`);
  const r = await scrapeBuffet(page, URL, { blockWaitMs: 180_000 });

  if (!r.ok) {
    console.log(`Failed: ${r.reason}${r.blocked ? " (solve the DataDome challenge and retry)" : ""}`);
    await browser.close();
    process.exit(2);
  }

  const slug = URL.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 80);
  const outPath = path.join(OUT_DIR, `${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(r.data, null, 2), "utf8");

  console.log("\n=== Extracted (11 fields) ===");
  console.log(JSON.stringify(r.data, null, 2));
  console.log(`\nSaved JSON: ${outPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
