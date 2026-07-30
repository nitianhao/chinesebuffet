// Scrape one hero photo (lh3.googleusercontent.com URL) per buffet from its
// Google Maps listing, so pages render a working photo without the Places API.
// Stores it as images=[{url,widthPx,heightPx}], REPLACING broken photoReference
// entries. If no photo scrapes, CLEARS the broken photoReferences (user asked
// for broken links gone). Reuses the review scraper's session + navigation.
// Fill: always replaces images (the point). Resumable via `photoBackfilledAt`.
//
//   proof (no writes): npx tsx scripts/google-reviews/backfill-photos.ts --limit=5
//   store:             npx tsx scripts/google-reviews/backfill-photos.ts --limit=20 --store
//   one cuisine:       add --cuisine=chinese  (default: both)

import path from "node:path";
import dotenv from "dotenv";
import { init } from "@instantdb/admin";

import { loadConfig } from "./config";
import { createSession } from "./browser";
import { dismissConsent, detectBlockPage, extractHeroPhoto } from "./selectors";
import { resolveMapsUrl } from "./scrape-runner";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
  process.env.INSTANT_APP_ID ||
  "709e0e09-3347-419b-8daa-bad6889e480d";
const db = init({ appId: APP_ID, adminToken: process.env.INSTANT_ADMIN_TOKEN! });

const argv = process.argv.slice(2);
const argVal = (k: string) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=")[1] : undefined;
};
const LIMIT = parseInt(argVal("limit") || "5", 10) || 5;
const STORE = argv.includes("--store");
const CUISINES = argVal("cuisine") ? [argVal("cuisine")!] : ["chinese", "indian"];

const hasImages = (v: any) => v != null && v !== "" && v !== "[]";

/** Normalize a googleusercontent URL to a ~1200px-wide hero + derive dims. */
function normalizePhoto(u: string): { url: string; widthPx: number; heightPx: number } {
  let widthPx = 1200;
  let heightPx = 900;
  const m = u.match(/=w(\d+)-h(\d+)/);
  if (m) {
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (w > 0 && h > 0) heightPx = Math.round((1200 * h) / w);
  }
  let url = u;
  if (/=w\d+-h\d+/.test(url)) url = url.replace(/=w\d+-h\d+/, `=w1200-h${heightPx}`);
  else if (/=s\d+/.test(url)) url = url.replace(/=s\d+/, "=s1200");
  return { url, widthPx, heightPx };
}

async function fetchTargets(): Promise<any[]> {
  const out: any[] = [];
  for (const cuisine of CUISINES) {
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const r = await db.query({
        buffets: { $: { where: { cuisineType: cuisine }, limit: pageSize, offset } },
      });
      const p = r.buffets ?? [];
      out.push(...p);
      if (p.length < pageSize) break;
      offset += pageSize;
    }
  }
  return out.filter(
    (b) =>
      !b.delisted &&
      (b.url || String(b.placeId || "").startsWith("ChIJ")) &&
      b.photoBackfilledAt == null,
  );
}

async function main() {
  const config = loadConfig();
  const targets = (await fetchTargets()).slice(0, LIMIT);
  console.log(`Photo backfill ${targets.length} buffet(s) — store=${STORE} cuisines=${CUISINES}\n`);

  let got = 0;
  let cleared = 0;
  let none = 0;

  // Recycle the browser context periodically — a single long-lived context
  // leaks memory over thousands of pages and OOMs (crashed at ~718 otherwise).
  const RECYCLE_EVERY = 100;
  let processed = 0;
  let session = await createSession(config);
  try {
    for (const b of targets) {
      if (processed > 0 && processed % RECYCLE_EVERY === 0) {
        await session.close().catch(() => {});
        session = await createSession(config);
      }
      processed++;
      const mapsUrl = resolveMapsUrl({
        id: b.id,
        name: b.name,
        address: b.address,
        placeId: b.placeId ?? undefined,
        url: b.url ?? undefined,
        lat: b.lat,
        lng: b.lng,
      });
      if (!mapsUrl) continue;
      const page = await session.context.newPage();
      try {
        await page.goto(mapsUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await dismissConsent(page);
        if (await detectBlockPage(page)) {
          console.log(`  [BLOCK] ${b.name}`);
          await page.close();
          continue;
        }
        await page.waitForSelector("h1", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        let photo = await extractHeroPhoto(page);
        if (!photo) {
          await page.waitForTimeout(2500);
          photo = await extractHeroPhoto(page);
        }

        const patch: Record<string, unknown> = { photoBackfilledAt: "2026-07-26T00:00:00.000Z" };
        if (photo) {
          const norm = normalizePhoto(photo);
          patch.images = JSON.stringify([norm]);
          patch.imagesCount = 1;
          got++;
          console.log(`● ${b.name} (${b.cuisineType}) — photo ✓`);
        } else if (hasImages(b.images)) {
          patch.images = "[]"; // clear broken photoReferences
          patch.imagesCount = 0;
          cleared++;
          console.log(`● ${b.name} (${b.cuisineType}) — no photo, cleared broken`);
        } else {
          none++;
          console.log(`● ${b.name} (${b.cuisineType}) — no photo, nothing to clear`);
        }
        if (STORE) await db.transact(db.tx.buffets[b.id].update(patch));
      } catch (e) {
        console.log(`  [ERROR] ${b.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await session.close();
  }

  console.log(`\nphoto: ${got} | cleared-broken: ${cleared} | none: ${none} | store=${STORE}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
