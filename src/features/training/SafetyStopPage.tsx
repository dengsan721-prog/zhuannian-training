import { useState } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import type { SafetyContext } from './trainingDraftStore';

type SafetyStopPageProps = {
  scene: PublishedSceneVersion | null;
  context: SafetyContext;
  onExit?: () => void;
  onTrustedSupport?: () => void;
  onReportHandoff?: (context: SafetyContext) => void;
  authoredUnavailable?: boolean;
  onRetryAuthored?: () => void;
};

export function SafetyStopPage({
  scene,
  context,
  onExit,
  onTrustedSupport,
  onReportHandoff,
  authoredUnavailable = false,
  onRetryAuthored,
}: SafetyStopPageProps) {
  const [handoffRequested, setHandoffRequested] = useState(false);
  const [trustedSupportRequested, setTrustedSupportRequested] = useState(false);
  const authored = scene?.safetyRoute;
  const heading = authored?.heading ?? '优先保护你和相关人的安全';
  const body = authored?.body
    ?? '先停止普通训练。若能够安全离开，再前往有现实支持的地方；否则优先联系当地紧急服务或可信任的人。';

  return (
    <main className="app-shell">
      <section className="surface safety-stop-page">
        <p className="eyebrow">安全优先</p>
        <h1 tabIndex={-1} autoFocus>{heading}</h1>
        {heading !== '优先保护你和相关人的安全' && (
          <p className="safety-priority">优先保护你和相关人的安全</p>
        )}
        <p>{body}</p>
        {authoredUnavailable && (
          <div className="training-error" role="alert">
            <p>场景安全说明暂时无法加载，通用安全支持仍然可用。</p>
            <button
              type="button"
              className="secondary-action"
              onClick={onRetryAuthored}
            >
              重试加载场景安全说明
            </button>
          </div>
        )}
        <p>
          如果有人正面临紧迫危险，请联系当地紧急服务；
          本工具不是急救或危机热线。
        </p>
        <div className="safety-actions">
          <button type="button" className="primary-action" onClick={onExit}>
            退出训练
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setTrustedSupportRequested(true);
              onTrustedSupport?.();
            }}
          >
            联系可信任的人
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              setHandoffRequested(true);
              onReportHandoff?.(context);
            }}
          >
            请求转交安全支持
          </button>
        </div>
        {trustedSupportRequested && (
          <p role="status">
            请现在联系一位可信任、能够提供现实帮助的人；本页不会代你发送消息。
          </p>
        )}
        {handoffRequested && (
          <p role="status">
            交接意愿目前只保留在本页，尚未提交；安全报告功能尚未上线，请同时联系现实中的支持者。
          </p>
        )}
      </section>
    </main>
  );
}
