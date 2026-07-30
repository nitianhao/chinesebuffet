// Backfill Google-Maps structured data (hours, price, priceRange, website,
// phone) onto fsq-sourced buffets that lack it. Reuses the review scraper's
// session + navigation; reads each buffet's stored Maps `url`. Fill-empty-only
// (never overwrites existing values). Resumable via `structuredBackfilledAt`.
//
//   proof (no writes): npx tsx scripts/google-reviews/backfill-structured.ts --limit=5
//   store:             npx tsx scripts/google-reviews/backfill-structured.ts --limit=20 --store

import path from "node:path";
import dotenv from "dotenv";
import { init } from "@instantdb/admin";

import { loadConfig } from "./config";
import { createSession } from "./browser";
import {
  dismissConsent,
  detectBlockPage,
  extractPlaceDetails,
  openAboutPanel,
  extractAboutAttributes,
  PlaceDetails,
} from "./selectors";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
  process.env.INSTANT_APP_ID ||
  "709e0e09-3347-419b-8daa-bad6889e480d";
const db = init({ appId: APP_ID, adminToken: process.env.INSTANT_ADMIN_TOKEN! });

const argv = process.argv.slice(2);
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1], 10) || 5 : 5;
})();
const STORE = argv.includes("--store");
// Which cuisine to target. Default 'chinese' preserves the original fsq behavior.
const CUISINE = (() => {
  const a = argv.find((x) => x.startsWith("--cuisine="));
  return a ? a.split("=")[1].trim().toLowerCase() : "chinese";
})();

const isMapsUrl = (u?: string) => !!u && /google\.[a-z.]+\/maps/i.test(u);
const has = (v: any) => v != null && v !== "" && v !== "[]" && v !== "{}";
// Canonical place-id Maps URL, forced to US English (gl=US) so attribute labels
// come back American ("Takeout"/"Restroom"/"Parking") not British.
const placeIdUrl = (placeId: string) =>
  `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}&hl=en&gl=US`;

// "11 am to 2 am" -> "11 AM to 2 AM"; "Closed" stays.
const normTimes = (t: string) => t.replace(/\bam\b/gi, "AM").replace(/\bpm\b/gi, "PM");

/** Build the DB patch from extracted details — only fields currently empty. */
function buildPatch(b: any, d: PlaceDetails): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!has(b.hours) && d.hours && d.hours.length) {
    patch.hours = JSON.stringify(d.hours.map((r) => ({ day: r.day, hours: normTimes(r.times) })));
  }
  if (!has(b.price) && d.price) patch.price = d.price;
  if (!has(b.priceRange) && d.priceUnits) {
    patch.priceRange = JSON.stringify({
      startPrice: { currencyCode: "USD", units: d.priceUnits.start },
      endPrice: { currencyCode: "USD", units: d.priceUnits.end },
    });
  }
  if (!has(b.website) && d.website) patch.website = d.website;
  if (!has(b.phone) && d.phone) patch.phone = d.phone;
  // Amenity groups from the Maps "About" tab → buffet.additionalInfo, which the
  // buffet page renders (Amenities & Services). Fill-empty-only.
  if (!has(b.additionalInfo) && d.additionalInfo && Object.keys(d.additionalInfo).length > 0) {
    patch.additionalInfo = JSON.stringify(d.additionalInfo);
  }
  return patch;
}

async function fetchTargets(): Promise<any[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: any[] = [];
  while (true) {
    const r = await db.query({
      buffets: { $: { where: { cuisineType: CUISINE }, limit: pageSize, offset } },
    });
    const p = r.buffets ?? [];
    all.push(...p);
    if (p.length < pageSize) break;
    offset += pageSize;
  }
  // Indian buffets carry Google placeIds (ChIJ…) but no stored Maps `url`; we
  // navigate them via the placeId URL. Chinese fsq buffets use their resolved
  // high-confidence `url`. Both resume by skipping structuredBackfilledAt.
  if (CUISINE === "indian") {
    return all.filter(
      (b) =>
        String(b.placeId || "").startsWith("ChIJ") &&
        b.structuredBackfilledAt == null, // resumable: skip already-done
    );
  }
  return all.filter(
    (b) =>
      String(b.placeId || "").startsWith("fsq:") &&
      b.placeUrlConfidence === "high" &&
      isMapsUrl(b.url) &&
      b.structuredBackfilledAt == null, // resumable: skip already-done
  );
}

async function main() {
  const config = loadConfig();
  const targets = (await fetchTargets()).slice(0, LIMIT);
  console.log(`Backfill ${targets.length} ${CUISINE} buffet(s) — store=${STORE}\n`);

  const filled: Record<string, number> = { hours: 0, price: 0, priceRange: 0, website: 0, phone: 0, additionalInfo: 0 };
  let empty = 0;

  const session = await createSession(config);
  try {
    for (const b of targets) {
      const page = await session.context.newPage();
      try {
        const targetUrl = CUISINE === "indian" ? placeIdUrl(b.placeId) : b.url;
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await dismissConsent(page);
        if (await detectBlockPage(page)) {
          console.log(`  [BLOCK] ${b.name}`);
          await page.close();
          continue;
        }
        await page.waitForSelector("h1", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        let d = await extractPlaceDetails(page);
        if (!d.phone && !d.website && (!d.hours || !d.hours.length)) {
          await page.waitForTimeout(3500);
          d = await extractPlaceDetails(page);
        }

        // Amenity groups from the "About" tab (the Amenities & Services section).
        await openAboutPanel(page).catch(() => false);
        const additionalInfo = await extractAboutAttributes(page).catch(() => ({}));
        if (additionalInfo && Object.keys(additionalInfo).length > 0) {
          d = { ...d, additionalInfo };
        }

        const patch = buildPatch(b, d);
        const keys = Object.keys(patch);
        if (!keys.length) empty++;
        for (const k of keys) filled[k] = (filled[k] || 0) + 1;

        console.log(`● ${b.name} — fills: ${keys.length ? keys.join(", ") : "(none)"}`);

        if (STORE) {
          await db.transact(
            db.tx.buffets[b.id].update({ ...patch, structuredBackfilledAt: new Date().toISOString() }),
          );
        }
      } catch (e) {
        console.log(`  [ERROR] ${b.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await session.close();
  }

  console.log(`\nFields filled across batch: ${JSON.stringify(filled)}`);
  console.log(`Buffets with nothing to fill: ${empty}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
