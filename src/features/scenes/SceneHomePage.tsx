import { useState } from 'react';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';
import { SceneList } from './SceneList';
import { useScenes } from './useScenes';

type SceneHomePageProps = {
  sceneRepository?: SceneRepository;
};

export function SceneHomePage({ sceneRepository }: SceneHomePageProps) {
  const { state, retry } = useScenes(sceneRepository);
  const [relationship, setRelationship] = useState('');
  const [category, setCategory] = useState('');
  const [showAll, setShowAll] = useState(false);

  const scenes = state.status === 'success' ? state.scenes : [];
  const categories = [...new Set(
    scenes
      .filter((scene) => !relationship || scene.relationship === relationship)
      .map((scene) => scene.category),
  )];
  const matchingScenes = scenes.filter((scene) => (
    (!relationship || scene.relationship === relationship)
    && (!category || scene.category === category)
  ));
  const visibleScenes = showAll ? matchingScenes : matchingScenes.slice(0, 3);

  return (
    <main className="app-shell">
      <section className="surface scene-home" aria-labelledby="scene-heading">
        <p className="eyebrow">今天想处理什么？</p>
        <h1 id="scene-heading">从最像你家的场景开始</h1>

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
                <SceneList scenes={visibleScenes} />
                {!showAll && matchingScenes.length > 3 && (
                  <button
                    type="button"
                    className="secondary-action catalog-more"
                    onClick={() => setShowAll(true)}
                  >
                    查看全部经典场景
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
