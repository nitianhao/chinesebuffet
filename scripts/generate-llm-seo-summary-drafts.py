#!/usr/bin/env python3
"""Generate draft llmSeoSummary rows from prepared sample payloads."""

from __future__ import annotations

import argparse
import json
import os
import signal
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


MODEL = "google/gemini-2.5-flash-lite"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
INPUT_PRICE_PER_M = 0.10
OUTPUT_PRICE_PER_M = 0.40
MAX_ATTEMPTS_PER_ROW = 2


class RequestTimeoutError(TimeoutError):
    pass


SYSTEM_MESSAGE = """You write grounded local restaurant summaries for a buffet restaurant directory. The cuisine of each restaurant is given in the source data (e.g. an Indian buffet or a Chinese buffet); use it, and do not assume a cuisine that is not stated.

Your job is to turn structured source data into useful page content. Use only the facts provided in the input. Do not invent menu items, prices, amenities, awards, popularity claims, ownership, service options, takeout, delivery, reservations, atmosphere, customer opinions, or neighborhood details.

Write naturally for a search visitor deciding whether this restaurant is relevant. Avoid generic SEO filler, repeated openings, and exaggerated claims. If the source data is sparse, write a shorter but still specific summary instead of guessing. It is better to be plain and accurate than vivid and unsupported.

Return only valid JSON matching the requested schema."""


USER_TEMPLATE = """Generate one grounded restaurant SEO summary.

Requirements:
- Write 120-180 words when the source data supports it.
- If the source data is thin, write 80-120 words.
- Mention the restaurant name once in the first sentence.
- Mention the city and state naturally.
- Use rating and review count only if both are present.
- Mention hours, photos, website, phone, amenities, review themes, menu items, or nearby context only when provided.
- Do not mention dishes, cuisine variety, food selection, lunch, dinner, takeout, delivery, reservations, atmosphere, customer opinions, or reputation unless the source data has an explicit field for that claim.
- Categories may be used only as business categories, not as proof of specific dishes or menu breadth.
- Do not say "best", "top", "famous", "popular", "authentic", "cheap", or "family-friendly" unless the source data directly supports that wording.
- Write in a polished editorial style, not as a database dump.
- Do not use phrases like "the listing includes", "source data", "review themes mention", "available service details", "business categories include", "photos are available", or "for more details".
- Prefer one cohesive paragraph with varied sentence structure.
- Mention only the strongest 2-4 review/menu/amenity signals; do not list every field.
- End with a useful search-visitor takeaway grounded in the facts.
- Do not use salesy recommendation phrases like "worth considering", "great choice", "solid option", "must visit", or "perfect for".
- Do not write awkward field labels like "business accepts credit cards"; rewrite as natural prose or omit the field.
- Do not add "all-you-can-eat" unless the source explicitly says it.
- Do not use markdown.
- Do not include unsupported claims.

Return this JSON shape:
{
  "llmSeoSummary": "string",
  "sourceFieldsUsed": ["string"],
  "omittedBecauseMissing": ["string"],
  "riskNotes": ["string"]
}

Source data:
{{restaurant_json}}"""


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def extract_json(text: str | None) -> dict:
    if not text:
        raise ValueError("empty model response content")
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            return json.loads(stripped[start : end + 1])
        raise


def word_count(text: str) -> int:
    return len([part for part in text.replace("-", " ").split() if part.strip()])


def validate_output(parsed: dict) -> list[str]:
    issues: list[str] = []
    summary = parsed.get("llmSeoSummary")
    if not isinstance(summary, str) or not summary.strip():
        issues.append("missing llmSeoSummary")
        return issues
    words = word_count(summary)
    if words < 70 or words > 190:
        issues.append(f"word count outside review band: {words}")
    for key in ["sourceFieldsUsed", "omittedBecauseMissing", "riskNotes"]:
        if not isinstance(parsed.get(key), list):
            issues.append(f"{key} is not an array")
    return issues


