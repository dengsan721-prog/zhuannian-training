import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import type {
  MySafetyReportStatus,
  MySupportTicketStatus,
} from '../../domain/support/types';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import { useOnlineStatus } from './useOnlineStatus';

type SupportStatusPageProps = {
  repository: SupportRepository;
  online?: boolean;
};

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; items: T[] }
  | { status: 'error' }
  | { status: 'offline' };

type LoadResult<T> = {
  repository: SupportRepository;
  attempt: number;
  state:
    | { status: 'ready'; items: T[] }
    | { status: 'error' };
};

type RevokeAttempt = {
  ticketId: string;
  requestId: string;
};

function readErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = Reflect.get(error, 'message');
  return typeof message === 'string' ? message : '';
}

const stableRevokeFailures = new Set([
  'database_integrity_failure',
  'idempotency_conflict',
  'invalid_support_revocation',
  'support_consent_not_shared',
  'support_ticket_not_found',
  'unauthenticated',
]);

function helpStatusLabel(status: MySupportTicketStatus['status']): string {
  return status === 'submitted' ? '已进入服务队列' : '已撤回';
}

function snapshotStatusLabel(ticket: MySupportTicketStatus): string {
  if (ticket.status === 'withdrawn') return '已撤回并删除共享内容';
  return ticket.snapshotShared ? '已分享训练选择' : '未分享训练选择';
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SupportStatusPage({
  repository,
  online,
}: SupportStatusPageProps) {
  const isOnline = useOnlineStatus(online);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revokeInFlightRef = useRef(false);
  const revokeAttemptRef = useRef<RevokeAttempt | null>(null);
  const [helpAttempt, setHelpAttempt] = useState(0);
  const [safetyAttempt, setSafetyAttempt] = useState(0);
  const [helpResult, setHelpResult] = useState<
    LoadResult<MySupportTicketStatus> | null
  >(null);
  const [safetyResult, setSafetyResult] = useState<
    LoadResult<MySafetyReportStatus> | null
  >(null);
  const [confirmTicketId, setConfirmTicketId] = useState<string | null>(null);
  const [revokeAttempt, setRevokeAttempt] = useState<RevokeAttempt | null>(
    null,
  );
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const helpState: LoadState<MySupportTicketStatus> = !isOnline
    ? { status: 'offline' }
    : helpResult?.repository === repository
      && helpResult.attempt === helpAttempt
      ? helpResult.state
      : { status: 'loading' };
  const safetyState: LoadState<MySafetyReportStatus> = !isOnline
    ? { status: 'offline' }
    : safetyResult?.repository === repository
      && safetyResult.attempt === safetyAttempt
      ? safetyResult.state
      : { status: 'loading' };

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOnline) return undefined;
    let active = true;
    void repository.listMySupportTickets()
      .then((items) => {
        if (!active) return;
        const attempt = revokeAttemptRef.current;
        const target = attempt
          ? items.find((item) => item.ticketId === attempt.ticketId)
          : undefined;
        if (attempt
          && (target?.status !== 'submitted' || !target.snapshotShared)) {
          revokeAttemptRef.current = null;
          revokeInFlightRef.current = false;
          setConfirmTicketId(null);
          setRevokeAttempt(null);
          setRevokeBusy(false);
          setRevokeError('');
        }
        setHelpResult({
          repository,
          attempt: helpAttempt,
          state: { status: 'ready', items },
        });
      })
      .catch(() => {
        if (active) {
          setHelpResult({
            repository,
            attempt: helpAttempt,
            state: { status: 'error' },
          });
        }
      });
    return () => {
      active = false;
    };
  }, [helpAttempt, isOnline, repository]);

  useEffect(() => {
    if (!isOnline) return undefined;
    let active = true;
    void repository.listMySafetyReports()
      .then((items) => {
        if (active) {
          setSafetyResult({
            repository,
            attempt: safetyAttempt,
            state: { status: 'ready', items },
          });
        }
      })
      .catch(() => {
        if (active) {
          setSafetyResult({
            repository,
            attempt: safetyAttempt,
            state: { status: 'error' },
          });
        }
      });
    return () => {
      active = false;
    };
  }, [isOnline, repository, safetyAttempt]);

  const submitRevocation = async (ticketId: string) => {
    if (!isOnline || revokeInFlightRef.current) return;
    revokeInFlightRef.current = true;
    const attempt = revokeAttempt ?? {
      ticketId,
      requestId: globalThis.crypto.randomUUID(),
    };
    revokeAttemptRef.current = attempt;
    setRevokeAttempt(attempt);
    setRevokeBusy(true);
    setRevokeError('');
    try {
      const result = await repository.revokeSupportConsent(attempt);
      setHelpResult((current) => current?.repository === repository
        && current.attempt === helpAttempt
        && current.state.status === 'ready'
        ? {
            ...current,
            state: {
              status: 'ready',
              items: current.state.items.map((item) => (
                item.ticketId === result.ticketId
                  ? {
                      ...item,
                      status: result.status,
                      snapshotShared: result.snapshotShared,
                    }
                  : item
              )),
            },
          }
        : current);
      setConfirmTicketId(null);
      revokeAttemptRef.current = null;
      setRevokeAttempt(null);
    } catch (caught) {
      const message = readErrorMessage(caught);
      if (stableRevokeFailures.has(message)) {
        revokeAttemptRef.current = null;
        setRevokeAttempt(null);
        setRevokeError(
          '撤回请求被服务器拒绝，页面上的状态可能已过时；最新状态需重新加载。',
        );
      } else {
        setRevokeError(
          '撤回结果尚无法确认，不能当作“尚未撤回”。请使用同一次请求重试确认。',
        );
      }
    } finally {
      revokeInFlightRef.current = false;
      setRevokeBusy(false);
    }
  };

  const renderHelpState = () => {
    if (!isOnline || helpState.status === 'offline') {
      return (
        <p className="offline-banner" role="status">
          离线，当前状态无法确认。
        </p>
      );
    }
    if (helpState.status === 'loading') {
      return <p role="status">正在加载求助状态……</p>;
    }
    if (helpState.status === 'error') {
      return (
        <div className="training-error" role="alert">
          <p>当前无法确认求助状态，不会显示缓存或估算结果。</p>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setHelpAttempt((value) => value + 1)}
          >
            重试加载求助状态
          </button>
        </div>
      );
    }
    if (helpState.items.length === 0) {
      return <p>还没有普通求助记录。</p>;
    }
    return (
      <ul className="support-status-list">
        {helpState.items.map((ticket) => (
          <li className="support-status-card" key={ticket.ticketId}>
            <dl className="support-preview-list">
              <div>
                <dt>求助编号</dt>
                <dd className="long-value">{ticket.ticketId}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{helpStatusLabel(ticket.status)}</dd>
              </div>
              <div>
                <dt>训练选择共享</dt>
                <dd>{snapshotStatusLabel(ticket)}</dd>
              </div>
              <div>
                <dt>提交时间</dt>
                <dd>{formatTimestamp(ticket.submittedAt)}</dd>
              </div>
              {ticket.status === 'submitted' && (
                <div>
                  <dt>试点首次响应目标时间</dt>
                  <dd>{formatTimestamp(ticket.firstResponseDueAt)}</dd>
                </div>
              )}
            </dl>
            {ticket.snapshotShared && ticket.status === 'submitted' && (
              <>
                {confirmTicketId === ticket.ticketId ? (
                  <div className="revoke-confirmation">
                    <p>
                      撤回后，共享快照和补充说明会被删除，
                      普通求助会变为已撤回。
                    </p>
                    {revokeError && (
                      <div className="training-error" role="alert">
                        <p>{revokeError}</p>
                        <button
                          type="button"
                          className="secondary-action"
                          disabled={!isOnline || revokeBusy}
                          onClick={() => setHelpAttempt((value) => value + 1)}
                        >
                          重新加载求助状态
                        </button>
                      </div>
                    )}
                    {revokeBusy && <p role="status">正在确认撤回……</p>}
                    <button
                      type="button"
                      className="danger-action"
                      disabled={!isOnline || revokeBusy}
                      onClick={() => void submitRevocation(ticket.ticketId)}
                    >
                      {revokeAttempt
                        ? '重试撤回确认'
                        : '确认撤回共享并停止这次求助'}
                    </button>
                    {!revokeAttempt && !revokeBusy && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => {
                          setConfirmTicketId(null);
                          setRevokeError('');
                        }}
                      >
                        暂不撤回
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="danger-action"
                    disabled={revokeBusy || revokeAttempt !== null}
                      onClick={() => {
                        setConfirmTicketId(ticket.ticketId);
                        revokeAttemptRef.current = null;
                        setRevokeAttempt(null);
                      setRevokeError('');
                    }}
                  >
                    撤回共享并停止这次求助
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const renderSafetyState = () => {
    if (!isOnline || safetyState.status === 'offline') {
      return (
        <p className="offline-banner" role="status">
          离线，当前状态无法确认。
        </p>
      );
    }
    if (safetyState.status === 'loading') {
      return <p role="status">正在加载安全报告状态……</p>;
    }
    if (safetyState.status === 'error') {
      return (
        <div className="training-error" role="alert">
          <p>当前无法确认安全报告状态，不会显示缓存或估算结果。</p>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setSafetyAttempt((value) => value + 1)}
          >
            重试加载安全报告状态
          </button>
        </div>
      );
    }
    if (safetyState.items.length === 0) {
      return <p>还没有安全报告记录。</p>;
    }
    return (
      <ul className="support-status-list">
        {safetyState.items.map((report) => (
          <li className="support-status-card" key={report.reportId}>
            <dl className="support-preview-list">
              <div>
                <dt>报告编号</dt>
                <dd className="long-value">{report.reportId}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>已进入安全负责人队列</dd>
              </div>
              <div>
                <dt>提交时间</dt>
                <dd>{formatTimestamp(report.submittedAt)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main className="app-shell">
      <section className="surface support-shell support-status-page">
        <p className="eyebrow">只显示最少状态</p>
        <h1 ref={headingRef} tabIndex={-1}>查看提交状态</h1>

        <section className="support-status-section" aria-labelledby="help-status">
          <h2 id="help-status">普通求助</h2>
          <p>提交成功只表示进入服务队列，不表示已通知或分配教练。</p>
          {renderHelpState()}
        </section>

        <section
          className="support-status-section"
          aria-labelledby="safety-status"
        >
          <h2 id="safety-status">安全报告</h2>
          <p>
            安全报告状态不是救援进度，也不表示已有人查看或安排即时响应。
          </p>
          {renderSafetyState()}
        </section>

        <Link className="secondary-action" to="/support">
          返回支持与安全
        </Link>
      </section>
    </main>
  );
}
