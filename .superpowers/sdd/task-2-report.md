# Task 2 Report: Governed Scene Contract

## Scope

Defined the shared scene contract for card content, the training state machine, and the governance back office. The implementation adds public TypeScript types, a Zod schema, one parsing entry point, and reusable valid/published scene fixtures.

## TDD record

### RED

Command:

```powershell
npm test -- src/domain/scenes/validateScene.test.ts
```

Result: failed as expected before production contract files existed. Vite reported that `./validateScene` could not be resolved from `src/domain/scenes/validateScene.test.ts`; no tests ran because the contract entry point did not yet exist.

### GREEN

Command:

```powershell
npm test -- src/domain/scenes/validateScene.test.ts
```

Result: `1 passed`, `6 passed` after implementing the contract. The focused suite includes the four required examples plus two negative tests: a stop scene containing ordinary content is rejected, and duplicated/missing evidence IDs are rejected.

During the first GREEN run, the supplied fixture's `likelyAction: '翻旧账'` failed the required `min(4)` rule because it has three characters. The fixture was corrected to the equivalent `逐一翻旧账`; the schema constraint was not weakened.

## Contract coverage

- Normal (`standard` and `caution`) scenes require at least three thought options, two predictions, two competing hypotheses, all three hypothesis kinds, all six unique evidence IDs, controllability question, boundary, expression, micro action, and fallback plan.
- `stop` scenes require a safety route and reject every normal training field, including thought/prediction options, hypotheses, evidence checks, strength lens, boundary, expression, micro action, and fallback plan.
- The schema also validates scene-code/relationship consistency and the required public field shapes.

## Full verification

Command:

```powershell
npm run check
```

Result: exit 0. ESLint passed, `tsc --noEmit` passed, Vitest reported `2 passed` files and `7 passed` tests, and `tsc -b && vite build` completed successfully.

UTF-8 check:

```powershell
rg -n -P '\x{FFFD}|(?:Ã.|â..|鈥)' src
```

Result: no matches. `git diff --check` also reported no whitespace errors.

## Files

- `src/domain/scenes/types.ts`
- `src/domain/scenes/schema.ts`
- `src/domain/scenes/validateScene.ts`
- `src/domain/scenes/validateScene.test.ts`
- `src/test/fixtures/scene.ts`
- `.superpowers/sdd/task-2-report.md`

## Self-review

The implementation keeps the contract limited to the requested fixed content model. It adds no free-form AI field, diagnosis, scoring, or outcome promise. Stop content cannot accidentally carry normal reframe, character/strength, boundary, or action advice. No Task 1 source files or parent-directory files were changed.

## Remaining concern

The initial RED is an import-resolution failure because the validator entry point intentionally did not exist yet; it is the expected absence of the contract rather than an assertion-level failure. All six behavioral assertions ran after the entry point was implemented.

## Independent review-fix pass

The authoritative Task 2 plan was updated after the initial implementation. Review showed that `045a2e0` did not yet enforce structured, uncertainty-worded strength possibilities; uncertainty language for benevolent and constraint hypotheses; hypothesis id/text uniqueness; or complete safety-route requirements. Its stop-only test also bundled ordinary fields rather than proving each field independently.

### Review-fix RED

Command:

```powershell
npm test -- src/domain/scenes/validateScene.test.ts
```

Result: `1 failed` test file; `10 failed | 16 passed` tests. Failures directly reproduced duplicate hypothesis ids/texts, definite strength and hypothesis wording, empty safety-route heading/body, missing `exit`, missing `trusted-support`, and duplicate safety actions.

### Review-fix GREEN and full verification

Focused command:

```powershell
npm test -- src/domain/scenes/validateScene.test.ts
```

Result: `1 passed` test file; `26 passed` tests. This includes ten independently parameterized forbidden stop-scene fields, an accepted safety-only baseline, both positive hypothesis kinds, both duplicate-hypothesis modes, and all safety-route failure modes.

Full command:

```powershell
npm run check
```

Result: exit 0. ESLint and TypeScript passed; Vitest reported `2 passed` files and `27 passed` tests; the production build completed successfully.

The Task 1 UTF-8/mojibake patterns (`杞康璁粌`, `浠呴潰鍚戞垚骞翠汉`, `骞哥椹跨珯`, and U+FFFD) produced no matches under `src`. `git diff --check` also passed.

### Review-fix implementation

- Added `StrengthPossibility` and made each strength item carry an id, uncertain possibility, and evidence prompt.
- Enforced uncertainty language on benevolent and constraint hypotheses while preserving direct boundary hypotheses.
- Enforced trimmed-text/id uniqueness for ordinary-scene hypotheses.
- Required non-empty safety text, unique actions, and both `exit` and `trusted-support`.
- Statically bound `sceneSchema` to `SceneVersion` and removed the validator return cast.
- Preserved the six unique evidence checks and scene-code/relationship rules with regression tests.

Implementation commit: `ad343c7edc7d1359bff2857dfbbaa9bf81777953` (`fix: harden governed scene contract`).

No Task 3 files or behavior were introduced.
