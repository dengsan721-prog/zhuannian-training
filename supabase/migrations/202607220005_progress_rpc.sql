alter table public.training_completions
add column cohort_id uuid
references public.cohorts(id);

create table private.progress_idempotency_keys (
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  event_kind text not null
    check (event_kind in ('completion', 'review')),
  source_id uuid not null,
  bound_at timestamptz not null,
  primary key (user_id, idempotency_key)
);

create function private.lock_participant_state(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_participant_state';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'participant-state:' || p_user_id::text,
      0
    )
  );
end;
$$;

create function private.lock_progress_idempotency_key(
  p_user_id uuid,
  p_idempotency_key uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_progress_request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'progress-event:'
        || p_user_id::text
        || ':'
        || p_idempotency_key::text,
      0
    )
  );
end;
$$;

create function private.lock_cohort_membership_participant_state()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.lock_participant_state(new.user_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.lock_participant_state(old.user_id);
    return old;
  end if;

  if old.user_id = new.user_id then
    perform private.lock_participant_state(new.user_id);
  elsif old.user_id < new.user_id then
    perform private.lock_participant_state(old.user_id);
    perform private.lock_participant_state(new.user_id);
  else
    perform private.lock_participant_state(new.user_id);
    perform private.lock_participant_state(old.user_id);
  end if;

  return new;
end;
$$;

create trigger lock_cohort_membership_participant_state
before insert or update or delete on public.cohort_memberships
for each row
execute function private.lock_cohort_membership_participant_state();

create function private.lock_profile_participant_state()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.lock_participant_state(new.id);
    return new;
  end if;

  if old.is_adult_confirmed is distinct from new.is_adult_confirmed
    or old.service_status is distinct from new.service_status then
    perform private.lock_participant_state(new.id);
  end if;

  return new;
end;
$$;

create trigger lock_profile_participant_state
before insert or update of is_adult_confirmed, service_status
on public.profiles
for each row
execute function private.lock_profile_participant_state();

create function private.lock_cohort_status_participant_state()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member_row record;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  for member_row in
    select membership.user_id
    from public.cohort_memberships as membership
    where membership.cohort_id = old.id
    order by membership.user_id
  loop
    perform private.lock_participant_state(member_row.user_id);
  end loop;

  return new;
end;
$$;

create trigger lock_cohort_status_participant_state
before update of status on public.cohorts
for each row
execute function private.lock_cohort_status_participant_state();

create function private.assert_progress_legacy_integrity()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.training_completions as completion_row
    join public.follow_up_reviews as review_row
      on review_row.user_id = completion_row.user_id
      and review_row.idempotency_key = completion_row.idempotency_key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'legacy_idempotency_conflict';
  end if;

  if exists (
    select 1
    from public.points_ledger as point_row
    where (
      point_row.reason = 'first_scene_completion'
      and not exists (
        select 1
        from public.training_completions as completion_row
        join public.scene_versions as version_row
          on version_row.id = completion_row.scene_version_id
        where completion_row.user_id = point_row.user_id
          and completion_row.idempotency_key = point_row.idempotency_key
          and version_row.scene_id = point_row.source_id
      )
    ) or (
      point_row.reason = 'review_completion'
      and not exists (
        select 1
        from public.follow_up_reviews as review_row
        where review_row.user_id = point_row.user_id
          and review_row.idempotency_key = point_row.idempotency_key
          and review_row.completion_id = point_row.source_id
      )
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'legacy_point_binding_orphan';
  end if;
end;
$$;

create function private.backfill_progress_idempotency_keys()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_progress_legacy_integrity();

  insert into private.progress_idempotency_keys(
    user_id,
    idempotency_key,
    event_kind,
    source_id,
    bound_at
  )
  select
    completion_row.user_id,
    completion_row.idempotency_key,
    'completion',
    completion_row.session_id,
    completion_row.completed_at
  from public.training_completions as completion_row
  on conflict (user_id, idempotency_key) do nothing;

  insert into private.progress_idempotency_keys(
    user_id,
    idempotency_key,
    event_kind,
    source_id,
    bound_at
  )
  select
    review_row.user_id,
    review_row.idempotency_key,
    'review',
    review_row.completion_id,
    review_row.created_at
  from public.follow_up_reviews as review_row
  on conflict (user_id, idempotency_key) do nothing;
end;
$$;

select private.backfill_progress_idempotency_keys();

create function private.coach_can_read_pinned_completion(
  p_user_id uuid,
  p_cohort_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_cohort_id is not null
    and private.has_role('coach')
    and exists (
      select 1
      from public.cohorts as cohort_row
      join public.cohort_memberships as membership
        on membership.cohort_id = cohort_row.id
        and membership.user_id = p_user_id
      where cohort_row.id = p_cohort_id
        and cohort_row.status = 'active'
        and cohort_row.coach_id = (select auth.uid())
    );
$$;

drop policy if exists coach_reads_assigned_completion
on public.training_completions;

create policy coach_reads_assigned_completion
on public.training_completions
for select
to authenticated
using (
  private.coach_can_read_pinned_completion(user_id, cohort_id)
);

create function public.complete_training(
  p_session_id uuid,
  p_idempotency_key uuid
)
returns table(
  "completionId" uuid,
  awarded boolean,
  "pointsDelta" integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_binding private.progress_idempotency_keys%rowtype;
  selected_session public.training_sessions%rowtype;
  selected_completion public.training_completions%rowtype;
  selected_content_status public.content_status;
  selected_risk public.risk_level;
  selected_scene_id uuid;
  selected_cohort_id uuid;
  selected_joined_at timestamptz;
  active_cohort_count integer;
  participant_is_eligible boolean;
  completion_time timestamptz;
  award_id uuid;
begin
  if p_session_id is null or p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_progress_request';
  end if;

  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  perform private.lock_participant_state(current_user_id);
  perform private.lock_progress_idempotency_key(
    current_user_id,
    p_idempotency_key
  );

  select binding_row.*
  into selected_binding
  from private.progress_idempotency_keys as binding_row
  where binding_row.user_id = current_user_id
    and binding_row.idempotency_key = p_idempotency_key;

  if found then
    if selected_binding.event_kind <> 'completion'
      or selected_binding.source_id <> p_session_id then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    select completion_row.*
    into selected_completion
    from public.training_completions as completion_row
    where completion_row.user_id = current_user_id
      and completion_row.session_id = p_session_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'database_integrity_failure';
    end if;

    "completionId" := selected_completion.id;
    awarded := false;
    "pointsDelta" := 0;
    return next;
    return;
  end if;

  select session_row.*
  into selected_session
  from public.training_sessions as session_row
  where session_row.id = p_session_id
    and session_row.user_id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'session_not_found';
  end if;

  if selected_session.status = 'completed' then
    select completion_row.*
    into selected_completion
    from public.training_completions as completion_row
    where completion_row.user_id = current_user_id
      and completion_row.session_id = p_session_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'database_integrity_failure';
    end if;

    insert into private.progress_idempotency_keys(
      user_id,
      idempotency_key,
      event_kind,
      source_id,
      bound_at
    ) values (
      current_user_id,
      p_idempotency_key,
      'completion',
      p_session_id,
      pg_catalog.clock_timestamp()
    );

    "completionId" := selected_completion.id;
    awarded := false;
    "pointsDelta" := 0;
    return next;
    return;
  end if;

  if selected_session.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'session_not_completable';
  end if;

  select profile_row.is_adult_confirmed
      and profile_row.service_status = 'active'
  into participant_is_eligible
  from public.profiles as profile_row
  where profile_row.id = current_user_id;

  if participant_is_eligible is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = 'session_not_completable';
  end if;

  select
    count(*)::integer,
    (array_agg(cohort_row.id order by cohort_row.id))[1],
    min(membership.joined_at)
  into
    active_cohort_count,
    selected_cohort_id,
    selected_joined_at
  from public.cohort_memberships as membership
  join public.cohorts as cohort_row
    on cohort_row.id = membership.cohort_id
  where membership.user_id = current_user_id
    and cohort_row.status = 'active';

  if active_cohort_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'cohort_context_ambiguous';
  end if;

  if active_cohort_count <> 1
    or selected_joined_at > selected_session.started_at then
    raise exception using
      errcode = 'P0001',
      message = 'session_not_completable';
  end if;

  select
    version_row.status,
    version_row.risk,
    version_row.scene_id
  into
    selected_content_status,
    selected_risk,
    selected_scene_id
  from public.scene_versions as version_row
  where version_row.id = selected_session.scene_version_id;

  completion_time := pg_catalog.clock_timestamp();

  if selected_content_status is distinct from 'published'::public.content_status
    or selected_risk is null
    or selected_risk = 'stop'::public.risk_level
    or selected_session.expires_at <= completion_time then
    raise exception using
      errcode = 'P0001',
      message = 'session_not_completable';
  end if;

  update public.training_sessions
  set status = 'completed',
      completed_at = completion_time
  where id = selected_session.id;

  insert into public.training_completions(
    user_id,
    session_id,
    scene_version_id,
    cohort_id,
    idempotency_key,
    completed_at
  ) values (
    current_user_id,
    selected_session.id,
    selected_session.scene_version_id,
    selected_cohort_id,
    p_idempotency_key,
    completion_time
  )
  returning * into selected_completion;

  insert into private.progress_idempotency_keys(
    user_id,
    idempotency_key,
    event_kind,
    source_id,
    bound_at
  ) values (
    current_user_id,
    p_idempotency_key,
    'completion',
    selected_session.id,
    completion_time
  );

  insert into public.points_ledger(
    user_id,
    reason,
    source_id,
    idempotency_key,
    points,
    created_at
  ) values (
    current_user_id,
    'first_scene_completion',
    selected_scene_id,
    p_idempotency_key,
    10,
    completion_time
  )
  on conflict (user_id, reason, source_id) do nothing
  returning id into award_id;

  "completionId" := selected_completion.id;
  awarded := award_id is not null;
  "pointsDelta" := case when award_id is null then 0 else 10 end;
  return next;
end;
$$;

create function public.complete_training_review(
  p_completion_id uuid,
  p_attempted boolean,
  p_observation text,
  p_hypothesis_result text,
  p_next_direction text,
  p_idempotency_key uuid
)
returns table(
  "reviewId" uuid,
  awarded boolean,
  "pointsDelta" integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_binding private.progress_idempotency_keys%rowtype;
  selected_completion public.training_completions%rowtype;
  selected_review public.follow_up_reviews%rowtype;
  review_time timestamptz;
  award_id uuid;
begin
  if p_completion_id is null
    or p_attempted is null
    or p_observation is null
    or p_observation not in (
      'helpful',
      'no_change',
      'not_tried',
      'needs_support'
    )
    or p_hypothesis_result is null
    or p_hypothesis_result not in (
      'supported',
      'unsupported',
      'uncertain'
    )
    or p_next_direction is null
    or p_next_direction not in (
      'repeat',
      'adjust',
      'boundary',
      'seek_help'
    )
    or p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_review_request';
  end if;

  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  perform private.lock_participant_state(current_user_id);

  if not private.is_active_participant() then
    raise exception using
      errcode = 'P0001',
      message = 'active_adult_membership_required';
  end if;

  perform private.lock_progress_idempotency_key(
    current_user_id,
    p_idempotency_key
  );

  select binding_row.*
  into selected_binding
  from private.progress_idempotency_keys as binding_row
  where binding_row.user_id = current_user_id
    and binding_row.idempotency_key = p_idempotency_key;

  if found then
    if selected_binding.event_kind <> 'review'
      or selected_binding.source_id <> p_completion_id then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    select review_row.*
    into selected_review
    from public.follow_up_reviews as review_row
    where review_row.user_id = current_user_id
      and review_row.completion_id = p_completion_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'database_integrity_failure';
    end if;

    if selected_review.attempted is distinct from p_attempted
      or selected_review.observation is distinct from p_observation
      or selected_review.hypothesis_result is distinct from p_hypothesis_result
      or selected_review.next_direction is distinct from p_next_direction then
      raise exception using
        errcode = 'P0001',
        message = 'review_already_recorded';
    end if;

    "reviewId" := selected_review.id;
    awarded := false;
    "pointsDelta" := 0;
    return next;
    return;
  end if;

  select completion_row.*
  into selected_completion
  from public.training_completions as completion_row
  where completion_row.id = p_completion_id
    and completion_row.user_id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'completion_not_found';
  end if;

  select review_row.*
  into selected_review
  from public.follow_up_reviews as review_row
  where review_row.user_id = current_user_id
    and review_row.completion_id = p_completion_id;

  if found then
    if selected_review.attempted is distinct from p_attempted
      or selected_review.observation is distinct from p_observation
      or selected_review.hypothesis_result is distinct from p_hypothesis_result
      or selected_review.next_direction is distinct from p_next_direction then
      raise exception using
        errcode = 'P0001',
        message = 'review_already_recorded';
    end if;

    insert into private.progress_idempotency_keys(
      user_id,
      idempotency_key,
      event_kind,
      source_id,
      bound_at
    ) values (
      current_user_id,
      p_idempotency_key,
      'review',
      p_completion_id,
      pg_catalog.clock_timestamp()
    );

    "reviewId" := selected_review.id;
    awarded := false;
    "pointsDelta" := 0;
    return next;
    return;
  end if;

  review_time := pg_catalog.clock_timestamp();

  insert into public.follow_up_reviews(
    user_id,
    completion_id,
    idempotency_key,
    attempted,
    observation,
    hypothesis_result,
    next_direction,
    created_at
  ) values (
    current_user_id,
    p_completion_id,
    p_idempotency_key,
    p_attempted,
    p_observation,
    p_hypothesis_result,
    p_next_direction,
    review_time
  )
  returning * into selected_review;

  insert into private.progress_idempotency_keys(
    user_id,
    idempotency_key,
    event_kind,
    source_id,
    bound_at
  ) values (
    current_user_id,
    p_idempotency_key,
    'review',
    p_completion_id,
    review_time
  );

  insert into public.points_ledger(
    user_id,
    reason,
    source_id,
    idempotency_key,
    points,
    created_at
  ) values (
    current_user_id,
    'review_completion',
    p_completion_id,
    p_idempotency_key,
    5,
    review_time
  )
  returning id into award_id;

  "reviewId" := selected_review.id;
  awarded := true;
  "pointsDelta" := 5;
  return next;
end;
$$;

create function public.set_saved_insight(
  p_scene_version_id uuid,
  p_kind text,
  p_saved boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  if p_scene_version_id is null
    or p_kind is null
    or p_kind not in ('reframe', 'expression')
    or p_saved is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_saved_insight_request';
  end if;

  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  if p_saved is false then
    delete from public.saved_insights
    where user_id = current_user_id
      and scene_version_id = p_scene_version_id
      and insight_kind = p_kind;
    return false;
  end if;

  perform private.lock_participant_state(current_user_id);

  if not private.is_active_participant()
    or not exists (
      select 1
      from public.training_completions as completion_row
      join public.scene_versions as version_row
        on version_row.id = completion_row.scene_version_id
      where completion_row.user_id = current_user_id
        and completion_row.scene_version_id = p_scene_version_id
        and version_row.status = 'published'
        and version_row.risk <> 'stop'
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'insight_not_savable';
  end if;

  insert into public.saved_insights(
    user_id,
    scene_version_id,
    insight_kind,
    saved_at
  ) values (
    current_user_id,
    p_scene_version_id,
    p_kind,
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id, scene_version_id, insight_kind)
  do nothing;

  return true;
end;
$$;

create function public.list_saved_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  participant_is_eligible boolean;
  saved_items jsonb;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  select private.is_active_participant()
  into participant_is_eligible;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sceneVersionId', saved_row.scene_version_id,
        'kind', saved_row.insight_kind,
        'savedAt', saved_row.saved_at,
        'route', case
          when version_row.status = 'emergency_withdrawn'
            or version_row.risk = 'stop'
          then 'safety-stop'
          when participant_is_eligible
            and version_row.status = 'published'
          then 'available'
          else 'content-update'
        end
      )
      order by
        saved_row.saved_at desc,
        saved_row.scene_version_id,
        saved_row.insight_kind
    ),
    '[]'::jsonb
  )
  into saved_items
  from public.saved_insights as saved_row
  join public.scene_versions as version_row
    on version_row.id = saved_row.scene_version_id
  where saved_row.user_id = current_user_id;

  return saved_items;
end;
$$;

create function public.get_pending_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  pending_prompt jsonb;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  select jsonb_build_object(
    'completionId', completion_row.id,
    'sceneVersionId', completion_row.scene_version_id,
    'completedAt', completion_row.completed_at
  )
  into pending_prompt
  from public.training_completions as completion_row
  where completion_row.user_id = current_user_id
    and not exists (
      select 1
      from public.follow_up_reviews as review_row
      where review_row.completion_id = completion_row.id
    )
  order by completion_row.completed_at, completion_row.id
  limit 1;

  return pending_prompt;
end;
$$;

create function public.get_private_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  total_points integer;
  completed_scene_count integer;
  review_count integer;
  week_completion_count integer;
  first_scene_at timestamptz;
  five_scenes_at timestamptz;
  ten_reviews_at timestamptz;
  badge_items jsonb := '[]'::jsonb;
  surprise_items jsonb := '[]'::jsonb;
  participant_is_eligible boolean;
  active_cohort_count integer;
  selected_cohort_id uuid;
  active_member_count integer;
  aggregate_scene_count integer;
  aggregate_goal integer;
  class_aggregate jsonb := 'null'::jsonb;
  week_boundary timestamptz;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  select coalesce(sum(point_row.points), 0)::integer
  into total_points
  from public.points_ledger as point_row
  where point_row.user_id = current_user_id;

  select count(distinct version_row.scene_id)::integer
  into completed_scene_count
  from public.training_completions as completion_row
  join public.scene_versions as version_row
    on version_row.id = completion_row.scene_version_id
  where completion_row.user_id = current_user_id;

  select count(*)::integer
  into review_count
  from public.follow_up_reviews as review_row
  where review_row.user_id = current_user_id;

  week_boundary := (
    pg_catalog.date_trunc(
      'week',
      pg_catalog.statement_timestamp()
        at time zone 'Asia/Shanghai'
    ) at time zone 'Asia/Shanghai'
  );

  select count(*)::integer
  into week_completion_count
  from public.training_completions as completion_row
  where completion_row.user_id = current_user_id
    and completion_row.completed_at >= week_boundary;

  if completed_scene_count >= 1 then
    select min(first_completion.first_at)
    into first_scene_at
    from (
      select
        version_row.scene_id,
        min(completion_row.completed_at) as first_at
      from public.training_completions as completion_row
      join public.scene_versions as version_row
        on version_row.id = completion_row.scene_version_id
      where completion_row.user_id = current_user_id
      group by version_row.scene_id
    ) as first_completion;

    badge_items := badge_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'first-scene',
        'label', '第一次转念',
        'awardedAt', first_scene_at
      )
    );
  end if;

  if completed_scene_count >= 5 then
    select ordered_scene.first_at
    into five_scenes_at
    from (
      select
        version_row.scene_id,
        min(completion_row.completed_at) as first_at
      from public.training_completions as completion_row
      join public.scene_versions as version_row
        on version_row.id = completion_row.scene_version_id
      where completion_row.user_id = current_user_id
      group by version_row.scene_id
      order by first_at, version_row.scene_id
      offset 4
      limit 1
    ) as ordered_scene;

    badge_items := badge_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'five-scenes',
        'label', '看见五个新可能',
        'awardedAt', five_scenes_at
      )
    );

    surprise_items := surprise_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'five-scene-observation-card',
        'label', '隐藏观察卡'
      )
    );
  end if;

  if review_count >= 10 then
    select ordered_review.created_at
    into ten_reviews_at
    from public.follow_up_reviews as ordered_review
    where ordered_review.user_id = current_user_id
    order by ordered_review.created_at, ordered_review.id
    offset 9
    limit 1;

    badge_items := badge_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'ten-reviews',
        'label', '完成十次复盘',
        'awardedAt', ten_reviews_at
      )
    );

    surprise_items := surprise_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'ten-review-family-lens',
        'label', '家庭关系多面镜'
      )
    );
  end if;

  select profile_row.is_adult_confirmed
      and profile_row.service_status = 'active'
  into participant_is_eligible
  from public.profiles as profile_row
  where profile_row.id = current_user_id;

  if participant_is_eligible is true then
    select
      count(*)::integer,
      (array_agg(cohort_row.id order by cohort_row.id))[1]
    into active_cohort_count, selected_cohort_id
    from public.cohort_memberships as membership
    join public.cohorts as cohort_row
      on cohort_row.id = membership.cohort_id
    where membership.user_id = current_user_id
      and cohort_row.status = 'active';
  else
    active_cohort_count := 0;
    selected_cohort_id := null;
  end if;

  if active_cohort_count = 1 then
    select count(*)::integer
    into active_member_count
    from public.cohort_memberships as membership
    join public.profiles as profile_row
      on profile_row.id = membership.user_id
    join public.cohorts as cohort_row
      on cohort_row.id = membership.cohort_id
    where membership.cohort_id = selected_cohort_id
      and cohort_row.status = 'active'
      and profile_row.is_adult_confirmed
      and profile_row.service_status = 'active';

    if active_member_count >= 3 then
      select count(*)::integer
      into aggregate_scene_count
      from (
        select distinct
          completion_row.user_id,
          version_row.scene_id
        from public.training_completions as completion_row
        join public.scene_versions as version_row
          on version_row.id = completion_row.scene_version_id
        join public.cohort_memberships as membership
          on membership.cohort_id = selected_cohort_id
          and membership.user_id = completion_row.user_id
        join public.profiles as profile_row
          on profile_row.id = completion_row.user_id
        where completion_row.cohort_id = selected_cohort_id
          and profile_row.is_adult_confirmed
          and profile_row.service_status = 'active'
      ) as distinct_member_scene;

      select cohort_row.collective_goal
      into aggregate_goal
      from public.cohorts as cohort_row
      where cohort_row.id = selected_cohort_id
        and cohort_row.status = 'active';

      class_aggregate := jsonb_build_object(
        'completedScenes', aggregate_scene_count,
        'activeMembers', active_member_count,
        'collectiveGoal', aggregate_goal,
        'goalReached', aggregate_scene_count >= aggregate_goal
      );
    end if;
  end if;

  return jsonb_build_object(
    'points', total_points,
    'completedScenes', completed_scene_count,
    'reviewsCompleted', review_count,
    'thisWeekCompletions', week_completion_count,
    'badges', badge_items,
    'unlockedSurprises', surprise_items,
    'classAggregate', class_aggregate
  );
