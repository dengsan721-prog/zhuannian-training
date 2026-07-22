import type { PublishedSceneVersion, SceneVersion } from '../../domain/scenes/types';

export const validScene: SceneVersion = {
  schemaVersion: 1,
  sceneCode: 'PC-003',
  slug: 'phone-time-overrun',
  version: 1,
  title: '说好十分钟，却一拖再拖',
  category: '手机与家庭规则',
  relationship: 'parent-child',
  applicability: ['小学高年级至高中', '双方已经约定使用时长'],
  observableFacts: ['孩子答应十分钟后放下手机', '十分钟后仍在使用并关上房门'],
  riskLevel: 'standard',
  stopConditions: ['身体暴力', '严重威胁', '持续控制', '自伤风险'],
  thoughtOptions: [
    { id: 'disrespect', label: '他根本没把我的话当回事', likelyEmotion: '愤怒', likelyWords: '你说话从来不算数', likelyAction: '立即夺走手机', possibleResponse: '孩子可能争抢或躲开' },
    { id: 'ungrateful', label: '他一点都不理解我的辛苦', likelyEmotion: '委屈', likelyWords: '我做这一切都是为了谁', likelyAction: '逐一翻旧账', possibleResponse: '孩子可能防御或沉默' },
    { id: 'loss-control', label: '我已经管不住他了', likelyEmotion: '焦虑', likelyWords: '再这样下去你就完了', likelyAction: '升级惩罚', possibleResponse: '孩子可能隐藏使用行为' },
  ],
  predictionOptions: ['争辩或反抗', '沉默并躲开', '暂时服从但以后隐瞒'],
  hypotheses: [
    { id: 'need-autonomy', kind: 'benevolent', text: '他也许在保护一天里少有的自主时间，需要通过询问确认。', evidencePrompt: '他是否在被频繁催促后更难停下？' },
    { id: 'transition-skill', kind: 'constraint', text: '他可能缺少从娱乐切换到任务的能力，而不只是故意违约。', evidencePrompt: '提前提醒和共同设定结束动作是否有帮助？' },
    { id: 'rule-boundary', kind: 'boundary', text: '反复违背共同约定仍需要清楚、稳定且可执行的规则。', evidencePrompt: '规则是否提前讲清并由双方确认？' },
  ],
  evidenceChecks: [
    { id: 'recurrence', prompt: '这是一次还是反复发生？' },
    { id: 'known-facts', prompt: '我能确定的事实有哪些？' },
    { id: 'assumptions', prompt: '哪些只是我的推测？' },
    { id: 'danger', prompt: '是否存在威胁、控制或伤害？' },
    { id: 'directly-solvable', prompt: '这件事能否直接沟通或解决？' },
    { id: 'next-need', prompt: '我需要先稳定、确认、解决、设界限还是求助？' },
  ],
  controllabilityQuestion: '下一步我能控制的是表达、规则、暂缓还是求助中的哪一项？',
  strengthLens: [
    {
      id: 'autonomy-signal',
      possibility: '这也许体现了正在发展的自主意识。',
      evidencePrompt: '他是否也能在其他情境中表达并承担选择？',
    },
    {
      id: 'focus-signal',
      possibility: '这种投入或许提示他具备持续专注的种子。',
      evidencePrompt: '这种专注是否也会出现在学习、运动或创作中？',
    },
  ],
  boundary: '理解自主需要不等于允许无限使用，也不取消共同确认的规则。',
  newExpression: '我看见你还没准备停下来。我们先确认时间和约定，再一起决定怎样收尾。',
  microAction: '给出一次明确提醒，让孩子从两个可接受的结束方式中选择。',
  fallbackPlan: '若冲突升级，停止争抢，等双方稳定后执行预先约定的后果。',
  safetyRoute: null,
  changeSummary: '首发版本',
};

export const validPublishedScene: PublishedSceneVersion = {
  ...validScene,
  id: '10000000-0000-0000-0000-000000000001',
  sceneId: '20000000-0000-0000-0000-000000000001',
  status: 'published',
};
