create extension if not exists dblink with schema extensions;

select no_plan();

select has_column(
  'public',
  'training_completions',
  'cohort_id',
  'completions pin a nullable cohort at completion time'
);
select has_table(
  'private',
  'progress_idempotency_keys',
  'progress idempotency bindings are kept in the private schema'
);
select has_function(
  'public',
  'complete_training',
  array['uuid', 'uuid'],
  'completion RPC has the client-minimal signature'
);
select has_function(
  'public',
  'complete_training_review',
  array['uuid', 'boolean', 'text', 'text', 'text', 'uuid'],
  'review RPC accepts only the controlled review fields'
);
select has_function(
  'public',
  'set_saved_insight',
  array['uuid', 'text', 'boolean'],
  'saved insight RPC uses explicit desired state'
);
select has_function(
  'public',
  'list_saved_insights',
  array[]::text[],
  'saved insight list is exposed through a minimal RPC'
);
select has_function(
  'public',
  'get_pending_review',
  array[]::text[],
  'pending review lookup is owner-scoped'
);
select has_function(
  'public',
  'get_private_progress',
  array[]::text[],
  'private progress is exposed without a ranking surface'
);

select ok(
  (
    select bool_and(
      procedure_row.prosecdef
      and procedure_row.proconfig = array['search_path=""']::text[]
      and procedure_row.provolatile in ('v', 's')
    )
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'complete_training',
        'complete_training_review',
        'set_saved_insight',
        'list_saved_insights',
        'get_pending_review',
        'get_private_progress'
      )
  ),
  'all progress RPCs are security definer functions with fixed search paths and explicit volatility'
);

select ok(
  has_function_privilege(
    'authenticated',
    function_name,
    'execute'
  ),
  format('authenticated may execute %s', function_name)
)
from (
  values
    ('public.complete_training(uuid,uuid)'),
    ('public.complete_training_review(uuid,boolean,text,text,text,uuid)'),
    ('public.set_saved_insight(uuid,text,boolean)'),
    ('public.list_saved_insights()'),
    ('public.get_pending_review()'),
    ('public.get_private_progress()')
) as authenticated_function(function_name);

select ok(
  not has_function_privilege(role_name, function_name, 'execute'),
  format('%s may not execute %s', role_name, function_name)
)
from (
  values ('anon'), ('public')
) as denied_role(role_name)
cross join (
  values
    ('public.complete_training(uuid,uuid)'),
    ('public.complete_training_review(uuid,boolean,text,text,text,uuid)'),
    ('public.set_saved_insight(uuid,text,boolean)'),
    ('public.list_saved_insights()'),
    ('public.get_pending_review()'),
    ('public.get_private_progress()')
) as denied_function(function_name);

select ok(
  not has_schema_privilege(role_name, 'private', 'usage'),
  format('%s has no private schema usage', role_name)
)
from (values ('anon'), ('authenticated'), ('public')) as denied_private_schema(role_name);

select ok(
  not has_function_privilege(role_name, function_name, 'execute'),
  format('%s has no EXECUTE on Task 9 private helper %s', role_name, function_name)
)
from (
  values ('anon'), ('authenticated'), ('public')
) as denied_private_function_role(role_name)
cross join (
  values
    ('private.lock_participant_state(uuid)'),
    ('private.lock_progress_idempotency_key(uuid,uuid)'),
    ('private.lock_cohort_membership_participant_state()'),
    ('private.lock_profile_participant_state()'),
    ('private.lock_cohort_status_participant_state()'),
    ('private.assert_progress_legacy_integrity()'),
    ('private.backfill_progress_idempotency_keys()')
) as denied_private_function(function_name);

select has_function(
  'private',
  'coach_can_read_pinned_completion',
  array['uuid', 'uuid'],
  'coach RLS uses one narrowly scoped private predicate'
);
select ok(
  (
    select procedure_row.prosecdef
      and procedure_row.provolatile = 's'
      and procedure_row.proconfig = array['search_path=""']::text[]
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        '(select auth.uid()) is not null'
      ) > 0
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'private'
      and procedure_row.proname = 'coach_can_read_pinned_completion'
      and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
        = 'p_user_id uuid, p_cohort_id uuid'
  ),
  'coach predicate is stable security-definer, has exact empty search path, and rejects null auth explicitly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'private.coach_can_read_pinned_completion(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.coach_can_read_pinned_completion(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'public',
    'private.coach_can_read_pinned_completion(uuid,uuid)',
    'execute'
  ),
  'only authenticated receives predicate EXECUTE for internal policy evaluation'
);
select ok(
  (
    select count(*) = 2
      and bool_and(
        expanded_acl.privilege_type = 'EXECUTE'
        and expanded_acl.grantee in (
          procedure_row.proowner,
          'authenticated'::regrole::oid
        )
      )
    from pg_catalog.pg_proc as procedure_row
    cross join lateral pg_catalog.aclexplode(procedure_row.proacl)
      as expanded_acl
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'private'
      and procedure_row.proname = 'coach_can_read_pinned_completion'
      and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
        = 'p_user_id uuid, p_cohort_id uuid'
  ),
  'coach predicate proacl contains exactly owner and authenticated EXECUTE'
);

select ok(
  not has_table_privilege(
    role_name,
    'private.progress_idempotency_keys',
    privilege_name
  ),
  format('%s has no private idempotency-table %s privilege', role_name, privilege_name)
)
from (values ('anon'), ('authenticated'), ('public')) as denied_private_role(role_name)
cross join (
  values
    ('select'), ('insert'), ('update'), ('delete'),
    ('truncate'), ('references'), ('trigger'), ('maintain')
) as denied_private_privilege(privilege_name);

select ok(
  has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    'select'
  ),
  format('authenticated keeps RLS-filtered SELECT on %s', table_name)
)
from (
  values
    ('training_completions'),
    ('follow_up_reviews'),
    ('saved_insights'),
    ('points_ledger'),
    ('user_badges')
) as selected_progress_table(table_name);

select ok(
  not has_table_privilege(
    'authenticated',
    format('public.%I', table_name),
    privilege_name
  ),
  format('authenticated has no direct %s on %s', privilege_name, table_name)
)
from (
  values
    ('training_completions'),
    ('follow_up_reviews'),
    ('saved_insights'),
    ('points_ledger'),
    ('user_badges')
) as protected_progress_table(table_name)
cross join (
  values
    ('insert'), ('update'), ('delete'), ('truncate'),
    ('references'), ('trigger'), ('maintain')
) as denied_progress_privilege(privilege_name);

set role authenticated;
select throws_ok(
  $$insert into public.saved_insights(
      user_id, scene_version_id, insight_kind
    ) values (
      '90000000-0000-4000-8000-000000000010',
      '92000000-0000-4000-8000-000000000001',
      'reframe'
    )$$,
  '42501',
  null,
  'authenticated cannot bypass saved-insight RPCs with a direct insert'
);
select throws_ok(
  $$select private.coach_can_read_pinned_completion(
      '90000000-0000-4000-8000-000000000010',
      '93000000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  null,
  'authenticated cannot directly resolve the predicate while private schema usage is revoked'
);
reset role;

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('90000000-0000-4000-8000-000000000000','authenticated','authenticated','progress-coach-a@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000001','authenticated','authenticated','progress-coach-b@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000010','authenticated','authenticated','progress-owner@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000011','authenticated','authenticated','progress-member-two@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000012','authenticated','authenticated','progress-member-three@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000013','authenticated','authenticated','progress-other-cohort@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000014','authenticated','authenticated','progress-outsider@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000015','authenticated','authenticated','progress-independent-reviewer@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000020','authenticated','authenticated','progress-race-insert@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000021','authenticated','authenticated','progress-race-transfer@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000022','authenticated','authenticated','progress-race-consent@example.invalid',now(),now()),
  ('90000000-0000-4000-8000-000000000023','authenticated','authenticated','progress-race-close@example.invalid',now(),now());

insert into public.profiles(
  id,
  display_name,
  is_adult_confirmed,
  service_status
) values
  ('90000000-0000-4000-8000-000000000000','进度教练甲',true,'active'),
  ('90000000-0000-4000-8000-000000000001','进度教练乙',true,'active'),
  ('90000000-0000-4000-8000-000000000010','进度本人',true,'active'),
  ('90000000-0000-4000-8000-000000000011','进度成员二',true,'active'),
  ('90000000-0000-4000-8000-000000000012','进度成员三',true,'active'),
  ('90000000-0000-4000-8000-000000000013','另一班成员',true,'active'),
  ('90000000-0000-4000-8000-000000000014','未加入成员',true,'active'),
  ('90000000-0000-4000-8000-000000000015','独立复盘成员',true,'active'),
  ('90000000-0000-4000-8000-000000000020','并发加班成员',true,'active'),
  ('90000000-0000-4000-8000-000000000021','并发转班成员',true,'active'),
  ('90000000-0000-4000-8000-000000000022','并发撤回成员',true,'active'),
  ('90000000-0000-4000-8000-000000000023','并发关班成员',true,'active');

insert into public.staff_roles(user_id, role) values
  ('90000000-0000-4000-8000-000000000000','coach'),
  ('90000000-0000-4000-8000-000000000001','coach');

insert into public.cohorts(
  id,
  name,
  coach_id,
  status,
  collective_goal
) values
  ('93000000-0000-4000-8000-000000000001','进度甲班','90000000-0000-4000-8000-000000000000','active',5),
  ('93000000-0000-4000-8000-000000000002','进度乙班','90000000-0000-4000-8000-000000000001','active',5),
  ('93000000-0000-4000-8000-000000000003','关闭测试班','90000000-0000-4000-8000-000000000001','closed',5),
  ('93000000-0000-4000-8000-000000000004','关班竞态班','90000000-0000-4000-8000-000000000000','active',5);

insert into public.cohort_memberships(cohort_id, user_id, joined_at) values
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000010',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000011',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000012',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000013',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000015',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000020',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000021',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000022',clock_timestamp() - interval '2 days'),
  ('93000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000023',clock_timestamp() - interval '2 days');

