import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type SmokeConfig = {
  baseUrl: string;
  timeoutMs: number;
  routesPath: string;
};

const args = process.argv.slice(2);

const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const toPositiveNumber = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const getConfig = (): SmokeConfig => {
  const timeoutMs =
    toPositiveNumber(readArg("timeout-ms")) ??
    toPositiveNumber(readArg("max-ms")) ??
    toPositiveNumber(process.env.SMOKE_TIMEOUT_MS) ??
    2000;

  const baseUrl =
    readArg("base-url") ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    timeoutMs,
    routesPath: resolve(__dirname, "smoke-routes.json"),
  };
};

const normalizeRoute = (route: string) =>
  route.startsWith("/") ? route : `/${route}`;

const labelForError = (error: unknown) => {
  if (!error || typeof error !== "object") return "ERROR";
  if ("name" in error && (error as { name?: string }).name === "AbortError") {
    return "TIMEOUT";
  }
  return "ERROR";
};

const smokeRoute = async (
  route: string,
  baseUrl: string,
  timeoutMs: number
) => {
  const normalized = normalizeRoute(route);
  const url = new URL(normalized, baseUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  let status: number | undefined;
  let errorLabel: string | undefined;

  try {
    const response = await fetch(url, { signal: controller.signal });
    status = response.status;
    await response.arrayBuffer();
  } catch (error) {
    errorLabel = labelForError(error);
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - start);
  const isSlow = durationMs > timeoutMs;
  const isOk = status === 200 && !isSlow && !errorLabel;

  const statusLabel = errorLabel ?? String(status ?? "ERROR");
  const suffix = isSlow ? " (slow)" : "";
  console.log(`${normalized} -> ${statusLabel} in ${durationMs}ms${suffix}`);

  return { isOk, status: statusLabel, durationMs, isSlow };
};

const main = async () => {
  const { baseUrl, timeoutMs, routesPath } = getConfig();
  const rawRoutes = await readFile(routesPath, "utf8");
  const routes = JSON.parse(rawRoutes) as unknown;

  if (!Array.isArray(routes) || routes.some((route) => typeof route !== "string")) {
    throw new Error("smoke-routes.json must be an array of strings.");
  }

  console.log(
    `Smoke routes: ${routes.length} checks, max ${timeoutMs}ms each, base ${baseUrl}`
  );

  let failures = 0;

  for (const route of routes) {
    const result = await smokeRoute(route, baseUrl, timeoutMs);
    if (!result.isOk) failures += 1;
  }

  if (failures > 0) {
    console.error(`Smoke failed: ${failures} route(s) failed.`);
    process.exit(1);
  }

  console.log("Smoke passed.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
