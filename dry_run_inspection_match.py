#!/usr/bin/env python3
"""
High-precision dry-run matcher between BuffetLocator Houston restaurants and
City of Houston Health Inspection CKAN datasets.

DRY RUN ONLY:
- No database writes
- No file writes
- Console output only
"""

from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

import requests

buffets = [
    {"name": "bāshì", "address": "800 Capitol St t306", "city": "Houston", "state": "TX", "zip": "77002", "neighborhood": "Downtown Houston"},
    {"name": "Cooking Girl", "address": "550 Heights Blvd Suite C", "city": "Houston", "state": "TX", "zip": "77007", "neighborhood": "Greater Heights"},
    {"name": "Sesame Hut", "address": "6615 Long Point Rd", "city": "Houston", "state": "TX", "zip": "77055", "neighborhood": "Spring Branch East"},
    {"name": "Stone Age Street food Chinese BBQ", "address": "9252 Bellaire Blvd c", "city": "Houston", "state": "TX", "zip": "77036", "neighborhood": "Sharpstown"},
    {"name": "Triple Pepper", "address": "4720 Richmond Ave.", "city": "Houston", "state": "TX", "zip": "77027", "neighborhood": "Afton Oaks / River Oaks Area"},
]

DATASETS = {
    "FY11": "d1d9a226-6510-4d61-9002-dd664aac4ef3",
    "FY12": "7ee330a8-22ac-4300-b163-8a5ef72e3157",
    "FY13": "1404eb3f-2352-48d5-923c-4fbfe2fe171b",
    "FY14": "055109a9-c0f4-4ef7-bc4b-d2cb3d7e9268",
    "FY15": "4f71fb49-2e0f-4e3d-99f9-9fa741bc6ab4",
}

API_URL = "https://data.houstontx.gov/api/3/action/datastore_search"
REQUEST_TIMEOUT = 12
RETRIES = 2
RETRY_SLEEP = 1.0
API_SLEEP_SECONDS = 0.5
SEARCH_LIMIT = 30

SUFFIX_MAP = {
    "STREET": "ST",
    "ST": "ST",
    "AVENUE": "AVE",
    "AVE": "AVE",
    "BOULEVARD": "BLVD",
    "BLVD": "BLVD",
    "ROAD": "RD",
    "RD": "RD",
    "HIGHWAY": "HWY",
    "HWY": "HWY",
    "DRIVE": "DR",
    "DR": "DR",
    "LANE": "LN",
    "LN": "LN",
    "COURT": "CT",
    "CT": "CT",
    "PLACE": "PL",
    "PL": "PL",
    "PARKWAY": "PKWY",
    "PKWY": "PKWY",
}

DIRECTION_MAP = {
    "NORTH": "N",
    "SOUTH": "S",
    "EAST": "E",
    "WEST": "W",
    "N": "N",
    "S": "S",
    "E": "E",
    "W": "W",
}

UNIT_MARKERS = {"SUITE", "STE", "UNIT", "#", "APT"}
WEAK_BUSINESS_TOKENS = {
    "RESTAURANT",
    "CAFE",
    "KITCHEN",
    "FOOD",
    "FOODS",
    "HOUSE",
    "INC",
    "LLC",
    "LTD",
    "CO",
    "COMPANY",
}

SEMANTIC_MARKERS = {
    "SUSHI",
    "PIZZA",
    "BURGER",
    "SANDWICH",
    "BBQ",
    "BARBECUE",
    "TACO",
    "TAQUERIA",
    "BAKERY",
    "COFFEE",
    "TEA",
    "NOODLE",
    "WOK",
    "PHO",
    "RAMEN",
    "THAI",
    "VIETNAMESE",
    "MEXICAN",
    "INDIAN",
    "CHINESE",
    "JAPANESE",
    "KOREAN",
}


@dataclass
class NameInfo:
    raw: str
    normalized: str
    tokens: list[str]
    reduced_tokens: list[str]


@dataclass
class AddressInfo:
    raw: str
    number: str
    street_core: str
    suffix: str
    direction: str
    unit: str
    normalized_street: str
    normalized_full: str