insert into public.scenes(
  id,
  scene_code,
  slug,
  relationship,
  category
) values
  ('91000000-0000-4000-8000-000000000001','PC-901','progress-one','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000002','PC-902','progress-two','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000003','PC-903','progress-three','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000004','PC-904','progress-four','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000005','PC-905','progress-five','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000006','PC-906','progress-six','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000010','PC-910','progress-draft','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000011','PC-911','progress-review','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000012','PC-912','progress-changes','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000013','PC-913','progress-approved','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000014','PC-914','progress-paused','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000015','PC-915','progress-blocked','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000016','PC-916','progress-emergency','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000017','PC-917','progress-retired','parent-child','进度测试'),
  ('91000000-0000-4000-8000-000000000018','PC-918','progress-stop','parent-child','进度测试');

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
  ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',1,'published','standard','{"title":"one"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '3 days'),
  ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001',2,'published','standard','{"title":"one-v2"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days'),
  ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002',1,'published','caution','{"title":"two"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days'),
  ('92000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000003',1,'published','standard','{"title":"three"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days'),
  ('92000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000004',1,'published','standard','{"title":"four"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days'),
  ('92000000-0000-4000-8000-000000000006','91000000-0000-4000-8000-000000000005',1,'published','standard','{"title":"five"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days'),
  ('92000000-0000-4000-8000-000000000007','91000000-0000-4000-8000-000000000006',1,'published','standard','{"title":"six"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days'),
  ('92000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000010',1,'draft','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000011',1,'in_review','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000012','91000000-0000-4000-8000-000000000012',1,'changes_requested','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000013','91000000-0000-4000-8000-000000000013',1,'approved','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000014','91000000-0000-4000-8000-000000000014',1,'paused','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000015','91000000-0000-4000-8000-000000000015',1,'blocked','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000016','91000000-0000-4000-8000-000000000016',1,'emergency_withdrawn','standard','{"title":"withdrawn-secret"}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000017','91000000-0000-4000-8000-000000000017',1,'retired','standard','{}','90000000-0000-4000-8000-000000000000',null),
  ('92000000-0000-4000-8000-000000000018','91000000-0000-4000-8000-000000000018',1,'published','stop','{"title":"stop-secret"}','90000000-0000-4000-8000-000000000000',clock_timestamp() - interval '2 days');

insert into public.training_sessions(
  id,
  user_id,
  scene_version_id,
  idempotency_key,
  status,
  started_at,
  expires_at,
  updated_at
) values
  ('94000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','active',clock_timestamp() - interval '1 hour',clock_timestamp() + interval '23 hours',clock_timestamp() - interval '1 hour'),
  ('94000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','active',clock_timestamp() - interval '50 minutes',clock_timestamp() + interval '23 hours',clock_timestamp() - interval '50 minutes'),
  ('94000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000013','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','active',clock_timestamp() - interval '1 hour',clock_timestamp() + interval '23 hours',clock_timestamp() - interval '1 hour'),
  ('94000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000004','active',clock_timestamp() - interval '40 minutes',clock_timestamp() + interval '23 hours',clock_timestamp() - interval '40 minutes');

update public.training_sessions
set status = 'completed',
    completed_at = clock_timestamp() - interval '30 minutes'
where id = '94000000-0000-4000-8000-000000000003';
insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
) values (
  '98000000-0000-4000-8000-000000000003',
  '90000000-0000-4000-8000-000000000013',
  '94000000-0000-4000-8000-000000000003',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000003',
  clock_timestamp() - interval '30 minutes'
);

select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'unauthenticated',
  'completion rejects a caller without auth.uid'
);
select throws_ok(
  $$select * from public.complete_training(null, '96000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'invalid_progress_request',
  'completion rejects a null session'
);
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000001',
      null
    )$$,
  'P0001',
  'invalid_progress_request',
  'completion rejects a null idempotency key'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training(
      '94000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000001'
    )$$,
  $$values (true, 10)$$,
  'first completion of a stable scene earns exactly ten points'
);
reset role;

select ok(
  (
    select completion_row.cohort_id = '93000000-0000-4000-8000-000000000001'
      and completion_row.completed_at = session_row.completed_at
      and session_row.status = 'completed'
    from public.training_completions as completion_row
    join public.training_sessions as session_row
      on session_row.id = completion_row.session_id
    where completion_row.session_id = '94000000-0000-4000-8000-000000000001'
  ),
  'completion atomically pins the exact cohort and one server timestamp'
);
select is(
  (
    select count(*)
    from public.points_ledger
    where user_id = '90000000-0000-4000-8000-000000000010'
      and reason = 'first_scene_completion'
      and source_id = '91000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'first stable-scene completion has exactly one award row'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select results_eq(
  $$select retry."completionId", retry.awarded, retry."pointsDelta"
    from public.complete_training(
      '94000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000001'
    ) as retry$$,
  $$select original.id, false, 0
    from public.training_completions as original
    where original.session_id = '94000000-0000-4000-8000-000000000001'$$,
  'same completion key returns the original result without a new award'
);
select results_eq(
  $$select retry."completionId", retry.awarded, retry."pointsDelta"
    from public.complete_training(
      '94000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000002'
    ) as retry$$,
  $$select original.id, false, 0
    from public.training_completions as original
    where original.session_id = '94000000-0000-4000-8000-000000000001'$$,
  'a new free key aliases the already completed session without duplicating it'
);
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'idempotency_conflict',
  'a completion key cannot be rebound to a different session'
);
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training(
      '94000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000003'
    )$$,
  $$values (false, 0)$$,
  'another version of the same stable scene completes without another first-scene award'
);
reset role;

select is(
  (
    select count(*)
    from public.training_completions
    where user_id = '90000000-0000-4000-8000-000000000010'
      and scene_version_id in (
        '92000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000002'
      )
  ),
  2::bigint,
  'both same-scene sessions persist while the stable-scene award remains singular'
);
select is(
  (
    select count(*)
    from private.progress_idempotency_keys
    where user_id = '90000000-0000-4000-8000-000000000010'
      and event_kind = 'completion'
      and source_id = '94000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'same-session aliases are permanently bound to the same completion event'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000099',
      '96000000-0000-4000-8000-000000000099'
    )$$,
  'P0001',
  'session_not_found',
  'missing sessions use the non-enumerating not-found surface'
);
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000003',
      '96000000-0000-4000-8000-000000000098'
    )$$,
  'P0001',
  'session_not_found',
  'another participant session uses the same non-enumerating surface'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000001'),
      true,
      'helpful',
      'supported',
      'repeat',
      '97000000-0000-4000-8000-000000000001'
    )$$,
  $$values (true, 5)$$,
  'the first controlled review earns five points regardless of positive outcome'
);
select results_eq(
  $$select retry."reviewId", retry.awarded, retry."pointsDelta"
    from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000001'),
      true,
      'helpful',
      'supported',
      'repeat',
      '97000000-0000-4000-8000-000000000001'
    ) as retry$$,
  $$select original.id, false, 0
    from public.follow_up_reviews as original
    join public.training_completions as completion_row
      on completion_row.id = original.completion_id
    where completion_row.session_id = '94000000-0000-4000-8000-000000000001'$$,
  'an exact review retry returns the original review without points'
);
select results_eq(
  $$select retry."reviewId", retry.awarded, retry."pointsDelta"
    from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000001'),
      true,
      'helpful',
      'supported',
      'repeat',
      '97000000-0000-4000-8000-000000000002'
    ) as retry$$,
  $$select original.id, false, 0
    from public.follow_up_reviews as original
    join public.training_completions as completion_row
      on completion_row.id = original.completion_id
    where completion_row.session_id = '94000000-0000-4000-8000-000000000001'$$,
  'a semantic review duplicate binds a free alias and returns the original'
);
select throws_ok(
  $$select * from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000001'),
      false,
      'no_change',
      'uncertain',
      'adjust',
      '97000000-0000-4000-8000-000000000003'
    )$$,
  'P0001',
  'review_already_recorded',
  'different review content never overwrites the first response'
);
select throws_ok(
  $$select * from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000001'),
      true,
      'helpful',
      'supported',
      'repeat',
      '96000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'idempotency_conflict',
  'a completion key cannot be reused for a review'
);
select throws_ok(
  $$select * from public.complete_training_review(
      '98000000-0000-4000-8000-000000000099',
      true,
      'helpful',
      'supported',
      'repeat',
      '97000000-0000-4000-8000-000000000099'
    )$$,
  'P0001',
  'completion_not_found',
  'missing review sources use a non-enumerating completion surface'
);
select throws_ok(
  $$select * from public.complete_training_review(
      '98000000-0000-4000-8000-000000000003',
      true,
      'helpful',
      'supported',
      'repeat',
      '97000000-0000-4000-8000-000000000098'
    )$$,
  'P0001',
  'completion_not_found',
  'another participant completion uses the same review source surface'
);
reset role;

