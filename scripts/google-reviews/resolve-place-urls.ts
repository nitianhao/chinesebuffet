// Resolve a Google Maps listing URL for buffets that only have a Foursquare
// (fsq:) place id, so the review scraper (which uses buffet.url when present)
// can scrape them. No Google API key — drives Maps search in the existing
// persistent Chrome profile and VERIFIES each hit by coordinate distance.
//
// STEP 1 = proof of concept: resolve N samples, print match + confidence, no
// DB writes. Run: npx tsx scripts/google-reviews/resolve-place-urls.ts --limit=5

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { init } from "@instantdb/admin";

import { loadConfig } from "./config";
import { createSession } from "./browser";
import { dismissConsent, detectBlockPage } from "./selectors";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
  process.env.INSTANT_APP_ID ||
  "709e0e09-3347-419b-8daa-bad6889e480d";
const db = init({ appId: APP_ID, adminToken: process.env.INSTANT_ADMIN_TOKEN! });

const argv = process.argv.slice(2);
const argInt = (k: string, d: number) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? parseInt(a.split("=")[1], 10) || d : d;
};
const LIMIT = argInt("limit", 5);
const STORE = argv.includes("--store");

/** Haversine distance in metres. */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/** Loose name check: containment (with and without spaces) or shared first token. */
function nameMatches(stored: string, listing: string): boolean {
  const a = norm(stored);
  const b = norm(listing);
  if (!a || !b) return false;
  const as = a.replace(/ /g, "");
  const bs = b.replace(/ /g, "");
  return (
    a.includes(b) ||
    b.includes(a) ||
    as.includes(bs) || // "q q" vs "qq china buffett" -> qq ⊂ qqchinabuffett
    bs.includes(as) ||
    a.split(" ")[0] === b.split(" ")[0]
  );
}

/**
 * Pull the listing's coords from a place URL. Two shapes occur:
 *   …/@lat,lng,17z/…                 (map-centered on the place)
 *   …/data=!…!3d<lat>!4d<lng>…       (place data blob; the authoritative pin)
 * Prefer the !3d!4d pin when present, else fall back to the @ center.
 */
function coordsFromUrl(url: string): { lat: number; lng: number } | null {
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return { lat: parseFloat(pin[1]), lng: parseFloat(pin[2]) };
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return at ? { lat: parseFloat(at[1]), lng: parseFloat(at[2]) } : null;
}

