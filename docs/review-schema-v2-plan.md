# Review Schema v2 Migration Plan

Status: Production database migration completed and preservation validated. Review v2 frontend deployment and external Review import remain separately gated.

## Current production baseline

- Review rows: 1 total (SMC 1, OCC 0).
- Review Vote rows: 0.
- Existing Review columns are `rating`, `difficulty`, `homework_amount`, `support_quality`, `attendance_required`, and `content`, plus ownership, relation, counters, and timestamps.
- Reviews are school-scoped by composite Professor/Course foreign keys.
- Authenticated users may select Reviews, insert only their own Reviews, and delete their own Reviews; admins may delete any Review. Review UPDATE is not granted or covered by an RLS policy.

## Compatibility strategy

`review_schema_version` explicitly separates legacy and current payloads:

- Version 1 keeps the existing rating fields unchanged. No legacy value is converted or inferred.
- Version 2 stores `professor_quality`, `easy_a`, `course_quality`, `recommendation`, `class_format`, `year_taken`, `semester`, and `content`.
- Legacy columns remain present and become nullable. Their defaults stay in place for the database-first compatibility window; v2 writers explicitly send null so a v2 Review does not contain fabricated legacy scores.
- Existing rows receive version 1 through the column default and retain their IDs, relations, values, counters, and timestamps.
- The database-first deployment window remains compatible with the old frontend because it explicitly supplies all legacy fields. After any v2 row exists, rolling the frontend back to code that assumes non-null legacy ratings is unsafe.

## Phases

### Phase A — Add v2 columns

Add the schema version, four rating columns, class format, year, semester, and import metadata without dropping existing columns.

### Phase B — Constraints

- Ratings are nullable but, when present, must be integers from 1 through 5.
- Class format is `in_person`, `online`, or `hybrid`.
- Semester is `fall`, `spring`, `summer`, or `winter`.
- Year is 2000 through 2100.
- Version 1 requires the complete legacy payload and no v2 payload.
- Version 2 requires the v2 payload and no legacy ratings. Recommendation may be null only on an imported Review because some source sheets may genuinely omit it.
- Comment remains required for user-authored v2 Reviews. A controlled imported v2 Review may preserve a missing source comment as `NULL`; no placeholder comment is generated.

### Phase C — Frontend

The Review form writes only version 2 fields. Review List branches by version and never renders null as zero. Professor Stats aggregates only semantically equivalent v2 fields and presents legacy recommendation separately.

### Phase D — Legacy compatibility

The existing SMC Review remains version 1 and continues to display its original rating, difficulty, homework, support, attendance, content, Vote counters, and relations.

### Phase E — External import structure

Imported Reviews use `user_id = NULL`, `is_imported = true`, a non-personal `source_type`, a stable `source_row_key`, and `imported_at`. A partial unique index prevents reimport duplicates. Normal authenticated users cannot set `is_imported = true`; only the controlled backend import path may create imported rows.

### Phase F — Local regression

Validate migration preservation, v1 and v2 inserts, Vote behavior, owner/admin deletion, Review UPDATE denial, import dedupe, cross-school rejection, SMC/OCC isolation, TypeScript, lint, build, and browser behavior.

### Phase G — Production gate

The database migration gate passed: local tests, workbook inspection, mappings, the fixed 33-row preview, fresh backup/restore drill, Production migration, preservation checks, and old-frontend regression all passed. The frontend deployment and external Review import remain separate approval stages; no external Review may be imported before the deployed v2 frontend passes Production regression.

## RLS and grants

- Review SELECT and DELETE behavior remains unchanged.
- The normal Review INSERT policy additionally requires `is_imported = false`.
- No client role receives a new table or function privilege.
- Review UPDATE remains unavailable.
- Review Votes are unchanged and may reference either legacy or imported Reviews.

## Rollback

Before any version 2 row exists, rollback can remove the new policy/index/constraints/columns and restore the legacy NOT NULL/default properties. Never attempt that rollback while a v2 row exists.

After v2 rows exist, rollback is application-forward: fix or redeploy a v2-capable frontend. Do not coerce v2 values into legacy fields and do not drop the v2 columns. External imported rows can be removed by their OCC school and source keys only while a separately approved rollback confirms dependent Votes and user content impact.
