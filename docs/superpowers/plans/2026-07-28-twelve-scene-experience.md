# Twelve-Scene Reframe Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-class-code, mobile-first four-screen experience containing 12 classic reframe scenes and all 12 Happiness Keys without changing the existing formal six-step training runtime.

**Architecture:** Add a self-contained `features/experience` vertical slice with static, typed scene content and component-local progress. When `zhuannian:demo-mode` is active, `/scenes` renders this experience instead of the repository-backed formal scene catalog; signed-in/formal behavior stays unchanged.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vitest 4, Testing Library, plain CSS.

## Global Constraints

- Ordinary completion uses exactly four visible screens: scene catalog, first thought, angle choice, result.
- The mandatory path uses at most three selections after opening `/scenes`.
- No text input, account, phone number, class code, backend call, local storage, session persistence, or new dependency.
- Publish exactly 12 scenes and map primary key IDs exactly once across `1` through `12`.
- Each scene exposes exactly three realistic first-thought choices and one primary Happiness Key.
- Every positive interpretation uses conditional language and stays tied to an observable fact.
- Every result includes a boundary; understanding never cancels safety, respect, or a reasonable rule.
- The danger exit remains visible on training screens and routes to `/support`.
- Experience progress is private, session-local component state only; there is no personal ranking or streak penalty.
- Copy style is approximately 70% warm/powerful, 20% vivid, and 10% light; do not invent motives or facts.
- Do not change the existing formal training reducer, repositories, database schema, support flow, or `src/app/App.tsx` training demo.

---

## File Structure

- Create `src/features/experience/types.ts`: experience-only types and the four screen names.
- Create `src/features/experience/happinessScenes.ts`: the 12 approved authored scenes.
- Create `src/features/experience/happinessScenes.test.ts`: content-contract tests.
- Create `src/features/experience/ReframeExperiencePage.tsx`: four-screen interaction and private in-memory progress.
- Create `src/features/experience/ReframeExperiencePage.test.tsx`: interaction, safety, reset, and progress tests.
- Create `src/features/experience/experience.css`: compact mobile-first visual system for this slice.
- Modify `src/app/router.tsx`: render `ReframeExperiencePage` at `/scenes` only when demo mode is active.
- Modify `src/app/router.test.tsx`: verify the no-class-code path renders all 12 scenes without repository access.

### Task 1: Typed Twelve-Scene Content Contract

**Files:**
- Create: `src/features/experience/types.ts`
- Create: `src/features/experience/happinessScenes.ts`
- Create: `src/features/experience/happinessScenes.test.ts`

**Interfaces:**
- Produces:
  - `type HappinessKeyId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12`
  - `type ExperienceDomain = '情感' | '家庭' | '亲子' | '工作' | '事业' | '社交' | '个人成长'`
  - `interface ExperienceThought { id: string; label: string; likelyDirection: string }`
  - `interface ExperienceScene`
  - `const happinessScenes: readonly ExperienceScene[]`
- `ExperienceScene` fields:

```ts
export interface ExperienceScene {
  id: string;
  title: string;
  domain: ExperienceDomain;
  observableFact: string;
  primaryKey: { id: HappinessKeyId; title: string };
  firstThoughts: readonly [
    ExperienceThought,
    ExperienceThought,
    ExperienceThought,
  ];
  acknowledgement: string;
  strengthView: string;
  evidencePrompt: string;
  boundary: string;
  newThought: string;
  newExpression: string;
  microAction: string;
  nextSceneCue: string;
  passCriteria: readonly [string, string, string];
}
```

- [ ] **Step 1: Write the failing content-contract tests**

Create tests with these exact assertions:

