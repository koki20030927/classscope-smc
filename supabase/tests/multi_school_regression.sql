begin;

do $$
begin
  if (select count(*) from public.schools) <> 3 then
    raise exception 'expected exactly three initial schools';
  end if;
  if (select is_active from public.schools where slug = 'dvc') then
    raise exception 'DVC must remain inactive';
  end if;
  if has_table_privilege('anon', 'public.schools', 'select') then
    raise exception 'anon must not be able to select schools';
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'student@example.test', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@example.test', now(), now());

insert into public.professors (id, school_id, name)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Same Name'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Same Name');

insert into public.courses (id, school_id, code, name)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'TEST 1', 'SMC Test'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'TEST 1', 'OCC Test'),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'TEST 2', 'SMC Course Without Relationship');

insert into public.professor_courses (id, school_id, professor_id, course_id)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002');

do $$
begin
  begin
    insert into public.professor_courses (school_id, professor_id, course_id)
    values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
    raise exception 'cross-school relationship unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.reviews (
      user_id, school_id, professor_id, course_id, rating, content
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      5,
      'must fail'
    );
    raise exception 'cross-school review unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.schools) <> 3 then
    raise exception 'authenticated school SELECT policy failed';
  end if;

  begin
    insert into public.professors (school_id, name)
    values ('00000000-0000-4000-8000-000000000001', 'Unauthorized Professor');
    raise exception 'non-admin master-data insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

insert into public.reviews (
  id, user_id, professor_id, course_id, rating, content
) values (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  5,
  'SMC regression fixture'
);

insert into public.review_votes (user_id, review_id, vote_type)
values (
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'helpful'
);

-- Production has legacy reviews without professor_courses rows. Same-school
-- professor/course reviews must remain valid while cross-school pairs fail.
insert into public.reviews (
  user_id, school_id, professor_id, course_id, rating, content
) values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  4,
  'same-school review without relationship must pass'
);

do $$
begin
  if (select school_id from public.reviews where id = '50000000-0000-4000-8000-000000000001')
      <> '00000000-0000-4000-8000-000000000001' then
    raise exception 'legacy frontend SMC default regression';
  end if;
  if (select helpful_count from public.reviews where id = '50000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'helpful counter trigger regression';
  end if;

  begin
    update public.reviews
    set content = 'review edits must remain forbidden'
    where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'review UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
insert into public.user_roles (user_id, role)
values ('10000000-0000-4000-8000-000000000002', 'admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

insert into public.professors (school_id, name)
values ('00000000-0000-4000-8000-000000000002', 'Admin Insert PASS');

do $$
begin
  if (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000001' and name = 'Same Name') <> 1 then
    raise exception 'SMC school-scoped lookup failed';
  end if;
  if (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000002' and name = 'Same Name') <> 1 then
    raise exception 'OCC school-scoped lookup failed';
  end if;
  if exists (
    select 1 from public.professors
    where school_id = '00000000-0000-4000-8000-000000000001'
      and id = '20000000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.professors
    where school_id = '00000000-0000-4000-8000-000000000002'
      and id = '20000000-0000-4000-8000-000000000001'
  ) then raise exception 'professor school isolation failed'; end if;
  if exists (
    select 1 from public.courses
    where school_id = '00000000-0000-4000-8000-000000000001'
      and id = '30000000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.courses
    where school_id = '00000000-0000-4000-8000-000000000002'
      and id = '30000000-0000-4000-8000-000000000001'
  ) then raise exception 'course school isolation failed'; end if;
end;
$$;

reset role;
rollback;
