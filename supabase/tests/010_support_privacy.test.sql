create extension if not exists dblink with schema extensions;

select no_plan();

select has_table(
  'public',
  'support_tickets',
  'support tickets use a dedicated service table'
);
select has_table(
  'public',
  'support_ticket_snapshots',
  'consented snapshots use a dedicated service table'
);
select has_table(
  'public',
  'safety_reports',
  'safety reports use a dedicated service table'
);
select has_column(
  'public',
  'training_sessions',
  'cohort_id',
  'training sessions may pin one proven cohort'
);
select ok(
  (
    select column_row.is_nullable = 'YES'
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'training_sessions'
      and column_row.column_name = 'cohort_id'
  ),
  'the training-session cohort pin is nullable'
);

select has_function(
  'public',
  'create_support_ticket',
  array['uuid', 'jsonb'],
  'support creation has the exact minimal signature'
);
select has_function(
  'public',
  'list_my_support_tickets',
  array[]::text[],
  'support status listing has no client-selected owner'
);
select has_function(
  'public',
  'revoke_support_consent',
  array['uuid', 'uuid'],
  'support revocation has ticket and request identifiers only'
);
select has_function(
  'public',
  'stop_training_for_safety',
  array['uuid'],
  'safety stop is independent from report input'
);
select has_function(
  'public',
  'create_safety_report',
  array['uuid', 'jsonb'],
  'safety report creation has the exact minimal signature'
);
select has_function(
  'public',
  'list_my_safety_reports',
  array[]::text[],
  'safety status listing has no client-selected owner'
);

select columns_are(
  'public',
  'support_tickets',
  array[
    'id',
    'user_id',
    'cohort_id',
    'source_completion_id',
    'assigned_coach_id',
    'request_id',
    'share_kind',
    'note',
    'consented_at',
    'submitted_at',
    'first_response_due_at',
    'status',
    'withdrawal_request_id',
    'withdrawn_at'
  ],
  'support tickets contain only the Task 10 service columns'
);
select columns_are(
  'public',
  'support_ticket_snapshots',
  array[
    'ticket_id',
    'completion_id',
    'scene_version_id',
    'snapshot',
    'shared_at'
  ],
  'support snapshots contain one minimal consented payload'
);
select columns_are(
  'public',
  'safety_reports',
  array[
    'id',
    'user_id',
    'session_id',
    'scene_version_id',
    'cohort_id',
    'request_id',
    'assigned_supervisor_id',
    'source',
    'signal_code',
    'status',
    'submitted_at'
  ],
  'safety reports contain typed minimal routing columns'
);

select ok(
  (
    select pg_catalog.bool_and(class_row.relrowsecurity)
    from pg_catalog.pg_class as class_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relname in (
        'support_tickets',
        'support_ticket_snapshots',
        'safety_reports'
      )
  ),
  'all three service tables enable RLS'
);
select is(
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_row
    where policy_row.polrelid in (
      'public.support_tickets'::regclass,
      'public.support_ticket_snapshots'::regclass,
      'public.safety_reports'::regclass
    )
  ),
  0::bigint,
  'service-table access is RPC-only with no permissive policies'
);

select ok(
  not pg_catalog.has_table_privilege(
    role_name,
    table_name,
    privilege_name
  ),
  pg_catalog.format(
    '%s has no direct %s privilege on %s',
    role_name,
    privilege_name,
    table_name
  )
)
from (
  values ('public'), ('anon'), ('authenticated')
) as denied_role(role_name)
cross join (
  values
    ('public.support_tickets'),
    ('public.support_ticket_snapshots'),
    ('public.safety_reports')
) as service_table(table_name)
cross join (
  values
    ('SELECT'),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('TRUNCATE'),
    ('REFERENCES'),
    ('TRIGGER'),
    ('MAINTAIN')
) as denied_privilege(privilege_name);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    function_name,
    'EXECUTE'
  ),
  pg_catalog.format(
    'authenticated may execute %s',
    function_name
  )
)
from (
  values
    ('public.create_support_ticket(uuid,jsonb)'),
    ('public.list_my_support_tickets()'),
    ('public.revoke_support_consent(uuid,uuid)'),
    ('public.stop_training_for_safety(uuid)'),
    ('public.create_safety_report(uuid,jsonb)'),
    ('public.list_my_safety_reports()')
) as allowed_function(function_name);

select ok(
  not pg_catalog.has_function_privilege(
    role_name,
    function_name,
    'EXECUTE'
  ),
  pg_catalog.format(
    '%s may not execute %s',
    role_name,
    function_name
  )
)
from (
  values ('public'), ('anon')
) as denied_role(role_name)
cross join (
  values
    ('public.create_support_ticket(uuid,jsonb)'),
    ('public.list_my_support_tickets()'),
    ('public.revoke_support_consent(uuid,uuid)'),
    ('public.stop_training_for_safety(uuid)'),
    ('public.create_safety_report(uuid,jsonb)'),
    ('public.list_my_safety_reports()')
) as denied_function(function_name);

select ok(
  (
    select pg_catalog.bool_and(
      procedure_row.prosecdef
      and procedure_row.proconfig
        = array['search_path=""']::text[]
    )
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'create_support_ticket',
        'list_my_support_tickets',
        'revoke_support_consent',
        'stop_training_for_safety',
        'create_safety_report',
        'list_my_safety_reports'
      )
  ),
  'all participant service RPCs are security definer with fixed search paths'
);

select ok(
  not pg_catalog.has_function_privilege(
    role_name,
    function_name,
    'EXECUTE'
  ),
  pg_catalog.format(
    '%s cannot execute private helper %s',
    role_name,
    function_name
  )
)
from (
  values ('public'), ('anon'), ('authenticated')
) as denied_role(role_name)
cross join (
  values
    ('private.jsonb_has_exact_keys(jsonb,text[])'),
    ('private.is_canonical_uuid_json(jsonb)'),
    ('private.jsonb_compact_octet_length(jsonb)'),
    ('private.ecmascript_trim(text)'),
    ('private.normalize_support_note(jsonb)'),
    ('private.validate_support_snapshot(jsonb)'),
    ('private.validate_support_ticket_input(jsonb)'),
    ('private.validate_safety_report_input(jsonb)')
) as denied_function(function_name);

select ok(
  (
    select procedure_row.provolatile = 'i'
      and procedure_row.prosecdef
      and procedure_row.proconfig
        = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid
      = 'private.jsonb_compact_octet_length(jsonb)'::regprocedure
  ),
  'compact JSON byte accounting is immutable with a fixed definer path'
);
select is(
  private.jsonb_compact_octet_length(
    $json${"quoted\"key":["line\n","slash\\quote\"","转念","😀"]}$json$::jsonb
  ),
  pg_catalog.octet_length(
    $json${"quoted\"key":["line\n","slash\\quote\"","转念","😀"]}$json$
  ),
  'compact JSON byte accounting preserves escapes and UTF-8 byte widths'
);
select ok(
  (
    select procedure_row.provolatile = 'i'
      and procedure_row.proisstrict
      and procedure_row.prosecdef
      and procedure_row.proconfig
        = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure_row
    where procedure_row.oid
      = 'private.ecmascript_trim(text)'::regprocedure
  ),
  'ECMAScript trim is immutable, strict, and uses a fixed definer path'
);

select ok(
  (
    select pg_catalog.pg_get_constraintdef(
      constraint_row.oid
    ) like '%support_ticket%'
      and pg_catalog.pg_get_constraintdef(
        constraint_row.oid
      ) like '%safety_report%'
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid
        = 'private.progress_idempotency_keys'::regclass
      and constraint_row.conname
        = 'progress_idempotency_keys_event_kind_check'
  ),
  'the global progress-event key binds help and safety kinds'
);

select is(
  (
    select pg_catalog.count(*)
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name in (
        'support_tickets',
        'support_ticket_snapshots',
        'safety_reports',
        'training_sessions'
      )
      and column_row.column_name ~ (
        'priority|immediate|emergency_dispatch|rescue|'
        || 'prediction|feedback|expression|answer|event_note'
      )
  ),
  0::bigint,
  'Task 10 stores no priority flags, rescue claims, prose, or training answers'
);

begin;
set local role anon;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000001',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  '42501',
  null,
  'anon cannot execute support creation'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000002',
      '{"confirmedByUser":true,"context":{"source":"user","signalCode":"serious_threat"}}'::jsonb
    )$$,
  '42501',
  null,
  'anon cannot execute safety creation'
);
reset role;
commit;

create function pg_temp.valid_snapshot(
  p_scene_version_id uuid,
  p_danger text default 'none-known'
)
returns jsonb
language sql
immutable
as $$
  select pg_catalog.jsonb_build_object(
    'sceneVersionId', p_scene_version_id::text,
    'selectedThought', pg_catalog.jsonb_build_object(
      'kind', 'option',
      'optionId', 'thought-a'
    ),
    'selectedHypothesisIds',
      '["hyp-a","hyp-b"]'::jsonb,
    'evidence', pg_catalog.jsonb_build_object(
      'recurrence', 'once',
      'knownFacts', 'clear',
      'assumptions', 'none-known',
      'danger', p_danger,
      'directlySolvable', 'partly',
      'nextNeed', 'help'
    )
  );
$$;

create function pg_temp.snapshot_ticket_input(
  p_completion_id uuid,
  p_scene_version_id uuid,
  p_note text default null
)
returns jsonb
language sql
immutable
as $$
  select pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'kind', 'current_training_snapshot',
      'consentToShare', true,
      'completionId', p_completion_id::text,
      'snapshot', pg_temp.valid_snapshot(
        p_scene_version_id
      ),
      'note', p_note
    )
  );
$$;

create function pg_temp.sized_snapshot_text(
  p_scene_version_id uuid,
  p_compact_bytes integer
)
returns text
language plpgsql
immutable
as $$
declare
  snapshot_template text;
  filler_length integer;
begin
  snapshot_template :=
    '{"sceneVersionId":"'
    || p_scene_version_id::text
    || '","selectedThought":{"kind":"option","optionId":""},'
    || '"selectedHypothesisIds":["hyp-a","hyp-b"],'
    || '"evidence":{"recurrence":"once","knownFacts":"clear",'
    || '"assumptions":"none-known","danger":"none-known",'
    || '"directlySolvable":"partly","nextNeed":"help"}}';
  filler_length :=
    p_compact_bytes
    - pg_catalog.octet_length(snapshot_template);

  if filler_length < 1 then
    raise exception 'requested snapshot size is too small';
  end if;

  return pg_catalog.replace(
    snapshot_template,
    '"optionId":""',
    '"optionId":"' || pg_catalog.repeat('x', filler_length) || '"'
  );
end;
$$;

create function pg_temp.sized_snapshot(
  p_scene_version_id uuid,
  p_compact_bytes integer
)
returns jsonb
language sql
immutable
as $$
  select pg_temp.sized_snapshot_text(
    p_scene_version_id,
    p_compact_bytes
  )::jsonb;
$$;

