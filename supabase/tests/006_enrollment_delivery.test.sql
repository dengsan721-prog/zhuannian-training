begin;
create extension if not exists pgtap with schema extensions;

select plan(50);

select has_table('public', 'enrollment_sms_delivery_attempts', 'private SMS delivery attempts exist');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.enrollment_sms_delivery_attempts'::regclass),
  'SMS delivery attempts use RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.consent_events', 'select'),
  'authenticated participants retain consent SELECT'
);
select ok(
  not has_table_privilege('authenticated', 'public.consent_events', privilege),
  format('authenticated participants have no consent %s privilege', privilege)
)
from unnest(array[
  'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
]) privilege;
select ok(
  not exists (
    select 1
    from unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]) privilege
    where has_table_privilege('anon', 'public.consent_events', privilege)
  ),
  'anonymous users have no consent table privileges'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]) privilege
    where has_table_privilege('anon', 'public.enrollment_challenges', privilege)
  ),
  'anonymous users have no challenge table privileges'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]) privilege
    where has_table_privilege('authenticated', 'public.enrollment_challenges', privilege)
  ),
  'authenticated users have no challenge table privileges'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]) privilege
    where has_table_privilege('anon', 'public.enrollment_sms_delivery_attempts', privilege)
  ),
  'anonymous users have no SMS attempt table privileges'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]) privilege
    where has_table_privilege('authenticated', 'public.enrollment_sms_delivery_attempts', privilege)
  ),
  'authenticated users have no SMS attempt table privileges'
);
select ok(
  has_function_privilege('service_role', 'public.request_enrollment_challenge(text,text,boolean,text,text)', 'execute'),
  'service role can reserve an OTP delivery'
);
select ok(
  not has_function_privilege('authenticated', 'public.request_enrollment_challenge(text,text,boolean,text,text)', 'execute'),
  'authenticated users cannot reserve an OTP delivery'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_enrollment_otp_delivery(uuid,uuid,text)', 'execute'),
  'service role can finalize an OTP delivery'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_enrollment_otp_delivery(uuid,uuid,text)', 'execute'),
  'authenticated users cannot finalize an OTP delivery'
);
select ok(
  has_function_privilege('service_role', 'public.bind_enrollment_challenge_user(uuid,uuid,text)', 'execute'),
  'service role can bind a newly created Auth user'
);
select ok(
  not has_function_privilege('authenticated', 'public.bind_enrollment_challenge_user(uuid,uuid,text)', 'execute'),
  'authenticated users cannot bind a challenge user'
);
select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.enrollment_sms_delivery_attempts'::regclass
      and confrelid = 'public.enrollment_challenges'::regclass
      and confdeltype = 'c'
  ),
  'SMS attempt history does not cascade away with a challenge'
);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000300','authenticated','authenticated','delivery-coach@example.invalid',now(),now()),
  ('00000000-0000-4000-8000-000000000301','authenticated','authenticated','delivery-new@example.invalid',now(),now()),
  ('00000000-0000-4000-8000-000000000302','authenticated','authenticated','delivery-other@example.invalid',now(),now());
insert into public.profiles(id, display_name, is_adult_confirmed) values
  ('00000000-0000-4000-8000-000000000300','发送测试教练',true);
insert into public.cohorts(id, name, coach_id, status) values
  ('31000000-0000-4000-8000-000000000001','全局限流甲班','00000000-0000-4000-8000-000000000300','active'),
  ('31000000-0000-4000-8000-000000000002','全局限流乙班','00000000-0000-4000-8000-000000000300','active');
insert into public.cohort_invites(id, cohort_id, code_hash, expires_at, max_uses, use_count) values
  ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','global-invite-a',now() + interval '1 hour',10,0),
  ('32000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','global-invite-b',now() + interval '1 hour',10,0);

create temporary table delivery_calls (
  step integer primary key,
  decision text not null,
  request_id uuid,
  delivery_attempt_id uuid,
  should_send boolean not null,
  retry_after_seconds integer not null
);

