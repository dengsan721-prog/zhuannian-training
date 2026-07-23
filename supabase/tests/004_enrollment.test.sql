begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

select has_table('public', 'enrollment_challenges', 'enrollment challenges table exists');
select has_table('public', 'consent_events', 'consent events table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.enrollment_challenges'::regclass),
  'enrollment challenges use RLS'
);
select policies_are('public', 'consent_events', array['participant_reads_own_consent']);
select ok(not has_table_privilege('anon', 'public.enrollment_challenges', 'select'), 'anonymous cannot read challenges');
select ok(not has_table_privilege('authenticated', 'public.enrollment_challenges', 'select'), 'participants cannot read challenges');
select ok(has_table_privilege('authenticated', 'public.consent_events', 'select'), 'participants can select consent through RLS');
select ok(not has_table_privilege('anon', 'public.consent_events', 'select'), 'anonymous cannot read consent');
select ok(
  has_function_privilege('service_role', 'public.request_enrollment_challenge(text,text,boolean,text,text)', 'execute'),
  'service role can request an enrollment challenge'
);
select ok(
  not has_function_privilege('authenticated', 'public.request_enrollment_challenge(text,text,boolean,text,text)', 'execute'),
  'participants cannot request challenges through the service RPC'
);
select ok(
  has_function_privilege('service_role', 'public.complete_enrollment(uuid,uuid,text)', 'execute'),
  'service role can complete enrollment'
);
select ok(
  not has_function_privilege('authenticated', 'public.complete_enrollment(uuid,uuid,text)', 'execute'),
  'participants cannot execute enrollment directly'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cohort_invites'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~ 'use_count.*<=.*max_uses'
  ),
  'invite use count cannot exceed capacity'
);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000100','authenticated','authenticated','enrollment-coach@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000101','authenticated','authenticated','enrollment-success@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000102','authenticated','authenticated','enrollment-capacity@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000103','authenticated','authenticated','enrollment-expired@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000104','authenticated','authenticated','enrollment-closed@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000105','authenticated','authenticated','enrollment-deletion@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000106','authenticated','authenticated','enrollment-existing@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000107','authenticated','authenticated','enrollment-withdrawn@example.invalid',now(),now()),
  ('00000000-0000-0000-0000-000000000108','authenticated','authenticated','enrollment-bound@example.invalid',now(),now());

insert into public.profiles(id, display_name, is_adult_confirmed, service_status) values
  ('00000000-0000-0000-0000-000000000100','入班测试教练',true,'active'),
  ('00000000-0000-0000-0000-000000000105','等待删除成员',true,'deletion_pending'),
  ('00000000-0000-0000-0000-000000000106','已有班级成员',true,'active'),
  ('00000000-0000-0000-0000-000000000107','已撤回同意成员',true,'consent_withdrawn'),
  ('00000000-0000-0000-0000-000000000108','已绑定其他成员',true,'active');

insert into public.cohorts(id, name, coach_id, status) values
  ('11000000-0000-0000-0000-000000000001','正常入班测试班','00000000-0000-0000-0000-000000000100','active'),
  ('11000000-0000-0000-0000-000000000002','已关闭入班测试班','00000000-0000-0000-0000-000000000100','closed');

insert into public.cohort_invites(id, cohort_id, code_hash, expires_at, max_uses, use_count) values
  ('12000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','success-hash',now() + interval '1 hour',1,0),
  ('12000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','active-hash',now() + interval '1 hour',5,0),
  ('12000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001','expired-hash',now() - interval '1 minute',5,0),
  ('12000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000002','closed-hash',now() + interval '1 hour',5,0),
  ('12000000-0000-0000-0000-000000000005','11000000-0000-0000-0000-000000000001','deletion-hash',now() + interval '1 hour',5,0),
  ('12000000-0000-0000-0000-000000000006','11000000-0000-0000-0000-000000000001','existing-hash',now() + interval '1 hour',1,1),
  ('12000000-0000-0000-0000-000000000007','11000000-0000-0000-0000-000000000001','withdrawn-hash',now() + interval '1 hour',2,0),
  ('12000000-0000-0000-0000-000000000008','11000000-0000-0000-0000-000000000001','rpc-hash',now() + interval '1 hour',5,0),
  ('12000000-0000-0000-0000-000000000009','11000000-0000-0000-0000-000000000001','bound-hash',now() + interval '1 hour',5,0);

insert into public.cohort_memberships(cohort_id, user_id)
values ('11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000106');

