import { useState, type RefObject } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import type { FirstThoughtSelection } from '../../domain/training/types';

type FirstThoughtStepProps = {
  scene: PublishedSceneVersion;
  headingRef: RefObject<HTMLHeadingElement | null>;
  disabled: boolean;
  onContinue: (value: FirstThoughtSelection) => void;
  onPause: () => void;
};

type Choice = {
  value: string;
  label: string;
  selection: FirstThoughtSelection;
};

export function FirstThoughtStep({
  scene,
  headingRef,
  disabled,
  onContinue,
  onPause,
}: FirstThoughtStepProps) {
  const choices: Choice[] = [
    ...scene.thoughtOptions.map((option) => ({
      value: `option:${option.id}`,
      label: option.label,
      selection: { kind: 'option', optionId: option.id } as FirstThoughtSelection,
    })),
    { value: 'uncertain', label: '不确定', selection: { kind: 'uncertain' } },
    { value: 'multiple', label: '多个都可能', selection: { kind: 'multiple' } },
    { value: 'none', label: '以上都不符合', selection: { kind: 'none' } },
  ];
  const [selectedValue, setSelectedValue] = useState('');
  const selection = choices.find((choice) => choice.value === selectedValue)?.selection;

  return (
    <section className="training-step">
      <h1 ref={headingRef} tabIndex={-1}>你的第一念是什么？</h1>
      <p>选最接近当时的一句。这里没有标准答案。</p>
      <fieldset className="choice-group">
        <legend>你的第一念更接近哪一句？</legend>
        {choices.map((choice) => (
          <label className="choice-row" key={choice.value}>
            <input
              type="radio"
              name="first-thought"
              value={choice.value}
              checked={selectedValue === choice.value}
              onChange={() => setSelectedValue(choice.value)}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="primary-action training-primary"
        disabled={disabled || !selection}
        onClick={() => selection && onContinue(selection)}
      >
        继续
      </button>
      <button type="button" className="secondary-action training-secondary" onClick={onPause}>
        我现在不适合继续
      </button>
    </section>
  );
}
