create extension if not exists dblink with schema extensions;

select plan(91);

select has_column(
  'public',
  'training_sessions',
  'updated_at',
  'training sessions have an update timestamp'
);
select col_not_null(
  'public',
  'training_sessions',
  'updated_at',
  'training session update timestamps cannot be null'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.training_sessions'::regclass
      and tgname = 'touch_training_session_updated_at'
      and not tgisinternal
  ),
  'training session updates use the narrowly scoped touch trigger'
);
select has_function(
  'public',
  'start_training',
  array['uuid', 'uuid'],
  'authenticated participants can start a pinned runtime'
);
select has_function(
  'public',
  'check_training_session',
  array['uuid'],
  'authenticated participants can check a pinned runtime'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.start_training(uuid,uuid)',
    'execute'
  ),
  'authenticated can execute start_training'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.check_training_session(uuid)',
    'execute'
  ),
  'authenticated can execute check_training_session'
);
select ok(
  not has_function_privilege('anon', 'public.start_training(uuid,uuid)', 'execute'),
  'anonymous users cannot execute start_training'
);
select ok(
  not has_function_privilege('anon', 'public.check_training_session(uuid)', 'execute'),
  'anonymous users cannot execute check_training_session'
);
select ok(
  has_table_privilege('authenticated', 'public.training_sessions', 'select'),
  'authenticated users retain training session SELECT through owner RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.training_sessions',
    privilege_name
  ),
  format('authenticated users have no training session %s privilege', privilege_name)
)
from (
  values
    ('insert'),
    ('update'),
    ('delete'),
    ('truncate'),
    ('references'),
    ('trigger'),
    ('maintain')
) denied_authenticated(privilege_name);
select ok(
  not has_table_privilege('anon', 'public.training_sessions', privilege_name),
  format('anonymous users have no training session %s privilege', privilege_name)
)
from (
  values
    ('select'),
    ('insert'),
    ('update'),
    ('delete'),
    ('truncate'),
    ('references'),
    ('trigger'),
    ('maintain')
) denied_anonymous(privilege_name);
set role authenticated;
select throws_ok(
  $$truncate table public.training_sessions cascade$$,
  '42501',
  null,
  'authenticated users cannot truncate training sessions through RLS'
);
reset role;
select ok(
  (
    select bool_and(
      p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
    )
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('start_training', 'check_training_session')
  ),
  'public training RPCs are security definer functions with a fixed search path'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_sessions'
      and column_name ~ '(thought|prediction|hypothesis|evidence|answer|note|safety_signal)'
  ),
  0::bigint,
  'training sessions contain no answer or free-text fields'
);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('70000000-0000-4000-8000-000000000000','authenticated','authenticated','runtime-coach@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000001','authenticated','authenticated','runtime-active@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000002','authenticated','authenticated','runtime-other@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000003','authenticated','authenticated','runtime-unenrolled@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000004','authenticated','authenticated','runtime-minor@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000005','authenticated','authenticated','runtime-withdrawn@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000006','authenticated','authenticated','runtime-deletion@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000007','authenticated','authenticated','runtime-closed@example.invalid',now(),now()),
  ('70000000-0000-4000-8000-000000000008','authenticated','authenticated','runtime-removed@example.invalid',now(),now());

insert into public.profiles(id, display_name, is_adult_confirmed, service_status) values
  ('70000000-0000-4000-8000-000000000000','运行时教练',true,'active'),
  ('70000000-0000-4000-8000-000000000001','有效成员',true,'active'),
  ('70000000-0000-4000-8000-000000000002','其他有效成员',true,'active'),
  ('70000000-0000-4000-8000-000000000003','未入班成员',true,'active'),
  ('70000000-0000-4000-8000-000000000004','未成年确认成员',false,'active'),
  ('70000000-0000-4000-8000-000000000005','已撤回同意成员',true,'consent_withdrawn'),
  ('70000000-0000-4000-8000-000000000006','等待删除成员',true,'deletion_pending'),
  ('70000000-0000-4000-8000-000000000007','关闭班成员',true,'active'),
  ('70000000-0000-4000-8000-000000000008','已移除成员',true,'active');

