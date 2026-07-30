#!/usr/bin/env python3
"""Build the runtime pathname-keyed LLM SEO summary map."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


def path_key(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if not path:
        raise ValueError(f"URL has no path: {url}")
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    rows = json.loads(args.input.read_text())
    summary_map = {}
    for row in rows:
        summary_map[path_key(row["url"])] = {
            "summary": row["llmSeoSummary"],
            "status": row["status"],
            "qaStatus": row["qaStatus"],
            "wordCount": row["wordCount"],
            "sourceMethod": row["sourceMethod"],
            "generatedAt": row["generatedAt"],
        }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(dict(sorted(summary_map.items())), indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"written": len(summary_map), "out": str(args.out)}, indent=2))


if __name__ == "__main__":
    main()
