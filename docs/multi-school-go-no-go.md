# Multi-School Production Go/No-Go

Date: 2026-08-30

## Decision

- Local Multi-School architecture: **GO**
- Local OCC import and acceptance: **GO**
- Production recovery system: **GO — logical snapshot, checksum, secret scan, and isolated restore drill passed**
- Production architecture migration: **APPLIED — Stage 1 database and SMC preservation checks passed**
- Authenticated old-frontend smoke test: **PASS**
- Production OCC import: **NO-GO until production SMC regression passes**

Production Supabase received only `20260830072355_multi_school_architecture.sql`. Git, GitHub, Vercel, OCC data, users, Auth settings, Vault, and environment variables were not changed.

## Production Stage 1 result

- Final dry run: exactly one migration, zero seeds, zero roles.
- Applied migration: `20260830072355_multi_school_architecture.sql` only, with Vault updates skipped.
- Fresh protected snapshot: `/Users/koki/Documents/ClassScope Backups/production-stage1-20260830T122224Z/`.
- Backup secret scan and SHA-256 manifest: PASS.
- Before/after counts: Professors 794/794, Courses 616/616, relationships 0/0, Reviews 1/1, Votes 0/0, User Roles 1/1.
- Professor IDs, Course IDs, Review relations, Vote relations, and Professor-Course relation fingerprints: exact match.
- Legacy school classification: non-null and SMC-only for all existing Professor, Course, and Review rows.
- OCC and DVC: inactive; no Production domain data imported.
- Remote migration history: baseline, Phase 0, and Multi-School architecture only.
- Schema: seven public tables, seven RLS-enabled tables, 21 policies, three functions, and four triggers.
- Existing grants: unchanged. Only authenticated SELECT and service-role ALL on `schools` were added.
- Old Production frontend: login page rendered with zero console errors.
- Authenticated Login and old SMC frontend rendering: PASS using an existing Production account.
- Professor and Course directory searches: PASS.
- Professor and Course autocomplete candidate retrieval: PASS.
- Existing Review rendering and Review search by Professor/Course: PASS.
- Console/network critical errors: 0.
- Rollback: not required; no database, data, security, or authenticated-frontend regression was detected.

## OCC CSV

Adopted source directory:

`/Users/koki/Documents/Codex/2026-08-30/files-mentioned-by-the-user-classscope/data/occ/processed/`

Copied to:

`/Users/koki/Documents/GitHub/classscope-smc/data/occ/processed/`

| File | Bytes | Rows | SHA-256 copy match |
|---|---:|---:|---|
| `occ_courses.csv` | 118,071 | 1,730 | `222b1f15011d6ac3c2742eafd4a41aacb2529d006cbc10dc5e41008cd5c15de0` |
| `occ_professors.csv` | 47,976 | 988 | `0d25ae3a211edde07e20085597feecec404aedce8158cab33c389cb148b80241` |
| `occ_course_professors.csv` | 224,242 | 3,895 | `88f2292568e9db28529423e7979e52a1245a98aa249b0505e2a2270a4c0ac91a` |

- Source/destination checksum match: PASS for all files.
- Headers and `first_seen_term` / `last_seen_term`: PASS.
- Invalid/blank rows: 0.
- Placeholder Professors/relationships: 0.
- Course/Professor/relationship duplicates: 0.
- Course/Professor orphan references: 0.
- Secret, token, key, password, or email-address shaped data: 0. One Course title contains `@` punctuation but is not an email address.
- A second candidate set under `work/occ-test/processed` was rejected because it contained only 1,004 / 654 / 1,504 rows.

## Local import

- Importer: `scripts/import_occ_local.sh`.
- Safety: hard-coded local Supabase container guard; no production target option.
- Transaction: staging validation, import, count assertions, and activation occur in one transaction.
- First completed run: Courses 1,730; Professors 988; relationships 3,895; skipped 0; domain errors 0.
- Re-run: Courses inserted/updated 0; Professors inserted 0; relationships inserted 0.
- Counts after re-run: 1,730 / 988 / 3,895.
- Partial failure test: the first development attempt rejected the CSV stream at staging because of line-ending handling; the entire transaction rolled back and OCC domain row counts remained 0. The importer was corrected to preserve CRLF COPY termination before the successful run.
- OCC activation: performed only in local DB after all count assertions passed.
- Professor identity limitation: the source has no stable external Professor ID. Import uses `(OCC school_id, normalized instructor_name)` only after proving uniqueness; it is never global across schools.

