import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  normalizeSupportNote,
} from '../../domain/support/validation';
import type {
  SupportTicketInput,
} from '../../domain/support/types';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import { codePointLength } from '../../shared/codePointLength';
import { currentTrainingSupportIntent } from './currentTrainingSupportIntent';
import { useOnlineStatus } from './useOnlineStatus';

type RequestHelpPageProps = {
  repository: SupportRepository;
  ownerUserId: string;
  online?: boolean;
};

type HelpResult = Awaited<
  ReturnType<SupportRepository['createSupportTicket']>
>;

function readErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = Reflect.get(error, 'message');
  return typeof message === 'string' ? message : '';
}

const stableTicketFailures = new Set([
  'active_adult_membership_required',
  'cohort_context_ambiguous',
  'database_integrity_failure',
  'idempotency_conflict',
  'invalid_support_request',
  'invalid_support_ticket_input',
  'note_invalid_characters',
  'note_too_long',
  'profile_required',
  'scene_unavailable',
  'support_consent_not_shared',
  'unauthenticated',
]);

function stableTicketFailureCopy(code: string): string {
  if (code === 'note_invalid_characters') {
    return '补充说明包含不允许的控制字符，本次明确未提交。请修改后再试。';
  }
  if (code === 'note_too_long') {
    return '补充说明超过长度限制，本次明确未提交。请缩短后再试。';
  }
  if (code === 'idempotency_conflict') {
    return '这次请求标识已用于其他操作，本次明确未提交。请重新提交。';
  }
  if (code === 'active_adult_membership_required'
    || code === 'cohort_context_ambiguous'
    || code === 'profile_required') {
    return '当前账户或服务资格不满足普通求助条件，本次明确未提交。';
  }
  if (code === 'unauthenticated') {
    return '登录状态已失效，本次明确未提交。请重新登录后再试。';
  }
  return '服务器已明确拒绝这次请求，本次明确未提交。请核对后再试。';
}

