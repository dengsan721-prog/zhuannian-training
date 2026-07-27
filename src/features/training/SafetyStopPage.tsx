import { useState } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import type { SafetyContext } from './trainingDraftStore';

type SafetyStopPageProps = {
  scene: PublishedSceneVersion | null;
  context: SafetyContext;
  stopState: 'stopping' | 'confirmed' | 'unknown';
  onRetryStop?: () => void;
  onExit?: () => void;
  onTrustedSupport?: () => void;
  onReportHandoff?: (context: SafetyContext) => void;
  authoredUnavailable?: boolean;
  onRetryAuthored?: () => void;
};

export function SafetyStopPage({
  scene,
  context,
  stopState,
  onRetryStop,
  onExit,
  onTrustedSupport,
  onReportHandoff,
  authoredUnavailable = false,
  onRetryAuthored,
}: SafetyStopPageProps) {
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
        {stopState === 'stopping' && (
          <p role="status">正在确认普通训练已停止；安全页面会保持打开。</p>
        )}
        {stopState === 'unknown' && (
          <div className="training-error" role="alert">
            <p>停止结果尚无法确认，普通训练仍保持停止，不会恢复训练。</p>
            <button
              type="button"
              className="secondary-action"
              onClick={onRetryStop}
            >
              重试停止训练
            </button>
          </div>
        )}
        {stopState === 'confirmed' && (
          <p role="status">普通训练已停止。</p>
        )}
        <p>下一页会显示将提交的信息；现在不会创建报告。</p>
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
              onReportHandoff?.(context);
            }}
          >
            查看安全报告选项
          </button>
        </div>
        {trustedSupportRequested && (
          <p role="status">
            请现在联系一位可信任、能够提供现实帮助的人；本页不会代你发送消息。
          </p>
        )}
      </section>
    </main>
  );
}
