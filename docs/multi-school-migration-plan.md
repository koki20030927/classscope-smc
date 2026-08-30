# ClassScope Multi-School Migration Plan

Status: architecture implemented and locally validated; the approved Production architecture migration was applied on 2026-08-30. OCC Production import remains separately gated and unauthorized.

## Current architecture

- Vite 5, React 18, TypeScript, Tailwind CSS, and `@supabase/supabase-js` 2.x.
- There is no URL router. `App.tsx` owns a three-tab navigation state (`reviews`, `professors`, `courses`).
- Authentication is email/password through Supabase Auth. `AuthContext` owns the current user and checks admin access through `public.is_admin()`.
- There is no `profiles` table or preferred-school field.
- `professors`, `courses`, `professor_courses`, `reviews`, `review_votes`, and `user_roles` use UUID primary keys. Existing IDs must remain unchanged.
- `professors.name` and `courses.code` are globally unique. `professor_courses` is unique on `(professor_id, course_id)`. Votes are unique on `(user_id, review_id)`.
- Reviews point independently to a professor and course. The current database does not require that pair to exist in `professor_courses`.
- Signed-in users can read master data and reviews. Only admins can mutate master data. Review INSERT and owner/admin DELETE are supported; review UPDATE was deliberately removed in Phase 0. Votes are owner-scoped.
- The frontend queries domain tables directly. There are no detail pages or dedicated API layer. Searches and statistics currently have no school scope.
- The three validated processed OCC CSV files are present under `data/occ/processed`. The local-only importer and acceptance suite pass, but Production OCC import remains blocked until separately approved after the deployed SMC regression gate.

## Proposed architecture

### Database

- Add `public.schools` with UUID `id`, unique `slug`, `name`, `short_name`, `is_active`, and `created_at`.
- Seed SMC as active and OCC/DVC as inactive. OCC is activated only after its import and acceptance tests pass, preventing an empty OCC screen during the staged production rollout. Use stable UUID literals so local and future production validation refer to the same records.
- Add `school_id` to `professors`, `courses`, `professor_courses`, and `reviews` in staged, non-destructive steps.
- Do not add `school_id` to `review_votes`: its school is transitively and immutably determined by `review_id`.
- Do not add `school_id` to `user_roles`: admin authorization is global in the existing application.
- Backfill every existing domain row to SMC without deleting or reinserting it, validate the backfill, then apply `NOT NULL`.
- Keep an SMC default on the new domain `school_id` columns so the currently deployed SMC-only frontend can still write during the database-first/frontend-second rollout window. New multi-school code always sends an explicit school ID, and OCC import is forbidden until that frontend is deployed and SMC regression passes.
- Replace global uniqueness with `UNIQUE (school_id, name)` for professors and `UNIQUE (school_id, code)` for courses. Preserve UUID primary keys.
- Add school-aware unique keys `(school_id, id)` to professor and course so composite foreign keys can enforce school equality.
- Enforce `professor_courses (school_id, professor_id)` and `(school_id, course_id)` with composite foreign keys.
- Enforce reviews with separate composite foreign keys from `(school_id, professor_id)` and `(school_id, course_id)` to school-aware professor and course keys. This prevents cross-school reviews without requiring a `professor_courses` row. The linked production database currently has one Review and zero relationship rows, so relationship-mandatory reviews would break existing SMC data and behavior.
- Add indexes supporting school-scoped ordering, joins, and review feeds.
- Enable RLS on `schools`; grant authenticated read access and service-role full access. Preserve all existing Phase 0 policies and grants on other tables. Admin inserts must include a school ID; database constraints enforce row integrity.

### Frontend

- Add one central `SchoolContext`, mounted below authentication, as the single source of selected-school state.
- Fetch selectable schools from `public.schools`. Do not use localStorage as an authorization or data boundary.
- Since no router exists, do not add a routing dependency solely for this migration. A refresh returns the signed-in user to college selection; persistent restoration is not required.
- Show college selection immediately after login. Inactive schools remain visible but disabled with “Coming Soon”.
- Add a minimal “Switch College” action in the existing navigation.
- Add `.eq('school_id', currentSchool.id)` to every professor, course, relationship, review, and statistics database query. Do not fetch all schools and filter in the browser.
- Include `school_id` in admin master-data inserts and review inserts. Reset school-dependent component state when the selected school changes.

## Migration impact

- SMC professor, course, review, and relationship UUIDs are unchanged.
- Existing review ownership, ratings, content, timestamps, and vote counters are unchanged.
- Existing user and admin records are unchanged.
- Existing review votes remain linked to the same review IDs and need no backfill.
- All existing domain rows gain the same SMC `school_id` through UPDATE-only backfill.
- OCC and DVC can coexist without globally colliding professor names or course codes.

## Rollback

- Frontend rollback: deploy the prior frontend while the new columns remain; SMC rows and IDs still exist. This is safe only before OCC becomes user-visible, because the old frontend has no school filter.
- OCC-only data removal: delete rows by the OCC `school_id`, in dependency order, only after a separately reviewed backup and production approval.
- Schema rollback: first remove new composite foreign keys/indexes, restore global unique constraints only after proving no cross-school duplicates, then remove `school_id` columns and `schools`. This is not safe after importing another school unless that school's rows are removed first.
- SMC backfill rollback is normally unnecessary because it does not alter identity or content. Dropping columns removes only classification metadata, not SMC domain rows.

## Zero-data-loss basis

The migration adds metadata and constraints around existing rows. It never deletes or reinserts SMC professors, courses, relationships, reviews, votes, users, or roles. The SMC backfill is an in-place UPDATE of newly added nullable columns. Validation blocks the transaction before `NOT NULL` or foreign keys are applied if any row is unclassified. School-aware professor and course foreign keys validate every existing Review without requiring a relationship row. Existing primary keys, foreign keys, content fields, counters, and timestamps are not rewritten.

## Safety gates

1. Confirm the linked production schema still matches the repository baseline and Phase 0 migrations using read-only inspection.
2. Record pre-migration counts and integrity fingerprints for SMC tables.
3. Reset and test a local Supabase database from migrations.
4. Verify SMC regression, school isolation, RLS, cross-school rejection, IDs, counts, relationships, review values, votes, and admin behavior.
5. OCC import remains blocked until all three expected validated CSV files exist and SMC regression passes.
6. Present a production Go/No-Go report. Do not apply any production change without explicit user approval.