@dataclass
class Candidate:
    dataset: str
    record: dict[str, Any]
    query_sources: set[str] = field(default_factory=set)
    score: int = 0
    classification: str = "NO MATCH"
    reason: str = ""
    notes: list[str] = field(default_factory=list)
    penalties: list[str] = field(default_factory=list)
    positive_signals: list[str] = field(default_factory=list)
    name_ratio: float = 0.0
    token_overlap: float = 0.0
    contains_tokens: bool = False
    exact_name: bool = False
    street_ratio: float = 0.0
    number_match: bool = False
    core_match: bool = False
    zip_match: bool = False
    unit_match: bool = False
    city_state_match: bool = True
    gated_out: bool = False
    raw_category_hint: str = ""


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(value: str) -> str:
    txt = strip_accents(value).upper()
    txt = re.sub(r"[^\w\s#]", " ", txt)
    return re.sub(r"\s+", " ", txt).strip()


def normalize_token(token: str) -> str:
    t = normalize_text(token)
    return t.replace("#", "")


def normalize_word(token: str) -> str:
    t = normalize_token(token)
    if t in DIRECTION_MAP:
        return DIRECTION_MAP[t]
    if t in SUFFIX_MAP:
        return SUFFIX_MAP[t]
    return t


def normalize_name(name: str) -> NameInfo:
    normalized = normalize_text(name)
    tokens = [normalize_word(tok) for tok in normalized.split() if normalize_word(tok)]
    reduced = [tok for tok in tokens if tok not in WEAK_BUSINESS_TOKENS]
    return NameInfo(raw=name, normalized=" ".join(tokens), tokens=tokens, reduced_tokens=reduced)


def extract_zip(value: str) -> str:
    m = re.search(r"\b(\d{5})", value or "")
    return m.group(1) if m else ""


def looks_like_unit_token(token: str) -> bool:
    t = normalize_token(token)
    return bool(re.fullmatch(r"[A-Z]?\d+[A-Z]*", t)) or bool(re.fullmatch(r"[A-Z]\d+", t))


def parse_address_components(address: str) -> AddressInfo:
    normalized = normalize_text(address)
    tokens = normalized.split()
    number = ""
    direction = ""
    suffix = ""
    unit = ""
    street_tokens: list[str] = []

    i = 0
    if i < len(tokens) and re.fullmatch(r"\d+[A-Z]?", tokens[i]):
        number = tokens[i]
        i += 1
    if i < len(tokens) and normalize_word(tokens[i]) in {"N", "S", "E", "W"}:
        direction = normalize_word(tokens[i])
        i += 1

    while i < len(tokens):
        tok = tokens[i]
        nt = normalize_word(tok)
        raw = normalize_token(tok)
        if raw in UNIT_MARKERS:
            i += 1
            if i < len(tokens):
                unit = normalize_token(tokens[i])
            break
        if raw.startswith("#"):
            unit = raw.replace("#", "")
            break
        if nt in SUFFIX_MAP.values():
            suffix = nt
            i += 1
            if i < len(tokens):
                next_tok = normalize_token(tokens[i])
                if looks_like_unit_token(next_tok):
                    unit = next_tok
            break
        if looks_like_unit_token(raw) and street_tokens:
            unit = raw
            break
        street_tokens.append(nt)
        i += 1

    street_core = " ".join(street_tokens).strip()
    normalized_street = " ".join(
        part for part in [direction, street_core, suffix] if part
    ).strip()
    normalized_full = " ".join(
        part for part in [number, normalized_street, unit] if part
    ).strip()
    return AddressInfo(
        raw=address,
        number=number,
        street_core=street_core,
        suffix=suffix,
        direction=direction,
        unit=unit,
        normalized_street=normalized_street,
        normalized_full=normalized_full,
    )


