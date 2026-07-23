export type ReviewObservation =
  | 'helpful'
  | 'no_change'
  | 'not_tried'
  | 'needs_support';

export type ReviewInput = {
  completionId: string;
  attempted: boolean;
  observation: ReviewObservation;
  hypothesisResult: 'supported' | 'unsupported' | 'uncertain';
  nextDirection: 'repeat' | 'adjust' | 'boundary' | 'seek_help';
  idempotencyKey: string;
};

export type SetSavedInput = {
  sceneVersionId: string;
  kind: 'reframe' | 'expression';
  saved: boolean;
};

export type CompletionResult = {
  completionId: string;
  awarded: boolean;
  pointsDelta: 0 | 10;
};

export type ReviewResult = {
  reviewId: string;
  awarded: boolean;
  pointsDelta: 0 | 5;
};

export type SavedInsightRoute =
  | 'available'
  | 'content-update'
  | 'safety-stop';

export type SavedInsightSummary = {
  sceneVersionId: string;
  kind: 'reframe' | 'expression';
  savedAt: string;
  route: SavedInsightRoute;
};

export type ReviewPrompt = {
  completionId: string;
  sceneVersionId: string;
  completedAt: string;
};

export type MilestoneBadge = {
  key: 'first-scene' | 'five-scenes' | 'ten-reviews';
  label: string;
  awardedAt: string;
};

export type UnlockedSurprise =
  | {
    key: 'five-scene-observation-card';
    label: '隐藏观察卡';
  }
  | {
    key: 'ten-review-family-lens';
    label: '家庭关系多面镜';
  };

export type ClassAggregate = {
  completedScenes: number;
  activeMembers: number;
  collectiveGoal: number;
  goalReached: boolean;
};

export type PrivateProgress = {
  points: number;
  completedScenes: number;
  reviewsCompleted: number;
  thisWeekCompletions: number;
  badges: MilestoneBadge[];
  unlockedSurprises: UnlockedSurprise[];
  classAggregate: ClassAggregate | null;
};
