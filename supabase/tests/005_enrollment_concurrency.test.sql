create extension if not exists dblink with schema extensions;

select plan(10);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000200','authenticated','authenticated','concurrency-coach@example.invalid',now(),now()),
  ('00000000-0000-4000-8000-000000000201','authenticated','authenticated','concurrency-member@example.invalid',now(),now());
insert into public.profiles(id, display_name, is_adult_confirmed) values
  ('00000000-0000-4000-8000-000000000200','并发测试教练',true);
insert into public.cohorts(id, name, coach_id, status) values
  ('21000000-0000-4000-8000-000000000001','并发入班甲班','00000000-0000-4000-8000-000000000200','active'),
  ('21000000-0000-4000-8000-000000000002','并发入班乙班','00000000-0000-4000-8000-000000000200','active');
insert into public.cohort_invites(id, cohort_id, code_hash, expires_at, max_uses, use_count) values
  ('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','concurrent-hash-a',now() + interval '1 hour',5,0),
  ('22000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','concurrent-hash-b',now() + interval '1 hour',5,0);

select extensions.dblink_connect(
  'enrollment_lock',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'enrollment_worker_a',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);
select extensions.dblink_connect(
  'enrollment_worker_b',
  'host=db port=5432 dbname=postgres user=supabase_admin password=postgres'
);

select extensions.dblink_send_query(
  'enrollment_worker_a',
  $$select decision, request_id, delivery_attempt_id, should_send, retry_after_seconds
    from public.request_enrollment_challenge(
      'concurrent-hash-a', 'concurrent-global-phone', true, '2026-07-22', '2026-07-22'
    )$$
);
select extensions.dblink_send_query(
  'enrollment_worker_b',
  $$select decision, request_id, delivery_attempt_id, should_send, retry_after_seconds
    from public.request_enrollment_challenge(
      'concurrent-hash-b', 'concurrent-global-phone', true, '2026-07-22', '2026-07-22'
    )$$
);

create temporary table concurrent_request_results as
select 1 as worker, result.*
from extensions.dblink_get_result('enrollment_worker_a') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
)
union all
select 2 as worker, result.*
from extensions.dblink_get_result('enrollment_worker_b') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
-- Drain the async result terminators before reusing each connection.
select count(*)
from extensions.dblink_get_result('enrollment_worker_a') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
select count(*)
from extensions.dblink_get_result('enrollment_worker_b') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);

select is(
  (select count(*) from concurrent_request_results where should_send),
  1::bigint,
  'two real concurrent requests reserve exactly one provider send'
);
select ok(
  (select count(distinct request_id) = 1
     and count(distinct delivery_attempt_id) = 1
   from concurrent_request_results),
  'the losing concurrent request returns the same request and pending attempt'
);
select results_eq(
  $$select decision from concurrent_request_results order by decision$$,
  $$values ('accepted'::text), ('delivery_pending'::text)$$,
  'concurrent decisions are one accepted send and one fail-closed pending response'
);
select ok(
  (select count(*) = 1 from public.enrollment_challenges
   where phone_hmac = 'concurrent-global-phone')
  and
  (select count(*) = 1 from public.enrollment_sms_delivery_attempts
   where phone_hmac = 'concurrent-global-phone' and status = 'pending'),
  'concurrent requests persist only one challenge and one pending attempt'
);

select * from public.finalize_enrollment_otp_delivery(
  (select delivery_attempt_id from concurrent_request_results where should_send),
  (select request_id from concurrent_request_results where should_send),
  'sent'
);

select extensions.dblink_exec('enrollment_lock', 'begin');
select *
from extensions.dblink(
  'enrollment_lock',
  $$select 1 from (
    select pg_advisory_xact_lock(hashtextextended(
      'enrollment-phone:concurrent-global-phone', 0
    ))
  ) held$$
) as lock_result(acquired integer);

