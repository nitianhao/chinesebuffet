#!/usr/bin/env python3
"""Select the best QA-passing llmSeoSummary candidate per URL."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


def load_cleaner():
    cleaner_path = Path(__file__).with_name("clean-llm-seo-summary-drafts.py")
    spec = importlib.util.spec_from_file_location("clean_llm_seo_summary_drafts", cleaner_path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Unable to load cleaner script: {cleaner_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cleaner = load_cleaner()
clean_summary = cleaner.clean_summary
qa_summary = cleaner.qa_summary
word_count = cleaner.word_count
best_summary = cleaner.best_summary


def score_candidate(summary: str) -> tuple[int, int]:
    words = word_count(summary)
    # Prefer summaries near 100-140 words, with shorter used as tie-breaker.
    target_distance = min(abs(words - 110), abs(words - 130))
    return (target_distance, words)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", nargs="*", default=[], type=Path)
    parser.add_argument("--source-input", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    candidates: dict[str, list[dict]] = {}
    errors = []

    for input_path in args.inputs:
        if not input_path.exists():
            continue
        for line in input_path.read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            url = row.get("url")
            if not url:
                continue
            if row.get("status") != "ok":
                errors.append({"url": url, "file": str(input_path), "error": row.get("error")})
                continue
            output = row.get("output") or {}
            source = row.get("source") or {}
            cleaned, issues, method = best_summary(output.get("llmSeoSummary") or "", source)
            item = {
                "url": url,
                "source": source,
                "summary": cleaned,
                "issues": issues,
                "wordCount": word_count(cleaned),
                "inputFile": str(input_path),
                "model": row.get("model"),
                "estimatedCostUsd": row.get("estimatedCostUsd"),
                "cleanupMethod": method,
            }
            candidates.setdefault(url, []).append(item)

    if args.source_input and args.source_input.exists():
        for line in args.source_input.read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            source = row.get("source") or {}
            url = source.get("url")
            if not url:
                continue
            if url in candidates:
                continue
            fallback = cleaner.fallback_summary(source)
            issues = qa_summary(fallback, source)
            candidates.setdefault(url, []).append(
                {
                    "url": url,
                    "source": source,
                    "summary": fallback,
                    "issues": issues,
                    "wordCount": word_count(fallback),
                    "inputFile": str(args.source_input),
                    "model": row.get("model"),
                    "estimatedCostUsd": 0,
                    "cleanupMethod": "source_fallback_only",
                }
            )

    selected = []
    report = ["# Selected LLM SEO Summary Candidates", ""]

    for url, items in sorted(candidates.items()):
        accepted = [item for item in items if not item["issues"]]
        pool = accepted or items
        best = sorted(pool, key=lambda item: (len(item["issues"]), score_candidate(item["summary"])))[0]
        best["qaStatus"] = "accepted" if not best["issues"] else "needs_review"
        selected.append(best)

    accepted_count = sum(1 for item in selected if item["qaStatus"] == "accepted")
    review_count = len(selected) - accepted_count
    report += [f"Result: {accepted_count} accepted, {review_count} need review, {len(errors)} generation errors observed.", ""]

    for item in selected:
        report += [
            f"## {item['source'].get('name') or item['url']}",
            "",
            f"- URL: {item['url']}",
            f"- Status: {item['qaStatus']}",
            f"- Word count: {item['wordCount']}",
            f"- Candidate source: `{item['inputFile']}`",
            f"- Cleanup method: `{item['cleanupMethod']}`",
        ]
        if item["issues"]:
            report.append("- Issues:")
            report.extend(f"  - {issue}" for issue in item["issues"])
        report += ["", item["summary"], ""]

    args.out.write_text("\n".join(json.dumps(item, ensure_ascii=False) for item in selected) + "\n")
    args.report.write_text("\n".join(report))
    print(json.dumps({"selected": len(selected), "accepted": accepted_count, "needsReview": review_count, "errorsObserved": len(errors)}, indent=2))


if __name__ == "__main__":
    main()
