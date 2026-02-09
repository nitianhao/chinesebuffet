/**
 * perf-snapshot-deep.mjs
 *
 * Deep performance snapshot: cold + warm (median & p95) for every route.
 * Uses ONLY built-in Node.js modules (http, https, fs, readline, perf_hooks, path, url).
 *
 * Usage:
 *   node scripts/perf-snapshot-deep.mjs
 *   BASE_URL=https://example.com node scripts/perf-snapshot-deep.mjs
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import readline from "node:readline";

// ─── Config ──────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_PATH = path.join(__dirname, "perf-routes.json");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const WARM_ITERATIONS = 5;

// Headers we want to capture in the output table
const TRACKED_HEADERS = [
  "cache-control",
  "age",
  "etag",
  "x-nextjs-cache",
  "server-timing",
  "x-perf-mw-ms",
  "x-perf-city-ms",
  "x-request-start",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Prompt the user and wait for Enter. */
function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

/** Escape pipe and newline for markdown table cells. */
const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Fetch a URL and measure timing. Returns structured result. */
function fetchOnce(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const start = performance.now();
    let ttfbMs = 0;

    const req = client.request(parsed, { method: "GET" }, (res) => {
      let byteCount = 0;
      let firstChunk = true;

      res.on("data", (chunk) => {
        if (firstChunk) {
          ttfbMs = Math.round(performance.now() - start);
          firstChunk = false;
        }
        byteCount += chunk.length;
      });

      res.on("end", () => {
        const totalMs = Math.round(performance.now() - start);

        // Collect tracked headers
        const hdrs = {};
        for (const h of TRACKED_HEADERS) {
          const val = res.headers[h];
          if (val !== undefined) {
            hdrs[h] = Array.isArray(val) ? val.join(", ") : val;
          }
        }

        resolve({
          status: res.statusCode ?? 0,
          totalMs,
          ttfbMs,
          htmlBytes: byteCount,
          headers: hdrs,
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/** Compute median of a sorted numeric array. */
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Compute p95 of a numeric array. */
function p95(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Load routes
  if (!fs.existsSync(ROUTES_PATH)) {
    console.error(`Route file not found: ${ROUTES_PATH}`);
    process.exitCode = 1;
    return;
  }

  const routeFile = JSON.parse(fs.readFileSync(ROUTES_PATH, "utf-8"));
  const routes = routeFile.routes ?? routeFile;

  if (!Array.isArray(routes) || routes.length === 0) {
    console.error("No routes found in perf-routes.json");
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Base URL : ${BASE_URL}`);
  console.log(`  Routes  : ${routes.length}`);
  console.log(`  Warm its: ${WARM_ITERATIONS}`);
  console.log("");

  // ── Phase 1: Cold run ──────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PHASE 1 — COLD RUN  (one request per route)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  if (process.stdin.isTTY) {
    await waitForEnter(
      "  ⏎  Restart the server now for a true cold run, then press Enter… ",
    );
    console.log("");
  } else {
    console.log(
      "  (non-interactive — skipping cold-restart prompt)\n",
    );
  }

  const results = [];

  for (const route of routes) {
    const url = new URL(route, BASE_URL).toString();
    process.stdout.write(`  COLD  ${route} … `);
    try {
      const cold = await fetchOnce(url);
      console.log(`${cold.totalMs} ms  (TTFB ${cold.ttfbMs} ms)`);

      // ── Phase 2: Warm run ──────────────────────────────────────────────
      const warmTotals = [];
      const warmTtfbs = [];
      let lastWarm = cold; // fallback if warm iterations somehow all fail

      process.stdout.write(`  WARM  ${route} x${WARM_ITERATIONS} … `);
      for (let i = 0; i < WARM_ITERATIONS; i++) {
        const w = await fetchOnce(url);
        warmTotals.push(w.totalMs);
        warmTtfbs.push(w.ttfbMs);
        lastWarm = w;
      }
      console.log(
        `median ${median(warmTotals)} ms  p95 ${p95(warmTotals)} ms`,
      );

      results.push({
        route,
        status: cold.status,
        coldMs: cold.totalMs,
        coldTtfbMs: cold.ttfbMs,
        warmMedianMs: median(warmTotals),
        warmP95Ms: p95(warmTotals),
        warmTtfbMedianMs: median(warmTtfbs),
        htmlKb: (lastWarm.htmlBytes / 1024).toFixed(1),
        cacheControl: lastWarm.headers["cache-control"] ?? "",
        xNextjsCache: lastWarm.headers["x-nextjs-cache"] ?? "",
        serverTiming: lastWarm.headers["server-timing"] ?? "",
        mwMs: lastWarm.headers["x-perf-mw-ms"] ?? "",
        cityMs: lastWarm.headers["x-perf-city-ms"] ?? "",
      });
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        route,
        status: "ERR",
        coldMs: "-",
        coldTtfbMs: "-",
        warmMedianMs: "-",
        warmP95Ms: "-",
        warmTtfbMedianMs: "-",
        htmlKb: "-",
        cacheControl: "",
        xNextjsCache: "",
        serverTiming: err.message,
      });
    }
  }

  // ── Output markdown table ──────────────────────────────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  const header = [
    "Route",
    "Status",
    "Cold ms",
    "Warm med ms",
    "Warm p95 ms",
    "TTFB med ms",
    "HTML KB",
    "cache-control",
    "x-nextjs-cache",
    "server-timing",
    "mw ms",
    "city ms",
  ];
  console.log(`| ${header.join(" | ")} |`);
  console.log(`| ${header.map(() => "---").join(" | ")} |`);

  for (const r of results) {
    const cells = [
      r.route,
      r.status,
      r.coldMs,
      r.warmMedianMs,
      r.warmP95Ms,
      r.warmTtfbMedianMs,
      r.htmlKb,
      r.cacheControl,
      r.xNextjsCache,
      r.serverTiming,
      r.mwMs,
      r.cityMs,
    ];
    console.log(`| ${cells.map(esc).join(" | ")} |`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const okCount = results.filter((r) => r.status >= 200 && r.status < 400).length;
  const errCount = results.length - okCount;
  console.log("");
  console.log(`  ✓ ${okCount} OK   ✗ ${errCount} errors   (${routes.length} total)`);

  if (errCount > 0) {
    process.exitCode = 1;
  }

  // ── JSON dump for CI / diffing ─────────────────────────────────────────
  const jsonPath = path.join(__dirname, "..", "perf-snapshot-deep-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2) + "\n");
  console.log(`  Results saved → ${path.relative(path.join(__dirname, ".."), jsonPath)}`);
  console.log("");
}

main().catch((err) => {
  console.error("perf-snapshot-deep failed:", err);
  process.exitCode = 1;
});
