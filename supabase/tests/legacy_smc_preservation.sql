do $$
declare
  smc_id constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  if not exists (
    select 1 from public.professors
    where id = '21000000-0000-4000-8000-000000000001'
      and school_id = smc_id
      and name = 'Legacy SMC Professor'
      and created_at = '2025-01-02 00:00:00+00'
      and updated_at = '2025-01-03 00:00:00+00'
  ) then raise exception 'legacy professor changed'; end if;

  if not exists (
    select 1 from public.courses
    where id = '31000000-0000-4000-8000-000000000001'
      and school_id = smc_id
      and code = 'SMC 101'
      and name = 'Legacy SMC Course'
      and created_at = '2025-01-04 00:00:00+00'
      and updated_at = '2025-01-05 00:00:00+00'
  ) then raise exception 'legacy course changed'; end if;

  if not exists (
    select 1 from public.professor_courses
    where id = '41000000-0000-4000-8000-000000000001'
      and school_id = smc_id
      and professor_id = '21000000-0000-4000-8000-000000000001'
      and course_id = '31000000-0000-4000-8000-000000000001'
      and created_at = '2025-01-06 00:00:00+00'
  ) then raise exception 'legacy relationship changed'; end if;

  if not exists (
    select 1 from public.reviews
    where id = '51000000-0000-4000-8000-000000000001'
      and school_id = smc_id
      and user_id = '11000000-0000-4000-8000-000000000001'
      and professor_id = '21000000-0000-4000-8000-000000000001'
      and course_id = '31000000-0000-4000-8000-000000000001'
      and rating = 5 and difficulty = 4 and homework_amount = 3 and support_quality = 2
      and attendance_required = 'online'
      and content = 'Legacy SMC review content'
      and review_schema_version = 1
      and professor_quality is null
      and easy_a is null
      and course_quality is null
      and recommendation is null
      and class_format is null
      and year_taken is null
      and semester is null
      and not is_imported
      and source_type is null
      and source_row_key is null
      and imported_at is null
      and helpful_count = 1 and not_good_count = 0
      and created_at = '2025-01-07 00:00:00+00'
      and updated_at = '2025-01-08 00:00:00+00'
  ) then raise exception 'legacy review changed'; end if;

  if not exists (
    select 1 from public.review_votes
    where id = '61000000-0000-4000-8000-000000000001'
      and user_id = '11000000-0000-4000-8000-000000000001'
      and review_id = '51000000-0000-4000-8000-000000000001'
      and vote_type = 'helpful'
      and created_at = '2025-01-09 00:00:00+00'
  ) then raise exception 'legacy vote changed'; end if;
end;
$$;