/** Listing name from a /maps/place/<Name>/… URL. */
function nameFromUrl(url: string): string {
  const m = url.match(/\/maps\/place\/([^/@]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
}

async function fetchFsqBuffets(): Promise<any[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: any[] = [];
  while (true) {
    const r = await db.query({
      buffets: { $: { where: { cuisineType: "chinese" }, limit: pageSize, offset } },
    });
    const page = r.buffets ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all.filter((b) => String(b.placeId || "").startsWith("fsq:"));
}

type Row = {
  id: string;
  name: string;
  city: string;
  state: string;
  conf: string;
  dist: number | null;
  nameOk: boolean;
  listingName: string;
  url: string;
};

async function main() {
  const config = loadConfig();
  const all = await fetchFsqBuffets();
  // Resumable: skip buffets already resolved (placeUrlConfidence set).
  const pending = all.filter((b) => b.placeUrlConfidence == null);
  const buffets = pending.slice(0, LIMIT);
  console.log(
    `fsq buffets: ${all.length} | unresolved: ${pending.length} | this run: ${buffets.length} | store=${STORE}\n`,
  );

  const review: Row[] = [];
  const counts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let consecBlocks = 0; // stop the run if Google starts hard-blocking

  const session = await createSession(config);
  try {
    for (const b of buffets) {
      // Coordinate-anchor the search on the buffet's known lat/lng so Google
      // returns matches LOCAL to that point; we then pick the nearest one.
      const anchor = b.lat != null && b.lng != null ? `/@${b.lat},${b.lng},15z` : "";
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(b.name)}${anchor}?hl=en`;
      const page = await session.context.newPage();
      try {
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await dismissConsent(page);

        const block = await detectBlockPage(page);
        if (block) {
          consecBlocks++;
          console.log(`  [BLOCK ${block}] ${b.name} (${b.cityName}, ${b.state}) [${consecBlocks} in a row]`);
          await page.close();
          if (consecBlocks >= 5) {
            console.log("\n⚠ 5 consecutive blocks — stopping. Re-run to resume (blocked buffets left unresolved).");
            break;
          }
          continue;
        }
        consecBlocks = 0;

        // Either Google redirected to a single place, or it shows a results
        // feed — wait for whichever, then read the resolved place URL.
        await page
          .waitForFunction(
            () =>
              location.href.includes("/maps/place/") ||
              !!document.querySelector("a.hfpxzc"),
            { timeout: 20_000 },
          )
          .catch(() => {});

        // Gather candidate place URLs. Either Google redirected to a single
        // place, or it shows a feed of `a.hfpxzc` results — take ALL of them
        // and pick the one nearest our stored coordinates.
        const candidateUrls: string[] = [];
        if (page.url().includes("/maps/place/")) {
          await page
            .waitForFunction(() => /!3d-?\d|@-?\d/.test(location.href), { timeout: 8_000 })
            .catch(() => {});
          candidateUrls.push(page.url());
        }
        const feed = await page
          .$$eval("a.hfpxzc", (els) => els.map((e) => (e as HTMLAnchorElement).href))
          .catch(() => [] as string[]);
        candidateUrls.push(...feed);

        // Choose the candidate closest to the buffet's known location.
        let resolvedUrl = "";
        let coords: { lat: number; lng: number } | null = null;
        let dist: number | null = null;
        let listingName = "";
        for (const u of candidateUrls) {
          const c = coordsFromUrl(u);
          if (!c || b.lat == null || b.lng == null) continue;
          const d = distanceM(b.lat, b.lng, c.lat, c.lng);
          if (dist == null || d < dist) {
            dist = d;
            coords = c;
            resolvedUrl = u;
            listingName = nameFromUrl(u);
          }
        }
        // Fall back to the first candidate even if it had no parseable coords.
        if (!resolvedUrl && candidateUrls.length) {
          resolvedUrl = candidateUrls[0];
          listingName = nameFromUrl(resolvedUrl);
        }

        const nameOk = nameMatches(b.name, listingName);
        const conf = !resolvedUrl
          ? "LOW"
          : dist != null && dist <= 150 && nameOk
            ? "HIGH"
            : (dist != null && dist <= 150 && !nameOk) || (dist != null && dist <= 500 && nameOk)
              ? "MEDIUM"
              : "LOW";
        counts[conf]++;

        console.log(`  [${conf}] ${b.name} (${b.cityName}, ${b.state})`);
        console.log(`      listing: "${listingName || "(none)"}"  dist: ${dist != null ? dist.toFixed(0) + "m" : "n/a"}  nameMatch: ${nameOk}`);

        if (STORE) {
          // Mark every row so resume skips it. Only HIGH sets buffet.url (what
          // the review scraper actually navigates); medium/low store the
          // confidence tag only and go to the review file for manual promotion.
          const patch: Record<string, unknown> = { placeUrlConfidence: conf.toLowerCase() };
          if (conf === "HIGH") patch.url = resolvedUrl;
          await db.transact(db.tx.buffets[b.id].update(patch));
        }
        if (conf !== "HIGH") {
          review.push({
            id: b.id,
            name: b.name,
            city: b.cityName,
            state: b.state,
            conf,
            dist,
            nameOk,
            listingName,
            url: resolvedUrl,
          });
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

  console.log(`\nCounts: HIGH ${counts.HIGH} | MEDIUM ${counts.MEDIUM} | LOW ${counts.LOW}`);
  if (STORE) console.log(`Stored ${counts.HIGH} high-confidence url(s) to buffet.url + placeUrlConfidence='high'.`);
  if (review.length) {
    const outDir = path.join(process.cwd(), ".runtime", "google-reviews");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "place-url-review.json");
    fs.writeFileSync(outPath, JSON.stringify(review, null, 2));
    console.log(`Wrote ${review.length} non-high row(s) for review to ${outPath}`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