insert into public.cohorts(id, name, coach_id, status) values
  ('73000000-0000-4000-8000-000000000001','运行时有效班','70000000-0000-4000-8000-000000000000','active'),
  ('73000000-0000-4000-8000-000000000002','运行时关闭班','70000000-0000-4000-8000-000000000000','closed');

insert into public.cohort_memberships(cohort_id, user_id) values
  ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001'),
  ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002'),
  ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004'),
  ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000005'),
  ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006'),
  ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000008'),
  ('73000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000007');

insert into public.scenes(id, scene_code, slug, relationship, category) values
  ('71000000-0000-4000-8000-000000000001','PC-701','runtime-normal','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000002','PC-702','runtime-alternate','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000003','PC-703','runtime-stop','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000004','PC-704','runtime-version-pin','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000010','PC-710','runtime-draft','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000011','PC-711','runtime-review','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000012','PC-712','runtime-changes','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000013','PC-713','runtime-approved','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000014','PC-714','runtime-paused','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000015','PC-715','runtime-blocked','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000016','PC-716','runtime-emergency','parent-child','运行时测试'),
  ('71000000-0000-4000-8000-000000000017','PC-717','runtime-retired','parent-child','运行时测试');

insert into public.scene_versions(
  id, scene_id, version, status, risk, payload, author_id
) values
  ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',1,'published','standard','{"title":"normal"}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002',1,'published','caution','{"title":"alternate"}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000003',1,'published','stop','{"title":"stop"}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000004',1,'published','standard','{"title":"pin-v1"}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000004',2,'draft','standard','{"title":"pin-v2"}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000010',1,'draft','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000011',1,'in_review','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000012','71000000-0000-4000-8000-000000000012',1,'changes_requested','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000013','71000000-0000-4000-8000-000000000013',1,'approved','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000014','71000000-0000-4000-8000-000000000014',1,'paused','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000015','71000000-0000-4000-8000-000000000015',1,'blocked','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000016','71000000-0000-4000-8000-000000000016',1,'emergency_withdrawn','standard','{}','70000000-0000-4000-8000-000000000000'),
  ('72000000-0000-4000-8000-000000000017','71000000-0000-4000-8000-000000000017',1,'retired','standard','{}','70000000-0000-4000-8000-000000000000');

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(null, '75000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'invalid_training_request',
  'start_training rejects a null scene version'
);
select throws_ok(
  $$select * from public.start_training('72000000-0000-4000-8000-000000000001', null)$$,
  'P0001',
  'invalid_training_request',
  'start_training rejects a null idempotency key'
);
select throws_ok(
  $$select public.check_training_session(null)$$,
  'P0001',
  'invalid_session_request',
  'check_training_session rejects a null session id'
);
reset role;

