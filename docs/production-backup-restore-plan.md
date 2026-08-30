# Production Backup and Restore Plan

Status: **logical snapshot and isolated restore drill completed on 2026-08-30.**

Production Stage 1 used a fresh pre-migration snapshot at:

`/Users/koki/Documents/ClassScope Backups/production-stage1-20260830T122224Z/`

This directory contains the verified pre-migration snapshot, post-migration public schema/data/history evidence, `stage1-result.md`, and a passing `SHA256SUMS` manifest.

The earlier recovery drill accessed Production read-only. During the separately approved Stage 1, only `20260830072355_multi_school_architecture.sql` was applied; no OCC data, migration repair, environment change, Auth setting change, Git operation, or deployment was performed.

Validated snapshot directory (outside Git):

`/Users/koki/Documents/ClassScope Backups/production-preflight-20260830T121507Z/`

The directory is owner-only (`0700`) and every retained artifact is `0600`. `SHA256SUMS` validates all retained backup and restore-evidence files.

## Current availability

- Supabase backup status was inspected read-only on 2026-08-30.
- Physical backup support is reported, but no available backups are listed.
- PITR is disabled.
- Supabase documents daily managed backups for Pro, Team, and Enterprise projects and recommends regular `supabase db dump` exports for Free tier projects.
- The logical snapshot, checksum validation, and isolated restore drill are now complete.
- A fresh snapshot and fingerprint recheck are still mandatory immediately before the approved production migration because production data may change after this snapshot.

## Storage and secret handling

- Store backups outside the repository, for example:
  `/Users/koki/Documents/ClassScope Backups/<UTC timestamp>/`
- Directory permission: owner only (`0700`); backup files: owner read/write only (`0600`).
- Do not place database passwords, access tokens, connection strings, or encryption keys in filenames, scripts, Git, shell history, CI logs, or the report.
- Prefer CLI linked authentication or an interactively supplied/temporary environment connection string. Unset it immediately afterward.
- Encrypt the backup directory before off-site storage. Keep the encryption key separately.
- Generate SHA-256 checksums and a manifest containing CLI version, project ref alias, UTC timestamp, production counts, and migration versions. Do not include secrets in the manifest.

## Snapshot set

### 1. Roles

Create `roles.sql` using the official role-only dump workflow. Custom role passwords are not contained in logical/managed backups and must never be written into the backup.

### 2. Schema-only

Create `schema.sql` before migration. It must contain the current database schema, functions, triggers, constraints, indexes, RLS policies, and grants. Also create a focused `public-schema.sql` for quick review.

### 3. Relevant public data

Create a COPY-format data-only dump covering at least:

- `public.professors`
- `public.courses`
- `public.professor_courses`
- `public.reviews`
- `public.review_votes`
- `public.user_roles`

Capture independent count and identity fingerprints for each table before migration. The focused public dump is the surgical SMC rollback source and must never be restored by blindly truncating SMC tables.

### 4. Auth data

For an in-place migration rollback, existing `auth.users` remains untouched, so public data plus the count/fingerprint is sufficient for the planned schema rollback.

For disaster recovery into a new project, auth data is necessary because `reviews.user_id`, `review_votes.user_id`, and `user_roles.user_id` reference `auth.users`, and user login continuity also depends on managed auth records such as identities.

The unrestricted full-data dump was tested and rejected because it included live session and refresh-token rows. It was deleted and is not part of the retained snapshot. The retained `auth-recovery-data.sql` excludes session/token/challenge tables and contains the managed account/identity records needed for FK and credential recovery. Users must reauthenticate after disaster recovery; session continuity is intentionally not backed up.

The isolated drill restored the five auth user records and five identity records into a disposable Supabase-managed auth schema. Auth and database containers remained healthy, and all public-to-auth foreign keys validated. End-to-end login with a real production credential was not attempted, so the result is **auth core restoration proven; active-session continuity excluded; real login verification deferred**.

### 5. Migration history

Dump both schema and data for `supabase_migrations` separately. Record `supabase migration list --linked` in the manifest. Restore migration history only after the restored schema/data is verified; never use migration-history repair as a substitute for restoring the database.

