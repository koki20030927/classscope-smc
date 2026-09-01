# OCC External Review Import Runbook

Status: the original 33-row Production batch remains immutable. Under the revised rule, comment presence is not an import gate; the three source workbooks are recounted into a separate full batch. Production import of any additional rows remains separately gated.

## Ownership model

External evaluations are not attributed to a ClassScope account. Imported rows use `user_id = NULL`, `is_imported = true`, `review_schema_version = 2`, a non-personal `source_type`, stable `source_row_key`, and `imported_at`. Normal authenticated users cannot create imported rows. Admin deletion and Review Votes remain available through existing authorization.

## Source handling

1. Download each Google Sheet as `.xlsx` without editing it.
2. Keep raw files outside Git or under the ignored `data/occ/external/raw/` directory.
3. For Raku, select the first sheet only using `sheet_selection: first_sheet`. Every later sheet is outside mapping, validation, duplicate comparison, and import scope; retain the original workbook unchanged.
4. For Hayato and Takuto, inspect the real workbook and explicitly choose the relevant sheet using `sheet_selection: named_sheet`. Takuto has no recommendation column, so its recommendation is preserved as `NULL`; never infer it from comment text.
5. Do not map email, phone, student ID, address, account identifiers, or private-note columns.

## Pipeline

1. `prepare_occ_external_reviews.py` reads only mapped columns.
2. It normalizes ratings, term, class format, course code, and Professor name.
3. It matches against the committed 1,730 OCC Courses, 988 Professors, and 3,895 relationships.
4. Every non-empty row is classified as `matched`, `ambiguous`, `not_found`, `invalid_relationship`, `duplicate`, `invalid`, or `personal_data`. Completely empty rows are counted separately.
5. Only `matched` rows enter `import_candidates.csv`.
6. `import_occ_external_reviews_local.sh` refuses non-Local targets, revalidates the candidates in one transaction, resolves existing OCC IDs, and inserts without creating master data.
7. A missing comment remains visible in the audit count but does not change `matched` status. The CSV empty value is restored as SQL `NULL`.

## Required preview report

Report total rows, completely empty rows, Professor/Course/relationship matches, ambiguous, not found, duplicates, invalid ratings/fields, missing recommendation, missing comment, personal-data exclusions, invalid relationships, existing Production identities, and new candidate rows. Row-level `issues` remain in the private preview, but do not paste source comments or identifiers into the final report. `missing_comment` must remain zero in the exclusion reason report.

For Raku, the final report is limited to workbook name, selected sheet (first sheet), excluded sheet count, first-sheet raw rows, valid rows, matched, ambiguous, not found, invalid relationship, duplicate, missing recommendation, missing comment, PII excluded, and final import candidates. No metric from later sheets may enter these totals.

## Idempotency

The partial unique index on `(school_id, source_type, source_row_key)` for imported rows prevents duplicate insertion. Re-running an identical candidate file must insert zero rows and report every candidate as skipped.

## Production batch v1 (historical)

`build_occ_external_review_batch.py` fixes the approved candidate set at Raku 4, Hayato 3, and Takuto 26. It refuses count drift, unexpected exclusion reasons, PII/secrets, duplicate keys, semantic duplicates, ambiguous master matches, or invalid OCC relationships. It writes a unified candidate CSV, an exclusion reason report, a batch report, and a SHA-256 manifest under the ignored normalized workspace.

The original exclusion report is retained as history and batch v1 is never rewritten. Its former comment-based exclusions are revalidated in the separate full batch rather than being added to batch v1.

## Full batch v2

`build_occ_external_review_full_batch.py` uses the freshly generated previews and the historical v1 source identities. It requires all 33 existing identities to remain present, classifies them as already in Production, and writes the complete idempotent candidate set separately under `production-batch-v2-full/`.

The revised recount is Raku 18, Hayato 3, and Takuto 26 importable Reviews: 47 total. Existing Production identities are 4, 3, and 26 respectively, leaving 14 new Raku candidates. Thirteen rows remain excluded only for unresolved OCC master data or an invalid required rating. Comment absence and Takuto recommendation absence are not exclusion reasons.

## Production gate

Production requires all of the following: actual workbook inspection, approved mappings, zero unresolved rows inside the candidate set, a successful Local double-import, nullable-comment migration approval, UI/RLS/isolation regression, fresh Production backup and fingerprints, and explicit approval. Production migration and import must use separately reviewed controlled paths; the Local-only importer must never be redirected to Production.
