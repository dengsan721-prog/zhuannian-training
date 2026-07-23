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
  user_id uuid references auth.users(id) on delete set null,
  send_count smallint not null default 0 check (send_count between 0 and 3),
  send_window_started_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index enrollment_challenges_invite_phone_created_idx
on public.enrollment_challenges(invite_id, phone_hmac, created_at desc);
alter table public.enrollment_challenges enable row level security;

create table public.enrollment_sms_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null
    references public.enrollment_challenges(id) on delete restrict,
  phone_hmac text not null check (char_length(phone_hmac) > 0),
  status text not null check (status in ('pending', 'sent', 'failed', 'unknown')),
  reserved_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (
    (status = 'pending' and finalized_at is null)
    or (status <> 'pending' and finalized_at is not null)
  )
);
create unique index enrollment_sms_one_pending_per_phone_idx
on public.enrollment_sms_delivery_attempts(phone_hmac)
where status = 'pending';
create index enrollment_sms_phone_status_time_idx
on public.enrollment_sms_delivery_attempts(phone_hmac, status, finalized_at desc);
alter table public.enrollment_sms_delivery_attempts enable row level security;

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
  delivery_attempt_id uuid,
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
  selected_attempt public.enrollment_sms_delivery_attempts%rowtype;
  cohort_status text;
  successful_sends integer;
  v_now timestamptz;
begin
  if p_adult_attested is not true
    or p_privacy_consent_version is distinct from '2026-07-22'
    or p_service_boundary_version is distinct from '2026-07-22'
  then
    raise exception 'consent_required';
  end if;
  if coalesce(char_length(p_invite_hash), 0) = 0
    or coalesce(char_length(p_phone_hmac), 0) = 0
  then
    raise exception 'invalid_request';
  end if;

  -- Reject an invalid invite before touching phone-scoped OTP state.
  select i.* into selected_invite
  from public.cohort_invites i
  join public.cohorts c on c.id = i.cohort_id
  where i.code_hash = p_invite_hash
    and i.expires_at > clock_timestamp()
    and i.use_count < i.max_uses
    and c.status = 'active';
  if not found then
    decision := 'invalid_invite';
    request_id := null;
    delivery_attempt_id := null;
    should_send := false;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'enrollment-phone:' || p_phone_hmac,
    0
  ));

  select * into selected_invite
  from public.cohort_invites
  where id = selected_invite.id
    and code_hash = p_invite_hash
  for update;
  if not found then
    decision := 'invalid_invite';
    request_id := null;
    delivery_attempt_id := null;
    should_send := false;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  select status into cohort_status
  from public.cohorts
  where id = selected_invite.cohort_id
  for update;

  -- Locks may wait. All expiry, cooldown and rolling-window decisions use this refreshed time.
  v_now := clock_timestamp();
  if selected_invite.expires_at <= v_now
    or selected_invite.use_count >= selected_invite.max_uses
    or not found
    or cohort_status <> 'active'
  then
    decision := 'invalid_invite';
    request_id := null;
    delivery_attempt_id := null;
    should_send := false;
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  -- An interrupted provider call remains fail-closed for the entire OTP lifetime.
  update public.enrollment_sms_delivery_attempts
  set status = 'unknown',
      finalized_at = v_now
  where phone_hmac = p_phone_hmac
    and status = 'pending'
    and reserved_at <= v_now - interval '10 minutes';

  select a.* into selected_attempt
  from public.enrollment_sms_delivery_attempts a
  where a.phone_hmac = p_phone_hmac
    and a.status = 'pending'
  order by a.reserved_at desc
  limit 1
  for update;
  if found then
    decision := 'delivery_pending';
    request_id := selected_attempt.challenge_id;
    delivery_attempt_id := selected_attempt.id;
    should_send := false;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (
        selected_attempt.reserved_at + interval '10 minutes' - v_now
      )))::integer
    );
    return next;
    return;
  end if;

  select count(*) into successful_sends
  from public.enrollment_sms_delivery_attempts a
  where a.phone_hmac = p_phone_hmac
    and a.status = 'sent'
    and a.finalized_at > v_now - interval '10 minutes';

  select a.* into selected_attempt
  from public.enrollment_sms_delivery_attempts a
  where a.phone_hmac = p_phone_hmac
    and a.status = 'sent'
    and a.finalized_at > v_now - interval '10 minutes'
  order by a.finalized_at desc
  limit 1;

  if successful_sends >= 3 then
    decision := 'rate_limited';
    request_id := selected_attempt.challenge_id;
    delivery_attempt_id := selected_attempt.id;
    should_send := false;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (
        (
          select min(a.finalized_at)
          from public.enrollment_sms_delivery_attempts a
          where a.phone_hmac = p_phone_hmac
            and a.status = 'sent'
            and a.finalized_at > v_now - interval '10 minutes'
        ) + interval '10 minutes' - v_now
      )))::integer
    );
    return next;
    return;
  end if;

  if selected_attempt.id is not null
    and selected_attempt.finalized_at > v_now - interval '60 seconds'
  then
    select * into selected_challenge
    from public.enrollment_challenges
    where id = selected_attempt.challenge_id;
    if found
      and selected_challenge.invite_id = selected_invite.id
      and selected_challenge.used_at is null
      and selected_challenge.expires_at > v_now
    then
      decision := 'accepted';
    else
      decision := 'rate_limited';
    end if;
    request_id := selected_attempt.challenge_id;
    delivery_attempt_id := selected_attempt.id;
    should_send := false;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (
        selected_attempt.finalized_at + interval '60 seconds' - v_now
      )))::integer
    );
    return next;
    return;
  end if;

  select * into selected_challenge
  from public.enrollment_challenges
  where invite_id = selected_invite.id
    and phone_hmac = p_phone_hmac
    and used_at is null
    and (last_sent_at is null or expires_at > v_now)
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.enrollment_challenges(
      invite_id,
      phone_hmac,
      adult_attested,
      privacy_consent_version,
      service_boundary_version,
      expires_at
    ) values (
      selected_invite.id,
      p_phone_hmac,
      true,
      p_privacy_consent_version,
      p_service_boundary_version,
      v_now
    )
    returning * into selected_challenge;
  end if;

  insert into public.enrollment_sms_delivery_attempts(
    challenge_id,
    phone_hmac,
    status,
    reserved_at
  ) values (
    selected_challenge.id,
    p_phone_hmac,
    'pending',
    v_now
  )
  returning id into delivery_attempt_id;

  decision := 'accepted';
  request_id := selected_challenge.id;
  should_send := true;
  retry_after_seconds := 60;
  return next;