def parse_api_address(record: dict[str, Any]) -> AddressInfo:
    number = normalize_token(str(record.get("FacilityStreetNumber") or ""))
    street = normalize_text(str(record.get("FacilityStreet") or ""))
    street_type = normalize_word(str(record.get("FacilityStreetType") or ""))
    full_address = str(record.get("FacilityFullStreetAddress") or "")
    parsed = parse_address_components(full_address)

    if not parsed.number and number:
        parsed.number = number
    if not parsed.suffix and street_type in SUFFIX_MAP.values():
        parsed.suffix = street_type
    if not parsed.street_core and street:
        street_parts = [normalize_word(tok) for tok in street.split() if normalize_word(tok)]
        if street_parts and street_parts[-1] in SUFFIX_MAP.values() and not parsed.suffix:
            parsed.suffix = street_parts[-1]
            street_parts = street_parts[:-1]
        parsed.street_core = " ".join(street_parts)

    parsed.normalized_street = " ".join(
        part for part in [parsed.direction, parsed.street_core, parsed.suffix] if part
    ).strip()
    parsed.normalized_full = " ".join(
        part for part in [parsed.number, parsed.normalized_street, parsed.unit] if part
    ).strip()
    return parsed


def sequence_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def token_overlap_ratio(tokens_a: list[str], tokens_b: list[str]) -> float:
    set_a = set(tokens_a)
    set_b = set(tokens_b)
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def first_meaningful_name_token(name_info: NameInfo) -> str:
    for tok in name_info.reduced_tokens:
        if len(tok) > 1:
            return tok
    for tok in name_info.tokens:
        if len(tok) > 1:
            return tok
    return ""


def extract_semantic_markers(name_info: NameInfo, record: dict[str, Any]) -> set[str]:
    joined = " ".join(
        [
            name_info.normalized,
            normalize_text(str(record.get("Cuisine") or "")),
            normalize_text(str(record.get("EstablishmentType") or "")),
        ]
    )
    return {tok for tok in joined.split() if tok in SEMANTIC_MARKERS}