set role anon;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000099'
  )$$,
  '42501',
  null,
  'anonymous execution fails at the database permission boundary'
);
reset role;

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000103'
  )$$,
  'P0001', 'active_adult_membership_required',
  'an unenrolled user cannot start training'
);
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000004', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000104'
  )$$,
  'P0001', 'active_adult_membership_required',
  'a user without adult confirmation cannot start training'
);
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000005', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000105'
  )$$,
  'P0001', 'active_adult_membership_required',
  'a consent-withdrawn user cannot start training'
);
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000006', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000106'
  )$$,
  'P0001', 'active_adult_membership_required',
  'a deletion-pending user cannot start training'
);
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000007', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000107'
  )$$,
  'P0001', 'active_adult_membership_required',
  'a member of a closed cohort cannot start training'
);
reset role;
delete from public.cohort_memberships
where user_id = '70000000-0000-4000-8000-000000000008';
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000008', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000108'
  )$$,
  'P0001', 'active_adult_membership_required',
  'a removed member cannot start training'
);
reset role;
select is(
  (
    select count(*)
    from public.training_sessions
    where user_id in (
      '70000000-0000-4000-8000-000000000003',
      '70000000-0000-4000-8000-000000000004',
      '70000000-0000-4000-8000-000000000005',
      '70000000-0000-4000-8000-000000000006',
      '70000000-0000-4000-8000-000000000007',
      '70000000-0000-4000-8000-000000000008'
    )
  ),
  0::bigint,
  'all ineligible starts create no session row'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000099',
    '75000000-0000-4000-8000-000000000200'
  )$$,
  'P0001', 'scene_unavailable',
  'a missing scene version uses the stable unavailable surface'
);
select throws_ok(
  format(
    'select * from public.start_training(%L::uuid,%L::uuid)',
    version_id,
    request_id
  ),
  'P0001',
  'scene_unavailable',
  format('%s content cannot start a session', status_name)
)
from (
  values
    ('draft', '72000000-0000-4000-8000-000000000010', '75000000-0000-4000-8000-000000000210'),
    ('in_review', '72000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000211'),
    ('changes_requested', '72000000-0000-4000-8000-000000000012', '75000000-0000-4000-8000-000000000212'),
    ('approved', '72000000-0000-4000-8000-000000000013', '75000000-0000-4000-8000-000000000213'),
    ('paused', '72000000-0000-4000-8000-000000000014', '75000000-0000-4000-8000-000000000214'),
    ('blocked', '72000000-0000-4000-8000-000000000015', '75000000-0000-4000-8000-000000000215'),
    ('emergency_withdrawn', '72000000-0000-4000-8000-000000000016', '75000000-0000-4000-8000-000000000216'),
    ('retired', '72000000-0000-4000-8000-000000000017', '75000000-0000-4000-8000-000000000217')
) unavailable(status_name, version_id, request_id);
reset role;
select is(
  (
    select count(*)
    from public.training_sessions
    where idempotency_key between
      '75000000-0000-4000-8000-000000000200'
      and '75000000-0000-4000-8000-000000000217'
  ),
  0::bigint,
  'missing and non-published versions create no session'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select results_eq(
  $$select route from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000301'
  )$$,
  $$values ('continue'::text)$$,
  'a published ordinary scene starts on the continue route'
);
reset role;
select ok(
  (
    select status = 'active'
      and scene_version_id = '72000000-0000-4000-8000-000000000001'
      and expires_at = started_at + interval '24 hours'
      and updated_at = started_at
    from public.training_sessions
    where user_id = '70000000-0000-4000-8000-000000000001'
      and idempotency_key = '75000000-0000-4000-8000-000000000301'
  ),
  'new sessions use one clock value, a 24-hour expiry, and a pinned version'
);
create temporary table normal_runtime_snapshot as
select id, expires_at, updated_at
from public.training_sessions
where user_id = '70000000-0000-4000-8000-000000000001'
  and idempotency_key = '75000000-0000-4000-8000-000000000301';
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select results_eq(
  $$select "sessionId", route from public.start_training(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000301'
  )$$,
  $$select id, 'continue'::text
    from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000301'$$,
  'same-key same-scene retry returns the same session'
);
reset role;
select ok(
  (
    select s.expires_at = snap.expires_at and s.updated_at = snap.updated_at
    from public.training_sessions s
    join normal_runtime_snapshot snap on snap.id = s.id
  ),
  'a read-only idempotent retry refreshes neither expiry nor updated_at'
);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select throws_ok(
  $$select * from public.start_training(
    '72000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000301'
  )$$,
  'P0001', 'idempotency_conflict',
  'same-key different-scene retry never rebinds a session'
);
select results_eq(
  $$select route from public.start_training(
    '72000000-0000-4000-8000-000000000003',
    '75000000-0000-4000-8000-000000000302'
  )$$,
  $$values ('safety-stop'::text)$$,
  'a published stop card routes directly to safety'
);
reset role;
select is(
  (
    select status
    from public.training_sessions
    where user_id = '70000000-0000-4000-8000-000000000001'
      and idempotency_key = '75000000-0000-4000-8000-000000000302'
  ),
  'safety_stopped',
  'a stop-card start is persisted as safety_stopped'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select * from public.start_training(
  '72000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000303'
);
reset role;
update public.training_sessions
set status = 'paused'
where user_id = '70000000-0000-4000-8000-000000000001'
  and idempotency_key = '75000000-0000-4000-8000-000000000303';
create temporary table paused_runtime_snapshot as
select id, expires_at, updated_at
from public.training_sessions
where user_id = '70000000-0000-4000-8000-000000000001'
  and idempotency_key = '75000000-0000-4000-8000-000000000303';
select pg_sleep(0.01);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  public.check_training_session((
    select id from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000303'
  )),
  'continue',
  'a valid paused session resumes to continue'
);
reset role;
select ok(
  (
    select s.status = 'active'
      and s.expires_at = snap.expires_at
      and s.updated_at > snap.updated_at
    from public.training_sessions s
    join paused_runtime_snapshot snap on snap.id = s.id
  ),
  'resuming changes status and updated_at without extending expiry'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select * from public.start_training(
  '72000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000304'
);
reset role;
update public.training_sessions
set expires_at = clock_timestamp() - interval '1 second'
where user_id = '70000000-0000-4000-8000-000000000001'
  and idempotency_key = '75000000-0000-4000-8000-000000000304';
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  public.check_training_session((
    select id from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000304'
  )),
  'content-update',
  'an expired session cannot continue'
);
reset role;
select is(
  (
    select status from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000304'
  ),
  'abandoned',
  'an expired session is persisted as abandoned'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status
) values
  ('74000000-0000-4000-8000-000000000016','70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000016','75000000-0000-4000-8000-000000000316','active'),
  ('74000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000317','paused');
