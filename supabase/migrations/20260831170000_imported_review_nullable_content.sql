-- Allow controlled external Review v2 imports to preserve a missing comment as NULL.
-- Normal user Reviews and all legacy Reviews continue to require content.

begin;

alter table public.reviews
  drop constraint reviews_payload_version_check,
  alter column content drop not null;

alter table public.reviews
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
        and content is not null
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
        and (
          is_imported
          or (content is not null and btrim(content) <> '')
        )
      )
    );

comment on column public.reviews.content is
  'Required for user-authored and legacy Reviews; nullable only for controlled imported Review v2 rows';

commit;
