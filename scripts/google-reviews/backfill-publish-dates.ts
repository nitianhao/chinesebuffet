// One-time (idempotent) backfill: fix scraped reviews whose `publishAt` holds a
// relative label (e.g. "3 weeks ago") instead of an ISO date. The site renders
// `new Date(publishAt)` and sorts by publishAt DESC, so a label shows as
// "Invalid Date" and sorts wrong. We move the ISO date (from publishedAtDate)
// into publishAt and keep the label in relativeTime — matching the Apify rows.
//
// Safe to rerun: only touches rows whose publishAt does not already parse as a
// date. Only affects reviewOrigin=google_maps_playwright.
//
//   npx tsx scripts/google-reviews/backfill-publish-dates.ts --dry-run
//   npx tsx scripts/google-reviews/backfill-publish-dates.ts

import path from "node:path";
import dotenv from "dotenv";
import { init } from "@instantdb/admin";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const ORIGIN = "google_maps_playwright";
const TXN_BATCH = 20;

function getDb() {
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || "709e0e09-3347-419b-8daa-bad6889e480d";
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) throw new Error("Missing INSTANT_ADMIN_TOKEN in .env.local");
  return init({ appId, adminToken });
}

const isValidDate = (s?: string | null): boolean => !!s && !Number.isNaN(Date.parse(s));

async function main() {
  const db = getDb();

  // Fetch all scraped reviews (paginated).
  const rows: any[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res: any = await db.query({
      reviews: { $: { where: { reviewOrigin: ORIGIN }, limit, offset } },
    });
    const batch = res.reviews ?? [];
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  const toFix = rows.filter((r) => !isValidDate(r.publishAt));
  console.log(`Scraped reviews: ${rows.length} | needing fix: ${toFix.length}`);

  if (DRY_RUN) {
    for (const r of toFix.slice(0, 5)) {
      console.log(
        `  would fix ${r.id}: publishAt "${r.publishAt}" -> "${r.publishedAtDate ?? ""}", relativeTime -> "${r.publishAt}"`,
      );
    }
    console.log(`(dry-run — no writes)`);
    return;
  }

  let fixed = 0;
  for (let i = 0; i < toFix.length; i += TXN_BATCH) {
    const batch = toFix.slice(i, i + TXN_BATCH).map((r) =>
      db.tx.reviews[r.id].update({
        publishAt: r.publishedAtDate ?? "",
        // Preserve the human label in relativeTime (only if not already set).
        relativeTime: r.relativeTime || r.publishAt || null,
      }),
    );
    if (batch.length) {
      await db.transact(batch);
      fixed += batch.length;
      console.log(`  fixed ${fixed}/${toFix.length}`);
    }
  }
  console.log(`Done. Fixed ${fixed} reviews.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
