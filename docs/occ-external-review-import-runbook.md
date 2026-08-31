# OCC External Review Import Runbook

Status: source workbooks and the fixed 33-row batch have passed Local validation. Review Schema v2 is deployed to the Production database, but the external Review Production import is not yet authorized.

## Ownership model

External evaluations are not attributed to a ClassScope account. Imported rows use `user_id = NULL`, `is_imported = true`, `review_schema_version = 2`, a non-personal `source_type`, stable `source_row_key`, and `imported_at`. Normal authenticated users cannot create imported rows. Admin deletion and Review Votes remain available through existing authorization.

## Source handling

1. Download each Google Sheet as `.xlsx` without editing it.
2. Keep raw files outside Git or under the ignored `data/occ/external/raw/` directory.
3. For Raku, select the first sheet only using `sheet_selection: first_sheet`. Every later sheet is outside mapping, validation, duplicate comparison, and import scope; retain the original workbook unchanged.
4. For Hayato and Takuto, inspect the real workbook and explicitly choose the relevant sheet using `sheet_selection: named_sheet`. Do not infer Takuto's missing recommendation or any other missing value.
5. Do not map email, phone, student ID, address, account identifiers, or private-note columns.

## Pipeline

1. `prepare_occ_external_reviews.py` reads only mapped columns.
2. It normalizes ratings, term, class format, course code, and Professor name.
3. It matches against the committed 1,730 OCC Courses, 988 Professors, and 3,895 relationships.
4. Every row is classified as `matched`, `ambiguous`, `not_found`, `invalid_relationship`, `duplicate`, `invalid`, or `personal_data`.
5. Only `matched` rows enter `import_candidates.csv`.
6. `import_occ_external_reviews_local.sh` refuses non-Local targets, revalidates the candidates in one transaction, resolves existing OCC IDs, and inserts without creating master data.

## Required preview report

Report total rows, matched, ambiguous, not found, duplicates, invalid ratings/fields, missing recommendation, missing comment, personal-data exclusions, invalid relationships, and candidate rows. Row-level `issues` remain in the private preview, but do not paste source comments or identifiers into the final report.

For Raku, the final report is limited to workbook name, selected sheet (first sheet), excluded sheet count, first-sheet raw rows, valid rows, matched, ambiguous, not found, invalid relationship, duplicate, missing recommendation, missing comment, PII excluded, and final import candidates. No metric from later sheets may enter these totals.

## Idempotency

The partial unique index on `(school_id, source_type, source_row_key)` for imported rows prevents duplicate insertion. Re-running an identical candidate file must insert zero rows and report every candidate as skipped.

## Production batch v1

`build_occ_external_review_batch.py` fixes the approved candidate set at Raku 4, Hayato 3, and Takuto 26. It refuses count drift, unexpected exclusion reasons, PII/secrets, duplicate keys, semantic duplicates, ambiguous master matches, or invalid OCC relationships. It writes a unified candidate CSV, an exclusion reason report, a batch report, and a SHA-256 manifest under the ignored normalized workspace.

The 27 exclusions are retained for future revalidation: 16 missing required comments, 10 OCC master not found, and 1 missing required rating. A corrected workbook must be processed as a separately reviewed batch; batch v1 is never silently expanded.

## Production gate

Production requires all of the following: actual workbook inspection, approved mappings, zero unresolved import candidates, a successful Local double-import, UI/RLS/isolation regression, fresh Production backup and fingerprints, and explicit approval. Production import must use a separately reviewed controlled backend path; the Local-only script must never be redirected to Production.
