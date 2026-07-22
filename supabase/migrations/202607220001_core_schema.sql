create type public.app_role as enum (
  'participant','coach','supervisor','content_author','professional_reviewer',
  'safety_reviewer','privacy_officer','auditor','system_admin'
);

create type public.content_status as enum (
  'draft','in_review','changes_requested','approved','published','paused','blocked','emergency_withdrawn','retired'
);

create type public.risk_level as enum ('standard','caution','stop');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  is_adult_confirmed boolean not null default false,
  service_status text not null default 'active' check (service_status in ('active','consent_withdrawn','deletion_pending')),
  created_at timestamptz not null default now()
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  coach_id uuid not null references public.profiles(id),
  status text not null check (status in ('draft','active','closed')),
  collective_goal integer not null default 50 check (collective_goal between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.cohort_invites (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0)
);

create table public.cohort_memberships (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  reminder_opt_in boolean not null default false,
  primary key (cohort_id, user_id)
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  scene_code text not null unique check (scene_code ~ '^(PC|FR)-[0-9]{3}$'),
  slug text not null unique,
  relationship text not null check (relationship in ('parent-child','family')),
  category text not null,
  created_at timestamptz not null default now()
);

create table public.scene_versions (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  version integer not null check (version > 0),
  status public.content_status not null default 'draft',
  risk public.risk_level not null,
  payload jsonb not null,
  author_id uuid not null references public.profiles(id),
  professional_reviewer_id uuid references public.profiles(id),
  safety_reviewer_id uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scene_id, version),
  check (professional_reviewer_id is null or professional_reviewer_id <> author_id),
  check (safety_reviewer_id is null or safety_reviewer_id <> author_id),
  check (professional_reviewer_id is null or safety_reviewer_id is null or professional_reviewer_id <> safety_reviewer_id)
);

create table public.training_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scene_version_id uuid not null references public.scene_versions(id),
  idempotency_key uuid not null,
  status text not null check (status in ('active','completed','paused','safety_stopped','abandoned')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table public.training_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null unique references public.training_sessions(id) on delete cascade,
  scene_version_id uuid not null references public.scene_versions(id),
  idempotency_key uuid not null,
  completed_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.follow_up_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  completion_id uuid not null references public.training_completions(id) on delete cascade,
  idempotency_key uuid not null,
  attempted boolean not null,
  observation text not null check (observation in ('helpful','no_change','not_tried','needs_support')),
  hypothesis_result text not null check (hypothesis_result in ('supported','unsupported','uncertain')),
  next_direction text not null check (next_direction in ('repeat','adjust','boundary','seek_help')),
  created_at timestamptz not null default now(),
  unique (completion_id),
  unique (user_id, idempotency_key)
);

create table public.saved_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scene_version_id uuid not null references public.scene_versions(id),
  insight_kind text not null check (insight_kind in ('reframe','expression')),
  saved_at timestamptz not null default now(),
  unique (user_id, scene_version_id, insight_kind)
);

create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  awarded_by uuid references public.profiles(id),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

alter table public.profiles enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_invites enable row level security;
alter table public.cohort_memberships enable row level security;
alter table public.scenes enable row level security;
alter table public.scene_versions enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_completions enable row level security;
alter table public.follow_up_reviews enable row level security;
alter table public.saved_insights enable row level security;
alter table public.user_badges enable row level security;
