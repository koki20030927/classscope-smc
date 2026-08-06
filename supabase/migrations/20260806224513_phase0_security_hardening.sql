-- Phase 0 security hardening for the existing linked ClassScope database.
-- This is an incremental migration, not a baseline schema migration.
-- Assign the initial admin through a controlled service-role/Dashboard operation
-- after applying this migration; never hard-code a user ID in migration history.

begin;

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

create policy "Users can view their own role"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

alter function public.is_admin() owner to postgres;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Master data remains readable by signed-in users, but only admins may mutate it.
drop policy if exists "Authenticated users can insert professors" on public.professors;
drop policy if exists "Authenticated users can update professors" on public.professors;

create policy "Admins can insert professors"
  on public.professors
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update professors"
  on public.professors
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete professors"
  on public.professors
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can insert courses" on public.courses;
drop policy if exists "Authenticated users can update courses" on public.courses;

create policy "Admins can insert courses"
  on public.courses
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update courses"
  on public.courses
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete courses"
  on public.courses
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can insert professor courses" on public.professor_courses;
drop policy if exists "Authenticated users can update professor courses" on public.professor_courses;

create policy "Admins can insert professor courses"
  on public.professor_courses
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update professor courses"
  on public.professor_courses
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete professor courses"
  on public.professor_courses
  for delete
  to authenticated
  using (public.is_admin());

-- The application has no review-edit flow. Removing UPDATE prevents ownership,
-- counters, and creation metadata from being changed through the public API.
drop policy if exists "Users can update their own reviews" on public.reviews;

create policy "Admins can delete any reviews"
  on public.reviews
  for delete
  to authenticated
  using (public.is_admin());

-- Votes are private to their owner; aggregate counts remain visible on reviews.
drop policy if exists "Users can view all votes" on public.review_votes;

create policy "Users can view their own votes"
  on public.review_votes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Recalculate both counters from source rows so INSERT, UPDATE, DELETE, and
-- corrections cannot cause incremental counter drift.
create or replace function public.update_review_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_review_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    target_review_id := old.review_id;

    update public.reviews
    set helpful_count = (
          select count(*)::integer
          from public.review_votes
          where review_id = target_review_id
            and vote_type = 'helpful'
        ),
        not_good_count = (
          select count(*)::integer
          from public.review_votes
          where review_id = target_review_id
            and vote_type = 'not_good'
        )
    where id = target_review_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.review_id is distinct from old.review_id) then
    target_review_id := new.review_id;

    update public.reviews
    set helpful_count = (
          select count(*)::integer
          from public.review_votes
          where review_id = target_review_id
            and vote_type = 'helpful'
        ),
        not_good_count = (
          select count(*)::integer
          from public.review_votes
          where review_id = target_review_id
            and vote_type = 'not_good'
        )
    where id = target_review_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function public.update_review_vote_counts() owner to postgres;
revoke all on function public.update_review_vote_counts() from public, anon, authenticated;
grant execute on function public.update_review_vote_counts() to service_role;

drop trigger if exists review_vote_count_trigger on public.review_votes;
create trigger review_vote_count_trigger
  after insert or update or delete on public.review_votes
  for each row execute function public.update_review_vote_counts();

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter function public.update_updated_at_column() owner to postgres;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;
grant execute on function public.update_updated_at_column() to service_role;

-- Remove broad API grants and restore only operations supported by RLS and UI.
revoke all on table public.professors from anon, authenticated;
revoke all on table public.courses from anon, authenticated;
revoke all on table public.professor_courses from anon, authenticated;
revoke all on table public.reviews from anon, authenticated;
revoke all on table public.review_votes from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;

-- Admins also use the authenticated database role; RLS performs authorization.
grant select, insert, update, delete on table public.professors to authenticated;
grant select, insert, update, delete on table public.courses to authenticated;
grant select, insert, update, delete on table public.professor_courses to authenticated;
grant select, insert, delete on table public.reviews to authenticated;
grant select, insert, update, delete on table public.review_votes to authenticated;
grant select on table public.user_roles to authenticated;

grant all on table public.professors to service_role;
grant all on table public.courses to service_role;
grant all on table public.professor_courses to service_role;
grant all on table public.reviews to service_role;
grant all on table public.review_votes to service_role;
grant all on table public.user_roles to service_role;

-- Prevent future public-schema objects from inheriting broad API privileges.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Foreign-key indexes used by ownership checks, filters, joins, and vote recounts.
create index if not exists reviews_user_id_idx on public.reviews (user_id);
create index if not exists reviews_professor_id_idx on public.reviews (professor_id);
create index if not exists reviews_course_id_idx on public.reviews (course_id);
create index if not exists review_votes_review_id_idx on public.review_votes (review_id);
create index if not exists professor_courses_course_id_idx on public.professor_courses (course_id);

commit;
