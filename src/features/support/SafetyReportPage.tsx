import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import type { SafetyReportInput } from '../../domain/support/types';
import type { SafetySignalCode } from '../../domain/training/types';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import type { SafetyContext } from '../training/trainingDraftStore';
import { removeSafetyContext } from '../training/trainingDraftStore';
import { useOnlineStatus } from './useOnlineStatus';

type SafetyReportPageProps = {
  repository: SupportRepository;
  ownerUserId: string;
  sessionId?: string;
  context?: SafetyContext;
  online?: boolean;
};

const safetyCategories: ReadonlyArray<{
  value: SafetySignalCode;
  label: string;
}> = [
  { value: 'physical_or_sexual_violence', label: '身体或性暴力' },
  { value: 'serious_threat', label: '严重威胁' },
  { value: 'coercive_control', label: '胁迫或控制' },
  { value: 'child_abuse_or_exploitation', label: '儿童虐待或剥削' },
  { value: 'self_harm_or_suicide', label: '自伤或自杀风险' },
  { value: 'bullying_or_retaliation', label: '欺凌或报复' },
  { value: 'medical_emergency', label: '医疗紧急情况' },
  { value: 'user_declared_danger', label: '我判断存在其他现实危险' },
];

function signalLabel(signalCode: SafetySignalCode): string {
  return safetyCategories.find((item) => item.value === signalCode)?.label
    ?? '已选择的受控风险类别';
}

function readErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = Reflect.get(error, 'message');
  return typeof message === 'string' ? message : '';
}

const stableSafetyFailures = new Set([
  'database_integrity_failure',
  'idempotency_conflict',
  'invalid_safety_report_input',
  'invalid_safety_report_request',
  'profile_required',
  'safety_source_unavailable',
  'session_not_found',
  'unauthenticated',
]);

function stableSafetyFailureCopy(code: string): string {
  if (code === 'safety_source_unavailable' || code === 'session_not_found') {
    return '关联训练会话无法核对，本次明确未提交。你可以改用不带训练会话的安全报告。';
  }
  if (code === 'idempotency_conflict') {
    return '这次请求标识已用于其他操作，本次明确未提交。请重新提交。';
  }
  if (code === 'profile_required' || code === 'unauthenticated') {
    return '当前账户无法完成核对，本次明确未提交。请重新登录后再试。';
  }
  return '服务器已明确拒绝这次报告，本次明确未提交。请核对后再试。';
}

