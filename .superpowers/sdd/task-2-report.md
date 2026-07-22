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