## Planned CLI sequence

Run only after explicit production approval, from the linked repository, writing to the protected Git-external directory:

```sh
supabase db dump --linked --role-only -f roles.sql
supabase db dump --linked -f schema.sql
supabase db dump --linked --schema public -f public-schema.sql
supabase db dump --linked --use-copy --data-only --schema public -f public-data.sql
supabase db dump --linked --use-copy --data-only --schema auth \
  --exclude 'auth.refresh_tokens,auth.sessions,auth.flow_state,auth.one_time_tokens,auth.mfa_challenges,auth.mfa_amr_claims,auth.saml_relay_states,auth.oauth_client_states,auth.webauthn_challenges' \
  -f auth-recovery-data.sql
supabase db dump --linked --schema supabase_migrations -f history-schema.sql
supabase db dump --linked --use-copy --data-only --schema supabase_migrations -f history-data.sql
```

Before relying on these artifacts, inspect file presence/size, scan for dump errors, calculate checksums, and compare the public data counts with the read-only production snapshot.

## Restore procedure

1. Create an isolated local database or a new temporary Supabase project. Never begin with production.
2. Match the production PostgreSQL major version and required extensions.
3. Restore roles, schema, then data using the official `psql` restore order.
4. Apply any documented auth/storage custom schema diff separately if present.
5. For a new Supabase project, follow the official encryption-root-key procedure if Vault/pgsodium encrypted data exists. The key is not included in backup files.
6. Restore migration-history schema/data only after database contents are correct.
7. Re-enable/verify Realtime publications and other managed settings as required.
8. Run ClassScope counts, ID fingerprints, FK integrity, Review/Vote, Auth login, RLS, admin, and application regression tests.
9. Record restore duration and outcome. A backup without a successful restore drill does not satisfy the production gate.

### Verified local-platform prerequisite

Local Supabase may start with broader default grants than Production. The first restore re-dump detected extra `anon`/`authenticated` grants. A restore target must therefore revoke its pre-existing default/table/function privileges before or reconcile them immediately after schema restore, then compare the resulting privilege set with `public-schema.sql`. After reconciliation, the drill matched Production's 0 anon table privileges, 20 authenticated table privileges, and 42 service-role table privileges.

The role dump restored the required anon/authenticated/authenticator settings. The local restore login could not alter the reserved `supabase_admin` role; that role remains platform-managed and is not an application-data blocker.

## Completed validation evidence

- Required retained files: present and non-zero.
- COPY coverage: all six public application tables, auth recovery tables, and migration history.
- Production counts: Professors 794, Courses 616, Professor-Course relationships 0, Reviews 1, Review Votes 0, User Roles 1, Auth Users 5.
- Restored counts: exact match.
- ID/relation fingerprints: exact match for Professors, Courses, Reviews, Votes, and Professor-Course relationships.
- Integrity: zero orphan Review, Vote, Professor-Course, auth-user, or identity relationships.
- Restored catalog: six RLS tables, 21 policies, three functions, four non-internal triggers.
- Migration history: both baseline and Phase 0 versions restored.
- Secret scan: zero connection URIs, Supabase access/secret keys, JWT-shaped values, private keys, AWS access keys, or password DDL.
- Checksums: every entry in `SHA256SUMS` passed.

## Migration rollback use

- Architecture migration rollback must use reviewed SQL and the pre-migration snapshot; do not delete or reinsert SMC rows.
- If validation fails before OCC import, keep OCC inactive and roll back frontend first. Use the SMC defaults to preserve the old frontend during the database-first window.
- OCC-only master data can be removed by OCC `school_id` only while OCC Review/Vote counts are zero. Once user content exists, deletion is prohibited without a separately approved restore plan.
- Never restore `public-data.sql` over a live database without a rehearsed conflict/truncation strategy and explicit approval.

## Feasibility decision

Logical application restore and separate auth-core restore are proven in an isolated Supabase environment. The recovery-system gate is satisfied for an in-place Multi-School architecture migration, subject to a fresh read-only snapshot immediately before migration and explicit production-write approval. Active auth sessions are not preserved and users would need to reauthenticate after disaster recovery.
