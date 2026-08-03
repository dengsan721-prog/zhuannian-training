export type HappinessKeyId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type ExperienceDomain =
  | '情感'
  | '家庭'
  | '亲子'
  | '工作'
  | '事业'
  | '社交'
  | '个人成长';

export type ExperienceScreen = 'catalog' | 'thought' | 'angle' | 'result';

export interface ExperienceThought {
  id: string;
  label: string;
  likelyDirection: string;
}

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
  commentExpression: string;
  microAction: string;
  nextSceneCue: string;
  passCriteria: readonly [string, string, string];
}
