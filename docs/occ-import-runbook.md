# OCC Import Runbook

Status: all three CSV files were found, validated, copied, and imported twice into local Supabase on 2026-08-30. Local idempotency and acceptance passed. This runbook does not authorize production import.

Source and repository inclusion notes are recorded in `data/occ/README.md`. The committed dataset is approximately 390 KB and contains only the processed factual fields required by the importer; raw HTML, meeting/location data, contact details, credentials, and source-site assets are excluded.

## Pre-import gate

Validated repository files:

- `data/occ/processed/occ_courses.csv`
- `data/occ/processed/occ_professors.csv`
- `data/occ/processed/occ_course_professors.csv`

The gate must confirm:

- Courses: 1,730
- Professors: 988
- Relationships: 3,895
- Placeholder professors: 0
- Duplicate school-scoped course identities: 0
- Duplicate school-scoped professor source identities: 0
- Duplicate relationship identities: 0
- Every relationship resolves to exactly one OCC course and professor

Validated SHA-256 checksums:

- Courses: `222b1f15011d6ac3c2742eafd4a41aacb2529d006cbc10dc5e41008cd5c15de0`
- Professors: `0d25ae3a211edde07e20085597feecec404aedce8158cab33c389cb148b80241`
- Relationships: `88f2292568e9db28529423e7979e52a1245a98aa249b0505e2a2270a4c0ac91a`

The files contain no stable external Professor ID. Local import therefore uses the documented school-scoped normalized identity `(OCC school_id, instructor_name)` after proving 988/988 uniqueness. It is not treated as a universal cross-school identity.

## Idempotent transaction design

The local importer is `scripts/import_occ_local.sh`. It refuses non-local targets, uses database staging tables inside a single transaction, and never exposes a service-role or database secret to frontend code.

1. Load and validate all CSV rows into temporary or private staging tables.
2. Resolve the OCC school by its stable slug/ID and verify it is inactive.
3. Upsert Courses by the proven school-scoped source identity, normally `(school_id, code)` unless the CSV provides a stronger stable source ID.
4. Upsert Professors by `(school_id, stable_source_id)` when available. Do not use a global name identity.
5. Resolve relationship rows to imported UUIDs and insert using the database uniqueness of `(school_id, professor_id, course_id)`.
6. Re-run all acceptance counts and isolation checks in the same transaction.
7. Commit only if every assertion passes. Keep OCC inactive until application-level acceptance finishes.

## Re-execution

- Course and Professor upserts update approved descriptive fields without replacing existing UUID primary keys.
- Relationship insertion uses its school-scoped unique constraint and produces no duplicate on conflict.
- Counts after a second local run must remain exactly 1,730 / 988 / 3,895.
- A second run that changes IDs, increases counts, or creates duplicates is a failure.

## Duplicate detection

Detect duplicates both in staging and after resolution. Report the conflicting source rows and stop the transaction. Do not silently choose one duplicate or append numeric suffixes.

## Partial failure

All staging validation and domain writes run in one transaction. Any parse error, unresolved relationship, count mismatch, constraint error, placeholder, duplicate, or isolation failure rolls back the whole import. Do not retry only the failed tail of a production import.

## Rollback

Before OCC is activated or receives user Reviews, imported OCC master data can be removed by OCC `school_id` in dependency order: `professor_courses`, `professors`, then `courses`. Validate that OCC Review and Vote counts are zero first.

After OCC receives user content, bulk OCC removal would delete Reviews through existing cascading foreign keys and is therefore prohibited without an approved backup restoration plan. Never delete or rewrite SMC rows during rollback.

## Activation

Set OCC `is_active = true` only after local/production OCC acceptance passes and only in an explicitly approved production stage. DVC remains inactive.