update public.training_sessions
set expires_at = clock_timestamp() - interval '1 second'
where id = '74000000-0000-4000-8000-000000000016';
update public.profiles
set service_status = 'consent_withdrawn'
where id = '70000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  public.check_training_session('74000000-0000-4000-8000-000000000016'),
  'safety-stop',
  'emergency withdrawal takes safety precedence over ineligibility and expiry'
);
reset role;
select is(
  (select status from public.training_sessions where id = '74000000-0000-4000-8000-000000000016'),
  'safety_stopped',
  'emergency withdrawal is persisted as safety_stopped'
);
update public.profiles
set service_status = 'active'
where id = '70000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  public.check_training_session('74000000-0000-4000-8000-000000000003'),
  'safety-stop',
  'a risk-stop pinned version takes precedence over ordinary continuation'
);
reset role;
select is(
  (select status from public.training_sessions where id = '74000000-0000-4000-8000-000000000003'),
  'safety_stopped',
  'a risk-stop session is persisted as safety_stopped'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status
)
select
  ('74000000-0000-4000-8000-' || right(version_id::text, 12))::uuid,
  '70000000-0000-4000-8000-000000000001'::uuid,
  version_id::uuid,
  ('75000000-0000-4000-8000-' || right(version_id::text, 12))::uuid,
  case when right(version_id, 3)::integer % 2 = 0 then 'active' else 'paused' end