export function SafetyReportPage({
  repository,
  ownerUserId,
  sessionId,
  context,
  online,
}: SafetyReportPageProps) {
  const isOnline = useOnlineStatus(online);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstCategoryRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const focusSequenceRef = useRef(0);
  const [selectedSignal, setSelectedSignal] = useState<SafetySignalCode | ''>('');
  const [confirmedByUser, setConfirmedByUser] = useState(false);
  const [frozenInput, setFrozenInput] = useState<SafetyReportInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [offerGenericReport, setOfferGenericReport] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    target: 'category' | 'confirmation' | 'summary';
    sequence: number;
  } | null>(null);
  const requestFocus = (
    target: 'category' | 'confirmation' | 'summary',
  ) => {
    focusSequenceRef.current += 1;
    setFocusRequest({ target, sequence: focusSequenceRef.current });
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (focusRequest?.target === 'category') firstCategoryRef.current?.focus();
    if (focusRequest?.target === 'confirmation') {
      confirmationRef.current?.focus();
    }
    if (focusRequest?.target === 'summary') errorRef.current?.focus();
  }, [focusRequest]);

  const invalidHandoff = (
    (sessionId === undefined) !== (context === undefined)
  );
  const submit = async (input: SafetyReportInput) => {
    if (inFlightRef.current || submitted) return;
    inFlightRef.current = true;
    setBusy(true);
    setError('');
    setOfferGenericReport(false);
    setFocusRequest(null);
    try {
      await repository.createSafetyReport(input);
      setSubmitted(true);
      setFrozenInput(null);
      if (sessionId) removeSafetyContext(ownerUserId, sessionId);
    } catch (caught) {
      const message = readErrorMessage(caught);
      if (stableSafetyFailures.has(message)) {
        setFrozenInput(null);
        setError(stableSafetyFailureCopy(message));
        setOfferGenericReport(
          sessionId !== undefined
            && (message === 'safety_source_unavailable'
              || message === 'session_not_found'),
        );
      } else {
        setFrozenInput(input);
        setError(
          '提交结果尚无法确认，不能当作“尚未提交”。请使用同一次请求重试确认。',
        );
      }
      requestFocus('summary');
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOnline || inFlightRef.current || submitted || invalidHandoff) {
      return;
    }
    if (frozenInput) {
      void submit(frozenInput);
      return;
    }
    if (!context && selectedSignal === '') {
      setError('请选择最接近的风险类别。');
      requestFocus('category');
      return;
    }
    if (!confirmedByUser) {
      setError('请先主动确认提交上面列出的最少必要信息。');
      requestFocus('confirmation');
      return;
    }

    const requestId = globalThis.crypto.randomUUID();
    let input: SafetyReportInput;
    if (sessionId && context?.source === 'server') {
      input = {
        requestId,
        confirmedByUser: true,
        sessionId,
        context: { source: 'server' },
      };
    } else if (sessionId && context?.source === 'user') {
      input = {
        requestId,
        confirmedByUser: true,
        sessionId,
        context: {
          source: 'user',
          signalCode: context.signalCode,
        },
      };
    } else if (selectedSignal !== '') {
      input = {
        requestId,
        confirmedByUser: true,
        context: {
          source: 'user',
          signalCode: selectedSignal,
        },
      };
    } else {
      return;
    }
    void submit(input);
  };

  const controlsDisabled = busy || frozenInput !== null || submitted;

  return (
    <main className="app-shell">
      <section className="surface support-shell safety-report-page">
        <p className="eyebrow">独立的安全流程</p>
        <h1 ref={headingRef} tabIndex={-1}>创建安全报告</h1>
        <div className="safety-guidance">
          <p>先保护自己和相关人的安全；能够安全离开时，先前往有现实支持的地方。</p>
          <p>联系可信任、能够提供现实帮助的人。</p>
          <p>
            如果危险正在发生，请联系当地紧急服务。
            本产品不是危机救援或实时响应服务。
          </p>
        </div>

        {submitted ? (
          <div className="support-success" role="status">
            <p>安全报告已进入安全负责人队列。</p>
            <p>
              这只表示系统已记录报告，不表示已有人查看，
              也不表示已安排报警、救援或即时响应。
            </p>
            <p>
              如果危险仍在，请继续优先联系当地紧急服务或可信任的人。
            </p>
            <Link className="primary-action" to="/support/status">
              查看提交状态
            </Link>
          </div>
        ) : invalidHandoff ? (
          <div className="training-error" role="alert">
            <p>
              安全上下文与训练会话不完整，无法从这次交接创建报告。
            </p>
            <Link className="primary-action" to="/support/safety-report">
              创建不带训练会话的安全报告
            </Link>
          </div>
        ) : (
          <form className="support-form" onSubmit={onSubmit}>
            {!context && (
              <fieldset className="choice-group" disabled={controlsDisabled}>
                <legend>请选择最接近的风险类别</legend>
                {safetyCategories.map((item, index) => (
                  <label className="choice-row" key={item.value}>
                    <input
                      ref={index === 0 ? firstCategoryRef : undefined}
                      type="radio"
                      name="safety-signal"
                      value={item.value}
                      checked={selectedSignal === item.value}
                      onChange={() => setSelectedSignal(item.value)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </fieldset>
            )}

            <section
              className="safety-report-preview"
              aria-labelledby="safety-preview-heading"
            >
              <h2 id="safety-preview-heading">提交前预览</h2>
              <dl className="support-preview-list">
                <div>
                  <dt>账户与班级</dt>
                  <dd>
                    {context
                      ? '账户与服务班级由服务器核对；不会由本页指定。'
                      : '账户由服务器核对；服务班级仅在能够唯一证明时由服务器关联。'}
                  </dd>
                </div>
                {context?.source === 'user' && (
                  <div>
                    <dt>风险类别</dt>
                    <dd>{signalLabel(context.signalCode)}</dd>
                  </div>
                )}
                {!context && (
                  <>
                    <div>
                      <dt>风险类别</dt>
                      <dd>
                        {selectedSignal === ''
                          ? '尚未选择'
                          : signalLabel(selectedSignal)}
                      </dd>
                    </div>
                    <div>
                      <dt>训练关联</dt>
                      <dd>不关联训练会话或场景版本。</dd>
                    </div>
                  </>
                )}
                {context && sessionId && (
                  <div>
                    <dt>训练关联</dt>
                    <dd className="long-value">
                      场景版本 {context.sceneVersionId}，由服务器核对会话归属。
                    </dd>
                  </div>
                )}
                <div>
                  <dt>提交时间</dt>
                  <dd>提交时间由服务器记录。</dd>
                </div>
              </dl>
              <p className="boundary-note">
                不会提交训练答案、第一念、假设、反馈、补充说明或儿童身份信息；
                普通教练看不到风险类别/场景关联/处理记录。
              </p>
            </section>

            <label className="consent-row">
              <input
                ref={confirmationRef}
                type="checkbox"
                checked={confirmedByUser}
                disabled={controlsDisabled}
                onChange={(event) => setConfirmedByUser(
                  event.currentTarget.checked,
                )}
              />
              <span>我确认将上面列出的最少必要信息提交给安全负责人</span>
            </label>

            {!isOnline && (
              <p className="offline-banner" role="status">
                当前离线，离线状态下尚未提交安全报告。
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
                {offerGenericReport && (
                  <>
                    <Link
                      className="secondary-action"
                      to="/support/safety-report"
                    >
                      创建不带训练会话的安全报告
                    </Link>
                    <p>
                      如果危险仍在，请继续优先联系当地紧急服务或可信任的人。
                    </p>
                  </>
                )}
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
                  : '确认提交安全报告'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
