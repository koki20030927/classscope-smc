#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
data_dir="$repo_dir/data/dvc/historical-candidate-v1"
db_container="supabase_db_classscope-smc"

courses_csv="$data_dir/dvc_courses_candidate.csv"
professors_csv="$data_dir/dvc_professors_candidate.csv"
relationships_csv="$data_dir/dvc_course_professors_candidate.csv"

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

expected_courses=$(($(wc -l < "$courses_csv") - 1))
expected_professors=$(($(wc -l < "$professors_csv") - 1))
expected_relationships=$(($(wc -l < "$relationships_csv") - 1))

{
  cat <<'SQL'
\set ON_ERROR_STOP on
begin;

create temp table staging_dvc_courses (
  subject text,
  course_number text,
  course_title text,
  first_seen_term text,
  last_seen_term text
) on commit drop;

create temp table staging_dvc_professors (
  instructor_name text,
  first_seen_term text,
  last_seen_term text
) on commit drop;

create temp table staging_dvc_relationships (
  subject text,
  course_number text,
  instructor_name text,
  first_seen_term text,
  last_seen_term text,
  evidence_type text,
  evidence_terms text,
  source_urls text
) on commit drop;

create temp table expected_dvc_counts (
  courses integer,
  professors integer,
  relationships integer
) on commit drop;

insert into expected_dvc_counts values (
  :'expected_courses'::integer,
  :'expected_professors'::integer,
  :'expected_relationships'::integer
);

\copy staging_dvc_courses from stdin with (format csv, header true)
SQL
  cat "$courses_csv"
  printf '\\.\n'
  cat <<'SQL'
\copy staging_dvc_professors from stdin with (format csv, header true)
SQL
  cat "$professors_csv"
  printf '\\.\n'
  cat <<'SQL'
\copy staging_dvc_relationships from stdin with (format csv, header true)
SQL
  cat "$relationships_csv"
  printf '\\.\n'
  cat <<'SQL'

do $$
declare
  course_duplicates integer;
  professor_duplicates integer;
  relationship_duplicates integer;
  course_orphans integer;
  professor_orphans integer;
begin
  if (select count(*) from staging_dvc_courses) <> (select courses from expected_dvc_counts) then
    raise exception 'DVC course staging count mismatch';
  end if;
  if (select count(*) from staging_dvc_professors) <> (select professors from expected_dvc_counts) then
    raise exception 'DVC professor staging count mismatch';
  end if;
  if (select count(*) from staging_dvc_relationships) <> (select relationships from expected_dvc_counts) then
    raise exception 'DVC relationship staging count mismatch';
  end if;

  if exists (
    select 1 from staging_dvc_courses
    where btrim(subject) = '' or btrim(course_number) = '' or btrim(course_title) = ''
       or btrim(first_seen_term) = '' or btrim(last_seen_term) = ''
  ) then raise exception 'invalid DVC course row'; end if;

  if exists (
    select 1 from staging_dvc_professors
    where btrim(instructor_name) = '' or btrim(first_seen_term) = '' or btrim(last_seen_term) = ''
       or lower(regexp_replace(btrim(instructor_name), '[.]', '', 'g')) in
          ('staff', 'tba', 'tbd', 'to be announced', 'instructor', 'faculty', 'unassigned', 'arr', 'n/a', 'na', 'not assigned', 'to be determined', 'unknown', 'none', '-')
       or lower(regexp_replace(btrim(instructor_name), '[.]', '', 'g')) ~ '^(d|s|dvc|src)[[:space:]]+staff$'
       or lower(regexp_replace(btrim(instructor_name), '[.]', '', 'g')) ~ '^staff,[[:space:]]*(d|s|dvc|src)$'
  ) then raise exception 'invalid or placeholder DVC professor row'; end if;

  if exists (
    select 1 from staging_dvc_relationships
    where btrim(subject) = '' or btrim(course_number) = '' or btrim(instructor_name) = ''
       or btrim(first_seen_term) = '' or btrim(last_seen_term) = ''
  ) then raise exception 'invalid DVC relationship row'; end if;

  select count(*) - count(distinct lower(regexp_replace(btrim(subject) || ' ' || btrim(course_number), '\s+', ' ', 'g')))
  into course_duplicates from staging_dvc_courses;
  select count(*) - count(distinct lower(regexp_replace(btrim(instructor_name), '\s+', ' ', 'g')))
  into professor_duplicates from staging_dvc_professors;
  select count(*) - count(distinct (
    lower(regexp_replace(btrim(subject) || ' ' || btrim(course_number), '\s+', ' ', 'g')),
    lower(regexp_replace(btrim(instructor_name), '\s+', ' ', 'g'))
  )) into relationship_duplicates from staging_dvc_relationships;

  if course_duplicates <> 0 or professor_duplicates <> 0 or relationship_duplicates <> 0 then
    raise exception 'DVC staging duplicate detected: courses %, professors %, relationships %',
      course_duplicates, professor_duplicates, relationship_duplicates;
  end if;

  select count(*) into course_orphans
  from staging_dvc_relationships r
  where not exists (
    select 1 from staging_dvc_courses c
    where lower(regexp_replace(btrim(c.subject) || ' ' || btrim(c.course_number), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(r.subject) || ' ' || btrim(r.course_number), '\s+', ' ', 'g'))
  );
  select count(*) into professor_orphans
  from staging_dvc_relationships r
  where not exists (
    select 1 from staging_dvc_professors p
    where lower(regexp_replace(btrim(p.instructor_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(r.instructor_name), '\s+', ' ', 'g'))
  );

  if course_orphans <> 0 or professor_orphans <> 0 then
    raise exception 'DVC staging orphan detected: courses %, professors %', course_orphans, professor_orphans;
  end if;
end;
$$;

create temp table dvc_import_metrics as
select
  (select count(*) from public.courses where school_id = '00000000-0000-4000-8000-000000000003') as courses_before,
  (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000003') as professors_before,
  (select count(*) from public.professor_courses where school_id = '00000000-0000-4000-8000-000000000003') as relationships_before;

insert into public.courses (school_id, code, name)
select
  '00000000-0000-4000-8000-000000000003',
  regexp_replace(btrim(subject) || ' ' || btrim(course_number), '\s+', ' ', 'g'),
  btrim(course_title)
from staging_dvc_courses
on conflict (school_id, code) do update
set name = excluded.name
where public.courses.name is distinct from excluded.name;

insert into public.professors (school_id, name)
select
  '00000000-0000-4000-8000-000000000003',
  regexp_replace(btrim(instructor_name), '\s+', ' ', 'g')
from staging_dvc_professors
on conflict (school_id, name) do nothing;

insert into public.professor_courses (school_id, professor_id, course_id)
select
  '00000000-0000-4000-8000-000000000003',
  p.id,
  c.id
from staging_dvc_relationships r
join public.professors p
  on p.school_id = '00000000-0000-4000-8000-000000000003'
 and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g'))
     = lower(regexp_replace(btrim(r.instructor_name), '\s+', ' ', 'g'))
join public.courses c
  on c.school_id = '00000000-0000-4000-8000-000000000003'
 and lower(regexp_replace(btrim(c.code), '\s+', ' ', 'g'))
     = lower(regexp_replace(btrim(r.subject) || ' ' || btrim(r.course_number), '\s+', ' ', 'g'))
on conflict (professor_id, course_id) do nothing;

do $$
begin
  if (select count(*) from public.courses where school_id = '00000000-0000-4000-8000-000000000003') <> (select courses from expected_dvc_counts) then
    raise exception 'DVC imported course count mismatch';
  end if;
  if (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000003') <> (select professors from expected_dvc_counts) then
    raise exception 'DVC imported professor count mismatch';
  end if;
  if (select count(*) from public.professor_courses where school_id = '00000000-0000-4000-8000-000000000003') <> (select relationships from expected_dvc_counts) then
    raise exception 'DVC imported relationship count mismatch';
  end if;
  if exists (select 1 from public.reviews where school_id = '00000000-0000-4000-8000-000000000003') then
    raise exception 'DVC Review was unexpectedly present';
  end if;
end;
$$;

-- Acceptance requires DVC to be selectable in Local only. This script refuses
-- any target other than the named Local Supabase container above.
update public.schools set is_active = true where slug = 'dvc';

select json_build_object(
  'school', 'dvc',
  'courses', totals.courses_after,
  'professors', totals.professors_after,
  'relationships', totals.relationships_after,
  'reviews', (select count(*) from public.reviews where school_id = '00000000-0000-4000-8000-000000000003'),
  'active', (select is_active from public.schools where slug = 'dvc'),
  'courses_inserted', totals.courses_after - metrics.courses_before,
  'professors_inserted', totals.professors_after - metrics.professors_before,
  'relationships_inserted', totals.relationships_after - metrics.relationships_before
) as dvc_import_result
from dvc_import_metrics metrics
cross join lateral (
  select
    (select count(*) from public.courses where school_id = '00000000-0000-4000-8000-000000000003') as courses_after,
    (select count(*) from public.professors where school_id = '00000000-0000-4000-8000-000000000003') as professors_after,
    (select count(*) from public.professor_courses where school_id = '00000000-0000-4000-8000-000000000003') as relationships_after
) totals;

commit;
SQL
} | docker exec -i "$db_container" psql \
  -v ON_ERROR_STOP=1 \
  -v expected_courses="$expected_courses" \
  -v expected_professors="$expected_professors" \
  -v expected_relationships="$expected_relationships" \
  -U postgres -d postgres
