begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000400','authenticated','authenticated','identity-coach@example.invalid',now(),now()),
  ('00000000-0000-4000-8000-000000000401','authenticated','authenticated','identity-original@example.invalid',now(),now()),
  ('00000000-0000-4000-8000-000000000402','authenticated','authenticated','identity-replay@example.invalid',now(),now());
insert into public.profiles(id, display_name, is_adult_confirmed) values
  ('00000000-0000-4000-8000-000000000400','身份边界教练',true);
insert into public.cohorts(id, name, coach_id, status) values (
  '41000000-0000-4000-8000-000000000001',
  '身份边界测试班',
  '00000000-0000-4000-8000-000000000400',
  'active'
);
insert into public.cohort_invites(id, cohort_id, code_hash, expires_at, max_uses, use_count) values (
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'identity-edge-hash',
  now() + interval '1 hour',
  5,
  0
);
insert into public.enrollment_challenges(
  id, invite_id, phone_hmac, adult_attested, privacy_consent_version,
  service_boundary_version, expires_at, send_count, send_window_started_at,
  last_sent_at
) values
  (
    '43000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    'parameter-phone-hmac',
    true,
    '2026-07-22',
    '2026-07-22',
    now() + interval '10 minutes',
    1,
    now(),
    now()
  ),
  (
    '43000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000001',
    'used-phone-hmac',
    true,
    '2026-07-22',
    '2026-07-22',
    now() + interval '10 minutes',
    1,
    now(),
    now()
  );
insert into public.enrollment_sms_delivery_attempts(
  id, challenge_id, phone_hmac, status, reserved_at
) values (
  '44000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  'parameter-phone-hmac',
  'pending',
  now()
);

select throws_ok(
  $$do $block$ begin
    perform * from public.finalize_enrollment_otp_delivery(
      null::uuid,
      '43000000-0000-4000-8000-000000000001',
      'failed'
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'finalize rejects a NULL attempt id'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.finalize_enrollment_otp_delivery(
      '44000000-0000-4000-8000-000000000001',
      null::uuid,
      'failed'
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'finalize rejects a NULL request id'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.finalize_enrollment_otp_delivery(
      '44000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      null
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_delivery_status',
  'finalize rejects a NULL status'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.finalize_enrollment_otp_delivery(
      '44000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001',
      ''
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_delivery_status',
  'finalize rejects an empty status'
);

select throws_ok(
  $$do $block$ begin
    perform * from public.bind_enrollment_challenge_user(
      null::uuid,
      '00000000-0000-4000-8000-000000000401',
      'parameter-phone-hmac'
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'bind rejects a NULL request id'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.bind_enrollment_challenge_user(
      '43000000-0000-4000-8000-000000000001',
      null::uuid,
      'parameter-phone-hmac'
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'bind rejects a NULL user id'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.bind_enrollment_challenge_user(
      '43000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000401',
      null
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'bind rejects a NULL phone HMAC'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.bind_enrollment_challenge_user(
      '43000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000401',
      ''
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'bind rejects an empty phone HMAC'
);

select throws_ok(
  $$do $block$ begin
    perform * from public.complete_enrollment(
      null::uuid,
      '00000000-0000-4000-8000-000000000401',
      'used-phone-hmac'
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'completion rejects a NULL request id'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.complete_enrollment(
      '43000000-0000-4000-8000-000000000002',
      null::uuid,
      'used-phone-hmac'
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'completion rejects a NULL user id'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.complete_enrollment(
      '43000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000401',
      null
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'completion rejects a NULL phone HMAC'
);
select throws_ok(
  $$do $block$ begin
    perform * from public.complete_enrollment(
      '43000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000401',
      ''
    );
    raise exception 'unexpected_success';
  end $block$;$$,
  'P0001', 'invalid_request',
  'completion rejects an empty phone HMAC'
);

select results_eq(
  $$select cohort_id from public.complete_enrollment(
    '43000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000401',
    'used-phone-hmac'
  )$$,
  $$values ('41000000-0000-4000-8000-000000000001'::uuid)$$,
  'first completion binds the verified user and creates membership'
);
select results_eq(
  $$select cohort_id from public.complete_enrollment(
    '43000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000401',
    'used-phone-hmac'
  )$$,
  $$values ('41000000-0000-4000-8000-000000000001'::uuid)$$,
  'used challenge remains idempotent for its same bound member'
);

delete from public.cohort_memberships
where cohort_id = '41000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000401';
select throws_ok(
  $$select * from public.complete_enrollment(
    '43000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000401',
    'used-phone-hmac'
  )$$,
  'P0001', 'enrollment_membership_missing',
  'used challenge cannot claim success after its original membership is gone'
);

select lives_ok(
  $$delete from auth.users where id = '00000000-0000-4000-8000-000000000401'$$,
  'original Auth user can be cleaned up'
);
select throws_ok(
  $$select * from public.complete_enrollment(
    '43000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000402',
    'used-phone-hmac'
  )$$,
  'P0001', 'enrollment_challenge_user_mismatch',
  'a new same-phone Auth user cannot replay an old used request'
);
select ok(
  not exists (
    select 1 from public.profiles
    where id = '00000000-0000-4000-8000-000000000402'
  )
  and not exists (
    select 1 from public.cohort_memberships
    where user_id = '00000000-0000-4000-8000-000000000402'
  )
  and not exists (
    select 1 from public.consent_events
    where user_id = '00000000-0000-4000-8000-000000000402'
  ),
  'rejected replay creates no false profile, membership, or consent'
);

select * from finish();
rollback;