select extensions.dblink_send_query(
  'enrollment_worker_a',
  $$select decision, request_id, delivery_attempt_id, should_send, retry_after_seconds
    from public.request_enrollment_challenge(
      'concurrent-hash-a', 'concurrent-global-phone', true, '2026-07-22', '2026-07-22'
    )$$
);
select extensions.dblink_send_query(
  'enrollment_worker_b',
  format(
    $$select cohort_id from public.complete_enrollment(%L::uuid,%L::uuid,'concurrent-global-phone')$$,
    (select request_id from concurrent_request_results where should_send),
    '00000000-0000-4000-8000-000000000201'
  )
);
select pg_sleep(0.25);
select is(
  extensions.dblink_is_busy('enrollment_worker_a'),
  1,
  'challenge replay waits on the phone advisory lock'
);
select is(
  extensions.dblink_is_busy('enrollment_worker_b'),
  1,
  'completion waits on the same phone advisory lock'
);
select extensions.dblink_exec('enrollment_lock', 'commit');

create temporary table locked_request_result as
select *
from extensions.dblink_get_result('enrollment_worker_a') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
create temporary table locked_complete_result as
select *
from extensions.dblink_get_result('enrollment_worker_b') as result(cohort_id uuid);
select count(*)
from extensions.dblink_get_result('enrollment_worker_a') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
select count(*)
from extensions.dblink_get_result('enrollment_worker_b') as result(cohort_id uuid);
select ok(
  (select decision in ('accepted', 'rate_limited') and should_send is false
   from locked_request_result),
  'challenge replay completes without a deadlock after the shared lock releases'
);
select ok(
  (select cohort_id in (
    '21000000-0000-4000-8000-000000000001'::uuid,
    '21000000-0000-4000-8000-000000000002'::uuid
  ) from locked_complete_result),
  'enrollment completion finishes without a deadlock'
);

insert into public.cohort_invites(id, cohort_id, code_hash, expires_at, max_uses, use_count)
values (
  '22000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000001',
  'cross-expiry-hash',
  clock_timestamp() + interval '1 second',
  5,
  0
);
select extensions.dblink_exec('enrollment_lock', 'begin');
select *
from extensions.dblink(
  'enrollment_lock',
  $$select 1 from (
    select pg_advisory_xact_lock(hashtextextended(
      'enrollment-phone:cross-expiry-phone', 0
    ))
  ) held$$
) as expiry_lock_result(acquired integer);
select extensions.dblink_send_query(
  'enrollment_worker_a',
  $$select decision, request_id, delivery_attempt_id, should_send, retry_after_seconds
    from public.request_enrollment_challenge(
      'cross-expiry-hash', 'cross-expiry-phone', true, '2026-07-22', '2026-07-22'
    )$$
);
select pg_sleep(0.25);
select is(
  extensions.dblink_is_busy('enrollment_worker_a'),
  1,
  'request reaches and waits on the phone advisory lock before invite expiry'
);
select pg_sleep(1);
select extensions.dblink_exec('enrollment_lock', 'commit');
create temporary table cross_expiry_result as
select *
from extensions.dblink_get_result('enrollment_worker_a') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
select count(*)
from extensions.dblink_get_result('enrollment_worker_a') as result(
  decision text,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean,
  retry_after_seconds integer
);
select ok(
  (select decision = 'invalid_invite' and request_id is null
     and delivery_attempt_id is null and should_send is false
   from cross_expiry_result)
  and
  (select count(*) = 0 from public.enrollment_challenges
   where phone_hmac = 'cross-expiry-phone')
  and
  (select count(*) = 0 from public.enrollment_sms_delivery_attempts
   where phone_hmac = 'cross-expiry-phone'),
  'expiry is re-evaluated with clock time refreshed after the advisory wait'
);

select extensions.dblink_disconnect('enrollment_lock');
select extensions.dblink_disconnect('enrollment_worker_a');
select extensions.dblink_disconnect('enrollment_worker_b');

delete from public.consent_events where user_id = '00000000-0000-4000-8000-000000000201';
delete from public.cohort_memberships where user_id = '00000000-0000-4000-8000-000000000201';
delete from public.enrollment_sms_delivery_attempts where phone_hmac in (
  'concurrent-global-phone',
  'cross-expiry-phone'
);
delete from public.enrollment_challenges where phone_hmac in (
  'concurrent-global-phone',
  'cross-expiry-phone'
);
delete from public.cohort_invites where id in (
  '22000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000003'
);
delete from public.cohorts where id in (
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002'
);
delete from public.profiles where id in (
  '00000000-0000-4000-8000-000000000200',
  '00000000-0000-4000-8000-000000000201'
);
delete from auth.users where id in (
  '00000000-0000-4000-8000-000000000200',
  '00000000-0000-4000-8000-000000000201'
);

select * from finish();