end;
$$;

revoke all on table private.progress_idempotency_keys
from public, anon, authenticated;

revoke all on function private.lock_participant_state(uuid)
from public, anon, authenticated;
revoke all on function private.lock_progress_idempotency_key(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.lock_cohort_membership_participant_state()
from public, anon, authenticated;
revoke all on function private.lock_profile_participant_state()
from public, anon, authenticated;
revoke all on function private.lock_cohort_status_participant_state()
from public, anon, authenticated;
revoke all on function private.assert_progress_legacy_integrity()
from public, anon, authenticated;
revoke all on function private.backfill_progress_idempotency_keys()
from public, anon, authenticated;
revoke all on function private.coach_can_read_pinned_completion(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.coach_can_read_pinned_completion(uuid, uuid)
to authenticated;

revoke all on function public.complete_training(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_training_review(
  uuid,
  boolean,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function public.set_saved_insight(uuid, text, boolean)
from public, anon, authenticated;
revoke all on function public.list_saved_insights()
from public, anon, authenticated;
revoke all on function public.get_pending_review()
from public, anon, authenticated;
revoke all on function public.get_private_progress()
from public, anon, authenticated;

grant execute on function public.complete_training(uuid, uuid)
to authenticated;
grant execute on function public.complete_training_review(
  uuid,
  boolean,
  text,
  text,
  text,
  uuid
) to authenticated;
grant execute on function public.set_saved_insight(uuid, text, boolean)
to authenticated;
grant execute on function public.list_saved_insights()
to authenticated;
grant execute on function public.get_pending_review()
to authenticated;
grant execute on function public.get_private_progress()
to authenticated;

revoke all on
  public.training_completions,
  public.follow_up_reviews,
  public.saved_insights,
  public.points_ledger,
  public.user_badges
from public, anon, authenticated;

grant select on
  public.training_completions,
  public.follow_up_reviews,
  public.saved_insights,
  public.points_ledger,
  public.user_badges
to authenticated;
