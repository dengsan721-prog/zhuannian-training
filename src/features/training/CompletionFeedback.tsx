import type { RefObject } from 'react';
import type { TrainingFeedback } from '../../domain/training/types';

type CompletionFeedbackProps = {
  feedback: TrainingFeedback;
  headingRef: RefObject<HTMLHeadingElement | null>;
};

export function CompletionFeedback({
  feedback,
  headingRef,
}: CompletionFeedbackProps) {
  return (
    <section className="training-step completion-feedback">
      <h1 ref={headingRef} tabIndex={-1}>转念一刻</h1>
      <h2>刚才的第一念 → 可能的情绪/语言/行动/关系回路</h2>
      {feedback.thoughtPath ? (
        <dl className="thought-path">
          <div><dt>第一念</dt><dd>{feedback.thoughtPath.label}</dd></div>
          <div><dt>可能的情绪</dt><dd>{feedback.thoughtPath.likelyEmotion}</dd></div>
          <div><dt>可能说出</dt><dd>{feedback.thoughtPath.likelyWords}</dd></div>
          <div><dt>可能行动</dt><dd>{feedback.thoughtPath.likelyAction}</dd></div>
          <div><dt>关系回路</dt><dd>{feedback.thoughtPath.possibleResponse}</dd></div>
        </dl>
      ) : (
        <p>你选择暂不下结论，因此这里不补写情绪、语言或行动。</p>
      )}
      <p className="insight-line">
        事实没有改变，但我多了两种解释和一个可控动作
      </p>
      <section aria-labelledby="selected-hypotheses">
        <h2 id="selected-hypotheses">我愿意继续核对的可能</h2>
        <ul>
          {feedback.hypotheses.map((hypothesis) => (
            <li key={hypothesis.id}>{hypothesis.text}</li>
          ))}
        </ul>
      </section>
      <dl className="action-plan">
        <div><dt>边界</dt><dd>{feedback.boundary}</dd></div>
        <div><dt>新的表达</dt><dd>{feedback.newExpression}</dd></div>
        <div><dt>微行动</dt><dd>{feedback.microAction}</dd></div>
        <div><dt>备用计划</dt><dd>{feedback.fallbackPlan}</dd></div>
      </dl>
    </section>
  );
}