select is(
  (
    select count(*)
    from private.progress_idempotency_keys
    where user_id = '90000000-0000-4000-8000-000000000010'
      and idempotency_key = '97000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'a rejected review does not consume its free idempotency key'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000004',
      '97000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'idempotency_conflict',
  'a review key cannot be reused for a completion'
);
select throws_ok(
  $$select * from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000002'),
      true,
      'invented',
      'supported',
      'repeat',
      '97000000-0000-4000-8000-000000000004'
    )$$,
  'P0001',
  'invalid_review_request',
  'review rejects an observation outside the controlled enum'
);
select throws_ok(
  $$select * from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000002'),
      true,
      'no_change',
      'invented',
      'repeat',
      '97000000-0000-4000-8000-000000000005'
    )$$,
  'P0001',
  'invalid_review_request',
  'review rejects a hypothesis result outside the controlled enum'
);
select throws_ok(
  $$select * from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000002'),
      true,
      'no_change',
      'uncertain',
      'invented',
      '97000000-0000-4000-8000-000000000006'
    )$$,
  'P0001',
  'invalid_review_request',
  'review rejects a next direction outside the controlled enum'
);
reset role;

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, updated_at
) values
  ('94000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000004','95000000-0000-4000-8000-000000000005','active',clock_timestamp()-interval '30 minutes',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '30 minutes'),
  ('94000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000005','95000000-0000-4000-8000-000000000006','active',clock_timestamp()-interval '20 minutes',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '20 minutes'),
  ('94000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000006','95000000-0000-4000-8000-000000000007','active',clock_timestamp()-interval '10 minutes',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '10 minutes');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select * from public.complete_training(
  '94000000-0000-4000-8000-000000000005',
  '96000000-0000-4000-8000-000000000005'
);
select * from public.complete_training(
  '94000000-0000-4000-8000-000000000006',
  '96000000-0000-4000-8000-000000000006'
);
select * from public.complete_training(
  '94000000-0000-4000-8000-000000000007',
  '96000000-0000-4000-8000-000000000007'
);
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000005'),
      false, 'no_change', 'unsupported', 'adjust',
      '97000000-0000-4000-8000-000000000005'
    )$$,
  $$values (true, 5)$$,
  'no-change review earns the same five points'
);
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000006'),
      false, 'not_tried', 'uncertain', 'boundary',
      '97000000-0000-4000-8000-000000000006'
    )$$,
  $$values (true, 5)$$,
  'not-tried review earns the same five points'
);
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000007'),
      true, 'needs_support', 'uncertain', 'seek_help',
      '97000000-0000-4000-8000-000000000007'
    )$$,
  $$values (true, 5)$$,
  'needs-support review earns the same five points without creating a support record'
);
reset role;

select is(
  (
    select pg_catalog.count(*)
    from public.support_tickets
    where user_id = '90000000-0000-4000-8000-000000000010'
  ),
  0::bigint,
  'Task 9 seek-help review creates no support ticket row'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select is(
  public.set_saved_insight(
    '92000000-0000-4000-8000-000000000001',
    'reframe',
    true
  ),
  true,
  'an eligible owner may save the governed reframe'
);
select is(
  public.set_saved_insight(
    '92000000-0000-4000-8000-000000000001',
    'reframe',
    true
  ),
  true,
  'repeating desired saved=true remains true'
);
select is(
  public.set_saved_insight(
    '92000000-0000-4000-8000-000000000001',
    'expression',
    true
  ),
  true,
  'the separate governed expression kind may also be saved'
);
select throws_ok(
  $$select public.set_saved_insight(
      '92000000-0000-4000-8000-000000000001',
      'invented',
      true
    )$$,
  'P0001',
  'invalid_saved_insight_request',
  'saved insights reject unknown kinds'
);
reset role;

select is(
  (
    select count(*)
    from public.saved_insights
    where user_id = '90000000-0000-4000-8000-000000000010'
      and scene_version_id = '92000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'repeated desired-state saves create one row per allowed kind'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000012', false);
set role authenticated;
select throws_ok(
  $$select public.set_saved_insight(
      '92000000-0000-4000-8000-000000000001',
      'reframe',
      true
    )$$,
  'P0001',
  'insight_not_savable',
  'another participant cannot save without owning an exact-version completion'
);
reset role;

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, completed_at, updated_at
) values (
  '94000000-0000-4000-8000-000000000016',
  '90000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000016',
  '95000000-0000-4000-8000-000000000016',
  'completed',
  clock_timestamp() - interval '2 hours',
  clock_timestamp() + interval '22 hours',
  clock_timestamp() - interval '1 hour',
  clock_timestamp() - interval '1 hour'
);
insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
) values (
  '98000000-0000-4000-8000-000000000016',
  '90000000-0000-4000-8000-000000000010',
  '94000000-0000-4000-8000-000000000016',
  '92000000-0000-4000-8000-000000000016',
  '93000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000016',
  clock_timestamp() - interval '1 hour'
);
insert into public.saved_insights(
  user_id, scene_version_id, insight_kind, saved_at
) values (
  '90000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000016',
  'reframe',
  clock_timestamp()
);

update public.profiles
set service_status = 'consent_withdrawn'
where id = '90000000-0000-4000-8000-000000000010';

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  $$select public.set_saved_insight(
      '92000000-0000-4000-8000-000000000001',
      'reframe',
      true
    )$$,
  'P0001',
  'insight_not_savable',
  'an exited participant cannot add or reassert a saved insight'
);
select is(
  (
    select jsonb_agg(item order by item->>'savedAt' desc)
    from jsonb_array_elements(public.list_saved_insights()) as item
    where item->>'sceneVersionId' = '92000000-0000-4000-8000-000000000016'
  )->0->>'route',
  'safety-stop',
  'withdrawn content is listed only as a safety-stop route'
);
select ok(
  (
    select bool_and(item ?& array['sceneVersionId','kind','savedAt','route'])
      and bool_and((
        select count(*) = 4
        from jsonb_object_keys(item)
      ))
      and bool_and(item->>'route' <> 'available')
    from jsonb_array_elements(public.list_saved_insights()) as item
  ),
  'an exited caller receives only four-key minimal rows and no available content route'
);
select ok(
  public.list_saved_insights()::text not like '%withdrawn-secret%'
    and public.list_saved_insights()::text not like '%stop-secret%',
  'saved listing never returns withdrawn authored content'
);
select is(
  public.set_saved_insight(
    '92000000-0000-4000-8000-000000000016',
    'reframe',
    false
  ),
  false,
  'an exited owner may delete a withdrawn saved insight'
);
select is(
  public.set_saved_insight(
    '92000000-0000-4000-8000-000000000016',
    'reframe',
    false
  ),
  false,
  'repeating desired saved=false remains false when already absent'
);
reset role;

