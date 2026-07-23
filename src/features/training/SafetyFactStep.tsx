import type { RefObject } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';

type SafetyFactStepProps = {
  scene: PublishedSceneVersion;
  headingRef: RefObject<HTMLHeadingElement | null>;
  disabled: boolean;
  onContinue: () => void;
};

export function SafetyFactStep({
  scene,
  headingRef,
  disabled,
  onContinue,
}: SafetyFactStepProps) {
  return (
    <section className="training-step">
      <h1 ref={headingRef} tabIndex={-1}>先只看发生了什么</h1>
      <p>先不判断动机，只确认能够观察到的事实。</p>
      <div className="training-card">
        <h2>可以确认的事实</h2>
        <ul>
          {scene.observableFacts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      </div>
      <div className="safety-facts">
        <h2>遇到这些情况，请停止普通训练</h2>
        <ul>
          {scene.stopConditions.map((condition) => <li key={condition}>{condition}</li>)}
        </ul>
      </div>
      <button
        type="button"
        className="primary-action training-primary"
        disabled={disabled}
        onClick={onContinue}
      >
        继续
      </button>
    </section>
  );
}