create function pg_temp.cleanup_task10_fixtures()
returns void
language plpgsql
volatile
as $$
begin
  delete from public.support_ticket_snapshots
  where ticket_id in (
    select id
    from public.support_tickets
    where user_id::text like
      'a0000000-0000-4000-8000-0000000000%'
  );
  delete from public.support_tickets
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.safety_reports
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from private.progress_idempotency_keys
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.follow_up_reviews
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.saved_insights
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%'
    or scene_version_id::text like
      'a3000000-0000-4000-8000-0000000000%';
  delete from public.points_ledger
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.user_badges
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%'
    or awarded_by::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.training_completions
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.training_sessions
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.cohort_memberships
  where user_id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from public.scene_versions
  where id::text like
      'a3000000-0000-4000-8000-0000000000%';
  delete from public.scenes
  where id::text like
      'a2000000-0000-4000-8000-0000000000%';
  delete from public.cohort_invites
  where cohort_id::text like
      'a1000000-0000-4000-8000-0000000000%';
  delete from public.cohorts
  where id::text like
      'a1000000-0000-4000-8000-0000000000%';
  delete from public.profiles
  where id::text like
      'a0000000-0000-4000-8000-0000000000%';
  delete from auth.users
  where id::text like
      'a0000000-0000-4000-8000-0000000000%';
end;
$$;

select pg_temp.cleanup_task10_fixtures();

insert into auth.users(
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
) values
  ('a0000000-0000-4000-8000-000000000000','authenticated','authenticated','support-coach@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000010','authenticated','authenticated','support-owner@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000011','authenticated','authenticated','support-other@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000012','authenticated','authenticated','support-ambiguous@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000013','authenticated','authenticated','support-no-cohort@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000014','authenticated','authenticated','support-inactive@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000015','authenticated','authenticated','support-closed@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000016','authenticated','authenticated','support-session-routing@example.invalid',now(),now()),
  ('a0000000-0000-4000-8000-000000000017','authenticated','authenticated','support-concurrent@example.invalid',now(),now());

insert into public.profiles(
  id,
  display_name,
  is_adult_confirmed,
  service_status
) values
  ('a0000000-0000-4000-8000-000000000000','support coach',true,'active'),
  ('a0000000-0000-4000-8000-000000000010','support owner',true,'active'),
  ('a0000000-0000-4000-8000-000000000011','other owner',true,'active'),
  ('a0000000-0000-4000-8000-000000000012','ambiguous owner',true,'active'),
  ('a0000000-0000-4000-8000-000000000013','no cohort owner',true,'active'),
  ('a0000000-0000-4000-8000-000000000014','inactive owner',true,'consent_withdrawn'),
  ('a0000000-0000-4000-8000-000000000015','closed owner',true,'active'),
  ('a0000000-0000-4000-8000-000000000016','routing owner',true,'active'),
  ('a0000000-0000-4000-8000-000000000017','race owner',true,'active');

insert into public.cohorts(
  id,
  name,
  coach_id,
  status
) values
  ('a1000000-0000-4000-8000-000000000001','support cohort a','a0000000-0000-4000-8000-000000000000','active'),
  ('a1000000-0000-4000-8000-000000000002','support cohort b','a0000000-0000-4000-8000-000000000000','active'),
  ('a1000000-0000-4000-8000-000000000003','closed support cohort','a0000000-0000-4000-8000-000000000000','closed');

insert into public.cohort_memberships(
  cohort_id,
  user_id,
  joined_at
) values
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000011',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000012',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000014',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000015',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000016',clock_timestamp()-interval '2 days'),
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000017',clock_timestamp()-interval '2 days');

insert into public.scenes(
  id,
  scene_code,
  slug,
  relationship,
  category
) values
  ('a2000000-0000-4000-8000-000000000001','PC-610','support-ordinary','parent-child','support'),
  ('a2000000-0000-4000-8000-000000000002','PC-611','support-paused','parent-child','support'),
  ('a2000000-0000-4000-8000-000000000003','PC-612','support-stop','parent-child','support');

insert into public.scene_versions(
  id,
  scene_id,
  version,
  status,
  risk,
  payload,
  author_id,
  published_at
) values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    1,
    'published',
    'standard',
    '{
      "title":"authored title must never be copied",
      "thoughtOptions":[
        {"id":"thought-a","label":"authored thought a"},
        {"id":"thought-b","label":"authored thought b"}
      ],
      "hypotheses":[
        {"id":"hyp-a","text":"authored hypothesis a"},
        {"id":"hyp-b","text":"authored hypothesis b"},
        {"id":"hyp-c","text":"authored hypothesis c"}
      ],
      "predictedResponse":"relationship-prediction-secret"
    }'::jsonb,
    'a0000000-0000-4000-8000-000000000000',
    clock_timestamp()-interval '1 day'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002',
    1,
    'paused',
    'standard',
    '{"thoughtOptions":[],"hypotheses":[]}'::jsonb,
    'a0000000-0000-4000-8000-000000000000',
    null
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000003',
    1,
    'published',
    'stop',
    '{"thoughtOptions":[],"hypotheses":[]}'::jsonb,
    'a0000000-0000-4000-8000-000000000000',
    clock_timestamp()-interval '1 day'
  );

insert into public.training_sessions(
  id,
  user_id,
  scene_version_id,
  cohort_id,
  idempotency_key,
  status,
  started_at,
  expires_at,
  completed_at,
  updated_at
) values
  ('a4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',null,clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000003','paused',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',null,clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000004','safety_stopped',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',null,clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000005','abandoned',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '1 day'),
  ('a4000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000011','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000006','safety_stopped',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',null,clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000016','a3000000-0000-4000-8000-000000000001',null,'a5000000-0000-4000-8000-000000000007','safety_stopped',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '1 day');

insert into public.training_completions(
  id,
  user_id,
  session_id,
  scene_version_id,
  cohort_id,
  idempotency_key,
  completed_at
) values
  ('a7000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 hour');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  false
);
select set_config('request.jwt.claim.sub', '', false);
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000010',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  'P0001',
  'unauthenticated',
  'authenticated role without a real JWT subject is rejected'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000011',
      '{"confirmedByUser":true,"context":{"source":"user","signalCode":"serious_threat"}}'::jsonb
    )$$,
  'P0001',
  'unauthenticated',
  'safety creation also requires a real JWT subject'
);
commit;

select ok(
  (
    select cohort_id is null
    from public.training_sessions
    where id = 'a4000000-0000-4000-8000-000000000007'
  ),
  'a legacy-style session row remains nullable without a backfill'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000010","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000010',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select route from public.start_training(
      'a3000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000100'
    )$$,
  $$values ('continue'::text)$$,
  'a new eligible session starts normally'
);
commit;
select is(
  (
    select cohort_id
    from public.training_sessions
    where user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and idempotency_key
        = 'a5000000-0000-4000-8000-000000000100'
  ),
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'exactly one active cohort is pinned at session start'
);

insert into public.cohort_memberships(
  cohort_id,
  user_id,
  joined_at
) values (
  'a1000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000010',
  clock_timestamp()
);
begin;
set local role authenticated;
select results_eq(
  $$select route from public.start_training(
      'a3000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000100'
    )$$,
  $$values ('continue'::text)$$,
  'same-key retry remains compatible after cohort state changes'
);
select results_eq(
  $$select route from public.start_training(
      'a3000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000101'
    )$$,
  $$values ('continue'::text)$$,
  'multiple active cohorts do not block Task 7 session start'
);
commit;
select ok(
  (
    select pg_catalog.bool_and(
      case
        when idempotency_key
          = 'a5000000-0000-4000-8000-000000000100'
        then cohort_id
          = 'a1000000-0000-4000-8000-000000000001'
        when idempotency_key
          = 'a5000000-0000-4000-8000-000000000101'
        then cohort_id is null
      end
    )
    from public.training_sessions
    where user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and idempotency_key in (
        'a5000000-0000-4000-8000-000000000100',
        'a5000000-0000-4000-8000-000000000101'
      )
  ),
  'retry never rewrites the original pin and a multi-cohort start stores null'
);
delete from public.cohort_memberships
where cohort_id = 'a1000000-0000-4000-8000-000000000002'
  and user_id = 'a0000000-0000-4000-8000-000000000010';

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000012","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000012',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select route from public.start_training(
      'a3000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000102'
    )$$,
  $$values ('continue'::text)$$,
  'an existing multiple-cohort participant may still start training'
);
commit;
select ok(
  (
    select cohort_id is null
    from public.training_sessions
    where idempotency_key
      = 'a5000000-0000-4000-8000-000000000102'
  ),
  'a multiple-cohort session never guesses a cohort pin'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000013","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000013',
  false
);
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000100',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  'P0001',
  'active_adult_membership_required',
  'ordinary support requires an active cohort'
);
commit;

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000014","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000014',
  false
);
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000101',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  'P0001',
  'active_adult_membership_required',
  'ordinary support requires active service and adult confirmation'
);
commit;

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000012","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000012',
  false
);
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000102',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  'P0001',
  'cohort_context_ambiguous',
  'ordinary support fails closed for multiple active cohorts'
);
commit;
select is(
  (
    select pg_catalog.count(*)
    from private.progress_idempotency_keys
    where idempotency_key in (
      'a6000000-0000-4000-8000-000000000100',
      'a6000000-0000-4000-8000-000000000101',
      'a6000000-0000-4000-8000-000000000102'
    )
  ),
  0::bigint,
  'eligibility failures bind no global event keys'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000010","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000010',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select created, status, "snapshotShared"
    from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000110',
      '{"kind":"no_snapshot","note":"  please help  "}'::jsonb
    )$$,
  $$values (true, 'submitted'::text, false)$$,
  'no-snapshot support stores one voluntary request'
);
commit;
select ok(
  (
    select
      user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and cohort_id
        = 'a1000000-0000-4000-8000-000000000001'
      and assigned_coach_id is null
      and source_completion_id is null
      and share_kind = 'no_snapshot'
      and note = 'please help'
      and consented_at is null
      and status = 'submitted'
      and first_response_due_at
        = submitted_at + interval '24 hours'
    from public.support_tickets
    where request_id
      = 'a6000000-0000-4000-8000-000000000110'
  ),
  'support ownership, cohort, assignment, note, consent, and due time are server derived'
);
begin;
set local role authenticated;
select results_eq(
  $$select created, status, "snapshotShared"
    from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000110',
      '{"kind":"no_snapshot","note":"please help"}'::jsonb
    )$$,
  $$values (false, 'submitted'::text, false)$$,
  'same request and normalized payload returns the original ticket'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000110',
      '{"kind":"no_snapshot","note":"different"}'::jsonb
    )$$,
  'P0001',
  'idempotency_conflict',
  'same live support key with a different note conflicts'
);
commit;
select is(
  (
    select pg_catalog.count(*)
    from public.support_tickets
    where user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and request_id
        = 'a6000000-0000-4000-8000-000000000110'
  ),
  1::bigint,
  'support idempotency persists one ticket'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000011","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000011',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000110',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  $$values (true)$$,
  'another user may reuse the same request UUID independently'
);
commit;
delete from public.cohort_memberships
where user_id = 'a0000000-0000-4000-8000-000000000011'
  and cohort_id = 'a1000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000110',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  $$values (false)$$,
  'a committed support retry returns before mutable membership revalidation'
);
commit;
insert into public.cohort_memberships(
  cohort_id,
  user_id,
  joined_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000011',
  clock_timestamp() - interval '2 days'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000010","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000010',
  false
);
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000120',
      '[]'::jsonb
    )$$,
  'P0001',
  'invalid_support_request',
  'support input must be an exact object'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000121',
      '{"kind":"no_snapshot","consentToShare":true}'::jsonb
    )$$,
  'P0001',
  'invalid_support_request',
  'no-snapshot input rejects consent keys'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000122',
      '{"kind":"no_snapshot","completionId":"a7000000-0000-4000-8000-000000000001"}'::jsonb
    )$$,
  'P0001',
  'invalid_support_request',
  'no-snapshot input rejects completion keys'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000123',
      '{"kind":"no_snapshot","snapshot":{}}'::jsonb
    )$$,
  'P0001',
  'invalid_support_request',
  'no-snapshot input rejects snapshot keys'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000124',
      '{"kind":"no_snapshot","sessionId":"a4000000-0000-4000-8000-000000000001"}'::jsonb
    )$$,
  'P0001',
  'invalid_support_request',
  'support input accepts no session identifier'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000125',
      '{"kind":"unknown"}'::jsonb
    )$$,
  'P0001',
  'invalid_support_request',
  'support input rejects unknown discriminants'
);
commit;
select is(
  (
    select pg_catalog.count(*)
    from private.progress_idempotency_keys
    where user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and idempotency_key between
        'a6000000-0000-4000-8000-000000000120'
        and 'a6000000-0000-4000-8000-000000000125'
  ),
  0::bigint,
  'invalid exact-key requests bind no event key'
);