```ts
import { describe, expect, it } from 'vitest';
import { happinessScenes } from './happinessScenes';

describe('happinessScenes', () => {
  it('publishes 12 unique classic scenes and every Happiness Key once', () => {
    expect(happinessScenes).toHaveLength(12);
    expect(new Set(happinessScenes.map((scene) => scene.id)).size).toBe(12);
    expect(happinessScenes.map((scene) => scene.primaryKey.id).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('keeps every scene concrete, bounded and immediately actionable', () => {
    for (const scene of happinessScenes) {
      expect(scene.firstThoughts).toHaveLength(3);
      expect(new Set(scene.firstThoughts.map((thought) => thought.id)).size).toBe(3);
      expect(scene.firstThoughts.every((thought) => thought.likelyDirection.length >= 12))
        .toBe(true);
      expect(scene.observableFact.length).toBeGreaterThanOrEqual(12);
      expect(scene.strengthView).toMatch(/也许|可能|或许|可以先/);
      expect(scene.evidencePrompt.length).toBeGreaterThanOrEqual(10);
      expect(scene.boundary.length).toBeGreaterThanOrEqual(10);
      expect(scene.newThought.length).toBeGreaterThanOrEqual(16);
      expect(scene.newExpression.length).toBeGreaterThanOrEqual(12);
      expect(scene.microAction.length).toBeGreaterThanOrEqual(8);
      expect(scene.nextSceneCue.length).toBeGreaterThanOrEqual(8);
      expect(scene.passCriteria).toHaveLength(3);
      expect(scene.passCriteria.every((criterion) => criterion.length >= 8))
        .toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the content test and verify it fails**

Run:

```bash
npm test -- src/features/experience/happinessScenes.test.ts
```

Expected: FAIL because the content module does not exist.

- [ ] **Step 3: Add the exact experience types**

Create `types.ts` with the interfaces above. Keep them local to the experience slice; do not widen `domain/scenes/types.ts`.

- [ ] **Step 4: Author all 12 scene objects**

Use the approved content specification in `docs/superpowers/specs/2026-07-28-twelve-happiness-keys-design.md`, section 4. The exact scene-to-key mapping is:

| Key | Scene title | Domain |
|---:|---|---|
| 1 | 伴侣没送贵重礼物，却做了饭 | 情感 |
| 2 | 朋友升职买房发朋友圈 | 社交 |
| 3 | 伴侣两个小时没有回复消息 | 情感 |
| 4 | 我为家里做了很多，却没人感谢 | 家庭 |
| 5 | 求职或创业连续碰壁 | 事业 |
| 6 | 父母反复叮嘱让我心烦 | 家庭 |
| 7 | 总想等成功以后再幸福 | 个人成长 |
| 8 | 同事或伴侣对我态度冷淡 | 工作 |
| 9 | 同类冲突反复发生 | 个人成长 |
| 10 | 孩子考试没有考好 | 亲子 |
| 11 | 陌生人提供微小帮助 | 社交 |
| 12 | 没升职、没被认可 | 事业 |

For every object:

- `observableFact` repeats only the approved observable behavior;
- all three `firstThoughts` sound like natural inner speech, not theory labels;
- `acknowledgement` first validates the feeling without declaring the thought true;
- `strengthView` contains conditional language;
- `evidencePrompt` asks what fact would support or weaken the new interpretation;
- `boundary` states what still cannot be ignored;
- `newThought` is one vivid but non-absolute reframe;
- `newExpression` is immediately speakable;
- `microAction` starts within ten minutes.
- `nextSceneCue` names the next real-life trigger instead of a vague future time;
- `passCriteria` contains exactly three observable checks and never uses
  “理解了”“想通了” or another internal state as proof.

Use this fully authored key-10 object as the implementation standard:

```ts
{
  id: 'child-exam-setback',
  title: '孩子考试没有考好',
  domain: '亲子',
  observableFact: '这次分数不理想；孩子拿到试卷后，主动标记并订正了错题。',
  primaryKey: { id: 10, title: '幸福是打开智慧之门的钥匙' },
  firstThoughts: [
    {
      id: 'lazy',
      label: '他就是不努力，说多少遍都没用',
      likelyDirection: '把一次成绩直接解释为不努力，着急很容易变成指责，孩子会更想躲开问题。',
    },
    {
      id: 'future',
      label: '这次都考不好，以后怎么办',
      likelyDirection: '把一次失利推演成整个未来，焦虑会压过眼前真正可以补上的知识点。',
    },
    {
      id: 'shame',
      label: '别人家的孩子都比他省心',
      likelyDirection: '用别人家的孩子作参照，容易让比较代替沟通，也削弱孩子继续尝试的勇气。',
    },
  ],
  acknowledgement: '看到分数不理想，你着急，是因为你在乎孩子的未来。',
  strengthView: '主动标记并订正错题，也许说明他没有躲开问题，愿意重新弄懂。',
  evidencePrompt: '他是否真的完成了订正，并能说出至少一道错题卡在哪里？',
  boundary: '看见订正的力量，不等于忽略学习习惯和仍需解决的知识漏洞。',
  newThought: '一次分数只能暴露这次学习中的问题，不能替孩子的一生下结论；这张卷子没替他说好话，但他没有躲开它。',
  newExpression: '这次分数不理想，但我看见你在主动订正。我们先把最容易补上的那一题弄懂。',
  microAction: '先只问一道题：“你最想先弄懂哪一道？”然后听完再给建议。',
  nextSceneCue: '下一次孩子带回一张分数不理想的试卷时。',
  passCriteria: [
    '先说出一个试卷上真实可见的成长动作。',
    '只问一道孩子愿意先处理的错题。',
    '听完回答前，不比较、不追加第二个要求。',
  ],
}
```

- [ ] **Step 5: Run the content tests and verify they pass**

Run:

```bash
npm test -- src/features/experience/happinessScenes.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit only the new content files**