create temporary table challenge_calls (
  step integer primary key,
  decision text not null,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean not null,
  retry_after_seconds integer not null
);

insert into challenge_calls
select 1, result.*
from public.request_enrollment_challenge(
  'rpc-hash', 'rpc-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;

select results_eq(
  $$select decision, should_send, retry_after_seconds from challenge_calls where step = 1$$,
  $$values ('accepted'::text, true, 60)$$,
  'first valid request creates a sendable challenge'
);
select * from public.finalize_enrollment_otp_delivery(
  (select delivery_attempt_id from challenge_calls where step = 1),
  (select request_id from challenge_calls where step = 1),
  'sent'
);

insert into challenge_calls
select 2, result.*
from public.request_enrollment_challenge(
  'rpc-hash', 'rpc-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;

select ok(
  (select request_id from challenge_calls where step = 1) =
    (select request_id from challenge_calls where step = 2)
  and (select should_send is false and retry_after_seconds between 1 and 60 from challenge_calls where step = 2),
  'cooldown reuses the same live request without sending again'
);

update public.enrollment_challenges
set last_sent_at = now() - interval '61 seconds'
where id = (select request_id from challenge_calls where step = 1);
update public.enrollment_sms_delivery_attempts
set finalized_at = now() - interval '61 seconds'
where id = (select delivery_attempt_id from challenge_calls where step = 1);
insert into challenge_calls
select 3, result.*
from public.request_enrollment_challenge(
  'rpc-hash', 'rpc-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select * from public.finalize_enrollment_otp_delivery(
  (select delivery_attempt_id from challenge_calls where step = 3),
  (select request_id from challenge_calls where step = 3),
  'sent'
);

update public.enrollment_challenges
set last_sent_at = now() - interval '61 seconds'
where id = (select request_id from challenge_calls where step = 1);
update public.enrollment_sms_delivery_attempts
set finalized_at = now() - interval '61 seconds'
where id = (select delivery_attempt_id from challenge_calls where step = 3);
insert into challenge_calls
select 4, result.*
from public.request_enrollment_challenge(
  'rpc-hash', 'rpc-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select * from public.finalize_enrollment_otp_delivery(
  (select delivery_attempt_id from challenge_calls where step = 4),
  (select request_id from challenge_calls where step = 4),
  'sent'
);

select is(
  (select send_count from public.enrollment_challenges where id = (select request_id from challenge_calls where step = 1)),
  3::smallint,
  'challenge records no more than three sends in its ten-minute window'
);

insert into challenge_calls
select 5, result.*
from public.request_enrollment_challenge(
  'rpc-hash', 'rpc-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'rate_limited' and should_send is false and retry_after_seconds > 0
   from challenge_calls where step = 5),
  'fourth send attempt is rate limited'
);

select throws_ok(
  $$select * from public.request_enrollment_challenge('rpc-hash','other-phone',true,'old','2026-07-22')$$,
  'P0001', 'consent_required', 'challenge RPC accepts only current consent versions'
);
select results_eq(
  $$select decision from public.request_enrollment_challenge('closed-hash','closed-phone',true,'2026-07-22','2026-07-22')$$,
  $$values ('invalid_invite'::text)$$,
  'challenge RPC rejects invites for closed cohorts'
);

insert into public.enrollment_challenges(
  id, invite_id, phone_hmac, adult_attested, privacy_consent_version,
  service_boundary_version, expires_at, user_id, send_count,
  send_window_started_at, last_sent_at
) values
  ('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','success-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000001','capacity-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000003','12000000-0000-0000-0000-000000000002','expired-challenge-phone',true,'2026-07-22','2026-07-22',now() - interval '1 minute',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000004','12000000-0000-0000-0000-000000000003','expired-invite-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000005','12000000-0000-0000-0000-000000000004','closed-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000006','12000000-0000-0000-0000-000000000005','deletion-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000007','12000000-0000-0000-0000-000000000006','existing-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000008','12000000-0000-0000-0000-000000000007','withdrawn-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes',null,1,now(),now()),
  ('13000000-0000-0000-0000-000000000009','12000000-0000-0000-0000-000000000009','bound-phone',true,'2026-07-22','2026-07-22',now() + interval '10 minutes','00000000-0000-0000-0000-000000000108',1,now(),now());

select results_eq(
  $$select cohort_id from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'success-phone'
  )$$,
  $$values ('11000000-0000-0000-0000-000000000001'::uuid)$$,
  'valid challenge enrolls an authenticated adult'
);
select ok(
  exists (
    select 1 from public.profiles p
    join public.cohort_memberships m on m.user_id = p.id
    where p.id = '00000000-0000-0000-0000-000000000101'
      and p.is_adult_confirmed is true and p.service_status = 'active'
      and m.cohort_id = '11000000-0000-0000-0000-000000000001'
  )
  and (select use_count = 1 from public.cohort_invites where id = '12000000-0000-0000-0000-000000000001'),
  'successful enrollment creates the active profile and membership and consumes one use'
);
select is(
  (select count(*) from public.consent_events where user_id = '00000000-0000-0000-0000-000000000101'),
  1::bigint,
  'successful enrollment records one explicit consent event'
);

select results_eq(
  $$select cohort_id from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'success-phone'
  )$$,
  $$values ('11000000-0000-0000-0000-000000000001'::uuid)$$,
  'repeating the same completed request returns the same cohort'
);
select ok(
  (select count(*) = 1 from public.cohort_memberships where user_id = '00000000-0000-0000-0000-000000000101')
  and (select count(*) = 1 from public.consent_events where user_id = '00000000-0000-0000-0000-000000000101')
  and (select use_count = 1 from public.cohort_invites where id = '12000000-0000-0000-0000-000000000001'),
  'repeating completion creates no second membership, consent row or invite use'
);

