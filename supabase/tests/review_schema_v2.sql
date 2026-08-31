begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'review-v2-owner@example.test', now(), now()),
  ('12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'review-v2-admin@example.test', now(), now());

insert into public.user_roles (user_id, role)
values ('12000000-0000-4000-8000-000000000002', 'admin');

insert into public.professors (id, school_id, name)
values
  ('22000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Review V2 SMC Professor'),
  ('22000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Review V2 OCC Professor');

insert into public.courses (id, school_id, code, name)
values
  ('32000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'RV2 1', 'Review V2 SMC Course'),
  ('32000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'RV2 A1', 'Review V2 OCC Course');

insert into public.professor_courses (school_id, professor_id, course_id)
values
  ('00000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);

insert into public.reviews (
  id,
  school_id,
  user_id,
  professor_id,
  course_id,
  review_schema_version,
  rating,
  difficulty,
  homework_amount,
  support_quality,
  attendance_required,
  professor_quality,
  easy_a,
  course_quality,
  recommendation,
  class_format,
  year_taken,
  semester,
  content
) values (
  '52000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  2,
  null,
  null,
  null,
  null,
  null,
  5,
  4,
  5,
  5,
  'hybrid',
  2026,
  'fall',
  'Review v2 normal-user fixture'
);

insert into public.review_votes (id, user_id, review_id, vote_type)
values (
  '62000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'helpful'
);

do $$
begin
  if (select helpful_count from public.reviews where id = '52000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Review v2 Vote counter regression';
  end if;

  begin
    insert into public.reviews (
      school_id, user_id, professor_id, course_id, review_schema_version,
      rating, difficulty, homework_amount, support_quality, attendance_required,
      professor_quality, easy_a, course_quality, recommendation,
      class_format, year_taken, semester, content,
      is_imported, source_type, source_row_key, imported_at
    ) values (
      '00000000-0000-4000-8000-000000000002', null,
      '22000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 2,
      null, null, null, null, null,
      5, 5, 5, 5, 'in_person', 2026, 'fall', 'must fail RLS',
      true, 'rls_test', 'must_fail', now()
    );
    raise exception 'normal user created an imported Review';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.reviews
    set content = 'must remain immutable'
    where id = '52000000-0000-4000-8000-000000000001';
    raise exception 'Review v2 UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

insert into public.reviews (
  id,
  school_id,
  user_id,
  professor_id,
  course_id,
  review_schema_version,
  rating,
  difficulty,
  homework_amount,
  support_quality,
  attendance_required,
  professor_quality,
  easy_a,
  course_quality,
  recommendation,
  class_format,
  year_taken,
  semester,
  content,
  is_imported,
  source_type,
  source_row_key,
  imported_at
) values (
  '52000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  null,
  '22000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000002',
  2,
  null,
  null,
  null,
  null,
  null,
  4,
  3,
  5,
  null,
  'in_person',
  2025,
  'spring',
  'Imported Review without a source recommendation',
  true,
  'review_v2_fixture',
  'fixture_row_1',
  now()
);

do $$
begin
  begin
    insert into public.reviews (
      school_id, user_id, professor_id, course_id, review_schema_version,
      rating, difficulty, homework_amount, support_quality, attendance_required,
      professor_quality, easy_a, course_quality, recommendation,
      class_format, year_taken, semester, content,
      is_imported, source_type, source_row_key, imported_at
    ) values (
      '00000000-0000-4000-8000-000000000002', null,
      '22000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 2,
      null, null, null, null, null,
      4, 3, 5, null, 'in_person', 2025, 'spring', 'duplicate source key',
      true, 'review_v2_fixture', 'fixture_row_1', now()
    );
    raise exception 'duplicate imported Review unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.reviews (
      school_id, user_id, professor_id, course_id, review_schema_version,
      rating, difficulty, homework_amount, support_quality, attendance_required,
      professor_quality, easy_a, course_quality, recommendation,
      class_format, year_taken, semester, content
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000002',
      '32000000-0000-4000-8000-000000000001',
      2, null, null, null, null, null,
      5, 5, 5, 5, 'online', 2026, 'summer', 'must fail cross-school'
    );
    raise exception 'cross-school Review v2 unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  if has_table_privilege('authenticated', 'public.reviews', 'update') then
    raise exception 'authenticated role unexpectedly has Review UPDATE grant';
  end if;
  if has_table_privilege('anon', 'public.reviews', 'select') then
    raise exception 'anon unexpectedly has Review SELECT grant';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);

delete from public.reviews
where id = '52000000-0000-4000-8000-000000000002';

do $$
begin
  if exists (select 1 from public.reviews where id = '52000000-0000-4000-8000-000000000002') then
    raise exception 'admin could not delete imported Review';
  end if;
end;
$$;

reset role;
rollback;
