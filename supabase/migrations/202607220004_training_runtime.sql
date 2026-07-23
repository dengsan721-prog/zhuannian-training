alter table public.training_sessions
add column updated_at timestamptz;

update public.training_sessions
set updated_at = started_at
where updated_at is null;

alter table public.training_sessions
alter column updated_at set default now(),
alter column updated_at set not null;

create function private.touch_training_session_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger touch_training_session_updated_at
before update on public.training_sessions
for each row
when (old is distinct from new)
execute function private.touch_training_session_updated_at();

create function private.resolve_training_session(
  p_session_id uuid,
  p_user_id uuid,
  p_expected_scene_version_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_session public.training_sessions%rowtype;
  selected_content_status public.content_status;
  selected_risk public.risk_level;
  participant_is_eligible boolean;
  checked_at timestamptz;
begin
  select session_row.*
  into selected_session
  from public.training_sessions as session_row
  where session_row.id = p_session_id
    and session_row.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'session_not_found';
  end if;

  if p_expected_scene_version_id is not null
    and selected_session.scene_version_id <> p_expected_scene_version_id then
    raise exception using
      errcode = 'P0001',
      message = 'idempotency_conflict';
  end if;

  if selected_session.status = 'safety_stopped' then
    return 'safety-stop';
  end if;

  if selected_session.status in ('completed', 'abandoned') then
    return 'content-update';
  end if;

  select version_row.status, version_row.risk
  into selected_content_status, selected_risk
  from public.scene_versions as version_row
  where version_row.id = selected_session.scene_version_id;

  select private.is_active_participant()
  into participant_is_eligible;

  checked_at := pg_catalog.clock_timestamp();

  if selected_content_status = 'emergency_withdrawn'
    or selected_risk = 'stop' then
    update public.training_sessions
    set status = 'safety_stopped'
    where id = selected_session.id
      and status in ('active', 'paused');
    return 'safety-stop';
  end if;

  if selected_content_status is distinct from 'published'::public.content_status
    or participant_is_eligible is distinct from true
    or selected_session.expires_at <= checked_at then
    update public.training_sessions
    set status = 'abandoned'
    where id = selected_session.id
      and status in ('active', 'paused');
    return 'content-update';
  end if;

  if selected_session.status = 'paused' then
    update public.training_sessions
    set status = 'active'
    where id = selected_session.id
      and status = 'paused';
  end if;

  return 'continue';
end;
$$;

create function public.start_training(
  p_scene_version_id uuid,
  p_idempotency_key uuid
)
returns table("sessionId" uuid, route text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_session_id uuid;
  selected_risk public.risk_level;
  started_at_value timestamptz;
begin
  if p_scene_version_id is null or p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_training_request';
  end if;

  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'training-start:'
        || current_user_id::text
        || ':'
        || p_idempotency_key::text,
      0
    )
  );

  select session_row.id
  into selected_session_id
  from public.training_sessions as session_row
  where session_row.user_id = current_user_id
    and session_row.idempotency_key = p_idempotency_key;

  if found then
    "sessionId" := selected_session_id;
    route := private.resolve_training_session(
      selected_session_id,
      current_user_id,
      p_scene_version_id
    );
    return next;
    return;
  end if;

  if not private.is_active_participant() then
    raise exception using
      errcode = 'P0001',
      message = 'active_adult_membership_required';
  end if;

  select version_row.risk
  into selected_risk
  from public.scene_versions as version_row
  where version_row.id = p_scene_version_id
    and version_row.status = 'published'
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'scene_unavailable';
  end if;

  started_at_value := pg_catalog.clock_timestamp();
  selected_session_id := pg_catalog.gen_random_uuid();

  insert into public.training_sessions(
    id,
    user_id,
    scene_version_id,
    idempotency_key,
    status,
    started_at,
    expires_at,
    updated_at
  )
  values (
    selected_session_id,
    current_user_id,
    p_scene_version_id,
    p_idempotency_key,
    case when selected_risk = 'stop' then 'safety_stopped' else 'active' end,
    started_at_value,
    started_at_value + interval '24 hours',
    started_at_value
  );

  "sessionId" := selected_session_id;
  route := private.resolve_training_session(
    selected_session_id,
    current_user_id,
    p_scene_version_id
  );
  return next;
end;
$$;

create function public.check_training_session(p_session_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  if p_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_session_request';
  end if;

  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  return private.resolve_training_session(
    p_session_id,
    current_user_id,
    null
  );
end;
$$;

revoke all on function private.touch_training_session_updated_at() from public, anon, authenticated;
revoke all on function private.resolve_training_session(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_training(uuid, uuid) from public, anon, authenticated;
revoke all on function public.check_training_session(uuid) from public, anon, authenticated;

grant execute on function public.start_training(uuid, uuid) to authenticated;
grant execute on function public.check_training_session(uuid) to authenticated;

revoke insert, update, delete on public.training_sessions from authenticated;