select throws_ok(
  $$select * from public.request_enrollment_challenge(
    'global-invite-a', 'null-privacy-phone', true, null, '2026-07-22'
  )$$,
  'P0001',
  'consent_required',
  'a NULL privacy consent version cannot bypass validation'
);
select throws_ok(
  $$select * from public.request_enrollment_challenge(
    'global-invite-a', 'null-boundary-phone', true, '2026-07-22', null
  )$$,
  'P0001',
  'consent_required',
  'a NULL service-boundary version cannot bypass validation'
);

insert into delivery_calls
select 90, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'null-status-phone', true, '2026-07-22', '2026-07-22'
) result;
select throws_ok(
  format(
    $$select * from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,null)$$,
    (select delivery_attempt_id from delivery_calls where step = 90),
    (select request_id from delivery_calls where step = 90)
  ),
  'P0001',
  'invalid_delivery_status',
  'a NULL delivery outcome is rejected explicitly'
);
select is(
  (select status from public.enrollment_sms_delivery_attempts
   where id = (select delivery_attempt_id from delivery_calls where step = 90)),
  'pending',
  'a rejected NULL outcome leaves the reservation pending'
);

insert into delivery_calls
select 91, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'expired-finalize-phone', true, '2026-07-22', '2026-07-22'
) result;
update public.enrollment_sms_delivery_attempts
set reserved_at = clock_timestamp() - interval '10 minutes 1 second'
where id = (select delivery_attempt_id from delivery_calls where step = 91);
select results_eq(
  format(
    $$select delivery_status, request_id from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,'sent')$$,
    (select delivery_attempt_id from delivery_calls where step = 91),
    (select request_id from delivery_calls where step = 91)
  ),
  format(
    $$values ('unknown'::text,%L::uuid)$$,
    (select request_id from delivery_calls where step = 91)
  ),
  'a provider result arriving after the ten-minute reservation lifetime is fail-closed'
);
select ok(
  (select status = 'unknown' and finalized_at is not null
   from public.enrollment_sms_delivery_attempts
   where id = (select delivery_attempt_id from delivery_calls where step = 91))
  and
  (select last_sent_at is null and send_count = 0
   from public.enrollment_challenges
   where id = (select request_id from delivery_calls where step = 91)),
  'an expired reservation never becomes a successful send or valid challenge'
);

insert into delivery_calls
select 1, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'accepted' and should_send and request_id is not null
     and delivery_attempt_id is not null from delivery_calls where step = 1),
  'first valid request reserves one pending delivery'
);
select is(
  (select count(*) from public.enrollment_challenges where phone_hmac = 'global-phone-hmac'),
  1::bigint,
  'first request creates one challenge'
);
select is(
  (select count(*) from public.enrollment_sms_delivery_attempts
    where phone_hmac = 'global-phone-hmac' and status = 'pending'),
  1::bigint,
  'first request creates one pending attempt'
);

insert into delivery_calls
select 2, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'delivery_pending' and should_send is false
     and request_id = (select request_id from delivery_calls where step = 1)
     and delivery_attempt_id = (select delivery_attempt_id from delivery_calls where step = 1)
     from delivery_calls where step = 2)
  and (select count(*) = 1 from public.enrollment_sms_delivery_attempts
       where phone_hmac = 'global-phone-hmac'),
  'an unconfirmed delivery fails closed and cannot reserve a concurrent send'
);

select results_eq(
  format(
    $$select delivery_status, request_id from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,'failed')$$,
    (select delivery_attempt_id from delivery_calls where step = 1),
    (select request_id from delivery_calls where step = 1)
  ),
  format(
    $$values ('failed'::text,%L::uuid)$$,
    (select request_id from delivery_calls where step = 1)
  ),
  'an explicit provider failure is finalized as failed'
);
select results_eq(
  format(
    $$select delivery_status, request_id from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,'failed')$$,
    (select delivery_attempt_id from delivery_calls where step = 1),
    (select request_id from delivery_calls where step = 1)
  ),
  format(
    $$values ('failed'::text,%L::uuid)$$,
    (select request_id from delivery_calls where step = 1)
  ),
  'repeating the same failed finalization is idempotent'
);
select throws_ok(
  format(
    $$select * from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,'sent')$$,
    (select delivery_attempt_id from delivery_calls where step = 1),
    (select request_id from delivery_calls where step = 1)
  ),
  'P0001',
  'delivery_status_conflict',
  'an opposite finalization cannot rewrite the recorded provider outcome'
);

