alter table public.training_sessions
add column cohort_id uuid
references public.cohorts(id);

alter table private.progress_idempotency_keys
drop constraint progress_idempotency_keys_event_kind_check;

alter table private.progress_idempotency_keys
add constraint progress_idempotency_keys_event_kind_check
check (
  event_kind in (
    'completion',
    'review',
    'support_ticket',
    'safety_report'
  )
);

create function private.jsonb_has_exact_keys(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(p_value) <> 'object' then false
    else coalesce(
      (
        select pg_catalog.array_agg(
          key_name
          order by key_name collate "C"
        )
        from pg_catalog.jsonb_object_keys(p_value) as key_row(key_name)
      ),
      array[]::text[]
    ) = coalesce(
      (
        select pg_catalog.array_agg(
          required_key
          order by required_key collate "C"
        )
        from pg_catalog.unnest(p_keys) as required_row(required_key)
      ),
      array[]::text[]
    )
  end;
$$;

create function private.is_canonical_uuid_json(p_value jsonb)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~* (
      '^[0-9a-f]{8}-[0-9a-f]{4}-'
      || '[1-8][0-9a-f]{3}-'
      || '[89ab][0-9a-f]{3}-'
      || '[0-9a-f]{12}$'
  );
$$;

create function private.jsonb_compact_octet_length(p_value jsonb)
returns integer
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  value_kind text;
  compact_length bigint;
begin
  value_kind := pg_catalog.jsonb_typeof(p_value);

  if value_kind = 'object' then
    select
      2
      + greatest(
          pg_catalog.count(*) - 1,
          0
        )
      + coalesce(
          pg_catalog.sum(
            pg_catalog.octet_length(
              pg_catalog.to_jsonb(object_item.key_name)::text
            )
            + 1
            + private.jsonb_compact_octet_length(
                object_item.value
              )
          ),
          0::bigint
        )
    into compact_length
    from pg_catalog.jsonb_each(p_value)
      as object_item(key_name, value);
  elsif value_kind = 'array' then
    select
      2
      + greatest(
          pg_catalog.count(*) - 1,
          0
        )
      + coalesce(
          pg_catalog.sum(
            private.jsonb_compact_octet_length(
              array_item.value
            )
          ),
          0::bigint
        )
    into compact_length
    from pg_catalog.jsonb_array_elements(p_value)
      as array_item(value);
  else
    compact_length :=
      pg_catalog.octet_length(p_value::text);
  end if;

  return compact_length::integer;
end;
$$;

create function private.ecmascript_trim(p_value text)
returns text
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select pg_catalog.btrim(
    p_value,
    pg_catalog.chr(9)
      || pg_catalog.chr(10)
      || pg_catalog.chr(11)
      || pg_catalog.chr(12)
      || pg_catalog.chr(13)
      || pg_catalog.chr(32)
      || pg_catalog.chr(160)
      || pg_catalog.chr(5760)
      || pg_catalog.chr(8192)
      || pg_catalog.chr(8193)
      || pg_catalog.chr(8194)
      || pg_catalog.chr(8195)
      || pg_catalog.chr(8196)
      || pg_catalog.chr(8197)
      || pg_catalog.chr(8198)
      || pg_catalog.chr(8199)
      || pg_catalog.chr(8200)
      || pg_catalog.chr(8201)
      || pg_catalog.chr(8202)
      || pg_catalog.chr(8232)
      || pg_catalog.chr(8233)
      || pg_catalog.chr(8239)
      || pg_catalog.chr(8287)
      || pg_catalog.chr(12288)
      || pg_catalog.chr(65279)
  );
$$;

create function private.normalize_support_note(p_input jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  normalized_note text;
  bidi_pattern text;
begin
  if not (p_input ? 'note') then
    return null;
  end if;

  if pg_catalog.jsonb_typeof(p_input -> 'note') <> 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  normalized_note := normalize(p_input ->> 'note', NFC);
  normalized_note := private.ecmascript_trim(normalized_note);

  if normalized_note = '' then
    return null;
  end if;

  bidi_pattern := '['
    || pg_catalog.chr(1564)
    || pg_catalog.chr(8206)
    || pg_catalog.chr(8207)
    || pg_catalog.chr(8234) || '-' || pg_catalog.chr(8238)
    || pg_catalog.chr(8294) || '-' || pg_catalog.chr(8297)
    || ']';

  if normalized_note ~ '[[:cntrl:]]'
    or normalized_note ~ bidi_pattern then
    raise exception using
      errcode = 'P0001',
      message = 'note_invalid_characters';
  end if;

  if pg_catalog.char_length(normalized_note) > 200
    or pg_catalog.octet_length(normalized_note) > 800 then
    raise exception using
      errcode = 'P0001',
      message = 'note_too_long';
  end if;

  return normalized_note;
end;
$$;

create function private.validate_support_snapshot(p_snapshot jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  selected_thought jsonb;
  evidence_value jsonb;
begin
  if not private.jsonb_has_exact_keys(
    p_snapshot,
    array[
      'sceneVersionId',
      'selectedThought',
      'selectedHypothesisIds',
      'evidence'
    ]
  )
    or not private.is_canonical_uuid_json(
      p_snapshot -> 'sceneVersionId'
    )
    or pg_catalog.jsonb_typeof(
      p_snapshot -> 'selectedHypothesisIds'
    ) <> 'array'
    or pg_catalog.jsonb_array_length(
      p_snapshot -> 'selectedHypothesisIds'
    ) < 2
    or private.jsonb_compact_octet_length(p_snapshot) > 16384 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_snapshot -> 'selectedHypothesisIds'
    ) as hypothesis_item(value)
    where pg_catalog.jsonb_typeof(hypothesis_item.value) <> 'string'
      or hypothesis_item.value #>> '{}' = ''
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  if exists (
    select 1
    from (
      select
        hypothesis_value,
        pg_catalog.lag(hypothesis_value) over (
          order by hypothesis_ordinal
        ) as prior_hypothesis_value
      from (
        select
          hypothesis_item.value #>> '{}' as hypothesis_value,
          hypothesis_item.ordinality as hypothesis_ordinal
        from pg_catalog.jsonb_array_elements(
          p_snapshot -> 'selectedHypothesisIds'
        ) with ordinality
          as hypothesis_item(value, ordinality)
      ) as ordered_hypotheses
    ) as compared_hypotheses
    where prior_hypothesis_value is not null
      and prior_hypothesis_value collate "C"
        >= hypothesis_value collate "C"
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  selected_thought := p_snapshot -> 'selectedThought';

  if pg_catalog.jsonb_typeof(selected_thought) <> 'object'
    or pg_catalog.jsonb_typeof(
      selected_thought -> 'kind'
    ) <> 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  if selected_thought ->> 'kind' = 'option' then
    if not private.jsonb_has_exact_keys(
      selected_thought,
      array['kind', 'optionId']
    )
      or pg_catalog.jsonb_typeof(
        selected_thought -> 'optionId'
      ) <> 'string'
      or selected_thought ->> 'optionId' = '' then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_support_request';
    end if;
  elsif selected_thought ->> 'kind' in (
    'uncertain',
    'multiple',
    'none'
  ) then
    if not private.jsonb_has_exact_keys(
      selected_thought,
      array['kind']
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_support_request';
    end if;
  else
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  evidence_value := p_snapshot -> 'evidence';

  if not private.jsonb_has_exact_keys(
    evidence_value,
    array[
      'recurrence',
      'knownFacts',
      'assumptions',
      'danger',
      'directlySolvable',
      'nextNeed'
    ]
  )
    or evidence_value ->> 'recurrence' is null
    or evidence_value ->> 'recurrence' not in (
      'once',
      'repeated',
      'unknown'
    )
    or evidence_value ->> 'knownFacts' is null
    or evidence_value ->> 'knownFacts' not in (
      'clear',
      'partial',
      'none-yet'
    )
    or evidence_value ->> 'assumptions' is null
    or evidence_value ->> 'assumptions' not in (
      'present',
      'none-known',
      'uncertain'
    )
    or evidence_value ->> 'danger' is null
    or evidence_value ->> 'danger' not in (
      'none-known',
      'uncertain',
      'present'
    )
    or evidence_value ->> 'directlySolvable' is null
    or evidence_value ->> 'directlySolvable' not in (
      'yes',
      'partly',
      'no',
      'unknown'
    )
    or evidence_value ->> 'nextNeed' is null
    or evidence_value ->> 'nextNeed' not in (
      'stabilize',
      'verify',
      'solve',
      'boundary',
      'help'
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  if evidence_value ->> 'danger' = 'present' then
    raise exception using
      errcode = 'P0001',
      message = 'safety_required';
  end if;
end;
$$;

create function private.validate_support_ticket_input(p_input jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_input) <> 'object'
    or pg_catalog.jsonb_typeof(p_input -> 'kind') <> 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  if p_input ->> 'kind' = 'no_snapshot' then
    if not (
      private.jsonb_has_exact_keys(
        p_input,
        array['kind']
      )
      or private.jsonb_has_exact_keys(
        p_input,
        array['kind', 'note']
      )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_support_request';
    end if;
  elsif p_input ->> 'kind' = 'current_training_snapshot' then
    if not (
      private.jsonb_has_exact_keys(
        p_input,
        array[
          'kind',
          'consentToShare',
          'completionId',
          'snapshot'
        ]
      )
      or private.jsonb_has_exact_keys(
        p_input,
        array[
          'kind',
          'consentToShare',
          'completionId',
          'snapshot',
          'note'
        ]
      )
    )
      or pg_catalog.jsonb_typeof(
        p_input -> 'consentToShare'
      ) <> 'boolean'
      or p_input -> 'consentToShare' <> 'true'::jsonb
      or not private.is_canonical_uuid_json(
        p_input -> 'completionId'
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_support_request';
    end if;

    perform private.validate_support_snapshot(
      p_input -> 'snapshot'
    );
  else
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  perform private.normalize_support_note(p_input);
end;
$$;

create function private.validate_safety_report_input(p_input jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  context_value jsonb;
begin
  if pg_catalog.jsonb_typeof(p_input) <> 'object'
    or not (
      private.jsonb_has_exact_keys(
        p_input,
        array['confirmedByUser', 'context']
      )
      or private.jsonb_has_exact_keys(
        p_input,
        array['confirmedByUser', 'sessionId', 'context']
      )
    )
    or pg_catalog.jsonb_typeof(
      p_input -> 'confirmedByUser'
    ) <> 'boolean'
    or p_input -> 'confirmedByUser' <> 'true'::jsonb then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_safety_report_request';
  end if;

  if p_input ? 'sessionId'
    and not private.is_canonical_uuid_json(
      p_input -> 'sessionId'
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_safety_report_request';
  end if;

  context_value := p_input -> 'context';

  if pg_catalog.jsonb_typeof(context_value) <> 'object'
    or pg_catalog.jsonb_typeof(
      context_value -> 'source'
    ) <> 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_safety_report_request';
  end if;

  if context_value ->> 'source' = 'user' then
    if not private.jsonb_has_exact_keys(
      context_value,
      array['source', 'signalCode']
    )
      or pg_catalog.jsonb_typeof(
        context_value -> 'signalCode'
      ) <> 'string'
      or context_value ->> 'signalCode' not in (
        'physical_or_sexual_violence',
        'serious_threat',
        'coercive_control',
        'child_abuse_or_exploitation',
        'self_harm_or_suicide',
        'bullying_or_retaliation',
        'medical_emergency',
        'user_declared_danger'
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_safety_report_request';
    end if;
  elsif context_value ->> 'source' = 'server' then
    if not private.jsonb_has_exact_keys(
      context_value,
      array['source']
    )
      or not (p_input ? 'sessionId') then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_safety_report_request';
    end if;
  else
    raise exception using
      errcode = 'P0001',
      message = 'invalid_safety_report_request';
  end if;
end;
$$;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  cohort_id uuid not null
    references public.cohorts(id),
  source_completion_id uuid
    references public.training_completions(id),
  assigned_coach_id uuid
    references public.profiles(id) on delete set null,
  request_id uuid not null,
  share_kind text not null
    check (
      share_kind in (
        'no_snapshot',
        'current_training_snapshot'
      )
    ),
  note text,
  consented_at timestamptz,
  submitted_at timestamptz not null,
  first_response_due_at timestamptz not null,
  status text not null
    check (status in ('submitted', 'withdrawn')),
  withdrawal_request_id uuid,
  withdrawn_at timestamptz,
  unique (user_id, request_id),
  check (
    (
      share_kind = 'no_snapshot'
      and source_completion_id is null
      and consented_at is null
    )
    or (
      share_kind = 'current_training_snapshot'
      and source_completion_id is not null
      and consented_at is not null
    )
  ),
  check (
    note is null
    or (
      pg_catalog.char_length(note) between 1 and 200
      and pg_catalog.octet_length(note) <= 800
      and note = normalize(note, NFC)
      and note = private.ecmascript_trim(note)
      and note !~ '[[:cntrl:]]'
      and note !~ (
        '['
        || pg_catalog.chr(1564)
        || pg_catalog.chr(8206)
        || pg_catalog.chr(8207)
        || pg_catalog.chr(8234) || '-' || pg_catalog.chr(8238)
        || pg_catalog.chr(8294) || '-' || pg_catalog.chr(8297)
        || ']'
      )
    )
  ),
  check (
    first_response_due_at
      = submitted_at + interval '24 hours'
  ),
  check (
    (
      status = 'submitted'
      and withdrawal_request_id is null
      and withdrawn_at is null
    )
    or (
      status = 'withdrawn'
      and withdrawal_request_id is not null
      and withdrawn_at is not null
    )
  )
);

create table public.support_ticket_snapshots (
  ticket_id uuid primary key
    references public.support_tickets(id) on delete cascade,
  completion_id uuid not null
    references public.training_completions(id),
  scene_version_id uuid not null
    references public.scene_versions(id),
  snapshot jsonb not null,
  shared_at timestamptz not null,
  check (
    private.jsonb_has_exact_keys(
      snapshot,
      array[
        'sceneVersionId',
        'selectedThought',
        'selectedHypothesisIds',
        'evidence'
      ]
    )
  ),
  check (
    private.jsonb_compact_octet_length(snapshot) <= 16384
  )
);

create table public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  session_id uuid
    references public.training_sessions(id),
  scene_version_id uuid
    references public.scene_versions(id),
  cohort_id uuid
    references public.cohorts(id),
  request_id uuid not null,
  assigned_supervisor_id uuid
    references public.profiles(id) on delete set null,
  source text not null
    check (source in ('user', 'server')),
  signal_code text,
  status text not null
    check (status = 'submitted'),
  submitted_at timestamptz not null,
  unique (user_id, request_id),
  check (
    (
      source = 'user'
      and signal_code is not null
      and signal_code in (
        'physical_or_sexual_violence',
        'serious_threat',
        'coercive_control',
        'child_abuse_or_exploitation',
        'self_harm_or_suicide',
        'bullying_or_retaliation',
        'medical_emergency',
        'user_declared_danger'
      )
    )
    or (
      source = 'server'
      and signal_code is null
      and session_id is not null
    )
  ),
  check (
    (session_id is null and scene_version_id is null)
    or (session_id is not null and scene_version_id is not null)
  )
);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_snapshots enable row level security;
alter table public.safety_reports enable row level security;

create or replace function public.start_training(
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
  selected_cohort_id uuid;
  active_cohort_count integer;
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

  perform private.lock_participant_state(current_user_id);

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

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(
      cohort_row.id
      order by cohort_row.id
    ))[1]
  into active_cohort_count, selected_cohort_id
  from public.cohort_memberships as membership
  join public.cohorts as cohort_row
    on cohort_row.id = membership.cohort_id
  where membership.user_id = current_user_id
    and cohort_row.status = 'active';

  if active_cohort_count <> 1 then
    selected_cohort_id := null;
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
    cohort_id,
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
    selected_cohort_id,
    p_idempotency_key,
    case
      when selected_risk = 'stop' then 'safety_stopped'
      else 'active'
    end,
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

create function public.create_support_ticket(
  p_request_id uuid,
  p_input jsonb
)
returns table(
  "ticketId" uuid,
  created boolean,
  status text,
  "snapshotShared" boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_binding private.progress_idempotency_keys%rowtype;
  selected_ticket public.support_tickets%rowtype;
  selected_snapshot public.support_ticket_snapshots%rowtype;
  selected_completion public.training_completions%rowtype;
  selected_session public.training_sessions%rowtype;
  selected_version public.scene_versions%rowtype;
  participant_is_eligible boolean;
  active_cohort_count integer;
  selected_cohort_id uuid;
  input_kind text;
  normalized_note text;
  input_completion_id uuid;
  input_snapshot jsonb;
  submitted_time timestamptz;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_request';
  end if;

  perform private.lock_participant_state(current_user_id);
  perform private.lock_progress_idempotency_key(
    current_user_id,
    p_request_id
  );

  select binding_row.*
  into selected_binding
  from private.progress_idempotency_keys as binding_row
  where binding_row.user_id = current_user_id
    and binding_row.idempotency_key = p_request_id;

  if found then
    if selected_binding.event_kind <> 'support_ticket' then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    select ticket_row.*
    into selected_ticket
    from public.support_tickets as ticket_row
    where ticket_row.id = selected_binding.source_id
      and ticket_row.user_id = current_user_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'database_integrity_failure';
    end if;

    if selected_ticket.status = 'withdrawn' then
      "ticketId" := selected_ticket.id;
      created := false;
      status := 'withdrawn';
      "snapshotShared" := false;
      return next;
      return;
    end if;

    perform private.validate_support_ticket_input(p_input);
    input_kind := p_input ->> 'kind';
    normalized_note := private.normalize_support_note(p_input);

    if input_kind = 'current_training_snapshot' then
      input_completion_id := (
        p_input ->> 'completionId'
      )::uuid;
      input_snapshot := p_input -> 'snapshot';

      select completion_row.*
      into selected_completion
      from public.training_completions as completion_row
      where completion_row.id
          = selected_ticket.source_completion_id
        and completion_row.user_id = current_user_id
      for update;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'database_integrity_failure';
      end if;
    end if;

    select ticket_row.*
    into selected_ticket
    from public.support_tickets as ticket_row
    where ticket_row.id = selected_binding.source_id
      and ticket_row.user_id = current_user_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'database_integrity_failure';
    end if;

    if selected_ticket.status = 'withdrawn' then
      "ticketId" := selected_ticket.id;
      created := false;
      status := 'withdrawn';
      "snapshotShared" := false;
      return next;
      return;
    end if;

    select snapshot_row.*
    into selected_snapshot
    from public.support_ticket_snapshots as snapshot_row
    where snapshot_row.ticket_id = selected_ticket.id;

    if selected_ticket.share_kind <> input_kind
      or selected_ticket.note
        is distinct from normalized_note
      or (
        input_kind = 'no_snapshot'
        and (
          selected_ticket.source_completion_id is not null
          or selected_snapshot.ticket_id is not null
        )
      )
      or (
        input_kind = 'current_training_snapshot'
        and (
          selected_ticket.source_completion_id
            is distinct from input_completion_id
          or selected_snapshot.ticket_id is null
          or selected_snapshot.completion_id
            is distinct from input_completion_id
          or selected_snapshot.snapshot
            is distinct from input_snapshot
        )
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    "ticketId" := selected_ticket.id;
    created := false;
    status := selected_ticket.status;
    "snapshotShared" :=
      selected_snapshot.ticket_id is not null;
    return next;
    return;
  end if;

  select
    profile_row.is_adult_confirmed
      and profile_row.service_status = 'active'
  into participant_is_eligible
  from public.profiles as profile_row
  where profile_row.id = current_user_id;

  if participant_is_eligible is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = 'active_adult_membership_required';
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(
      cohort_row.id
      order by cohort_row.id
    ))[1]
  into active_cohort_count, selected_cohort_id
  from public.cohort_memberships as membership
  join public.cohorts as cohort_row
    on cohort_row.id = membership.cohort_id
  where membership.user_id = current_user_id
    and cohort_row.status = 'active';

  if active_cohort_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'active_adult_membership_required';
  end if;

  if active_cohort_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'cohort_context_ambiguous';
  end if;

  perform private.validate_support_ticket_input(p_input);
  input_kind := p_input ->> 'kind';
  normalized_note := private.normalize_support_note(p_input);

  if input_kind = 'current_training_snapshot' then
    input_completion_id := (
      p_input ->> 'completionId'
    )::uuid;
    input_snapshot := p_input -> 'snapshot';

    select completion_row.*
    into selected_completion
    from public.training_completions as completion_row
    where completion_row.id = input_completion_id
      and completion_row.user_id = current_user_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'support_source_unavailable';
    end if;

    select session_row.*
    into selected_session
    from public.training_sessions as session_row
    where session_row.id = selected_completion.session_id
      and session_row.user_id = current_user_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'support_source_unavailable';
    end if;

    select version_row.*
    into selected_version
    from public.scene_versions as version_row
    where version_row.id
      = selected_completion.scene_version_id;

    if not found
      or selected_session.status <> 'completed'
      or selected_completion.scene_version_id
        <> selected_session.scene_version_id
      or selected_completion.cohort_id is null
      or selected_session.cohort_id is null
      or selected_completion.cohort_id
        <> selected_session.cohort_id
      or selected_completion.cohort_id
        <> selected_cohort_id
      or selected_version.status
        <> 'published'::public.content_status
      or selected_version.risk
        = 'stop'::public.risk_level
      or (
        input_snapshot ->> 'sceneVersionId'
      )::uuid <> selected_completion.scene_version_id
      or pg_catalog.jsonb_typeof(
        selected_version.payload -> 'thoughtOptions'
      ) <> 'array'
      or pg_catalog.jsonb_typeof(
        selected_version.payload -> 'hypotheses'
      ) <> 'array' then
      raise exception using
        errcode = 'P0001',
        message = 'support_source_unavailable';
    end if;

    if input_snapshot #>> '{selectedThought,kind}'
        = 'option'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          selected_version.payload -> 'thoughtOptions'
        ) as thought_option(value)
        where thought_option.value ->> 'id'
          = input_snapshot
            #>> '{selectedThought,optionId}'
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_support_request';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(
        input_snapshot -> 'selectedHypothesisIds'
      ) as selected_hypothesis(id)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          selected_version.payload -> 'hypotheses'
        ) as hypothesis_option(value)
        where hypothesis_option.value ->> 'id'
          = selected_hypothesis.id
      )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'invalid_support_request';
    end if;
  end if;

  submitted_time := pg_catalog.clock_timestamp();

  insert into public.support_tickets(
    user_id,
    cohort_id,
    source_completion_id,
    assigned_coach_id,
    request_id,
    share_kind,
    note,
    consented_at,
    submitted_at,
    first_response_due_at,
    status
  ) values (
    current_user_id,
    selected_cohort_id,
    input_completion_id,
    null,
    p_request_id,
    input_kind,
    normalized_note,
    case
      when input_kind = 'current_training_snapshot'
      then submitted_time
      else null
    end,
    submitted_time,
    submitted_time + interval '24 hours',
    'submitted'
  )
  returning * into selected_ticket;

  if input_kind = 'current_training_snapshot' then
    insert into public.support_ticket_snapshots(
      ticket_id,
      completion_id,
      scene_version_id,
      snapshot,
      shared_at
    ) values (
      selected_ticket.id,
      input_completion_id,
      selected_completion.scene_version_id,
      input_snapshot,
      submitted_time
    )
    returning * into selected_snapshot;
  end if;

  insert into private.progress_idempotency_keys(
    user_id,
    idempotency_key,
    event_kind,
    source_id,
    bound_at
  ) values (
    current_user_id,
    p_request_id,
    'support_ticket',
    selected_ticket.id,
    submitted_time
  );

  "ticketId" := selected_ticket.id;
  created := true;
  status := 'submitted';
  "snapshotShared" :=
    input_kind = 'current_training_snapshot';
  return next;
end;
$$;

create function public.list_my_support_tickets()
returns table(
  "ticketId" uuid,
  status text,
  "snapshotShared" boolean,
  "submittedAt" timestamptz,
  "firstResponseDueAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  return query
  select
    ticket_row.id,
    ticket_row.status,
    (
      ticket_row.status = 'submitted'
      and exists (
        select 1
        from public.support_ticket_snapshots
          as snapshot_row
        where snapshot_row.ticket_id = ticket_row.id
      )
    ),
    ticket_row.submitted_at,
    ticket_row.first_response_due_at
  from public.support_tickets as ticket_row
  where ticket_row.user_id = current_user_id
  order by ticket_row.submitted_at desc, ticket_row.id desc;
end;
$$;

create function public.revoke_support_consent(
  p_ticket_id uuid,
  p_request_id uuid
)
returns table(
  "ticketId" uuid,
  status text,
  "snapshotShared" boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_ticket public.support_tickets%rowtype;
  withdrawn_time timestamptz;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  if p_ticket_id is null or p_request_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_support_revocation';
  end if;

  select ticket_row.*
  into selected_ticket
  from public.support_tickets as ticket_row
  where ticket_row.id = p_ticket_id
    and ticket_row.user_id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'support_ticket_not_found';
  end if;

  if selected_ticket.share_kind <> 'current_training_snapshot' then
    raise exception using
      errcode = 'P0001',
      message = 'support_consent_not_shared';
  end if;

  delete from public.support_ticket_snapshots
  where ticket_id = selected_ticket.id;

  withdrawn_time := pg_catalog.clock_timestamp();

  update public.support_tickets
  set note = null,
      status = 'withdrawn',
      withdrawal_request_id = coalesce(
        withdrawal_request_id,
        p_request_id
      ),
      withdrawn_at = coalesce(
        withdrawn_at,
        withdrawn_time
      )
  where id = selected_ticket.id
  returning * into selected_ticket;

  "ticketId" := selected_ticket.id;
  status := 'withdrawn';
  "snapshotShared" := false;
  return next;
end;
$$;

create function public.stop_training_for_safety(
  p_session_id uuid
)
returns table("sessionId" uuid, route text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_session public.training_sessions%rowtype;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  if p_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_session_request';
  end if;

  perform private.lock_participant_state(current_user_id);

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

  if selected_session.status in ('active', 'paused') then
    update public.training_sessions
    set status = 'safety_stopped'
    where id = selected_session.id;
  end if;

  "sessionId" := selected_session.id;
  route := 'safety-stop';
  return next;
end;
$$;

create function public.create_safety_report(
  p_request_id uuid,
  p_input jsonb
)
returns table(
  "reportId" uuid,
  created boolean,
  status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  selected_binding private.progress_idempotency_keys%rowtype;
  selected_report public.safety_reports%rowtype;
  selected_session public.training_sessions%rowtype;
  selected_source text;
  selected_signal_code text;
  selected_session_id uuid;
  selected_scene_version_id uuid;
  selected_cohort_id uuid;
  active_cohort_count integer;
  profile_exists boolean;
  submitted_time timestamptz;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_safety_report_request';
  end if;

  perform private.lock_participant_state(current_user_id);
  perform private.lock_progress_idempotency_key(
    current_user_id,
    p_request_id
  );

  select binding_row.*
  into selected_binding
  from private.progress_idempotency_keys as binding_row
  where binding_row.user_id = current_user_id
    and binding_row.idempotency_key = p_request_id;

  if found then
    if selected_binding.event_kind <> 'safety_report' then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    select report_row.*
    into selected_report
    from public.safety_reports as report_row
    where report_row.id = selected_binding.source_id
      and report_row.user_id = current_user_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'database_integrity_failure';
    end if;

    perform private.validate_safety_report_input(p_input);
    selected_source := p_input #>> '{context,source}';
    selected_signal_code :=
      p_input #>> '{context,signalCode}';
    selected_session_id := case
      when p_input ? 'sessionId'
      then (p_input ->> 'sessionId')::uuid
      else null
    end;

    if selected_report.session_id is not null then
      select session_row.*
      into selected_session
      from public.training_sessions as session_row
      where session_row.id = selected_report.session_id
        and session_row.user_id = current_user_id
      for update;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'database_integrity_failure';
      end if;
    end if;

    select report_row.*
    into selected_report
    from public.safety_reports as report_row
    where report_row.id = selected_binding.source_id
      and report_row.user_id = current_user_id
    for update;

    if selected_report.source <> selected_source
      or selected_report.signal_code
        is distinct from selected_signal_code
      or selected_report.session_id
        is distinct from selected_session_id then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    "reportId" := selected_report.id;
    created := false;
    status := 'submitted';
    return next;
    return;
  end if;

  select exists (
    select 1
    from public.profiles as profile_row
    where profile_row.id = current_user_id
  )
  into profile_exists;

  if not profile_exists then
    raise exception using
      errcode = 'P0001',
      message = 'profile_required';
  end if;

  perform private.validate_safety_report_input(p_input);
  selected_source := p_input #>> '{context,source}';
  selected_signal_code :=
    p_input #>> '{context,signalCode}';

  if p_input ? 'sessionId' then
    selected_session_id := (
      p_input ->> 'sessionId'
    )::uuid;

    select session_row.*
    into selected_session
    from public.training_sessions as session_row
    where session_row.id = selected_session_id
      and session_row.user_id = current_user_id
    for update;

    if not found
      or selected_session.status <> 'safety_stopped' then
      raise exception using
        errcode = 'P0001',
        message = 'safety_source_unavailable';
    end if;

    selected_scene_version_id :=
      selected_session.scene_version_id;
    selected_cohort_id := selected_session.cohort_id;
  else
    select
      pg_catalog.count(*)::integer,
      (pg_catalog.array_agg(
        cohort_row.id
        order by cohort_row.id
      ))[1]
    into active_cohort_count, selected_cohort_id
    from public.cohort_memberships as membership
    join public.cohorts as cohort_row
      on cohort_row.id = membership.cohort_id
    where membership.user_id = current_user_id
      and cohort_row.status = 'active';

    if active_cohort_count <> 1 then
      selected_cohort_id := null;
    end if;
  end if;

  submitted_time := pg_catalog.clock_timestamp();

  insert into public.safety_reports(
    user_id,
    session_id,
    scene_version_id,
    cohort_id,
    request_id,
    assigned_supervisor_id,
    source,
    signal_code,
    status,
    submitted_at
  ) values (
    current_user_id,
    selected_session_id,
    selected_scene_version_id,
    selected_cohort_id,
    p_request_id,
    null,
    selected_source,
    selected_signal_code,
    'submitted',
    submitted_time
  )
  returning * into selected_report;

  insert into private.progress_idempotency_keys(
    user_id,
    idempotency_key,
    event_kind,
    source_id,
    bound_at
  ) values (
    current_user_id,
    p_request_id,
    'safety_report',
    selected_report.id,
    submitted_time
  );

  "reportId" := selected_report.id;
  created := true;
  status := 'submitted';
  return next;
end;
$$;

create function public.list_my_safety_reports()
returns table(
  "reportId" uuid,
  status text,
  "submittedAt" timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'unauthenticated';
  end if;

  return query
  select
    report_row.id,
    report_row.status,
    report_row.submitted_at
  from public.safety_reports as report_row
  where report_row.user_id = current_user_id
  order by report_row.submitted_at desc, report_row.id desc;
end;
$$;

revoke all on
  public.support_tickets,
  public.support_ticket_snapshots,
  public.safety_reports
from public, anon, authenticated;

revoke all on function private.jsonb_has_exact_keys(jsonb, text[])
from public, anon, authenticated;
revoke all on function private.is_canonical_uuid_json(jsonb)
from public, anon, authenticated;
revoke all on function private.jsonb_compact_octet_length(jsonb)
from public, anon, authenticated;
revoke all on function private.ecmascript_trim(text)
from public, anon, authenticated;
revoke all on function private.normalize_support_note(jsonb)
from public, anon, authenticated;
revoke all on function private.validate_support_snapshot(jsonb)
from public, anon, authenticated;
revoke all on function private.validate_support_ticket_input(jsonb)
from public, anon, authenticated;
revoke all on function private.validate_safety_report_input(jsonb)
from public, anon, authenticated;

revoke all on function public.start_training(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.create_support_ticket(uuid, jsonb)
from public, anon, authenticated;
revoke all on function public.list_my_support_tickets()
from public, anon, authenticated;
revoke all on function public.revoke_support_consent(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.stop_training_for_safety(uuid)
from public, anon, authenticated;
revoke all on function public.create_safety_report(uuid, jsonb)
from public, anon, authenticated;
revoke all on function public.list_my_safety_reports()
from public, anon, authenticated;

grant execute on function public.start_training(uuid, uuid)
to authenticated;
grant execute on function public.create_support_ticket(uuid, jsonb)
to authenticated;
grant execute on function public.list_my_support_tickets()
to authenticated;
grant execute on function public.revoke_support_consent(uuid, uuid)
to authenticated;
grant execute on function public.stop_training_for_safety(uuid)
to authenticated;
grant execute on function public.create_safety_report(uuid, jsonb)
to authenticated;
grant execute on function public.list_my_safety_reports()
to authenticated;
