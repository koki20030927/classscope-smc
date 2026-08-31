#!/usr/bin/env python3
"""Build and validate the fixed OCC external Review production candidate batch."""

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


EXPECTED_CANDIDATES = {"raku": 4, "hayato": 3, "takuto": 26}
EXPECTED_EXCLUSIONS = {"raku": 16, "hayato": 7, "takuto": 4}
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


def exclusion_reason(source: str, row: dict[str, str]) -> str:
    status = row["status"]
    issues = set(filter(None, row["issues"].split(";")))
    if source == "raku" and status == "invalid" and issues == {"missing_comment"}:
        return "missing_required_comment"
    if source in {"hayato", "takuto"} and status == "not_found":
        return "occ_master_not_found"
    if source == "takuto" and status == "invalid" and "invalid_rating" in issues:
        return "missing_required_rating"
    raise ValueError(
        f"unexpected exclusion classification for {source} row {row['source_row_number']}: "
        f"status={status}, issues={row['issues']}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/occ/external/normalized/production-batch-v1"),
    )
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    output_dir = (repo_root / args.output_dir).resolve() if not args.output_dir.is_absolute() else args.output_dir
    prepare = load_prepare_module(repo_root)
    course_index, professor_index, relationship_index = prepare.build_master_indexes(repo_root)

    candidates: list[dict[str, str]] = []
    exclusions: list[dict[str, str]] = []
    source_reports: dict[str, dict[str, Any]] = {}

    for source in ("raku", "hayato", "takuto"):
        source_dir = repo_root / "data" / "occ" / "external" / "normalized" / source
        preview = read_csv(source_dir / "preview.csv")
        report = json.loads((source_dir / "report.json").read_text(encoding="utf-8"))
        if report["workbook_name"] != SOURCE_FILES[source]:
            raise ValueError(f"unexpected workbook for {source}")
        if report["source_type"] != SOURCE_TYPES[source]:
            raise ValueError(f"unexpected source_type for {source}")

        source_candidates = [row for row in preview if row["status"] == "matched"]
        source_exclusions = [row for row in preview if row["status"] != "matched"]
        if len(source_candidates) != EXPECTED_CANDIDATES[source]:
            raise ValueError(f"candidate count changed for {source}")
        if len(source_exclusions) != EXPECTED_EXCLUSIONS[source]:
            raise ValueError(f"exclusion count changed for {source}")

        for row in source_candidates:
            if row["source_type"] != SOURCE_TYPES[source]:
                raise ValueError(f"candidate source_type changed for {source}")
            if prepare.contains_personal_data([row["content"]]):
                raise ValueError(f"PII detected in candidate {source} row {row['source_row_number']}")
            if SECRET_PATTERN.search("\n".join(row.values())):
                raise ValueError(f"secret detected in candidate {source} row {row['source_row_number']}")

            course_matches = course_index.get(prepare.normalize_course(row["course_code"]), set())
            professor_matches: set[str] = set()
            for variant in prepare.professor_variants(row["professor_name"]):
                professor_matches.update(professor_index.get(variant, set()))
            if len(course_matches) != 1 or len(professor_matches) != 1:
                raise ValueError(f"candidate no longer resolves uniquely: {source} row {row['source_row_number']}")
            course = next(iter(course_matches))
            professor = next(iter(professor_matches))
            if (
                prepare.normalize_course(course),
                prepare.normalize_professor(professor),
            ) not in relationship_index:
                raise ValueError(f"candidate relationship changed: {source} row {row['source_row_number']}")
            candidates.append(row)

        for row in source_exclusions:
            exclusions.append({
                "source_type": SOURCE_TYPES[source],
                "source_row_number": row["source_row_number"],
                "source_row_key": row["source_row_key"],
                "status": row["status"],
                "reason": exclusion_reason(source, row),
            })

        source_reports[source] = {
            "workbook_name": report["workbook_name"],
            "input_sha256": report["input_sha256"],
            "selected_sheet": report["selected_sheet"],
            "raw_rows": report["raw_rows"],
            "candidates": len(source_candidates),
            "excluded": len(source_exclusions),
        }

    candidates.sort(key=lambda row: (row["source_type"], int(row["source_row_number"])))
    exclusions.sort(key=lambda row: (row["source_type"], int(row["source_row_number"])))
    if len(candidates) != 33 or len(exclusions) != 27:
        raise ValueError("fixed batch totals changed")

    source_keys = [row["source_row_key"] for row in candidates]
    if len(source_keys) != len(set(source_keys)):
        raise ValueError("duplicate source_row_key in fixed batch")
    semantic_keys = []
    for row in candidates:
        material = "|".join((
            prepare.normalize_course(row["course_code"]),
            prepare.normalize_professor(row["professor_name"]),
            row["year_taken"],
            row["semester"],
            hashlib.sha256(row["content"].encode("utf-8")).hexdigest(),
        ))
        semantic_keys.append(hashlib.sha256(material.encode("utf-8")).hexdigest())
    if len(semantic_keys) != len(set(semantic_keys)):
        raise ValueError("cross-workbook semantic duplicate in fixed batch")

    output_dir.mkdir(parents=True, exist_ok=True)
    candidate_path = output_dir / "occ_external_reviews_production_batch_v1.csv"
    with candidate_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=prepare.OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(candidates)

    exclusion_path = output_dir / "excluded_reason_report.json"
    exclusion_report = {
        "batch": "occ_external_reviews_production_batch_v1",
        "excluded_total": len(exclusions),
        "reason_counts": dict(sorted(Counter(row["reason"] for row in exclusions).items())),
        "rows": exclusions,
    }
    exclusion_path.write_text(json.dumps(exclusion_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report_path = output_dir / "batch_report.json"
    batch_report = {
        "batch": "occ_external_reviews_production_batch_v1",
        "target_school": "occ",
        "source_reports": source_reports,
        "candidate_total": len(candidates),
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
