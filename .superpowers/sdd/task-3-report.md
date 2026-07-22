# Task 3 Report: Versioned Training Data Schema

## Scope

Created the Task 3 Supabase core schema only: three enum types, eleven RLS-enabled tables, and the versioned scene/session/completion constraints. No Task 4 policies, role tables, points ledger, seed data, or application repositories were added.

## TDD record

### Initialization

The local Supabase project was initialized with `supabase init`. The local runner required the repository-provided Node and Git paths because the default PowerShell PATH did not include them. The locally generated telemetry file was removed before staging.

The initial sandboxed `supabase start` was denied Docker named-pipe access. The escalated local-stack session completed with the database healthy at `127.0.0.1:54322`; optional services were intentionally stopped.

### RED

Command:

```powershell
npx supabase test db
```

Result: exit 1, as required before the core migration. pgTAP reported all eleven `public` core tables missing, empty enum label sets, missing `scene_versions.payload`, uniqueness constraints, and foreign keys. It reported `Failed 34/34 subtests`; the run then stopped at the first direct RLS lookup with `relation public.profiles does not exist`. This is a valid missing-schema RED, not an environment or connection failure.

### GREEN

Applied the migration with:

```powershell
npx supabase db reset
npx supabase test db
```

Fresh GREEN result: exit 0; `Files=1, Tests=34`; `All tests successful`; `Result: PASS`.

## Schema contract delivered

- Exact enum ordering for `app_role`, `content_status`, and `risk_level`.
- Exact tables: `profiles`, `cohorts`, `cohort_invites`, `cohort_memberships`, `scenes`, `scene_versions`, `training_sessions`, `training_completions`, `follow_up_reviews`, `saved_insights`, and `user_badges`.
- `scene_versions.payload` is `jsonb`; scene version, request-idempotency, completion, follow-up, and foreign-key constraints match Task 3.
- `training_completions.session_id` is unique and references `training_sessions`; there is deliberately no `(user_id, scene_version_id)` uniqueness constraint.
- RLS is enabled on all eleven tables; no policies have been added.

## Verification

```powershell
npx supabase status
npx supabase db reset
npm run test:db
npm run lint
npm run typecheck
npm test
npm run build
```

- Supabase status returned the local database URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Database test passed all 34 pgTAP assertions.
- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- `npm test`: 2 passed files, 27 passed tests.
- `npm run build`: exit 0; Vite built successfully.
- Existing UTF-8/mojibake scan against `src` for U+FFFD and the Task 1 malformed-text signatures returned no matches.
- `git diff --check` returned no whitespace errors.

## Files

- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/202607220001_core_schema.sql`
- `supabase/tests/001_core_schema.test.sql`
- `.superpowers/sdd/task-3-report.md`

## Cleanup and self-review

Removed the locally generated `.supabase/telemetry.json` and did not stage it. The implementation change set is limited to the Task 3 files above. Implementation commit: `8332cece1b840fd4813114f2b9662ab97c387e87` (`feat: add versioned training data schema`).

## Independent review-fix pass

Independent review found two Task 3 compliance gaps: the generated Supabase config still allowed public sign-up at the global Auth and email entry points, and eight RLS assertion descriptions did not exactly match the authoritative underscore-form table names.

Focused RED checks failed on both enabled sign-up switches and all eight non-exact descriptions. The fix changed the Auth and email `enable_signup` values to `false` and restored the exact descriptions for `cohort_invites`, `cohort_memberships`, `scene_versions`, `training_sessions`, `training_completions`, `follow_up_reviews`, `saved_insights`, and `user_badges`.

Fresh post-fix verification:

- focused invite-only and exact-description assertions: exit 0;
- `npm run test:db`: 34/34 pgTAP assertions passed;
- `npm run check`: ESLint, TypeScript, 27/27 Vitest tests, and the production build passed;
- UTF-8/mojibake scan, `git diff --check d3d1cf4..HEAD`, and `git status --short`: clean.

Review-fix commit: `969e6b1a17a604932db973a8b55016a37592cd22` (`fix: enforce invite-only supabase config`).
