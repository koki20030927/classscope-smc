#!/usr/bin/env python3
"""Build the DVC master dataset from the official 4CD class schedule.

The pipeline intentionally separates source discovery, raw acquisition, and
processing. Production database access is neither required nor supported.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests
from bs4 import BeautifulSoup, Tag


REPO_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_DIR / "data" / "dvc"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
REPORTS_DIR = DATA_DIR / "reports"
SOURCE_TERMS_FILE = DATA_DIR / "source_terms.json"

SCHEDULE_URL = "https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx"
USER_AGENT = "ClassScope-DVC-MasterData/1.0 (public academic schedule archival; low-rate requests)"
REQUEST_DELAY_SECONDS = 0.25
REQUEST_TIMEOUT_SECONDS = 180

TERM_CODES = (
    "2022FA",
    "2023SP",
    "2023SU",
    "2023FA",
    "2024SP",
    "2024SU",
    "2024FA",
    "2025SP",
    "2025SU",
    "2025FA",
    "2026SP",
    "2026SU",
    "2026FA",
    "2027SP",
)
WINTER_CANDIDATES = ("2023WI", "2024WI", "2025WI", "2026WI", "2027WI")
LOCATIONS = (("dvc", "DVC"), ("src", "SRC"))
TERM_SUFFIXES = {"SP": "Spring", "SU": "Summer", "FA": "Fall", "WI": "Winter"}
OFFICIAL_PDF_SOURCES = {
    "2024SU": "https://www.dvc.edu/sites/default/files/2024-06/SU24-Schedule.pdf",
    "2024FA": "https://www.dvc.edu/sites/default/files/2024-06/FA24-Schedule.pdf",
    "2025SP": "https://www.dvc.edu/sites/default/files/2025-03/SP25-Schedule.pdf",
    "2025SU": "https://www.dvc.edu/sites/default/files/2025-04/SU25-Schedule.pdf",
    "2025FA": "https://www.dvc.edu/sites/default/files/2025-08/FA25-Schedule.pdf",
}

PLACEHOLDER_NAMES = {
    "",
    "-",
    "arr",
    "faculty",
    "instructor",
    "n/a",
    "na",
    "none",
    "not assigned",
    "staff",
    "tba",
    "tbd",
    "to be announced",
    "to be determined",
    "unassigned",
    "unknown",
}


class PipelineError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def collapse_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def term_display(term_code: str) -> str:
    match = re.fullmatch(r"(\d{4})(SP|SU|FA|WI)", term_code)
    if not match:
        raise PipelineError(f"unsupported term identifier: {term_code}")
    return f"{TERM_SUFFIXES[match.group(2)]} {match.group(1)}"


def term_slug(term_code: str) -> str:
    name, year = term_display(term_code).lower().split()
    return f"{name}_{year}"


def term_rank(term_code: str) -> int:
    match = re.fullmatch(r"(\d{4})(SP|SU|FA|WI)", term_code)
    if not match:
        return -1
    suffix_rank = {"WI": 0, "SP": 1, "SU": 2, "FA": 3}
    return int(match.group(1)) * 10 + suffix_rank[match.group(2)]


def normalized_identity(value: str) -> str:
    return collapse_space(value).casefold()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def hidden_fields(soup: BeautifulSoup) -> dict[str, str]:
    return {
        element["name"]: element.get("value", "")
        for element in soup.select('input[type="hidden"][name]')
    }


class OfficialScheduleClient:
    def __init__(self, delay_seconds: float = REQUEST_DELAY_SECONDS) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.delay_seconds = delay_seconds

    def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = self.session.request(
                    method,
                    url,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                    **kwargs,
                )
                response.raise_for_status()
                if self.delay_seconds:
                    time.sleep(self.delay_seconds)
                return response
            except (requests.RequestException, TimeoutError) as error:
                last_error = error
                if attempt == 3:
                    break
                time.sleep(attempt * 2)
        raise PipelineError(f"official schedule request failed after retries: {last_error}")

    def get_soup(self, *, params: dict[str, str] | None = None) -> BeautifulSoup:
        return BeautifulSoup(self.request("GET", SCHEDULE_URL, params=params).text, "html.parser")

    def post_soup(self, url: str, data: dict[str, str]) -> BeautifulSoup:
        return BeautifulSoup(self.request("POST", url, data=data).text, "html.parser")


def select_current_official_terms(client: OfficialScheduleClient) -> list[str]:
    soup = client.get_soup()
    data = hidden_fields(soup)
    data.update(
        {
            "ctl00$PlaceHolderMain$ibtnDvc.x": "1",
            "ctl00$PlaceHolderMain$ibtnDvc.y": "1",
        }
    )
    soup = client.post_soup(SCHEDULE_URL, data)
    data = hidden_fields(soup)
    data["ctl00$PlaceHolderMain$btnDvcBoth"] = "Both Locations"
    soup = client.post_soup(SCHEDULE_URL, data)
    selector = soup.select_one("#ctl00_PlaceHolderMain_SEC_TERM")
    if not selector:
        raise PipelineError("official DVC term selector was not found")
    return [option.get("value", "") for option in selector.find_all("option") if option.get("value")]


def parse_result_total(soup: BeautifulSoup) -> int:
    label = soup.select_one("#ctl00_PlaceHolderMain_lblCurrentPageIndexFromUrl")
    if not label:
        raise PipelineError("official result-count label was not found")
    match = re.search(r"\bof\s+([\d,]+)\b", collapse_space(label.get_text(" ", strip=True)))
    if not match:
        raise PipelineError(f"unrecognized result-count label: {label.get_text(' ', strip=True)!r}")
    return int(match.group(1).replace(",", ""))


def discover_terms(args: argparse.Namespace) -> None:
    client = OfficialScheduleClient(args.delay)
    selector_terms = select_current_official_terms(client)
    if "2027SP" not in selector_terms:
        raise PipelineError(f"expected latest official selector term 2027SP, found {selector_terms}")

    records: list[dict[str, Any]] = []
    for index, term_code in enumerate((*TERM_CODES, *WINTER_CANDIDATES), start=1):
        soup = client.get_soup(params={"loc": "dvc", "trm": term_code})
        total = parse_result_total(soup)
        expected = term_code in TERM_CODES
        status = "PASS" if total > 0 else "UNAVAILABLE"
        record = {
            "term_id": term_code,
            "display_name": term_display(term_code),
            "period_start": None,
            "period_end": None,
            "selector_published": term_code in selector_terms,
            "in_scope": expected,
            "retrieval_status": status,
            "official_main_campus_sections": total,
            "raw_section_count": None,
            "source_urls": [
                f"{SCHEDULE_URL}?loc=dvc&trm={term_code}",
                f"{SCHEDULE_URL}?loc=src&trm={term_code}",
            ],
        }
        if term_code in OFFICIAL_PDF_SOURCES:
            record["official_pdf_url"] = OFFICIAL_PDF_SOURCES[term_code]
            if total == 0:
                record["unavailable_reason"] = (
                    "The official HTML schedule no longer exposes this term. The retained official PDF "
                    "abbreviates instructors to first initial plus surname, so it cannot safely supply "
                    "the required Professor identity without guessing."
                )
        elif total == 0:
            record["unavailable_reason"] = "No complete official section source is currently exposed."
        records.append(record)
        print(f"discover {index}/{len(TERM_CODES) + len(WINTER_CANDIDATES)} {term_code}: {status} ({total})", flush=True)

    failures = [record["term_id"] for record in records if record["in_scope"] and record["retrieval_status"] != "PASS"]
    payload = {
        "official_source": SCHEDULE_URL,
        "official_owner": "Contra Costa Community College District",
        "college": "Diablo Valley College",
        "discovered_at": utc_now(),
        "term_selector_values": selector_terms,
        "earliest_term": "2022FA",
        "latest_term": max(TERM_CODES, key=term_rank),
        "terms": records,
        "status": "PASS" if not failures else "INCOMPLETE",
    }
    write_json(SOURCE_TERMS_FILE, payload)
    if failures:
        print(f"source completeness is INCOMPLETE; unavailable terms: {failures}", flush=True)


def direct_data_rows(table: Tag) -> list[Tag]:
    rows = table.find_all("tr", recursive=False)
    return [row for row in rows if len(row.find_all("td", recursive=False)) == 9]


def parse_instructors(cell: Tag) -> list[str]:
    table = cell.select_one("table.grid-faculty-names")
    if not table:
        text = collapse_space(cell.get_text(" ", strip=True))
        return [text] if text else []
    names: list[str] = []
    for row in table.find_all("tr"):
        value = collapse_space(row.get_text(" ", strip=True))
        if value and value not in names:
            names.append(value)
    return names


def parse_meetings(cell: Tag) -> list[list[str]]:
    table = cell.select_one("table.grid-meetingdays")
    if not table:
        return []
    meetings: list[list[str]] = []
    for row in table.find_all("tr"):
        fields = [collapse_space(item.get_text(" ", strip=True)) for item in row.find_all("td", recursive=False)]
        if any(fields):
            meetings.append(fields)
    return meetings


def parse_course_raw(value: str) -> tuple[str, str, str]:
    code_part, separator, title = value.partition(" - ")
    if not separator or "-" not in code_part:
        raise PipelineError(f"unrecognized official course value: {value!r}")
    subject, course_number = code_part.rsplit("-", 1)
    subject = collapse_space(subject).upper()
    course_number = collapse_space(course_number).upper()
    title = collapse_space(title)
    if not subject or not course_number or not title:
        raise PipelineError(f"incomplete official course value: {value!r}")
    return subject, course_number, title


def parse_page_rows(soup: BeautifulSoup, source_url: str, page_number: int) -> list[dict[str, Any]]:
    table = soup.select_one("#ctl00_PlaceHolderMain_dgSchedulesFromUrl")
    if not table:
        raise PipelineError("official schedule result table was not found")
    output: list[dict[str, Any]] = []
    for row in direct_data_rows(table):
        cells = row.find_all("td", recursive=False)
        course_element = cells[3].select_one('span[id$="_lblCourse"]')
        date_element = cells[3].select_one('span[id$="_lblDates"]')
        section_element = cells[2].select_one('a[id$="_lbtnSectionNumber"]')
        if collapse_space(cells[0].get_text(" ", strip=True)) == "Term":
            continue
        if not course_element or not section_element:
            raise PipelineError("required course or section element missing from official row")
        course_raw = collapse_space(course_element.get_text(" ", strip=True))
        subject, course_number, course_title = parse_course_raw(course_raw)
        output.append(
            {
                "term_id": collapse_space(cells[0].get_text(" ", strip=True)),
                "location": collapse_space(cells[1].get_text(" ", strip=True)),
                "section_number": collapse_space(section_element.get_text(" ", strip=True)),
                "course_raw": course_raw,
                "subject_raw": subject,
                "course_number_raw": course_number,
                "course_title_raw": course_title,
                "date_range_raw": collapse_space(date_element.get_text(" ", strip=True)) if date_element else "",
                "meetings_raw": parse_meetings(cells[3]),
                "units_raw": collapse_space(cells[4].get_text(" ", strip=True)),
                "instructors_raw": parse_instructors(cells[5]),
                "status_raw": collapse_space(cells[7].get_text(" ", strip=True)),
                "seats_available_raw": collapse_space(cells[8].get_text(" ", strip=True)),
                "source_url": source_url,
                "source_page": page_number,
            }
        )
    return output


def next_event_target(soup: BeautifulSoup) -> str | None:
    for anchor in soup.find_all("a", href=True):
        if "Next" not in anchor.get_text(" ", strip=True):
            continue
        match = re.search(r"__doPostBack\('([^']+)'", anchor["href"])
        if match:
            return match.group(1)
    return None


def fetch_location(client: OfficialScheduleClient, term_code: str, location_param: str) -> tuple[list[dict[str, Any]], int]:
    params = {"loc": location_param, "trm": term_code}
    response = client.request("GET", SCHEDULE_URL, params=params)
    source_url = response.url
    soup = BeautifulSoup(response.text, "html.parser")
    expected_total = parse_result_total(soup)
    rows: list[dict[str, Any]] = []
    page_number = 1
    seen_page_starts: set[tuple[str, str, str]] = set()

    while True:
        page_rows = parse_page_rows(soup, source_url, page_number)
        if page_rows:
            marker = (
                page_rows[0]["term_id"],
                page_rows[0]["location"],
                page_rows[0]["section_number"],
            )
            if marker in seen_page_starts:
                raise PipelineError(f"pagination loop detected for {term_code}/{location_param}")
            seen_page_starts.add(marker)
        rows.extend(page_rows)
        target = next_event_target(soup)
        if not target:
            break
        data = hidden_fields(soup)
        data["__EVENTTARGET"] = target
        data["__EVENTARGUMENT"] = ""
        soup = client.post_soup(source_url, data)
        page_number += 1
        if page_number % 10 == 0:
            print(f"  {term_code}/{location_param}: page {page_number}, rows {len(rows)}/{expected_total}", flush=True)

    if len(rows) != expected_total:
        raise PipelineError(
            f"official row reconciliation failed for {term_code}/{location_param}: "
            f"parsed {len(rows)}, expected {expected_total}"
        )
    return rows, expected_total


def fetch_raw(args: argparse.Namespace) -> None:
    if not SOURCE_TERMS_FILE.exists():
        raise PipelineError("run the discover command before fetching raw data")
    manifest = json.loads(SOURCE_TERMS_FILE.read_text(encoding="utf-8"))
    if manifest.get("status") not in {"PASS", "INCOMPLETE"}:
        raise PipelineError("source term discovery is not usable")
    client = OfficialScheduleClient(args.delay)
    term_records = {record["term_id"]: record for record in manifest["terms"]}

    available_terms = [
        term_code
        for term_code in TERM_CODES
        if term_records[term_code]["retrieval_status"] == "PASS"
    ]
    requested_terms = set(args.terms or available_terms)
    unknown_terms = requested_terms.difference(available_terms)
    if unknown_terms:
        raise PipelineError(f"requested terms are not available PASS terms: {sorted(unknown_terms)}")
    available_terms = [term_code for term_code in available_terms if term_code in requested_terms]
    for term_index, term_code in enumerate(available_terms, start=1):
        output_path = RAW_DIR / term_slug(term_code) / "sections.json"
        if output_path.exists() and not args.refresh:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
            if existing.get("retrieval_status") == "PASS":
                print(f"fetch {term_index}/{len(available_terms)} {term_code}: existing PASS ({len(existing['sections'])})", flush=True)
                term_records[term_code]["raw_section_count"] = len(existing["sections"])
                term_records[term_code]["location_counts"] = existing["location_counts"]
                continue

        term_sections: list[dict[str, Any]] = []
        location_counts: dict[str, int] = {}
        for location_param, official_location in LOCATIONS:
            print(f"fetch {term_index}/{len(available_terms)} {term_code}/{location_param}: start", flush=True)
            rows, total = fetch_location(client, term_code, location_param)
            unexpected = sorted({row["location"] for row in rows if row["location"] != official_location})
            if unexpected:
                raise PipelineError(f"unexpected locations for {term_code}/{location_param}: {unexpected}")
            location_counts[official_location] = total
            term_sections.extend(rows)
            print(f"fetch {term_index}/{len(available_terms)} {term_code}/{location_param}: PASS ({total})", flush=True)

        identities = [
            (row["term_id"], row["location"], row["section_number"], row["course_raw"])
            for row in term_sections
        ]
        duplicate_count = len(identities) - len(set(identities))
        if duplicate_count:
            raise PipelineError(f"raw section duplicate detected for {term_code}: {duplicate_count}")
        payload = {
            "official_source": SCHEDULE_URL,
            "term_id": term_code,
            "term_display": term_display(term_code),
            "retrieved_at": utc_now(),
            "retrieval_status": "PASS",
            "location_counts": location_counts,
            "section_count": len(term_sections),
            "sections": sorted(
                term_sections,
                key=lambda row: (row["location"], row["section_number"], row["course_raw"]),
            ),
        }
        write_json(output_path, payload)
        term_records[term_code]["raw_section_count"] = len(term_sections)
        term_records[term_code]["location_counts"] = location_counts

    if not args.no_manifest:
        manifest["terms"] = [term_records[record["term_id"]] for record in manifest["terms"]]
        manifest["raw_retrieval_completed_at"] = utc_now()
        manifest["total_raw_sections"] = sum(
            record.get("raw_section_count") or 0 for record in manifest["terms"] if record["in_scope"]
        )
        write_json(SOURCE_TERMS_FILE, manifest)


def canonical_professor_name(raw_name: str) -> str:
    value = collapse_space(raw_name)
    if value.count(",") == 1:
        last, first = [collapse_space(part) for part in value.split(",", 1)]
        if first and last:
            value = f"{first} {last}"
    return collapse_space(value)


def placeholder_key(value: str) -> str:
    return re.sub(r"[.]+", "", normalized_identity(value))


def is_placeholder_professor(value: str) -> bool:
    key = placeholder_key(value)
    if key in PLACEHOLDER_NAMES:
        return True
    tokens = [token for token in re.split(r"[\s,]+", key) if token]
    return len(tokens) == 2 and (
        (tokens[0] == "staff" and tokens[1] in {"d", "s", "dvc", "src"})
        or (tokens[1] == "staff" and tokens[0] in {"d", "s", "dvc", "src"})
    )


def suspicious_professor_reason(name: str) -> list[str]:
    reasons: list[str] = []
    if re.search(r"\d", name):
        reasons.append("contains_digit")
    if "@" in name:
        reasons.append("contains_email")
    if re.search(r"https?://|www\.", name, flags=re.IGNORECASE):
        reasons.append("contains_url")
    if re.search(r"\s(?:/|&| and )\s", name, flags=re.IGNORECASE):
        reasons.append("possible_combined_name")
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]+", name)
    if len(tokens) < 2:
        reasons.append("single_name_token")
    elif len(tokens[0]) == 1:
        reasons.append("given_name_is_initial_only")
    if re.search(r"[^A-Za-zÀ-ÖØ-öø-ÿ'.,()\-\s]", name):
        reasons.append("unusual_punctuation")
    return reasons


def name_variant_key(name: str) -> str:
    tokens = re.findall(r"[a-z]+", name.casefold())
    tokens = [token for token in tokens if len(token) > 1]
    if len(tokens) < 2:
        return ""
    return "|".join(sorted((tokens[0], tokens[-1])))


@dataclass
class SeenRange:
    first: str
    last: str

    def observe(self, term_code: str) -> None:
        if term_rank(term_code) < term_rank(self.first):
            self.first = term_code
        if term_rank(term_code) > term_rank(self.last):
            self.last = term_code


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(path)


def process_raw(_: argparse.Namespace) -> None:
    raw_sections: list[dict[str, Any]] = []
    raw_term_counts: dict[str, int] = {}
    if not SOURCE_TERMS_FILE.exists():
        raise PipelineError("source term manifest does not exist")
    source_manifest = json.loads(SOURCE_TERMS_FILE.read_text(encoding="utf-8"))
    available_terms = [
        record["term_id"]
        for record in source_manifest["terms"]
        if record.get("in_scope") and record.get("retrieval_status") == "PASS"
    ]
    if not available_terms:
        raise PipelineError("no official terms are available for processing")
    for term_code in available_terms:
        path = RAW_DIR / term_slug(term_code) / "sections.json"
        if not path.exists():
            raise PipelineError(f"missing raw term file: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("retrieval_status") != "PASS" or payload.get("term_id") != term_code:
            raise PipelineError(f"raw term is not a matching PASS snapshot: {path}")
        sections = payload.get("sections", [])
        if len(sections) != payload.get("section_count"):
            raise PipelineError(f"raw term count mismatch: {path}")
        raw_term_counts[term_code] = len(sections)
        raw_sections.extend(sections)

    courses: dict[tuple[str, str], dict[str, Any]] = {}
    professors: dict[str, dict[str, Any]] = {}
    relationships: dict[tuple[str, str, str], dict[str, Any]] = {}
    title_variants: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    raw_instructor_counter: Counter[str] = Counter()
    placeholder_counter: Counter[str] = Counter()
    removed_placeholder_relationships = 0
    suspicious_rows: list[dict[str, Any]] = []
    suspicious_course_rows: list[dict[str, Any]] = []

    for section in sorted(raw_sections, key=lambda row: (term_rank(row["term_id"]), row["location"], row["section_number"])):
        term_code = section["term_id"]
        subject = collapse_space(section["subject_raw"]).upper()
        number = collapse_space(section["course_number_raw"]).upper()
        title = collapse_space(section["course_title_raw"])
        course_reasons: list[str] = []
        if not re.fullmatch(r"[A-Z][A-Z0-9-]*", subject):
            course_reasons.append("malformed_subject")
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]*", number):
            course_reasons.append("malformed_course_number")
        if re.search(r"https?://|www\.|@", title, flags=re.IGNORECASE):
            course_reasons.append("title_contains_url_or_email")
        if re.search(r"\b(?:cross[- ]?listed|combined section)\b", title, flags=re.IGNORECASE):
            course_reasons.append("possible_cross_listed_course")
        if course_reasons:
            suspicious_course_rows.append(
                {
                    "term_id": term_code,
                    "location": section["location"],
                    "section_number": section["section_number"],
                    "course_raw": section["course_raw"],
                    "reasons": course_reasons,
                }
            )
        course_key = (normalized_identity(subject), normalized_identity(number))
        title_variants[course_key][title] += 1
        existing_course = courses.get(course_key)
        if not existing_course:
            courses[course_key] = {
                "subject": subject,
                "course_number": number,
                "course_title": title,
                "first_seen_term_id": term_code,
                "last_seen_term_id": term_code,
                "title_term_id": term_code,
            }
        else:
            if term_rank(term_code) >= term_rank(existing_course["title_term_id"]):
                existing_course["course_title"] = title
                existing_course["title_term_id"] = term_code
            existing_course["first_seen_term_id"] = min(
                existing_course["first_seen_term_id"], term_code, key=term_rank
            )
            existing_course["last_seen_term_id"] = max(
                existing_course["last_seen_term_id"], term_code, key=term_rank
            )

        instructors = section.get("instructors_raw", [])
        if not instructors:
            placeholder_counter["(blank)"] += 1
            removed_placeholder_relationships += 1
        for instructor_raw in instructors:
            raw_value = collapse_space(instructor_raw)
            raw_instructor_counter[raw_value] += 1
            if is_placeholder_professor(raw_value):
                placeholder_counter[raw_value or "(blank)"] += 1
                removed_placeholder_relationships += 1
                continue
            canonical = canonical_professor_name(raw_value)
            reasons = suspicious_professor_reason(canonical)
            if reasons:
                suspicious_rows.append(
                    {
                        "term_id": term_code,
                        "location": section["location"],
                        "section_number": section["section_number"],
                        "instructor_raw": raw_value,
                        "canonical_name": canonical,
                        "reasons": reasons,
                    }
                )
            professor_key = normalized_identity(canonical)
            existing_professor = professors.get(professor_key)
            if not existing_professor:
                professors[professor_key] = {
                    "instructor_name": canonical,
                    "first_seen_term_id": term_code,
                    "last_seen_term_id": term_code,
                    "raw_variants": {raw_value},
                }
            else:
                existing_professor["first_seen_term_id"] = min(
                    existing_professor["first_seen_term_id"], term_code, key=term_rank
                )
                existing_professor["last_seen_term_id"] = max(
                    existing_professor["last_seen_term_id"], term_code, key=term_rank
                )
                existing_professor["raw_variants"].add(raw_value)

            relationship_key = (course_key[0], course_key[1], professor_key)
            existing_relationship = relationships.get(relationship_key)
            if not existing_relationship:
                relationships[relationship_key] = {
                    "subject": subject,
                    "course_number": number,
                    "instructor_name": canonical,
                    "first_seen_term_id": term_code,
                    "last_seen_term_id": term_code,
                }
            else:
                existing_relationship["first_seen_term_id"] = min(
                    existing_relationship["first_seen_term_id"], term_code, key=term_rank
                )
                existing_relationship["last_seen_term_id"] = max(
                    existing_relationship["last_seen_term_id"], term_code, key=term_rank
                )

    variant_groups: dict[str, list[str]] = defaultdict(list)
    for professor in professors.values():
        key = name_variant_key(professor["instructor_name"])
        if key:
            variant_groups[key].append(professor["instructor_name"])
    possible_variants = [
        {"variant_key": key, "names": sorted(set(names), key=str.casefold)}
        for key, names in variant_groups.items()
        if len(set(name.casefold() for name in names)) > 1
    ]

    course_rows = [
        {
            "subject": row["subject"],
            "course_number": row["course_number"],
            "course_title": row["course_title"],
            "first_seen_term": term_display(row["first_seen_term_id"]),
            "last_seen_term": term_display(row["last_seen_term_id"]),
        }
        for row in sorted(courses.values(), key=lambda item: (item["subject"], item["course_number"]))
    ]
    professor_rows = [
        {
            "instructor_name": row["instructor_name"],
            "first_seen_term": term_display(row["first_seen_term_id"]),
            "last_seen_term": term_display(row["last_seen_term_id"]),
        }
        for row in sorted(professors.values(), key=lambda item: item["instructor_name"].casefold())
    ]
    relationship_rows = [
        {
            "subject": row["subject"],
            "course_number": row["course_number"],
            "instructor_name": row["instructor_name"],
            "first_seen_term": term_display(row["first_seen_term_id"]),
            "last_seen_term": term_display(row["last_seen_term_id"]),
        }
        for row in sorted(
            relationships.values(),
            key=lambda item: (item["subject"], item["course_number"], item["instructor_name"].casefold()),
        )
    ]

    write_csv(
        PROCESSED_DIR / "dvc_courses.csv",
        ["subject", "course_number", "course_title", "first_seen_term", "last_seen_term"],
        course_rows,
    )
    write_csv(
        PROCESSED_DIR / "dvc_professors.csv",
        ["instructor_name", "first_seen_term", "last_seen_term"],
        professor_rows,
    )
    write_csv(
        PROCESSED_DIR / "dvc_course_professors.csv",
        ["subject", "course_number", "instructor_name", "first_seen_term", "last_seen_term"],
        relationship_rows,
    )

    course_keys = {(normalized_identity(row["subject"]), normalized_identity(row["course_number"])) for row in course_rows}
    professor_keys = {normalized_identity(row["instructor_name"]) for row in professor_rows}
    relationship_keys = {
        (normalized_identity(row["subject"]), normalized_identity(row["course_number"]), normalized_identity(row["instructor_name"]))
        for row in relationship_rows
    }
    validation = {
        "generated_at": utc_now(),
        "official_source": SCHEDULE_URL,
        "terms_processed": len(available_terms),
        "terms_required": len(TERM_CODES),
        "source_completeness_status": "PASS" if available_terms == list(TERM_CODES) else "FAIL",
        "unavailable_terms": [term_display(code) for code in TERM_CODES if code not in available_terms],
        "earliest_term": term_display(TERM_CODES[0]),
        "latest_term": term_display(max(available_terms, key=term_rank)),
        "raw_sections": len(raw_sections),
        "raw_sections_per_term": {term_display(code): raw_term_counts[code] for code in available_terms},
        "raw_unique_course_identities": len({(normalized_identity(row["subject_raw"]), normalized_identity(row["course_number_raw"])) for row in raw_sections}),
        "raw_instructor_strings": len(raw_instructor_counter),
        "raw_instructor_occurrences": sum(raw_instructor_counter.values()),
        "raw_placeholder_occurrences": sum(placeholder_counter.values()),
        "raw_placeholders": dict(sorted(placeholder_counter.items(), key=lambda item: item[0].casefold())),
        "processed_courses": len(course_rows),
        "processed_professors": len(professor_rows),
        "processed_relationships": len(relationship_rows),
        "removed_placeholder_relationships": removed_placeholder_relationships,
        "duplicate_courses": len(course_rows) - len(course_keys),
        "duplicate_professors": len(professor_rows) - len(professor_keys),
        "duplicate_relationships": len(relationship_rows) - len(relationship_keys),
        "blank_course_required": sum(not row["subject"] or not row["course_number"] or not row["course_title"] for row in course_rows),
        "blank_professor": sum(not row["instructor_name"] for row in professor_rows),
        "placeholder_professors": sum(is_placeholder_professor(row["instructor_name"]) for row in professor_rows),
        "placeholder_relationships": sum(is_placeholder_professor(row["instructor_name"]) for row in relationship_rows),
        "orphan_courses": sum((normalized_identity(row["subject"]), normalized_identity(row["course_number"])) not in course_keys for row in relationship_rows),
        "orphan_professors": sum(normalized_identity(row["instructor_name"]) not in professor_keys for row in relationship_rows),
        "cross_school_rows": 0,
        "malformed_courses": sum(
            "malformed_subject" in row["reasons"] or "malformed_course_number" in row["reasons"]
            for row in suspicious_course_rows
        ),
        "suspicious_course_rows": len(suspicious_course_rows),
        "suspicious_professor_rows": len(suspicious_rows),
        "possible_professor_variant_groups": len(possible_variants),
        "course_title_variant_count": sum(len(titles) > 1 for titles in title_variants.values()),
        "checksums": {
            "dvc_courses.csv": sha256_file(PROCESSED_DIR / "dvc_courses.csv"),
            "dvc_professors.csv": sha256_file(PROCESSED_DIR / "dvc_professors.csv"),
            "dvc_course_professors.csv": sha256_file(PROCESSED_DIR / "dvc_course_professors.csv"),
        },
    }
    hard_fail_fields = (
        "duplicate_courses",
        "duplicate_professors",
        "duplicate_relationships",
        "blank_course_required",
        "blank_professor",
        "placeholder_professors",
        "placeholder_relationships",
        "orphan_courses",
        "orphan_professors",
        "cross_school_rows",
        "malformed_courses",
    )
    validation["hard_validation_status"] = (
        "PASS" if all(validation[field] == 0 for field in hard_fail_fields) else "FAIL"
    )
    validation["production_import_readiness"] = (
        "GO"
        if validation["hard_validation_status"] == "PASS"
        and validation["source_completeness_status"] == "PASS"
        and validation["suspicious_professor_rows"] == 0
        and validation["possible_professor_variant_groups"] == 0
        else "NO-GO"
    )
    write_json(REPORTS_DIR / "validation-summary.json", validation)
    write_json(REPORTS_DIR / "suspicious-professors.json", suspicious_rows)
    write_json(REPORTS_DIR / "suspicious-courses.json", suspicious_course_rows)
    write_json(REPORTS_DIR / "possible-professor-variants.json", possible_variants)
    write_json(
        REPORTS_DIR / "course-title-variants.json",
        [
            {
                "subject": courses[key]["subject"],
                "course_number": courses[key]["course_number"],
                "selected_latest_title": courses[key]["course_title"],
                "observed_titles": dict(sorted(titles.items())),
            }
            for key, titles in sorted(title_variants.items())
            if len(titles) > 1
        ],
    )
    print(json.dumps(validation, ensure_ascii=False, indent=2))
    if validation["hard_validation_status"] != "PASS":
        raise PipelineError("processed DVC dataset failed hard validation")


def validate_only(_: argparse.Namespace) -> None:
    summary_path = REPORTS_DIR / "validation-summary.json"
    if not summary_path.exists():
        raise PipelineError("processed validation summary does not exist")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    current = {
        name: sha256_file(PROCESSED_DIR / name)
        for name in ("dvc_courses.csv", "dvc_professors.csv", "dvc_course_professors.csv")
    }
    if current != summary.get("checksums"):
        raise PipelineError("processed checksums do not match validation summary")
    if summary.get("hard_validation_status") != "PASS":
        raise PipelineError("hard validation status is not PASS")
    print(json.dumps({"status": "PASS", "checksums": current}, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("discover", "fetch"):
        subparser = subparsers.add_parser(command)
        subparser.add_argument("--delay", type=float, default=REQUEST_DELAY_SECONDS)
        if command == "fetch":
            subparser.add_argument("--refresh", action="store_true")
            subparser.add_argument("--terms", nargs="+", choices=TERM_CODES)
            subparser.add_argument("--no-manifest", action="store_true")
    subparsers.add_parser("process")
    subparsers.add_parser("validate")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "discover":
            discover_terms(args)
        elif args.command == "fetch":
            fetch_raw(args)
        elif args.command == "process":
            process_raw(args)
        elif args.command == "validate":
            validate_only(args)
        else:
            raise PipelineError(f"unsupported command: {args.command}")
        return 0
    except PipelineError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
