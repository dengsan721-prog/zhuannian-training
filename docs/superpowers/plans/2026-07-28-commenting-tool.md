# Commenting Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent "学会说话，矛盾自化" commenting tool page that generates three copy-ready praise/comment variants from one concrete observed behavior.

**Architecture:** Add a focused domain generator under `src/domain/commenting` and a single React page under `src/features/commenting`. Wire the page as an independent route so the existing 转念训练 reducer, session flow, Supabase repositories, and completion flow remain untouched.

**Tech Stack:** React 19, React Router 7, TypeScript, Vitest, Testing Library, existing global CSS tokens.

## Global Constraints

- The tool is independent from the 转念训练 entry and may later be linked from it.
- Do not add backend calls, persistence, authentication, phone number, class code, or long background fields.
- Input relationship types are exactly `家人 / 亲近的人 / 同事 / 陌生人 / 朋友圈`.
- The main textarea label is exactly `你看见他做了什么、说了什么？`.
- The main action label is exactly `生成三种点评`.
- Generate exactly three result cards: `温暖真诚`, `生动有画面`, and `简洁有力量`.
- Each result card offers only `复制` and `换一句`.
- Every generated comment must reuse the user's observable input and avoid inventing missing time, behavior, language, motive, or result.
- If the input is too vague, show exactly `再给我一个小细节吧：他具体做了什么，或说了哪句话？`.
- Do not force positive reframing for harm, control, injustice, violence, or safety risk.

---

### Task 1: Local Comment Generator

**Files:**
- Create: `src/domain/commenting/types.ts`
- Create: `src/domain/commenting/generateComments.ts`
- Create: `src/domain/commenting/generateComments.test.ts`

**Interfaces:**
- Consumes: no existing application interfaces.
- Produces:
  - `type CommentRelationshipType = 'family' | 'close' | 'colleague' | 'stranger' | 'social'`
  - `type CommentStyle = 'warm' | 'vivid' | 'concise'`
  - `type GeneratedCommentCard = { style: CommentStyle; title: string; text: string }`
  - `type CommentGenerationResult = { status: 'needs-detail'; message: string } | { status: 'ready'; cards: GeneratedCommentCard[] }`
  - `function generateComments(input: { relationshipType: CommentRelationshipType; observation: string; variantSeed?: number }): CommentGenerationResult`

- [ ] **Step 1: Write the failing tests**

Add generator tests for vague input, concrete evidence reuse, safety-risk refusal, and variant rotation.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.superpowers\bin\npm.cmd test -- src/domain/commenting/generateComments.test.ts`

Expected: FAIL because `generateComments` does not exist.

- [ ] **Step 3: Create types**

Create `src/domain/commenting/types.ts` with the exported types listed in this task's Interfaces.

- [ ] **Step 4: Implement minimal generator**

Create `src/domain/commenting/generateComments.ts` to normalize observation text, reject vague or safety-risk input, choose relationship wording, generate the three required cards, and rotate variants with `variantSeed`.

- [ ] **Step 5: Run focused tests**

Run: `.\.superpowers\bin\npm.cmd test -- src/domain/commenting/generateComments.test.ts`

Expected: PASS.

---

### Task 2: Independent Commenting Page and Route

**Files:**
- Create: `src/features/commenting/CommentingPage.tsx`
- Create: `src/features/commenting/CommentingPage.test.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/router.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `generateComments(input)` and `CommentRelationshipType` from Task 1.
- Produces: route `/commenting`, rendering the independent commenting tool with no training session dependencies.

- [ ] **Step 1: Write failing page tests**

Add page tests covering concrete generation, vague input alert, per-card `换一句`, and clipboard copy feedback.

- [ ] **Step 2: Write failing route test**

Append a route test that renders `/commenting` and expects heading `学会说话，矛盾自化` plus textarea label `你看见他做了什么、说了什么？`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `.\.superpowers\bin\npm.cmd test -- src/features/commenting/CommentingPage.test.tsx src/app/router.test.tsx`

Expected: FAIL because `CommentingPage` and `/commenting` do not exist.

- [ ] **Step 4: Implement the page**

Create `src/features/commenting/CommentingPage.tsx` with relationship radios, textarea, submit button, generated cards, copy buttons, replace buttons, `role="status"` copy feedback, and `role="alert"` prompts.

- [ ] **Step 5: Wire the route**

Import `CommentingPage` in `src/app/router.tsx` and add `<Route path="/commenting" element={<CommentingPage />} />` before catch-all app routes.

- [ ] **Step 6: Add minimal styles**

Append focused `.commenting-*` CSS to `src/styles/global.css`, using existing tokens and keeping cards at 8px border radius.

- [ ] **Step 7: Run focused tests**

Run: `.\.superpowers\bin\npm.cmd test -- src/domain/commenting/generateComments.test.ts src/features/commenting/CommentingPage.test.tsx src/app/router.test.tsx`

Expected: PASS.

- [ ] **Step 8: Run product verification**

Run: `.\.superpowers\bin\npm.cmd run build`

Expected: PASS.
