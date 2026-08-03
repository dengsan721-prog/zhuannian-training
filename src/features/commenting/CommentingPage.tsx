import { useMemo, useState } from 'react';
import { analyzeCommentScene } from '../../domain/commenting/commentLexicon';
import { buildExpertInquiry } from '../../domain/commenting/expertInquiry';
import { generateComments } from '../../domain/commenting/generateComments';
import type {
  CommentStyle,
  GeneratedCommentCard,
} from '../../domain/commenting/types';

const defaultRelationshipType = 'general';

const initialSeeds: Record<CommentStyle, number> = {
  warm: 0,
  vivid: 0,
  concise: 0,
};

type InquiryState = {
  tone: 'empty' | 'vague' | 'positive' | 'uncomfortable' | 'mixed';
  label: string;
  title: string;
  body: string;
};

function hasConcreteDetail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  return /，|。|、|说|问|做|帮|扶|骂|吵|哭|笑|写|拿|给|替|陪|等|摔|发火|提醒|整理|检查|迟到|借口/.test(trimmed);
}

function getInquiryState(observation: string): InquiryState {
  const value = observation.trim();
  if (!value) {
    return {
      tone: 'empty',
      label: '待输入',
      title: '先写一个看得见的细节',
      body: '别急着概括人好不好，先写一句话、一个动作，或者当时发生的一幕。',
    };
  }

  if (!hasConcreteDetail(value)) {
    return {
      tone: 'vague',
      label: '还差一点',
      title: '再补一个具体动作',
      body: '把“他很好、他不行”换成看得见的事实：他说了什么、做了什么、谁在场、你有什么感受。',
    };
  }

  const insight = analyzeCommentScene(value);
  if (insight.tone === 'uncomfortable') {
    return {
      tone: 'uncomfortable',
      label: '负面场景',
      title: '先稳住边界，再找善意',
      body: '我会先承认这句话让人不舒服，再看见背后的着急、在意或不会表达。',
    };
  }

  if (insight.tone === 'mixed') {
    return {
      tone: 'mixed',
      label: '有冲突也有善意',
      title: '先接住不舒服，再保留好的一面',
      body: '这类内容会先承认真实感受，再从后面的行动里看见责任、在意和愿意补位。',
    };
  }

  return {
    tone: 'positive',
    label: '可生成',
    title: '可以生成了',
    body: '这类内容会从具体动作里提炼善意、能力和人品。',
  };
}

export function CommentingPage() {
  const [observation, setObservation] = useState('');
  const [cards, setCards] = useState<GeneratedCommentCard[]>([]);
  const [variantSeeds, setVariantSeeds] = useState(initialSeeds);
  const [message, setMessage] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const inquiry = useMemo(() => getInquiryState(observation), [observation]);
  const expertInquiry = useMemo(() => buildExpertInquiry(observation), [observation]);

  const generate = () => {
    const result = generateComments({
      relationshipType: defaultRelationshipType,
      observation,
      variantSeed: 0,
    });
    setCopyStatus('');
    if (result.status === 'needs-detail') {
      setCards([]);
      setMessage(result.message);
      return;
    }
    setVariantSeeds(initialSeeds);
    setCards(result.cards);
    setMessage('');
  };

  const replaceCard = (style: CommentStyle) => {
    const nextSeed = variantSeeds[style] + 1;
    const result = generateComments({
      relationshipType: defaultRelationshipType,
      observation,
      variantSeed: nextSeed,
    });
    setCopyStatus('');
    if (result.status === 'needs-detail') {
      setCards([]);
      setMessage(result.message);
      return;
    }
    const replacement = result.cards.find((card) => card.style === style);
    if (!replacement) return;
    setVariantSeeds({
      ...variantSeeds,
      [style]: nextSeed,
    });
    setCards((current) => current.map((card) => (
      card.style === style ? replacement : card
    )));
    setMessage('');
  };

  const copyCard = async (card: GeneratedCommentCard) => {
    setMessage('');
    if (!navigator.clipboard) {
      setCopyStatus('当前浏览器不支持自动复制');
      return;
    }
    try {
      await navigator.clipboard.writeText(card.text);
      setCopyStatus('已复制');
    } catch {
      setCopyStatus('复制失败，请手动选择文字');
    }
  };

  return (
    <main className="commenting-page">
      <div className="commenting-ambient" aria-hidden="true" />
      <section className="commenting-shell" aria-labelledby="commenting-title">
        <header className="commenting-hero">
          <div className="commenting-kicker">
            <span aria-hidden="true">✦</span>
            <p className="eyebrow">学会说话，矛盾自化</p>
          </div>
          <h1 id="commenting-title">点评工具</h1>
          <p className="commenting-intro">
            写下家人、亲属、同事、朋友圈或陌生人的一个真实动作、一句话或一个小细节。
          </p>
        </header>

        <form
          className="commenting-form commenting-panel"
          onSubmit={(event) => {
            event.preventDefault();
            generate();
          }}
        >
          <label className="commenting-field" htmlFor="commenting-observation">
            <span>写下你看见的一幕</span>
            <textarea
              id="commenting-observation"
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="例如：刚才孩子骂同学，我听着不舒服，但也感觉他可能是着急又不会说。"
            />
          </label>

          <aside
            className={`commenting-inquiry commenting-inquiry-${inquiry.tone}`}
            aria-label="输入质询"
          >
            <div className="commenting-inquiry-icon" aria-hidden="true">?</div>
            <div>
              <span>{inquiry.label}</span>
              <h2>{inquiry.title}</h2>
              <p>{inquiry.body}</p>
            </div>
          </aside>

          <section className="commenting-expert-panel" aria-label="专家质询">
            <div className="commenting-expert-heading">
              <span>{expertInquiry.label}</span>
              <h2>{expertInquiry.headline}</h2>
              <p>{expertInquiry.summary}</p>
            </div>
            <ol>
              {expertInquiry.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
          </section>

          <button type="submit" className="primary-action">
            <span className="comment-action-icon" aria-hidden="true">↑</span>
            生成可直接说出口的点评
          </button>
        </form>

        {message && <p className="training-error" role="alert">{message}</p>}
        {copyStatus && <p className="completion-result" role="status">{copyStatus}</p>}

        {cards.length > 0 && (
          <section className="commenting-results" aria-label="生成的三种点评">
            {cards.map((card) => (
              <article
                className={[
                  'comment-card',
                  card.style === 'warm' ? 'comment-card-featured' : '',
                ].filter(Boolean).join(' ')}
                data-testid={`comment-card-${card.style}`}
                key={card.style}
              >
                {card.style === 'warm' && <span className="comment-card-badge">最推荐</span>}
                <h2>{card.title}</h2>
                <p>{card.text}</p>
                <div className="comment-card-actions">
                  <button
                    type="button"
                    className="comment-icon-action secondary-action"
                    onClick={() => void copyCard(card)}
                  >
                    <span className="comment-action-icon" aria-hidden="true">⧉</span>
                    复制
                  </button>
                  <button
                    type="button"
                    className="comment-icon-action secondary-action"
                    onClick={() => replaceCard(card.style)}
                  >
                    <span className="comment-action-icon" aria-hidden="true">↻</span>
                    换一句
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