def fetch_ckan_records(
    session: requests.Session,
    resource_id: str,
    query: str,
) -> tuple[list[dict[str, Any]], str | None]:
    params = {"resource_id": resource_id, "q": query, "limit": SEARCH_LIMIT}
    last_error = ""
    for attempt in range(RETRIES + 1):
        try:
            response = session.get(API_URL, params=params, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            payload = response.json()
            if not payload.get("success"):
                return [], f"API success=false for query '{query}'"
            records = payload.get("result", {}).get("records", [])
            if isinstance(records, list):
                return records, None
            return [], "Malformed API payload: missing records list"
        except (requests.RequestException, ValueError) as exc:
            last_error = str(exc)
            if attempt < RETRIES:
                time.sleep(RETRY_SLEEP)
    return [], f"Request failed after retries: {last_error}"


def build_queries(buffet: dict[str, str], buffet_name: NameInfo, buffet_addr: AddressInfo) -> list[tuple[str, str]]:
    queries: list[tuple[str, str]] = []
    full_name = buffet["name"].strip()
    if full_name:
        queries.append(("full restaurant name", full_name))
    meaningful = first_meaningful_name_token(buffet_name)
    if meaningful:
        queries.append(("first meaningful name token", meaningful))
    if buffet_addr.number and buffet_addr.street_core:
        street_name_part = " ".join(buffet_addr.street_core.split()[:2])
        queries.append(("street number + street name", f"{buffet_addr.number} {street_name_part}"))
    if meaningful and buffet_addr.number:
        queries.append(("name token + street number", f"{meaningful} {buffet_addr.number}"))
    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for label, query in queries:
        key = query.strip().upper()
        if key and key not in seen:
            seen.add(key)
            unique.append((label, query))
    return unique


def score_candidate(
    buffet: dict[str, str],
    buffet_name: NameInfo,
    buffet_addr: AddressInfo,
    dataset: str,
    record: dict[str, Any],
) -> Candidate:
    facility_name = normalize_name(str(record.get("FacilityName") or ""))
    facility_addr = parse_api_address(record)

    result = Candidate(dataset=dataset, record=record)
    result.exact_name = buffet_name.normalized == facility_name.normalized and bool(buffet_name.normalized)
    result.name_ratio = sequence_ratio(buffet_name.normalized, facility_name.normalized)
    result.token_overlap = token_overlap_ratio(buffet_name.reduced_tokens, facility_name.reduced_tokens)
    buffet_reduced = set(buffet_name.reduced_tokens)
    facility_reduced = set(facility_name.reduced_tokens)
    result.contains_tokens = bool(buffet_reduced and buffet_reduced.issubset(facility_reduced))

    result.number_match = bool(buffet_addr.number and facility_addr.number and buffet_addr.number == facility_addr.number)
    result.core_match = bool(buffet_addr.street_core and facility_addr.street_core and buffet_addr.street_core == facility_addr.street_core)
    result.street_ratio = sequence_ratio(buffet_addr.normalized_street, facility_addr.normalized_street)
    result.zip_match = extract_zip(buffet["zip"]) == extract_zip(str(record.get("FacilityZip") or ""))
    result.unit_match = bool(
        buffet_addr.unit
        and facility_addr.unit
        and buffet_addr.unit == facility_addr.unit
    )

    facility_city = normalize_text(str(record.get("FacilityCity") or ""))
    facility_state = normalize_text(str(record.get("FacilityState") or ""))
    result.city_state_match = (not facility_city or facility_city == normalize_text(buffet["city"])) and (
        not facility_state or facility_state == normalize_text(buffet["state"])
    )

    score = 0
    if result.number_match:
        score += 35
        result.positive_signals.append("+35 exact street number")
    if result.zip_match:
        score += 20
        result.positive_signals.append("+20 exact zip")
    if result.core_match:
        score += 20
        result.positive_signals.append("+20 exact street core")
    if result.street_ratio >= 0.90:
        score += 15
        result.positive_signals.append("+15 street similarity >= 0.90")
    if result.name_ratio >= 0.90:
        score += 25
        result.positive_signals.append("+25 name similarity >= 0.90")
    elif result.name_ratio >= 0.80:
        score += 20
        result.positive_signals.append("+20 name similarity >= 0.80")
    if result.token_overlap >= 0.50:
        score += 20
        result.positive_signals.append("+20 strong token overlap")
    if result.unit_match:
        score += 10
        result.positive_signals.append("+10 unit match")

    if result.token_overlap == 0.0:
        score -= 45
        result.penalties.append("-45 zero token overlap")
    if not result.number_match and buffet_addr.number and facility_addr.number:
        score -= 35
        result.penalties.append("-35 street number mismatch")
    if not result.zip_match and buffet["zip"] and record.get("FacilityZip"):
        score -= 20
        result.penalties.append("-20 zip mismatch")
    if result.name_ratio < 0.45:
        score -= 25
        result.penalties.append("-25 name similarity < 0.45")
    if result.street_ratio < 0.60 and buffet_addr.normalized_street and facility_addr.normalized_street:
        score -= 20
        result.penalties.append("-20 street similarity < 0.60")

    buffet_semantics = extract_semantic_markers(buffet_name, {"Cuisine": "", "EstablishmentType": ""})
    candidate_semantics = extract_semantic_markers(
        facility_name,
        {
            "Cuisine": str(record.get("Cuisine") or ""),
            "EstablishmentType": str(record.get("EstablishmentType") or ""),
        },
    )
    if buffet_semantics and candidate_semantics and buffet_semantics.isdisjoint(candidate_semantics):
        score -= 20
        result.penalties.append("-20 semantic mismatch")
        result.raw_category_hint = "business category mismatch heuristic"

    facility_status = normalize_text(str(record.get("FacilityCurrentStatus") or ""))
    if facility_status and any(t in facility_status for t in ["CLOSED", "INACTIVE", "SUSPENDED", "REVOKED"]):
        score -= 15
        result.penalties.append("-15 inactive facility")

    # Precision-first gating.
    very_high_name = result.name_ratio >= 0.93 and result.token_overlap >= 0.50
    address_evidence = result.number_match and (result.core_match or result.street_ratio >= 0.85)
    weak_name = result.name_ratio < 0.60 and result.token_overlap < 0.20
    weak_address = (not result.number_match) and result.street_ratio < 0.70
    weak_zip_evidence = (not result.zip_match) and (not result.number_match) and result.name_ratio < 0.80

    if not result.city_state_match:
        result.gated_out = True
        result.notes.append("city/state mismatch")
    if (not result.number_match and not very_high_name) and weak_name:
        result.gated_out = True
        result.notes.append("street number mismatch + weak name similarity")
    if weak_zip_evidence:
        result.gated_out = True
        result.notes.append("zip mismatch + weak evidence")
    if result.token_overlap == 0.0 and result.name_ratio < 0.65:
        result.gated_out = True
        result.notes.append("name overlap near zero")
    if weak_address and result.name_ratio < 0.75:
        result.gated_out = True
        result.notes.append("address similarity weak")

    if result.number_match and result.name_ratio < 0.55 and result.token_overlap < 0.20:
        result.notes.append("same-address false positive")
    if result.name_ratio >= 0.80 and not result.number_match and result.street_ratio < 0.70:
        result.notes.append("similar-name wrong place")
    if dataset in {"FY11", "FY12"} and result.score > 0:
        result.notes.append("possible old record")
    if result.score < 40:
        result.notes.append("weak evidence")

    result.score = score

    if result.gated_out:
        result.classification = "NO MATCH"
        result.reason = "Failed strict precision gates"
        return result

    if score >= 95 and (address_evidence or very_high_name):
        result.classification = "STRONG MATCH"
        result.reason = "High score with strong address/name evidence"
    elif score >= 75 and (result.number_match or very_high_name):
        result.classification = "POSSIBLE MATCH"
        result.reason = "Good score but not enough for strong confidence"
    elif score >= 50:
        result.classification = "REVIEW"
        result.reason = "Mixed signals; manual validation required"
    else:
        result.classification = "NO MATCH"
        result.reason = "Low score for precision-first matching"
    return result


def candidate_dedupe_key(dataset: str, record: dict[str, Any]) -> tuple[str, str, str]:
    name = normalize_name(str(record.get("FacilityName") or "")).normalized
    address = parse_address_components(str(record.get("FacilityFullStreetAddress") or "")).normalized_full
    return dataset, name, address


def run_match_for_buffet(
    session: requests.Session,
    buffet: dict[str, str],
) -> tuple[list[Candidate], list[tuple[str, str, int]], list[str]]:
    buffet_name = normalize_name(buffet["name"])
    buffet_addr = parse_address_components(buffet["address"])
    queries = build_queries(buffet, buffet_name, buffet_addr)

    query_counts: list[tuple[str, str, int]] = []
    errors: list[str] = []
    candidate_map: dict[tuple[str, str, str], Candidate] = {}

    for query_label, query in queries:
        total_found = 0
        for dataset, resource_id in DATASETS.items():
            records, error = fetch_ckan_records(session, resource_id, query)
            time.sleep(API_SLEEP_SECONDS)
            if error:
                errors.append(f"{dataset} / {query}: {error}")
                continue
            total_found += len(records)
            for record in records:
                key = candidate_dedupe_key(dataset, record)
                if key not in candidate_map:
                    candidate_map[key] = score_candidate(buffet, buffet_name, buffet_addr, dataset, record)
                candidate_map[key].query_sources.add(query_label)
        query_counts.append((query_label, query, total_found))

    candidates = list(candidate_map.values())
    candidates.sort(
        key=lambda c: (
            1 if c.classification == "STRONG MATCH" else 0,
            1 if c.classification == "POSSIBLE MATCH" else 0,
            1 if c.classification == "REVIEW" else 0,
            c.score,
            c.name_ratio,
            c.street_ratio,
            str(c.record.get("InspectionDate") or ""),
        ),
        reverse=True,
    )
    return candidates, query_counts, errors


def parsed_address_line(addr: AddressInfo) -> str:
    return (
        f"number={addr.number or '-'} | street_core={addr.street_core or '-'} | "
        f"suffix={addr.suffix or '-'} | unit={addr.unit or '-'}"
    )


def explain_candidate(c: Candidate) -> None:
    rec = c.record
    print(f"  Facility: {rec.get('FacilityName') or 'N/A'}")
    print(f"  Address:  {rec.get('FacilityFullStreetAddress') or 'N/A'}")
    print(f"  Zip:      {rec.get('FacilityZip') or 'N/A'}")
    print(
        f"  Inspection: {rec.get('InspectionDate') or 'N/A'} | "
        f"Status: {rec.get('InspectionStatus') or 'N/A'} | "
        f"Score: {rec.get('InspectionScore') or 'N/A'}"
    )
    print(f"  Dataset: {c.dataset} | Query sources: {', '.join(sorted(c.query_sources)) or 'N/A'}")
    print(
        "  Name metrics: "
        f"exact={c.exact_name} | seq={c.name_ratio:.2f} | token_overlap={c.token_overlap:.2f} | "
        f"contains_tokens={c.contains_tokens}"
    )
    print(
        "  Address metrics: "
        f"number_match={c.number_match} | core_match={c.core_match} | "
        f"street_seq={c.street_ratio:.2f} | zip_match={c.zip_match} | unit_match={c.unit_match}"
    )
    if c.positive_signals:
        print(f"  Positive signals: {', '.join(c.positive_signals)}")
    if c.penalties:
        print(f"  Penalties: {', '.join(c.penalties)}")
    if c.notes:
        print(f"  Notes: {', '.join(c.notes)}")
    print(f"  Final: score={c.score} | classification={c.classification}")
    print(f"  Reason: {c.reason}")


def choose_best_for_summary(candidates: list[Candidate]) -> Candidate | None:
    for cls in ("STRONG MATCH", "POSSIBLE MATCH", "REVIEW"):
        for c in candidates:
            if c.classification == cls:
                return c
    return candidates[0] if candidates else None


def print_summary(rows: list[tuple[str, str, str, str, str]]) -> None:
    print("\n" + "=" * 110)
    print("FINAL SUMMARY")
    header = ["Buffet", "Best Classification", "Matched Facility", "Score", "Notes"]
    table = [header, *rows]
    widths = [max(len(str(row[i])) for row in table) for i in range(len(header))]

    def fmt(r: list[str] | tuple[str, str, str, str, str]) -> str:
        return " | ".join(str(v).ljust(widths[i]) for i, v in enumerate(r))

    print(fmt(header))
    print("-+-".join("-" * w for w in widths))
    for row in rows:
        print(fmt(row))


def main() -> None:
    session = requests.Session()
    summary_rows: list[tuple[str, str, str, str, str]] = []

    for buffet in buffets:
        source_name = normalize_name(buffet["name"])
        source_addr = parse_address_components(buffet["address"])
        print("\n" + "═" * 110)
        print(f"BUFFET: {buffet['name']}")
        print(f"ADDRESS: {buffet['address']}, {buffet['city']}, {buffet['state']} {buffet['zip']}")
        print("PARSED SOURCE ADDRESS:")
        print(f"  {parsed_address_line(source_addr)}")
        print("SOURCE NAME NORMALIZATION:")
        print(f"  normalized={source_name.normalized}")
        print(f"  reduced_tokens={source_name.reduced_tokens}")
        print("-" * 110)

        candidates, query_counts, errors = run_match_for_buffet(session, buffet)
        print("SEARCH QUERIES:")
        for label, query, count in query_counts:
            print(f'  - {label}: "{query}" -> {count} raw results')
        print(f"UNIQUE CANDIDATES: {len(candidates)}")
        if errors:
            print("API WARNINGS:")
            for err in errors:
                print(f"  - {err}")

        print("\nTOP 5 CANDIDATES:")
        top = candidates[:5]
        if not top:
            print("  No candidates returned.")
        for i, candidate in enumerate(top, start=1):
            print(f"\n[{i}]")
            explain_candidate(candidate)

        best = choose_best_for_summary(candidates)
        if not best or best.classification == "NO MATCH":
            summary_rows.append(
                (
                    buffet["name"],
                    "NO MATCH",
                    "-",
                    "-",
                    "no candidate passed gates",
                )
            )
            print("\nNO STRONG MATCH")
            continue

        matched_name = str(best.record.get("FacilityName") or "N/A")
        note = "; ".join(best.notes[:2]) if best.notes else best.reason.lower()
        summary_rows.append(
            (
                buffet["name"],
                best.classification,
                matched_name,
                str(best.score),
                note or "exact address good name",
            )
        )

        if best.classification != "STRONG MATCH":
            print("\nNO STRONG MATCH")
            print(f"Best available: {best.classification} ({best.score}) -> {matched_name}")

    print_summary(summary_rows)


if __name__ == "__main__":
    main()
