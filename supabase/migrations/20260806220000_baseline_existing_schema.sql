-- ClassScope baseline captured from the linked production public schema.
-- Source: classscope-public-schema-before-phase0-20260806232001.sql
-- This represents the production schema before Phase 0 security hardening.
-- Production already has this schema: do not execute this baseline there.

begin;

create or replace function public.update_review_vote_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.vote_type = 'helpful' then
      update reviews set helpful_count = helpful_count + 1 where id = new.review_id;
    elsif new.vote_type = 'not_good' then
      update reviews set not_good_count = not_good_count + 1 where id = new.review_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if old.vote_type = 'helpful' then
      update reviews set helpful_count = helpful_count - 1 where id = old.review_id;
    elsif old.vote_type = 'not_good' then
      update reviews set not_good_count = not_good_count - 1 where id = old.review_id;
    end if;

    if new.vote_type = 'helpful' then
      update reviews set helpful_count = helpful_count + 1 where id = new.review_id;
    elsif new.vote_type = 'not_good' then
      update reviews set not_good_count = not_good_count + 1 where id = new.review_id;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    if old.vote_type = 'helpful' then
      update reviews set helpful_count = helpful_count - 1 where id = old.review_id;
    elsif old.vote_type = 'not_good' then
      update reviews set not_good_count = not_good_count - 1 where id = old.review_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;

alter function public.update_review_vote_counts() owner to postgres;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter function public.update_updated_at_column() owner to postgres;

create table public.courses (
  id uuid default gen_random_uuid() not null,
  code text not null,
  name text default ''::text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint courses_pkey primary key (id),
  constraint courses_code_key unique (code)
);

create table public.professors (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint professors_pkey primary key (id),
  constraint professors_name_key unique (name)
);

create table public.reviews (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  professor_id uuid not null,
  course_id uuid not null,
  rating integer not null,
  difficulty integer default 3 not null,
  homework_amount integer default 3 not null,
  support_quality integer default 3 not null,
  attendance_required text default 'no'::text not null,
  content text not null,
  helpful_count integer default 0 not null,
  not_good_count integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint reviews_pkey primary key (id),
  constraint reviews_attendance_required_check
    check (attendance_required = any (array['yes'::text, 'no'::text, 'online'::text])),
  constraint reviews_difficulty_check check (difficulty >= 1 and difficulty <= 5),
  constraint reviews_homework_amount_check check (homework_amount >= 1 and homework_amount <= 5),
  constraint reviews_rating_check check (rating >= 1 and rating <= 5),
  constraint reviews_support_quality_check check (support_quality >= 1 and support_quality <= 5),
  constraint reviews_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint reviews_professor_id_fkey foreign key (professor_id) references public.professors(id) on delete cascade,
  constraint reviews_course_id_fkey foreign key (course_id) references public.courses(id) on delete cascade
);

create table public.review_votes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  review_id uuid not null,
  vote_type text not null,
  created_at timestamptz default now() not null,
  constraint review_votes_pkey primary key (id),
  constraint review_votes_user_id_review_id_key unique (user_id, review_id),
  constraint review_votes_vote_type_check
    check (vote_type = any (array['helpful'::text, 'not_good'::text])),
  constraint review_votes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint review_votes_review_id_fkey foreign key (review_id) references public.reviews(id) on delete cascade
);

create table public.professor_courses (
  id uuid default gen_random_uuid() not null,
  professor_id uuid not null,
  course_id uuid not null,
  created_at timestamptz default now() not null,
  constraint professor_courses_pkey primary key (id),
  constraint professor_courses_professor_id_course_id_key unique (professor_id, course_id),
  constraint professor_courses_professor_id_fkey foreign key (professor_id) references public.professors(id) on delete cascade,
  constraint professor_courses_course_id_fkey foreign key (course_id) references public.courses(id) on delete cascade
);

alter table public.courses owner to postgres;
alter table public.professors owner to postgres;
alter table public.reviews owner to postgres;
alter table public.review_votes owner to postgres;
alter table public.professor_courses owner to postgres;

create trigger review_vote_count_trigger
  after insert or delete or update on public.review_votes
  for each row execute function public.update_review_vote_counts();

create trigger update_courses_updated_at
  before update on public.courses
  for each row execute function public.update_updated_at_column();

create trigger update_professors_updated_at
  before update on public.professors
  for each row execute function public.update_updated_at_column();

create trigger update_reviews_updated_at
  before update on public.reviews
  for each row execute function public.update_updated_at_column();

alter table public.courses enable row level security;
alter table public.professor_courses enable row level security;
alter table public.professors enable row level security;
alter table public.review_votes enable row level security;
alter table public.reviews enable row level security;

create policy "Anyone can view courses"
  on public.courses for select to authenticated using (true);
create policy "Anyone can view professor courses"
  on public.professor_courses for select to authenticated using (true);
create policy "Anyone can view professors"
  on public.professors for select to authenticated using (true);
create policy "Anyone can view reviews"
  on public.reviews for select to authenticated using (true);

create policy "Authenticated users can insert courses"
  on public.courses for insert to authenticated with check (true);
create policy "Authenticated users can insert professor courses"
  on public.professor_courses for insert to authenticated with check (true);
create policy "Authenticated users can insert professors"
  on public.professors for insert to authenticated with check (true);

create policy "Authenticated users can update courses"
  on public.courses for update to authenticated using (true) with check (true);
create policy "Authenticated users can update professor courses"
  on public.professor_courses for update to authenticated using (true) with check (true);
create policy "Authenticated users can update professors"
  on public.professors for update to authenticated using (true) with check (true);

create policy "Users can delete their own reviews"
  on public.reviews for delete to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own reviews"
  on public.reviews for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own reviews"
  on public.reviews for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can view all votes"
  on public.review_votes for select to authenticated using (true);
create policy "Users can insert their own votes"
  on public.review_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own votes"
  on public.review_votes for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own votes"
  on public.review_votes for delete to authenticated using (auth.uid() = user_id);

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on function public.update_review_vote_counts() to anon, authenticated, service_role;
grant all on function public.update_updated_at_column() to anon, authenticated, service_role;

grant all on table public.courses to anon, authenticated, service_role;
grant all on table public.professor_courses to anon, authenticated, service_role;
grant all on table public.professors to anon, authenticated, service_role;
grant all on table public.review_votes to anon, authenticated, service_role;
grant all on table public.reviews to anon, authenticated, service_role;

alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;

commit;