update public.profiles
set service_status = 'active'
where id = '90000000-0000-4000-8000-000000000010';

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select ok(
  (
    select public.get_pending_review()
  ) is not null,
  'an owner with an unreviewed completion receives a pending prompt'
);
select is(
  (
    select count(*)::integer
    from jsonb_object_keys(public.get_pending_review())
  ),
  3::integer,
  'pending review contains only completion id, scene version id, and completion time'
);
select ok(
  public.get_pending_review() ?& array['completionId','sceneVersionId','completedAt'],
  'pending review uses the exact minimal camelCase response keys'
);
select ok(
  public.get_pending_review()::text not like any (array[
    '%thought%',
    '%prediction%',
    '%hypothesis%',
    '%evidence%',
    '%answer%',
    '%note%'
  ]),
  'pending review returns no training answer or review response'
);
reset role;

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, completed_at, updated_at
) values
  ('94000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000011','completed',clock_timestamp()-interval '3 hours',clock_timestamp()+interval '21 hours',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours'),
  ('94000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000012','92000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000012','completed',clock_timestamp()-interval '3 hours',clock_timestamp()+interval '21 hours',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours');
insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
) values
  ('98000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000011',clock_timestamp()-interval '2 hours'),
  ('98000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000012','92000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000012',clock_timestamp()-interval '2 hours');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select ok(
  (public.get_private_progress()->>'points')::integer >= 50,
  'private points equal the ledger sum and include no correctness score'
);
select is(
  public.get_private_progress()->'classAggregate'->>'activeMembers',
  '6',
  'safe class aggregate counts only the six currently eligible members of the exact cohort'
);
select is(
  public.get_private_progress()->'classAggregate'->>'completedScenes',
  '7',
  'class aggregate counts distinct participant and stable-scene pairs'
);
select ok(
  public.get_private_progress()::text not like any (array[
    '%rank%',
    '%userId%',
    '%displayName%',
    '%individualPoints%',
    '%answer%'
  ]),
  'class aggregate exposes no identity, rank, individual points, or answers'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000013', false);
set role authenticated;
select is(
  public.get_private_progress()->'classAggregate',
  'null'::jsonb,
  'a cohort with fewer than three active members suppresses its aggregate'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000014', false);
set role authenticated;
select is(
  public.get_private_progress()->'classAggregate',
  'null'::jsonb,
  'zero current active cohorts preserves private progress while suppressing aggregate'
);
reset role;

insert into public.cohort_memberships(cohort_id, user_id, joined_at)
values (
  '93000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000010',
  clock_timestamp()
);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select is(
  public.get_private_progress()->'classAggregate',
  'null'::jsonb,
  'multiple current active cohorts suppress aggregate without erasing private progress'
);
reset role;
delete from public.cohort_memberships
where cohort_id = '93000000-0000-4000-8000-000000000002'
  and user_id = '90000000-0000-4000-8000-000000000010';

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, updated_at
)
select
  session_id::uuid,
  '90000000-0000-4000-8000-000000000010'::uuid,
  version_id::uuid,
  request_id::uuid,
  'active',
  clock_timestamp() - interval '1 hour',
  clock_timestamp() + interval '23 hours',
  clock_timestamp() - interval '1 hour'
from (
  values
    ('94000000-0000-4000-8000-000000000110','92000000-0000-4000-8000-000000000010','95000000-0000-4000-8000-000000000110'),
    ('94000000-0000-4000-8000-000000000111','92000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000111'),
    ('94000000-0000-4000-8000-000000000112','92000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000112'),
    ('94000000-0000-4000-8000-000000000113','92000000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000113'),
    ('94000000-0000-4000-8000-000000000114','92000000-0000-4000-8000-000000000014','95000000-0000-4000-8000-000000000114'),
    ('94000000-0000-4000-8000-000000000115','92000000-0000-4000-8000-000000000015','95000000-0000-4000-8000-000000000115'),
    ('94000000-0000-4000-8000-000000000116','92000000-0000-4000-8000-000000000016','95000000-0000-4000-8000-000000000116'),
    ('94000000-0000-4000-8000-000000000117','92000000-0000-4000-8000-000000000017','95000000-0000-4000-8000-000000000117'),
    ('94000000-0000-4000-8000-000000000118','92000000-0000-4000-8000-000000000018','95000000-0000-4000-8000-000000000118')
) as content_case(session_id, version_id, request_id);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, updated_at
) values
  ('94000000-0000-4000-8000-000000000120','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000120','paused',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '30 minutes'),
  ('94000000-0000-4000-8000-000000000121','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000121','active',clock_timestamp()-interval '25 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000122','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000122','abandoned',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '30 minutes'),
  ('94000000-0000-4000-8000-000000000123','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000123','safety_stopped',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '30 minutes');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  format(
    'select * from public.complete_training(%L::uuid,%L::uuid)',
    session_id,
    request_id
  ),
  'P0001',
  'session_not_completable',
  format('%s content cannot be completed', content_state)
)
from (
  values
    ('draft','94000000-0000-4000-8000-000000000110','96000000-0000-4000-8000-000000000110'),
    ('in_review','94000000-0000-4000-8000-000000000111','96000000-0000-4000-8000-000000000111'),
    ('changes_requested','94000000-0000-4000-8000-000000000112','96000000-0000-4000-8000-000000000112'),
    ('approved','94000000-0000-4000-8000-000000000113','96000000-0000-4000-8000-000000000113'),
    ('paused-content','94000000-0000-4000-8000-000000000114','96000000-0000-4000-8000-000000000114'),
    ('blocked','94000000-0000-4000-8000-000000000115','96000000-0000-4000-8000-000000000115'),
    ('emergency-withdrawn','94000000-0000-4000-8000-000000000116','96000000-0000-4000-8000-000000000116'),
    ('retired','94000000-0000-4000-8000-000000000117','96000000-0000-4000-8000-000000000117'),
    ('stop-risk','94000000-0000-4000-8000-000000000118','96000000-0000-4000-8000-000000000118')
) as rejected_content(content_state, session_id, request_id);
select throws_ok(
  format(
    'select * from public.complete_training(%L::uuid,%L::uuid)',
    session_id,
    request_id
  ),
  'P0001',
  'session_not_completable',
  format('%s session cannot be completed', session_state)
)
from (
  values
    ('paused','94000000-0000-4000-8000-000000000120','96000000-0000-4000-8000-000000000120'),
    ('expired','94000000-0000-4000-8000-000000000121','96000000-0000-4000-8000-000000000121'),
    ('abandoned','94000000-0000-4000-8000-000000000122','96000000-0000-4000-8000-000000000122'),
    ('safety-stopped','94000000-0000-4000-8000-000000000123','96000000-0000-4000-8000-000000000123')
) as rejected_session(session_state, session_id, request_id);
reset role;

select is(
  (
    select count(*)
    from private.progress_idempotency_keys
    where idempotency_key between
      '96000000-0000-4000-8000-000000000110'
      and '96000000-0000-4000-8000-000000000123'
  ),
  0::bigint,
  'rejected session and content states consume no idempotency key'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, updated_at
) values (
  '94000000-0000-4000-8000-000000000124',
  '90000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000007',
  '95000000-0000-4000-8000-000000000124',
  'active',
  clock_timestamp() - interval '1 hour',
  clock_timestamp() + interval '23 hours',
  clock_timestamp() - interval '1 hour'
);
update public.profiles
set service_status = 'consent_withdrawn'
where id = '90000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000124',
      '96000000-0000-4000-8000-000000000124'
    )$$,
  'P0001',
  'session_not_completable',
  'service-consent withdrawal prevents a new completion'
);
select results_eq(
  $$select awarded, "pointsDelta"
    from public.complete_training(
      '94000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000008'
    )$$,
  $$values (false, 0)$$,
  'a completed session retry does not re-require current eligibility'
);
reset role;
update public.profiles
set service_status = 'active'
where id = '90000000-0000-4000-8000-000000000010';

insert into public.cohort_memberships(cohort_id, user_id, joined_at)
values (
  '93000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000010',
  clock_timestamp() - interval '1 day'
);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000124',
      '96000000-0000-4000-8000-000000000125'
    )$$,
  'P0001',
  'cohort_context_ambiguous',
  'multiple active cohorts fail closed without choosing one'
);
reset role;
delete from public.cohort_memberships
where cohort_id = '93000000-0000-4000-8000-000000000002'
  and user_id = '90000000-0000-4000-8000-000000000010';

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, completed_at, updated_at
) values (
  '94000000-0000-4000-8000-000000000019',
  '90000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000007',
  '95000000-0000-4000-8000-000000000019',
  'completed',
  clock_timestamp() - interval '1 hour',
  clock_timestamp() + interval '23 hours',
  clock_timestamp() - interval '30 minutes',
  clock_timestamp() - interval '30 minutes'
);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select throws_ok(
  $$select * from public.complete_training(
      '94000000-0000-4000-8000-000000000019',
      '96000000-0000-4000-8000-000000000019'
    )$$,
  'P0001',
  'database_integrity_failure',
  'a completed session without its completion is a stable integrity failure'
);
reset role;

insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
) values (
  '98000000-0000-4000-8000-000000000019',
  '90000000-0000-4000-8000-000000000010',
  '94000000-0000-4000-8000-000000000019',
  '92000000-0000-4000-8000-000000000007',
  null,
  '96000000-0000-4000-8000-000000000019',
  clock_timestamp() - interval '30 minutes'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where id = '98000000-0000-4000-8000-000000000019'
  ),
  1::bigint,
  'participant can read their legacy null-cohort completion'
);
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where id = '98000000-0000-4000-8000-000000000019'
  ),
  0::bigint,
  'coach cannot read a legacy null-cohort completion'
);
select ok(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ) = 1,
  'assigned coach with coach role sees a pinned completion for a current exact-cohort member'
);
reset role;
select set_config('request.jwt.claim.sub', '', false);
select is(
  private.coach_can_read_pinned_completion(
    '90000000-0000-4000-8000-000000000010',
    '93000000-0000-4000-8000-000000000001'
  ),
  false,
  'coach predicate strictly rejects a missing JWT subject for an otherwise authorized row'
);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'RLS hides an otherwise coach-visible completion when the JWT subject is missing'
);
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
delete from public.staff_roles
where user_id = '90000000-0000-4000-8000-000000000000'
  and role = 'coach';
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'assigned cohort coach without the coach staff role cannot read pinned completions'
);
reset role;
insert into public.staff_roles(user_id, role)
values (
  '90000000-0000-4000-8000-000000000000',
  'coach'
);
update public.cohorts
set status = 'closed'
where id = '93000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'assigned coach cannot read a pinned completion after its cohort closes'
);
reset role;
update public.cohorts
set status = 'active'
where id = '93000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'another cohort coach cannot read the pinned completion'
);
reset role;

insert into public.cohort_memberships(cohort_id, user_id, joined_at)
values (
  '93000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000010',
  clock_timestamp()
);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'a second membership does not remove exact pinned-cohort authorization from the old coach'
);
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'membership in another cohort never authorizes that cohort coach for an old pinned row'
);
reset role;

delete from public.cohort_memberships
where cohort_id = '93000000-0000-4000-8000-000000000001'
  and user_id = '90000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'transfer removes old-cohort coach visibility'
);
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', false);
set role authenticated;
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'transfer does not expose old-cohort history to the new coach'
);
reset role;
delete from public.cohort_memberships
where cohort_id = '93000000-0000-4000-8000-000000000002'
  and user_id = '90000000-0000-4000-8000-000000000010';
