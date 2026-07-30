#!/usr/bin/env python3
"""Prune generated buffet enrichment maps to paths present in the buffet sitemap."""

from __future__ import annotations

import argparse
import html
import json
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


GENERATED_MAPS = {
    "seo_summary": Path("lib/generated/llm-seo-summary-drafts.json"),
    "good_to_know": Path("lib/generated/llm-good-to-know.json"),
    "customer_highlights": Path("lib/generated/llm-customer-highlights.json"),
    "menu_highlights": Path("lib/generated/llm-menu-highlights.json"),
}


def fetch(url: str, timeout: int = 90) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "CodexEnrichmentPrune/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"Expected 200 from {url}, got {response.status}")
        return response.read().decode("utf-8", errors="replace")


def load_sitemap_paths(base_url: str) -> set[str]:
    body = fetch(f"{base_url.rstrip('/')}/sitemap-buffets.xml")
    root = ET.fromstring(body.encode("utf-8"))
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    paths = set()
    for loc in root.findall(".//sm:loc", ns):
        if loc.text:
            paths.add(urlparse(html.unescape(loc.text)).path.rstrip("/"))
    return paths


def load_json(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3010")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--summary",
        type=Path,
        default=Path("scripts/output/prune-enrichment-to-sitemap-summary.json"),
    )
    parser.add_argument(
        "--removed",
        type=Path,
        default=Path("scripts/output/prune-enrichment-to-sitemap-removed.json"),
    )
    args = parser.parse_args()

    sitemap_paths = load_sitemap_paths(args.base_url)
    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baseUrl": args.base_url,
        "sitemapUrls": len(sitemap_paths),
        "dryRun": args.dry_run,
        "maps": {},
    }
    removed: dict[str, dict] = {}

    for name, path in GENERATED_MAPS.items():
        data = load_json(path)
        kept = {key: value for key, value in data.items() if key in sitemap_paths}
        removed_entries = {key: value for key, value in data.items() if key not in sitemap_paths}
        removed[name] = removed_entries
        summary["maps"][name] = {
            "file": str(path),
            "before": len(data),
            "after": len(kept),
            "removed": len(removed_entries),
            "removedExamples": list(removed_entries.keys())[:20],
        }
        if not args.dry_run and kept != data:
            write_json(path, kept)

    args.summary.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.summary, summary)
    write_json(args.removed, removed)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as error:
        raise SystemExit(f"Failed to fetch sitemap: {error}") from error