select throws_ok(
  $$select * from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000102',
    'capacity-phone'
  )$$,
  'P0001', 'invite_invalid_or_expired', 'capacity blocks a new membership'
);
select is(
  (select use_count from public.cohort_invites where id = '12000000-0000-0000-0000-000000000001'),
  1,
  'failed capacity check cannot exceed invite maximum'
);
select throws_ok(
  $$select * from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000103',
    'expired-challenge-phone'
  )$$,
  'P0001', 'enrollment_challenge_expired', 'expired challenge is rejected'
);
select throws_ok(
  $$select * from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000103',
    'expired-invite-phone'
  )$$,
  'P0001', 'invite_invalid_or_expired', 'expired invite is rejected'
);
select throws_ok(
  $$select * from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000104',
    'closed-phone'
  )$$,
  'P0001', 'cohort_not_active', 'closed cohort is rejected'
);
select throws_ok(
  $$select * from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000105',
    'deletion-phone'
  )$$,
  'P0001', 'profile_deletion_pending', 'deletion-pending profile is rejected'
);
select is(
  (select service_status from public.profiles where id = '00000000-0000-0000-0000-000000000105'),
  'deletion_pending',
  'deletion-pending profile is never reactivated'
);

select results_eq(
  $$select cohort_id from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000106',
    'existing-phone'
  )$$,
  $$values ('11000000-0000-0000-0000-000000000001'::uuid)$$,
  'existing membership can complete a fresh consent flow'
);
select ok(
  (select use_count = 1 from public.cohort_invites where id = '12000000-0000-0000-0000-000000000006')
  and (select count(*) = 1 from public.consent_events where user_id = '00000000-0000-0000-0000-000000000106'),
  'existing membership records consent without burning invite capacity'
);

select results_eq(
  $$select cohort_id from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000107',
    'withdrawn-phone'
  )$$,
  $$values ('11000000-0000-0000-0000-000000000001'::uuid)$$,
  'fresh current consent can reactivate a consent-withdrawn profile'
);
select ok(
  (select service_status = 'active' and is_adult_confirmed is true
   from public.profiles where id = '00000000-0000-0000-0000-000000000107')
  and (select use_count = 1 from public.cohort_invites where id = '12000000-0000-0000-0000-000000000007')
  and (select count(*) = 1 from public.consent_events where user_id = '00000000-0000-0000-0000-000000000107'),
  'reactivation requires and records the fresh consent flow'
);

select throws_ok(
  $$select * from public.complete_enrollment(
    '13000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000102',
    'bound-phone'
  )$$,
  'P0001', 'enrollment_challenge_user_mismatch', 'a challenge bound to another user is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;
select results_eq(
  $$select count(*) from public.consent_events$$,
  $$values (1::bigint)$$,
  'participant can read only their own consent history'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
set local role authenticated;
select results_eq(
  $$select count(*) from public.consent_events$$,
  $$values (0::bigint)$$,
  'participant cannot see another participant consent history'
);
reset role;

select * from finish();
rollback;
