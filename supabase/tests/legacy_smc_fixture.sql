insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '11000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'legacy-smc@example.test',
  '2025-01-01 00:00:00+00',
  '2025-01-01 00:00:00+00'
);

insert into public.professors (id, name, created_at, updated_at)
values (
  '21000000-0000-4000-8000-000000000001',
  'Legacy SMC Professor',
  '2025-01-02 00:00:00+00',
  '2025-01-03 00:00:00+00'
);

insert into public.courses (id, code, name, created_at, updated_at)
values (
  '31000000-0000-4000-8000-000000000001',
  'SMC 101',
  'Legacy SMC Course',
  '2025-01-04 00:00:00+00',
  '2025-01-05 00:00:00+00'
);

insert into public.professor_courses (id, professor_id, course_id, created_at)
values (
  '41000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '2025-01-06 00:00:00+00'
);

insert into public.reviews (
  id,
  user_id,
  professor_id,
  course_id,
  rating,
  difficulty,
  homework_amount,
  support_quality,
  attendance_required,
  content,
  created_at,
  updated_at
) values (
  '51000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  5,
  4,
  3,
  2,
  'online',
  'Legacy SMC review content',
  '2025-01-07 00:00:00+00',
  '2025-01-08 00:00:00+00'
);

insert into public.review_votes (
  id, user_id, review_id, vote_type, created_at
) values (
  '61000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'helpful',
  '2025-01-09 00:00:00+00'
);

-- Freeze the exact pre-migration timestamp after the existing vote trigger runs.
alter table public.reviews disable trigger update_reviews_updated_at;
update public.reviews
set updated_at = '2025-01-08 00:00:00+00'
where id = '51000000-0000-4000-8000-000000000001';
alter table public.reviews enable trigger update_reviews_updated_at;