insert into delivery_calls
select 3, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'accepted' and should_send
     and request_id = (select request_id from delivery_calls where step = 1)
     and delivery_attempt_id <> (select delivery_attempt_id from delivery_calls where step = 1)
     from delivery_calls where step = 3),
  'a confirmed failure permits an immediate retry without creating another challenge'
);
select results_eq(
  format(
    $$select delivery_status, request_id from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,'sent')$$,
    (select delivery_attempt_id from delivery_calls where step = 3),
    (select request_id from delivery_calls where step = 3)
  ),
  format(
    $$values ('sent'::text,%L::uuid)$$,
    (select request_id from delivery_calls where step = 3)
  ),
  'a successful provider result is finalized as sent'
);
select results_eq(
  format(
    $$select delivery_status, request_id from public.finalize_enrollment_otp_delivery(%L::uuid,%L::uuid,'sent')$$,
    (select delivery_attempt_id from delivery_calls where step = 3),
    (select request_id from delivery_calls where step = 3)
  ),
  format(
    $$values ('sent'::text,%L::uuid)$$,
    (select request_id from delivery_calls where step = 3)
  ),
  'repeating the same sent finalization is idempotent'
);
select ok(
  (select expires_at > clock_timestamp() + interval '9 minutes 50 seconds'
     and last_sent_at is not null and send_count = 1
   from public.enrollment_challenges
   where id = (select request_id from delivery_calls where step = 3)),
  'only confirmed sending starts a fresh ten-minute verification lifetime'
);
select ok(
  (select count(*) = 1 from public.enrollment_sms_delivery_attempts
   where phone_hmac = 'global-phone-hmac' and status = 'failed')
  and
  (select count(*) = 1 from public.enrollment_sms_delivery_attempts
   where phone_hmac = 'global-phone-hmac' and status = 'sent'),
  'failed attempts remain auditable but do not count as successful sends'
);

insert into delivery_calls
select 4, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'accepted' and should_send is false
     and request_id = (select request_id from delivery_calls where step = 3)
     from delivery_calls where step = 4)
  and (select count(*) = 2 from public.enrollment_sms_delivery_attempts
       where phone_hmac = 'global-phone-hmac'),
  'same-invite replay after confirmed sending returns the live request without another send'
);

insert into delivery_calls
select 5, result.*
from public.request_enrollment_challenge(
  'global-invite-b', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'rate_limited' and should_send is false
     and request_id = (select request_id from delivery_calls where step = 3)
     from delivery_calls where step = 5)
  and (select count(*) = 1 from public.enrollment_challenges where phone_hmac = 'global-phone-hmac')
  and (select count(*) = 2 from public.enrollment_sms_delivery_attempts where phone_hmac = 'global-phone-hmac'),
  'switching invites cannot bypass the global sixty-second phone cooldown'
);

select results_eq(
  format(
    $$select bound from public.bind_enrollment_challenge_user(%L::uuid,%L::uuid,'global-phone-hmac')$$,
    (select request_id from delivery_calls where step = 3),
    '00000000-0000-4000-8000-000000000301'
  ),
  $$values (true)$$,
  'a service caller can bind the newly created Auth user to the matching phone challenge'
);
select results_eq(
  format(
    $$select bound from public.bind_enrollment_challenge_user(%L::uuid,%L::uuid,'global-phone-hmac')$$,
    (select request_id from delivery_calls where step = 3),
    '00000000-0000-4000-8000-000000000301'
  ),
  $$values (true)$$,
  'repeating the same Auth user binding is idempotent'
);
select throws_ok(
  format(
    $$select * from public.bind_enrollment_challenge_user(%L::uuid,%L::uuid,'global-phone-hmac')$$,
    (select request_id from delivery_calls where step = 3),
    '00000000-0000-4000-8000-000000000302'
  ),
  'P0001',
  'enrollment_challenge_user_mismatch',
  'a bound challenge cannot be rebound to another Auth user'
);
select lives_ok(
  $$delete from auth.users where id = '00000000-0000-4000-8000-000000000301'$$,
  'cleanup can delete the newly pre-created Auth user'
);
select ok(
  (select user_id is null from public.enrollment_challenges
   where id = (select request_id from delivery_calls where step = 3))
  and
  (select count(*) = 2 from public.enrollment_sms_delivery_attempts
   where phone_hmac = 'global-phone-hmac'),
  'Auth cleanup clears only the binding and preserves challenge and delivery history'
);