def call_openrouter(api_key: str, source: dict, timeout: int) -> dict:
    body = {
        "model": MODEL,
        "temperature": 0.3,
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_MESSAGE},
            {
                "role": "user",
                "content": USER_TEMPLATE.replace(
                    "{{restaurant_json}}", json.dumps(source, ensure_ascii=False, indent=2)
                ),
            },
        ],
    }
    request = Request(
        OPENROUTER_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://buffetlocator.com",
            "X-Title": "Buffet Locator SEO Summary Prototype",
        },
        method="POST",
    )
    def _handle_timeout(_signum, _frame):
        raise RequestTimeoutError(f"OpenRouter request exceeded {timeout}s")

    previous_handler = signal.signal(signal.SIGALRM, _handle_timeout)
    signal.alarm(timeout)
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def parse_openrouter_response(response: dict) -> tuple[dict, dict, str | None]:
    content = response["choices"][0]["message"].get("content")
    parsed = extract_json(content)
    return parsed, response.get("usage") or {}, content


def generate_with_retry(api_key: str, source: dict, timeout: int) -> tuple[dict, dict, int]:
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS_PER_ROW + 1):
        try:
            response = call_openrouter(api_key, source, timeout)
            parsed, usage, _content = parse_openrouter_response(response)
            return parsed, usage, attempt
        except (HTTPError, URLError, TimeoutError, KeyError, ValueError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < MAX_ATTEMPTS_PER_ROW:
                time.sleep(1)
                continue
    assert last_error is not None
    raise last_error


def estimate_cost(usage: dict) -> float:
    prompt_tokens = usage.get("prompt_tokens") or 0
    completion_tokens = usage.get("completion_tokens") or 0
    return (prompt_tokens * INPUT_PRICE_PER_M / 1_000_000) + (
        completion_tokens * OUTPUT_PRICE_PER_M / 1_000_000
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=Path("scripts/output/llm-seo-summary-sample.jsonl"), type=Path)
    parser.add_argument("--out", default=Path("scripts/output/llm-seo-summary-drafts.jsonl"), type=Path)
    parser.add_argument("--summary", default=Path("scripts/output/llm-seo-summary-drafts-summary.json"), type=Path)
    parser.add_argument("--limit", default=10, type=int)
    parser.add_argument("--timeout", default=45, type=int)
    args = parser.parse_args()

    load_dotenv(Path(".env.local"))
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is not set")

    rows = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
    rows = rows[: args.limit]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    results = []
    started = time.time()
    with args.out.open("w") as output:
        for index, row in enumerate(rows, start=1):
            source = row["source"]
            result = {
                "sampleSet": row.get("sampleSet"),
                "model": MODEL,
                "url": source.get("url"),
                "source": source,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            }
            try:
                parsed, usage, attempts = generate_with_retry(api_key, source, args.timeout)
                result.update(
                    {
                        "status": "ok",
                        "output": parsed,
                        "usage": usage,
                        "estimatedCostUsd": round(estimate_cost(usage), 6),
                        "validationIssues": validate_output(parsed),
                        "attempts": attempts,
                    }
                )
            except (HTTPError, URLError, TimeoutError, KeyError, ValueError, json.JSONDecodeError) as error:
                result.update({"status": "error", "error": f"{type(error).__name__}: {error}"})
            output.write(json.dumps(result, ensure_ascii=False) + "\n")
            output.flush()
            results.append(result)
            print(f"{index}/{len(rows)} {result['status']} {source.get('url')}")

    ok_results = [item for item in results if item.get("status") == "ok"]
    total_usage = {
        "prompt_tokens": sum((item.get("usage") or {}).get("prompt_tokens") or 0 for item in ok_results),
        "completion_tokens": sum((item.get("usage") or {}).get("completion_tokens") or 0 for item in ok_results),
        "total_tokens": sum((item.get("usage") or {}).get("total_tokens") or 0 for item in ok_results),
    }
    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL,
        "inputRows": len(rows),
        "ok": len(ok_results),
        "errors": len(results) - len(ok_results),
        "validationIssueRows": sum(1 for item in ok_results if item.get("validationIssues")),
        "usage": total_usage,
        "estimatedCostUsd": round(sum(item.get("estimatedCostUsd") or 0 for item in ok_results), 6),
        "elapsedSeconds": round(time.time() - started, 2),
        "files": {"drafts": str(args.out), "summary": str(args.summary)},
    }
    args.summary.write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
