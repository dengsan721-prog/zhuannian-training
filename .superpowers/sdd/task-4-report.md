# Task 4 Report: Least-Privilege RLS and Idempotent Points

## Scope

Created only the Task 4 migration and its two authoritative pgTAP test files. No onboarding, RPCs, coach-assignment tables, seed data, or application code was changed.

## TDD record

### RED

Before the migration existed, I added the exact authoritative tests:

- `supabase/tests/002_rls.test.sql`: 15 assertions.
- `supabase/tests/003_points.test.sql`: 3 assertions.

I then ran the required command with the task's prescribed PATH prefix:

```powershell
npm run test:db
```

The sandbox prevented the Supabase runner before it could contact the healthy local database:

```text
[ERROR] EPERM: operation not permitted, realpath 'C:\Users\Administrator'
For help, run: pnpm help dlx
```

This was a home-directory sandbox failure, not a valid schema-missing RED, so it was not counted. The parent then ran the same command in the approved session before applying the migration. Task 3's 34 assertions passed; Task 4 failed because `public.staff_roles`, the four required policy sets, and `public.points_ledger` did not exist. The RLS file reported `Failed 15/15 subtests`, the points file reported `Failed 3/3 subtests`, and the command exited 1. This is the required missing-Task-4-object RED.

### Implementation written after the test files

`202607220002_security_and_points.sql` creates only the Task 4 contract:

- non-exposed `private` helpers with `SECURITY DEFINER` and an empty search path;
- RLS-enabled `staff_roles` and `points_ledger` tables;
- `point_reason` enum and both points idempotency uniqueness constraints;
- participant-only progress policies, active-member published-scene policies, and assigned-coach completion visibility;
- no browser-facing policy for `staff_roles` or `cohort_invites`, and no role inheritance for `system_admin`;
- anonymous access revocations plus authenticated write revocation for the ledger.

Implementation commit: `172567c` (`feat: enforce private progress and idempotent points`).

The first post-reset GREEN run reached the behavioral RLS query but failed with `permission denied for table scene_versions`. The generated Supabase config follows the new default that does not auto-expose new tables, so RLS policies alone were not operational. The migration was fixed to grant `authenticated` SELECT only on the eleven tables that already have Task 4 SELECT policies. It still grants no browser access to `cohort_invites`, `staff_roles`, or the `private` schema, and grants nothing to `anon`.

Permission fix commit: `9b6ec54` (`fix: grant policy-scoped read access`).

## Final verification

```powershell
npx supabase db reset
npm run test:db
npm run check
```

- `npx supabase db reset`: exit 0; both Task 3 and Task 4 migrations applied from a clean database.
- `npm run test:db` with `SUPABASE_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`: exit 0; 3 files and 52 assertions passed.
- `npm run check`: exit 0; ESLint, TypeScript, 27/27 Vitest tests, and the production build passed.
- UTF-8/mojibake scan across `src` and `supabase`: no matches.
- `git diff --check 537f9aa..HEAD` and `git status --short`: clean.

Without telemetry disabled, the same 52 assertions passed but the CLI returned 1 while timing out during PostHog shutdown. That tooling-only exit was not accepted as final evidence; the telemetry-disabled rerun above provides the clean exit 0.

## Files

- `supabase/migrations/202607220002_security_and_points.sql`
- `supabase/tests/002_rls.test.sql`
- `supabase/tests/003_points.test.sql`
- `.superpowers/sdd/task-4-report.md` (work record; intentionally not part of the implementation commit)

## Self-review

- Helpers remain in `private`; no authenticated schema usage was granted.
- Authenticated SELECT is granted only where a named RLS SELECT policy exists; policies still determine row visibility.
- `system_admin` is checked only for its explicitly assigned role and receives no implicit supervisor, privacy-officer, or safety-reviewer role.
- `training_completions` does not receive an answer column or answer persistence behavior.
- The migration does not add Task 5+ tables or behavior.
