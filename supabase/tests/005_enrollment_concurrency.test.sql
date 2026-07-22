create extension if not exists dblink with schema extensions;

select plan(4);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000200','authenticated','authenticated','concurrency-coach@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000201','authenticated','authenticated','concurrency-member@example.invalid',now(),now());
insert into public.profiles(id, display_name, is_adult_confirmed) values
  ('00000000-0000-0000-0000-000000000200','并发测试教练',true);
insert into public.cohorts(id, name, coach_id, status) values
  ('21000000-0000-0000-0000-000000000001','并发入班测试班','00000000-0000-0000-0000-000000000200','active');
insert into public.cohort_invites(id, cohort_id, code_hash, expires_at, max_uses, use_count) values
  ('22000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','concurrent-hash',now() + interval '1 hour',5,0);
insert into public.enrollment_challenges(
  id, invite_id, phone_hmac, adult_attested, privacy_consent_version,
  service_boundary_version, expires_at
) values (
  '23000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'concurrent-phone',
  true,
  '2026-07-22',
  '2026-07-22',
  now() + interval '10 minutes'
);

select extensions.dblink_connect(
  'enrollment_lock',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'enrollment_request',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'enrollment_complete',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_exec('enrollment_lock', 'begin');
select *
from extensions.dblink(
  'enrollment_lock',
  $$select 1 from (
    select pg_advisory_xact_lock(hashtextextended(
      '22000000-0000-0000-0000-000000000001:concurrent-phone', 0
    ))
  ) held$$
) as lock_result(acquired integer);

select extensions.dblink_send_query(
  'enrollment_request',
  $$select decision, request_id, should_send, retry_after_seconds
    from public.request_enrollment_challenge(
      'concurrent-hash', 'concurrent-phone', true, '2026-07-22', '2026-07-22'
    )$$
);
select extensions.dblink_send_query(
  'enrollment_complete',
  $$select cohort_id
    from public.complete_enrollment(
      '23000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000201',
      'concurrent-phone'
    )$$
);
select pg_sleep(0.25);

select is(
  extensions.dblink_is_busy('enrollment_request'),
  1,
  'challenge replay waits on the shared phone and invite transaction lock'
);
select is(
  extensions.dblink_is_busy('enrollment_complete'),
  1,
  'enrollment completion waits on the same transaction lock'
);

select extensions.dblink_exec('enrollment_lock', 'commit');
create temporary table concurrent_request_result as
select *
from extensions.dblink_get_result('enrollment_request') as result(
  decision text,
  request_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
create temporary table concurrent_complete_result as
select *
from extensions.dblink_get_result('enrollment_complete') as result(cohort_id uuid);

select is(
  (select decision from concurrent_request_result),
  'accepted',
  'concurrent replay completes without a deadlock'
);
select is(
  (select cohort_id from concurrent_complete_result),
  '21000000-0000-0000-0000-000000000001'::uuid,
  'concurrent enrollment completes without a deadlock'
);

select extensions.dblink_disconnect('enrollment_lock');
select extensions.dblink_disconnect('enrollment_request');
select extensions.dblink_disconnect('enrollment_complete');

delete from public.consent_events where user_id = '00000000-0000-0000-0000-000000000201';
delete from public.cohort_memberships where cohort_id = '21000000-0000-0000-0000-000000000001';
delete from public.enrollment_challenges where invite_id = '22000000-0000-0000-0000-000000000001';
delete from public.cohort_invites where id = '22000000-0000-0000-0000-000000000001';
delete from public.cohorts where id = '21000000-0000-0000-0000-000000000001';
delete from public.profiles where id in (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000201'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000201'
);

select * from finish();