begin;
set local role authenticated;
select results_eq(
  format(
    'select created from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000130',
    pg_catalog.jsonb_build_object(
      'kind', 'no_snapshot',
      'note', pg_catalog.repeat('a', 200)
    )::text
  ),
  $$values (true)$$,
  'a 200-code-point note is accepted'
);
select results_eq(
  format(
    'select created from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000131',
    pg_catalog.jsonb_build_object(
      'kind', 'no_snapshot',
      'note', pg_catalog.repeat('😀', 200)
    )::text
  ),
  $$values (true)$$,
  'a 200-code-point and 800-byte emoji note is accepted'
);
select throws_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000132',
    pg_catalog.jsonb_build_object(
      'kind', 'no_snapshot',
      'note', pg_catalog.repeat('a', 201)
    )::text
  ),
  'P0001',
  'note_too_long',
  '201 code points use the stable length surface'
);
select throws_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000133',
    pg_catalog.jsonb_build_object(
      'kind', 'no_snapshot',
      'note', pg_catalog.repeat('😀', 201)
    )::text
  ),
  'P0001',
  'note_too_long',
  'more than 800 UTF-8 bytes uses the stable length surface'
);
select results_eq(
  $$select created from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000134',
      '{"kind":"no_snapshot","note":"   "}'::jsonb
    )$$,
  $$values (true)$$,
  'an empty trimmed note is omitted rather than stored empty'
);
select lives_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    request_id,
    pg_catalog.jsonb_build_object(
      'kind', 'no_snapshot',
      'note', boundary_note
    )::text
  ),
  label
)
from (
  values
    (
      'a6000000-0000-4000-8000-000000000135'::uuid,
      pg_catalog.chr(160) || 'edge' || pg_catalog.chr(160),
      'NBSP is trimmed at note boundaries'
    ),
    (
      'a6000000-0000-4000-8000-000000000136'::uuid,
      pg_catalog.chr(12288) || 'edge' || pg_catalog.chr(12288),
      'ideographic space is trimmed at note boundaries'
    ),
    (
      'a6000000-0000-4000-8000-000000000137'::uuid,
      pg_catalog.chr(65279) || 'edge' || pg_catalog.chr(65279),
      'BOM is trimmed at note boundaries'
    ),
    (
      'a6000000-0000-4000-8000-000000000138'::uuid,
      pg_catalog.chr(9) || 'edge' || pg_catalog.chr(9),
      'tab is trimmed at note boundaries'
    ),
    (
      'a6000000-0000-4000-8000-000000000148'::uuid,
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
        || 'edge'
        || pg_catalog.chr(65279)
        || pg_catalog.chr(12288)
        || pg_catalog.chr(8287)
        || pg_catalog.chr(8239)
        || pg_catalog.chr(8233)
        || pg_catalog.chr(8232)
        || pg_catalog.chr(8202)
        || pg_catalog.chr(8201)
        || pg_catalog.chr(8200)
        || pg_catalog.chr(8199)
        || pg_catalog.chr(8198)
        || pg_catalog.chr(8197)
        || pg_catalog.chr(8196)
        || pg_catalog.chr(8195)
        || pg_catalog.chr(8194)
        || pg_catalog.chr(8193)
        || pg_catalog.chr(8192)
        || pg_catalog.chr(5760)
        || pg_catalog.chr(160)
        || pg_catalog.chr(32)
        || pg_catalog.chr(13)
        || pg_catalog.chr(12)
        || pg_catalog.chr(11)
        || pg_catalog.chr(10)
        || pg_catalog.chr(9),
      'the full ECMAScript whitespace set is trimmed at note boundaries'
    )
) as boundary_note(
  request_id,
  boundary_note,
  label
);
commit;
select ok(
  (
    select note is null
    from public.support_tickets
    where request_id
      = 'a6000000-0000-4000-8000-000000000134'
  ),
  'empty optional note is stored as null'
);
select results_eq(
  $$select request_id, note
    from public.support_tickets
    where request_id in (
      'a6000000-0000-4000-8000-000000000135',
      'a6000000-0000-4000-8000-000000000136',
      'a6000000-0000-4000-8000-000000000137',
      'a6000000-0000-4000-8000-000000000138',
      'a6000000-0000-4000-8000-000000000148'
    )
    order by request_id$$,
  $$values
      ('a6000000-0000-4000-8000-000000000135'::uuid, 'edge'::text),
      ('a6000000-0000-4000-8000-000000000136'::uuid, 'edge'::text),
      ('a6000000-0000-4000-8000-000000000137'::uuid, 'edge'::text),
      ('a6000000-0000-4000-8000-000000000138'::uuid, 'edge'::text),
      ('a6000000-0000-4000-8000-000000000148'::uuid, 'edge'::text)$$,
  'all ECMAScript boundary forms store one identical normalized note'
);
select throws_ok(
  format(
    $sql$insert into public.support_tickets(
        user_id,
        cohort_id,
        request_id,
        share_kind,
        note,
        submitted_at,
        first_response_due_at,
        status
      ) values (
        'a0000000-0000-4000-8000-000000000010',
        'a1000000-0000-4000-8000-000000000001',
        'a6000000-0000-4000-8000-000000000139',
        'no_snapshot',
        %L,
        now(),
        now() + interval '24 hours',
        'submitted'
      )$sql$,
    pg_catalog.chr(160) || 'edge' || pg_catalog.chr(160)
  ),
  '23514',
  null,
  'table constraints reject an unnormalized ECMAScript-trim note'
);

begin;
set local role authenticated;
select throws_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    request_id,
    pg_catalog.jsonb_build_object(
      'kind', 'no_snapshot',
      'note', 'safe' || invalid_character || 'text'
    )::text
  ),
  'P0001',
  'note_invalid_characters',
  label
)
from (
  values
    ('a6000000-0000-4000-8000-000000000140'::uuid, pg_catalog.chr(10), 'C0 controls are rejected'),
    ('a6000000-0000-4000-8000-000000000141'::uuid, pg_catalog.chr(133), 'C1 controls are rejected'),
    ('a6000000-0000-4000-8000-000000000142'::uuid, pg_catalog.chr(1564), 'Arabic letter mark is rejected'),
    ('a6000000-0000-4000-8000-000000000143'::uuid, pg_catalog.chr(8206), 'left-to-right mark is rejected'),
    ('a6000000-0000-4000-8000-000000000144'::uuid, pg_catalog.chr(8207), 'right-to-left mark is rejected'),
    ('a6000000-0000-4000-8000-000000000145'::uuid, pg_catalog.chr(8238), 'bidi override is rejected'),
    ('a6000000-0000-4000-8000-000000000146'::uuid, pg_catalog.chr(8297), 'bidi isolate is rejected'),
    ('a6000000-0000-4000-8000-000000000147'::uuid, pg_catalog.chr(9), 'internal C0 tab is rejected')
) as invalid_note(request_id, invalid_character, label);
commit;
select is(
  (
    select pg_catalog.count(*)
    from private.progress_idempotency_keys
    where idempotency_key between
      'a6000000-0000-4000-8000-000000000132'
      and 'a6000000-0000-4000-8000-000000000148'
  ),
  6::bigint,
  'only accepted normalized notes bind keys in the rejected-note range'
);

begin;
set local role authenticated;
create temporary table snapshot_ticket_ref as
select "ticketId" as ticket_id
from public.create_support_ticket(
  'a6000000-0000-4000-8000-000000000150',
  pg_temp.snapshot_ticket_input(
    'a7000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    '  snapshot note  '
  )
);
commit;
select ok(
  (
    select
      ticket_row.user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and ticket_row.cohort_id
        = 'a1000000-0000-4000-8000-000000000001'
      and ticket_row.assigned_coach_id is null
      and ticket_row.source_completion_id
        = 'a7000000-0000-4000-8000-000000000001'
      and ticket_row.share_kind
        = 'current_training_snapshot'
      and ticket_row.note = 'snapshot note'
      and ticket_row.consented_at
        = ticket_row.submitted_at
      and snapshot_row.completion_id
        = ticket_row.source_completion_id
      and snapshot_row.scene_version_id
        = 'a3000000-0000-4000-8000-000000000001'
      and snapshot_row.shared_at
        = ticket_row.submitted_at
    from public.support_tickets as ticket_row
    join public.support_ticket_snapshots as snapshot_row
      on snapshot_row.ticket_id = ticket_row.id
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000150'
  ),
  'consented support derives exact completion, cohort, ownership, and timestamps'
);
select ok(
  (
    select
      private.jsonb_has_exact_keys(
        snapshot_row.snapshot,
        array[
          'sceneVersionId',
          'selectedThought',
          'selectedHypothesisIds',
          'evidence'
        ]
      )
      and snapshot_row.snapshot::text
        not like '%authored title%'
      and snapshot_row.snapshot::text
        not like '%relationship-prediction-secret%'
      and snapshot_row.snapshot::text
        not like '%feedback%'
      and snapshot_row.snapshot::text
        not like '%expression%'
    from public.support_ticket_snapshots as snapshot_row
    join public.support_tickets as ticket_row
      on ticket_row.id = snapshot_row.ticket_id
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000150'
  ),
  'stored snapshot has exactly four approved fields and no authored prose or prediction'
);

begin;
set local role authenticated;
select results_eq(
  $$select created, "snapshotShared"
    from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000150',
      pg_temp.snapshot_ticket_input(
        'a7000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001',
        'snapshot note'
      )
    )$$,
  $$values (false, true)$$,
  'same semantic snapshot request returns the original row'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000150',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001',
          'snapshot note'
        ),
        '{snapshot,evidence,nextNeed}',
        '"boundary"'::jsonb
      )
    )$$,
  'P0001',
  'idempotency_conflict',
  'same live snapshot key with a changed evidence value conflicts'
);
commit;

begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000151',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,evidence,danger}',
        '"present"'::jsonb
      )
    )$$,
  'P0001',
  'safety_required',
  'danger-present evidence routes to the stable safety surface'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000152',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,selectedHypothesisIds}',
        '["hyp-a"]'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'a snapshot requires at least two hypothesis IDs'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000157',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,selectedHypothesisIds}',
        '{"hyp-a":true}'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'a non-array hypothesis value uses the stable support boundary error'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000153',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,selectedHypothesisIds}',
        '["hyp-b","hyp-a"]'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'hypothesis IDs must be sorted'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000154',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,selectedHypothesisIds}',
        '["hyp-a","hyp-a"]'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'hypothesis IDs must be unique'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000155',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,selectedHypothesisIds}',
        '["hyp-a","hyp-forged"]'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'all hypothesis IDs must exist in the pinned payload'
);
select throws_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000156',
    pg_catalog.jsonb_set(
      pg_temp.snapshot_ticket_input(
        'a7000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001'
      ),
      '{snapshot,selectedThought,optionId}',
      pg_catalog.to_jsonb(pg_catalog.repeat('x', 17000))
    )::text
  ),
  'P0001',
  'invalid_support_request',
  'a snapshot beyond 16 KiB is rejected before storage'
);
commit;
select ok(
  (
    select pg_catalog.count(*) = 0
    from public.support_tickets
    where request_id between
      'a6000000-0000-4000-8000-000000000151'
      and 'a6000000-0000-4000-8000-000000000157'
  )
  and (
    select pg_catalog.count(*) = 0
    from private.progress_idempotency_keys
    where idempotency_key between
      'a6000000-0000-4000-8000-000000000151'
      and 'a6000000-0000-4000-8000-000000000157'
  ),
  'danger, invalid hypotheses, and oversize snapshots leave no partial rows or key bindings'
);

select is(
  pg_catalog.octet_length(
    pg_temp.sized_snapshot_text(
      'a3000000-0000-4000-8000-000000000001',
      16384
    )
  ),
  16384,
  'the boundary fixture is exactly 16 KiB as compact JSON'
);
select is(
  private.jsonb_compact_octet_length(
    pg_temp.sized_snapshot(
      'a3000000-0000-4000-8000-000000000001',
      16384
    )
  ),
  16384,
  'database compact-byte accounting matches the exact 16 KiB fixture'
);
update public.scene_versions
set payload = pg_catalog.jsonb_set(
  payload,
  '{thoughtOptions}',
  payload -> 'thoughtOptions'
    || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id',
        pg_temp.sized_snapshot(
          'a3000000-0000-4000-8000-000000000001',
          16384
        ) #>> '{selectedThought,optionId}'
      )
    )
)
where id = 'a3000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
select lives_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000158',
    pg_catalog.jsonb_build_object(
      'kind', 'current_training_snapshot',
      'consentToShare', true,
      'completionId',
        'a7000000-0000-4000-8000-000000000001',
      'snapshot',
        pg_temp.sized_snapshot(
          'a3000000-0000-4000-8000-000000000001',
          16384
        )
    )::text
  ),
  'an exact 16 KiB compact snapshot is accepted'
);
commit;
select ok(
  (
    select snapshot_row.snapshot = pg_temp.sized_snapshot(
      'a3000000-0000-4000-8000-000000000001',
      16384
    )
      and pg_catalog.octet_length(snapshot_row.snapshot::text)
        > 16384
    from public.support_ticket_snapshots as snapshot_row
    join public.support_tickets as ticket_row
      on ticket_row.id = snapshot_row.ticket_id
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000158'
  ),
  'the 16 KiB compact snapshot is stored even though jsonb display text is larger'
);
update public.scene_versions
set payload = payload #- '{thoughtOptions,2}'
where id = 'a3000000-0000-4000-8000-000000000001';

select is(
  pg_catalog.octet_length(
    pg_temp.sized_snapshot_text(
      'a3000000-0000-4000-8000-000000000001',
      16385
    )
  ),
  16385,
  'the over-limit fixture is exactly 16 KiB plus one compact JSON byte'
);
select is(
  private.jsonb_compact_octet_length(
    pg_temp.sized_snapshot(
      'a3000000-0000-4000-8000-000000000001',
      16385
    )
  ),
  16385,
  'database compact-byte accounting matches the over-limit fixture'
);
update public.scene_versions
set payload = pg_catalog.jsonb_set(
  payload,
  '{thoughtOptions}',
  payload -> 'thoughtOptions'
    || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id',
        pg_temp.sized_snapshot(
          'a3000000-0000-4000-8000-000000000001',
          16385
        ) #>> '{selectedThought,optionId}'
      )
    )
)
where id = 'a3000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
select throws_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    'a6000000-0000-4000-8000-000000000159',
    pg_catalog.jsonb_build_object(
      'kind', 'current_training_snapshot',
      'consentToShare', true,
      'completionId',
        'a7000000-0000-4000-8000-000000000001',
      'snapshot',
        pg_temp.sized_snapshot(
          'a3000000-0000-4000-8000-000000000001',
          16385
        )
    )::text
  ),
  'P0001',
  'invalid_support_request',
  'a 16 KiB plus one compact snapshot is rejected'
);
commit;
update public.scene_versions
set payload = payload #- '{thoughtOptions,2}'
where id = 'a3000000-0000-4000-8000-000000000001';
select ok(
  not exists (
    select 1
    from public.support_tickets
    where request_id
      = 'a6000000-0000-4000-8000-000000000159'
  )
  and not exists (
    select 1
    from private.progress_idempotency_keys
    where idempotency_key
      = 'a6000000-0000-4000-8000-000000000159'
  ),
  'an over-limit compact snapshot leaves no row or event-key binding'
);

begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000170',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{consentToShare}',
        'false'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'current snapshot requires explicit true consent'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000171',
      (
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ) - 'completionId'
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'current snapshot requires the exact completion ID'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000172',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,extra}',
        'true'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'snapshot rejects an extra nested key'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000173',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,selectedThought,extra}',
        'true'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'selected thought rejects an extra nested key'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000174',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,evidence,extra}',
        'true'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'evidence rejects an extra nested key'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000175',
      pg_catalog.jsonb_set(
        pg_temp.snapshot_ticket_input(
          'a7000000-0000-4000-8000-000000000001',
          'a3000000-0000-4000-8000-000000000001'
        ),
        '{snapshot,evidence,recurrence}',
        '"always"'::jsonb
      )
    )$$,
  'P0001',
  'invalid_support_request',
  'evidence rejects an unknown enum value'
);
commit;

begin;
set local role authenticated;
select results_eq(
  format(
    'select created from public.create_support_ticket(%L::uuid,%L::jsonb)',
    request_id,
    pg_catalog.jsonb_set(
      pg_temp.snapshot_ticket_input(
        'a7000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001'
      ),
      json_path,
      selected_value
    )::text
  ),
  $$values (true)$$,
  label
)
from (
  values
    ('a6000000-0000-4000-8000-000000000330'::uuid, array['snapshot','selectedThought'], '{"kind":"uncertain"}'::jsonb, 'uncertain first thought is valid'),
    ('a6000000-0000-4000-8000-000000000331'::uuid, array['snapshot','selectedThought'], '{"kind":"multiple"}'::jsonb, 'multiple first thought is valid'),
    ('a6000000-0000-4000-8000-000000000332'::uuid, array['snapshot','selectedThought'], '{"kind":"none"}'::jsonb, 'none first thought is valid'),
    ('a6000000-0000-4000-8000-000000000333'::uuid, array['snapshot','evidence','recurrence'], '"repeated"'::jsonb, 'repeated recurrence is valid'),
    ('a6000000-0000-4000-8000-000000000334'::uuid, array['snapshot','evidence','recurrence'], '"unknown"'::jsonb, 'unknown recurrence is valid'),
    ('a6000000-0000-4000-8000-000000000335'::uuid, array['snapshot','evidence','knownFacts'], '"partial"'::jsonb, 'partial facts are valid'),
    ('a6000000-0000-4000-8000-000000000336'::uuid, array['snapshot','evidence','knownFacts'], '"none-yet"'::jsonb, 'no facts yet is valid'),
    ('a6000000-0000-4000-8000-000000000337'::uuid, array['snapshot','evidence','assumptions'], '"present"'::jsonb, 'present assumptions are valid'),
    ('a6000000-0000-4000-8000-000000000338'::uuid, array['snapshot','evidence','assumptions'], '"uncertain"'::jsonb, 'uncertain assumptions are valid'),
    ('a6000000-0000-4000-8000-000000000339'::uuid, array['snapshot','evidence','danger'], '"uncertain"'::jsonb, 'uncertain danger is valid for ordinary help'),
    ('a6000000-0000-4000-8000-000000000340'::uuid, array['snapshot','evidence','directlySolvable'], '"yes"'::jsonb, 'directly solvable yes is valid'),
    ('a6000000-0000-4000-8000-000000000341'::uuid, array['snapshot','evidence','directlySolvable'], '"no"'::jsonb, 'directly solvable no is valid'),
    ('a6000000-0000-4000-8000-000000000342'::uuid, array['snapshot','evidence','directlySolvable'], '"unknown"'::jsonb, 'directly solvable unknown is valid'),
    ('a6000000-0000-4000-8000-000000000343'::uuid, array['snapshot','evidence','nextNeed'], '"stabilize"'::jsonb, 'stabilize need is valid'),
    ('a6000000-0000-4000-8000-000000000344'::uuid, array['snapshot','evidence','nextNeed'], '"verify"'::jsonb, 'verify need is valid'),
    ('a6000000-0000-4000-8000-000000000345'::uuid, array['snapshot','evidence','nextNeed'], '"solve"'::jsonb, 'solve need is valid'),
    ('a6000000-0000-4000-8000-000000000346'::uuid, array['snapshot','evidence','nextNeed'], '"boundary"'::jsonb, 'boundary need is valid')
) as valid_snapshot_variant(
  request_id,
  json_path,
  selected_value,
  label
);
commit;

