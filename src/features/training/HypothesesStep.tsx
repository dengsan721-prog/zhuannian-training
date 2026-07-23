import { useState, type RefObject } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';

type HypothesesStepProps = {
  scene: PublishedSceneVersion;
  headingRef: RefObject<HTMLHeadingElement | null>;
  disabled: boolean;
  onContinue: (hypothesisIds: string[]) => void;
};

export function HypothesesStep({
  scene,
  headingRef,
  disabled,
  onContinue,
}: HypothesesStepProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  };

  return (
    <section className="training-step">
      <h1 ref={headingRef} tabIndex={-1}>至少保留两种解释</h1>
      <p>不是替谁开脱，而是先让判断接受事实检验。</p>
      <fieldset className="choice-group hypothesis-group">
        <legend>选择至少两种彼此竞争的可能</legend>
        {scene.hypotheses.map((hypothesis) => (
          <label className="choice-row hypothesis-row" key={hypothesis.id}>
            <input
              type="checkbox"
              checked={selected.includes(hypothesis.id)}
              onChange={() => toggle(hypothesis.id)}
            />
            <span>
              <strong>一种需要验证的可能</strong>
              <span>{hypothesis.text}</span>
              <small>可以这样核对：{hypothesis.evidencePrompt}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {scene.riskLevel !== 'stop' && scene.strengthLens?.length ? (
        <aside className="strength-lens">
          <h2>还可能看见的特点或品格种子</h2>
          <p>这些也只是需要观察的可能，不是对人格下结论。</p>
          <ul>
            {scene.strengthLens.map((item) => (
              <li key={item.id}>
                {item.possibility}
                <small> 可核对：{item.evidencePrompt}</small>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      <button
        type="button"
        className="primary-action training-primary"
        disabled={disabled || selected.length < 2}
        onClick={() => onContinue(selected)}
      >
        继续
      </button>
    </section>
  );
}
