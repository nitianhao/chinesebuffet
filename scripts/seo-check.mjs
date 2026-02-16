#!/usr/bin/env node
/**
 * SEO check: fetch a set of URLs and print canonical + robots from HTML.
 * Run with dev server up: npm run dev (in another terminal), then node scripts/seo-check.mjs
 * Or against production: BASE_URL=https://yoursite.com node scripts/seo-check.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const URLS = [
  { path: '/', label: 'Homepage' },
  { path: '/search', label: 'Search' },
  { path: '/saved', label: 'Saved' },
  { path: '/chinese-buffets/states', label: 'States hub' },
  { path: '/chinese-buffets/cities', label: 'Cities hub' },
  { path: '/chinese-buffets/neighborhoods', label: 'Neighborhoods hub' },
  { path: '/chinese-buffets/los-angeles-ca', label: 'City (LA)' },
  { path: '/chinese-buffets/los-angeles-ca/china-buffet', label: 'Buffet detail' },
  { path: '/chinese-buffets/los-angeles-ca/does-not-exist', label: 'Buffet (nonsense slug)' },
  { path: '/chinese-buffets/los-angeles-ca/neighborhoods/downtown', label: 'Neighborhood' },
  { path: '/chinese-buffets/states/ca', label: 'State (CA)' },
];

function extractCanonical(html) {
  const m = html.match(/<link[^>]*\srel=["']canonical["'][^>]*\shref=["']([^"']+)["']/i)
    || html.match(/<link[^>]*\shref=["']([^"']+)["'][^>]*\srel=["']canonical["']/i);
  return m ? m[1] : null;
}

function extractRobots(html) {
  const m = html.match(/<meta[^>]*\sname=["']robots["'][^>]*\scontent=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*\scontent=["']([^"']+)["'][^>]*\sname=["']robots["']/i);
  return m ? m[1] : null;
}

async function fetchUrl(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'SEO-Check/1.0' },
  });
  if (!res.ok) return { ok: false, status: res.status, html: '' };
  const html = await res.text();
  return { ok: true, status: res.status, html };
}

async function main() {
  console.log('SEO Check – canonical + robots');
  console.log('Base URL:', BASE);
  console.log('');

  for (const { path, label } of URLS) {
    const url = `${BASE}${path}`;
    process.stdout.write(`${label} (${path}) … `);
    let result;
    try {
      result = await fetchUrl(url);
    } catch (err) {
      console.log('FAIL (fetch error:', err.message, ')');
      continue;
    }
    if (!result.ok) {
      console.log(`FAIL (HTTP ${result.status})`);
      continue;
    }
    const canonical = extractCanonical(result.html);
    const robots = extractRobots(result.html);
    console.log('');
    console.log('  canonical:', canonical ?? '(none)');
    console.log('  robots:   ', robots ?? '(none)');
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