insert into public.training_sessions(
  id,
  user_id,
  scene_version_id,
  cohort_id,
  idempotency_key,
  status,
  started_at,
  expires_at,
  completed_at,
  updated_at
) values
  ('a4000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000020','active',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',null,clock_timestamp()-interval '2 hours'),
  ('a4000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001',null,'a5000000-0000-4000-8000-000000000021','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000022','a0000000-0000-4000-8000-000000000011','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000022','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000023','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000023','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000024','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000024','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000025','a0000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000025','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour');

insert into public.training_completions(
  id,
  user_id,
  session_id,
  scene_version_id,
  cohort_id,
  idempotency_key,
  completed_at
) values
  ('a7000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000020','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000020',clock_timestamp()-interval '1 hour'),
  ('a7000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000021','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000021',clock_timestamp()-interval '1 hour'),
  ('a7000000-0000-4000-8000-000000000022','a0000000-0000-4000-8000-000000000011','a4000000-0000-4000-8000-000000000022','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000022',clock_timestamp()-interval '1 hour'),
  ('a7000000-0000-4000-8000-000000000023','a0000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000023','a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000023',clock_timestamp()-interval '1 hour'),
  ('a7000000-0000-4000-8000-000000000024','a0000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000024','a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000024',clock_timestamp()-interval '1 hour'),
  ('a7000000-0000-4000-8000-000000000025','a0000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000025','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000025',clock_timestamp()-interval '1 hour');

begin;
set local role authenticated;
select throws_ok(
  format(
    'select * from public.create_support_ticket(%L::uuid,%L::jsonb)',
    request_id,
    pg_temp.snapshot_ticket_input(
      completion_id,
      scene_version_id
    )::text
  ),
  'P0001',
  'support_source_unavailable',
  label
)
from (
  values
    ('a6000000-0000-4000-8000-000000000180'::uuid,'a7000000-0000-4000-8000-000000000020'::uuid,'a3000000-0000-4000-8000-000000000001'::uuid,'an active source session is unavailable'),
    ('a6000000-0000-4000-8000-000000000181'::uuid,'a7000000-0000-4000-8000-000000000021'::uuid,'a3000000-0000-4000-8000-000000000001'::uuid,'a legacy null session pin is unavailable'),
    ('a6000000-0000-4000-8000-000000000182'::uuid,'a7000000-0000-4000-8000-000000000022'::uuid,'a3000000-0000-4000-8000-000000000001'::uuid,'a foreign completion is unavailable'),
    ('a6000000-0000-4000-8000-000000000183'::uuid,'a7000000-0000-4000-8000-000000000023'::uuid,'a3000000-0000-4000-8000-000000000003'::uuid,'a stop-risk source is unavailable'),
    ('a6000000-0000-4000-8000-000000000184'::uuid,'a7000000-0000-4000-8000-000000000024'::uuid,'a3000000-0000-4000-8000-000000000002'::uuid,'a non-published source is unavailable'),
    ('a6000000-0000-4000-8000-000000000185'::uuid,'a7000000-0000-4000-8000-000000000025'::uuid,'a3000000-0000-4000-8000-000000000001'::uuid,'a completion and session cohort mismatch is unavailable'),
    ('a6000000-0000-4000-8000-000000000186'::uuid,'afffffff-ffff-4fff-8fff-ffffffffffff'::uuid,'a3000000-0000-4000-8000-000000000001'::uuid,'a missing completion is unavailable')
) as unavailable_source(
  request_id,
  completion_id,
  scene_version_id,
  label
);
commit;
select is(
  (
    select pg_catalog.count(*)
    from private.progress_idempotency_keys
    where idempotency_key between
      'a6000000-0000-4000-8000-000000000180'
      and 'a6000000-0000-4000-8000-000000000186'
  ),
  0::bigint,
  'unavailable support sources bind no event key'
);

update public.scene_versions
set status = 'paused'
where id = 'a3000000-0000-4000-8000-000000000001';
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000187',
      pg_temp.snapshot_ticket_input(
        'a7000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001'
      )
    )$$,
  'P0001',
  'support_source_unavailable',
  'a source withdrawn after completion is unavailable'
);
commit;
update public.scene_versions
set status = 'published'
where id = 'a3000000-0000-4000-8000-000000000001';

insert into public.cohort_memberships(
  cohort_id,
  user_id,
  joined_at
) values (
  'a1000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000010',
  clock_timestamp()
);
delete from public.cohort_memberships
where cohort_id = 'a1000000-0000-4000-8000-000000000001'
  and user_id = 'a0000000-0000-4000-8000-000000000010';
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000188',
      pg_temp.snapshot_ticket_input(
        'a7000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001'
      )
    )$$,
  'P0001',
  'support_source_unavailable',
  'a transferred participant cannot share an old pinned completion'
);
commit;
delete from public.cohort_memberships
where cohort_id = 'a1000000-0000-4000-8000-000000000002'
  and user_id = 'a0000000-0000-4000-8000-000000000010';
insert into public.cohort_memberships(
  cohort_id,
  user_id,
  joined_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000010',
  clock_timestamp()-interval '2 days'
);

insert into private.progress_idempotency_keys(
  user_id,
  idempotency_key,
  event_kind,
  source_id,
  bound_at
) values
  ('a0000000-0000-4000-8000-000000000010','a6000000-0000-4000-8000-000000000190','completion','a4000000-0000-4000-8000-000000000001',clock_timestamp()),
  ('a0000000-0000-4000-8000-000000000010','a6000000-0000-4000-8000-000000000191','review','a7000000-0000-4000-8000-000000000001',clock_timestamp());
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000190',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  'P0001',
  'idempotency_conflict',
  'a completion event key cannot be reused for support'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000191',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  'P0001',
  'idempotency_conflict',
  'a review event key cannot be reused for safety'
);
commit;

begin;
set local role authenticated;
create temporary table no_snapshot_ticket_ref as
select "ticketId" as ticket_id
from public.create_support_ticket(
  'a6000000-0000-4000-8000-000000000160',
  '{"kind":"no_snapshot","note":"keep me"}'::jsonb
);
select throws_ok(
  $$select * from public.revoke_support_consent(
      (select ticket_id from no_snapshot_ticket_ref),
      'a9000000-0000-4000-8000-000000000160'
    )$$,
  'P0001',
  'support_consent_not_shared',
  'consent revocation is not a generic no-snapshot withdrawal'
);
commit;
select ok(
  (
    select status = 'submitted'
      and note = 'keep me'
      and withdrawn_at is null
    from public.support_tickets
    where request_id
      = 'a6000000-0000-4000-8000-000000000160'
  ),
  'rejected no-snapshot revocation changes nothing'
);

begin;
set local role authenticated;
select results_eq(
  $$select status, "snapshotShared"
    from public.revoke_support_consent(
      (select ticket_id from snapshot_ticket_ref),
      'a9000000-0000-4000-8000-000000000150'
    )$$,
  $$values ('withdrawn'::text, false)$$,
  'snapshot consent revocation withdraws the ordinary help request'
);
commit;
select ok(
  (
    select
      ticket_row.status = 'withdrawn'
      and ticket_row.note is null
      and ticket_row.withdrawal_request_id
        = 'a9000000-0000-4000-8000-000000000150'
      and ticket_row.withdrawn_at is not null
      and not exists (
        select 1
        from public.support_ticket_snapshots as snapshot_row
        where snapshot_row.ticket_id = ticket_row.id
      )
    from public.support_tickets as ticket_row
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000150'
  ),
  'revocation immediately clears note and snapshot and records withdrawal'
);
begin;
set local role authenticated;
select results_eq(
  $$select status, "snapshotShared"
    from public.revoke_support_consent(
      (select ticket_id from snapshot_ticket_ref),
      'a9000000-0000-4000-8000-000000000151'
    )$$,
  $$values ('withdrawn'::text, false)$$,
  'a new revocation request replays the stable withdrawn result'
);
select results_eq(
  $$select created, status, "snapshotShared"
    from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000150',
      '{"different":"payload"}'::jsonb
    )$$,
  $$values (false, 'withdrawn'::text, false)$$,
  'the original create key is a terminal tombstone after withdrawal'
);
commit;
select ok(
  (
    select note is null
      and status = 'withdrawn'
      and withdrawal_request_id
        = 'a9000000-0000-4000-8000-000000000150'
    from public.support_tickets
    where request_id
      = 'a6000000-0000-4000-8000-000000000150'
  )
  and not exists (
    select 1
    from public.support_ticket_snapshots as snapshot_row
    join public.support_tickets as ticket_row
      on ticket_row.id = snapshot_row.ticket_id
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000150'
  ),
  'revocation replay and create replay never restore note or snapshot'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000011","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000011',
  false
);
begin;
set local role authenticated;
select throws_ok(
  $$select * from public.revoke_support_consent(
      (select ticket_id from snapshot_ticket_ref),
      'a9000000-0000-4000-8000-000000000152'
    )$$,
  'P0001',
  'support_ticket_not_found',
  'a foreign ticket uses the stable not-found surface'
);
select throws_ok(
  $$select * from public.revoke_support_consent(
      'afffffff-ffff-4fff-8fff-ffffffffffff',
      'a9000000-0000-4000-8000-000000000153'
    )$$,
  'P0001',
  'support_ticket_not_found',
  'a missing ticket is indistinguishable from a foreign ticket'
);
commit;

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000010","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000010',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select route from public.stop_training_for_safety(
      'a4000000-0000-4000-8000-000000000002'
    )$$,
  $$values ('safety-stop'::text)$$,
  'an active session independently stops for safety'
);
select results_eq(
  $$select route from public.stop_training_for_safety(
      'a4000000-0000-4000-8000-000000000003'
    )$$,
  $$values ('safety-stop'::text)$$,
  'a paused session independently stops for safety'
);
select results_eq(
  $$select route from public.stop_training_for_safety(
      'a4000000-0000-4000-8000-000000000004'
    )$$,
  $$values ('safety-stop'::text)$$,
  'an already stopped session returns the same route'
);
select results_eq(
  $$select route from public.stop_training_for_safety(
      'a4000000-0000-4000-8000-000000000001'
    )$$,
  $$values ('safety-stop'::text)$$,
  'a completed session keeps its terminal state but returns safety'
);
select results_eq(
  $$select route from public.stop_training_for_safety(
      'a4000000-0000-4000-8000-000000000005'
    )$$,
  $$values ('safety-stop'::text)$$,
  'an abandoned session keeps its terminal state but returns safety'
);
select throws_ok(
  $$select * from public.stop_training_for_safety(
      'a4000000-0000-4000-8000-000000000006'
    )$$,
  'P0001',
  'session_not_found',
  'a foreign session uses the stable not-found surface'
);
select throws_ok(
  $$select * from public.stop_training_for_safety(
      'afffffff-ffff-4fff-8fff-ffffffffffff'
    )$$,
  'P0001',
  'session_not_found',
  'a missing session is indistinguishable from a foreign session'
);
select results_eq(
  $$select public.check_training_session(
      'a4000000-0000-4000-8000-000000000002'
    )$$,
  $$values ('safety-stop'::text)$$,
  'another route check observes the persisted safety stop'
);
commit;
select ok(
  (
    select pg_catalog.bool_and(
      case
        when id in (
          'a4000000-0000-4000-8000-000000000002',
          'a4000000-0000-4000-8000-000000000003',
          'a4000000-0000-4000-8000-000000000004'
        ) then status = 'safety_stopped'
        when id
          = 'a4000000-0000-4000-8000-000000000001'
        then status = 'completed'
        when id
          = 'a4000000-0000-4000-8000-000000000005'
        then status = 'abandoned'
      end
    )
    from public.training_sessions
    where id between
      'a4000000-0000-4000-8000-000000000001'
      and 'a4000000-0000-4000-8000-000000000005'
  ),
  'safety stop changes only active or paused sessions'
);
select is(
  (
    select pg_catalog.count(*)
    from public.safety_reports
    where user_id
      = 'a0000000-0000-4000-8000-000000000010'
  ),
  0::bigint,
  'stopping a session creates no safety report'
);

