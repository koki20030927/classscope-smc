#!/usr/bin/env python3
"""Build the revised full OCC external Review batch without changing source workbooks."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


SOURCE_ORDER = ("raku", "hayato", "takuto")
EXPECTED_IMPORTABLE = {"raku": 18, "hayato": 3, "takuto": 26}
EXPECTED_EXCLUDED = {"raku": 2, "hayato": 7, "takuto": 4}
EXPECTED_EXISTING = {"raku": 4, "hayato": 3, "takuto": 26}
SOURCE_FILES = {
    "raku": "Raku OCC 授業評価シート.xlsx",
    "hayato": "Hayato OCC Evaluation.xlsx",
    "takuto": "Takuto (Mechanical Engineering).xlsx",
}
SOURCE_TYPES = {
    "raku": "external_occ_sheet_01",
    "hayato": "external_occ_sheet_02",
    "takuto": "external_occ_sheet_03",
}
SECRET_PATTERN = re.compile(
    r"(?:sbp_[A-Za-z0-9_-]{20,}|supabase_[A-Za-z0-9_-]{20,}|"
    r"sk-[A-Za-z0-9_-]{20,}|postgres(?:ql)?://[^\s]+:[^\s@]+@)",
    re.IGNORECASE,
)


def load_prepare_module(repo_root: Path):
    module_path = repo_root / "scripts" / "prepare_occ_external_reviews.py"
    spec = importlib.util.spec_from_file_location("prepare_occ_external_reviews", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load OCC preparation module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def exclusion_reason(row: dict[str, str]) -> str:
    issues = set(filter(None, row["issues"].split(";")))
    if "invalid_required_rating" in issues:
        return "required_rating_missing_or_invalid"
    if "invalid_recommendation" in issues:
        return "recommendation_invalid"
    if "invalid_year" in issues:
        return "year_invalid"
    if "invalid_semester" in issues:
        return "semester_invalid"
    if "invalid_class_format" in issues:
        return "class_format_invalid"
    if "course_not_found" in issues and "professor_not_found" in issues:
        return "course_and_professor_not_found"
    if "course_not_found" in issues:
        return "course_not_found"
    if "professor_not_found" in issues:
        return "professor_not_found"
    if row["status"] == "ambiguous":
        return "ambiguous_match"
    if row["status"] == "invalid_relationship":
        return "invalid_professor_course_relationship"
    if row["status"] == "personal_data":
        return "personal_data"
    if row["status"] == "duplicate":
        return "duplicate"
    raise ValueError(
        f"unexpected exclusion for source row {row['source_row_number']}: "
        f"status={row['status']}, issues={row['issues']}"
    )


def semantic_key(prepare: Any, row: dict[str, str]) -> str:
    material = "|".join((
        prepare.normalize_course(row["course_code"]),
        prepare.normalize_professor(row["professor_name"]),
        row["professor_quality"],
        row["easy_a"],
        row["course_quality"],
        row["recommendation"],
        row["class_format"],
        row["year_taken"],
        row["semester"],
        hashlib.sha256(row["content"].encode("utf-8")).hexdigest(),
    ))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/occ/external/normalized/production-batch-v2-full"),
    )
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    output_dir = (repo_root / args.output_dir).resolve() if not args.output_dir.is_absolute() else args.output_dir
    prepare = load_prepare_module(repo_root)

    historical_batch = (
        repo_root
        / "data/occ/external/normalized/production-batch-v1/occ_external_reviews_production_batch_v1.csv"
    )
    existing_rows = read_csv(historical_batch)
    existing_keys = {(row["source_type"], row["source_row_key"]) for row in existing_rows}
    if len(existing_keys) != 33:
        raise ValueError("historical Production batch must contain exactly 33 unique source identities")

    candidates: list[dict[str, str]] = []
    exclusions: list[dict[str, str]] = []
    source_reports: dict[str, dict[str, Any]] = {}

    for source in SOURCE_ORDER:
        source_dir = repo_root / "data/occ/external/normalized" / source
        preview = read_csv(source_dir / "preview.csv")
        report = json.loads((source_dir / "report.json").read_text(encoding="utf-8"))
        if report["workbook_name"] != SOURCE_FILES[source]:
            raise ValueError(f"unexpected workbook for {source}")
        if report["source_type"] != SOURCE_TYPES[source]:
            raise ValueError(f"unexpected source_type for {source}")

        source_candidates = [row for row in preview if row["status"] == "matched"]
        source_exclusions = [row for row in preview if row["status"] != "matched"]
        if len(source_candidates) != EXPECTED_IMPORTABLE[source]:
            raise ValueError(f"recounted importable count changed for {source}")
        if len(source_exclusions) != EXPECTED_EXCLUDED[source]:
            raise ValueError(f"recounted exclusion count changed for {source}")

        existing_count = 0
        for row in source_candidates:
            identity = (row["source_type"], row["source_row_key"])
            existing_count += identity in existing_keys
            if prepare.contains_personal_data([row["content"]]):
                raise ValueError(f"PII detected in candidate {source} row {row['source_row_number']}")
            if SECRET_PATTERN.search("\n".join(row.values())):
                raise ValueError(f"secret detected in candidate {source} row {row['source_row_number']}")
            candidates.append(row)

        if existing_count != EXPECTED_EXISTING[source]:
            raise ValueError(f"historical Production identity mismatch for {source}")

        for row in source_exclusions:
            exclusions.append({
                "source_type": SOURCE_TYPES[source],
                "source_row_number": row["source_row_number"],
                "source_row_key": row["source_row_key"],
                "status": row["status"],
                "reason": exclusion_reason(row),
                "issues": row["issues"],
            })

        source_reports[source] = {
            "workbook_name": report["workbook_name"],
            "input_sha256": report["input_sha256"],
            "selected_sheet": report["selected_sheet"],
            "raw_rows": report["raw_rows"],
            "completely_empty_rows": report["completely_empty_rows"],
            "valid_rows": report["valid_rows"],
            "professor_matched": report["professor_matched"],
            "course_matched": report["course_matched"],
            "relationship_matched": report["relationship_matched"],
            "importable": len(source_candidates),
            "already_production": existing_count,
            "new_candidates": len(source_candidates) - existing_count,
            "excluded": len(source_exclusions),
        }

    candidates.sort(key=lambda row: (row["source_type"], int(row["source_row_number"])))
    exclusions.sort(key=lambda row: (row["source_type"], int(row["source_row_number"])))
    if len(candidates) != 47 or len(exclusions) != 13:
        raise ValueError("full batch totals changed")

    identities = [(row["source_type"], row["source_row_key"]) for row in candidates]
    if len(identities) != len(set(identities)):
        raise ValueError("duplicate source identity in full batch")
    semantic_keys = [semantic_key(prepare, row) for row in candidates]
    semantic_duplicates = [key for key, count in Counter(semantic_keys).items() if count > 1]
    if semantic_duplicates:
        raise ValueError("cross-workbook exact duplicate detected in full batch")
    if not existing_keys.issubset(set(identities)):
        raise ValueError("a historical Production source identity is missing from the full batch")

    output_dir.mkdir(parents=True, exist_ok=True)
    candidate_path = output_dir / "occ_external_reviews_full_batch_v2.csv"
    with candidate_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=prepare.OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(candidates)

    exclusion_path = output_dir / "excluded_reason_report.json"
    exclusion_report = {
        "batch": "occ_external_reviews_full_batch_v2",
        "excluded_total": len(exclusions),
        "reason_counts": dict(sorted(Counter(row["reason"] for row in exclusions).items())),
        "missing_comment": 0,
        "rows": exclusions,
    }
    exclusion_path.write_text(json.dumps(exclusion_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report_path = output_dir / "batch_report.json"
    batch_report = {
        "batch": "occ_external_reviews_full_batch_v2",
        "target_school": "occ",
        "source_reports": source_reports,
        "raw_total": sum(report["raw_rows"] for report in source_reports.values()),
        "importable_total": len(candidates),
        "already_production": len(existing_keys),
        "new_candidates": len(candidates) - len(existing_keys),
        "expected_final_occ_reviews": len(candidates),
        "excluded_total": len(exclusions),
        "duplicate": 0,
        "ambiguous": 0,
        "invalid_relationship": 0,
        "pii_import": 0,
        "secret_import": 0,
        "cross_school_candidate": 0,
    }
    report_path.write_text(json.dumps(batch_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_path = output_dir / "SHA256SUMS"
    manifest_paths = (candidate_path, exclusion_path, report_path)
    manifest_path.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in manifest_paths),
        encoding="utf-8",
    )
    print(json.dumps({
        **batch_report,
        "candidate_sha256": sha256(candidate_path),
        "manifest_sha256": sha256(manifest_path),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
