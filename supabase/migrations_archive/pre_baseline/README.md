# Pre-baseline migration archive

ClassScope was baselined from the existing remote database on 2026-08-06.
The baseline was derived from the schema-only dump named
`classscope-public-schema-before-phase0-20260806232001.sql`.

The three SQL files in this directory are retained as development history but
must not be applied to a new database. They were moved outside
`supabase/migrations` so the Supabase CLI will not execute them together with
the baseline.

They do not exactly reproduce the current remote schema:

- `update_review_vote_counts()` has different return handling in the remote DB.
- `attendance_required` has a `DEFAULT 'no'` in the remote DB.
- The remote attendance CHECK is named `reviews_attendance_required_check`.

The baseline represents the actual remote schema before Phase 0. It already
exists in production and must not be executed there. The plan is to record the
baseline version as applied in remote migration history after local validation,
then apply later migrations normally.

All future database changes must be made through reviewed migrations. Do not
make direct schema changes in the Supabase Dashboard. Professor and course seed
data are intentionally not included in the baseline.
