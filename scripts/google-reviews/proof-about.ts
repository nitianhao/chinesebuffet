// PROOF ONLY (no DB writes): run the new "About" tab attribute extractor on a
// handful of Indian buffets and print what it captures. Used to validate the
// selectors before wiring storage into backfill-structured.ts.
//
//   npx tsx scripts/google-reviews/proof-about.ts --limit=5
//
// Indian buffets have Google placeIds (ChIJ…) but no stored Maps `url`, so we
// open them via the canonical place-id URL.

import path from "node:path";
import dotenv from "dotenv";
import { init } from "@instantdb/admin";

import { loadConfig } from "./config";
import { createSession } from "./browser";
import {
  dismissConsent,
  detectBlockPage,
  openAboutPanel,
  extractAboutAttributes,
} from "./selectors";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
  process.env.INSTANT_APP_ID ||
  "709e0e09-3347-419b-8daa-bad6889e480d";
const db = init({ appId: APP_ID, adminToken: process.env.INSTANT_ADMIN_TOKEN! }) as any;

const argv = process.argv.slice(2);
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1], 10) || 5 : 5;
})();

const placeIdUrl = (placeId: string) =>
  `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}&hl=en&gl=US`;

async function fetchIndianTargets(limit: number) {
  const r = await db.query({
    buffets: {
      $: { where: { cuisineType: "indian" }, limit: 400, fields: ["id", "name", "placeId"] },
    },
  });
  return (r.buffets ?? [])
    .filter((b: any) => typeof b.placeId === "string" && b.placeId.startsWith("ChIJ"))
    .slice(0, limit);
}

async function main() {
  const config = loadConfig();
  const targets = await fetchIndianTargets(LIMIT);
  console.log(`PROOF: extracting About attributes for ${targets.length} Indian buffet(s)\n`);

  const session = await createSession(config);
  try {
    for (const b of targets) {
      const page = await session.context.newPage();
      try {
        await page.goto(placeIdUrl(b.placeId), { waitUntil: "domcontentloaded", timeout: 45_000 });
        await dismissConsent(page);
        if (await detectBlockPage(page)) {
          console.log(`\n=== ${b.name} ===\n  [BLOCK PAGE]`);
          await page.close();
          continue;
        }
        await page.waitForSelector("h1", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(2000);

        const opened = await openAboutPanel(page, true);
        const additionalInfo = await extractAboutAttributes(page);

        // Raw dump: every h2/h3 heading + its list items, so we can see the
        // actual structure if the whitelist/heuristic missed anything.
        const raw = await page.evaluate(() => {
          const dump: Array<{ heading: string; items: string[] }> = [];
          Array.from(document.querySelectorAll("h2, h3")).forEach((h) => {
            const heading = (h.textContent || "").replace(/\s+/g, " ").trim();
            if (!heading || heading.length > 40) return;
            let ul: Element | null = null;
            let c: Element | null = h.parentElement;
            for (let i = 0; i < 3 && c && !ul; i++) { ul = c.querySelector("ul"); c = c.parentElement; }
            const items = ul
              ? Array.from(ul.querySelectorAll("li"))
                  .map((li) => (li.getAttribute("aria-label") || li.textContent || "").replace(/\s+/g, " ").trim())
                  .filter(Boolean)
                  .slice(0, 12)
              : [];
            if (items.length) dump.push({ heading, items });
          });
          return dump;
        });

        console.log(`\n=== ${b.name} (${b.placeId}) ===`);
        console.log(`  about panel opened: ${opened}`);
        console.log(`  EXTRACTED additionalInfo:`);
        console.log(JSON.stringify(additionalInfo, null, 2).split("\n").map((l) => "    " + l).join("\n"));
        console.log(`  RAW headings+items seen:`);
        console.log(JSON.stringify(raw, null, 2).split("\n").map((l) => "    " + l).join("\n"));
      } catch (e) {
        console.log(`\n=== ${b.name} ===\n  [ERROR] ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await session.close();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