begin;
set local role authenticated;
select results_eq(
  $$select created, status from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000200',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  $$values (true, 'submitted'::text)$$,
  'a separately confirmed generic user safety report is accepted'
);
commit;
select ok(
  (
    select
      user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and session_id is null
      and scene_version_id is null
      and cohort_id
        = 'a1000000-0000-4000-8000-000000000001'
      and assigned_supervisor_id is null
      and source = 'user'
      and signal_code = 'serious_threat'
      and status = 'submitted'
    from public.safety_reports
    where request_id
      = 'a6000000-0000-4000-8000-000000000200'
  ),
  'generic safety ownership and an exactly-one cohort route are server derived'
);
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000200',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  $$values (false)$$,
  'same semantic safety request returns the original report'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000200',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"coercive_control"
        }
      }'::jsonb
    )$$,
  'P0001',
  'idempotency_conflict',
  'same live safety key with a changed signal conflicts'
);
select throws_ok(
  $$select * from public.create_support_ticket(
      'a6000000-0000-4000-8000-000000000200',
      '{"kind":"no_snapshot"}'::jsonb
    )$$,
  'P0001',
  'idempotency_conflict',
  'a safety event key cannot be reused for support'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000110',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"coercive_control"
        }
      }'::jsonb
    )$$,
  'P0001',
  'idempotency_conflict',
  'a support event key cannot be reused for safety'
);
commit;

begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000201',
      '{
        "confirmedByUser":true,
        "sessionId":"a4000000-0000-4000-8000-000000000004",
        "context":{"source":"server"}
      }'::jsonb
    )$$,
  $$values (true)$$,
  'server safety context is accepted only with an owned stopped session'
);
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000202',
      '{
        "confirmedByUser":true,
        "sessionId":"a4000000-0000-4000-8000-000000000003",
        "context":{
          "source":"user",
          "signalCode":"user_declared_danger"
        }
      }'::jsonb
    )$$,
  $$values (true)$$,
  'user safety context may bind the exact stopped session'
);
commit;
select ok(
  (
    select pg_catalog.bool_and(
      user_id
        = 'a0000000-0000-4000-8000-000000000010'
      and scene_version_id
        = 'a3000000-0000-4000-8000-000000000001'
      and cohort_id
        = 'a1000000-0000-4000-8000-000000000001'
      and assigned_supervisor_id is null
      and (
        (
          request_id
            = 'a6000000-0000-4000-8000-000000000201'
          and source = 'server'
          and signal_code is null
        )
        or (
          request_id
            = 'a6000000-0000-4000-8000-000000000202'
          and source = 'user'
          and signal_code = 'user_declared_danger'
        )
      )
    )
    from public.safety_reports
    where request_id in (
      'a6000000-0000-4000-8000-000000000201',
      'a6000000-0000-4000-8000-000000000202'
    )
  ),
  'session reports persist only derived scene/cohort and typed source/signal'
);

begin;
set local role authenticated;
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000210',
      '{
        "confirmedByUser":false,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'safety reporting requires a separate active confirmation'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000211',
      '{
        "confirmedByUser":true,
        "context":{"source":"server"}
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'server source requires an owned session identifier'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000212',
      '{
        "confirmedByUser":true,
        "sessionId":"a4000000-0000-4000-8000-000000000004",
        "context":{
          "source":"server",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'server context cannot invent a signal code'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000213',
      '{
        "confirmedByUser":true,
        "context":{"source":"user"}
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'user context requires one controlled signal'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000214',
      '{
        "confirmedByUser":true,
        "priority":"urgent",
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'safety input has no priority or immediate-service flag'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000215',
      '{
        "confirmedByUser":true,
        "cohortId":"a1000000-0000-4000-8000-000000000001",
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'the browser cannot select a safety cohort'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000216',
      '{
        "confirmedByUser":true,
        "sessionId":"a4000000-0000-4000-8000-000000000006",
        "context":{"source":"server"}
      }'::jsonb
    )$$,
  'P0001',
  'safety_source_unavailable',
  'a foreign stopped session uses the stable unavailable surface'
);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000217',
      '{
        "confirmedByUser":true,
        "sessionId":"afffffff-ffff-4fff-8fff-ffffffffffff",
        "context":{"source":"server"}
      }'::jsonb
    )$$,
  'P0001',
  'safety_source_unavailable',
  'a missing session is indistinguishable from a foreign session'
);
commit;
select is(
  (
    select pg_catalog.count(*)
    from private.progress_idempotency_keys
    where idempotency_key between
      'a6000000-0000-4000-8000-000000000210'
      and 'a6000000-0000-4000-8000-000000000217'
  ),
  0::bigint,
  'invalid or unavailable safety requests bind no event key'
);

begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000210',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"medical_emergency"
        }
      }'::jsonb
    )$$,
  $$values (true)$$,
  'a rejected request key remains available for a later valid request'
);
commit;

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000013","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000013',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000220',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"bullying_or_retaliation"
        }
      }'::jsonb
    )$$,
  $$values (true)$$,
  'safety reports do not require ordinary active membership'
);
commit;
select ok(
  (
    select cohort_id is null
      and session_id is null
      and scene_version_id is null
    from public.safety_reports
    where request_id
      = 'a6000000-0000-4000-8000-000000000220'
  ),
  'zero active cohorts yields nullable central-queue routing'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000012","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000012',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000221',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"coercive_control"
        }
      }'::jsonb
    )$$,
  $$values (true)$$,
  'multiple cohorts never block a generic safety report'
);
commit;
select ok(
  (
    select cohort_id is null
    from public.safety_reports
    where request_id
      = 'a6000000-0000-4000-8000-000000000221'
  ),
  'multiple cohorts yield nullable central-queue routing'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000015","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000015',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000222',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"self_harm_or_suicide"
        }
      }'::jsonb
    )$$,
  $$values (true)$$,
  'a closed cohort does not block generic safety reporting'
);
commit;
select ok(
  (
    select cohort_id is null
    from public.safety_reports
    where request_id
      = 'a6000000-0000-4000-8000-000000000222'
  ),
  'a closed cohort is never guessed as a safety route'
);

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
) values (
  'a4000000-0000-4000-8000-000000000008',
  'a0000000-0000-4000-8000-000000000016',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000008',
  'safety_stopped',
  clock_timestamp()-interval '1 hour',
  clock_timestamp()+interval '23 hours',
  clock_timestamp()-interval '1 hour'
);
delete from public.cohort_memberships
where user_id
  = 'a0000000-0000-4000-8000-000000000016';
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000016","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000016',
  false
);
begin;
set local role authenticated;
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000223',
      '{
        "confirmedByUser":true,
        "sessionId":"a4000000-0000-4000-8000-000000000008",
        "context":{"source":"server"}
      }'::jsonb
    )$$,
  $$values (true)$$,
  'a stopped-session report survives later cohort exit'
);
select results_eq(
  $$select created from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000224',
      '{
        "confirmedByUser":true,
        "sessionId":"a4000000-0000-4000-8000-000000000007",
        "context":{"source":"server"}
      }'::jsonb
    )$$,
  $$values (true)$$,
  'a legacy null-pin stopped session still reaches the safety queue'
);
commit;
select ok(
  (
    select pg_catalog.bool_and(
      case
        when request_id
          = 'a6000000-0000-4000-8000-000000000223'
        then cohort_id
          = 'a1000000-0000-4000-8000-000000000001'
        when request_id
          = 'a6000000-0000-4000-8000-000000000224'
        then cohort_id is null
      end
    )
    from public.safety_reports
    where request_id in (
      'a6000000-0000-4000-8000-000000000223',
      'a6000000-0000-4000-8000-000000000224'
    )
  ),
  'session safety routing preserves the creation-time pin, including null'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000010","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000010',
  false
);
begin;
set local role authenticated;
select results_eq(
  format(
    'select created from public.create_safety_report(%L::uuid,%L::jsonb)',
    request_id,
    pg_catalog.jsonb_build_object(
      'confirmedByUser', true,
      'context', pg_catalog.jsonb_build_object(
        'source', 'user',
        'signalCode', signal_code
      )
    )::text
  ),
  $$values (true)$$,
  label
)
from (
  values
    ('a6000000-0000-4000-8000-000000000225'::uuid,'physical_or_sexual_violence','physical or sexual violence is a valid controlled signal'),
    ('a6000000-0000-4000-8000-000000000226'::uuid,'child_abuse_or_exploitation','child abuse or exploitation is a valid controlled signal')
) as remaining_signal(request_id, signal_code, label);
select throws_ok(
  $$select * from public.create_safety_report(
      'a6000000-0000-4000-8000-000000000227',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"invented_signal"
        }
      }'::jsonb
    )$$,
  'P0001',
  'invalid_safety_report_request',
  'an invented safety signal is rejected'
);
commit;

insert into public.training_sessions(
  id,
  user_id,
  scene_version_id,
  cohort_id,
  idempotency_key,
  status,
  started_at,
  expires_at,
  completed_at,
  updated_at
) values
  ('a4000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000017','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000030','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',null,clock_timestamp()-interval '1 hour'),
  ('a4000000-0000-4000-8000-000000000031','a0000000-0000-4000-8000-000000000017','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000031','completed',clock_timestamp()-interval '2 hours',clock_timestamp()+interval '22 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour');
insert into public.training_completions(
  id,
  user_id,
  session_id,
  scene_version_id,
  cohort_id,
  idempotency_key,
  completed_at
) values (
  'a7000000-0000-4000-8000-000000000031',
  'a0000000-0000-4000-8000-000000000017',
  'a4000000-0000-4000-8000-000000000031',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000031',
  clock_timestamp()-interval '1 hour'
);

select extensions.dblink_connect(
  'support_worker_a',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'support_worker_b',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'support_barrier',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);