## Testing

- OCC Acceptance: PASS.
- SMC Regression after OCC import: PASS.
- School isolation / SMC-OCC leak: PASS, 0 leaks.
- Cross-school relationship and Review DB rejection: PASS.
- OCC Professor search: PASS.
- OCC Course search: PASS.
- Professor → related Courses: PASS.
- Course → related Professors: N/A; no such UI/detail feature exists in the current application.
- OCC Review create/read/delete: PASS.
- OCC Helpful / Not good: PASS.
- OCC admin/navigation/logout: PASS.
- OCC 390px responsive: PASS.
- OCC/SMC browser console critical errors: 0.
- SMC count/ID/relation/value fingerprint after import: PASS.
- SMC search, Review display, Vote, admin, navigation, responsive, Logout: PASS.
- RLS, admin privilege, Review/Vote ownership, anon access: PASS.
- Schema lint: PASS.
- DB Advisor: PASS, zero findings.
- TypeScript: PASS.
- ESLint: PASS with zero errors and seven warnings.
- Production build: PASS.
- Secret scan: PASS.

## Production backup preflight and baseline

- Linked project: `smc-japanese-student-review`; linked ref and active project metadata agree.
- PostgreSQL: 17.6.1.127.
- Pre-migration history was `20260806220000`, `20260806224513`; Multi-School migration `20260830072355` is now present remotely.
- Production now contains the approved Multi-School architecture and SMC backfill: seven public tables, seven RLS-enabled tables, 21 policies, three functions, and four triggers.
- Safe counts: Professors 794, Courses 616, relationships 0, Reviews 1, Votes 0, User Roles 1, Auth Users 5.
- Safe SHA-256 fingerprints for Professor IDs, Course IDs, Review relations, Vote relations, Professor-Course relations, and the raw public schema are stored outside Git in backup metadata.
- Production data values, UUIDs, emails, and Review content were not included in this report.

## Completed production backup and restore drill

- Protected backup directory: `/Users/koki/Documents/ClassScope Backups/production-preflight-20260830T121507Z/`.
- Retained artifacts: roles, schema, focused public schema/data, token-free auth recovery data, migration-history schema/data, metadata, restore re-dumps, and `SHA256SUMS`.
- Initial unrestricted full-data dump: rejected and deleted after detecting session/refresh-token table rows.
- Retained artifact secret scan: PASS.
- Manifest verification: PASS for every retained file.
- Isolated disposable Supabase restore: PASS for public application data, auth users/identities, constraints, functions, triggers, RLS, policies, grants, and migration history.
- Counts and ID/relation fingerprints after restore: exact match.
- FK/orphan checks: 0.
- Local default grants required explicit reconciliation; this step is now mandatory in the restore runbook.
- Auth classification: core account and identity restoration proven by actual restore; active sessions intentionally excluded; real production-user login not tested and would require reauthentication.

## Production state and compatibility

- Read-only production counts remain Professors 794, Courses 616, relationships 0, Reviews 1, Votes 0, user roles 1.
- Production migration history now contains baseline, Phase 0, and the approved Multi-School architecture migration.
- Vercel Production and GitHub `main` still contain the old SMC-only frontend.
- New frontend + old DB: **incompatible** because it requires `schools`, `school_id`, and the new named relationship constraints; never deploy frontend first.
- Old frontend + architecture DB before OCC import: **compatible for a short controlled window** because the new classification columns default to the stable SMC ID and existing columns/operations remain available.
- Old frontend after OCC import: unsafe because it lacks school-scoped reads; prohibited.
- Required order remains DB architecture → SMC backfill validation → frontend → production SMC regression → OCC import → OCC acceptance.

GitHub `main` and local `HEAD` both point to `6b4189cbe773e8b83951438d2114cf884f9143d5`. The production bundle still contains the old `ClassScope SMC` implementation and no `school_id`/`schools` query references. The local Multi-School implementation remains uncommitted.

## Production backup