end;
$$;

create function public.finalize_enrollment_otp_delivery(
  p_delivery_attempt_id uuid,
  p_request_id uuid,
  p_status text
)
returns table(delivery_status text, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_attempt public.enrollment_sms_delivery_attempts%rowtype;
  selected_challenge public.enrollment_challenges%rowtype;
  v_now timestamptz;
begin
  if p_delivery_attempt_id is null or p_request_id is null then
    raise exception 'invalid_request';
  end if;
  if p_status is null
    or btrim(p_status) = ''
    or p_status not in ('sent', 'failed')
  then
    raise exception 'invalid_delivery_status';
  end if;

  select * into selected_attempt
  from public.enrollment_sms_delivery_attempts
  where id = p_delivery_attempt_id;
  if not found then raise exception 'delivery_attempt_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'enrollment-phone:' || selected_attempt.phone_hmac,
    0
  ));

  select * into selected_attempt
  from public.enrollment_sms_delivery_attempts
  where id = p_delivery_attempt_id
  for update;
  if not found or selected_attempt.challenge_id is distinct from p_request_id then
    raise exception 'delivery_attempt_mismatch';
  end if;

  if selected_attempt.status <> 'pending' then
    if selected_attempt.status is distinct from p_status then
      raise exception 'delivery_status_conflict';
    end if;
    delivery_status := selected_attempt.status;
    request_id := selected_attempt.challenge_id;
    return next;
    return;
  end if;

  v_now := clock_timestamp();
  if selected_attempt.reserved_at <= v_now - interval '10 minutes' then
    update public.enrollment_sms_delivery_attempts
    set status = 'unknown',
        finalized_at = v_now
    where id = selected_attempt.id;

    delivery_status := 'unknown';
    request_id := selected_attempt.challenge_id;
    return next;
    return;
  end if;

  if p_status = 'failed' then
    update public.enrollment_sms_delivery_attempts
    set status = 'failed',
        finalized_at = v_now
    where id = selected_attempt.id;
  else
    select * into selected_challenge
    from public.enrollment_challenges
    where id = p_request_id
    for update;
    if not found or selected_challenge.phone_hmac <> selected_attempt.phone_hmac then
      raise exception 'delivery_attempt_mismatch';
    end if;

    update public.enrollment_sms_delivery_attempts
    set status = 'sent',
        finalized_at = v_now
    where id = selected_attempt.id;

    update public.enrollment_challenges
    set send_count = case
          when send_window_started_at is null
            or send_window_started_at <= v_now - interval '10 minutes'
          then 1
          else send_count + 1
        end,
        send_window_started_at = case
          when send_window_started_at is null
            or send_window_started_at <= v_now - interval '10 minutes'
          then v_now
          else send_window_started_at
        end,
        last_sent_at = v_now,
        expires_at = v_now + interval '10 minutes'
    where id = selected_challenge.id;
  end if;

  delivery_status := p_status;
  request_id := selected_attempt.challenge_id;
  return next;
