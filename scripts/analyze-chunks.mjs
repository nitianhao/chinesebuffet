#!/usr/bin/env node

/**
 * analyze-chunks.mjs
 *
 * Post-build report: lists the biggest client JS chunks and attempts to
 * identify which libraries contribute to each one via best-effort string
 * scanning.  Uses only built-in Node modules — no extra deps.
 *
 * Usage:
 *   npm run perf:chunks            # after a successful build
 *   node scripts/analyze-chunks.mjs [N]   # show top N chunks (default 15)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, ".next");
const STATIC_DIR = path.join(BUILD_DIR, "static", "chunks");

const TOP_N = Number(process.argv[2]) || 15;
const DEEP_SCAN_N = 5; // how many of the top chunks to scan for library hints

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllJSFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...getAllJSFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function sizeKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function pad(str, len) {
  return String(str).padEnd(len);
}
function rpad(str, len) {
  return String(str).padStart(len);
}

// Best-effort library detection: we look for recognisable strings inside the
// minified bundle.  This is intentionally fuzzy — it surfaces the big obvious
// contributors without needing source maps.
const LIBRARY_PATTERNS = [
  // name shown in report   // regex applied to chunk source
  ["react-dom", /react-dom/i],
  ["react", /\breact\b/i],
  ["next/router", /next\/router|next\/dist\/client\/router/i],
  ["next/image", /next\/image|next\/dist\/client\/image/i],
  ["next (framework)", /next\/dist/i],
  ["scheduler", /\bscheduler\b/i],
  ["leaflet", /\bleaflet\b/i],
  ["leaflet.markercluster", /markercluster/i],
  ["react-leaflet", /react-leaflet/i],
  ["minisearch", /\bminisearch\b/i],
  ["zod", /\bzod\b/i],
  ["framer-motion", /framer-motion/i],
  ["lodash", /\blodash\b/i],
  ["@instantdb", /instantdb/i],
  ["mapbox-gl", /mapbox-gl|mapboxgl/i],
  ["tailwindcss (runtime)", /tailwindcss/i],
  ["react-hook-form", /react-hook-form/i],
  ["date-fns", /\bdate-fns\b/i],
  ["moment", /\bmoment\b/i],
  ["axios", /\baxios\b/i],
  ["swr", /\bswr\b/i],
  ["@tanstack/query", /tanstack\/query|react-query/i],
  ["clsx", /\bclsx\b/i],
  ["classnames", /\bclassnames\b/i],
  ["cheerio", /\bcheerio\b/i],
  ["p-limit", /\bp-limit\b/i],
];

function detectLibraries(source) {
  const found = [];
  for (const [name, re] of LIBRARY_PATTERNS) {
    const matches = source.match(new RegExp(re, "g"));
    if (matches && matches.length > 0) {
      found.push({ name, hits: matches.length });
    }
  }
  // sort by number of occurrences desc
  found.sort((a, b) => b.hits - a.hits);
  return found;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error("Error: .next directory not found. Run `npm run build` first.");
    process.exit(1);
  }

  // 1. Read manifests for context ------------------------------------------
  const buildManifestPath = path.join(BUILD_DIR, "build-manifest.json");
  const loadableManifestPath = path.join(BUILD_DIR, "react-loadable-manifest.json");

  let buildManifest = null;
  let loadableManifest = null;

  if (fs.existsSync(buildManifestPath)) {
    try {
      buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));
    } catch { /* ignore */ }
  }
  if (fs.existsSync(loadableManifestPath)) {
    try {
      loadableManifest = JSON.parse(fs.readFileSync(loadableManifestPath, "utf8"));
    } catch { /* ignore */ }
  }

  // 2. Enumerate JS chunks -------------------------------------------------
  const files = getAllJSFiles(STATIC_DIR).map((f) => {
    const stats = fs.statSync(f);
    return {
      path: f,
      relative: path.relative(BUILD_DIR, f),
      name: path.basename(f),
      bytes: stats.size,
    };
  });

  if (files.length === 0) {
    console.error("No JS chunks found in .next/static/chunks/");
    process.exit(1);
  }

  files.sort((a, b) => b.bytes - a.bytes);

  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);

  // 3. Print summary -------------------------------------------------------
  console.log("==========================================================");
  console.log("  Chunk Contents Report");
  console.log("==========================================================");
  console.log();
  console.log(`Total client JS chunks: ${files.length}`);
  console.log(`Total size:             ${sizeKB(totalBytes)} KB`);

  if (buildManifest) {
    const pageCount = Object.keys(buildManifest.pages || {}).length;
    console.log(`Pages in manifest:      ${pageCount}`);
  }
  if (loadableManifest) {
    const dynamicCount = Object.keys(loadableManifest).length;
    console.log(`Dynamic imports:        ${dynamicCount}`);
  }

  // 4. Top N table ---------------------------------------------------------
  console.log();
  console.log(`Top ${Math.min(TOP_N, files.length)} chunks by size:`);
  console.log("-".repeat(72));
  console.log(
    `${pad("#", 4)} ${pad("File", 44)} ${rpad("Size (KB)", 10)} ${rpad("% total", 8)}`,
  );
  console.log("-".repeat(72));

  const topFiles = files.slice(0, TOP_N);
  topFiles.forEach((f, i) => {
    const pct = ((f.bytes / totalBytes) * 100).toFixed(1);
    console.log(
      `${pad(String(i + 1) + ".", 4)} ${pad(f.relative, 44)} ${rpad(sizeKB(f.bytes), 10)} ${rpad(pct + "%", 8)}`,
    );
  });
  console.log("-".repeat(72));

  // 5. Deep-scan top DEEP_SCAN_N -------------------------------------------
  console.log();
  console.log(
    `Library hints for top ${Math.min(DEEP_SCAN_N, topFiles.length)} chunks (best-effort string scan):`,
  );

  const deepFiles = topFiles.slice(0, DEEP_SCAN_N);
  for (const f of deepFiles) {
    console.log();
    console.log(`  ${f.relative}  (${sizeKB(f.bytes)} KB)`);

    let source;
    try {
      source = fs.readFileSync(f.path, "utf8");
    } catch {
      console.log("    (could not read file)");
      continue;
    }

    const libs = detectLibraries(source);
    if (libs.length === 0) {
      console.log("    No recognised library signatures found.");
    } else {
      for (const lib of libs) {
        console.log(`    - ${lib.name}  (${lib.hits} occurrence${lib.hits > 1 ? "s" : ""})`);
      }
    }
  }

  // 6. @next/bundle-analyzer hint ------------------------------------------
  console.log();
  try {
    // Check if bundle-analyzer is available
    const resolved = path.join(ROOT, "node_modules", "@next", "bundle-analyzer");
    if (fs.existsSync(resolved)) {
      console.log(
        "Tip: @next/bundle-analyzer is installed. Run `ANALYZE=1 npm run build` for an interactive treemap.",
      );
    } else {
      console.log(
        "Tip: Install @next/bundle-analyzer for interactive treemaps:",
      );
      console.log(
        "  npm i -D @next/bundle-analyzer",
      );
      console.log(
        "  Then wrap next.config.js and run: ANALYZE=1 npm run build",
      );
    }
  } catch {
    // ignore
  }

  console.log();
}

main();