```bash
git add src/features/experience/types.ts src/features/experience/happinessScenes.ts src/features/experience/happinessScenes.test.ts
git commit -m "feat: add twelve reframe experience scenes"
```

### Task 2: Four-Screen Experience and Private Key Lighting

**Files:**
- Create: `src/features/experience/ReframeExperiencePage.tsx`
- Create: `src/features/experience/ReframeExperiencePage.test.tsx`

**Interfaces:**
- Consumes: `happinessScenes` and `ExperienceScene`.
- Produces: `export function ReframeExperiencePage()`.
- Screen state: `'catalog' | 'thought' | 'angle' | 'result'`.
- Local state: selected scene, selected thought, selected angle, and `Set<HappinessKeyId>` for keys completed during the current mount.

- [ ] **Step 1: Write the failing four-screen interaction test**

```tsx
it('completes one reframe in four screens and lights one private key', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ReframeExperiencePage /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: '今天，先转一个念头' }))
    .toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^选择场景：/ })).toHaveLength(12);

  await user.click(screen.getByRole('button', {
    name: '选择场景：孩子考试没有考好',
  }));
  expect(screen.getByRole('heading', { name: '你的第一念是什么？' }))
    .toBeInTheDocument();

  await user.click(screen.getByRole('button', {
    name: '他就是不努力，说多少遍都没用',
  }));
  expect(screen.getByRole('heading', { name: '换一个角度' }))
    .toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '先看见隐藏的力量' }));
  expect(screen.getByRole('heading', { name: '转念一刻' })).toBeInTheDocument();
  expect(screen.getByText(/这张卷子没替他说好话/)).toBeInTheDocument();
  expect(screen.getByText('下一次孩子带回一张分数不理想的试卷时。'))
    .toBeInTheDocument();
  expect(screen.getByText(/我们先把最容易补上的那一题弄懂/))
    .toBeInTheDocument();
  expect(screen.getByText('已点亮 1 / 12 个幸福密码')).toBeInTheDocument();
});
```

- [ ] **Step 2: Write safety and reset tests**

Add tests that:

- assert a link named `这里存在伤害或危险` points to `/support` on thought, angle, and result screens;
- click `换一个场景` and verify the catalog returns while `已点亮 1 / 12` remains;
- repeat the same scene and verify the count stays `1 / 12`;
- click `再练一次` and verify the same scene returns to the first-thought screen.
- complete three different scenes and verify the private milestone message
  `你已经开始看见第一念之外的可能` appears exactly when the third unique key is lit.

- [ ] **Step 3: Run the page tests and verify they fail**

Run:

```bash
npm test -- src/features/experience/ReframeExperiencePage.test.tsx
```

Expected: FAIL because the page does not exist.

- [ ] **Step 4: Implement the minimal four-screen state machine**

Implementation rules:

- catalog shows one short intro, private `已点亮 X / 12`, seven domain filter chips, and the 12 scene buttons;
- selecting a scene sets `screen = 'thought'`;
- selecting a thought sets `screen = 'angle'`;
- angle screen shows the observable fact, the acknowledgement, and exactly two buttons:
  - `先看见隐藏的力量`
  - `先守住事实和边界`
- either angle selection sets `screen = 'result'` and adds the primary key ID to the local `Set`;
- result prominently shows `newThought`, `newExpression`, and `microAction`;
- result also names the selected first thought and its authored `likelyDirection`, so the user can see the old path without being shamed;
- a native `<details>` titled `为什么这样转？` contains `strengthView`, `evidencePrompt`, and `boundary`;
- a compact `今晚行动约定` always contains three labeled lines:
  - `下一次场景` → `nextSceneCue`
  - `要说的一句话` → `newExpression`
  - `只做一个动作` → `microAction`
- a native `<details>` titled `我怎样知道自己练到了？` contains all three `passCriteria`;
- a native `<details>` titled `今晚只观察三件事` contains the read-only prompts
  `我做了什么`、`对方如何回应`、`和以前有什么不同`; it contains no text box and does not block completion;
- when the completed-key count first reaches `3`, `6`, or `12`, show one private observation card:
  - 3: `你已经开始看见第一念之外的可能`
  - 6: `你正在把转念变成一种稳定能力`
  - 12: `12个幸福密码全部点亮`
- `换一个场景` returns to catalog and keeps the local key set;
- `再练一次` returns to thought for the same scene;
- use a heading ref and `useEffect` to focus the new screen heading after transitions;
- render the danger link on thought, angle, and result screens.

- [ ] **Step 5: Run the page tests and verify they pass**

Run:

```bash
npm test -- src/features/experience/ReframeExperiencePage.test.tsx
```

Expected: all experience page tests PASS.

- [ ] **Step 6: Commit only the new page files**