end;
$$;

create function public.bind_enrollment_challenge_user(
  p_request_id uuid,
  p_user_id uuid,
  p_phone_hmac text
)
returns table(bound boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_challenge public.enrollment_challenges%rowtype;
begin
  if p_request_id is null
    or p_user_id is null
    or coalesce(char_length(p_phone_hmac), 0) = 0
  then
    raise exception 'invalid_request';
  end if;

  select * into selected_challenge
  from public.enrollment_challenges
  where id = p_request_id;
  if not found then raise exception 'enrollment_challenge_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'enrollment-phone:' || selected_challenge.phone_hmac,
    0
  ));

  select * into selected_challenge
  from public.enrollment_challenges
  where id = p_request_id
  for update;
  if not found then raise exception 'enrollment_challenge_not_found'; end if;
  if selected_challenge.phone_hmac is distinct from p_phone_hmac
    or selected_challenge.used_at is not null
  then
    raise exception 'enrollment_challenge_mismatch';
  end if;
  if selected_challenge.user_id is not null
    and selected_challenge.user_id is distinct from p_user_id
  then
    raise exception 'enrollment_challenge_user_mismatch';
  end if;

  update public.enrollment_challenges
  set user_id = p_user_id
  where id = selected_challenge.id
    and user_id is null;

  bound := true;
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
  v_now timestamptz;
begin
  if p_request_id is null
    or p_user_id is null
    or coalesce(char_length(p_phone_hmac), 0) = 0
  then
    raise exception 'invalid_request';
  end if;

  select * into selected_challenge
  from public.enrollment_challenges
  where id = p_request_id;
  if not found then raise exception 'enrollment_challenge_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'enrollment-phone:' || selected_challenge.phone_hmac,
    0
  ));

  select * into selected_challenge
  from public.enrollment_challenges
  where id = p_request_id
  for update;
  if not found then raise exception 'enrollment_challenge_not_found'; end if;

  if selected_challenge.phone_hmac is distinct from p_phone_hmac
    or selected_challenge.adult_attested is not true
    or selected_challenge.privacy_consent_version is distinct from '2026-07-22'
    or selected_challenge.service_boundary_version is distinct from '2026-07-22'
  then
    raise exception 'enrollment_challenge_mismatch';
  end if;
  if selected_challenge.used_at is not null then
    if selected_challenge.user_id is null
      or selected_challenge.user_id is distinct from p_user_id
    then
      raise exception 'enrollment_challenge_user_mismatch';
    end if;
  elsif selected_challenge.user_id is not null
    and selected_challenge.user_id is distinct from p_user_id
  then
      raise exception 'enrollment_challenge_user_mismatch';
  end if;
  if selected_challenge.last_sent_at is null then
    raise exception 'enrollment_challenge_not_sent';
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
    perform 1
    from public.cohort_memberships m
    where m.cohort_id = selected_invite.cohort_id
      and m.user_id = p_user_id
    for update;
    if not found then
      raise exception 'enrollment_membership_missing';
    end if;

    cohort_id := selected_invite.cohort_id;
    return next;
    return;
  end if;

  v_now := clock_timestamp();
  if selected_challenge.expires_at <= v_now then
    raise exception 'enrollment_challenge_expired';
  end if;
  if selected_invite.expires_at <= v_now then
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
  set used_at = clock_timestamp(),
      user_id = p_user_id
  where id = selected_challenge.id;

  cohort_id := selected_invite.cohort_id;
  return next;
end;
$$;

revoke all on public.consent_events from public, anon, authenticated;
grant select on public.consent_events to authenticated;

revoke all on public.enrollment_challenges from public, anon, authenticated;
revoke all on public.enrollment_sms_delivery_attempts from public, anon, authenticated;

revoke all on function public.request_enrollment_challenge(text, text, boolean, text, text)
from public, anon, authenticated;
grant execute on function public.request_enrollment_challenge(text, text, boolean, text, text)
to service_role;

revoke all on function public.finalize_enrollment_otp_delivery(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.finalize_enrollment_otp_delivery(uuid, uuid, text)
to service_role;

revoke all on function public.bind_enrollment_challenge_user(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.bind_enrollment_challenge_user(uuid, uuid, text)
to service_role;

revoke all on function public.complete_enrollment(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.complete_enrollment(uuid, uuid, text)
to service_role;
