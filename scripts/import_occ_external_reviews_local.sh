#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
db_container="supabase_db_classscope-smc"
candidates_csv=${1:-}

if [[ -z "$candidates_csv" || ! -f "$candidates_csv" ]]; then
  echo "Usage: $0 <import_candidates.csv>" >&2
  exit 2
fi

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

create temp table staging_occ_external_reviews (
  source_type text,
  source_row_key text,
  source_row_number integer,
  status text,
  issues text,
  course_code text,
  professor_name text,
  professor_quality smallint,
  easy_a smallint,
  course_quality smallint,
  recommendation smallint,
  class_format text,
  year_taken smallint,
  semester text,
  content text
) on commit drop;

\copy staging_occ_external_reviews from stdin with (format csv, header true)
SQL
  cat "$candidates_csv"
  printf '\\.\r\n'
  cat <<'SQL'

do $$
begin
  if exists (select 1 from staging_occ_external_reviews where status <> 'matched') then
    raise exception 'non-matched row reached OCC external Review importer';
  end if;
  if exists (
    select 1 from staging_occ_external_reviews
    group by source_type, source_row_key
    having count(*) > 1
  ) then
    raise exception 'duplicate source key in OCC external Review staging';
  end if;
  if exists (
    select 1 from staging_occ_external_reviews
    where source_type !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
       or btrim(source_row_key) = ''
       or professor_quality not between 1 and 5
       or easy_a not between 1 and 5
       or course_quality not between 1 and 5
       or (recommendation is not null and recommendation not between 1 and 5)
       or class_format not in ('in_person', 'online', 'hybrid')
       or year_taken not between 2000 and 2100
       or semester not in ('fall', 'spring', 'summer', 'winter')
       or btrim(content) = ''
  ) then
    raise exception 'invalid OCC external Review staging value';
  end if;
  if exists (
    select 1
    from staging_occ_external_reviews s
    left join public.courses c
      on c.school_id = '00000000-0000-4000-8000-000000000002'
     and c.code = s.course_code
    left join public.professors p
      on p.school_id = '00000000-0000-4000-8000-000000000002'
     and p.name = s.professor_name
    left join public.professor_courses pc
      on pc.school_id = '00000000-0000-4000-8000-000000000002'
     and pc.course_id = c.id
     and pc.professor_id = p.id
    where c.id is null or p.id is null or pc.id is null
  ) then
    raise exception 'unresolved OCC master or relationship reached importer';
  end if;
end;
$$;

create temp table import_metrics as
select
  (select count(*) from staging_occ_external_reviews) as candidates,
  (select count(*) from public.reviews where school_id = '00000000-0000-4000-8000-000000000002' and is_imported) as imported_before;

insert into public.reviews (
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
)
select
  '00000000-0000-4000-8000-000000000002',
  null,
  p.id,
  c.id,
  2,
  null,
  null,
  null,
  null,
  null,
  s.professor_quality,
  s.easy_a,
  s.course_quality,
  s.recommendation,
  s.class_format,
  s.year_taken,
  s.semester,
  s.content,
  true,
  s.source_type,
  s.source_row_key,
  now()
from staging_occ_external_reviews s
join public.courses c
  on c.school_id = '00000000-0000-4000-8000-000000000002'
 and c.code = s.course_code
join public.professors p
  on p.school_id = '00000000-0000-4000-8000-000000000002'
 and p.name = s.professor_name
join public.professor_courses pc
  on pc.school_id = '00000000-0000-4000-8000-000000000002'
 and pc.course_id = c.id
 and pc.professor_id = p.id
on conflict (school_id, source_type, source_row_key) where is_imported do nothing;

select json_build_object(
  'school', 'occ',
  'candidates', m.candidates,
  'imported_before', m.imported_before,
  'imported_after', after_count,
  'inserted', after_count - m.imported_before,
  'skipped', m.candidates - (after_count - m.imported_before)
) as occ_external_review_import_result
from import_metrics m
cross join lateral (
  select count(*) as after_count
  from public.reviews
  where school_id = '00000000-0000-4000-8000-000000000002'
    and is_imported
) totals;

commit;
SQL
} | docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres
