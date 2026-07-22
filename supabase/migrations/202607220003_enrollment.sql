alter table public.cohort_invites
add constraint cohort_invites_use_count_within_capacity
check (use_count <= max_uses);

create table public.enrollment_challenges (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.cohort_invites(id),
  phone_hmac text not null check (char_length(phone_hmac) > 0),
  adult_attested boolean not null check (adult_attested),
  privacy_consent_version text not null check (privacy_consent_version = '2026-07-22'),
  service_boundary_version text not null check (service_boundary_version = '2026-07-22'),
  expires_at timestamptz not null,
  used_at timestamptz,
  user_id uuid references auth.users(id) on delete cascade,
  send_count smallint not null default 1 check (send_count between 1 and 3),
  send_window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index enrollment_challenges_invite_phone_created_idx
on public.enrollment_challenges(invite_id, phone_hmac, created_at desc);
alter table public.enrollment_challenges enable row level security;

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  privacy_consent_version text not null,
  service_boundary_version text not null,
  action text not null check (action in ('granted','withdrawn')),
  created_at timestamptz not null default now()
);
alter table public.consent_events enable row level security;

create policy participant_reads_own_consent on public.consent_events
for select to authenticated using (user_id = (select auth.uid()));

create function public.request_enrollment_challenge(
  p_invite_hash text,
  p_phone_hmac text,
  p_adult_attested boolean,
  p_privacy_consent_version text,
  p_service_boundary_version text
)
returns table(
  decision text,
  request_id uuid,
  should_send boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_invite public.cohort_invites%rowtype;
  selected_challenge public.enrollment_challenges%rowtype;
  challenge_exists boolean;
  cohort_status text;
  v_now timestamptz := clock_timestamp();
begin
  if p_adult_attested is not true
    or p_privacy_consent_version <> '2026-07-22'
    or p_service_boundary_version <> '2026-07-22'
  then
    raise exception 'consent_required';
  end if;
  if coalesce(char_length(p_invite_hash), 0) = 0 or coalesce(char_length(p_phone_hmac), 0) = 0 then
    raise exception 'invalid_request';
  end if;

  select * into selected_invite
  from public.cohort_invites
  where code_hash = p_invite_hash;

  if not found then
    decision := 'invalid_invite';
    request_id := null;
    should_send := false;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    selected_invite.id::text || ':' || p_phone_hmac,
    0
  ));

  select * into selected_challenge
  from public.enrollment_challenges
  where invite_id = selected_invite.id
    and phone_hmac = p_phone_hmac
    and used_at is null
    and expires_at > v_now
  order by created_at desc
  limit 1
  for update;
  challenge_exists := found;

  select * into selected_invite
  from public.cohort_invites
  where id = selected_invite.id
  for update;

  if not found
    or selected_invite.expires_at <= v_now
    or selected_invite.use_count >= selected_invite.max_uses
  then
    decision := 'invalid_invite';
    request_id := null;
    should_send := false;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  select status into cohort_status
  from public.cohorts
  where id = selected_invite.cohort_id
  for update;

  if not found or cohort_status <> 'active' then
    decision := 'invalid_invite';
    request_id := null;
    should_send := false;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  if challenge_exists then
    if selected_challenge.send_window_started_at > v_now - interval '10 minutes'
      and selected_challenge.send_count >= 3
    then
      decision := 'rate_limited';
      request_id := selected_challenge.id;
      should_send := false;
      retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from (
          selected_challenge.send_window_started_at + interval '10 minutes' - v_now
        )))::integer
      );
      return next;
      return;
    end if;

    if selected_challenge.last_sent_at > v_now - interval '60 seconds' then
      decision := 'accepted';
      request_id := selected_challenge.id;
      should_send := false;
      retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from (
          selected_challenge.last_sent_at + interval '60 seconds' - v_now
        )))::integer
      );
      return next;
      return;
    end if;

    if selected_challenge.send_window_started_at <= v_now - interval '10 minutes' then
      update public.enrollment_challenges
      set send_count = 1,
          send_window_started_at = v_now,
          last_sent_at = v_now
      where id = selected_challenge.id;
    else
      update public.enrollment_challenges
      set send_count = send_count + 1,
          last_sent_at = v_now
      where id = selected_challenge.id;
    end if;

    decision := 'accepted';
    request_id := selected_challenge.id;
    should_send := true;
    retry_after_seconds := 60;
    return next;
    return;
  end if;

  insert into public.enrollment_challenges(
    invite_id,
    phone_hmac,
    adult_attested,
    privacy_consent_version,
    service_boundary_version,
    expires_at,
    send_window_started_at,
    last_sent_at
  ) values (
    selected_invite.id,
    p_phone_hmac,
    true,
    p_privacy_consent_version,
    p_service_boundary_version,
    v_now + interval '10 minutes',
    v_now,
    v_now
  )
  returning id into request_id;

  decision := 'accepted';
  should_send := true;
  retry_after_seconds := 60;
  return next;
