#!/usr/bin/env python3
"""Export QA-accepted llmSeoSummary drafts into an import-ready JSON artifact."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--accepted-out", required=True, type=Path)
    parser.add_argument("--rejected-out", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    rows = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
    generated_at = datetime.now(timezone.utc).isoformat()
    accepted = []
    rejected = []

    for row in rows:
        source = row.get("source") or {}
        record = {
            "url": row.get("url"),
            "name": source.get("name"),
            "city": source.get("city"),
            "state": source.get("state"),
            "llmSeoSummary": row.get("summary"),
            "status": "draft",
            "qaStatus": row.get("qaStatus"),
            "qaIssues": row.get("issues") or [],
            "wordCount": row.get("wordCount"),
            "sourceMethod": row.get("cleanupMethod"),
            "model": row.get("model"),
            "estimatedCostUsd": row.get("estimatedCostUsd") or 0,
            "generatedAt": generated_at,
            "sourceSnapshot": {
                "rating": source.get("rating"),
                "reviewsCount": source.get("reviewsCount"),
                "reviewThemes": source.get("reviewThemes") or [],
                "menuItems": source.get("menuItems") or [],
                "amenities": source.get("amenities") or [],
                "hasWebsite": source.get("hasWebsite"),
                "hasPhone": source.get("hasPhone"),
                "photosCount": source.get("photosCount"),
                "hoursSummary": source.get("hoursSummary"),
            },
        }
        if row.get("qaStatus") == "accepted":
            accepted.append(record)
        else:
            rejected.append(record)

    args.accepted_out.write_text(json.dumps(accepted, indent=2, ensure_ascii=False))
    args.rejected_out.write_text(json.dumps(rejected, indent=2, ensure_ascii=False))

    report = [
        "# LLM SEO Summary Draft Export",
        "",
        f"Generated at: {generated_at}",
        "",
        f"- Accepted drafts: {len(accepted)}",
        f"- Rejected drafts: {len(rejected)}",
        f"- Accepted output: `{args.accepted_out}`",
        f"- Rejected output: `{args.rejected_out}`",
        "",
        "## Rejected",
        "",
    ]
    if rejected:
        for item in rejected:
            report += [
                f"- {item['url']}",
                f"  - Issues: {', '.join(item['qaIssues']) if item['qaIssues'] else 'none recorded'}",
            ]
    else:
        report.append("None.")
    args.report.write_text("\n".join(report))
    print(json.dumps({"accepted": len(accepted), "rejected": len(rejected)}, indent=2))


if __name__ == "__main__":
    main()