```bash
git add src/features/experience/ReframeExperiencePage.tsx src/features/experience/ReframeExperiencePage.test.tsx
git commit -m "feat: add four-screen reframe experience"
```

### Task 3: Route the No-Class-Code Entry to the Experience

**Files:**
- Modify: `src/app/router.tsx`
- Modify: `src/app/router.test.tsx`

**Interfaces:**
- Consumes: `ReframeExperiencePage`.
- Preserves: formal `/scenes` repository catalog when demo mode is not active.

- [ ] **Step 1: Replace the existing demo route assertion with a failing route test**

In the `no-class-code demo` suite, replace the one-scene expectation with:

```tsx
it('loads the twelve-scene experience without opening the formal catalog', () => {
  sessionStorage.setItem('zhuannian:demo-mode', '1');
  renderRoute('/scenes');

  expect(screen.getByRole('heading', { name: '今天，先转一个念头' }))
    .toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^选择场景：/ })).toHaveLength(12);
  expect(screen.queryByRole('heading', { name: '说好十分钟，却一拖再拖' }))
    .not.toBeInTheDocument();
});
```

Adapt the call to the existing `renderRoute` helper signature rather than changing unrelated tests.

- [ ] **Step 2: Run the focused router test and verify it fails**

Run:

```bash
npm test -- src/app/router.test.tsx
```

Expected: FAIL because demo `/scenes` still renders the repository-backed catalog.

- [ ] **Step 3: Add the demo-only route branch**

Import `ReframeExperiencePage` and change only the `/scenes` route element:

```tsx
<Route
  path="/scenes"
  element={demoMode
    ? <ReframeExperiencePage />
    : (
      <SceneHomeRoute
        sceneRepository={activeSceneRepository}
        progressRepository={activeProgressRepository}
      />
    )}
/>
```

Do not remove `demoEnvironment`; other existing tests and manual routes may still rely on it.

- [ ] **Step 4: Run onboarding and router tests**

Run:

```bash
npm test -- src/features/onboarding/JoinCohortPage.test.tsx src/app/router.test.tsx
```

Expected: all tests PASS and the existing no-class-code link remains `/scenes`.

- [ ] **Step 5: Commit only the route integration hunks**

The worktree already contains unrelated edits. Stage only the new import, route branch, and matching test hunk; do not stage other existing modifications.

```bash
git diff -- src/app/router.tsx src/app/router.test.tsx
git add -p src/app/router.tsx src/app/router.test.tsx
git commit -m "feat: route demo users to reframe experience"
```

### Task 4: Compact Mobile Visual Design and Full Verification

**Files:**
- Create: `src/features/experience/experience.css`
- Modify: `src/features/experience/ReframeExperiencePage.tsx`

**Interfaces:**
- `ReframeExperiencePage.tsx` imports `./experience.css`.
- No global token or global layout changes.

- [ ] **Step 1: Add stable semantic class names**

Use:

- `experience-shell`
- `experience-hero`
- `experience-progress`
- `experience-filters`
- `experience-grid`
- `experience-card`
- `experience-step`
- `experience-fact`
- `experience-choice`
- `experience-result`
- `experience-key`
- `experience-actions`
- `experience-safety-link`

- [ ] **Step 2: Implement the compact mobile-first stylesheet**

Exact visual constraints:

- shell width: `min(100%, 520px)`;
- page padding: `12px`;
- card radius: `20px`;
- card spacing: `10px` to `12px`;
- body copy line-height: `1.55`;
- choice buttons: full width and minimum height `52px`;
- primary result uses the existing green accent and a soft `#eef5f2` background;
- catalog cards use two columns above `420px` and one column at or below `420px`;
- no horizontal scrolling at `320px`;
- filter chips wrap instead of scrolling;
- no animation required; if a reveal transition is added, disable it under `prefers-reduced-motion`.

- [ ] **Step 3: Run focused component tests**

Run:

```bash
npm test -- src/features/experience/happinessScenes.test.ts src/features/experience/ReframeExperiencePage.test.tsx src/app/router.test.tsx src/features/onboarding/JoinCohortPage.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 4: Run full static and product verification**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 5: Run a mobile browser smoke test**

Start the existing Vite preview, open `/join` at a `390 × 844` viewport, click `无需班级码，直接体验`, and verify:

1. all 12 scenes are reachable;
2. the key-10 path completes in three selections;
3. the result shows new thought, speakable sentence, micro-action, and boundary details;
4. the result action agreement contains one next scene, one sentence, and one action;
5. the three pass criteria are observable behaviors;
6. the danger link remains visible;
7. there is no horizontal scroll;
8. reloading does not preserve private experience selections.

- [ ] **Step 6: Review the final diff before any commit**

```bash
git diff --check
git status --short
```

Confirm that no unrelated files from the dirty worktree are staged.