select extensions.dblink_exec('support_worker_a', $capture$
  create or replace function pg_temp.capture_support(
    p_request_id uuid,
    p_input jsonb
  )
  returns table(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select
      result."ticketId",
      result.created,
      result.status,
      result."snapshotShared",
      null::text
    from public.create_support_ticket(
      p_request_id,
      p_input
    ) as result;
  exception when others then
    return query
    select null::uuid, null::boolean, null::text,
      null::boolean, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_safety(
    p_request_id uuid,
    p_input jsonb
  )
  returns table(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select
      result."reportId",
      result.created,
      result.status,
      null::text
    from public.create_safety_report(
      p_request_id,
      p_input
    ) as result;
  exception when others then
    return query
    select null::uuid, null::boolean, null::text, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_stop(
    p_session_id uuid
  )
  returns table(route text, error_message text)
  language plpgsql as $$
  begin
    return query
    select result.route, null::text
    from public.stop_training_for_safety(
      p_session_id
    ) as result;
  exception when others then
    return query select null::text, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_completion(
    p_session_id uuid,
    p_request_id uuid
  )
  returns table(completion_id uuid, error_message text)
  language plpgsql as $$
  begin
    return query
    select result."completionId", null::text
    from public.complete_training(
      p_session_id,
      p_request_id
    ) as result;
  exception when others then
    return query select null::uuid, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_revoke(
    p_ticket_id uuid,
    p_request_id uuid
  )
  returns table(
    status text,
    snapshot_shared boolean,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select
      result.status,
      result."snapshotShared",
      null::text
    from public.revoke_support_consent(
      p_ticket_id,
      p_request_id
    ) as result;
  exception when others then
    return query select null::text, null::boolean, sqlerrm;
  end;
  $$;
$capture$);
select extensions.dblink_exec('support_worker_b', $capture$
  create or replace function pg_temp.capture_support(
    p_request_id uuid,
    p_input jsonb
  )
  returns table(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select
      result."ticketId",
      result.created,
      result.status,
      result."snapshotShared",
      null::text
    from public.create_support_ticket(
      p_request_id,
      p_input
    ) as result;
  exception when others then
    return query
    select null::uuid, null::boolean, null::text,
      null::boolean, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_safety(
    p_request_id uuid,
    p_input jsonb
  )
  returns table(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select
      result."reportId",
      result.created,
      result.status,
      null::text
    from public.create_safety_report(
      p_request_id,
      p_input
    ) as result;
  exception when others then
    return query
    select null::uuid, null::boolean, null::text, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_stop(
    p_session_id uuid
  )
  returns table(route text, error_message text)
  language plpgsql as $$
  begin
    return query
    select result.route, null::text
    from public.stop_training_for_safety(
      p_session_id
    ) as result;
  exception when others then
    return query select null::text, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_completion(
    p_session_id uuid,
    p_request_id uuid
  )
  returns table(completion_id uuid, error_message text)
  language plpgsql as $$
  begin
    return query
    select result."completionId", null::text
    from public.complete_training(
      p_session_id,
      p_request_id
    ) as result;
  exception when others then
    return query select null::uuid, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_revoke(
    p_ticket_id uuid,
    p_request_id uuid
  )
  returns table(
    status text,
    snapshot_shared boolean,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select
      result.status,
      result."snapshotShared",
      null::text
    from public.revoke_support_consent(
      p_ticket_id,
      p_request_id
    ) as result;
  exception when others then
    return query select null::text, null::boolean, sqlerrm;
  end;
  $$;
$capture$);

select *
from extensions.dblink(
  'support_worker_a',
  $$select
      set_config(
        'request.jwt.claims',
        '{"sub":"a0000000-0000-4000-8000-000000000017","role":"authenticated"}',
        false
      ),
      set_config(
        'request.jwt.claim.sub',
        'a0000000-0000-4000-8000-000000000017',
        false
      )$$
) as worker_a_claim(claims_value text, subject_value text);
select *
from extensions.dblink(
  'support_worker_b',
  $$select
      set_config(
        'request.jwt.claims',
        '{"sub":"a0000000-0000-4000-8000-000000000017","role":"authenticated"}',
        false
      ),
      set_config(
        'request.jwt.claim.sub',
        'a0000000-0000-4000-8000-000000000017',
        false
      )$$
) as worker_b_claim(claims_value text, subject_value text);

select extensions.dblink_exec('support_worker_a', 'begin');
select extensions.dblink_exec(
  'support_worker_a',
  'set local role authenticated'
);
select extensions.dblink_exec('support_worker_b', 'begin');
select extensions.dblink_exec(
  'support_worker_b',
  'set local role authenticated'
);
select extensions.dblink_exec('support_barrier', 'begin');
select *
from extensions.dblink(
  'support_barrier',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:a0000000-0000-4000-8000-000000000017',
          0
        )
      )
    ) as held$$
) as identical_support_barrier(acquired integer);
select extensions.dblink_send_query(
  'support_worker_a',
  $$select * from pg_temp.capture_support(
      'a6000000-0000-4000-8000-000000000300',
      '{"kind":"no_snapshot","note":"same"}'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.05);
select extensions.dblink_send_query(
  'support_worker_b',
  $$select * from pg_temp.capture_support(
      'a6000000-0000-4000-8000-000000000300',
      '{"kind":"no_snapshot","note":"same"}'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('support_worker_a') = 1
    and extensions.dblink_is_busy('support_worker_b') = 1,
  'both identical support workers are active before barrier release'
);
select extensions.dblink_exec('support_barrier', 'commit');
create temporary table concurrent_identical_support as
select 1 as worker, result.*
from extensions.dblink_get_result('support_worker_a')
  as result(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_a')
  as drained(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select extensions.dblink_exec('support_worker_a', 'commit');
insert into concurrent_identical_support
select 2 as worker, result.*
from extensions.dblink_get_result('support_worker_b')
  as result(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_b')
  as drained(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select extensions.dblink_exec('support_worker_b', 'commit');
select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.count(distinct ticket_id) = 1
      and pg_catalog.bool_and(
        status = 'submitted'
        and not snapshot_shared
        and error_message is null
      )
      and pg_catalog.count(*) filter (where created) = 1
      and pg_catalog.count(*) filter (where not created) = 1
    from concurrent_identical_support
  )
  and (
    select pg_catalog.count(*) = 1
    from public.support_tickets
    where user_id
        = 'a0000000-0000-4000-8000-000000000017'
      and request_id
        = 'a6000000-0000-4000-8000-000000000300'
  ),
  'concurrent identical support creates one ticket and one retry result'
);

select extensions.dblink_exec('support_worker_a', 'begin');
select extensions.dblink_exec(
  'support_worker_a',
  'set local role authenticated'
);
select extensions.dblink_exec('support_worker_b', 'begin');
select extensions.dblink_exec(
  'support_worker_b',
  'set local role authenticated'
);
select extensions.dblink_exec('support_barrier', 'begin');
select *
from extensions.dblink(
  'support_barrier',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:a0000000-0000-4000-8000-000000000017',
          0
        )
      )
    ) as held$$
) as conflicting_support_barrier(acquired integer);
select extensions.dblink_send_query(
  'support_worker_a',
  $$select * from pg_temp.capture_support(
      'a6000000-0000-4000-8000-000000000301',
      '{"kind":"no_snapshot","note":"left"}'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.05);
select extensions.dblink_send_query(
  'support_worker_b',
  $$select * from pg_temp.capture_support(
      'a6000000-0000-4000-8000-000000000301',
      '{"kind":"no_snapshot","note":"right"}'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('support_worker_a') = 1
    and extensions.dblink_is_busy('support_worker_b') = 1,
  'both conflicting support workers are active before barrier release'
);
select extensions.dblink_exec('support_barrier', 'commit');
create temporary table concurrent_conflicting_support as
select 1 as worker, result.*
from extensions.dblink_get_result('support_worker_a')
  as result(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_a')
  as drained(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select extensions.dblink_exec('support_worker_a', 'commit');
insert into concurrent_conflicting_support
select 2 as worker, result.*
from extensions.dblink_get_result('support_worker_b')
  as result(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_b')
  as drained(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select extensions.dblink_exec('support_worker_b', 'commit');
select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.count(*) filter (
        where created
          and ticket_id is not null
          and error_message is null
      ) = 1
      and pg_catalog.count(*) filter (
        where error_message = 'idempotency_conflict'
      ) = 1
    from concurrent_conflicting_support
  )
  and (
    select pg_catalog.count(*) = 1
    from public.support_tickets
    where user_id
        = 'a0000000-0000-4000-8000-000000000017'
      and request_id
        = 'a6000000-0000-4000-8000-000000000301'
  ),
  'concurrent conflicting support creates one ticket and one stable conflict'
);

select extensions.dblink_exec('support_worker_a', 'begin');
select extensions.dblink_exec(
  'support_worker_a',
  'set local role authenticated'
);
select extensions.dblink_exec('support_worker_b', 'begin');
select extensions.dblink_exec(
  'support_worker_b',
  'set local role authenticated'
);
select extensions.dblink_exec('support_barrier', 'begin');
select *
from extensions.dblink(
  'support_barrier',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:a0000000-0000-4000-8000-000000000017',
          0
        )
      )
    ) as held$$
) as identical_safety_barrier(acquired integer);
select extensions.dblink_send_query(
  'support_worker_a',
  $$select * from pg_temp.capture_safety(
      'a6000000-0000-4000-8000-000000000302',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.05);
select extensions.dblink_send_query(
  'support_worker_b',
  $$select * from pg_temp.capture_safety(
      'a6000000-0000-4000-8000-000000000302',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('support_worker_a') = 1
    and extensions.dblink_is_busy('support_worker_b') = 1,
  'both identical safety workers are active before barrier release'
);
select extensions.dblink_exec('support_barrier', 'commit');
create temporary table concurrent_identical_safety as
select 1 as worker, result.*
from extensions.dblink_get_result('support_worker_a')
  as result(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_a')
  as drained(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select extensions.dblink_exec('support_worker_a', 'commit');
insert into concurrent_identical_safety
select 2 as worker, result.*
from extensions.dblink_get_result('support_worker_b')
  as result(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_b')
  as drained(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select extensions.dblink_exec('support_worker_b', 'commit');
select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.count(distinct report_id) = 1
      and pg_catalog.bool_and(
        status = 'submitted'
        and error_message is null
      )
      and pg_catalog.count(*) filter (where created) = 1
      and pg_catalog.count(*) filter (where not created) = 1
    from concurrent_identical_safety
  )
  and (
    select pg_catalog.count(*) = 1
    from public.safety_reports
    where user_id
        = 'a0000000-0000-4000-8000-000000000017'
      and request_id
        = 'a6000000-0000-4000-8000-000000000302'
  ),
  'concurrent identical safety creates one report and one retry result'
);

select extensions.dblink_exec('support_worker_a', 'begin');
select extensions.dblink_exec(
  'support_worker_a',
  'set local role authenticated'
);
select extensions.dblink_exec('support_worker_b', 'begin');
select extensions.dblink_exec(
  'support_worker_b',
  'set local role authenticated'
);
select extensions.dblink_exec('support_barrier', 'begin');
select *
from extensions.dblink(
  'support_barrier',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:a0000000-0000-4000-8000-000000000017',
          0
        )
      )
    ) as held$$
) as conflicting_safety_barrier(acquired integer);
select extensions.dblink_send_query(
  'support_worker_a',
  $$select * from pg_temp.capture_safety(
      'a6000000-0000-4000-8000-000000000303',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"serious_threat"
        }
      }'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.05);
select extensions.dblink_send_query(
  'support_worker_b',
  $$select * from pg_temp.capture_safety(
      'a6000000-0000-4000-8000-000000000303',
      '{
        "confirmedByUser":true,
        "context":{
          "source":"user",
          "signalCode":"coercive_control"
        }
      }'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('support_worker_a') = 1
    and extensions.dblink_is_busy('support_worker_b') = 1,
  'both conflicting safety workers are active before barrier release'
);
select extensions.dblink_exec('support_barrier', 'commit');
create temporary table concurrent_conflicting_safety as
select 1 as worker, result.*
from extensions.dblink_get_result('support_worker_a')
  as result(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_a')
  as drained(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select extensions.dblink_exec('support_worker_a', 'commit');
insert into concurrent_conflicting_safety
select 2 as worker, result.*
from extensions.dblink_get_result('support_worker_b')
  as result(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_b')
  as drained(
    report_id uuid,
    created boolean,
    status text,
    error_message text
  );
select extensions.dblink_exec('support_worker_b', 'commit');
select ok(
  (
    select pg_catalog.count(*) = 2
      and pg_catalog.count(*) filter (
        where created
          and report_id is not null
          and error_message is null
      ) = 1
      and pg_catalog.count(*) filter (
        where error_message = 'idempotency_conflict'
      ) = 1
    from concurrent_conflicting_safety
  )
  and (
    select pg_catalog.count(*) = 1
    from public.safety_reports
    where user_id
        = 'a0000000-0000-4000-8000-000000000017'
      and request_id
        = 'a6000000-0000-4000-8000-000000000303'
  ),
  'concurrent conflicting safety creates one report and one stable conflict'
);

select extensions.dblink_exec('support_worker_a', 'begin');
select extensions.dblink_exec(
  'support_worker_a',
  'set local role authenticated'
);
select extensions.dblink_exec('support_worker_b', 'begin');
select extensions.dblink_exec(
  'support_worker_b',
  'set local role authenticated'
);
select extensions.dblink_exec('support_barrier', 'begin');
select *
from extensions.dblink(
  'support_barrier',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:a0000000-0000-4000-8000-000000000017',
          0
        )
      )
    ) as held$$
) as stop_completion_barrier(acquired integer);
select extensions.dblink_send_query(
  'support_worker_a',
  $$select * from pg_temp.capture_stop(
      'a4000000-0000-4000-8000-000000000030'
    )$$
);
select pg_catalog.pg_sleep(0.05);
select extensions.dblink_send_query(
  'support_worker_b',
  $$select * from pg_temp.capture_completion(
      'a4000000-0000-4000-8000-000000000030',
      'a6000000-0000-4000-8000-000000000304'
    )$$
);
select pg_catalog.pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('support_worker_a') = 1
    and extensions.dblink_is_busy('support_worker_b') = 1,
  'stop and completion workers are both active before barrier release'
);
select extensions.dblink_exec('support_barrier', 'commit');
create temporary table concurrent_stop_result as
select *
from extensions.dblink_get_result('support_worker_a')
  as result(route text, error_message text);
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_a')
  as drained(route text, error_message text);
select extensions.dblink_exec('support_worker_a', 'commit');
create temporary table concurrent_completion_result as
select *
from extensions.dblink_get_result('support_worker_b')
  as result(completion_id uuid, error_message text);
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_b')
  as drained(completion_id uuid, error_message text);
select extensions.dblink_exec('support_worker_b', 'commit');
select ok(
  (
    select route = 'safety-stop'
      and error_message is null
    from concurrent_stop_result
  )
  and (
    select (
      completion_id is not null
      and error_message is null
    ) or (
      completion_id is null
      and error_message = 'session_not_completable'
    )
    from concurrent_completion_result
  )
  and (
    select (
      session_row.status = 'completed'
      and pg_catalog.count(completion_row.id) = 1
    ) or (
      session_row.status = 'safety_stopped'
      and pg_catalog.count(completion_row.id) = 0
    )
    from public.training_sessions as session_row
    left join public.training_completions as completion_row
      on completion_row.session_id = session_row.id
    where session_row.id
      = 'a4000000-0000-4000-8000-000000000030'
    group by session_row.status
  ),
  'stop versus completion preserves exactly one valid terminal outcome'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000017","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000017',
  false
);
begin;
set local role authenticated;
create temporary table race_ticket_ref as
select "ticketId" as ticket_id
from public.create_support_ticket(
  'a6000000-0000-4000-8000-000000000305',
  pg_temp.snapshot_ticket_input(
    'a7000000-0000-4000-8000-000000000031',
    'a3000000-0000-4000-8000-000000000001',
    'delete after lost response'
  )
);
commit;

select extensions.dblink_exec('support_worker_a', 'begin');
select extensions.dblink_exec(
  'support_worker_a',
  'set local role authenticated'
);
select extensions.dblink_exec('support_worker_b', 'begin');
select extensions.dblink_exec(
  'support_worker_b',
  'set local role authenticated'
);
select extensions.dblink_exec('support_barrier', 'begin');
select *
from extensions.dblink(
  'support_barrier',
  $$select ticket_row.id
    from public.support_tickets as ticket_row
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000305'
    for update$$
) as revoke_retry_barrier(ticket_id uuid);
select extensions.dblink_send_query(
  'support_worker_a',
  $$select * from pg_temp.capture_support(
      'a6000000-0000-4000-8000-000000000305',
      '{
        "kind": "current_training_snapshot",
        "consentToShare": true,
        "completionId": "a7000000-0000-4000-8000-000000000031",
        "snapshot": {
          "sceneVersionId": "a3000000-0000-4000-8000-000000000001",
          "selectedThought": {
            "kind": "option",
            "optionId": "thought-a"
          },
          "selectedHypothesisIds": ["hyp-a", "hyp-b"],
          "evidence": {
            "recurrence": "once",
            "knownFacts": "clear",
            "assumptions": "none-known",
            "danger": "none-known",
            "directlySolvable": "partly",
            "nextNeed": "help"
          }
        },
        "note": "delete after lost response"
      }'::jsonb
    )$$
);
select pg_catalog.pg_sleep(0.05);
select extensions.dblink_send_query(
  'support_worker_b',
  $$select * from pg_temp.capture_revoke(
      (
        select status_row."ticketId"
        from public.list_my_support_tickets() as status_row
        where status_row."snapshotShared"
        order by status_row."submittedAt" desc
        limit 1
      ),
      'a9000000-0000-4000-8000-000000000305'
    )$$
);
select pg_catalog.pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('support_worker_a') = 1
    and extensions.dblink_is_busy('support_worker_b') = 1,
  'revocation and lost-response retry are both active before barrier release'
);
select extensions.dblink_exec('support_barrier', 'commit');
create temporary table concurrent_create_retry_result as
select *
from extensions.dblink_get_result('support_worker_a')
  as result(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_a')
  as drained(
    ticket_id uuid,
    created boolean,
    status text,
    snapshot_shared boolean,
    error_message text
  );
select extensions.dblink_exec('support_worker_a', 'commit');
create temporary table concurrent_revoke_result as
select *
from extensions.dblink_get_result('support_worker_b')
  as result(
    status text,
    snapshot_shared boolean,
    error_message text
  );
select pg_catalog.count(*)
from extensions.dblink_get_result('support_worker_b')
  as drained(
    status text,
    snapshot_shared boolean,
    error_message text
  );
select extensions.dblink_exec('support_worker_b', 'commit');
select ok(
  (
    select error_message is null
      and not created
      and status in ('submitted', 'withdrawn')
    from concurrent_create_retry_result
  )
  and (
    select error_message is null
      and status = 'withdrawn'
      and not snapshot_shared
    from concurrent_revoke_result
  )
  and (
    select ticket_row.status = 'withdrawn'
      and ticket_row.note is null
      and not exists (
        select 1
        from public.support_ticket_snapshots as snapshot_row
        where snapshot_row.ticket_id = ticket_row.id
      )
    from public.support_tickets as ticket_row
    where ticket_row.request_id
      = 'a6000000-0000-4000-8000-000000000305'
  ),
  'revocation racing a lost-response retry ends withdrawn with no note or snapshot'
);

select extensions.dblink_disconnect('support_worker_a');
select extensions.dblink_disconnect('support_worker_b');
select extensions.dblink_disconnect('support_barrier');

create temporary table owner_status_counts as
select
  (
    select pg_catalog.count(*)
    from public.support_tickets
    where user_id
      = 'a0000000-0000-4000-8000-000000000010'
  ) as support_count,
  (
    select pg_catalog.count(*)
    from public.safety_reports
    where user_id
      = 'a0000000-0000-4000-8000-000000000010'
  ) as safety_count;
grant select on owner_status_counts to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000010","role":"authenticated"}',
  false
);
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000010',
  false
);
begin;
set local role authenticated;
select ok(
  (
    select pg_catalog.bool_and(
      pg_catalog.to_jsonb(status_row) ?& array[
          'ticketId',
          'status',
          'snapshotShared',
          'submittedAt',
          'firstResponseDueAt'
        ]
      and pg_catalog.to_jsonb(status_row) - array[
          'ticketId',
          'status',
          'snapshotShared',
          'submittedAt',
          'firstResponseDueAt'
        ] = '{}'::jsonb
    )
    from public.list_my_support_tickets() as status_row
  ),
  'support status returns only the five approved keys'
);
select is(
  (
    select pg_catalog.count(*)
    from public.list_my_support_tickets()
  ),
  (
    select support_count
    from owner_status_counts
  ),
  'support status returns every and only the caller owned ticket'
);
select ok(
  (
    select pg_catalog.bool_and(
      prior_submitted_at is null
      or prior_submitted_at > "submittedAt"
      or (
        prior_submitted_at = "submittedAt"
        and prior_ticket_id > "ticketId"
      )
    )
    from (
      select
        status_row.*,
        pg_catalog.lag("submittedAt") over () as prior_submitted_at,
        pg_catalog.lag("ticketId") over () as prior_ticket_id
      from public.list_my_support_tickets() as status_row
    ) as ordered_status
  ),
  'support status order is submitted_at DESC then id DESC'
);
select ok(
  (
    select pg_catalog.bool_and(
      pg_catalog.to_jsonb(status_row) ?& array[
        'reportId',
        'status',
        'submittedAt'
      ]
      and pg_catalog.to_jsonb(status_row) - array[
        'reportId',
        'status',
        'submittedAt'
      ] = '{}'::jsonb
    )
    from public.list_my_safety_reports() as status_row
  ),
  'safety status returns only the three approved keys'
);
select is(
  (
    select pg_catalog.count(*)
    from public.list_my_safety_reports()
  ),
  (
    select safety_count
    from owner_status_counts
  ),
  'safety status returns every and only the caller owned report'
);
select ok(
  (
    select pg_catalog.bool_and(
      prior_submitted_at is null
      or prior_submitted_at > "submittedAt"
      or (
        prior_submitted_at = "submittedAt"
        and prior_report_id > "reportId"
      )
    )
    from (
      select
        status_row.*,
        pg_catalog.lag("submittedAt") over () as prior_submitted_at,
        pg_catalog.lag("reportId") over () as prior_report_id
      from public.list_my_safety_reports() as status_row
    ) as ordered_status
  ),
  'safety status order is submitted_at DESC then id DESC'
);
commit;

select pg_temp.cleanup_task10_fixtures();

select is(
  (
    select pg_catalog.sum(fixture_count)
    from (
      select pg_catalog.count(*) as fixture_count
      from auth.users
      where id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.profiles
      where id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.cohorts
      where id::text like
        'a1000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.scenes
      where id::text like
        'a2000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.scene_versions
      where id::text like
        'a3000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.training_sessions
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.training_completions
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.cohort_memberships
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.support_tickets
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.safety_reports
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from private.progress_idempotency_keys
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.points_ledger
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.saved_insights
      where user_id::text like
          'a0000000-0000-4000-8000-0000000000%'
        or scene_version_id::text like
          'a3000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.user_badges
      where user_id::text like
          'a0000000-0000-4000-8000-0000000000%'
        or awarded_by::text like
          'a0000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.cohort_invites
      where cohort_id::text like
        'a1000000-0000-4000-8000-0000000000%'
      union all
      select pg_catalog.count(*)
      from public.follow_up_reviews
      where user_id::text like
        'a0000000-0000-4000-8000-0000000000%'
    ) as fixture_counts
  ),
  0::numeric,
  'Task 10 pgTAP leaves no persistent fixture rows'
);

select * from finish();
