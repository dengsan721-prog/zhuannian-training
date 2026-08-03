import { useMemo, useState } from 'react';

const modules = [
  '我一开口，家人就烦',
  '一着急我就控制不住火',
  '为什么每次都是他的错',
  '我越催孩子越拖',
  '孩子一顶嘴我就想压住他',
  '孩子犯错怎么说才愿意改',
  '只盯成绩孩子越来越没信心',
  '坏习惯总也改不掉',
  '夫妻一说话就争输赢',
  '对方道歉了我为什么还要补刀',
  '家里教育孩子总唱反调',
  '学了很多回家还是老样子',
];

const expressionOptions = [
  {
    id: 'fact-request',
    label: '先说事实，再说请求',
    sentence: '我看到这件事还没完成，我有点着急。我们先一起定一个今晚能做完的小步骤。',
  },
  {
    id: 'pause-ask',
    label: '先停三秒，再问一句',
    sentence: '我先停一下。我想知道你现在卡在哪里，我们一起找一个能开始的点。',
  },
  {
    id: 'affirm-then-boundary',
    label: '先肯定一点，再立边界',
    sentence: '我看到你不是故意对抗。这个事情今晚需要有一个结果，我们先做最小的一步。',
  },
];

export function App() {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [oldReaction, setOldReaction] = useState('');
  const [expressionId, setExpressionId] = useState(expressionOptions[0].id);
  const [actionCardVisible, setActionCardVisible] = useState(false);
  const [feedback, setFeedback] = useState({
    did: '',
    response: '',
    difference: '',
  });
  const [completed, setCompleted] = useState(false);

  const selectedExpression = useMemo(
    () => expressionOptions.find((item) => item.id === expressionId)
      ?? expressionOptions[0],
    [expressionId],
  );

  if (completed) {
    return (
      <main className="app-shell training-demo-shell">
        <section className="surface training-demo-result" aria-labelledby="demo-result-title">
          <p className="eyebrow">本次行动反馈</p>
          <h1 id="demo-result-title">我不是懂了，是做到了</h1>
          <p>
            下次线下课可以拿这三行反馈复盘：不是证明谁对谁错，
            而是让真实行动和真实结果来说服自己。
          </p>
          <dl className="demo-feedback-summary">
            <div>
              <dt>我做了什么</dt>
              <dd>{feedback.did}</dd>
            </div>
            <div>
              <dt>对方怎么回应</dt>
              <dd>{feedback.response}</dd>
            </div>
            <div>
              <dt>和以前有什么不同</dt>
              <dd>{feedback.difference}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setCompleted(false);
              setActionCardVisible(false);
              setFeedback({ did: '', response: '', difference: '' });
            }}
          >
            再练一遍
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell training-demo-shell">
      <section className="surface training-demo-hero" aria-labelledby="app-title">
        <p className="eyebrow">幸福驿站</p>
        <h1 id="app-title">转念训练</h1>
        <p>幸福驿站训练器 Demo</p>
        <p>仅面向成年人</p>
        <p className="demo-value-line">
          不只听懂一节课，而是现场练会一个动作，今晚完成一次行动，
          再用三行结果反馈说服自己。
        </p>
        <p className="boundary-note">
          如遇家庭暴力、人身威胁、儿童虐待、自伤自杀想法等高风险情形，
          请停止训练并优先寻求现实安全帮助或专业支持。
        </p>
      </section>

      <section className="surface demo-module-panel" aria-labelledby="module-title">
        <div className="demo-section-heading">
          <p className="eyebrow">12个极简模块</p>
          <h2 id="module-title">今天先练一个最常见的问题</h2>
        </div>
        <div className="demo-module-grid">
          {modules.map((name, index) => {
            const isActive = index === 0;
            return (
              <article className="demo-module-card" key={name}>
                <span>模块 {index + 1}</span>
                <h3>{name}</h3>
                <p>{isActive ? '已开放：可完整体验训练闭环' : '预留入口：后续接入完整训练'}</p>
                <button
                  type="button"
                  className={isActive ? 'primary-action' : 'secondary-action'}
                  disabled={!isActive}
                  onClick={() => {
                    setSelectedModule(name);
                    setActionCardVisible(false);
                    setCompleted(false);
                  }}
                >
                  {isActive ? `开始训练：${name}` : '即将开放'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {selectedModule && (
        <section className="surface demo-training-panel" aria-labelledby="training-title">
          <div className="demo-section-heading">
            <p className="eyebrow">一题一练</p>
            <h2 id="training-title">{selectedModule}</h2>
          </div>

          <label className="demo-field" htmlFor="old-reaction">
            刚才我最容易说出口的旧反应
            <textarea
              id="old-reaction"
              value={oldReaction}
              onChange={(event) => setOldReaction(event.target.value)}
              placeholder="例如：你怎么又这样？我说了多少遍了？"
            />
          </label>

          <fieldset className="choice-group">
            <legend>今天只换一个新动作</legend>
            {expressionOptions.map((option) => (
              <label className="choice-row" key={option.id}>
                <input
                  type="radio"
                  name="expression"
                  value={option.id}
                  checked={expressionId === option.id}
                  onChange={() => setExpressionId(option.id)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.sentence}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            className="primary-action"
            disabled={oldReaction.trim().length === 0}
            onClick={() => setActionCardVisible(true)}
          >
            生成今晚行动卡
          </button>

          {actionCardVisible && (
            <section className="demo-action-card" aria-labelledby="action-card-title">
              <p className="eyebrow">24小时内只做一件事</p>
              <h3 id="action-card-title">今晚行动卡</h3>
              <p>
                当我想说“{oldReaction}”时，先停三秒，
                换成这句：{selectedExpression.sentence}
              </p>
              <p>
                行动要求：只观察对方第一反应，不追问、不补刀、不立刻讲大道理。
              </p>

              <div className="demo-feedback-form">
                <label className="demo-field" htmlFor="feedback-did">
                  我做了什么
                  <textarea
                    id="feedback-did"
                    value={feedback.did}
                    onChange={(event) => setFeedback({
                      ...feedback,
                      did: event.target.value,
                    })}
                  />
                </label>
                <label className="demo-field" htmlFor="feedback-response">
                  对方怎么回应
                  <textarea
                    id="feedback-response"
                    value={feedback.response}
                    onChange={(event) => setFeedback({
                      ...feedback,
                      response: event.target.value,
                    })}
                  />
                </label>
                <label className="demo-field" htmlFor="feedback-difference">
                  和以前有什么不同
                  <textarea
                    id="feedback-difference"
                    value={feedback.difference}
                    onChange={(event) => setFeedback({
                      ...feedback,
                      difference: event.target.value,
                    })}
                  />
                </label>
                <button
                  type="button"
                  className="primary-action"
                  disabled={!feedback.did.trim()
                    || !feedback.response.trim()
                    || !feedback.difference.trim()}
                  onClick={() => setCompleted(true)}
                >
                  完成本次训练
                </button>
              </div>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