export function RequestHelpPage({
  repository,
  ownerUserId,
  online,
}: RequestHelpPageProps) {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus(online);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const ownerRef = useRef(ownerUserId);
  const generationRef = useRef(0);
  const intentTokenRef = useRef(
    currentTrainingSupportIntent.peek(ownerUserId)?.token ?? null,
  );
  const focusSequenceRef = useRef(0);
  const [intent, setIntent] = useState(
    () => currentTrainingSupportIntent.peek(ownerUserId)?.intent ?? null,
  );
  const [shareKind, setShareKind] = useState<
    'no_snapshot' | 'current_training_snapshot'
  >('no_snapshot');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [frozenInput, setFrozenInput] = useState<SupportTicketInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HelpResult | null>(null);
  const [error, setError] = useState('');
  const [focusRequest, setFocusRequest] = useState<{
    target: 'consent' | 'note' | 'summary';
    sequence: number;
  } | null>(null);
  const requestFocus = (
    target: 'consent' | 'note' | 'summary',
  ) => {
    focusSequenceRef.current += 1;
    setFocusRequest({ target, sequence: focusSequenceRef.current });
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const token = intentTokenRef.current;
    if (token) {
      currentTrainingSupportIntent.clear(token);
      intentTokenRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (ownerRef.current === ownerUserId) return;
    generationRef.current += 1;
    ownerRef.current = ownerUserId;
    inFlightRef.current = false;
    intentTokenRef.current = null;
    currentTrainingSupportIntent.clearAll();
    setIntent(null);
    setNote('');
    setShareKind('no_snapshot');
    setConsent(false);
    setFrozenInput(null);
    setResult(null);
    setError('');
    setBusy(false);
    setFocusRequest(null);
  }, [ownerUserId]);

  useEffect(() => () => {
    generationRef.current += 1;
    inFlightRef.current = false;
  }, []);

  useEffect(() => {
    if (focusRequest?.target === 'consent') consentRef.current?.focus();
    if (focusRequest?.target === 'note') noteRef.current?.focus();
    if (focusRequest?.target === 'summary') errorRef.current?.focus();
  }, [focusRequest]);

  const submit = async (input: SupportTicketInput) => {
    if (inFlightRef.current || result) return;
    const submissionGeneration = generationRef.current;
    const submissionOwner = ownerRef.current;
    const isCurrentSubmission = () => (
      submissionGeneration === generationRef.current
      && submissionOwner === ownerRef.current
    );
    inFlightRef.current = true;
    setBusy(true);
    setError('');
    setFocusRequest(null);
    try {
      const saved = await repository.createSupportTicket(input);
      if (!isCurrentSubmission()) return;
      setIntent(null);
      setNote('');
      setShareKind('no_snapshot');
      setConsent(false);
      setFrozenInput(null);
      setResult(null);
      setError('');
      setBusy(false);
      setFocusRequest(null);
      setResult(saved);
    } catch (caught) {
      if (!isCurrentSubmission()) return;
      const message = readErrorMessage(caught);
      if (message === 'support_source_unavailable') {
        setFrozenInput(null);
        setIntent(null);
        setShareKind('no_snapshot');
        setConsent(false);
        setError('这次训练内容已无法核对，只能不分享训练选择求助；当前尚未提交。');
        requestFocus('summary');
      } else if (message === 'safety_required') {
        setFrozenInput(null);
        setIntent(null);
        setError('这类情况需要使用独立的安全报告流程，普通求助尚未提交。');
        navigate('/support/safety-report');
      } else if (stableTicketFailures.has(message)) {
        setFrozenInput(null);
        setError(stableTicketFailureCopy(message));
        requestFocus(
          message === 'note_invalid_characters' || message === 'note_too_long'
            ? 'note'
            : 'summary',
        );
      } else {
        setFrozenInput(input);
        setError(
          '提交结果尚无法确认，不能当作“尚未提交”。请使用同一次请求重试确认。',
        );
        requestFocus('summary');
      }
    } finally {
      if (isCurrentSubmission()) {
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOnline || inFlightRef.current || result) return;
    if (frozenInput) {
      void submit(frozenInput);
      return;
    }

    let normalizedNote: string | undefined;
    try {
      normalizedNote = normalizeSupportNote(note);
    } catch (caught) {
      const message = readErrorMessage(caught);
      setError(message === 'note_invalid_characters'
        ? '补充说明不能包含控制或文字方向控制字符。'
        : '补充说明最多 200 个字符，并且不能超过 800 字节。');
      requestFocus('note');
      return;
    }

    let input: SupportTicketInput;
    if (shareKind === 'current_training_snapshot' && intent) {
      if (!consent) {
        setError('请先主动确认共享上面列出的最少必要信息。');
        requestFocus('consent');
        return;
      }
      const requestId = globalThis.crypto.randomUUID();
      input = normalizedNote === undefined ? {
        kind: 'current_training_snapshot',
        requestId,
        consentToShare: true,
        completionId: intent.completionId,
        snapshot: intent.snapshot,
      } : {
        kind: 'current_training_snapshot',
        requestId,
        consentToShare: true,
        completionId: intent.completionId,
        snapshot: intent.snapshot,
        note: normalizedNote,
      };
    } else {
      const requestId = globalThis.crypto.randomUUID();
      input = normalizedNote === undefined ? {
        kind: 'no_snapshot',
        requestId,
      } : {
        kind: 'no_snapshot',
        requestId,
        note: normalizedNote,
      };
    }
    void submit(input);
  };

  const controlsDisabled = busy || frozenInput !== null || result !== null;
  const noteCount = codePointLength(note.normalize('NFC').trim());

  return (
    <main className="app-shell">
      <section className="surface support-shell">
        <p className="eyebrow">普通求助</p>
        <h1 ref={headingRef} tabIndex={-1}>请求教练帮助</h1>
        <div className="service-disclosure">
          <p>
            这是非即时服务。提交成功只表示进入服务队列，
            不表示已通知、分配或由教练接受。
          </p>
          <p>
            如果有人正面临急性危险，请优先联系当地紧急服务或可信任的人。
          </p>
        </div>

        {result ? (
          <div className="support-success" role="status">
            {result.status === 'withdrawn' ? (
              <>
                <p>这次普通求助已经撤回。</p>
                <p>共享内容不会恢复；请到提交状态页查看最新系统记录。</p>
              </>
            ) : (
              <>
                <p>
                  {result.snapshotShared
                    ? '已分享本次训练选择，求助已进入服务队列。'
                    : '未分享训练选择，求助已进入服务队列。'}
                </p>
                <p>
                  这不表示已通知或分配教练。你可以在提交状态页查看系统记录。
                </p>
                {result.snapshotShared && (
                  <p>
                    在状态页撤回共享会删除快照和补充说明，
                    同时停止这次普通求助并将其标为已撤回。
                  </p>
                )}
              </>
            )}
            <Link className="primary-action" to="/support/status">
              查看提交状态
            </Link>
          </div>
        ) : (
          <form className="support-form" onSubmit={onSubmit}>
            {intent ? (
              <>
                <fieldset className="choice-group" disabled={controlsDisabled}>
                  <legend>这次是否分享训练选择？</legend>
                  <label className="choice-row">
                    <input
                      type="radio"
                      name="share-kind"
                      checked={shareKind === 'no_snapshot'}
                      onChange={() => {
                        setShareKind('no_snapshot');
                        setConsent(false);
                      }}
                    />
                    <span>不分享训练选择也可以求助</span>
                  </label>
                  <label className="choice-row">
                    <input
                      type="radio"
                      name="share-kind"
                      checked={shareKind === 'current_training_snapshot'}
                      onChange={() => setShareKind('current_training_snapshot')}
                    />
                    <span>分享这次训练选择</span>
                  </label>
                </fieldset>

                {shareKind === 'current_training_snapshot' && (
                  <section
                    className="consent-preview"
                    aria-labelledby="consent-preview-heading"
                  >
                    <h2 id="consent-preview-heading">共享前预览</h2>
                    <p>{intent.preview.sceneLabel}</p>
                    <p className="long-value">{intent.preview.sceneStorageNotice}</p>
                    <dl className="support-preview-list">
                      <div>
                        <dt>第一念</dt>
                        <dd>{intent.preview.selectedThoughtLabel}</dd>
                      </div>
                      <div>
                        <dt>选择的可能</dt>
                        <dd>
                          <ul>
                            {intent.preview.selectedHypothesisTexts.map((
                              text,
                              index,
                            ) => (
                              <li
                                key={intent.snapshot.selectedHypothesisIds[index]}
                              >
                                {text}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      {intent.preview.evidence.map((item) => (
                        <div key={item.id}>
                          <dt>{item.question}</dt>
                          <dd>{item.answer}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>{intent.preview.exclusionNotice}</p>
                    <p>
                      可能查看者仅包括实际承接的教练，
                      以及确有必要时的最少升级负责人。
                    </p>
                    <label className="consent-row">
                      <input
                        ref={consentRef}
                        type="checkbox"
                        checked={consent}
                        disabled={controlsDisabled}
                        onChange={(event) => setConsent(event.currentTarget.checked)}
                      />
                      <span>我同意将上面列出的最少必要信息用于这次求助</span>
                    </label>
                  </section>
                )}
              </>
            ) : (
              <p className="privacy-recovery">
                不分享训练选择也可以求助。当前没有可核对的本次训练快照，
                本页只会提交普通求助和你自愿填写的补充说明。
              </p>
            )}

            <label className="support-note">
              <span>补充说明（可选）</span>
              <textarea
                ref={noteRef}
                value={note}
                disabled={controlsDisabled}
                aria-describedby="note-warning note-count"
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </label>
            <p id="note-warning" className="boundary-note">
              请勿填写孩子真实姓名、学校、诊断、电话、精确生日、地址、
              病历或其他不必要的身份信息；系统不能保证自动识别或删除这些内容。
            </p>
            <p
              id="note-count"
              role={noteCount >= 180 ? 'status' : undefined}
            >
              已输入 {noteCount} / 200 个字符
            </p>

            {!isOnline && (
              <p className="offline-banner" role="status">
                当前离线，离线状态下尚未提交。恢复网络后再提交。
              </p>
            )}
            {busy && <p role="status">正在提交，请勿重复点击……</p>}
            {error && (
              <div
                ref={errorRef}
                className="training-error"
                role="alert"
                tabIndex={-1}
              >
                <p>{error}</p>
              </div>
            )}
            <button
              type="submit"
              className="primary-action"
              disabled={!isOnline || busy}
            >
              {busy
                ? '正在提交…'
                : frozenInput
                  ? '重试确认结果'
                  : shareKind === 'current_training_snapshot' && intent
                    ? '同意分享并提交'
                    : '不分享提交求助'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