end;
$$;

create function public.complete_enrollment(
  p_request_id uuid,
  p_user_id uuid,
  p_phone_hmac text
)
returns table(cohort_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_challenge public.enrollment_challenges%rowtype;
  selected_invite public.cohort_invites%rowtype;
  cohort_status text;
  profile_status text;
  membership_inserted integer;
  profile_exists boolean;
  membership_exists boolean;
begin
  select * into selected_challenge
  from public.enrollment_challenges
  where id = p_request_id;
  if not found then raise exception 'enrollment_challenge_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    selected_challenge.invite_id::text || ':' || selected_challenge.phone_hmac,
    0
  ));

  select * into selected_challenge
  from public.enrollment_challenges
  where id = p_request_id
  for update;
  if not found then raise exception 'enrollment_challenge_not_found'; end if;

  if selected_challenge.phone_hmac <> p_phone_hmac
    or selected_challenge.adult_attested is not true
    or selected_challenge.privacy_consent_version <> '2026-07-22'
    or selected_challenge.service_boundary_version <> '2026-07-22'
  then
    raise exception 'enrollment_challenge_mismatch';
  end if;
  if selected_challenge.user_id is not null and selected_challenge.user_id <> p_user_id then
    raise exception 'enrollment_challenge_user_mismatch';
  end if;

  select * into selected_invite
  from public.cohort_invites
  where id = selected_challenge.invite_id
  for update;
  if not found then raise exception 'invite_invalid_or_expired'; end if;

  select status into cohort_status
  from public.cohorts
  where id = selected_invite.cohort_id
  for update;
  if not found then raise exception 'cohort_not_active'; end if;

  select service_status into profile_status
  from public.profiles
  where id = p_user_id
  for update;
  profile_exists := found;
  if profile_exists and profile_status = 'deletion_pending' then
    raise exception 'profile_deletion_pending';
  end if;

  if selected_challenge.used_at is not null then
    cohort_id := selected_invite.cohort_id;
    return next;
    return;
  end if;
  if selected_challenge.expires_at <= clock_timestamp() then
    raise exception 'enrollment_challenge_expired';
  end if;
  if selected_invite.expires_at <= clock_timestamp() then
    raise exception 'invite_invalid_or_expired';
  end if;
  if cohort_status <> 'active' then
    raise exception 'cohort_not_active';
  end if;

  perform 1
  from public.cohort_memberships m
  where m.cohort_id = selected_invite.cohort_id and m.user_id = p_user_id
  for update;
  membership_exists := found;
  if not membership_exists and selected_invite.use_count >= selected_invite.max_uses then
    raise exception 'invite_invalid_or_expired';
  end if;

  if profile_exists then
    update public.profiles
    set is_adult_confirmed = true,
        service_status = 'active'
    where id = p_user_id;
  else
    insert into public.profiles(id, display_name, is_adult_confirmed, service_status)
    values (p_user_id, '新成员', true, 'active');
  end if;

  insert into public.cohort_memberships(cohort_id, user_id)
  values (selected_invite.cohort_id, p_user_id)
  on conflict do nothing;
  get diagnostics membership_inserted = row_count;

  if membership_inserted = 1 then
    update public.cohort_invites
    set use_count = use_count + 1
    where id = selected_invite.id and use_count < max_uses;
    if not found then raise exception 'invite_invalid_or_expired'; end if;
  end if;

  insert into public.consent_events(
    user_id,
    privacy_consent_version,
    service_boundary_version,
    action
  ) values (
    p_user_id,
    selected_challenge.privacy_consent_version,
    selected_challenge.service_boundary_version,
    'granted'
  );

  update public.enrollment_challenges
  set used_at = clock_timestamp(), user_id = p_user_id
  where id = selected_challenge.id;

  cohort_id := selected_invite.cohort_id;
  return next;
end;
$$;

grant select on public.consent_events to authenticated;
revoke all on public.enrollment_challenges from public, anon, authenticated;
revoke all on public.consent_events from anon;
revoke insert, update, delete on public.consent_events from authenticated;

revoke all on function public.request_enrollment_challenge(text, text, boolean, text, text)
from public, anon, authenticated;
grant execute on function public.request_enrollment_challenge(text, text, boolean, text, text)
to service_role;

revoke all on function public.complete_enrollment(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.complete_enrollment(uuid, uuid, text)
to service_role;
