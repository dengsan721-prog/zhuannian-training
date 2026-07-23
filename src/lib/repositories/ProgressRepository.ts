import type {
  CompletionResult,
  PrivateProgress,
  ReviewInput,
  ReviewPrompt,
  ReviewResult,
  SavedInsightSummary,
  SetSavedInput,
} from '../../domain/progress/types';
import type { CompletionCommand } from '../../domain/training/types';

export interface ProgressRepository {
  complete(command: CompletionCommand): Promise<CompletionResult>;
  saveReview(input: ReviewInput): Promise<ReviewResult>;
  setSaved(input: SetSavedInput): Promise<boolean>;
  listSaved(): Promise<SavedInsightSummary[]>;
  getPendingReview(): Promise<ReviewPrompt | null>;
  getPrivateProgress(): Promise<PrivateProgress>;
}
