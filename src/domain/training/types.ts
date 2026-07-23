import type {
  Hypothesis,
  PublishedSceneVersion,
  ThoughtOption,
} from '../scenes/types';

export const ordinaryTrainingSteps = [
  'safety-fact',
  'first-thought',
  'relationship-fork',
  'hypotheses',
  'evidence-boundary',
  'expression-action',
] as const;

export type TrainingStep = typeof ordinaryTrainingSteps[number];

export type SafetySignalCode =
  | 'physical_or_sexual_violence'
  | 'serious_threat'
  | 'coercive_control'
  | 'child_abuse_or_exploitation'
  | 'self_harm_or_suicide'
  | 'bullying_or_retaliation'
  | 'medical_emergency'
  | 'user_declared_danger';

export type FirstThoughtSelection =
  | { kind: 'option'; optionId: string }
  | { kind: 'uncertain' }
  | { kind: 'multiple' }
  | { kind: 'none' };

export interface EvidenceSelection {
  recurrence: 'once' | 'repeated' | 'unknown';
  knownFacts: 'clear' | 'partial' | 'none-yet';
  assumptions: 'present' | 'none-known' | 'uncertain';
  danger: 'none-known' | 'uncertain' | 'present';
  directlySolvable: 'yes' | 'partly' | 'no' | 'unknown';
  nextNeed: 'stabilize' | 'verify' | 'solve' | 'boundary' | 'help';
}

export interface TrainingDraft {
  schemaVersion: 1;
  sessionId: string;
  userId: string;
  completionEventId: string;
  scene: PublishedSceneVersion;
  step: TrainingStep;
  status: 'active' | 'paused' | 'safety-stop' | 'completed';
  firstThought?: FirstThoughtSelection;
  predictedResponse?: string;
  selectedHypothesisIds: string[];
  evidence?: EvidenceSelection;
  expressionAccepted: boolean;
  safetySignalCode?: SafetySignalCode;
  updatedAt: string;
  expiresAt: string;
}

type TimedAction = { at: string };

export type TrainingAction =
  | ({ type: 'report-danger'; signalCode: SafetySignalCode } & TimedAction)
  | ({ type: 'pause' } & TimedAction)
  | ({ type: 'resume' } & TimedAction)
  | ({ type: 'confirm-safe-facts' } & TimedAction)
  | ({ type: 'choose-first-thought'; value: FirstThoughtSelection } & TimedAction)
  | ({ type: 'choose-prediction'; response: string } & TimedAction)
  | ({ type: 'choose-hypotheses'; hypothesisIds: string[] } & TimedAction)
  | ({ type: 'confirm-evidence'; value: EvidenceSelection } & TimedAction)
  | ({ type: 'accept-expression-action' } & TimedAction);

export interface CompletionCommand {
  eventId: string;
  sessionId: string;
  sceneId: string;
  sceneVersionId: string;
  completedAt: string;
}

export interface TrainingFeedback {
  thoughtPath: ThoughtOption | null;
  hypotheses: Hypothesis[];
  boundary: string;
  newExpression: string;
  microAction: string;
  fallbackPlan: string;
}

export const routeSafetySignal = (signalCode: SafetySignalCode) => {
  void signalCode;
  return 'safety-stop' as const;
};