update public.enrollment_challenges
set used_at = clock_timestamp(),
    last_sent_at = clock_timestamp() - interval '61 seconds'
where id = (select request_id from delivery_calls where step = 3);
update public.enrollment_sms_delivery_attempts
set finalized_at = clock_timestamp() - interval '61 seconds'
where id = (select delivery_attempt_id from delivery_calls where step = 3);

insert into delivery_calls
select 6, result.*
from public.request_enrollment_challenge(
  'global-invite-b', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'accepted' and should_send and request_id is not null
     and request_id <> (select request_id from delivery_calls where step = 3)
     from delivery_calls where step = 6),
  'after cooldown a different invite can reserve the second global send'
);
select * from public.finalize_enrollment_otp_delivery(
  (select delivery_attempt_id from delivery_calls where step = 6),
  (select request_id from delivery_calls where step = 6),
  'sent'
);
update public.enrollment_challenges
set used_at = clock_timestamp(),
    last_sent_at = clock_timestamp() - interval '61 seconds'
where id = (select request_id from delivery_calls where step = 6);
update public.enrollment_sms_delivery_attempts
set finalized_at = clock_timestamp() - interval '61 seconds'
where id = (select delivery_attempt_id from delivery_calls where step = 6);

insert into delivery_calls
select 7, result.*
from public.request_enrollment_challenge(
  'global-invite-a', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select * from public.finalize_enrollment_otp_delivery(
  (select delivery_attempt_id from delivery_calls where step = 7),
  (select request_id from delivery_calls where step = 7),
  'sent'
);
update public.enrollment_challenges
set used_at = clock_timestamp(),
    last_sent_at = clock_timestamp() - interval '61 seconds'
where id = (select request_id from delivery_calls where step = 7);
update public.enrollment_sms_delivery_attempts
set finalized_at = clock_timestamp() - interval '61 seconds'
where id = (select delivery_attempt_id from delivery_calls where step = 7);

insert into delivery_calls
select 8, result.*
from public.request_enrollment_challenge(
  'global-invite-b', 'global-phone-hmac', true, '2026-07-22', '2026-07-22'
) result;
select ok(
  (select decision = 'rate_limited' and should_send is false from delivery_calls where step = 8)
  and (select count(*) = 3 from public.enrollment_challenges where phone_hmac = 'global-phone-hmac')
  and (select count(*) = 4 from public.enrollment_sms_delivery_attempts where phone_hmac = 'global-phone-hmac')
  and (select count(*) = 3 from public.enrollment_sms_delivery_attempts
       where phone_hmac = 'global-phone-hmac' and status = 'sent'),
  'three successful sends in ten minutes remain global across invites and used challenges'
);

insert into public.enrollment_challenges(
  id, invite_id, phone_hmac, adult_attested, privacy_consent_version,
  service_boundary_version, expires_at
) values (
  '33000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'never-sent-phone',
  true,
  '2026-07-22',
  '2026-07-22',
  clock_timestamp() + interval '10 minutes'
);
select throws_ok(
  $$select * from public.complete_enrollment(
    '33000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000302',
    'never-sent-phone'
  )$$,
  'P0001',
  'enrollment_challenge_not_sent',
  'completion rejects a challenge that has no confirmed SMS delivery'
);

select * from finish();
rollback;
