import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { happinessScenes } from './happinessScenes';
import type {
  ExperienceDomain,
  ExperienceScene,
  ExperienceScreen,
  ExperienceThought,
  HappinessKeyId,
} from './types';
import './experience.css';

const domains: readonly ('全部' | ExperienceDomain)[] = [
  '全部',
  '情感',
  '家庭',
  '亲子',
  '工作',
  '事业',
  '社交',
  '个人成长',
];

const milestones = new Map<number, string>([
  [3, '你已经开始看见第一念之外的可能'],
  [6, '你正在把转念变成一种稳定能力'],
  [12, '12个幸福密码全部点亮'],
]);

export function ReframeExperiencePage() {
  const [screen, setScreen] = useState<ExperienceScreen>('catalog');
  const [domain, setDomain] = useState<'全部' | ExperienceDomain>('全部');
  const [scene, setScene] = useState<ExperienceScene | null>(null);
  const [thought, setThought] = useState<ExperienceThought | null>(null);
  const [angle, setAngle] = useState<'strength' | 'boundary' | null>(null);
  const [completedKeys, setCompletedKeys] = useState<Set<HappinessKeyId>>(
    () => new Set(),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const completedCount = completedKeys.size;
  const visibleScenes = useMemo(
    () => domain === '全部'
      ? happinessScenes
      : happinessScenes.filter((item) => item.domain === domain),
    [domain],
  );
  const milestone = milestones.get(completedCount);

  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

  function chooseScene(nextScene: ExperienceScene) {
    setScene(nextScene);
    setThought(null);
    setAngle(null);
    setScreen('thought');
  }

  function chooseThought(nextThought: ExperienceThought) {
    setThought(nextThought);
    setAngle(null);
    setScreen('angle');
  }

  function chooseAngle(nextAngle: 'strength' | 'boundary') {
    if (!scene) return;
    setAngle(nextAngle);
    setCompletedKeys((current) => {
      const next = new Set(current);
      next.add(scene.primaryKey.id);
      return next;
    });
    setScreen('result');
  }

  function showCatalog() {
    setScene(null);
    setThought(null);
    setAngle(null);
    setScreen('catalog');
  }

  function retryScene() {
    setThought(null);
    setAngle(null);
    setScreen('thought');
  }

  return (
    <main className="experience-shell">
      {screen === 'catalog' && (
        <section className="experience-step" aria-labelledby="experience-title">
          <div className="experience-hero">
            <p className="experience-kicker">从痛苦到幸福的12个转念密码</p>
            <h1 id="experience-title" ref={headingRef} tabIndex={-1}>
              今天，先转一个念头
            </h1>
            <p>
              选一个最近最容易起情绪的场景，先看见第一念，再换一个能落地的角度。
            </p>
          </div>
          <ProgressLine count={completedCount} />
          {milestone && <p className="experience-key">{milestone}</p>}
          <div className="experience-filters" aria-label="场景分类">
            {domains.map((item) => (
              <button
                key={item}
                type="button"
                className={item === domain ? 'is-active' : undefined}
                aria-pressed={item === domain}
                onClick={() => setDomain(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="experience-grid">
            {visibleScenes.map((item) => (
              <button
                key={item.id}
                type="button"
                className="experience-card"
                aria-label={`选择场景：${item.title}`}
                onClick={() => chooseScene(item)}
              >
                <span>{item.domain}</span>
                <strong>{item.title}</strong>
                <small>{item.primaryKey.title}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === 'thought' && scene && (
        <section className="experience-step" aria-labelledby="thought-title">
          <StepTopline scene={scene} />
          <h1 id="thought-title" ref={headingRef} tabIndex={-1}>
            你的第一念是什么？
          </h1>
          <p className="experience-fact">{scene.observableFact}</p>
          <div className="experience-choice" aria-label="第一念选择">
            {scene.firstThoughts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseThought(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SafetyLink />
          <button type="button" className="text-action" onClick={showCatalog}>
            换一个场景
          </button>
        </section>
      )}

      {screen === 'angle' && scene && thought && (
        <section className="experience-step" aria-labelledby="angle-title">
          <StepTopline scene={scene} />
          <h1 id="angle-title" ref={headingRef} tabIndex={-1}>
            换一个角度
          </h1>
          <p className="experience-fact">{scene.acknowledgement}</p>
          <p>{scene.observableFact}</p>
          <div className="experience-choice" aria-label="转念角度选择">
            <button type="button" onClick={() => chooseAngle('strength')}>
              先看见隐藏的力量
            </button>
            <button type="button" onClick={() => chooseAngle('boundary')}>
              先守住事实和边界
            </button>
          </div>
          <SafetyLink />
        </section>
      )}

      {screen === 'result' && scene && thought && angle && (
        <section className="experience-step" aria-labelledby="result-title">
          <StepTopline scene={scene} />
          <h1 id="result-title" ref={headingRef} tabIndex={-1}>
            转念一刻
          </h1>
          <ProgressLine count={completedCount} />
          {milestone && <p className="experience-key">{milestone}</p>}
          <div className="experience-result">
            <p className="experience-label">新的念头</p>
            <p>{scene.newThought}</p>
          </div>
          <section className="experience-actions" aria-labelledby="action-title">
            <h2 id="action-title">今晚行动约定</h2>
            <p><strong>下一次场景</strong>{scene.nextSceneCue}</p>
            <p><strong>要说的一句话</strong>{scene.newExpression}</p>
            <p><strong>转念后的点评</strong>{scene.commentExpression}</p>
            <p><strong>只做一个动作</strong>{scene.microAction}</p>
          </section>
          <section className="experience-old-path" aria-label="旧路提醒">
            <p className="experience-label">刚才的第一念</p>
            <p>{thought.label}</p>
            <p>{thought.likelyDirection}</p>
          </section>
          <details>
            <summary>为什么这样转？</summary>
            <p>{scene.strengthView}</p>
            <p>{scene.evidencePrompt}</p>
            <p>{scene.boundary}</p>
          </details>
          <details>
            <summary>我怎样知道自己练到了？</summary>
            <ul>
              {scene.passCriteria.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>今晚只观察三件事</summary>
            <ul>
              <li>我做了什么</li>
              <li>对方如何回应</li>
              <li>和以前有什么不同</li>
            </ul>
          </details>
          <SafetyLink />
          <div className="experience-actions-row">
            <button type="button" onClick={retryScene}>再练一次</button>
            <button type="button" onClick={showCatalog}>换一个场景</button>
          </div>
        </section>
      )}
    </main>
  );
}

function ProgressLine({ count }: { count: number }) {
  return (
    <p className="experience-progress">已点亮 {count} / 12 个幸福密码</p>
  );
}

function StepTopline({ scene }: { scene: ExperienceScene }) {
  return (
    <div className="experience-progress">
      <span>{scene.domain}</span>
      <span>{scene.primaryKey.title}</span>
      <strong>{scene.title}</strong>
    </div>
  );
}

function SafetyLink() {
  return (
    <Link className="experience-safety-link" to="/support">
      这里存在伤害或危险
    </Link>
  );
}
