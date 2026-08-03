# Training Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working learner-facing training demo for the first Happiness Station offline module.

**Architecture:** Implement the demo as a local React page in `src/app/App.tsx`, using component-local state and static module content. Keep the existing router untouched except for routes that already render `App`.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library.

## Global Constraints

- No backend or new dependencies.
- Keep the demo focused on one complete training loop.
- Use simple Chinese copy for ordinary adult learners.
- Preserve the course logic: old reaction, new action, 24-hour commitment, three-line feedback.
- Include a safety boundary for high-risk family situations.

---

### Task 1: Learner Training Demo

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: no new external interfaces.
- Produces: `App`, a self-contained learner demo rendered by existing app routes.

- [ ] **Step 1: Write the failing test**

Add a test that renders `App`, clicks module 1, fills the old reaction and three feedback fields, submits the training, and expects the result message "我不是懂了，是做到了".

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because the current `App` does not render the training controls.

- [ ] **Step 3: Write minimal implementation**

Replace the placeholder `App` with a single-page training demo. Add only local state, static module data, and accessible form controls.

- [ ] **Step 4: Run focused verification**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run product verification**

Run: `npm run build`

Expected: PASS.
