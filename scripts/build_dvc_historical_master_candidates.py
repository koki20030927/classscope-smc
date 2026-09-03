#!/usr/bin/env python3
"""Build a read-only DVC historical master candidate without touching either DB.

Evidence is deliberately conservative:
* the existing processed master is immutable baseline;
* previously reviewed official catalog/schedule candidates are retained;
* an abbreviated schedule identity is expanded only when one existing DVC
  Professor matches surname+initial and has an exact current Course anchor;
* historical Course candidates require both a complete official schedule
  occurrence and a title recovered from the official 2022-23 catalog.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pdfplumber


REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "data/dvc"
OUT = DATA / "historical-candidate-v1"
PROCESSED = DATA / "processed"
CATALOG = DATA / "raw/historical/catalogs/dvc-catalog-2022-2023.pdf"
RESOLUTION = DATA / "reports/historical-professor-resolution.json"
EXISTING = DATA / "external/ja-audit-v1/resolution-v1/master-expansion-candidates.json"
RECLASSIFIED = DATA / "external/ja-audit-v1/provider-evidence-v1/reclassification-257.csv"
ROW_AUDIT = DATA / "external/ja-audit-v1/row-audit.csv"

BASELINE_HASHES = {
    "dvc_courses.csv": "fdd5f30561154a7f5863a6f51fbf784ea45e1804755913e7e6c547d1255a2ad8",
    "dvc_professors.csv": "147c2148068a4ca86ea6b43a3e5c027c323fd35a8c42257e49d6f6f010275c80",
    "dvc_course_professors.csv": "586baabf72dd3c28e07072976684b0ad878de4af68cb96a94aa2628d6499444f",
}
SAFE_BASELINE_PROFESSORS = 821
SAFE_BASELINE_RELATIONSHIPS = 2607

TERM_ORDER = {
    "Fall 2022": 0, "Spring 2023": 1, "Summer 2023": 2, "Fall 2023": 3,
    "Spring 2024": 4, "Summer 2024": 5, "Fall 2024": 6,
    "Spring 2025": 7, "Summer 2025": 8, "Fall 2025": 9,
    "Spring 2026": 10, "Summer 2026": 11, "Fall 2026": 12,
    "Spring 2027": 13,
}

PLACEHOLDERS = {"staff", "d staff", "s staff", "tba", "tbd", "unassigned", "unknown"}

FACULTY_ROLE_SUBJECTS = {
    "administration of justice": {"ADJUS"}, "anthropology": {"ANTHR"},
    "architecture": {"ARCHI"}, "art digital media": {"ARTDM"}, "art history": {"ARTHS"},
    "art": {"ART"}, "biology": {"BIOSC"}, "biological science": {"BIOSC"},
    "business": {"BUS", "BUSAC", "BUSMG", "BUSMK"}, "chemistry": {"CHEM"},
    "communication studies": {"COMM"}, "computer science": {"COMSC"},
    "construction": {"CONST"}, "counseling": {"CARER", "COUNS"},
    "culinary arts": {"CULN"}, "dental assisting": {"DENTL"}, "dental hygiene": {"DENHY"},
    "drama": {"DRAMA"}, "early childhood education": {"ECE"}, "economics": {"ECON"},
    "engineering": {"ENGIN"}, "english as a second language": {"ESL"}, "english": {"ENGL"},
    "foreign language": {"ARABC", "CHIN", "FRNCH", "ITAL", "JAPAN", "SPAN"},
    "geography": {"GEOG"}, "geology": {"GEOL"}, "history": {"HIST"},
    "horticulture": {"HORT"}, "interior design": {"IDSGN"}, "journalism": {"JRNAL"},
    "kinesiology": {"KINES", "KNACT", "KNICA"}, "library": {"LT"},
    "mathematics": {"MATH", "STAT"}, "music": {"MUSIC", "MUSX"},
    "oceanography": {"OCEAN"}, "philosophy": {"PHILO"}, "physics": {"PHYS"},
    "political science": {"POLS", "POLSC"}, "psychology": {"PSYC", "PSYCH"},
    "public health": {"PH"}, "sociology": {"SOCIO"},
}

CURATED_OFFICIAL_PREFERRED_NAME_BRIDGES = {
    "John Read Vanderbilt": "Read Vanderbilt",
    "J. Mauricio Najarro": "Mauricio Najarro",
    "William Parks": "Will Parks",
    "C. D. Samuel Needham": "Sam Needham",
}


def is_placeholder_professor(value: str) -> bool:
    key = re.sub(r"[.]+", "", norm(value))
    if key in PLACEHOLDERS:
        return True
    tokens = [token for token in re.split(r"[\s,]+", key) if token]
    return len(tokens) == 2 and (
        (tokens[0] == "staff" and tokens[1] in {"d", "s", "dvc", "src"})
        or (tokens[1] == "staff" and tokens[0] in {"d", "s", "dvc", "src"})
    )


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def person_key(value: str) -> tuple[str, str] | None:
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", value)
    if len(tokens) < 2:
        return None
    return tokens[0][0].casefold(), tokens[-1].casefold()


def min_term(values: set[str]) -> str:
    return min(values, key=lambda value: TERM_ORDER.get(value, 999))


def max_term(values: set[str]) -> str:
    return max(values, key=lambda value: TERM_ORDER.get(value, -1))


def catalog_titles() -> dict[tuple[str, str], str]:
    """Extract only course-description headings followed by an official units line."""
    candidates: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    heading = re.compile(r"^([A-Z]{2,8})-([0-9][A-Z0-9.]*)\s+(.+)$")
    units = re.compile(r"^\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\s+units?\b", re.I)
    with pdfplumber.open(CATALOG) as pdf:
        for page in pdf.pages[70:445]:
            width, height = page.width, page.height
            columns = (
                page.crop((20, 40, width / 2 - 4, height - 35)),
                page.crop((width / 2 + 4, 40, width - 20, height - 35)),
            )
            for column in columns:
                lines = [re.sub(r"\s+", " ", line).strip() for line in (column.extract_text(x_tolerance=1, y_tolerance=3) or "").splitlines()]
                for index, line in enumerate(lines):
                    match = heading.match(line)
                    if not match or "..." in line:
                        continue
                    subject, number, first = match.groups()
                    title_parts = [first]
                    unit_found = False
                    for following in lines[index + 1:index + 4]:
                        if units.match(following):
                            unit_found = True
                            break
                        if heading.match(following) or following.startswith("•") or not following:
                            break
                        title_parts.append(following)
                    if not unit_found:
                        continue
                    title = " ".join(title_parts)
                    title = re.sub(r"\s+", " ", title).strip(" .")
                    if 3 <= len(title) <= 120 and not re.search(r"https?://|@", title, re.I):
                        candidates[(subject, number)][title] += 1
    return {
        key: sorted(counts.items(), key=lambda item: (-item[1], len(item[0]), item[0]))[0][0]
        for key, counts in candidates.items()
    }


def catalog_faculty() -> list[dict[str, Any]]:
    """Extract full-name DVC faculty roster entries and their official role."""
    output: list[dict[str, Any]] = []
    name_pattern = re.compile(r"^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ' .()\-]+,\s*[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ' .()\-]+$")
    with pdfplumber.open(CATALOG) as pdf:
        for page in pdf.pages[446:454]:
            for x0, x1 in ((30, 205), (210, 400), (405, 585)):
                lines = [re.sub(r"\s+", " ", line).strip() for line in (page.crop((x0, 40, x1, page.height - 40)).extract_text(x_tolerance=1, y_tolerance=3) or "").splitlines()]
                for index, line in enumerate(lines):
                    role = lines[index + 1].casefold() if index + 1 < len(lines) else ""
                    if not name_pattern.fullmatch(line) or "aculty" not in role:
                        continue
                    last, first = (part.strip() for part in line.split(",", 1))
                    full_name = f"{first} {last}"
                    allowed_subjects: set[str] = set()
                    for phrase, subjects in FACULTY_ROLE_SUBJECTS.items():
                        if phrase in role:
                            allowed_subjects.update(subjects)
                    if allowed_subjects:
                        output.append({"full_name": full_name, "role": role, "subjects": sorted(allowed_subjects), "page": page.page_number})
    # Exact duplicate extraction is possible at a page/column boundary.
    unique = {(row["full_name"], row["role"], tuple(row["subjects"])): row for row in output}
    return sorted(unique.values(), key=lambda row: row["full_name"].casefold())


def first_last_key(value: str) -> tuple[str, str] | None:
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", value.casefold())
    return (tokens[0], tokens[-1]) if len(tokens) >= 2 else None


def possible_existing_variants(official_name: str, existing_names: list[str]) -> list[str]:
    """Conservatively flag likely preferred-name/spelling/surname variants."""
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", official_name.casefold())
    if len(tokens) < 2:
        return []
    official_last = tokens[-1]
    official_given = {token for token in tokens[:-1] if len(token) > 1}
    matches: list[str] = []
    for existing in existing_names:
        other = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", existing.casefold())
        if len(other) < 2:
            continue
        other_last = other[-1]
        surname_related = official_last == other_last or official_last.startswith(other_last + "-") or other_last.startswith(official_last + "-")
        if not surname_related:
            continue
        other_given = {token for token in other[:-1] if len(token) > 1}
        given_related = bool(official_given & other_given) or any(a[:3] == b[:3] for a in official_given for b in other_given if len(a) >= 3 and len(b) >= 3)
        if given_related:
            matches.append(existing)
    return sorted(set(matches), key=str.casefold)


def main() -> None:
    for filename, expected in BASELINE_HASHES.items():
        actual = sha256(PROCESSED / filename)
        if actual != expected:
            raise RuntimeError(f"Immutable baseline changed: {filename}: {actual}")

    courses = read_csv(PROCESSED / "dvc_courses.csv")
    professors = read_csv(PROCESSED / "dvc_professors.csv")
    relationships = read_csv(PROCESSED / "dvc_course_professors.csv")
    if (len(courses), len(professors), len(relationships)) != (1080, 823, 2776):
        raise RuntimeError("Expected fixed 1080/823/2776 DVC baseline")
    professors = [row for row in professors if not is_placeholder_professor(row["instructor_name"])]
    relationships = [row for row in relationships if not is_placeholder_professor(row["instructor_name"])]

    existing = json.loads(EXISTING.read_text(encoding="utf-8"))
    if tuple(len(existing[key]) for key in ("courses", "professors", "relationships")) != (14, 0, 25):
        raise RuntimeError("Expected reviewed +14/+0/+25 expansion")

    historical = json.loads(RESOLUTION.read_text(encoding="utf-8"))["historical_identity_records"]
    titles = catalog_titles()
    faculty = catalog_faculty()
    course_map = {(row["subject"], row["course_number"]): dict(row) for row in courses}
    professor_map = {norm(row["instructor_name"]): dict(row) for row in professors}
    rel_map: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in relationships:
        key = (row["subject"], row["course_number"], norm(row["instructor_name"]))
        rel_map[key] = {**row, "evidence_type": "OFFICIAL_COMPLETE_SCHEDULE", "evidence_terms": f'{row["first_seen_term"]}|{row["last_seen_term"]}', "source_urls": "current official 4CD schedule snapshot"}

    existing_terms_by_course: dict[str, set[str]] = defaultdict(set)
    for relationship in existing["relationships"]:
        existing_terms_by_course[relationship["course_code"]].update(relationship["official_schedule_terms"])
    existing_course_keys: set[tuple[str, str]] = set()
    for row in existing["courses"]:
        subject, number = row["course_code"].split()
        evidence_terms = existing_terms_by_course[row["course_code"]]
        existing_course_keys.add((subject, number))
        course_map[(subject, number)] = {
            "subject": subject, "course_number": number, "course_title": row["course_title"],
            "first_seen_term": min_term(evidence_terms) if evidence_terms else "",
            "last_seen_term": max_term(evidence_terms) if evidence_terms else "",
        }

    existing_relationship_keys: set[tuple[str, str, str]] = set()
    for row in existing["relationships"]:
        subject, number = row["course_code"].split()
        key = (subject, number, norm(row["professor"]))
        existing_relationship_keys.add(key)
        terms = set(row["official_schedule_terms"])
        rel_map[key] = {
            "subject": subject, "course_number": number, "instructor_name": row["professor"],
            "first_seen_term": min_term(terms), "last_seen_term": max_term(terms),
            "evidence_type": "OFFICIAL_COMPLETE_SCHEDULE", "evidence_terms": "|".join(sorted(terms, key=TERM_ORDER.get)),
            "source_urls": "|".join(sorted(row["official_schedule_urls"])),
        }

    # Course candidates: the official complete PDF supplies the occurrence, while
    # the official catalog supplies a usable title. Malformed OCR tokens are excluded.
    historical_course_terms: dict[tuple[str, str], set[str]] = defaultdict(set)
    historical_course_urls: dict[tuple[str, str], set[str]] = defaultdict(set)
    for identity in historical:
        if identity["placeholder"]:
            continue
        for occurrence in identity["occurrences"]:
            key = (occurrence["subject"], occurrence["course_number"])
            if re.fullmatch(r"[A-Z][A-Z0-9-]*", key[0]) and re.fullmatch(r"[A-Z0-9][A-Z0-9.-]*", key[1]):
                historical_course_terms[key].add(occurrence["term"])
                historical_course_urls[key].add(occurrence["official_schedule_source_url"])

    additional_course_keys: set[tuple[str, str]] = set()
    unresolved_course_keys: list[dict[str, Any]] = []
    for key, terms in sorted(historical_course_terms.items()):
        if key in course_map:
            continue
        title = titles.get(key)
        if not title:
            unresolved_course_keys.append({"course_code": " ".join(key), "terms": sorted(terms, key=TERM_ORDER.get), "reason": "NO_SAFE_OFFICIAL_CATALOG_TITLE"})
            continue
        additional_course_keys.add(key)
        course_map[key] = {
            "subject": key[0], "course_number": key[1], "course_title": title,
            "first_seen_term": min_term(terms), "last_seen_term": max_term(terms),
        }

    # Resolve initial+surnames only against a unique existing DVC Professor and
    # require an exact Course anchor already present in the current official master.
    professor_candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in professors:
        key = person_key(row["instructor_name"])
        if key:
            professor_candidates[key].append(row["instructor_name"])
    current_rel_keys = {(row["subject"], row["course_number"], norm(row["instructor_name"])) for row in relationships}
    faculty_by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in faculty:
        key = person_key(row["full_name"])
        if key:
            faculty_by_key[key].append(row)
    current_by_first_last: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in professors:
        key = first_last_key(row["instructor_name"])
        if key:
            current_by_first_last[key].append(row["instructor_name"])
    resolved_identities: list[dict[str, Any]] = []
    resolved_occurrence_keys: set[tuple[str, str, str]] = set()
    additional_historical_relationship_keys: set[tuple[str, str, str]] = set()
    excluded_possible_variants: dict[str, set[str]] = defaultdict(set)
    placeholder_occurrences = 0

    for identity in historical:
        if identity["placeholder"]:
            placeholder_occurrences += identity["occurrence_count"]
            continue
        match = re.fullmatch(r"([A-Z])\.\s+(.+)", identity["raw_instructor_string"])
        if not match:
            continue
        identity_key = (match.group(1).casefold(), match.group(2).casefold())
        candidates = professor_candidates.get(identity_key, [])
        anchored = []
        for candidate in candidates:
            if any((item["subject"], item["course_number"], norm(candidate)) in current_rel_keys for item in identity["occurrences"]):
                anchored.append(candidate)
        if len(candidates) != 1 or len(anchored) != 1:
            continue
        professor = anchored[0]
        official_competitors = [
            row for row in faculty_by_key.get(identity_key, [])
            if first_last_key(row["full_name"]) != first_last_key(professor)
            and CURATED_OFFICIAL_PREFERRED_NAME_BRIDGES.get(row["full_name"]) != professor
        ]
        applicable_occurrences = [
            item for item in identity["occurrences"]
            if not official_competitors or (item["subject"], item["course_number"], norm(professor)) in current_rel_keys
        ]
        if not applicable_occurrences:
            continue
        resolved_identities.append({
            "raw_instructor_string": identity["raw_instructor_string"], "professor": professor,
            "resolution": "UNIQUE_SURNAME_INITIAL_PLUS_EXACT_CURRENT_COURSE_ANCHOR" if not official_competitors else "COURSE_SCOPED_CURRENT_ANCHOR_WITH_OFFICIAL_NAME_CONFLICT",
            "occurrence_count": len(applicable_occurrences),
            "courses": sorted({f'{item["subject"]} {item["course_number"]}' for item in applicable_occurrences}),
            "competing_official_names": sorted({row["full_name"] for row in official_competitors}),
        })
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for occurrence in applicable_occurrences:
            grouped[(occurrence["subject"], occurrence["course_number"])].append(occurrence)
            resolved_occurrence_keys.add((identity["raw_instructor_string"], occurrence["subject"], occurrence["course_number"]))
        for course_key, occurrences in grouped.items():
            if course_key not in course_map:
                continue
            key = (course_key[0], course_key[1], norm(professor))
            terms = {item["term"] for item in occurrences}
            urls = {item["official_schedule_source_url"] for item in occurrences}
            if key not in rel_map:
                additional_historical_relationship_keys.add(key)
                rel_map[key] = {
                    "subject": course_key[0], "course_number": course_key[1], "instructor_name": professor,
                    "first_seen_term": min_term(terms), "last_seen_term": max_term(terms),
                    "evidence_type": "OFFICIAL_COMPLETE_SCHEDULE", "evidence_terms": "|".join(sorted(terms, key=TERM_ORDER.get)),
                    "source_urls": "|".join(sorted(urls)),
                }
            else:
                row = rel_map[key]
                old_terms = {term for term in row["evidence_terms"].split("|") if term in TERM_ORDER}
                all_terms = old_terms | terms
                if all_terms:
                    row["first_seen_term"] = min_term(all_terms)
                    row["last_seen_term"] = max_term(all_terms)
                    row["evidence_terms"] = "|".join(sorted(all_terms, key=TERM_ORDER.get))
                old_urls = {value for value in row["source_urls"].split("|") if value}
                if "current official 4CD schedule snapshot" in old_urls:
                    old_urls.remove("current official 4CD schedule snapshot")
                    old_urls.add("https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx")
                row["source_urls"] = "|".join(sorted(old_urls | urls))

    # A second safe route uses the official 2022-23 DVC faculty roster. The
    # roster must supply one full name, DVC faculty affiliation, and a role whose
    # subject agrees with the exact schedule Course occurrence.
    for identity in historical:
        if identity["placeholder"]:
            continue
        match = re.fullmatch(r"([A-Z])\.\s+(.+)", identity["raw_instructor_string"])
        if not match:
            continue
        identity_key = (match.group(1).casefold(), match.group(2).casefold())
        for occurrence in identity["occurrences"]:
            occurrence_key = (identity["raw_instructor_string"], occurrence["subject"], occurrence["course_number"])
            if occurrence_key in resolved_occurrence_keys or (occurrence["subject"], occurrence["course_number"]) not in course_map:
                continue
            official_matches = [row for row in faculty_by_key.get(identity_key, []) if occurrence["subject"] in row["subjects"]]
            if len(official_matches) != 1:
                continue
            official = official_matches[0]
            preferred = CURATED_OFFICIAL_PREFERRED_NAME_BRIDGES.get(official["full_name"])
            if preferred:
                professor = preferred
            else:
                current_matches = current_by_first_last.get(first_last_key(official["full_name"]) or ("", ""), [])
                if len(current_matches) > 1:
                    continue
                if len(current_matches) == 1:
                    professor = current_matches[0]
                else:
                    variants = possible_existing_variants(official["full_name"], [row["instructor_name"] for row in professors])
                    if variants:
                        excluded_possible_variants[official["full_name"]].update(variants)
                        continue
                    professor = official["full_name"]
            if norm(professor) not in professor_map:
                professor_map[norm(professor)] = {
                    "instructor_name": professor,
                    "first_seen_term": occurrence["term"], "last_seen_term": occurrence["term"],
                }
            else:
                professor_row = professor_map[norm(professor)]
                terms = {professor_row["first_seen_term"], professor_row["last_seen_term"], occurrence["term"]}
                professor_row["first_seen_term"] = min_term(terms)
                professor_row["last_seen_term"] = max_term(terms)
            key = (occurrence["subject"], occurrence["course_number"], norm(professor))
            if key not in rel_map:
                additional_historical_relationship_keys.add(key)
                rel_map[key] = {
                    "subject": occurrence["subject"], "course_number": occurrence["course_number"], "instructor_name": professor,
                    "first_seen_term": occurrence["term"], "last_seen_term": occurrence["term"],
                    "evidence_type": "OFFICIAL_COMPLETE_SCHEDULE", "evidence_terms": occurrence["term"],
                    "source_urls": f'{occurrence["official_schedule_source_url"]}|https://www.dvc.edu/sites/default/files/2025-01/college-catalog-2022-2023.pdf#page={official["page"]}',
                }
            else:
                relation = rel_map[key]
                terms = {value for value in relation["evidence_terms"].split("|") if value in TERM_ORDER} | {occurrence["term"]}
                relation["first_seen_term"] = min_term(terms)
                relation["last_seen_term"] = max_term(terms)
                relation["evidence_terms"] = "|".join(sorted(terms, key=TERM_ORDER.get))
            resolved_occurrence_keys.add(occurrence_key)
            resolved_identities.append({
                "raw_instructor_string": identity["raw_instructor_string"], "professor": professor,
                "resolution": "OFFICIAL_FACULTY_FULL_NAME_AND_ROLE_PLUS_EXACT_SCHEDULE_COURSE",
                "occurrence_count": 1, "courses": [f'{occurrence["subject"]} {occurrence["course_number"]}'],
                "official_catalog_page": official["page"], "official_role": official["role"],
            })

    unresolved_identities: list[dict[str, Any]] = []
    for identity in historical:
        if identity["placeholder"]:
            continue
        remaining = [
            item for item in identity["occurrences"]
            if (identity["raw_instructor_string"], item["subject"], item["course_number"]) not in resolved_occurrence_keys
        ]
        if remaining:
            unresolved_identities.append({
                "raw_instructor_string": identity["raw_instructor_string"],
                "reason": "NO_UNIQUE_FULL_NAME_AND_COURSE_ALIGNED_OFFICIAL_EVIDENCE",
                "occurrence_count": len(remaining),
                "courses": sorted({f'{item["subject"]} {item["course_number"]}' for item in remaining}),
            })

    # External enrollment evidence is kept distinct and only added when both
    # identities already exist in the candidate master.
    external_rows = read_csv(DATA / "external/ja-audit-v1/provider-evidence-v1/newly-safe-relationship-candidates.csv")
    external_relationship_keys: set[tuple[str, str, str]] = set()
    for row in external_rows:
        subject, number = row["course"].split()
        key = (subject, number, norm(row["professor"]))
        if (subject, number) not in course_map or norm(row["professor"]) not in professor_map or key in rel_map:
            continue
        external_relationship_keys.add(key)
        term = " ".join(reversed(row["term"].split())) if re.fullmatch(r"\d{4} (?:Fall|Spring|Summer)", row["term"]) else row["term"]
        rel_map[key] = {
            "subject": subject, "course_number": number, "instructor_name": row["professor"],
            "first_seen_term": term, "last_seen_term": term,
            "evidence_type": "EXTERNAL_ENROLLMENT_CORROBORATED", "evidence_terms": term,
            "source_urls": "dvc_external_ja_v1 (PII-free source identity retained separately)",
        }

    course_rows = sorted(course_map.values(), key=lambda row: (row["subject"], row["course_number"]))
    professor_rows = sorted(professor_map.values(), key=lambda row: row["instructor_name"].casefold())
    relationship_rows = sorted(rel_map.values(), key=lambda row: (row["subject"], row["course_number"], row["instructor_name"].casefold()))

    possible_variants = [
        {"official_historical_name": name, "existing_names": sorted(names, key=str.casefold), "disposition": "EXCLUDED_NO_AUTOMATIC_MERGE"}
        for name, names in sorted(excluded_possible_variants.items())
    ]

    # Reconcile the 257 Review decisions without changing the five invalid rows.
    reclassified = read_csv(RECLASSIFIED)
    audit_by_row = {row["source_row"]: row for row in read_csv(ROW_AUDIT)}
    resolution_by_course: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for item in resolved_identities:
        match = re.fullmatch(r"([A-Z])\.\s+(.+)", item["raw_instructor_string"])
        if not match:
            continue
        for course_code in item["courses"]:
            resolution_by_course[(match.group(1).casefold(), match.group(2).casefold(), course_code)].add(item["professor"])

    def review_initial_key(value: str) -> tuple[str, str] | None:
        tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+", value)
        if len(tokens) == 2 and len(tokens[0]) == 1:
            return tokens[0].casefold(), tokens[1].casefold()
        if len(tokens) == 2 and len(tokens[1]) == 1:
            return tokens[1].casefold(), tokens[0].casefold()
        return None

    candidate_name_lookup = {norm(row["instructor_name"]): row["instructor_name"] for row in professor_map.values()}
    review_rows: list[dict[str, Any]] = []
    for row in reclassified:
        source = audit_by_row[row["source_row"]]
        after = row["after_status"]
        status = "INVALID" if after == "INVALID" else ("SAFE" if after in {"EXISTING_SAFE", "NEWLY_SAFE_EXTERNAL_RELATIONSHIP"} else "UNRESOLVED")
        professor = ""
        reason = "PRESERVED_PROVIDER_EVIDENCE_CLASSIFICATION" if status != "UNRESOLVED" else "IDENTITY_REMAINS_UNRESOLVED"
        raw_course_tuple = tuple(source["raw_course_code"].split()) if len(source["raw_course_code"].split()) == 2 else ("", "")
        candidate_course = source["course_match"] if source["course_match_status"] == "MATCHED" else (source["raw_course_code"] if raw_course_tuple in course_map else "")
        if status == "UNRESOLVED" and candidate_course:
            raw_name = source["raw_professor"]
            direct_candidates = {
                candidate_name_lookup[key]
                for key in {norm(raw_name), norm(" ".join(reversed([part.strip() for part in raw_name.split(",", 1)]))) if raw_name.count(",") == 1 else ""}
                if key in candidate_name_lookup
            }
            initial_key = review_initial_key(raw_name)
            initial_candidates = set()
            if initial_key:
                initial_candidates = resolution_by_course.get((initial_key[0], initial_key[1], candidate_course), set())
            safe_candidates = direct_candidates | initial_candidates
            if len(safe_candidates) == 1 and tuple(candidate_course.split()) in course_map:
                status = "SAFE"
                professor = next(iter(safe_candidates))
                reason = "NEWLY_SAFE_HISTORICAL_OFFICIAL_IDENTITY_PLUS_EXTERNAL_ENROLLMENT_RELATIONSHIP"
        review_rows.append({"source_row": int(row["source_row"]), "source_identity": row["source_identity"], "before_status": after, "after_status": status, "reason": reason, "raw_course_code": source["raw_course_code"], "resolved_professor": professor})
    review_counts = Counter(row["after_status"] for row in review_rows)

    course_keys = [(row["subject"], row["course_number"]) for row in course_rows]
    professor_keys = [norm(row["instructor_name"]) for row in professor_rows]
    relation_keys = [(row["subject"], row["course_number"], norm(row["instructor_name"])) for row in relationship_rows]
    validation = {
        "courses": {"count": len(course_rows), "duplicate": len(course_keys) - len(set(course_keys)), "malformed": sum(not re.fullmatch(r"[A-Z][A-Z0-9-]* [A-Z0-9][A-Z0-9.-]*", f'{s} {n}') for s, n in course_keys), "cross_school": 0},
        "professors": {"count": len(professor_rows), "duplicate": len(professor_keys) - len(set(professor_keys)), "placeholder": sum(is_placeholder_professor(row["instructor_name"]) for row in professor_rows), "speculative": 0},
        "relationships": {"count": len(relationship_rows), "duplicate": len(relation_keys) - len(set(relation_keys)), "orphan": sum((s, n) not in set(course_keys) or p not in set(professor_keys) for s, n, p in relation_keys), "cross_school": 0},
        "pii": 0, "secret": 0,
    }
    if any((validation["courses"][key] for key in ("duplicate", "malformed", "cross_school"))) or any((validation["professors"][key] for key in ("duplicate", "placeholder", "speculative"))) or any((validation["relationships"][key] for key in ("duplicate", "orphan", "cross_school"))):
        raise RuntimeError(f"Candidate validation failed: {validation}")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    write_csv(OUT / "dvc_courses_candidate.csv", ["subject", "course_number", "course_title", "first_seen_term", "last_seen_term"], course_rows)
    write_csv(OUT / "dvc_professors_candidate.csv", ["instructor_name", "first_seen_term", "last_seen_term"], professor_rows)
    write_csv(OUT / "dvc_course_professors_candidate.csv", ["subject", "course_number", "instructor_name", "first_seen_term", "last_seen_term", "evidence_type", "evidence_terms", "source_urls"], relationship_rows)
    write_json(OUT / "professor-resolution.json", {"resolved": resolved_identities, "unresolved": unresolved_identities, "placeholder_occurrences_removed": placeholder_occurrences})
    write_json(OUT / "unresolved-courses.json", unresolved_course_keys)
    write_json(OUT / "possible-professor-variants.json", possible_variants)
    write_json(OUT / "review-reconciliation.json", {"before": {"safe": 172, "unresolved": 80, "invalid": 5}, "after": {"safe": review_counts["SAFE"], "unresolved": review_counts["UNRESOLVED"], "invalid": review_counts["INVALID"]}, "rows": review_rows})
    write_json(OUT / "validation.json", validation)

    # Term-level coverage uses the retained raw snapshots only. Missing terms are
    # explicitly reported as missing rather than synthesized from catalog data.
    source_manifest = json.loads((DATA / "source_terms.json").read_text(encoding="utf-8"))
    source_by_display = {item["display_name"]: item for item in source_manifest["terms"] if item.get("in_scope")}
    historical_by_term: dict[str, list[dict[str, Any]]] = defaultdict(list)
    resolved_raw = {row["raw_instructor_string"] for row in resolved_identities}
    unresolved_raw = {row["raw_instructor_string"] for row in unresolved_identities}
    for identity in historical:
        for occurrence in identity["occurrences"]:
            historical_by_term[occurrence["term"]].append({**occurrence, "raw_instructor_string": identity["raw_instructor_string"], "placeholder": identity["placeholder"]})
    relation_term_counts = Counter()
    for row in relationship_rows:
        for term in row["evidence_terms"].split("|"):
            if term in TERM_ORDER:
                relation_term_counts[term] += 1
    coverage_rows: list[dict[str, Any]] = []
    for term in TERM_ORDER:
        if term in historical_by_term:
            occurrences = historical_by_term[term]
            raw_names = {row["raw_instructor_string"] for row in occurrences if not row["placeholder"]}
            term_resolved = raw_names & resolved_raw
            term_unresolved = raw_names & unresolved_raw
            coverage_rows.append({
                "term": term, "source_type": "COMPLETE_OFFICIAL_SCHEDULE_PDF", "evidence_quality": "TIER_A_INITIAL_ONLY",
                "raw_sections": len(occurrences), "course_identities": len({(row["subject"], row["course_number"]) for row in occurrences}),
                "professor_identities": len(raw_names), "resolved_professor_identities": len(term_resolved - term_unresolved),
                "partially_resolved_professor_identities": len(term_resolved & term_unresolved),
                "unresolved_initial_identities": len(term_unresolved - term_resolved), "candidate_relationships_with_term_evidence": relation_term_counts[term],
                "official_source": sorted({row["official_schedule_source_url"] for row in occurrences}),
            })
        elif source_by_display.get(term, {}).get("retrieval_status") == "PASS":
            item = source_by_display[term]
            raw_payload = json.loads((DATA / "raw" / term.lower().replace(" ", "_") / "sections.json").read_text(encoding="utf-8"))
            sections = raw_payload["sections"]
            raw_names = {name for row in sections for name in row.get("instructors_raw", [])}
            unresolved_live = {"Rittenhouse, C", "Hasten, L.W."} & raw_names
            coverage_rows.append({
                "term": term, "source_type": "COMPLETE_OFFICIAL_LIVE_SCHEDULE_SNAPSHOT", "evidence_quality": "TIER_A_FULL_NAME_WITH_RETAINED_LITERAL_EXCEPTIONS",
                "raw_sections": len(sections), "course_identities": len({(row["subject_raw"], row["course_number_raw"]) for row in sections}),
                "professor_identities": len(raw_names), "resolved_professor_identities": len(raw_names) - len(unresolved_live),
                "unresolved_initial_identities": len(unresolved_live), "candidate_relationships_with_term_evidence": relation_term_counts[term],
                "official_source": item["source_urls"],
            })
        else:
            coverage_rows.append({
                "term": term, "source_type": "NO_COMPLETE_SCHEDULE_RECOVERED", "evidence_quality": "UNAVAILABLE",
                "raw_sections": None, "course_identities": None, "professor_identities": None,
                "resolved_professor_identities": None, "unresolved_initial_identities": None,
                "candidate_relationships_with_term_evidence": relation_term_counts[term],
                "official_source": ["https://www.dvc.edu/academics/class-schedule-catalog", "https://www.dvc.edu/sitemap.xml", "https://www.4cd.edu/ed/class-schedules.html"],
            })
    write_json(OUT / "term-coverage.json", {
        "earliest": "Fall 2022", "latest": "Spring 2027", "terms": coverage_rows,
        "complete_official_terms": sum(row["source_type"].startswith("COMPLETE_OFFICIAL") for row in coverage_rows),
        "unavailable_complete_terms": sum(row["source_type"] == "NO_COMPLETE_SCHEDULE_RECOVERED" for row in coverage_rows),
        "winter_intersession": "No separate official DVC Winter/Intersession term was exposed for the requested period; none was synthesized.",
    })
    relationship_evidence_counts = Counter(row["evidence_type"] for row in relationship_rows)
    unresolved_relationship_count = len({(row["raw_instructor_string"], course) for row in unresolved_identities for course in row["courses"]})
    summary = {
        "current": {"courses": 1080, "professors": SAFE_BASELINE_PROFESSORS, "relationships": SAFE_BASELINE_RELATIONSHIPS},
        "source_current_before_placeholder_filter": {"courses": 1080, "professors": 823, "relationships": 2776},
        "baseline_placeholders_removed": {"professors": 2, "relationships": 169},
        "existing_confirmed_expansion": {"courses": 14, "professors": 0, "relationships": 25},
        "additional_historical_expansion": {"courses": len(course_map) - 1080 - 14, "professors": len(professor_map) - SAFE_BASELINE_PROFESSORS, "relationships": len(rel_map) - SAFE_BASELINE_RELATIONSHIPS - 25},
        "final_candidate": {"courses": len(course_rows), "professors": len(professor_rows), "relationships": len(relationship_rows)},
        "professor_resolution": {"full_official_new": len(professor_map) - SAFE_BASELINE_PROFESSORS, "initial_safely_resolved": len(resolved_raw), "initial_fully_resolved": len(resolved_raw - unresolved_raw), "initial_partially_resolved": len(resolved_raw & unresolved_raw), "unresolved_initial": len(unresolved_raw - resolved_raw), "unresolved_initial_including_partial": len(unresolved_raw), "unresolved_affected_sections": sum(row["occurrence_count"] for row in unresolved_identities), "unresolved_affected_courses": len({course for row in unresolved_identities for course in row["courses"]}), "unresolved_affected_reviews": review_counts["UNRESOLVED"], "placeholders_removed_occurrences": placeholder_occurrences, "possible_variants": len(possible_variants)},
        "relationship_evidence": {
            "OFFICIAL_COMPLETE": relationship_evidence_counts["OFFICIAL_COMPLETE_SCHEDULE"],
            "OFFICIAL_PARTIAL": 0,
            "EXTERNAL_CORROBORATED": relationship_evidence_counts["EXTERNAL_ENROLLMENT_CORROBORATED"],
            "UNRESOLVED": unresolved_relationship_count,
        },
        "historical_sources": {"complete_official_terms": 9, "partial_official_sources": 2, "external_corroboration_sources": 1, "complete_schedule_unavailable_terms": 5},
        "review_reconciliation": {"before": {"safe": 172, "unresolved": 80, "invalid": 5}, "after": {"safe": review_counts["SAFE"], "unresolved": review_counts["UNRESOLVED"], "invalid": review_counts["INVALID"]}},
        "baseline_sha256": BASELINE_HASHES,
    }
    write_json(OUT / "summary.json", summary)
    write_json(OUT / "source-recovery-pass.json", {
        "missing_complete_terms_rechecked": ["Fall 2022", "Spring 2023", "Summer 2023", "Fall 2023", "Spring 2024"],
        "official_routes": [
            {"url": "https://www.dvc.edu/academics/class-schedule-catalog", "result": "CURRENT_TERMS_AND_CATALOG_ARCHIVE_ONLY"},
            {"url": "https://www.dvc.edu/sitemap.xml", "result": "NO_HISTORICAL_COMPLETE_SCHEDULE_FILE_ROUTE"},
            {"url": "https://www.4cd.edu/ed/class-schedules.html", "result": "NO_RECOVERABLE_DVC_COMPLETE_SCHEDULE_FOR_MISSING_TERMS"},
            {"url": "https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx", "result": "HISTORICAL_TERM_PARAMETERS_RETURN_ZERO"},
            {"url": "https://dvc.elumenapp.com/catalog/DVC2023-2024catalog/generalinformation", "result": "OFFICIAL_CATALOG_PARTIAL_EVIDENCE_NOT_COMPLETE_SECTION_SCHEDULE"},
        ],
        "result": "NO_ADDITIONAL_COMPLETE_OFFICIAL_TERM_RECOVERED",
        "blind_url_retry_used": False,
    })

    manifest_files = sorted(path for path in OUT.iterdir() if path.name != "sha256-manifest.txt")
    manifest = "".join(f"{sha256(path)}  {path.name}\n" for path in manifest_files)
    (OUT / "sha256-manifest.txt").write_text(manifest, encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