from (
  values
    ('72000000-0000-4000-8000-000000000010'),
    ('72000000-0000-4000-8000-000000000011'),
    ('72000000-0000-4000-8000-000000000012'),
    ('72000000-0000-4000-8000-000000000013'),
    ('72000000-0000-4000-8000-000000000014'),
    ('72000000-0000-4000-8000-000000000015'),
    ('72000000-0000-4000-8000-000000000017')
) nonpublished(version_id);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select results_eq(
  $$select public.check_training_session(id)
    from public.training_sessions
    where id in (
      '74000000-0000-4000-8000-000000000010',
      '74000000-0000-4000-8000-000000000011',
      '74000000-0000-4000-8000-000000000012',
      '74000000-0000-4000-8000-000000000013',
      '74000000-0000-4000-8000-000000000014',
      '74000000-0000-4000-8000-000000000015',
      '74000000-0000-4000-8000-000000000017'
    )
    order by id$$,
  $$values
    ('content-update'::text),
    ('content-update'::text),
    ('content-update'::text),
    ('content-update'::text),
    ('content-update'::text),
    ('content-update'::text),
    ('content-update'::text)$$,
  'every non-published non-emergency status fails closed'
);
reset role;
select is(
  (
    select count(*)
    from public.training_sessions
    where id in (
      '74000000-0000-4000-8000-000000000010',
      '74000000-0000-4000-8000-000000000011',
      '74000000-0000-4000-8000-000000000012',
      '74000000-0000-4000-8000-000000000013',
      '74000000-0000-4000-8000-000000000014',
      '74000000-0000-4000-8000-000000000015',
      '74000000-0000-4000-8000-000000000017'
    )
      and status = 'abandoned'
  ),
  7::bigint,
  'all non-published ordinary sessions persist as abandoned'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status
) values
  ('74000000-0000-4000-8000-000000000020','70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000320','safety_stopped'),
  ('74000000-0000-4000-8000-000000000021','70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000321','completed'),
  ('74000000-0000-4000-8000-000000000022','70000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000322','abandoned');
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  public.check_training_session('74000000-0000-4000-8000-000000000020'),
  'safety-stop',
  'a safety-stopped session remains on the safety route'
);
select results_eq(
  $$select public.check_training_session(id)
    from public.training_sessions
    where id in (
      '74000000-0000-4000-8000-000000000021',
      '74000000-0000-4000-8000-000000000022'
    )
    order by id$$,
  $$values ('content-update'::text), ('content-update'::text)$$,
  'completed and abandoned sessions stay terminal'
);
reset role;
select ok(
  (select status = 'safety_stopped' from public.training_sessions where id = '74000000-0000-4000-8000-000000000020')
  and (select status = 'completed' from public.training_sessions where id = '74000000-0000-4000-8000-000000000021')
  and (select status = 'abandoned' from public.training_sessions where id = '74000000-0000-4000-8000-000000000022'),
  'terminal checks never rewrite one terminal state into another'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select results_eq(
  $$select route from public.start_training(
    '72000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000330'
  )$$,
  $$values ('continue'::text)$$,
  'a version-pin session starts on its requested published version'
);
reset role;
update public.scene_versions
set status = case
  when id = '72000000-0000-4000-8000-000000000004' then 'paused'::public.content_status
  else 'published'::public.content_status
end
where id in (
  '72000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000005'
);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  public.check_training_session((
    select id from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000330'
  )),
  'content-update',
  'publishing a new version does not keep the old paused version running'
);
reset role;
select ok(
  (
    select scene_version_id = '72000000-0000-4000-8000-000000000004'
      and status = 'abandoned'
    from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000330'
  ),
  'the session remains pinned to its original version and is abandoned'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status
) values
  ('74000000-0000-4000-8000-000000000103','70000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000403','active'),
  ('74000000-0000-4000-8000-000000000104','70000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000404','active'),
  ('74000000-0000-4000-8000-000000000105','70000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000405','active'),
  ('74000000-0000-4000-8000-000000000106','70000000-0000-4000-8000-000000000006','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000406','active'),
  ('74000000-0000-4000-8000-000000000107','70000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000407','active'),
  ('74000000-0000-4000-8000-000000000108','70000000-0000-4000-8000-000000000008','72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000408','active');
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', false);
set role authenticated;
select is(public.check_training_session('74000000-0000-4000-8000-000000000103'),'content-update','unenrolled sessions cannot continue');
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000004', false);
set role authenticated;
select is(public.check_training_session('74000000-0000-4000-8000-000000000104'),'content-update','non-adult sessions cannot continue');
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000005', false);
set role authenticated;
select is(public.check_training_session('74000000-0000-4000-8000-000000000105'),'content-update','consent-withdrawn sessions cannot continue');
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000006', false);
set role authenticated;
select is(public.check_training_session('74000000-0000-4000-8000-000000000106'),'content-update','deletion-pending sessions cannot continue');
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000007', false);
set role authenticated;
select is(public.check_training_session('74000000-0000-4000-8000-000000000107'),'content-update','closed-cohort sessions cannot continue');
reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000008', false);
set role authenticated;
select is(public.check_training_session('74000000-0000-4000-8000-000000000108'),'content-update','removed-member sessions cannot continue');
reset role;
select is(
  (
    select count(*) from public.training_sessions
    where id between
      '74000000-0000-4000-8000-000000000103'
      and '74000000-0000-4000-8000-000000000108'
      and status = 'abandoned'
  ),
  6::bigint,
  'all ineligible existing sessions persist as abandoned'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status
) values (
  '74000000-0000-4000-8000-000000000202',
  '70000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000502',
  'active'
);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select throws_ok(
  $$select public.check_training_session('74000000-0000-4000-8000-000000000202')$$,
  'P0001', 'session_not_found',
  'another user session uses the stable not-found surface'
);
select throws_ok(
  $$select public.check_training_session('74000000-0000-4000-8000-000000000299')$$,
  'P0001', 'session_not_found',
  'a nonexistent session uses the same stable not-found surface'
);
reset role;

