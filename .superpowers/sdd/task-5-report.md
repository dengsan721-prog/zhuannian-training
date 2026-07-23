# Task 5 Report: Adult Invite-Only Onboarding

## Scope

Task 5 remains limited to adult invite-only onboarding:

- adult gate, invite/phone/current-consent form, six-digit verification, and
  retryable enrollment completion;
- live `/privacy`, `/service-boundary`, and `/content-correction` pages with
  version `2026-07-22` and truthful pilot/provider disclosures;
- public invite-gated OTP request Edge Function and JWT-protected completion
  Edge Function;
- global phone-HMAC delivery throttling, two-phase provider delivery state,
  Auth-user binding, explicit consent history, idempotent enrollment, and invite
  capacity;
- component, auth recovery, pure HTTP handler, SDK adapter, ACL, transaction,
  and true dblink concurrency tests.

No scene catalog, training flow, coach workspace, payment, CAPTCHA, IP
tracking, SMS provider selection, cleanup scheduler, formal support tickets,
account deletion UI, or Task 6+ behavior was added.

## Review RED evidence

The independent Task 5 review was converted into executable failures before
the hardening changes:

- focused HTTP/Auth/UI run: 36 tests, 15 failed as expected. Failures proved
  missing delivery finalization/fail-closed semantics, JSON-only 415 handling,
  streaming cancellation, trusted-session recovery, enrollment-error
  separation, information routes, and stale request clearing;
- new adapter/complete-handler suites initially failed because the injectable
  boundaries did not exist;
- `006_enrollment_delivery.test.sql` initially failed because the private
  delivery-attempt table did not exist;
- the first true cross-invite dblink run exposed an undrained async test
  result. After correcting that test harness issue, the 10 real concurrency and
  lock-wait assertions passed; no product deadlock remained;
- the follow-up database RED run had eight exact failures: NULL consent/status
  bypasses, late pending finalization incorrectly becoming `sent`, and an Auth
  cleanup FK conflict that would delete or block challenge history;
- trusted session recovery had two RED assertions because local
  `getSession()` data was not independently validated with `getUser(token)`;
- clicking information links nested inside consent labels reproduced an
  unintended checkbox toggle.
- the second identity-edge review produced four focused TypeScript failures:
  an unconfirmed caller was accepted, provider 5xx/no-status failures were
  misclassified as explicit send failures, and a thrown candidate-token
  validation error could consume the OTP again;
- the follow-up candidate-token test separately proved that Supabase-style
  `getUser()` returned errors, not only thrown network errors, also retried and
  consumed the OTP before the fail-closed fix;
- `007_enrollment_identity_edges.test.sql` initially had 12 of 18 assertions
  fail, proving that required NULL/empty RPC inputs bypassed checks and that a
  used request could report success after membership deletion or under a new
  same-phone Auth identity;
- the expanded dblink suite initially failed its twelfth assertion because an
  invite code rotated while a request waited on the phone lock could still
  create a challenge for the stale hash.

## Hardened implementation

- OTP reservations are stored in private
  `enrollment_sms_delivery_attempts` rows with
  `pending/sent/failed/unknown` state. Reservation is not treated as provider
  success.
- The handler returns `202` only after a provider success is finalized as
  `sent`. Explicit failure is finalized as `failed`; thrown/unknown provider
  results and interrupted finalization remain fail-closed and never claim a
  send.
- Sixty-second cooldown and rolling three-per-ten-minute limits use successful
  attempts by `phone_hmac` globally across invites, used challenges, and
  completed enrollment. One pending attempt per phone is enforced.
- Pending delivery older than ten minutes becomes `unknown`; a late finalizer
  cannot revive it. Confirmed sending alone starts a fresh ten-minute
  verification lifetime.
- Advisory locking is phone-global. Expiry/window decisions use
  `clock_timestamp()` refreshed after the advisory and row-lock waits.
- Delivery finalization is same-result idempotent and rejects conflicting
  outcomes. RPCs use `security definer`, `search_path = ''`, and service-only
  grants.
- A newly pre-created Auth user is bound to the matching request/HMAC before
  SMS. Only the exact Supabase Auth API `phone_exists` code is accepted as an
  existing user; all other create errors stop before sending. OTP sending uses
  the anon client with `shouldCreateUser: false`, not the service-role client.
- Auth-user cleanup uses `ON DELETE SET NULL`; challenge and delivery history
  remain available for global throttling.
