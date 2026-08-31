-- Non-destructive Review Schema v2.
-- Existing Reviews remain version 1; no legacy rating is inferred or rewritten.

begin;

alter table public.reviews
  add column review_schema_version smallint not null default 1,
  add column professor_quality smallint,
  add column easy_a smallint,
  add column course_quality smallint,
  add column recommendation smallint,
  add column class_format text,
  add column year_taken smallint,
  add column semester text,
  add column is_imported boolean not null default false,
  add column source_type text,
  add column source_row_key text,
  add column imported_at timestamptz;

-- V2 Reviews must not receive made-up legacy defaults.
alter table public.reviews
  alter column user_id drop not null,
  alter column rating drop not null,
  alter column difficulty drop not null,
  alter column homework_amount drop not null,
  alter column support_quality drop not null,
  alter column attendance_required drop not null;

alter table public.reviews
  add constraint reviews_schema_version_check
    check (review_schema_version in (1, 2)),
  add constraint reviews_professor_quality_check
    check (professor_quality between 1 and 5),
  add constraint reviews_easy_a_check
    check (easy_a between 1 and 5),
  add constraint reviews_course_quality_check
    check (course_quality between 1 and 5),
  add constraint reviews_recommendation_check
    check (recommendation between 1 and 5),
  add constraint reviews_class_format_check
    check (class_format in ('in_person', 'online', 'hybrid')),
  add constraint reviews_year_taken_check
    check (year_taken between 2000 and 2100),
  add constraint reviews_semester_check
    check (semester in ('fall', 'spring', 'summer', 'winter')),
  add constraint reviews_source_type_format_check
    check (source_type is null or source_type ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  add constraint reviews_payload_version_check
    check (
      (
        review_schema_version = 1
        and rating is not null
        and difficulty is not null
        and homework_amount is not null
        and support_quality is not null
        and attendance_required is not null
        and professor_quality is null
        and easy_a is null
        and course_quality is null
        and recommendation is null
        and class_format is null
        and year_taken is null
        and semester is null
      )
      or
      (
        review_schema_version = 2
        and rating is null
        and difficulty is null
        and homework_amount is null
        and support_quality is null
        and attendance_required is null
        and professor_quality is not null
        and easy_a is not null
        and course_quality is not null
        and (recommendation is not null or is_imported)
        and class_format is not null
        and year_taken is not null
        and semester is not null
        and btrim(content) <> ''
      )
    ),
  add constraint reviews_import_ownership_check
    check (
      (
        not is_imported
        and user_id is not null
        and source_type is null
        and source_row_key is null
        and imported_at is null
      )
      or
      (
        is_imported
        and review_schema_version = 2
        and user_id is null
        and source_type is not null
        and btrim(source_type) <> ''
        and source_row_key is not null
        and btrim(source_row_key) <> ''
        and imported_at is not null
      )
    );

create unique index reviews_import_source_key_idx
  on public.reviews (school_id, source_type, source_row_key)
  where is_imported;

drop policy "Users can insert their own reviews" on public.reviews;

create policy "Users can insert their own reviews"
  on public.reviews
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and not is_imported
  );

comment on column public.reviews.review_schema_version is
  '1 = legacy ClassScope ratings, 2 = Review Schema v2';
comment on column public.reviews.easy_a is
  '1 = difficult to earn an A, 5 = comparatively easy to earn an A';
comment on column public.reviews.source_type is
  'Non-personal stable dataset identifier for controlled external imports';
comment on column public.reviews.source_row_key is
  'Stable per-source deduplication key; never raw personal data';

commit;