select extensions.dblink_connect(
  'training_worker_a',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'training_worker_b',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'training_lock',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_exec('training_worker_a', $capture$
  create or replace function pg_temp.capture_training_start(
    p_scene_version_id uuid,
    p_idempotency_key uuid
  )
  returns table(session_id uuid, route text, error_message text)
  language plpgsql as $$
  begin
    return query
    select started."sessionId", started.route, null::text
    from public.start_training(p_scene_version_id, p_idempotency_key) started;
  exception when others then
    return query select null::uuid, null::text, sqlerrm;
  end;
  $$
$capture$);
select extensions.dblink_exec('training_worker_b', $capture$
  create or replace function pg_temp.capture_training_start(
    p_scene_version_id uuid,
    p_idempotency_key uuid
  )
  returns table(session_id uuid, route text, error_message text)
  language plpgsql as $$
  begin
    return query
    select started."sessionId", started.route, null::text
    from public.start_training(p_scene_version_id, p_idempotency_key) started;
  exception when others then
    return query select null::uuid, null::text, sqlerrm;
  end;
  $$
$capture$);
select *
from extensions.dblink(
  'training_worker_a',
  $$select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',false)$$
) as worker_a_claim(value text);
select *
from extensions.dblink(
  'training_worker_b',
  $$select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',false)$$
) as worker_b_claim(value text);
select extensions.dblink_exec('training_worker_a', 'set role authenticated');
select extensions.dblink_exec('training_worker_b', 'set role authenticated');

select extensions.dblink_exec('training_lock', 'begin');
select *
from extensions.dblink(
  'training_lock',
  $$select 1 from (
    select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'training-start:70000000-0000-4000-8000-000000000001:75000000-0000-4000-8000-000000000601',
        0
      )
    )
  ) held$$
) as same_scene_barrier(acquired integer);
select extensions.dblink_send_query(
  'training_worker_a',
  $$select * from pg_temp.capture_training_start(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000601'
  )$$
);
select extensions.dblink_send_query(
  'training_worker_b',
  $$select * from pg_temp.capture_training_start(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000601'
  )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('training_worker_a') = 1
  and extensions.dblink_is_busy('training_worker_b') = 1,
  'both same-scene workers overlap while waiting at the serialized start boundary'
);
select extensions.dblink_exec('training_lock', 'commit');
create temporary table concurrent_same_scene as
select 1 as worker, result.*
from extensions.dblink_get_result('training_worker_a')
  as result(session_id uuid, route text, error_message text)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('training_worker_b')
  as result(session_id uuid, route text, error_message text);
select count(*) from extensions.dblink_get_result('training_worker_a')
  as result(session_id uuid, route text, error_message text);
select count(*) from extensions.dblink_get_result('training_worker_b')
  as result(session_id uuid, route text, error_message text);
select ok(
  (
    select count(*) = 2
      and count(distinct session_id) = 1
      and bool_and(route = 'continue' and error_message is null)
    from concurrent_same_scene
  ),
  'real concurrent same-key same-scene calls return one shared session'
);
select is(
  (
    select count(*) from public.training_sessions
    where user_id = '70000000-0000-4000-8000-000000000001'
      and idempotency_key = '75000000-0000-4000-8000-000000000601'
  ),
  1::bigint,
  'concurrent same-scene calls persist exactly one row'
);

select extensions.dblink_exec('training_lock', 'begin');
select *
from extensions.dblink(
  'training_lock',
  $$select 1 from (
    select pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'training-start:70000000-0000-4000-8000-000000000001:75000000-0000-4000-8000-000000000602',
        0
      )
    )
  ) held$$
) as different_scene_barrier(acquired integer);
select extensions.dblink_send_query(
  'training_worker_a',
  $$select * from pg_temp.capture_training_start(
    '72000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000602'
  )$$
);
select extensions.dblink_send_query(
  'training_worker_b',
  $$select * from pg_temp.capture_training_start(
    '72000000-0000-4000-8000-000000000002',
    '75000000-0000-4000-8000-000000000602'
  )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('training_worker_a') = 1
  and extensions.dblink_is_busy('training_worker_b') = 1,
  'both different-scene workers overlap while waiting at the serialized start boundary'
);
select extensions.dblink_exec('training_lock', 'commit');
create temporary table concurrent_different_scene as
select 1 as worker, result.*
from extensions.dblink_get_result('training_worker_a')
  as result(session_id uuid, route text, error_message text)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('training_worker_b')
  as result(session_id uuid, route text, error_message text);
