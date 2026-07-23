import { useState, type RefObject } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';

type RelationshipForkStepProps = {
  scene: PublishedSceneVersion;
  headingRef: RefObject<HTMLHeadingElement | null>;
  disabled: boolean;
  onContinue: (response: string) => void;
};

export function RelationshipForkStep({
  scene,
  headingRef,
  disabled,
  onContinue,
}: RelationshipForkStepProps) {
  const [response, setResponse] = useState('');
  return (
    <section className="training-step">
      <h1 ref={headingRef} tabIndex={-1}>这条关系回路可能怎样继续？</h1>
      <p>这只是可能出现的互动方向，不代表一定会发生。</p>
      <fieldset className="choice-group">
        <legend>对方接下来可能有什么反应？</legend>
        {scene.predictionOptions.map((option) => (
          <label className="choice-row" key={option}>
            <input
              type="radio"
              name="relationship-response"
              value={option}
              checked={response === option}
              onChange={() => setResponse(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="primary-action training-primary"
        disabled={disabled || !response}
        onClick={() => response && onContinue(response)}
      >
        继续
      </button>
    </section>
  );
}
