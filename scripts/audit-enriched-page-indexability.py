#!/usr/bin/env python3
"""Audit enriched buffet pages against sitemap and rendered indexability signals."""

from __future__ import annotations

import argparse
import html
import json
import re
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


def load_map(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def fetch(url: str, timeout: int = 45) -> tuple[int, str, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": "CodexIndexabilityAudit/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, body, None
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        return error.code, body, str(error)
    except Exception as error:
        return 0, "", str(error)


def sitemap_paths(base_url: str) -> tuple[set[str], dict]:
    status, body, error = fetch(f"{base_url.rstrip('/')}/sitemap-buffets.xml", timeout=90)
    details = {"status": status, "error": error, "urlCount": 0}
    if status != 200 or not body:
        return set(), details
    root = ET.fromstring(body.encode("utf-8"))
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    paths = set()
    for loc in root.findall(".//sm:loc", ns):
        if loc.text:
            paths.add(urlparse(html.unescape(loc.text)).path.rstrip("/"))
    details["urlCount"] = len(paths)
    return paths, details


def first_n(values: list[str], n: int) -> list[str]:
    return values[:n]


def sample_paths(paths_by_type: dict[str, set[str]], sample_size: int) -> list[str]:
    samples: list[str] = []
    for key in ["seo_summary", "menu_highlights", "customer_highlights", "good_to_know"]:
        for path in sorted(paths_by_type.get(key, set())):
            if path not in samples:
                samples.append(path)
            if len(samples) >= sample_size:
                return samples
    return samples


def page_checks(base_url: str, page_path: str, expected_features: list[str]) -> dict:
    url = f"{base_url.rstrip('/')}{page_path}"
    status, body, error = fetch(url)
    canonical_match = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', body)
    if not canonical_match:
        canonical_match = re.search(r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']', body)
    robots_match = re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\']([^"\']+)["\']', body, re.I)
    canonical = canonical_match.group(1) if canonical_match else None
    robots = robots_match.group(1) if robots_match else None
    feature_needles = {
        "seo_summary": None,
        "good_to_know": "Good to know",
        "customer_highlights": "Customer highlights",
        "menu_highlights": "Menu highlights",
    }
    features = {
        feature: (needle in body if needle else True)
        for feature, needle in feature_needles.items()
        if feature in expected_features
    }
    return {
        "path": page_path,
        "status": status,
        "error": error,
        "canonical": canonical,
        "canonicalSelf": bool(canonical and urlparse(canonical).path.rstrip("/") == page_path),
        "robots": robots,
        "robotsIndexable": not robots or "noindex" not in robots.lower(),
        "features": features,
        "bytes": len(body),
    }


def city_link_check(base_url: str, page_path: str) -> dict:
    parts = [part for part in page_path.split("/") if part]
    if len(parts) != 3:
        return {"path": page_path, "checked": False, "reason": "unsupported path"}
    city_path = f"/{parts[0]}/{parts[1]}"
    status, body, error = fetch(f"{base_url.rstrip('/')}{city_path}")
    href_variants = [page_path, f"{page_path}/"]
    linked = any(f'href="{variant}"' in body or f"href='{variant}'" in body for variant in href_variants)
    return {
        "path": page_path,
        "cityPath": city_path,
        "status": status,
        "error": error,
        "linkedFromCityPage": linked,
    }


def markdown_report(report: dict) -> str:
    lines = [
        "# Enriched Page Indexability Audit",
        "",
        f"Generated at: {report['generatedAt']}",
        f"Base URL: `{report['baseUrl']}`",
        "",
        "## Coverage",
        "",
    ]
    for key, item in report["coverage"].items():
        lines.append(f"- {key}: {item['total']} generated, {item['inSitemap']} in sitemap, {item['missingFromSitemap']} missing")
    lines += [
        "",
        f"Union enriched paths: {report['union']['total']}",
        f"Union paths in sitemap: {report['union']['inSitemap']}",
        f"Union paths missing from sitemap: {report['union']['missingFromSitemap']}",
        "",
        "## Render Sample",
        "",
    ]
    for item in report["pageChecks"]:
        feature_text = ", ".join(f"{k}={v}" for k, v in item["features"].items()) or "none"
        lines.append(
            f"- `{item['path']}`: status={item['status']}, canonicalSelf={item['canonicalSelf']}, "
            f"robotsIndexable={item['robotsIndexable']}, features: {feature_text}"
        )
    lines += ["", "## City Link Sample", ""]
    for item in report["cityLinkChecks"]:
        lines.append(f"- `{item['path']}` from `{item.get('cityPath')}`: linked={item.get('linkedFromCityPage')}, status={item.get('status')}")
    if report["union"]["missingExamples"]:
        lines += ["", "## Missing From Sitemap Examples", ""]
        lines.extend(f"- `{path}`" for path in report["union"]["missingExamples"])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3010")
    parser.add_argument("--sample-size", type=int, default=30)
    parser.add_argument("--out-json", type=Path, default=Path("scripts/output/enriched-indexability-audit.json"))
    parser.add_argument("--out-md", type=Path, default=Path("scripts/output/enriched-indexability-audit.md"))
    args = parser.parse_args()

    maps = {key: load_map(path) for key, path in GENERATED_MAPS.items()}
    paths_by_type = {key: set(value.keys()) for key, value in maps.items()}
    union_paths = set().union(*paths_by_type.values())
    sitemap, sitemap_details = sitemap_paths(args.base_url)

    coverage = {}
    for key, paths in paths_by_type.items():
      missing = sorted(paths - sitemap)
      coverage[key] = {
          "total": len(paths),
          "inSitemap": len(paths & sitemap),
          "missingFromSitemap": len(missing),
          "missingExamples": first_n(missing, 20),
      }

    union_missing = sorted(union_paths - sitemap)
    samples = sample_paths(paths_by_type, args.sample_size)
    page_checks_result = []
    city_link_checks = []
    for page_path in samples:
        expected = [key for key, paths in paths_by_type.items() if page_path in paths]
        page_checks_result.append(page_checks(args.base_url, page_path, expected))
        city_link_checks.append(city_link_check(args.base_url, page_path))

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baseUrl": args.base_url,
        "sitemap": sitemap_details,
        "coverage": coverage,
        "union": {
            "total": len(union_paths),
            "inSitemap": len(union_paths & sitemap),
            "missingFromSitemap": len(union_missing),
            "missingExamples": first_n(union_missing, 50),
        },
        "pageChecks": page_checks_result,
        "cityLinkChecks": city_link_checks,
    }

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(report, indent=2))
    args.out_md.write_text(markdown_report(report))
    print(json.dumps({
        "sitemapUrls": sitemap_details["urlCount"],
        "unionEnrichedPaths": report["union"]["total"],
        "unionMissingFromSitemap": report["union"]["missingFromSitemap"],
        "samplePageFailures": [
            item for item in page_checks_result
            if item["status"] != 200 or not item["canonicalSelf"] or not item["robotsIndexable"] or not all(item["features"].values())
        ],
        "sampleCityLinkFailures": [
            item for item in city_link_checks
            if item.get("status") != 200 or not item.get("linkedFromCityPage")
        ],
        "files": {"json": str(args.out_json), "markdown": str(args.out_md)},
    }, indent=2))


if __name__ == "__main__":
    main()
