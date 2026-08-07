# Apple Style UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the mobile UI to a cleaner Apple-style visual language without changing the onboarding, no-class-code demo, scene, or commenting flows.

**Architecture:** This is a CSS-led refresh. Global design tokens define the Apple-style surface system, and `global.css` applies it to existing shells, cards, buttons, fields, filters, and key feature pages. Component markup changes are allowed only when a selector cannot target an existing element safely.

**Tech Stack:** React 19, React Router, Vite, Vitest, TypeScript, plain CSS.

## Global Constraints

- Do not change the product flow: users still enter from `/join` and can click “无需班级码，直接体验”.
- Do not add a UI framework or new dependency.
- Keep mobile-first width and touch targets; controls remain at least 44px high.
- Keep the current GitHub Pages routing fixes intact.
- Do not commit the existing `package-lock.json` working-tree change unless this task intentionally changes dependencies; this task must not change dependencies.

---

## File Structure

- Modify: `src/styles/tokens.css`
  - Owns design variables: background, surface colors, borders, shadows, radius, spacing, touch target.
- Modify: `src/styles/global.css`
  - Owns visual styling for app shell, surfaces, forms, primary/secondary buttons, scene cards, filters, training cards, commenting page, and responsive refinements.
- Modify: `src/styles/global.test.ts`
  - Adds CSS smoke tests proving the Apple-style tokens and visual selectors exist.

No new runtime components are required. No data files are changed.

---

### Task 1: Add Apple-Style Design Tokens

**Files:**
- Modify: `src/styles/tokens.css`
- Test: `src/styles/global.test.ts`

**Interfaces:**
- Consumes: existing CSS variables such as `--color-bg`, `--color-surface`, `--color-accent`, `--radius`, and `--touch-target`.
- Produces: new variables used by Task 2:
  - `--color-bg-soft: #fbfaf7`
  - `--color-surface-glass: rgba(255, 255, 255, 0.82)`
  - `--color-surface-raised: #ffffff`
  - `--color-accent-soft: #eaf5f1`
  - `--color-gold-soft: #f3dfaa`
  - `--shadow-soft: 0 18px 45px rgba(28, 28, 30, 0.08)`
  - `--shadow-lift: 0 14px 28px rgba(47, 111, 99, 0.14)`
  - `--radius-xl: 28px`
  - `--radius-pill: 999px`
  - `--transition-fast: 160ms ease`

- [ ] **Step 1: Write the failing token smoke test**

Add this assertion to `src/styles/global.test.ts`:

```ts
it('defines the Apple-style visual token layer', () => {
  const css = readFileSync(resolve('src/styles/tokens.css'), 'utf8');

  expect(css).toContain('--color-surface-glass: rgba(255, 255, 255, 0.82)');
  expect(css).toContain('--shadow-soft: 0 18px 45px rgba(28, 28, 30, 0.08)');
  expect(css).toContain('--radius-xl: 28px');
  expect(css).toContain('--radius-pill: 999px');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
$npm='C:\Users\Administrator\AppData\Local\OpenAI\Codex\runtimes\cua_node\fb8898c05a62885e\bin\npm.cmd'
$env:PATH='C:\Users\Administrator\AppData\Local\OpenAI\Codex\runtimes\cua_node\fb8898c05a62885e\bin;' + $env:PATH
& $npm test -- src/styles/global.test.ts
```

Expected: FAIL because the new variables are not yet present.

- [ ] **Step 3: Add the visual tokens**