insert into public.cohort_memberships(cohort_id, user_id, joined_at)
values (
  '93000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000010',
  clock_timestamp() - interval '2 days'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, completed_at, updated_at
)
select
  ('94150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000015'::uuid,
  (array[
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000006'
  ]::uuid[])[((item - 1) % 5) + 1],
  ('95150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'completed',
  '2026-07-01 00:00:00+00'::timestamptz + item * interval '1 hour',
  '2026-08-01 00:00:00+00'::timestamptz,
  '2026-07-01 00:30:00+00'::timestamptz + item * interval '1 hour',
  '2026-07-01 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;

insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
)
select
  ('98150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000015'::uuid,
  ('94150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  (array[
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000006'
  ]::uuid[])[((item - 1) % 5) + 1],
  '93000000-0000-4000-8000-000000000002'::uuid,
  ('96150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '2026-07-01 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;

insert into public.follow_up_reviews(
  id, user_id, completion_id, idempotency_key,
  attempted, observation, hypothesis_result, next_direction, created_at
)
select
  ('99150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000015'::uuid,
  ('98150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('97150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  true,
  'helpful',
  'supported',
  'repeat',
  '2026-07-02 00:00:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;

insert into public.points_ledger(
  user_id, reason, source_id, idempotency_key, points, created_at
)
select
  '90000000-0000-4000-8000-000000000015'::uuid,
  'first_scene_completion'::public.point_reason,
  (array[
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000005'
  ]::uuid[])[item],
  ('96150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  10,
  '2026-07-01 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 5) as item;

insert into public.points_ledger(
  user_id, reason, source_id, idempotency_key, points, created_at
)
select
  '90000000-0000-4000-8000-000000000015'::uuid,
  'review_completion'::public.point_reason,
  ('98150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('97150000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  5,
  '2026-07-02 00:00:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000015', false);
set role authenticated;
select is(
  (public.get_private_progress()->>'points')::integer,
  100,
  'private progress points are the exact ledger sum'
);
select is(
  (public.get_private_progress()->>'completedScenes')::integer,
  5,
  'private progress counts distinct stable scenes across repeated versions'
);
select is(
  (public.get_private_progress()->>'reviewsCompleted')::integer,
  10,
  'private progress counts actual review rows'
);
select is(
  (public.get_private_progress()->>'thisWeekCompletions')::integer,
  0,
  'this-week count includes completion events rather than historical distinct scenes'
);
select results_eq(
  $$select badge->>'key', badge->>'label'
    from jsonb_array_elements(public.get_private_progress()->'badges')
      with ordinality as badge_row(badge, ordinal)
    order by ordinal$$,
  $$values
      ('first-scene'::text, '第一次转念'::text),
      ('five-scenes'::text, '看见五个新可能'::text),
      ('ten-reviews'::text, '完成十次复盘'::text)$$,
  'deterministic milestones use exact keys, labels, and order'
);
select results_eq(
  $$select surprise->>'key', surprise->>'label'
    from jsonb_array_elements(public.get_private_progress()->'unlockedSurprises')
      with ordinality as surprise_row(surprise, ordinal)
    order by ordinal$$,
  $$values
      ('five-scene-observation-card'::text, '隐藏观察卡'::text),
      ('ten-review-family-lens'::text, '家庭关系多面镜'::text)$$,
  'surprises unlock independently in deterministic order'
);
select ok(
  (
    select bool_and((badge->>'awardedAt')::timestamptz is not null)
    from jsonb_array_elements(public.get_private_progress()->'badges') as badge
  ),
  'all deterministic badges carry the earliest qualifying timestamp'
);
reset role;

select ok(
  pg_catalog.pg_get_functiondef(
    'public.get_private_progress()'::regprocedure
  ) like '%Asia/Shanghai%'
    and pg_catalog.pg_get_functiondef(
      'public.get_private_progress()'::regprocedure
    ) like '%date_trunc%',
  'private progress documents a Monday week boundary in Asia/Shanghai'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, completed_at, updated_at
)
select
  ('94140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000014'::uuid,
  '92000000-0000-4000-8000-000000000001'::uuid,
  ('95140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'completed',
  '2026-07-03 00:00:00+00'::timestamptz + item * interval '1 hour',
  '2026-08-03 00:00:00+00'::timestamptz,
  '2026-07-03 00:30:00+00'::timestamptz + item * interval '1 hour',
  '2026-07-03 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;
insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
)
select
  ('98140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000014'::uuid,
  ('94140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '92000000-0000-4000-8000-000000000001'::uuid,
  null,
  ('96140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '2026-07-03 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;
insert into public.follow_up_reviews(
  id, user_id, completion_id, idempotency_key,
  attempted, observation, hypothesis_result, next_direction, created_at
)
select
  ('99140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000014'::uuid,
  ('98140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('97140000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  false,
  'not_tried',
  'uncertain',
  'adjust',
  '2026-07-04 00:00:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 10) as item;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000014', false);
set role authenticated;
select results_eq(
  $$select surprise->>'key'
    from jsonb_array_elements(public.get_private_progress()->'unlockedSurprises')
      with ordinality as surprise_row(surprise, ordinal)
    order by ordinal$$,
  $$values ('ten-review-family-lens'::text)$$,
  'ten-review surprise does not depend on also having five distinct scenes'
);
select is(
  (public.get_private_progress()->>'completedScenes')::integer,
  1,
  'independent ten-review test still has only one stable scene'
);
select is(
  public.get_private_progress()->'classAggregate',
  'null'::jsonb,
  'ineligible historical participant receives no class aggregate'
);
reset role;

select lives_ok(
  $$select private.backfill_progress_idempotency_keys()$$,
  'clean legacy completion and review keys backfill without inventing awards'
);
select ok(
  exists (
    select 1
    from private.progress_idempotency_keys
    where user_id = '90000000-0000-4000-8000-000000000015'
      and idempotency_key = '96150000-0000-4000-8000-000000000001'
      and event_kind = 'completion'
      and source_id = '94150000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1
    from private.progress_idempotency_keys
    where user_id = '90000000-0000-4000-8000-000000000015'
      and idempotency_key = '97150000-0000-4000-8000-000000000001'
      and event_kind = 'review'
      and source_id = '98150000-0000-4000-8000-000000000001'
  ),
  'backfill binds identifiers and event kinds only'
);

insert into public.follow_up_reviews(
  id, user_id, completion_id, idempotency_key,
  attempted, observation, hypothesis_result, next_direction
) values (
  '99990000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000010',
  '98000000-0000-4000-8000-000000000019',
  '96000000-0000-4000-8000-000000000019',
  true,
  'helpful',
  'supported',
  'repeat'
);
select throws_ok(
  $$select private.backfill_progress_idempotency_keys()$$,
  'P0001',
  'legacy_idempotency_conflict',
  'migration backfill fails visibly when one user key names completion and review events'
);
delete from public.follow_up_reviews
where id = '99990000-0000-4000-8000-000000000001';

insert into public.points_ledger(
  id, user_id, reason, source_id, idempotency_key, points
) values (
  '99990000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000013',
  'review_completion',
  '99990000-0000-4000-8000-000000000099',
  '99990000-0000-4000-8000-000000000003',
  5
);
select throws_ok(
  $$select private.backfill_progress_idempotency_keys()$$,
  'P0001',
  'legacy_point_binding_orphan',
  'migration backfill fails visibly for an orphaned legacy point key'
);
delete from public.points_ledger
where id = '99990000-0000-4000-8000-000000000002';

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, updated_at
) values
  ('94000000-0000-4000-8000-000000000130','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000130','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000131','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000131','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000132','90000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000132','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 second',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000220','90000000-0000-4000-8000-000000000020','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000220','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000221','90000000-0000-4000-8000-000000000021','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000221','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000222','90000000-0000-4000-8000-000000000022','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000222','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '1 hour'),
  ('94000000-0000-4000-8000-000000000223','90000000-0000-4000-8000-000000000023','92000000-0000-4000-8000-000000000007','95000000-0000-4000-8000-000000000223','active',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '23 hours',clock_timestamp()-interval '1 hour');

select extensions.dblink_connect(
  'progress_worker_a',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'progress_worker_b',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'progress_admin',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'progress_lock',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);

select extensions.dblink_exec('progress_worker_a', $capture$
  create or replace function pg_temp.capture_completion(
    p_session_id uuid,
    p_key uuid
  )
  returns table(
    completion_id uuid,
    awarded boolean,
    points_delta integer,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select result."completionId", result.awarded, result."pointsDelta", null::text
    from public.complete_training(p_session_id, p_key) as result;
  exception when others then
    return query select null::uuid, null::boolean, null::integer, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_review(
    p_completion_id uuid,
    p_key uuid
  )
  returns table(
    review_id uuid,
    awarded boolean,
    points_delta integer,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select result."reviewId", result.awarded, result."pointsDelta", null::text
    from public.complete_training_review(
      p_completion_id, false, 'not_tried', 'uncertain', 'adjust', p_key
    ) as result;
  exception when others then
    return query select null::uuid, null::boolean, null::integer, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_saved(
    p_scene_version_id uuid,
    p_key text,
    p_saved boolean
  )
  returns table(saved boolean, error_message text)
  language plpgsql as $$
  begin
    return query
    select public.set_saved_insight(p_scene_version_id, p_key, p_saved), null::text;
  exception when others then
    return query select null::boolean, sqlerrm;
  end;
  $$;
$capture$);
select extensions.dblink_exec('progress_worker_b', $capture$
  create or replace function pg_temp.capture_completion(
    p_session_id uuid,
    p_key uuid
  )
  returns table(
    completion_id uuid,
    awarded boolean,
    points_delta integer,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select result."completionId", result.awarded, result."pointsDelta", null::text
    from public.complete_training(p_session_id, p_key) as result;
  exception when others then
    return query select null::uuid, null::boolean, null::integer, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_review(
    p_completion_id uuid,
    p_key uuid
  )
  returns table(
    review_id uuid,
    awarded boolean,
    points_delta integer,
    error_message text
  )
  language plpgsql as $$
  begin
    return query
    select result."reviewId", result.awarded, result."pointsDelta", null::text
    from public.complete_training_review(
      p_completion_id, false, 'not_tried', 'uncertain', 'adjust', p_key
    ) as result;
  exception when others then
    return query select null::uuid, null::boolean, null::integer, sqlerrm;
  end;
  $$;

  create or replace function pg_temp.capture_saved(
    p_scene_version_id uuid,
    p_key text,
    p_saved boolean
  )
  returns table(saved boolean, error_message text)
  language plpgsql as $$
  begin
    return query
    select public.set_saved_insight(p_scene_version_id, p_key, p_saved), null::text;
  exception when others then
    return query select null::boolean, sqlerrm;
  end;
  $$;
$capture$);

select *
from extensions.dblink(
  'progress_worker_a',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000010',false)$$
) as worker_a_claim(value text);
select *
from extensions.dblink(
  'progress_worker_b',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000010',false)$$
) as worker_b_claim(value text);
select extensions.dblink_exec('progress_worker_a', 'set role authenticated');
select extensions.dblink_exec('progress_worker_b', 'set role authenticated');

select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000010',
          0
        )
      )
    ) as held$$
) as same_scene_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000130',
      '96000000-0000-4000-8000-000000000130'
    )$$
);
select extensions.dblink_send_query(
  'progress_worker_b',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000131',
      '96000000-0000-4000-8000-000000000131'
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_worker_a') = 1
    and extensions.dblink_is_busy('progress_worker_b') = 1,
  'both same-scene completion workers overlap at the real participant-state barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table concurrent_same_scene_completion as
select 1 as worker, result.*
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('progress_worker_b')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_b')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select ok(
  (
    select count(*) = 2
      and bool_and(completion_id is not null and error_message is null)
      and count(*) filter (where awarded and points_delta = 10) = 1
      and count(*) filter (where not awarded and points_delta = 0) = 1
    from concurrent_same_scene_completion
  ),
  'two concurrent same-scene sessions both complete but only one earns the stable-scene award'
);
select is(
  (
    select count(*)
    from public.training_completions
    where session_id in (
      '94000000-0000-4000-8000-000000000130',
      '94000000-0000-4000-8000-000000000131'
    )
  ),
  2::bigint,
  'concurrent different-key completions persist exactly one row per session'
);

select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000010',
          0
        )
      )
    ) as held$$
) as concurrent_review_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000130'),
      '97000000-0000-4000-8000-000000000130'
    )$$
);
select extensions.dblink_send_query(
  'progress_worker_b',
  $$select * from pg_temp.capture_review(
      (select id from public.training_completions
       where session_id = '94000000-0000-4000-8000-000000000130'),
      '97000000-0000-4000-8000-000000000131'
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_worker_a') = 1
    and extensions.dblink_is_busy('progress_worker_b') = 1,
  'both review workers overlap at the real participant-state barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table concurrent_review_result as
select 1 as worker, result.*
from extensions.dblink_get_result('progress_worker_a')
  as result(review_id uuid, awarded boolean, points_delta integer, error_message text)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('progress_worker_b')
  as result(review_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(review_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_b')
  as drained(review_id uuid, awarded boolean, points_delta integer, error_message text);
select ok(
  (
    select count(*) = 2
      and count(distinct review_id) = 1
      and bool_and(error_message is null)
      and count(*) filter (where awarded and points_delta = 5) = 1
      and count(*) filter (where not awarded and points_delta = 0) = 1
    from concurrent_review_result
  ),
  'concurrent same-content reviews produce one review, one award, and one semantic alias'
);

delete from public.saved_insights
where user_id = '90000000-0000-4000-8000-000000000010'
  and scene_version_id = '92000000-0000-4000-8000-000000000007'
  and insight_kind = 'reframe';
select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000010',
          0
        )
      )
    ) as held$$
) as concurrent_saved_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_saved(
      '92000000-0000-4000-8000-000000000007',
      'reframe',
      true
    )$$
);
select extensions.dblink_send_query(
  'progress_worker_b',
  $$select * from pg_temp.capture_saved(
      '92000000-0000-4000-8000-000000000007',
      'reframe',
      true
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_worker_a') = 1
    and extensions.dblink_is_busy('progress_worker_b') = 1,
  'both desired-state save workers overlap at the real participant-state barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table concurrent_saved_result as
select 1 as worker, result.*
from extensions.dblink_get_result('progress_worker_a')
  as result(saved boolean, error_message text)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('progress_worker_b')
  as result(saved boolean, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(saved boolean, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_b')
  as drained(saved boolean, error_message text);
select ok(
  (
    select count(*) = 2 and bool_and(saved and error_message is null)
    from concurrent_saved_result
  )
  and (
    select count(*) = 1
    from public.saved_insights
    where user_id = '90000000-0000-4000-8000-000000000010'
      and scene_version_id = '92000000-0000-4000-8000-000000000007'
      and insight_kind = 'reframe'
  ),
  'concurrent desired saved=true returns true twice without duplicate rows'
);

select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select id
    from public.training_sessions
    where id = '94000000-0000-4000-8000-000000000132'
    for update$$
) as expiring_session_lock(id uuid);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000132',
      '96000000-0000-4000-8000-000000000132'
    )$$
);
select pg_sleep(0.2);
select is(
  extensions.dblink_is_busy('progress_worker_a'),
  1,
  'completion really waits on the owned session row across expiry'
);
select pg_sleep(1);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table cross_expiry_completion as
select *
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select is(
  (select error_message from cross_expiry_completion),
  'session_not_completable',
  'completion refreshes wall-clock time after a row-lock wait and fails closed'
);
select is(
  (
    select count(*)
    from public.training_completions
    where session_id = '94000000-0000-4000-8000-000000000132'
  ),
  0::bigint,
  'cross-expiry failure creates no completion or award'
);

select *
from extensions.dblink(
  'progress_worker_a',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000020',false)$$
) as race_insert_claim(value text);
select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000020',
          0
        )
      )
    ) as held$$
) as second_membership_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000220',
      '96000000-0000-4000-8000-000000000220'
    )$$
);
select pg_sleep(0.05);
select extensions.dblink_send_query(
  'progress_admin',
  $$with inserted as (
      insert into public.cohort_memberships(cohort_id, user_id, joined_at)
      values (
        '93000000-0000-4000-8000-000000000002',
        '90000000-0000-4000-8000-000000000020',
        clock_timestamp()
      )
      returning 1
    )
    select count(*)::integer from inserted$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_worker_a') = 1
    and extensions.dblink_is_busy('progress_admin') = 1,
  'completion and second-cohort insertion are both busy behind a real participant barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table second_membership_completion as
select *
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
create temporary table second_membership_transition as
select *
from extensions.dblink_get_result('progress_admin') as result(changed integer);
select count(*) from extensions.dblink_get_result('progress_admin') as drained(changed integer);
select ok(
  (
    select changed = 1 from second_membership_transition
  )
  and (
    (
      select completion_id is not null
        and cohort_id = '93000000-0000-4000-8000-000000000001'
      from second_membership_completion
      join public.training_completions
        on training_completions.id = completion_id
    )
    or (
      (select error_message = 'cohort_context_ambiguous'
       from second_membership_completion)
      and not exists (
        select 1 from public.training_completions
        where session_id = '94000000-0000-4000-8000-000000000220'
      )
    )
  ),
  'completion versus second membership has one complete transaction order and no partial award'
);

select *
from extensions.dblink(
  'progress_worker_a',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000021',false)$$
) as race_transfer_claim(value text);
select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000021',
          0
        )
      )
    ) as held$$
) as transfer_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_admin',
  $$with deleted as materialized (
      delete from public.cohort_memberships
      where cohort_id = '93000000-0000-4000-8000-000000000001'
        and user_id = '90000000-0000-4000-8000-000000000021'
      returning user_id
    ), inserted as (
      insert into public.cohort_memberships(cohort_id, user_id, joined_at)
      select
        '93000000-0000-4000-8000-000000000002',
        user_id,
        clock_timestamp()
      from deleted
      returning 1
    )
    select count(*)::integer from inserted$$
);
select pg_sleep(0.05);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000221',
      '96000000-0000-4000-8000-000000000221'
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_admin') = 1
    and extensions.dblink_is_busy('progress_worker_a') = 1,
  'transfer and completion are both busy behind a real participant barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table transfer_transition as
select *
from extensions.dblink_get_result('progress_admin') as result(changed integer);
select count(*) from extensions.dblink_get_result('progress_admin') as drained(changed integer);
create temporary table transfer_completion as
select *
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select ok(
  (select changed = 1 from transfer_transition)
    and (select completion_id is null
      and error_message = 'session_not_completable'
      from transfer_completion)
    and not exists (
      select 1
      from public.training_completions
      where session_id = '94000000-0000-4000-8000-000000000221'
    )
    and not exists (
      select 1
      from public.points_ledger
      where user_id = '90000000-0000-4000-8000-000000000021'
    ),
  'transfer queued first makes the old session fail instead of pinning it to the new cohort'
);

select *
from extensions.dblink(
  'progress_worker_a',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000022',false)$$
) as race_consent_claim(value text);
select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000022',
          0
        )
      )
    ) as held$$
) as consent_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_admin',
  $$update public.profiles
    set service_status = 'consent_withdrawn'
    where id = '90000000-0000-4000-8000-000000000022'
    returning 1::integer$$
);
select pg_sleep(0.05);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000222',
      '96000000-0000-4000-8000-000000000222'
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_admin') = 1
    and extensions.dblink_is_busy('progress_worker_a') = 1,
  'service withdrawal and completion are both busy behind a real participant barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table consent_transition as
select *
from extensions.dblink_get_result('progress_admin') as result(changed integer);
select count(*) from extensions.dblink_get_result('progress_admin') as drained(changed integer);
create temporary table consent_completion as
select *
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select ok(
  (select changed = 1 from consent_transition)
    and (select completion_id is null
      and error_message = 'session_not_completable'
      from consent_completion)
    and not exists (
      select 1
      from public.training_completions
      where session_id = '94000000-0000-4000-8000-000000000222'
    )
    and not exists (
      select 1
      from public.points_ledger
      where user_id = '90000000-0000-4000-8000-000000000022'
    ),
  'service withdrawal queued first leaves no partial completion or award'
);

select *
from extensions.dblink(
  'progress_worker_a',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000023',false)$$
) as race_close_claim(value text);
select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000023',
          0
        )
      )
    ) as held$$
) as close_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_admin',
  $$update public.cohorts
    set status = 'closed'
    where id = '93000000-0000-4000-8000-000000000004'
    returning 1::integer$$
);
select pg_sleep(0.05);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000223',
      '96000000-0000-4000-8000-000000000223'
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_admin') = 1
    and extensions.dblink_is_busy('progress_worker_a') = 1,
  'cohort closure and completion are both busy behind a real participant barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table close_transition as
select *
from extensions.dblink_get_result('progress_admin') as result(changed integer);
select count(*) from extensions.dblink_get_result('progress_admin') as drained(changed integer);
create temporary table close_completion as
select *
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select ok(
  (select changed = 1 from close_transition)
    and (select completion_id is null
      and error_message = 'session_not_completable'
      from close_completion)
    and not exists (
      select 1
      from public.training_completions
      where session_id = '94000000-0000-4000-8000-000000000223'
    )
    and not exists (
      select 1
      from public.points_ledger
      where user_id = '90000000-0000-4000-8000-000000000023'
    ),
  'cohort closure queued first leaves no partial completion or award'
);

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, updated_at
) values (
  '94000000-0000-4000-8000-000000000133',
  '90000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000003',
  '95000000-0000-4000-8000-000000000133',
  'active',
  clock_timestamp() - interval '1 hour',
  clock_timestamp() + interval '23 hours',
  clock_timestamp() - interval '1 hour'
);
select *
from extensions.dblink(
  'progress_worker_a',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000010',false)$$
) as same_key_worker_a_claim(value text);
select *
from extensions.dblink(
  'progress_worker_b',
  $$select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000010',false)$$
) as same_key_worker_b_claim(value text);
select extensions.dblink_exec('progress_lock', 'begin');
select *
from extensions.dblink(
  'progress_lock',
  $$select 1 from (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'participant-state:90000000-0000-4000-8000-000000000010',
          0
        )
      )
    ) as held$$
) as same_key_barrier(acquired integer);
select extensions.dblink_send_query(
  'progress_worker_a',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000133',
      '96000000-0000-4000-8000-000000000133'
    )$$
);
select extensions.dblink_send_query(
  'progress_worker_b',
  $$select * from pg_temp.capture_completion(
      '94000000-0000-4000-8000-000000000133',
      '96000000-0000-4000-8000-000000000133'
    )$$
);
select pg_sleep(0.2);
select ok(
  extensions.dblink_is_busy('progress_worker_a') = 1
    and extensions.dblink_is_busy('progress_worker_b') = 1,
  'both same-key completion workers overlap behind a real barrier'
);
select extensions.dblink_exec('progress_lock', 'commit');
create temporary table concurrent_same_key_completion as
select 1 as worker, result.*
from extensions.dblink_get_result('progress_worker_a')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('progress_worker_b')
  as result(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_a')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select count(*) from extensions.dblink_get_result('progress_worker_b')
  as drained(completion_id uuid, awarded boolean, points_delta integer, error_message text);
select ok(
  (
    select count(*) = 2
      and count(distinct completion_id) = 1
      and bool_and(error_message is null)
      and count(*) filter (where awarded and points_delta = 10) = 1
      and count(*) filter (where not awarded and points_delta = 0) = 1
    from concurrent_same_key_completion
  ),
  'concurrent same-session same-key retries return one completion and one new award'
);

update public.saved_insights
set saved_at = case insight_kind
  when 'expression' then '2026-07-10 02:00:00+00'::timestamptz
  else '2026-07-10 01:00:00+00'::timestamptz
end
where user_id = '90000000-0000-4000-8000-000000000010'
  and scene_version_id = '92000000-0000-4000-8000-000000000001';
update public.saved_insights
set saved_at = '2026-07-10 03:00:00+00'::timestamptz
where user_id = '90000000-0000-4000-8000-000000000010'
  and scene_version_id = '92000000-0000-4000-8000-000000000007';

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select results_eq(
  $$select item->>'sceneVersionId', item->>'kind', item->>'route'
    from jsonb_array_elements(public.list_saved_insights())
      with ordinality as listed(item, ordinal)
    order by ordinal$$,
  $$values
      ('92000000-0000-4000-8000-000000000007'::text, 'reframe'::text, 'available'::text),
      ('92000000-0000-4000-8000-000000000001'::text, 'expression'::text, 'available'::text),
      ('92000000-0000-4000-8000-000000000001'::text, 'reframe'::text, 'available'::text)$$,
  'saved insights list newest first and pin exact versions and kinds'
);
reset role;
update public.scene_versions
set status = 'paused'
where id = '92000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000010', false);
set role authenticated;
select ok(
  (
    select bool_and(item->>'route' = 'content-update')
    from jsonb_array_elements(public.list_saved_insights()) as item
    where item->>'sceneVersionId' = '92000000-0000-4000-8000-000000000001'
  ),
  'paused exact versions remain pinned and route to content update'
);
select is(
  public.set_saved_insight(
    '92000000-0000-4000-8000-000000000001',
    'reframe',
    false
  ),
  false,
  'owner may remove a paused saved insight'
);
reset role;
update public.scene_versions
set status = 'published'
where id = '92000000-0000-4000-8000-000000000001';

