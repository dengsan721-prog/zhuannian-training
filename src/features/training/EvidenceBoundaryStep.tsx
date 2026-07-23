import { useState, type RefObject } from 'react';
import type { EvidenceSelection } from '../../domain/training/types';

type EvidenceBoundaryStepProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  disabled: boolean;
  onContinue: (value: EvidenceSelection) => void;
  onDanger: () => void;
};

type EvidenceDraft = Partial<EvidenceSelection>;

const groups = [
  {
    key: 'recurrence',
    legend: '这件事发生的频率',
    options: [
      ['repeated', '反复发生'],
      ['once', '目前只发生一次'],
      ['unknown', '还不能确定'],
    ],
  },
  {
    key: 'knownFacts',
    legend: '已经掌握的事实',
    options: [
      ['clear', '我掌握了一些明确事实'],
      ['partial', '只有部分事实'],
      ['none-yet', '还没有足够事实'],
    ],
  },
  {
    key: 'assumptions',
    legend: '事实与推测',
    options: [
      ['present', '其中有我的推测'],
      ['none-known', '目前没有发现推测'],
      ['uncertain', '我还分不清'],
    ],
  },
  {
    key: 'danger',
    legend: '安全情况',
    options: [
      ['none-known', '目前没有发现威胁、控制或伤害'],
      ['uncertain', '我不确定是否安全'],
      ['present', '存在威胁、控制或伤害'],
    ],
  },
  {
    key: 'directlySolvable',
    legend: '可以直接处理多少',
    options: [
      ['partly', '可以先解决一部分'],
      ['yes', '可以直接解决'],
      ['no', '暂时不能直接解决'],
      ['unknown', '还不能确定'],
    ],
  },
  {
    key: 'nextNeed',
    legend: '下一步最需要什么',
    options: [
      ['boundary', '先设边界'],
      ['stabilize', '先稳定自己'],
      ['verify', '先核对事实'],
      ['solve', '先处理可控部分'],
      ['help', '先寻求帮助'],
    ],
  },
] as const;

export function EvidenceBoundaryStep({
  headingRef,
  disabled,
  onContinue,
  onDanger,
}: EvidenceBoundaryStepProps) {
  const [value, setValue] = useState<EvidenceDraft>({});

  const choose = (
    key: keyof EvidenceSelection,
    selected: string,
  ) => {
    if (key === 'danger' && selected === 'present') {
      onDanger();
      return;
    }
    setValue((current) => ({ ...current, [key]: selected }));
  };

  const complete = groups.every((group) => value[group.key] !== undefined);

  return (
    <section className="training-step">
      <h1 ref={headingRef} tabIndex={-1}>把事实、推测和边界分开</h1>
      <p>六项都确认后，再进入表达与行动。</p>
      <div className="evidence-groups">
        {groups.map((group) => (
          <fieldset className="choice-group compact-choice-group" key={group.key}>
            <legend>{group.legend}</legend>
            {group.options.map(([optionValue, label]) => (
              <label className="choice-row" key={optionValue}>
                <input
                  type="radio"
                  name={`evidence-${group.key}`}
                  value={optionValue}
                  checked={value[group.key] === optionValue}
                  onChange={() => choose(group.key, optionValue)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        className="primary-action training-primary"
        disabled={disabled || !complete}
        onClick={() => complete && onContinue(value as EvidenceSelection)}
      >
        继续
      </button>
    </section>
  );
}
