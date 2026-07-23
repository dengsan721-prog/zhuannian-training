begin;
select plan(21);
select policies_are('public', 'training_completions', array['participant_owns_completion','coach_reads_assigned_completion']);
select policies_are('public', 'saved_insights', array['participant_owns_saved_insight']);
select policies_are('public', 'scene_versions', array['eligible_participant_reads_published_scene']);
select policies_are('public', 'scenes', array['eligible_participant_reads_scene_metadata']);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as table_class
    join pg_catalog.pg_namespace as table_namespace
      on table_namespace.oid = table_class.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        table_class.relacl,
        pg_catalog.acldefault('r', table_class.relowner)
      )
    ) as table_acl
    where table_namespace.nspname = 'public'
      and table_class.relkind in ('r', 'p')
      and table_acl.grantee = 0
  ),
  0::bigint,
  'PUBLIC has no privileges on public base tables'
);
select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as table_class
    join pg_catalog.pg_namespace as table_namespace
      on table_namespace.oid = table_class.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        table_class.relacl,
        pg_catalog.acldefault('r', table_class.relowner)
      )
    ) as table_acl
    where table_namespace.nspname = 'public'
      and table_class.relkind in ('r', 'p')
      and table_acl.grantee = (
        select role_row.oid
        from pg_catalog.pg_roles as role_row
        where role_row.rolname = 'anon'
      )
  ),
  0::bigint,
  'anonymous users have no privileges on public base tables'
);
select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as table_class
    join pg_catalog.pg_namespace as table_namespace
      on table_namespace.oid = table_class.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        table_class.relacl,
        pg_catalog.acldefault('r', table_class.relowner)
      )
    ) as table_acl
    where table_namespace.nspname = 'public'
      and table_class.relkind in ('r', 'p')
      and table_acl.grantee = (
        select role_row.oid
        from pg_catalog.pg_roles as role_row
        where role_row.rolname = 'authenticated'
      )
      and table_acl.privilege_type <> 'SELECT'
  ),
  0::bigint,
  'authenticated users have no non-SELECT privileges on public base tables'
);
select is(
  (
    select pg_catalog.jsonb_agg(
      granted_table.table_name
      order by granted_table.table_name collate "C"
    )
    from (
      select distinct table_class.relname::text as table_name
      from pg_catalog.pg_class as table_class
      join pg_catalog.pg_namespace as table_namespace
        on table_namespace.oid = table_class.relnamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          table_class.relacl,
          pg_catalog.acldefault('r', table_class.relowner)
        )
      ) as table_acl
      where table_namespace.nspname = 'public'
        and table_class.relkind in ('r', 'p')
        and table_acl.grantee = (
          select role_row.oid
          from pg_catalog.pg_roles as role_row
          where role_row.rolname = 'authenticated'
        )
        and table_acl.privilege_type = 'SELECT'
    ) as granted_table
  ),
  '[
    "cohort_memberships",
    "cohorts",
    "consent_events",
    "follow_up_reviews",
    "points_ledger",
    "profiles",
    "saved_insights",
    "scene_versions",
    "scenes",
    "training_completions",
    "training_sessions",
    "user_badges"
  ]'::jsonb,
  'authenticated SELECT grants match the participant-readable table set'
);

set local role anon;
select throws_ok(
  $$truncate table public.profiles cascade$$,
  '42501',
  null,
  'anonymous users cannot truncate profiles through RLS'
);
reset role;

set local role authenticated;
select throws_ok(
  $$truncate table public.profiles cascade$$,
  '42501',
  null,
  'authenticated users cannot truncate profiles through RLS'
);
reset role;

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001','authenticated','authenticated','member@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000002','authenticated','authenticated','outsider@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000003','authenticated','authenticated','coach@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000004','authenticated','authenticated','other-coach@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000009','authenticated','authenticated','system-admin@example.invalid',now(),now());
insert into public.profiles(id, display_name, is_adult_confirmed) values
  ('00000000-0000-0000-0000-000000000001','已入班成员',true),
  ('00000000-0000-0000-0000-000000000002','未入班用户',true),
  ('00000000-0000-0000-0000-000000000003','本班教练',true),
  ('00000000-0000-0000-0000-000000000004','其他教练',true),
  ('00000000-0000-0000-0000-000000000009','系统管理员测试',true);
insert into public.staff_roles(user_id, role) values
  ('00000000-0000-0000-0000-000000000003','coach'),
  ('00000000-0000-0000-0000-000000000004','coach'),
  ('00000000-0000-0000-0000-000000000009','system_admin');
insert into public.cohorts(id, name, coach_id, status)
values ('10000000-0000-0000-0000-000000000001','封闭测试班','00000000-0000-0000-0000-000000000003','active');
insert into public.cohort_memberships(cohort_id, user_id)
values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into public.scenes(id, scene_code, slug, relationship, category)
values ('20000000-0000-0000-0000-000000000001','PC-001','rls-test-scene','parent-child','测试');
insert into public.scene_versions(id, scene_id, version, status, risk, payload, author_id)
values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'published','standard','{}','00000000-0000-0000-0000-000000000003');
insert into public.training_sessions(id, user_id, scene_version_id, idempotency_key, status)
values ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','completed');
insert into public.training_completions(id, user_id, session_id, scene_version_id, idempotency_key)
values ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002');

-- Role hierarchy checks run before SET ROLE; private schema is never exposed to authenticated.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', true);
select is(private.has_role('supervisor'), false, 'system admin does not inherit supervisor');
select is(private.has_role('privacy_officer'), false, 'system admin does not inherit privacy officer');
select is(private.has_role('safety_reviewer'), false, 'system admin does not inherit safety reviewer');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select results_eq('select count(*) from public.scene_versions', 'values (1::bigint)', 'active adult member reads published payload');
select results_eq('select count(*) from public.scenes', 'values (1::bigint)', 'active adult member reads matching scene metadata');
select results_eq('select count(*) from public.training_completions', 'values (1::bigint)', 'participant reads own completion');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select results_eq('select count(*) from public.scene_versions', 'values (0::bigint)', 'unenrolled user cannot read published payload');
select results_eq('select count(*) from public.scenes', 'values (0::bigint)', 'unenrolled user cannot read scene metadata');
select results_eq('select count(*) from public.training_completions', 'values (0::bigint)', 'participant cannot read another completion');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select results_eq(
  'select count(*) from public.training_completions',
  'values (0::bigint)',
  'assigned coach cannot read a legacy completion without a pinned cohort'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select results_eq('select count(*) from public.training_completions', 'values (0::bigint)', 'unassigned coach cannot read completion status');
reset role;
select * from finish();
rollback;
