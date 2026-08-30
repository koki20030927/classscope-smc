#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
data_dir="$repo_dir/data/occ/processed"
db_container="supabase_db_classscope-smc"

courses_csv="$data_dir/occ_courses.csv"
professors_csv="$data_dir/occ_professors.csv"
relationships_csv="$data_dir/occ_course_professors.csv"

for file in "$courses_csv" "$professors_csv" "$relationships_csv"; do
  if [[ ! -f "$file" ]]; then
    echo "BLOCKED: missing $file" >&2
    exit 2
  fi
done

if ! docker inspect "$db_container" >/dev/null 2>&1; then
  echo "BLOCKED: local Supabase container is not running: $db_container" >&2
  exit 2
fi

container_port=$(docker port "$db_container" 5432/tcp 2>/dev/null || true)
if [[ "$container_port" != *"127.0.0.1"* && "$container_port" != *"0.0.0.0"* && "$container_port" != *"[::]"* ]]; then
  echo "BLOCKED: target is not the expected local Supabase database" >&2
  exit 2
fi

{
  cat <<'SQL'
\set ON_ERROR_STOP on
begin;

create temp table staging_occ_courses (
  subject text,
  course_number text,
  course_title text,
  first_seen_term text,
  last_seen_term text
) on commit drop;

create temp table staging_occ_professors (
  instructor_name text,
  first_seen_term text,
  last_seen_term text
) on commit drop;

create temp table staging_occ_relationships (
  subject text,
  course_number text,
  instructor_name text,
  first_seen_term text,
  last_seen_term text
) on commit drop;

\copy staging_occ_courses from stdin with (format csv, header true)
SQL
  cat "$courses_csv"
  printf '\\.\r\n'
  cat <<'SQL'
\copy staging_occ_professors from stdin with (format csv, header true)
SQL
  cat "$professors_csv"
  printf '\\.\r\n'
  cat <<'SQL'
\copy staging_occ_relationships from stdin with (format csv, header true)
SQL
  cat "$relationships_csv"
  printf '\\.\r\n'
  cat <<'SQL'

do $$
declare
  course_duplicates integer;
  professor_duplicates integer;
  relationship_duplicates integer;
  course_orphans integer;
  professor_orphans integer;
begin
  if (select count(*) from staging_occ_courses) <> 1730 then
    raise exception 'OCC course staging count mismatch';
  end if;
  if (select count(*) from staging_occ_professors) <> 988 then
    raise exception 'OCC professor staging count mismatch';
  end if;
  if (select count(*) from staging_occ_relationships) <> 3895 then
    raise exception 'OCC relationship staging count mismatch';
  end if;

  if exists (
    select 1 from staging_occ_courses
    where btrim(subject) = '' or btrim(course_number) = '' or btrim(course_title) = ''
       or btrim(first_seen_term) = '' or btrim(last_seen_term) = ''
  ) then raise exception 'invalid OCC course row'; end if;

  if exists (
    select 1 from staging_occ_professors
    where btrim(instructor_name) = '' or btrim(first_seen_term) = '' or btrim(last_seen_term) = ''
       or lower(btrim(instructor_name)) in ('staff', 'tba', 'tbd', 'unknown', 'instructor', 'to be announced', 'n/a', 'na', 'none', '-')
  ) then raise exception 'invalid or placeholder OCC professor row'; end if;

  if exists (
    select 1 from staging_occ_relationships
    where btrim(subject) = '' or btrim(course_number) = '' or btrim(instructor_name) = ''
       or btrim(first_seen_term) = '' or btrim(last_seen_term) = ''
       or lower(btrim(instructor_name)) in ('staff', 'tba', 'tbd', 'unknown', 'instructor', 'to be announced', 'n/a', 'na', 'none', '-')
  ) then raise exception 'invalid or placeholder OCC relationship row'; end if;

  select count(*) - count(distinct lower(regexp_replace(btrim(subject) || ' ' || btrim(course_number), '\s+', ' ', 'g')))
  into course_duplicates from staging_occ_courses;
  select count(*) - count(distinct lower(regexp_replace(btrim(instructor_name), '\s+', ' ', 'g')))
  into professor_duplicates from staging_occ_professors;
  select count(*) - count(distinct (
    lower(regexp_replace(btrim(subject) || ' ' || btrim(course_number), '\s+', ' ', 'g')),
    lower(regexp_replace(btrim(instructor_name), '\s+', ' ', 'g'))
  )) into relationship_duplicates from staging_occ_relationships;

  if course_duplicates <> 0 or professor_duplicates <> 0 or relationship_duplicates <> 0 then
    raise exception 'OCC staging duplicate detected: courses %, professors %, relationships %',
      course_duplicates, professor_duplicates, relationship_duplicates;
  end if;

  select count(*) into course_orphans
  from staging_occ_relationships r
  where not exists (
    select 1 from staging_occ_courses c
    where lower(regexp_replace(btrim(c.subject) || ' ' || btrim(c.course_number), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(r.subject) || ' ' || btrim(r.course_number), '\s+', ' ', 'g'))
  );

  select count(*) into professor_orphans
  from staging_occ_relationships r
  where not exists (
    select 1 from staging_occ_professors p
    where lower(regexp_replace(btrim(p.instructor_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(r.instructor_name), '\s+', ' ', 'g'))
  );

  if course_orphans <> 0 or professor_orphans <> 0 then
    raise exception 'OCC staging orphan detected: courses %, professors %', course_orphans, professor_orphans;
  end if;
end;
$$;

insert into public.courses (school_id, code, name)
select
  '00000000-0000-4000-8000-000000000002',
  regexp_replace(btrim(subject) || ' ' || btrim(course_number), '\s+', ' ', 'g'),
  btrim(course_title)
from staging_occ_courses
on conflict (school_id, code) do update
set name = excluded.name
where public.courses.name is distinct from excluded.name;

insert into public.professors (school_id, name)
select
  '00000000-0000-4000-8000-000000000002',
  regexp_replace(btrim(instructor_name), '\s+', ' ', 'g')
from staging_occ_professors
on conflict (school_id, name) do nothing;

insert into public.professor_courses (school_id, professor_id, course_id)
select
  '00000000-0000-4000-8000-000000000002',
  p.id,
  c.id
from staging_occ_relationships r
join public.professors p
  on p.school_id = '00000000-0000-4000-8000-000000000002'
 and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g'))
     = lower(regexp_replace(btrim(r.instructor_name), '\s+', ' ', 'g'))
join public.courses c
  on c.school_id = '00000000-0000-4000-8000-000000000002'
 and lower(regexp_replace(btrim(c.code), '\s+', ' ', 'g'))
     = lower(regexp_replace(btrim(r.subject) || ' ' || btrim(r.course_number), '\s+', ' ', 'g'))
on conflict (professor_id, course_id) do nothing;

do $$
begin
  if (select count(*) from public.courses where school_id = '00000000-0000-4000-8000-000000000002') <> 1730 then
    raise exception 'OCC imported course count mismatch';
  end if;
  if (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000002') <> 988 then
    raise exception 'OCC imported professor count mismatch';
  end if;
  if (select count(*) from public.professor_courses where school_id = '00000000-0000-4000-8000-000000000002') <> 3895 then
    raise exception 'OCC imported relationship count mismatch';
  end if;
end;
$$;

update public.schools set is_active = true where slug = 'occ';

select json_build_object(
  'school', 'occ',
  'courses', (select count(*) from public.courses where school_id = '00000000-0000-4000-8000-000000000002'),
  'professors', (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000002'),
  'relationships', (select count(*) from public.professor_courses where school_id = '00000000-0000-4000-8000-000000000002'),
  'reviews', (select count(*) from public.reviews where school_id = '00000000-0000-4000-8000-000000000002'),
  'active', (select is_active from public.schools where slug = 'occ')
) as occ_import_result;

commit;
SQL
} | docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres
