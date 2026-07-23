import { useEffect, useState } from 'react';
import type { PrivateProgress } from '../../domain/progress/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';
import { SceneList } from './SceneList';
import { useScenes } from './useScenes';

const sceneListId = 'classic-scene-list';

type SceneHomePageProps = {
  sceneRepository?: SceneRepository;
  progressRepository?: ProgressRepository;
};

type ProgressSummaryState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; progress: PrivateProgress };

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function SceneHomePage({
  sceneRepository,
  progressRepository,
}: SceneHomePageProps) {
  const { state, retry } = useScenes(sceneRepository);
  const [progressState, setProgressState] = useState<ProgressSummaryState>(
    progressRepository ? { status: 'loading' } : { status: 'hidden' },
  );
  const [progressAttempt, setProgressAttempt] = useState(0);
  const [relationship, setRelationship] = useState('');
  const [category, setCategory] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!progressRepository) return undefined;
    let active = true;
    progressRepository.getPrivateProgress()
      .then((value) => {
        if (active) {
          setProgressState({ status: 'success', progress: value });
        }
      })
      .catch(() => {
        if (active) setProgressState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [progressAttempt, progressRepository]);

  const scenes = state.status === 'success' ? state.scenes : [];
  const sortedScenes = [...scenes].sort((left, right) => (
    compareText(left.sceneCode, right.sceneCode)
    || left.version - right.version
    || compareText(left.id, right.id)
  ));
  const categories = [...new Set(
    sortedScenes
      .filter((scene) => !relationship || scene.relationship === relationship)
      .map((scene) => scene.category),
  )];
  const matchingScenes = sortedScenes.filter((scene) => (
    (!relationship || scene.relationship === relationship)
    && (!category || scene.category === category)
  ));
  const visibleScenes = showAll ? matchingScenes : matchingScenes.slice(0, 3);

  return (
    <main className="app-shell">
      <section className="surface scene-home" aria-labelledby="scene-heading">
        <p className="eyebrow">今天想处理什么？</p>
        <h1 id="scene-heading">从最像你家的场景开始</h1>

        {progressState.status === 'loading' && (
          <p role="status">正在加载我的转念力……</p>
        )}

        {progressState.status === 'error' && (
          <div className="scene-progress-message" role="alert">
            <p>成长摘要加载失败，经典场景仍可继续使用。</p>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setProgressState({ status: 'loading' });
                setProgressAttempt((current) => current + 1);
              }}
            >
              重新加载成长摘要
            </button>
          </div>
        )}

        {progressState.status === 'success' && (
          <section className="scene-progress-summary" aria-labelledby="scene-progress-heading">
            <div>
              <h2 id="scene-progress-heading">我的转念力</h2>
              <strong>{progressState.progress.points} 点</strong>
            </div>
            <p>本周参与 {progressState.progress.thisWeekCompletions} 次</p>
            {progressState.progress.classAggregate && (
              <div className="scene-class-summary">
                <span>班级共同目标</span>
                <strong>
                  {progressState.progress.classAggregate.completedScenes}
                  {' / '}
                  {progressState.progress.classAggregate.collectiveGoal}
                </strong>
              </div>
            )}
          </section>
        )}

        {state.status === 'loading' && (
          <p role="status">正在加载经典场景……</p>
        )}

        {state.status === 'error' && (
          <div className="catalog-message" role="alert">
            <p>场景加载失败，请稍后重试。</p>
            <button type="button" className="secondary-action" onClick={retry}>
              重新加载
            </button>
          </div>
        )}

        {state.status === 'success' && (
          <>
            <div className="scene-filters" aria-label="筛选经典场景">
              <label htmlFor="relationship-filter">
                关系
                <select
                  id="relationship-filter"
                  value={relationship}
                  onChange={(event) => {
                    setRelationship(event.target.value);
                    setCategory('');
                    setShowAll(false);
                  }}
                >
                  <option value="">全部关系</option>
                  <option value="parent-child">亲子</option>
                  <option value="family">家庭</option>
                </select>
              </label>
              <label htmlFor="category-filter">
                类别
                <select
                  id="category-filter"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setShowAll(false);
                  }}
                >
                  <option value="">全部类别</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            {scenes.length === 0 && (
              <p role="status">暂时没有可用的经典场景。</p>
            )}
            {scenes.length > 0 && matchingScenes.length === 0 && (
              <p role="status">暂时没有符合筛选的经典场景。</p>
            )}
            {matchingScenes.length > 0 && (
              <>
                <SceneList id={sceneListId} scenes={visibleScenes} />
                {matchingScenes.length > 3 && (
                  <button
                    type="button"
                    className="secondary-action catalog-more"
                    aria-expanded={showAll}
                    aria-controls={sceneListId}
                    onClick={() => setShowAll((current) => !current)}
                  >
                    {showAll ? '收起经典场景' : '查看全部经典场景'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
