import type { RefObject } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';

type ExpressionActionStepProps = {
  scene: PublishedSceneVersion;
  headingRef: RefObject<HTMLHeadingElement | null>;
  disabled: boolean;
  onComplete: () => void;
};

export function ExpressionActionStep({
  scene,
  headingRef,
  disabled,
  onComplete,
}: ExpressionActionStepProps) {
  return (
    <section className="training-step">
      <h1 ref={headingRef} tabIndex={-1}>把转念落到一个可控动作</h1>
      <dl className="action-plan">
        <div>
          <dt>边界</dt>
          <dd>{scene.boundary}</dd>
        </div>
        <div>
          <dt>可以这样表达</dt>
          <dd>{scene.newExpression}</dd>
        </div>
        <div>
          <dt>一个微行动</dt>
          <dd>{scene.microAction}</dd>
        </div>
        <div>
          <dt>如果没有按计划发展</dt>
          <dd>{scene.fallbackPlan}</dd>
        </div>
      </dl>
      <p>完成练习不等于承诺结果，也不要求你立即行动。</p>
      <button
        type="button"
        className="primary-action training-primary"
        disabled={disabled}
        onClick={onComplete}
      >
        完成这次练习
      </button>
    </section>
  );
}
