// Browser lifecycle for the review scraper.
//
// Uses a PERSISTENT Chromium context backed by a git-ignored profile directory.
// Signing in to Google once (via `--login`, done manually by the user) stores
// the session in that profile, and every later run reuses it. A signed-in
// session is what gets past Google's "limited view" (the reduced listing with
// no reviews that Maps serves to anonymous/automation clients).
//
// Uses the `playwright` package bundled with the already-installed
// `@playwright/test` — no new dependency.

import fs from "node:fs";
import { chromium, BrowserContext } from "playwright";
import { ScraperConfig } from "./config";

// A realistic, current desktop Chrome UA. Kept here (not scattered) so it is
// easy to update when it drifts.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Heavy media URL patterns safe to block. We match by URL glob and intercept
// ONLY these — never a blanket "**/*" handler. A blanket route that calls
// route.continue() for every request deadlocks navigation on Google's consent
// redirect (verified: goto never returns). Narrow globs avoid that entirely.
const BLOCKED_MEDIA_GLOBS = ["**/*.{mp4,webm,ogg,m4a,mp3,mov}"];

// Google shows an EU cookie/consent interstitial (consent.google.com) before
// Maps. Clicking "Reject all" there loops back to the interstitial in headless
// automation. Pre-setting the SOCS consent-choice cookie skips the wall so the
// listing loads directly. This records a consent choice rather than bypassing
// an access control. dismissConsent() remains as a fallback for other variants.
const CONSENT_COOKIE = {
  name: "SOCS",
  value:
    "CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTA5LjA2X3AwGgJlbiACGgYIgLC9rgY",
  domain: ".google.com",
  path: "/",
};

export type BrowserSession = {
  context: BrowserContext;
  close: () => Promise<void>;
};

/**
 * Open a persistent browser context. `headlessOverride` lets the --login flow
 * force a visible window regardless of the configured default.
 */
export async function createSession(
  config: ScraperConfig,
  headlessOverride?: boolean,
): Promise<BrowserSession> {
  fs.mkdirSync(config.userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: headlessOverride ?? config.headless,
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
    locale: config.locale,
    timezoneId: config.timezone,
    extraHTTPHeaders: { "Accept-Language": `${config.locale},en;q=0.9` },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // Only relevant before the profile is signed in; harmless afterwards.
  await context.addCookies([CONSENT_COOKIE]).catch(() => {});

  // Block heavy media by URL glob only — never a blanket route (would hang goto).
  for (const glob of BLOCKED_MEDIA_GLOBS) {
    await context.route(glob, (route) => route.abort());
  }

  return { context, close: () => context.close() };
}
