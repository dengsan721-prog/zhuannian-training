import {
  type FormEvent,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  ReviewInput,
  ReviewObservation,
  ReviewResult,
} from '../../domain/progress/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deterministicReviewErrors = new Set([
  'active_adult_membership_required',
  'completion_not_found',
  'database_integrity_failure',
  'idempotency_conflict',
  'invalid_review_request',
  'review_already_recorded',
  'unauthenticated',
]);

function readErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
}

type FollowUpPageProps = {
  repository: ProgressRepository;
  completionId?: string;
};

export function FollowUpPage({
  repository,
  completionId: completionIdProp,
}: FollowUpPageProps) {
  const { completionId: routeCompletionId = '' } = useParams();
  const completionId = completionIdProp ?? routeCompletionId;
  const idempotencyKey = useRef<string | null>(null);
  const [attempted, setAttempted] = useState('');
  const [observation, setObservation] = useState<ReviewObservation | ''>('');
  const [hypothesisResult, setHypothesisResult] = useState<
    ReviewInput['hypothesisResult'] | ''
  >('');
  const [nextDirection, setNextDirection] = useState<
    ReviewInput['nextDirection'] | ''
  >('');
  const [pending, setPending] = useState<ReviewInput | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);

  if (!uuidPattern.test(completionId)) {
    return (
      <main className="app-shell">
        <section className="surface progress-shell">
          <h1>无法打开复盘</h1>
          <p role="alert">复盘链接无效。</p>
          <Link className="primary-action" to="/progress">返回我的转念力</Link>
        </section>
      </main>
    );
  }

  const submit = async (input: ReviewInput) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setRejected(false);
    try {
      const saved = await repository.saveReview(input);
      setResult(saved);
      setPending(null);
    } catch (caught) {
      if (deterministicReviewErrors.has(readErrorMessage(caught))) {
        setPending(null);
        setRejected(true);
        setError('复盘记录未通过核对，本页不会显示完成或奖励。');
      } else {
        setPending(input);
        setError('复盘记录尚未确认，请使用同一内容重试。');
      }
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      void submit(pending);
      return;
    }
    if (!attempted || !observation || !hypothesisResult || !nextDirection) {
      setError('请完成四个简短选择。');
      return;
    }
    if (!idempotencyKey.current) {
      idempotencyKey.current = globalThis.crypto.randomUUID();
    }
    const input: ReviewInput = {
      completionId,
      attempted: attempted === 'yes',
      observation,
      hypothesisResult,
      nextDirection,
      idempotencyKey: idempotencyKey.current,
    };
    void submit(input);
  };

  const supportSelected = observation === 'needs_support'
    || nextDirection === 'seek_help';
  const controlsDisabled = busy
    || pending !== null
    || rejected
    || result !== null;

  return (
    <main className="app-shell">
      <section className="surface progress-shell">
        <p className="eyebrow">一次简短复盘</p>
        <h1>后来发生了什么？</h1>
        <p>没有标准答案，只记录这次尝试是否给你带来帮助。</p>

        {result ? (
          <>
            <p className="completion-result" role="status">
              {result.awarded ? '复盘已记录，获得 5 点转念力' : '复盘已记录'}
            </p>
            <Link className="primary-action" to="/progress">查看我的转念力</Link>
          </>
        ) : (
          <form className="review-form" onSubmit={onSubmit}>
            <fieldset className="choice-group" disabled={controlsDisabled}>
              <legend>你尝试过当时选择的表达或行动吗？</legend>
              <label className="choice-row">
                <input
                  type="radio"
                  name="attempted"
                  value="yes"
                  checked={attempted === 'yes'}
                  onChange={() => setAttempted('yes')}
                />
                <span>我尝试过</span>
              </label>
              <label className="choice-row">
                <input
                  type="radio"
                  name="attempted"
                  value="no"
                  checked={attempted === 'no'}
                  onChange={() => setAttempted('no')}
                />
                <span>我还没有尝试</span>
              </label>
            </fieldset>

            <fieldset className="choice-group" disabled={controlsDisabled}>
              <legend>这次观察最接近哪一种？</legend>
              {([
                ['helpful', '有帮助'],
                ['no_change', '暂时没有变化'],
                ['not_tried', '还没有机会尝试'],
                ['needs_support', '我需要更多支持'],
              ] as const).map(([value, label]) => (
                <label className="choice-row" key={value}>
                  <input
                    type="radio"
                    name="observation"
                    value={value}
                    checked={observation === value}
                    onChange={() => setObservation(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="choice-group" disabled={controlsDisabled}>
              <legend>当时保留的可能，后来怎样了？</legend>
              {([
                ['supported', '这个可能得到一些支持'],
                ['unsupported', '这个可能没有得到支持'],
                ['uncertain', '现在仍不能确定'],
              ] as const).map(([value, label]) => (
                <label className="choice-row" key={value}>
                  <input
                    type="radio"
                    name="hypothesis-result"
                    value={value}
                    checked={hypothesisResult === value}
                    onChange={() => setHypothesisResult(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="choice-group" disabled={controlsDisabled}>
              <legend>下一步你更愿意怎么做？</legend>
              {([
                ['repeat', '继续练习'],
                ['adjust', '换一种表达'],
                ['boundary', '先守住边界'],
                ['seek_help', '主动寻找支持'],
              ] as const).map(([value, label]) => (
                <label className="choice-row" key={value}>
                  <input
                    type="radio"
                    name="next-direction"
                    value={value}
                    checked={nextDirection === value}
                    onChange={() => setNextDirection(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            {supportSelected && (
              <aside className="support-choice">
                <p>是否寻求支持由你决定；这次选择不会自动通知教练。</p>
                <Link className="secondary-action" to="/support">
                  了解可选支持
                </Link>
              </aside>
            )}

            {error && <p role="alert">{error}</p>}
            {rejected ? (
              <Link className="secondary-action" to="/progress">
                返回我的转念力
              </Link>
            ) : (
              <button
                type="submit"
                className="primary-action"
                disabled={busy}
              >
                {busy ? '正在记录…' : pending ? '重试记录' : '记录这次复盘'}
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
