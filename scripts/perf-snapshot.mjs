import http from "http";
import https from "https";
import { performance } from "perf_hooks";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_PATHS = [
  "/",
  "/chinese-buffets/states/ny",
  "/chinese-buffets/los-angeles-ca",
  "/chinese-buffets/los-angeles-ca/neighborhoods/downtown",
  "/chinese-buffets/los-angeles-ca/china-buffet",
];

const inputArgs = process.argv.slice(2);
const targetUrls = (inputArgs.length ? inputArgs : DEFAULT_PATHS).map((entry) =>
  entry.startsWith("http") ? entry : new URL(entry, DEFAULT_BASE_URL).toString(),
);

const escapeTableCell = (value) => String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");

const formatHeaders = (headers) =>
  Object.keys(headers)
    .sort()
    .map((key) => `${key}=${headers[key]}`)
    .join("; ");

const fetchOnce = (url) =>
  new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    const start = performance.now();

    const request = client.request(
      parsedUrl,
      { method: "GET" },
      (response) => {
        let byteCount = 0;
        response.on("data", (chunk) => {
          byteCount += chunk.length;
        });
        response.on("end", () => {
          const timeMs = Math.round(performance.now() - start);
          const headers = Object.fromEntries(
            Object.entries(response.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(", ") : value ?? "",
            ]),
          );

          resolve({
            status: response.statusCode ?? 0,
            timeMs,
            headers,
            htmlBytes: byteCount,
          });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });

const run = async () => {
  console.log(
    "Reminder: restart the server before running this script for cold results.",
  );

  const results = [];

  for (const url of targetUrls) {
    const cold = await fetchOnce(url);
    results.push({ url, run: "cold", ...cold });

    const warm = await fetchOnce(url);
    results.push({ url, run: "warm", ...warm });
  }

  console.log("");
  console.log(
    "| URL | Run | Status | Time (ms) | HTML (KB) | Server-Timing | Headers |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- |");

  for (const result of results) {
    const htmlKb = (result.htmlBytes / 1024).toFixed(1);
    const serverTiming = result.headers["server-timing"] || "";
    const headersValue = formatHeaders(result.headers);

    console.log(
      `| ${escapeTableCell(result.url)} | ${result.run} | ${result.status} | ${result.timeMs} | ${htmlKb} | ${escapeTableCell(serverTiming)} | ${escapeTableCell(headersValue)} |`,
    );
  }
};

run().catch((error) => {
  console.error("perf-snapshot failed:", error);
  process.exitCode = 1;
});
