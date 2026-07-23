# Task 7 work report

## Scope and starting state

- Started from clean `5a16d4f`.
- Implemented only the deterministic six-step training domain, strict runtime
  repository, server-pinned training session RPCs, migration `004`, and real
  pgTAP contract `008`.
- Did not build Task 8 pages/routes/browser recovery, Task 9 completion
  persistence, points, favorites, reviews, coach behavior, or authoring UI.
- No first thought, prediction, hypothesis selection, evidence answer, note,
  free text, or other training-answer field was added to the database.

## TDD evidence

Initial domain RED:

```text
npm test -- src/domain/training
Test Files  2 failed (2)
Tests       no tests
```

Both suites failed during import for the intended reason:
`trainingReducer`, `types`, and `buildFeedback` did not exist.

Initial runtime repository RED:

```text
npm test -- src/lib/repositories/SupabaseTrainingRuntimeRepository.test.ts
Test Files  1 failed (1)
Tests       no tests
```

The suite failed during import because
`SupabaseTrainingRuntimeRepository` did not exist.

Initial real database RED:

```text
npx supabase test db supabase/tests/008_training_runtime.test.sql
Tests: 5 Failed: 5
```

The test stopped after the first five assertions because `updated_at`, its
trigger, and both training RPCs did not exist. The original 73-test plan was
therefore intentionally incomplete at that RED point. Independent review
later added two explicit overlap assertions, bringing the final contract to
75 assertions.

The first two post-migration pgTAP attempts exposed only test-fixture ACL
errors: authenticated assertions tried to read admin-owned temporary snapshot
tables. Those assertions were corrected to read the participant's real
`training_sessions` rows through owner RLS; no database permission was
weakened.

Domain review RED:

```text
npm test -- src/domain/training/trainingReducer.test.ts
Tests  4 failed | 30 passed
```

The four failures proved that stale ordinary actions could move `updatedAt`
backward and that stale danger actions also moved the timestamp backward.
Ordinary actions now reject stale time, while safety exits remain available
and use `max(state.updatedAt, action.at)`.

Post-commit ACL review RED:

```text
npx supabase test db supabase/tests/008_training_runtime.test.sql
Tests  9 failed | 82 passed
```

The nine failures proved that both `authenticated` and `anon` still had
`TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN`, and that an authenticated
`TRUNCATE training_sessions CASCADE` actually succeeded despite RLS. The
contract now verifies authenticated has only `SELECT`, anon has no table
privilege, and the real truncate attempt fails at the permission boundary.
Those 16 additional ACL assertions bring the final contract to 91 assertions.

## Implemented behavior

### Deterministic local state

- The exact ordinary sequence is:
  `safety-fact`, `first-thought`, `relationship-fork`, `hypotheses`,
  `evidence-boundary`, and `expression-action`.
- Every state-changing action carries a strict ISO timestamp. The pure reducer
  never reads a clock, never mutates its input, and deterministically replays
  the same state/action pair.
- Ordinary progress, pause, and resume reject expired or backward-moving
  action times. Completion time is the accepted expression action time.
- Danger reports remain available from every ordinary step and paused state.
  Present-danger evidence also bypasses ordinary expiry/chronology blocking,
  routes immediately to safety, and never rolls `updatedAt` backward.
- Both safety paths scrub first thought, prediction, hypotheses, and evidence
  selections before returning `safety-stop`.
- Stop cards cannot enter the ordinary draft or feedback path.
- Runtime validation rejects forged thought kinds/IDs, non-authored
  predictions, duplicate or non-authored hypotheses, and malformed evidence
  enums even if TypeScript is bypassed.
- Feedback is available only for a completed, expression-accepted ordinary
  draft and the exact pinned scene version. It copies authored objects into
  new values, preserves authored hypothesis order, and includes boundary, new
  expression, micro-action, and fallback plan without inventing motives.
- Completion produces exactly five keys:
  `eventId`, `sessionId`, `sceneId`, `sceneVersionId`, and `completedAt`.

### Strict repository boundary

- Both inputs to `startTraining` and the input to `checkTrainingSession` are
  validated as UUIDs before any RPC call.
- `startTraining` uses exactly `start_training`,
  `p_scene_version_id`, `p_idempotency_key`, and `.single()`.
- `checkTrainingSession` uses exactly `check_training_session` and
  `p_session_id`.
- Start responses must be plain exact two-key objects with a UUID and one of
  the three routes. Check responses must be one exact scalar route.
- Nulls, arrays, missing/extra keys, invalid IDs, and unknown routes fail
  closed. Supabase errors propagate without fallback data.

### Server-pinned runtime

- `training_sessions.updated_at` is backfilled, non-null, and maintained by a
  table-specific trigger only when a row actually changes.
