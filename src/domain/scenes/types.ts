export type RiskLevel = 'standard' | 'caution' | 'stop';
export type HypothesisKind = 'benevolent' | 'constraint' | 'boundary';
export type EvidenceCheckId =
  | 'recurrence'
  | 'known-facts'
  | 'assumptions'
  | 'danger'
  | 'directly-solvable'
  | 'next-need';

export interface ThoughtOption {
  id: string;
  label: string;
  likelyEmotion: string;
  likelyWords: string;
  likelyAction: string;
  possibleResponse: string;
}

export interface Hypothesis {
  id: string;
  kind: HypothesisKind;
  text: string;
  evidencePrompt: string;
}

export interface StrengthPossibility {
  id: string;
  possibility: string;
  evidencePrompt: string;
}

export interface SafetyRoute {
  heading: string;
  body: string;
  actions: Array<'exit' | 'trusted-support' | 'local-emergency' | 'safety-report'>;
}

export interface SceneVersion {
  schemaVersion: 1;
  sceneCode: string;
  slug: string;
  version: number;
  title: string;
  category: string;
  relationship: 'parent-child' | 'family';
  applicability: string[];
  observableFacts: string[];
  riskLevel: RiskLevel;
  stopConditions: string[];
  thoughtOptions: ThoughtOption[];
  predictionOptions: string[];
  hypotheses: Hypothesis[];
  evidenceChecks: Array<{ id: EvidenceCheckId; prompt: string }>;
  controllabilityQuestion: string | null;
  strengthLens?: StrengthPossibility[];
  boundary: string | null;
  newExpression: string | null;
  microAction: string | null;
  fallbackPlan: string | null;
  safetyRoute: SafetyRoute | null;
  changeSummary: string;
}

export interface PublishedSceneVersion extends SceneVersion {
  id: string;
  sceneId: string;
  status: 'published';
}