select count(*) from extensions.dblink_get_result('training_worker_a')
  as result(session_id uuid, route text, error_message text);
select count(*) from extensions.dblink_get_result('training_worker_b')
  as result(session_id uuid, route text, error_message text);
select ok(
  (
    select count(*) filter (
        where session_id is not null
          and route = 'continue'
          and error_message is null
      ) = 1
      and count(*) filter (
        where session_id is null
          and route is null
          and error_message = 'idempotency_conflict'
      ) = 1
    from concurrent_different_scene
  ),
  'real concurrent same-key different-scene calls yield one success and one stable conflict'
);
select is(
  (
    select count(*) from public.training_sessions
    where user_id = '70000000-0000-4000-8000-000000000001'
      and idempotency_key = '75000000-0000-4000-8000-000000000602'
  ),
  1::bigint,
  'concurrent different-scene calls never persist a second binding'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', false);
set role authenticated;
select * from public.start_training(
  '72000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000603'
);
reset role;
update public.training_sessions
set expires_at = clock_timestamp() + interval '1 second'
where user_id = '70000000-0000-4000-8000-000000000001'
  and idempotency_key = '75000000-0000-4000-8000-000000000603';
select extensions.dblink_exec('training_lock', 'begin');
select *
from extensions.dblink(
  'training_lock',
  $$select id from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000603'
    for update$$
) as locked_session(id uuid);
select extensions.dblink_send_query(
  'training_worker_a',
  $$select public.check_training_session((
    select id from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000603'
  ))$$
);
select pg_sleep(0.2);
select is(
  extensions.dblink_is_busy('training_worker_a'),
  1,
  'session check waits on the owned row lock before expiry'
);
select pg_sleep(1);
select extensions.dblink_exec('training_lock', 'commit');
create temporary table cross_expiry_check as
select *
from extensions.dblink_get_result('training_worker_a') as result(route text);
select count(*)
from extensions.dblink_get_result('training_worker_a') as result(route text);
select is(
  (select route from cross_expiry_check),
  'content-update',
  'a lock wait crossing expiry re-reads wall-clock time and fails closed'
);
select is(
  (
    select status from public.training_sessions
    where idempotency_key = '75000000-0000-4000-8000-000000000603'
  ),
  'abandoned',
  'the cross-expiry session is persisted as abandoned'
);

select ok(
  not exists (
    select 1
    from public.training_sessions
    where to_jsonb(training_sessions)::text like any (array[
      '%habitual-negative-thought%',
      '%participant-free-text%',
      '%need-autonomy%',
      '%danger-present-answer%'
    ])
  ),
  'session rows store no representative thought, free-text, hypothesis, or evidence answers'
);

select extensions.dblink_disconnect('training_lock');
select extensions.dblink_disconnect('training_worker_a');
select extensions.dblink_disconnect('training_worker_b');

delete from public.training_sessions
where user_id between
  '70000000-0000-4000-8000-000000000001'
  and '70000000-0000-4000-8000-000000000008';
delete from public.scene_versions
where author_id = '70000000-0000-4000-8000-000000000000';
delete from public.scenes where id between
  '71000000-0000-4000-8000-000000000001'
  and '71000000-0000-4000-8000-000000000017';
delete from public.cohort_memberships where cohort_id in (
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002'
);
delete from public.cohorts where id in (
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002'
);
delete from public.profiles where id between
  '70000000-0000-4000-8000-000000000000'
  and '70000000-0000-4000-8000-000000000008';
delete from auth.users where id between
  '70000000-0000-4000-8000-000000000000'
  and '70000000-0000-4000-8000-000000000008';

select * from finish();