- `private.resolve_training_session` is the single truth-table path used by
  checks and idempotent starts. It locks the owned row, preserves terminal
  states, reads pinned content and current eligibility after the lock, and
  uses `clock_timestamp()` after waits.
- Emergency withdrawal or `risk='stop'` takes safety precedence over content
  status, membership loss, and expiry. Other non-published content,
  ineligibility, and expiry become `abandoned/content-update`.
- Valid paused sessions resume to active without extending expiry. Valid
  active retries do not update either expiry or `updated_at`.
- Starts serialize on a user/request advisory key. Same-key same-scene calls
  return one session; same-key different-scene calls return one success and
  one stable `idempotency_conflict`.
- New sessions use one refreshed clock value for `started_at`, `expires_at`,
  and `updated_at`, remain pinned to the requested version, and expire after
  24 hours.
- Missing and non-published versions share `scene_unavailable`. Missing and
  non-owned sessions share `session_not_found`.
- RPCs are `SECURITY DEFINER SET search_path=''`, executable only by
  `authenticated`. The table ACL is revoked completely from `PUBLIC`, `anon`,
  and `authenticated`, then only owner-RLS `SELECT` is restored to
  `authenticated`; browser roles have no direct mutation, truncate,
  reference, trigger, or maintain privilege.

## Final verification

Supabase commands used `SUPABASE_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`.

- Focused TypeScript suite:
  `npm test -- src/domain/training src/lib/repositories/SupabaseTrainingRuntimeRepository.test.ts`
  exited `0`; 3 files / 64 tests passed.
- `npm run typecheck` exited `0`.
- Fresh `npx supabase db reset` exited `0`; migrations `001` through `004`
  applied from zero.
- Fresh focused pgTAP:
  `npx supabase test db supabase/tests/008_training_runtime.test.sql` exited
  `0`; 91 assertions passed.
- A final coordinator-side reset after the global least-privilege follow-up
  applied migrations `001` through `004` from zero. Focused `002` passed
  21/21 and focused `008` passed 91/91.
- The final coordinator-side `npm run test:db` exited `0`; 8 files / 267
  assertions passed.
- The final coordinator-side `npm run check` exited `0`:
  - ESLint passed;
  - TypeScript passed;
  - 18 Vitest files / 181 tests passed;
  - production Vite build passed with 160 transformed modules.
- Strict UTF-8 decode passed for all 11 implementation/test files.
- Mojibake and U+FFFD scan found no matches.
- Browser source and built bundle scans found no service-role, phone-HMAC,
  password, or forbidden `VITE_` secret names.
- Migration scan found no training-answer/free-text storage fields; browser
  source scan found no local/session storage use in Task 7.
- Prohibited ranking, last-place, thought-correctness, and shame-language scan
  found no matches.
- A live `aclexplode` matrix confirmed the entire public schema has exactly
  twelve `authenticated` `SELECT` entries and no `PUBLIC`, `anon`, or
  authenticated non-`SELECT` table privilege.
- `git diff --cached --check` found no whitespace errors. Git emitted only the
  repository's existing LF-to-CRLF working-copy warnings while staging.
- The base implementation contains exactly the 11 Task 7 files listed in the
  brief; the ACL follow-up changes only migration `004` and pgTAP `008`.

## Independent review closure

- The domain reviewer found stale action times and five initial ESLint
  findings. Four review-driven tests failed before the chronology fix; all
  now pass. The safety scrub rewrite removed three unused destructures and the
  remaining two unused values were removed/marked intentionally consumed.
- The SQL reviewer found that asynchronous dblink sends alone did not prove
  an actual overlap window. Each concurrency case now uses a third dblink
  transaction to hold the exact advisory key, proves both authenticated
  workers are simultaneously busy, then releases the barrier and verifies the
  one-row/same-session or one-success/one-conflict result.
- The SQL reviewer rechecked that fix and returned `CLOSED / CLEAN`.
- A later SQL security review dynamically proved the table-level ACL gap that
  RLS cannot prevent. The follow-up added a RED privilege matrix and real
  truncate attempt before replacing the partial revoke with revoke-all plus
  authenticated `SELECT` only.
- A full public-table ACL audit then found the same Supabase default grants on
  earlier tables. Commit `c9a56b4` hardened migration `002`, added real
  `anon`/`authenticated` truncate-denial tests, and preserved exactly the
  twelve participant-readable `SELECT` grants. Independent static review and
  final SQL security closure both returned `CLEAN`; owner, `service_role`,
  RLS, private helpers, and RPC grants were not weakened.

## Remaining boundaries

- Task 7 does not render the six-step UI, recover a browser draft, or connect
  scene links to training pages; Task 8 owns those behaviors.
- Task 7 does not persist a completion, award points, save insights, or
  collect a follow-up review; Task 9 owns those behaviors.
- Only local database/auth-role behavior was verified. No hosted Supabase
  project, production browser session, public deployment, or live-device
  acceptance is claimed here.
