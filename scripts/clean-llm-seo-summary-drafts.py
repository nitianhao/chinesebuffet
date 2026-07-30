#!/usr/bin/env python3
"""Clean and QA draft llmSeoSummary output without publishing it."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


REPLACEMENTS = [
    (re.compile(r"\bthe listing includes\b", re.I), "the page includes"),
    (re.compile(r"\bbusiness categories include\b", re.I), "it is categorized as"),
    (re.compile(r"\breview themes mention\b", re.I), "reviews mention"),
    (re.compile(r"\bavailable service details include\b", re.I), "service details include"),
    (re.compile(r"\bphotos are available online\b", re.I), "photos are included"),
    (re.compile(r"\bfor more details\b", re.I), "for visit details"),
]

REJECT_PATTERNS = [
    (re.compile(r"\bsource data\b", re.I), "mentions source data"),
    (re.compile(r"\bworth considering\b|\bgreat choice\b|\bsolid option\b|\bmust visit\b|\bperfect for\b", re.I), "salesy recommendation"),
    (re.compile(r"\ball[- ]you[- ]can[- ]eat\b", re.I), "unsupported all-you-can-eat wording"),
    (re.compile(r"\bdirty\b|\brude\b|\bworst\b|\bgross\b|\bterrible\b|\bawful\b", re.I), "negative review language"),
    (re.compile(r"\bslot\b|\bgambling\b|\bcasino\b|\bneymar\b|\brtp\b", re.I), "scrape junk"),
]

FOOD_TERMS = [
    "sushi", "hibachi", "chicken wings", "cheese rangoons", "dessert",
    "crawfish", "shrimp", "orange chicken", "menudo", "mongolian grill",
    "mongolian bbq", "hot and sour soup", "egg drop soup", "seafood",
    "crab", "fried chicken", "shellfish",
]


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?", text))


def clean_summary(text: str) -> str:
    value = re.sub(r"\s+", " ", text).strip()
    for pattern, replacement in REPLACEMENTS:
        value = pattern.sub(replacement, value)
    value = value.replace("Business accepts credit cards.", "Credit card payments are accepted.")
    value = value.replace("business accepts credit cards.", "credit card payments are accepted.")
    value = value.replace("photos are included", "Photos are included")
    value = value.replace("reviews mention", "Reviews mention")
    value = value.replace("mexican", "Mexican")
    value = re.sub(
        r"The restaurant is categorized as a Buffet Restaurant and Chinese Restaurant among other listings\.",
        "Its core categories are buffet restaurant and Chinese restaurant.",
        value,
        flags=re.I,
    )
    value = re.sub(
        r"Photos are included, and the restaurant provides a phone number and website for visit details\.",
        "The page also provides photos, full contact details, and weekly hours.",
        value,
    )
    value = re.sub(
        r"The hours are listed for all seven days\. Photos are available\. A website and phone number are provided\.",
        "The page also includes full weekly hours, photos, a website, and a phone number.",
        value,
    )
    value = re.sub(
        r"Amenities include acceptance of credit cards, and the restaurant serves lunch, dinner, brunch, beer, wine, vegetarian food, dessert, and coffee\. Takeout is available\.",
        "Useful visit details include takeout, credit card payments, and service for lunch, dinner, and brunch, plus listed options for beer, wine, vegetarian food, dessert, and coffee.",
        value,
    )
    return value


def human_join(items: list[str], limit: int = 4) -> str:
    cleaned = []
    seen = set()
    for item in items:
        value = str(item).strip()
        key = value.lower()
        if not value or key in seen:
            continue
        seen.add(key)
        cleaned.append(value)
        if len(cleaned) >= limit:
            break
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def compact_theme(value: str) -> str:
    value = re.sub(r"\s+", " ", str(value)).strip()
    value = re.sub(r"\s*\(\d+\s+mentions?\)", "", value, flags=re.I)
    if re.search(r"\ball[- ]?you[- ]?can[- ]?eat\b|\bbest place\b|\bten out of ten\b", value, re.I):
        value = re.sub(r"\ball[- ]?you[- ]?can[- ]?eat\b", "", value, flags=re.I)
    foods = []
    for term in FOOD_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", value, re.I):
            foods.append(term)
    if foods and (len(value) > 45 or "," in value or " and " in value.lower()):
        return human_join(foods, 4)
    if re.search(r"\bbest place\b|\bten out of ten\b", value, re.I):
        return ""
    if len(value) > 70:
        return ""
    return value[:90].rstrip(" .,;:")


def compact_amenity(value: str) -> str:
    value = re.sub(r"^[^:]+:\s*", "", str(value)).strip()
    value = value.replace("Business Accepts Credit Cards", "credit card payments")
    value = value.replace("Dine In", "dine-in")
    value = value.replace("Wheelchair accessible", "wheelchair-accessible")
    value = value.replace("Serves ", "")
    value = value.replace("Parking", "parking")
    value = value.replace("Takeout", "takeout")
    value = value.replace("Delivery", "delivery")
    value = value.replace("Lunch", "lunch")
    value = value.replace("Dinner", "dinner")
    value = value.replace("Brunch", "brunch")
    value = value.replace("Beer", "beer")
    value = value.replace("Wine", "wine")
    value = value.replace("Vegetarian Food", "vegetarian options")
    value = value.replace("Dessert", "dessert")
    value = value.replace("Coffee", "coffee")
    value = value.replace("Kids Friendly", "kid-friendly details")
    value = value.replace("Reservable", "reservations")
    value = value.replace("Has Tv", "TV")
    return value[:60].rstrip(" .,;:")


def fallback_summary(source: dict) -> str:
    name = source.get("name") or "This restaurant"
    city = source.get("city")
    state = source.get("state")
    address = source.get("address")
    neighborhood = source.get("neighborhood")
    rating = source.get("rating")
    reviews = source.get("reviewsCount")

    place = f"{city}, {state}" if city and state else city or state or "the area"
    opener = f"{name} is a Chinese buffet restaurant in {place}"
    if neighborhood:
        opener += f", near {neighborhood}"
    if address:
        opener += f", at {address}"
    opener += "."

    facts = []
    if rating and reviews:
        facts.append(f"It has a {rating}-star rating from more than {int(reviews):,} reviews")
    elif rating:
        facts.append(f"It has a {rating}-star rating")
    page_details = []
    if source.get("hoursSummary"):
        page_details.append("full weekly hours")
    if source.get("photosCount"):
        page_details.append("photos")
    if source.get("hasWebsite") and source.get("hasPhone"):
        page_details.append("website and phone contact details")
    elif source.get("hasPhone"):
        page_details.append("phone details")

    themes = []
    seen_themes = set()
    food_terms = []
    seen_foods = set()
    for item in source.get("reviewThemes") or []:
        raw = str(item)
        for term in FOOD_TERMS:
            if re.search(rf"\b{re.escape(term)}\b", raw, re.I) and term not in seen_foods:
                food_terms.append(term)
                seen_foods.add(term)
        theme = compact_theme(item)
        key = theme.lower()
        if theme and key not in seen_themes:
            themes.append(theme)
            seen_themes.add(key)
    if food_terms:
        themes = food_terms
    theme_sentence = ""
    if themes:
        theme_sentence = f"Food and review signals include {human_join(themes, 4)}."

    amenities = [compact_amenity(item) for item in source.get("amenities") or []]
    amenity_sentence = ""
    if amenities:
        amenity_sentence = f"Useful visit details include {human_join(amenities, 4)}."

    middle = ". ".join(facts)
    if middle:
        middle += "."

    page_sentence = ""
    if page_details:
        page_sentence = f"The page includes {human_join(page_details, 3)}."

    takeaway = f"That combination gives the {name} page concrete local context beyond a basic name, address, and phone listing."
    return " ".join(part for part in [opener, middle, page_sentence, theme_sentence, amenity_sentence, takeaway] if part)


def best_summary(raw_text: str, source: dict) -> tuple[str, list[str], str]:
    cleaned = clean_summary(raw_text)
    cleaned_issues = qa_summary(cleaned, source)
    fallback = fallback_summary(source)
    fallback_issues = qa_summary(fallback, source)
    if fallback_issues and (not cleaned_issues or len(cleaned_issues) <= len(fallback_issues)):
        return cleaned, cleaned_issues, "model_cleaned"
    if not fallback_issues or len(fallback_issues) < len(cleaned_issues):
        return fallback, fallback_issues, "fallback_composed"
    return cleaned, cleaned_issues, "model_cleaned"


def qa_summary(text: str, source: dict) -> list[str]:
    issues: list[str] = []
    wc = word_count(text)
    if wc < 70:
        issues.append(f"too short: {wc} words")
    if wc > 180:
        issues.append(f"too long: {wc} words")
    for pattern, reason in REJECT_PATTERNS:
        if pattern.search(text):
            issues.append(reason)
    if not source.get("menuItems") and re.search(r"\bmenu items?\b|\bdishes\b", text, re.I):
        if not source.get("reviewThemes"):
            issues.append("mentions dishes/menu without menu or review theme support")
    if not source.get("amenities") and re.search(r"\btakeout\b|\bdelivery\b|\bparking\b|\baccessible\b", text, re.I):
        issues.append("mentions amenities without amenity source")
    if text.count(",") > 18:
        issues.append("too list-like")
    return issues


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    rows = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
    cleaned_rows = []
    report_lines = ["# Cleaned LLM SEO Summary QA", ""]
    counts = {"accepted": 0, "needs_review": 0, "error": 0}

    for row in rows:
        if row.get("status") != "ok":
            counts["error"] += 1
            cleaned_rows.append(row)
            report_lines += [f"## ERROR: {row.get('url')}", "", f"- Error: `{row.get('error')}`", ""]
            continue

        output = row.get("output") or {}
        source = row.get("source") or {}
        cleaned, issues, method = best_summary(output.get("llmSeoSummary") or "", source)
        status = "needs_review" if issues else "accepted"
        counts[status] += 1

        next_row = dict(row)
        next_row["cleanedOutput"] = {
            "llmSeoSummary": cleaned,
            "qaStatus": status,
            "qaIssues": issues,
            "wordCount": word_count(cleaned),
            "cleanupMethod": method,
        }
        cleaned_rows.append(next_row)

        report_lines += [
            f"## {source.get('name') or row.get('url')}",
            "",
            f"- URL: {row.get('url')}",
            f"- Status: {status}",
            f"- Word count: {word_count(cleaned)}",
        ]
        if issues:
            report_lines.append("- Issues:")
            report_lines.extend(f"  - {issue}" for issue in issues)
        report_lines += ["", cleaned, ""]

    args.out.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in cleaned_rows) + "\n")
    report_lines.insert(2, f"Result: {counts['accepted']} accepted, {counts['needs_review']} need review, {counts['error']} errors.")
    report_lines.insert(3, "")
    args.report.write_text("\n".join(report_lines))
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