insert into public.training_sessions(
  id, user_id, scene_version_id, idempotency_key, status,
  started_at, expires_at, completed_at, updated_at
)
select
  ('94110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000011'::uuid,
  (array[
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000005'
  ]::uuid[])[((item - 1) % 4) + 1],
  ('95110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'completed',
  '2026-07-05 00:00:00+00'::timestamptz + item * interval '1 hour',
  '2026-08-05 00:00:00+00'::timestamptz,
  '2026-07-05 00:30:00+00'::timestamptz + item * interval '1 hour',
  '2026-07-05 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 8) as item;
insert into public.training_completions(
  id, user_id, session_id, scene_version_id, cohort_id,
  idempotency_key, completed_at
)
select
  ('98110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000011'::uuid,
  ('94110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  (array[
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000005'
  ]::uuid[])[((item - 1) % 4) + 1],
  '93000000-0000-4000-8000-000000000001'::uuid,
  ('96110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '2026-07-05 00:30:00+00'::timestamptz + item * interval '1 hour'
from generate_series(1, 8) as item;
insert into public.follow_up_reviews(
  id, user_id, completion_id, idempotency_key,
  attempted, observation, hypothesis_result, next_direction, created_at
)
select
  ('99110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  '90000000-0000-4000-8000-000000000011'::uuid,
  completion_id,
  ('97110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  true,
  'helpful',
  'supported',
  'repeat',
  '2026-07-06 00:00:00+00'::timestamptz + item * interval '1 hour'
from (
  select
    row_number() over (order by completion_id)::integer as item,
    completion_id
  from (
    select '98000000-0000-4000-8000-000000000011'::uuid as completion_id
    union all
    select
      ('98110000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid
    from generate_series(1, 8) as item
  ) as owned_completion
) as numbered_completion;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000011', false);
set role authenticated;
select is(
  (public.get_private_progress()->>'completedScenes')::integer,
  4,
  'four-scene threshold remains below the five-scene milestone'
);
select is(
  (public.get_private_progress()->>'reviewsCompleted')::integer,
  9,
  'nine-review threshold remains below the ten-review milestone'
);
select results_eq(
  $$select badge->>'key'
    from jsonb_array_elements(public.get_private_progress()->'badges')
      with ordinality as badge_row(badge, ordinal)
    order by ordinal$$,
  $$values ('first-scene'::text)$$,
  'four scenes and nine reviews award only the first-scene milestone'
);
select is(
  public.get_private_progress()->'unlockedSurprises',
  '[]'::jsonb,
  'four scenes and nine reviews unlock no surprise'
);
reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000000', false);
set role authenticated;
select is(
  (public.get_private_progress()->>'completedScenes')::integer,
  0,
  'zero-completion progress remains zero'
);
select is(
  public.get_private_progress()->'badges',
  '[]'::jsonb,
  'zero-completion progress has an empty badge array'
);
select is(
  public.get_private_progress()->'unlockedSurprises',
  '[]'::jsonb,
  'zero-completion progress has an empty surprise array'
);
reset role;

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_completions'
      and column_name not in (
        'id','user_id','session_id','scene_version_id',
        'idempotency_key','completed_at','cohort_id'
      )
  ),
  0::bigint,
  'completion rows contain only identifiers, pinned cohort, and server time'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'follow_up_reviews'
      and column_name not in (
        'id','user_id','completion_id','idempotency_key','attempted',
        'observation','hypothesis_result','next_direction','created_at'
      )
  ),
  0::bigint,
  'review rows contain one boolean and exactly three controlled response fields'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'progress_idempotency_keys'
      and column_name not in (
        'user_id','idempotency_key','event_kind','source_id','bound_at'
      )
  ),
  0::bigint,
  'private idempotency bindings contain identifiers, event kind, and time only'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema in ('public','private')
      and table_name in (
        'training_completions',
        'follow_up_reviews',
        'saved_insights',
        'points_ledger',
        'progress_idempotency_keys'
      )
      and column_name ~ '(thought|prediction|selected_hypothesis|evidence|answer|note|content|snapshot|child)'
  ),
  0::bigint,
  'progress persistence adds no ordinary answer, free-text, child, or content snapshot field'
);
select ok(
  not exists (
    select 1
    from (
      select to_jsonb(completion_row)::text as row_text
      from public.training_completions as completion_row
      union all
      select to_jsonb(review_row)::text
      from public.follow_up_reviews as review_row
      union all
      select to_jsonb(saved_row)::text
      from public.saved_insights as saved_row
      union all
      select to_jsonb(point_row)::text
      from public.points_ledger as point_row
      union all
      select to_jsonb(binding_row)::text
      from private.progress_idempotency_keys as binding_row
    ) as persisted_progress
    where persisted_progress.row_text like any (array[
      '%habitual-negative-thought%',
      '%participant-free-text%',
      '%selected-hypothesis-answer%',
      '%evidence-answer%',
      '%authored-content-snapshot%'
    ])
  ),
  'persisted progress values contain no representative ordinary-answer or content sentinel'
);
select is(
  (
    select cohort_id
    from public.training_completions
    where id = '98000000-0000-4000-8000-000000000019'
  ),
  null::uuid,
  'legacy null cohort rows are never backfilled from current membership'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.cohort_memberships'::regclass
      and tgname = 'lock_cohort_membership_participant_state'
      and not tgisinternal
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'lock_profile_participant_state'
      and not tgisinternal
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.cohorts'::regclass
      and tgname = 'lock_cohort_status_participant_state'
      and not tgisinternal
  ),
  'membership, eligibility, and cohort transitions share the participant-state lock protocol'
);

select extensions.dblink_disconnect('progress_lock');
select extensions.dblink_disconnect('progress_admin');
select extensions.dblink_disconnect('progress_worker_a');
select extensions.dblink_disconnect('progress_worker_b');

delete from public.saved_insights
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from public.points_ledger
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from public.follow_up_reviews
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from private.progress_idempotency_keys
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from public.training_completions
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from public.training_sessions
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from public.scene_versions
where author_id in (
  '90000000-0000-4000-8000-000000000000',
  '90000000-0000-4000-8000-000000000001'
);
delete from public.scenes
where id between
  '91000000-0000-4000-8000-000000000001'
  and '91000000-0000-4000-8000-000000000018';
delete from public.cohort_memberships
where user_id between
  '90000000-0000-4000-8000-000000000010'
  and '90000000-0000-4000-8000-000000000023';
delete from public.cohorts
where id between
  '93000000-0000-4000-8000-000000000001'
  and '93000000-0000-4000-8000-000000000004';
delete from public.staff_roles
where user_id in (
  '90000000-0000-4000-8000-000000000000',
  '90000000-0000-4000-8000-000000000001'
);
delete from public.profiles
where id between
  '90000000-0000-4000-8000-000000000000'
  and '90000000-0000-4000-8000-000000000023';
delete from auth.users
where id between
  '90000000-0000-4000-8000-000000000000'
  and '90000000-0000-4000-8000-000000000023';

select * from finish();