- Read-only status: PITR disabled; no available physical backups listed.
- Supabase documents managed daily backups for paid plans and recommends CLI logical exports for Free tier.
- An executable roles/schema/data/migration-history backup and restore plan is defined in `docs/production-backup-restore-plan.md`.
- Full disaster recovery must include managed auth data because public Review/Vote/role rows reference `auth.users`; the dump is sensitive and must be encrypted outside Git.
- Restore is feasible. A fresh pre-migration snapshot and post-migration evidence were captured under the Stage 1 backup directory.

## Final readiness matrix

| Gate | Result | Note |
|---|---|---|
| Production target verification | PASS | Linked name/ref/status/version agree |
| Logical backup creation | PASS | Retained outside Git with owner-only permissions |
| Backup checksum | PASS | All manifest entries verified |
| Backup secret scan | PASS | Token-bearing full dump rejected and deleted |
| Restore drill | PASS | Disposable isolated Supabase environment |
| Application data restoration | PASS | Counts, fingerprints, FK integrity match |
| Auth restoration feasibility | PASS | Auth core restored separately; sessions excluded and reauthentication required |
| SMC preservation baseline | PASS | Counts, ID/relation hashes, schema hash, migration history recorded |
| Migration rollback feasibility | PASS | Migration is transactional; verified logical application/auth-core restore is the post-commit recovery path |
| Old frontend + new DB compatibility | PASS, conditional | Safe only before OCC import and only for the controlled deployment window |
| New frontend + old DB compatibility | FAIL, expected | Enforces database-first deployment order |
| Vercel deployment order | PASS | DB → SMC validate → source/deploy → SMC regression → OCC |
| OCC rollback feasibility | PASS, conditional | Delete/deactivate OCC only while OCC Review/Vote counts are zero |

## Remaining production gates

1. Git commit/push and Vercel deployment require separate explicit approval.
2. Production OCC import must wait for post-deployment production SMC regression.

There are no remaining local architecture, CSV, import-idempotency, OCC acceptance, SMC regression, isolation, security, TypeScript, or build blockers.

## Exact Production Stage 1 after explicit approval

1. Reconfirm the linked production target, remote migration list, schema state, and safe counts read-only.
2. Capture a new owner-only Git-external roles/schema/public-data/token-free-auth/history snapshot.
3. Re-run secret scan, generate and verify SHA-256, and compare new counts/fingerprints with the current baseline.
4. Re-review the exact SQL in `20260830072355_multi_school_architecture.sql` and confirm that OCC import, frontend deployment, and all unrelated migrations are excluded.
5. Apply only that architecture migration as its single transaction. Do not import OCC and do not deploy the frontend.
6. Immediately verify SMC counts, Professor/Course ID hashes, Review relation hash, zero cross-school inconsistencies, RLS/policies/grants/functions/triggers, and remote migration history.
7. Smoke-test the still-deployed old SMC frontend against the new DB.
8. Stop and report Stage 1 results. Git commit/push, Vercel deployment, and OCC import require their subsequent gates and are not part of Stage 1.

**Production Stage 1: PASS. Authenticated old-frontend compatibility: PASS. Next stage: GO, awaiting separate explicit approval.**

## Files changed

- `data/occ/processed/occ_courses.csv`
- `data/occ/processed/occ_professors.csv`
- `data/occ/processed/occ_course_professors.csv`
- `docs/multi-school-migration-plan.md`
- `docs/multi-school-go-no-go.md`
- `docs/occ-import-runbook.md`
- `docs/production-backup-restore-plan.md`
- `scripts/import_occ_local.sh`
- `src/App.tsx`
- `src/components/CollegeSelection.tsx`
- `src/components/CourseManager.tsx`
- `src/components/ProfessorManager.tsx`
- `src/components/ProfessorStats.tsx`
- `src/components/ReviewForm.tsx`
- `src/components/ReviewList.tsx`
- `src/contexts/SchoolContext.tsx`
- `src/lib/types.ts`
- `src/main.tsx`
- `supabase/migrations/20260830072355_multi_school_architecture.sql`
- `supabase/tests/legacy_smc_fixture.sql`
- `supabase/tests/legacy_smc_preservation.sql`
- `supabase/tests/multi_school_regression.sql`
- `supabase/tests/occ_acceptance.sql`
