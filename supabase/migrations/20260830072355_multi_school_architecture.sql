-- Multi-school foundation for ClassScope.
-- Existing rows are classified as SMC in place; no domain row is deleted or reinserted.

begin;

-- Phase A: school catalog.
create table public.schools (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  short_name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint schools_pkey primary key (id),
  constraint schools_slug_key unique (slug),
  constraint schools_slug_format_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint schools_name_not_blank_check check (btrim(name) <> ''),
  constraint schools_short_name_not_blank_check check (btrim(short_name) <> '')
);

alter table public.schools owner to postgres;
alter table public.schools enable row level security;

-- Stable IDs make local validation and a future approved production rollout comparable.
insert into public.schools (id, name, slug, short_name, is_active)
values
  ('00000000-0000-4000-8000-000000000001', 'Santa Monica College', 'smc', 'SMC', true),
  ('00000000-0000-4000-8000-000000000002', 'Orange Coast College', 'occ', 'OCC', false),
  ('00000000-0000-4000-8000-000000000003', 'Diablo Valley College', 'dvc', 'DVC', false);

-- Phase B: nullable classification columns.
alter table public.professors add column school_id uuid;
alter table public.courses add column school_id uuid;
alter table public.professor_courses add column school_id uuid;
alter table public.reviews add column school_id uuid;

-- Phases C-D: every row that predates this migration belongs to SMC.
-- Preserve legacy updated_at values: classification is migration metadata, not a user edit.
alter table public.professors disable trigger update_professors_updated_at;
alter table public.courses disable trigger update_courses_updated_at;
alter table public.reviews disable trigger update_reviews_updated_at;

update public.professors
set school_id = '00000000-0000-4000-8000-000000000001'
where school_id is null;

update public.courses
set school_id = '00000000-0000-4000-8000-000000000001'
where school_id is null;

update public.professor_courses
set school_id = '00000000-0000-4000-8000-000000000001'
where school_id is null;

update public.reviews
set school_id = '00000000-0000-4000-8000-000000000001'
where school_id is null;

alter table public.professors enable trigger update_professors_updated_at;
alter table public.courses enable trigger update_courses_updated_at;
alter table public.reviews enable trigger update_reviews_updated_at;

-- Phase E: stop before constraints if the backfill or legacy relationships are incomplete.
do $$
begin
  if exists (select 1 from public.professors where school_id is null)
    or exists (select 1 from public.courses where school_id is null)
    or exists (select 1 from public.professor_courses where school_id is null)
    or exists (select 1 from public.reviews where school_id is null) then
    raise exception 'multi-school backfill left unclassified rows';
  end if;

end;
$$;

-- Phase F: classification is mandatory after validation.
-- The SMC default preserves writes from the currently deployed single-school
-- frontend during the short database-first/frontend-second rollout window.
alter table public.professors alter column school_id set default '00000000-0000-4000-8000-000000000001';
alter table public.courses alter column school_id set default '00000000-0000-4000-8000-000000000001';
alter table public.professor_courses alter column school_id set default '00000000-0000-4000-8000-000000000001';
alter table public.reviews alter column school_id set default '00000000-0000-4000-8000-000000000001';

alter table public.professors alter column school_id set not null;
alter table public.courses alter column school_id set not null;
alter table public.professor_courses alter column school_id set not null;
alter table public.reviews alter column school_id set not null;

-- Phase G: school-scoped identity and lookup paths.
alter table public.professors drop constraint professors_name_key;
alter table public.professors
  add constraint professors_school_id_fkey
    foreign key (school_id) references public.schools(id),
  add constraint professors_school_id_name_key unique (school_id, name),
  add constraint professors_school_id_id_key unique (school_id, id);

alter table public.courses drop constraint courses_code_key;
alter table public.courses
  add constraint courses_school_id_fkey
    foreign key (school_id) references public.schools(id),
  add constraint courses_school_id_code_key unique (school_id, code),
  add constraint courses_school_id_id_key unique (school_id, id);

alter table public.professor_courses
  drop constraint professor_courses_professor_id_fkey,
  drop constraint professor_courses_course_id_fkey,
  add constraint professor_courses_school_id_fkey
    foreign key (school_id) references public.schools(id),
  add constraint professor_courses_school_professor_fkey
    foreign key (school_id, professor_id)
    references public.professors (school_id, id) on delete cascade,
  add constraint professor_courses_school_course_fkey
    foreign key (school_id, course_id)
    references public.courses (school_id, id) on delete cascade,
  add constraint professor_courses_school_pair_key
    unique (school_id, professor_id, course_id);

alter table public.reviews
  drop constraint reviews_professor_id_fkey,
  drop constraint reviews_course_id_fkey,
  add constraint reviews_school_id_fkey
    foreign key (school_id) references public.schools(id),
  add constraint reviews_school_professor_fkey
    foreign key (school_id, professor_id)
    references public.professors (school_id, id) on delete cascade,
  add constraint reviews_school_course_fkey
    foreign key (school_id, course_id)
    references public.courses (school_id, id) on delete cascade;

create index professor_courses_school_course_idx
  on public.professor_courses (school_id, course_id);
create index reviews_school_created_at_idx
  on public.reviews (school_id, created_at desc);
create index reviews_school_professor_idx
  on public.reviews (school_id, professor_id);

-- Phase I: expose only the read operation used by signed-in clients.
create policy "Authenticated users can view schools"
  on public.schools
  for select
  to authenticated
  using (true);

revoke all on table public.schools from anon, authenticated;
grant select on table public.schools to authenticated;
grant all on table public.schools to service_role;

-- Preserve Phase 0 authorization while avoiding per-row auth function re-evaluation
-- and duplicate permissive DELETE policies.
drop policy "Users can delete their own reviews" on public.reviews;
drop policy "Admins can delete any reviews" on public.reviews;
drop policy "Users can insert their own reviews" on public.reviews;

create policy "Users can insert their own reviews"
  on public.reviews
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners or admins can delete reviews"
  on public.reviews
  for delete
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

drop policy "Users can insert their own votes" on public.review_votes;
drop policy "Users can update their own votes" on public.review_votes;
drop policy "Users can delete their own votes" on public.review_votes;

create policy "Users can insert their own votes"
  on public.review_votes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own votes"
  on public.review_votes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own votes"
  on public.review_votes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