Update `src/styles/tokens.css` so `:root` includes the existing variables plus the produced variables listed above. Keep `--touch-target: 44px`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& $npm test -- src/styles/global.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/styles/tokens.css src/styles/global.test.ts
git commit -m "style: add apple style design tokens"
```

---

### Task 2: Refresh Global Layout, Cards, Buttons, and Forms

**Files:**
- Modify: `src/styles/global.css`
- Test: `src/styles/global.test.ts`

**Interfaces:**
- Consumes: Task 1 token variables.
- Produces: Apple-style CSS selectors:
  - `body::before` for ambient background glow.
  - `.surface` using `var(--color-surface-glass)`, `backdrop-filter`, and `var(--shadow-soft)`.
  - `.primary-action` using `var(--radius-pill)` and `var(--shadow-lift)`.
  - `.scene-card`, `.training-card`, `.choice-group`, `.commenting-panel`, `.commenting-result-card` using softer borders/radii/shadows.

- [ ] **Step 1: Write the failing visual selector smoke test**

Add this assertion to `src/styles/global.test.ts`:

```ts
it('applies the Apple-style shell, surface, and action treatments', () => {
  const css = readFileSync(resolve('src/styles/global.css'), 'utf8');

  expect(css).toContain('body::before');
  expect(css).toMatch(/\\.surface \\{[^}]*var\\(--color-surface-glass\\)/s);
  expect(css).toMatch(/\\.surface \\{[^}]*backdrop-filter: blur\\(22px\\)/s);
  expect(css).toMatch(/\\.primary-action \\{[^}]*var\\(--radius-pill\\)/s);
  expect(css).toMatch(/\\.primary-action \\{[^}]*var\\(--shadow-lift\\)/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& $npm test -- src/styles/global.test.ts
```

Expected: FAIL because the new visual selectors and declarations are not present.

- [ ] **Step 3: Implement the global visual refresh**

In `src/styles/global.css`, update only style rules, preserving existing class names:

```css
html {
  color-scheme: light;
  background: var(--color-bg);
}

body {
  position: relative;
  min-height: 100vh;
  margin: 0;
  color: var(--color-text);
  background:
    radial-gradient(circle at top left, rgba(243, 223, 170, 0.38), transparent 34rem),
    radial-gradient(circle at 90% 10%, rgba(218, 241, 236, 0.72), transparent 28rem),
    linear-gradient(180deg, var(--color-bg-soft) 0%, var(--color-bg) 100%);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
  line-height: 1.55;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0));
  z-index: -1;
}

.surface {
  background: var(--color-surface-glass);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(22px);
}
```

Also update buttons, inputs, scene cards, filters, and training cards to use the same radii, shadows, and transitions without changing markup or behavior.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& $npm test -- src/styles/global.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/styles/global.css src/styles/global.test.ts
git commit -m "style: refresh global mobile ui"
```

---

### Task 3: Verify Core Screens and Publish

**Files:**
- Verify only: `src/styles/tokens.css`, `src/styles/global.css`, `src/styles/global.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2 visual CSS.
- Produces: a pushed `main` branch and updated GitHub Pages deployment.

- [ ] **Step 1: Run focused style tests**

Run:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=4096'
& $npm test -- --maxWorkers=1 src/styles/global.test.ts src/features/onboarding/JoinCohortPage.test.tsx src/app/router.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run release checks**

Run:

```powershell
& $npm run lint
& $npm run typecheck
& $npm run build:pages
```

Expected: all commands exit 0. Vite chunk-size warnings are acceptable because this task does not change bundling.

- [ ] **Step 3: Inspect staged changes**

Run:

```powershell
git status -sb
git diff -- src/styles/tokens.css src/styles/global.css src/styles/global.test.ts
```

Expected: only CSS/test changes are part of this UI task, with `package-lock.json` still unstaged.

- [ ] **Step 4: Push to GitHub Pages**

Run:

```powershell
git push origin HEAD:main
```

Expected: push succeeds and GitHub Pages deploys.

- [ ] **Step 5: Verify deployed pages**

Check:

```powershell
Invoke-WebRequest -Uri 'https://dengsan721-prog.github.io/zhuannian-training/?v=<commit>#/join' -UseBasicParsing
Invoke-WebRequest -Uri 'https://dengsan721-prog.github.io/zhuannian-training/?v=<commit>#/scenes?demo=1' -UseBasicParsing
Invoke-WebRequest -Uri 'https://dengsan721-prog.github.io/zhuannian-training/?v=<commit>#/commenting' -UseBasicParsing
```

Expected: each request returns HTTP 200 with title `幸福驿站转念训练`.

---

## Self-Review

- Spec coverage: The plan covers tokens, global background, surfaces, buttons, input/forms, scene cards, mobile-first constraints, verification, and publishing.
- Placeholder scan: No `TBD`, `TODO`, or open-ended implementation steps remain.
- Scope check: The plan is one coherent UI refresh and does not include new business flow, backend, leaderboard, or game mechanics.
- Dependency check: The plan adds no dependency and explicitly avoids committing `package-lock.json`.
