do $$
declare
  occ_id constant uuid := '00000000-0000-4000-8000-000000000002';
  smc_id constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  if (select count(*) from public.courses where school_id = occ_id) <> 1730 then
    raise exception 'OCC course acceptance count failed';
  end if;
  if (select count(*) from public.professors where school_id = occ_id) <> 988 then
    raise exception 'OCC professor acceptance count failed';
  end if;
  if (select count(*) from public.professor_courses where school_id = occ_id) <> 3895 then
    raise exception 'OCC relationship acceptance count failed';
  end if;
  if not (select is_active from public.schools where id = occ_id) then
    raise exception 'OCC must be active after local acceptance import';
  end if;
  if (select is_active from public.schools where slug = 'dvc') then
    raise exception 'DVC must remain inactive';
  end if;

  if exists (
    select 1 from public.professors
    where school_id = occ_id
      and lower(btrim(name)) in ('staff', 'tba', 'tbd', 'unknown', 'instructor', 'to be announced', 'n/a', 'na', 'none', '-')
  ) then raise exception 'OCC placeholder professor detected'; end if;

  if (select count(*) from public.courses where school_id = occ_id)
      <> (select count(distinct lower(regexp_replace(btrim(code), '\s+', ' ', 'g'))) from public.courses where school_id = occ_id) then
    raise exception 'OCC duplicate course identity detected';
  end if;
  if (select count(*) from public.professors where school_id = occ_id)
      <> (select count(distinct lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) from public.professors where school_id = occ_id) then
    raise exception 'OCC duplicate professor identity detected';
  end if;
  if (select count(*) from public.professor_courses where school_id = occ_id)
      <> (select count(distinct (professor_id, course_id)) from public.professor_courses where school_id = occ_id) then
    raise exception 'OCC duplicate relationship detected';
  end if;

  if exists (
    select 1
    from public.professor_courses pc
    join public.professors p on p.id = pc.professor_id
    join public.courses c on c.id = pc.course_id
    where pc.school_id = occ_id
      and (p.school_id <> occ_id or c.school_id <> occ_id)
  ) then raise exception 'OCC cross-school relationship detected'; end if;

  if exists (
    select 1 from public.reviews r
    join public.professors p on p.id = r.professor_id
    join public.courses c on c.id = r.course_id
    where r.school_id = occ_id
      and (p.school_id <> occ_id or c.school_id <> occ_id)
  ) then raise exception 'OCC cross-school review detected'; end if;

  if exists (
    select 1 from public.professors smc
    join public.professors occ on occ.id = smc.id
    where smc.school_id = smc_id and occ.school_id = occ_id
  ) then raise exception 'professor ID leak across schools'; end if;
  if exists (
    select 1 from public.courses smc
    join public.courses occ on occ.id = smc.id
    where smc.school_id = smc_id and occ.school_id = occ_id
  ) then raise exception 'course ID leak across schools'; end if;
end;
$$;

begin;

do $$
declare
  occ_course uuid;
begin
  select id into occ_course
  from public.courses
  where school_id = '00000000-0000-4000-8000-000000000002'
  order by id limit 1;

  begin
    insert into public.professor_courses (school_id, professor_id, course_id)
    values (
      '00000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      occ_course
    );
    raise exception 'cross-school relationship unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.reviews (user_id, school_id, professor_id, course_id, rating, content)
    values (
      '11000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000001',
      occ_course,
      5,
      'must fail'
    );
    raise exception 'cross-school review unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
end;
$$;

rollback;
