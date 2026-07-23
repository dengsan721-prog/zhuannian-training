# Global public-table ACL hardening report

## Scope

- Started from clean `61a26b8`.
- Changed only:
  - `supabase/migrations/202607220002_security_and_points.sql`
  - `supabase/tests/002_rls.test.sql`
- Did not change RLS policies, product behavior, RPCs, private-schema access,
  or any `service_role` grant.

## Root cause

The initial table migrations left Supabase client roles with legacy default
table privileges. RLS protected row-oriented operations but could not protect
table-level operations such as `TRUNCATE`. Migration `002` only revoked a
small subset of those inherited defaults, so early `001`/`002` tables kept
dangerous client-role ACL entries.

## TDD evidence

The regression contract was added before the migration fix. It verifies:

- `PUBLIC` has zero direct privileges on every public base table.
- `anon` has zero direct privileges on every public base table.
- `authenticated` has zero non-`SELECT` privileges.
- `authenticated` has `SELECT` on exactly the 12 participant-readable tables.
- Real `anon` and `authenticated` attempts to
  `TRUNCATE public.profiles CASCADE` fail with SQLSTATE `42501`.

Both destructive checks run before fixture inserts.

Initial focused RED:

```text
Files=1, Tests=21, Failed=2
anonymous users have no privileges on public base tables
  have: 40
  want: 0
authenticated users have no non-SELECT privileges on public base tables
  have: 48
  want: 0
Result: FAIL
```

## Minimal fix

Migration `002` now revokes all table privileges from `PUBLIC`, `anon`, and
`authenticated` on all 13 tables created by migrations `001` and `002`, then
restores only the original participant-facing `SELECT` grants to
`authenticated`. The existing private-schema revoke remains in place.

Migration `003` continues to own exact ACLs for enrollment and consent tables,
and migration `004` keeps its defense-in-depth revoke for
`training_sessions`.

## Verification

- Clean `npx supabase db reset` completed and migration history showed
  `001` through `004`; all 16 public base tables were present.
- Focused pgTAP `002`: 21/21 passed.
- A final coordinator-side clean reset and focused rerun passed `002` 21/21
  and training runtime `008` 91/91.
- Final coordinator-side `npm run test:db`: 8 files / 267 assertions passed.
- Final coordinator-side `npm run check`:
  - ESLint passed.
  - TypeScript passed.
  - 18 Vitest files / 181 tests passed.
  - Production Vite build passed with 160 transformed modules.
- Strict UTF-8 decode and mojibake-marker scan passed for both changed files.
- `git diff --check` passed; Git emitted only repository line-ending warnings.

Live `aclexplode` matrix:

```text
PUBLIC        0 privilege entries
anon          0 privilege entries
authenticated 12 privilege entries, SELECT only
```

The exact authenticated table set was:

```text
cohort_memberships, cohorts, consent_events, follow_up_reviews,
points_ledger, profiles, saved_insights, scene_versions, scenes,
training_completions, training_sessions, user_badges
```

`information_schema.role_table_grants` independently returned the same 12
authenticated `SELECT` grants and no `anon` grants.

The coordinator repeated the live `aclexplode` query after the clean reset.
Its entire client-role matrix was one row:

```text
authenticated|SELECT|12
```

There were no `PUBLIC`, `anon`, or authenticated non-`SELECT` entries.

## Independent review

An independent SQL security reviewer returned `CLEAN`. It confirmed that the
dynamic catalog checks include every public base table and PostgreSQL's
`MAINTAIN` privilege, the exact authenticated `SELECT` set excludes all
private enrollment/staff/invite tables, both real truncate attempts precede
fixtures, and the migration does not touch `service_role`, RLS, or business
functions.

The Task 7 SQL security reviewer also performed a final closure review across
both ACL commits and returned `CLEAN`: owner and service-role access, all 16
RLS-enabled tables, and the enrollment/training RPC permissions remained
intact.

## Release boundary

This report proves the local migration and role-level database contract only.
It does not claim a hosted Supabase migration or production deployment.
