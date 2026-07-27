import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  PrivateProgress,
  ReviewPrompt,
  SavedInsightSummary,
} from '../../domain/progress/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';

type ProgressPageProps = {
  repository: ProgressRepository;
};

type LoadedProgress = {
  progress: PrivateProgress;
  pendingReview: ReviewPrompt | null;
  saved: SavedInsightSummary[];
};

export function ProgressPage({ repository }: ProgressPageProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | ({ status: 'ready' } & LoadedProgress)
  >({ status: 'loading' });

  useEffect(() => {
    let active = true;
    Promise.all([
      repository.getPrivateProgress(),
      repository.getPendingReview(),
      repository.listSaved(),
    ]).then(([progress, pendingReview, saved]) => {
      if (active) {
        setState({
          status: 'ready',
          progress,
          pendingReview,
          saved,
        });
      }
    }).catch(() => {
      if (active) setState({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [attempt, repository]);

  if (state.status === 'loading') {
    return (
      <main className="app-shell">
        <section className="surface progress-shell">
          <h1>我的转念力</h1>
          <p role="status">正在加载成长记录……</p>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="app-shell">
        <section className="surface progress-shell">
          <h1>我的转念力</h1>
          <p role="alert">暂时无法加载成长记录，不会显示估算数据。</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}
          >
            重新加载
          </button>
        </section>
      </main>
    );
  }

  const { progress, pendingReview, saved } = state;
  return (
    <main className="app-shell">
      <section className="surface progress-shell">
        <p className="eyebrow">只属于你的成长记录</p>
        <h1>我的转念力</h1>

        <section className="private-progress" aria-label="个人成长">
          <strong>{progress.points} 点</strong>
          <p>本周参与 {progress.thisWeekCompletions} 次</p>
          <dl>
            <div><dt>完成不同场景</dt><dd>{progress.completedScenes}</dd></div>
            <div><dt>完成复盘</dt><dd>{progress.reviewsCompleted}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="milestone-heading">
          <h2 id="milestone-heading">我的里程碑</h2>
          {progress.badges.length === 0 ? (
            <p role="status">完成第一个场景后，会出现你的第一枚里程碑。</p>
          ) : (
            <ul className="progress-list">
              {progress.badges.map((badge) => (
                <li key={badge.key}>{badge.label}</li>
              ))}
            </ul>
          )}
          {progress.unlockedSurprises.length > 0 && (
            <>
              <h3>已解锁的小惊喜</h3>
              <ul className="progress-list">
                {progress.unlockedSurprises.map((surprise) => (
                  <li key={surprise.key}>{surprise.label}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {progress.classAggregate && (
          <section className="class-aggregate" aria-labelledby="class-heading">
            <h2 id="class-heading">班级共同完成</h2>
            <strong>
              {progress.classAggregate.completedScenes}
              {' / '}
              {progress.classAggregate.collectiveGoal}
            </strong>
            <p>班级共同目标</p>
          </section>
        )}

        <section aria-labelledby="review-heading">
          <h2 id="review-heading">待复盘</h2>
          {pendingReview ? (
            <Link
              className="secondary-action"
              to={`/reviews/${pendingReview.completionId}`}
            >
              完成一次简短复盘
            </Link>
          ) : (
            <p role="status">暂时没有待复盘的场景。</p>
          )}
        </section>

        <section aria-labelledby="saved-heading">
          <h2 id="saved-heading">我的收藏</h2>
          {saved.length === 0 ? (
            <p role="status">暂时没有收藏。</p>
          ) : (
            <ul className="progress-list">
              {saved.map((item) => (
                <li key={`${item.sceneVersionId}:${item.kind}`}>
                  {item.route === 'available' && '这条收藏仍可使用。'}
                  {item.route === 'content-update'
                    && '内容已更新，请回到场景页重新选择。'}
                  {item.route === 'safety-stop'
                    && '这条内容已停止展示，请优先查看安全支持。'}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link className="secondary-action" to="/support/request">
          请求教练帮助
        </Link>
        <Link className="primary-action" to="/scenes">继续选择场景</Link>
      </section>
    </main>
  );
}
