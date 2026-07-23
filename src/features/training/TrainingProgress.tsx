import { ordinaryTrainingSteps, type TrainingStep } from '../../domain/training/types';

type TrainingProgressProps = {
  step: TrainingStep;
  heading: string;
};

export function TrainingProgress({ step, heading }: TrainingProgressProps) {
  const position = ordinaryTrainingSteps.indexOf(step) + 1;
  return (
    <p className="training-progress" aria-live="polite">
      第 {position} 步，共 {ordinaryTrainingSteps.length} 步
      <span className="training-progress-announcement">：{heading}</span>
    </p>
  );
}