- Browser roles have no challenge/delivery privileges. `consent_events` is
  revoked from public/anon/authenticated first, then only authenticated SELECT
  is granted through the own-row RLS policy. Tests explicitly deny INSERT,
  UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN.
- Both HTTP handlers accept only `application/json` (optional parameters),
  enforce a streaming 4096-byte ceiling with immediate reader cancellation,
  preserve exact-origin/no-store CORS, and redact dependency errors.
- Recovery skips a second OTP consumption only after the local access token is
  validated with `getUser(token)` and the server user has the same confirmed
  phone. A candidate-token validation throw or returned SDK error fails closed;
  only an explicitly different or unconfirmed server user may proceed to new
  OTP verification. Completion receives that bearer token explicitly.
- Completion authentication also requires `phone_confirmed_at`; a normalized
  phone number alone is not accepted.
- OTP provider SDK errors are classified as explicit `failed` delivery only
  for an `AuthApiError` with a numeric 4xx status. A 5xx, missing status, or
  thrown dependency error remains `unknown` so the system never claims a
  definite provider rejection it did not observe.
- Enrollment service RPCs reject required NULL/empty identifiers and HMAC
  inputs before lookup and use NULL-safe `IS DISTINCT FROM` comparisons.
  Idempotent reuse requires the same non-NULL bound Auth user and the original
  membership to still exist; a deleted Auth identity cannot authorize a new
  same-phone identity to replay the old request.
- The invite row is re-read with the original code hash after the phone
  advisory lock. A rotation during lock wait now returns `invalid_invite`
  without creating challenge or delivery artifacts.
- Enrollment failure is distinct from OTP failure in the UI and offers a
  retry. Starting another OTP request clears old sessionStorage and the old
  verification link before the request runs.
- Consent text and information links are separate click targets, so reading an
  information page cannot silently enable consent.

## Final verification

Supabase commands used `SUPABASE_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`.

- clean `npx supabase db reset`: exit 0; migrations 001–003 applied;
- fresh `npx supabase test db`: exit 0; 7 files / 170 pgTAP assertions,
  including 18 identity-edge assertions and 12 real dblink
  concurrency/lock-wait assertions;
- fresh `npm run check`: exit 0; ESLint, TypeScript, 13 Vitest files / 96 tests,
  and the production Vite build passed;
- Edge Runtime 1.74.2 / Deno 2.1.4 listed and evaluated both workers. The public
  worker returned redacted `service_unavailable` because local Edge secrets
  were intentionally absent; the protected completion worker rejected a
  missing bearer token at the JWT boundary. The optional Edge container was
  stopped and only the healthy local database container remained;
- strict UTF-8 decode passed for all 9 second-round changed/untracked task
  files; mojibake and U+FFFD scans found no matches;
- 30 browser source/bundle files had no service-role, phone-HMAC, or local test
  secret matches; 31 browser/environment files had no forbidden `VITE_`
  secret-name matches;
- `git diff --check` found no whitespace errors. Git emitted only the
  repository's existing LF-to-CRLF working-copy warnings.

No real SMS delivery was executed, tested, or claimed.

## Independent review closure

- The first independent general/security review rejected the initial
  implementation and identified consent ACL, global throttling, delivery
  finalization, HTTP body, identity-binding, recovery, and information-route
  defects. Each accepted finding was converted into a failing test before the
  implementation changed.
- A second full review rejected the first hardening pass for an unconfirmed
  phone identity boundary, NULL-unsafe service RPC comparisons, used-challenge
  cross-identity replay, and invite-code rotation during lock wait.
- Commit `60f1f35545abe4c97990d3fbca560f4f12578372` closed those findings. Two
  independent reviewers then inspected `881f1af..60f1f35` and both returned
  `CLEAN`, with no open or newly introduced issue in the scoped change.
- After that final commit and review, the primary agent independently reran
  `npm run check` (13 files / 96 tests plus lint, typecheck, and build), rebuilt
  the local database from zero, and reran all 7 database files / 170 pgTAP
  assertions. All commands exited `0`; the Git worktree and browser-secret
  scans were clean.

## Remaining release gates

Production SMS remains blocked until deployment selects and configures a real
provider, updates the disclosure with the actual provider, completes real-device
send/verify testing, configures exact `APP_ORIGIN` and a strong
`PHONE_HMAC_SECRET`, adds provider-appropriate CAPTCHA/abuse protection, and
implements/tests operational cleanup for expired challenges, delivery attempts,
and unverified Auth users. Third-party monitoring is still not configured.
