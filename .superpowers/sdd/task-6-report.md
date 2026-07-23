# Task 6 work report

## Scope and starting state

- Started from clean `5e79367`, which already contains the accepted Task 5
  identity hardening through `60f1f35`.
- Implemented only the governed published-scene repository boundary, its
  in-memory test repository, the compact mobile catalog, `/scenes` routing,
  focused tests, and the smallest catalog styles.
- Did not start training state, progress, points, ranking, favorites, coach
  behavior, authoring/import, or any Task 7+ work.

## TDD evidence

Initial focused RED:

```text
npm test -- src/features/scenes src/lib/repositories
Test Files  2 failed (2)
Tests       no tests
```

Both suites failed during import for the intended reason: `SceneHomePage`,
`SceneRepository`, `SupabaseSceneRepository`, and
`InMemorySceneRepository` did not exist.

A later repository invariant was also test-driven: the joined-scene slug
mismatch test first resolved when it should have rejected, then passed after
metadata/payload consistency checking was added.

Independent-review follow-up RED:

```text
npm test -- src/features/scenes src/lib/repositories
Test Files  2 failed (2)
Tests       9 failed | 12 passed (21)
```

The exact select assertion, three governed-metadata mismatch cases, three
invalid-row cases, stable card-order test, and persistent toggle semantics all
failed against the first implementation before the follow-up changed code.

## Implemented behavior

- `SceneRepository` has the exact requested `listPublished` and `getBySlug`
  interface.
- `SupabaseSceneRepository` selects only published `scene_versions`, inner
  joins scene metadata, applies relationship/category filters to the joined
  fields, validates every returned payload with `validateScene`, maps the two
  database identities, rejects malformed rows, and verifies database
  `scene_code`, version, risk, slug, relationship, and category against the
  governed payload. Database/validation failures propagate without fallback
  content.
- `InMemorySceneRepository` uses the same exact-match filter and slug
  semantics without Supabase or environment values.
- `/scenes` lazily constructs the real repository only after that page mounts;
  unrelated routes and builds do not require Supabase environment values.
- The page provides the approved headings, labeled native relationship and
  category filters, three-card default limit, `查看全部经典场景`, direct titles,
  one observable fact, relationship/category labels, and `/train/:slug`
  links.
- Loaded scenes are copied and deterministically sorted by scene code, version,
  and id before filtering and limiting. The expand/collapse control remains
  mounted for result sets over three, exposes `aria-expanded`/`aria-controls`,
  and retains keyboard focus across both state changes.
- At viewports up to 360px wide, relationship and category filters use one
  column.
- Loading and empty states use `role=status`; failure uses `role=alert` and a
  retry control. No mock/fallback scenes are invented.
- No public ranking, last-place, thought correctness, public points, streak
  loss, or shame language was added.

## Verification

- Focused suite:
  `npm test -- src/features/scenes src/lib/repositories` exited `0`;
  2 files / 21 tests passed.
- `npm run typecheck` exited `0`.
- A fresh coordinator-side `npm run check` after the review fixes exited `0`:
  - ESLint passed;
  - TypeScript passed;
  - 15 Vitest files / 117 tests passed;
  - production Vite build passed (160 modules).
- Strict UTF-8 decode passed for all changed follow-up files and this report.
- Mojibake/U+FFFD scan found 0 matches.
- Browser source and built bundle scan found 0 service-role, phone-HMAC, or
  forbidden `VITE_` secret-name matches.
- `git diff --cached --check` found no whitespace errors; only the repository's
  existing LF-to-CRLF working-copy warnings appeared while staging.
- Review follow-up diff: 6 files, 134 insertions, 21 deletions.

## Independent review

- The specification reviewer returned `CLEAN` for the original implementation:
  exact repository contract, published-only query, validation and identity
  mapping, lazy environment access, compact catalog behavior, accessible
  states, prohibited-language boundaries, and scope were all confirmed.
- The quality reviewer found four actionable implementation issues:
  incomplete governed-metadata reconciliation, unstable default ordering,
  two-column filters at very narrow widths, and lost focus after expansion.
  All four were fixed in `21ea129` with nine review-driven RED assertions.
- The same quality reviewer rechecked `ca398968..21ea1294` and returned
  `CLEAN`: all four findings were closed, no new issues were found, focused
  tests were 21/21, typecheck passed, and diff-check was clean.
- The absence of a live PostgREST integration test was classified as an
  explicit Task 15 release gate, not as evidence already satisfied by the
  fake-client unit tests.

## Remaining boundaries

- This task does not seed or import the 24 governed pilot scenes. Until
  reviewed published rows exist and the browser has an authenticated eligible
  participant session, the real repository will correctly return an empty or
  access-controlled result rather than mock content.
- Training links still lead to the pre-existing placeholder route; Task 7+
  owns training behavior.
- The fake-client repository tests do not prove live PostgREST select/join
  behavior. A real authenticated PostgREST catalog smoke test remains an
  explicit Task 15 live release gate. No live API, hosted content, or public
  deployment verification is claimed here.
