export type TrainingRuntimeRoute =
  | 'continue'
  | 'content-update'
  | 'safety-stop';

export interface TrainingRuntimeRepository {
  startTraining(
    sceneVersionId: string,
    requestId: string,
  ): Promise<{
    sessionId: string;
    route: TrainingRuntimeRoute;
  }>;
  checkTrainingSession(sessionId: string): Promise<TrainingRuntimeRoute>;
}
