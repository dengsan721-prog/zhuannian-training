create schema if not exists private;

create table public.staff_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);
alter table public.staff_roles enable row level security;

create type public.point_reason as enum ('first_scene_completion','review_completion');

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason public.point_reason not null,
  source_id uuid not null,
  idempotency_key uuid not null,
  points smallint not null check (points > 0),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, reason, source_id)
);
alter table public.points_ledger enable row level security;

create function private.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles
    where user_id = (select auth.uid()) and role = required_role
  );
$$;

create function private.is_active_participant()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.cohort_memberships m on m.user_id = p.id
    join public.cohorts c on c.id = m.cohort_id
    where p.id = (select auth.uid()) and p.is_adult_confirmed = true
      and p.service_status = 'active' and c.status = 'active'
  );
$$;

create function private.has_published_scene(p_scene_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.scene_versions
    where scene_id = p_scene_id and status = 'published'
  );
$$;

create function private.coach_can_read_participant(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('coach') and exists (
    select 1 from public.cohort_memberships m
    join public.cohorts c on c.id = m.cohort_id
    where m.user_id = p_user_id and c.coach_id = (select auth.uid())
  );
$$;

create policy participant_owns_completion on public.training_completions
for select to authenticated using (user_id = (select auth.uid()));

create policy participant_owns_training_session on public.training_sessions
for select to authenticated using (user_id = (select auth.uid()));

create policy coach_reads_assigned_completion on public.training_completions
for select to authenticated using (private.coach_can_read_participant(user_id));

create policy participant_owns_saved_insight on public.saved_insights
for select to authenticated using (user_id = (select auth.uid()));

create policy participant_reads_own_profile on public.profiles
for select to authenticated using (id = (select auth.uid()));

create policy participant_owns_review on public.follow_up_reviews
for select to authenticated using (user_id = (select auth.uid()));

create policy participant_reads_own_badge on public.user_badges
for select to authenticated using (user_id = (select auth.uid()));

create policy participant_reads_own_points on public.points_ledger
for select to authenticated using (user_id = (select auth.uid()));

create policy participant_reads_joined_cohort on public.cohorts
for select to authenticated using (
  exists (
    select 1 from public.cohort_memberships m
    where m.cohort_id = cohorts.id and m.user_id = (select auth.uid())
  )
);

create policy participant_reads_own_membership on public.cohort_memberships
for select to authenticated using (user_id = (select auth.uid()));

create policy eligible_participant_reads_published_scene on public.scene_versions
for select to authenticated using (
  status = 'published' and private.is_active_participant()
);

create policy eligible_participant_reads_scene_metadata on public.scenes
for select to authenticated using (
  private.is_active_participant() and private.has_published_scene(id)
);

revoke all on schema private from public, anon, authenticated;
revoke all on public.staff_roles, public.points_ledger from anon;
revoke insert, update, delete on public.points_ledger from authenticated;
