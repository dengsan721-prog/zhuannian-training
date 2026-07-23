import { Link } from 'react-router-dom';
import type { PublishedSceneVersion } from '../../domain/scenes/types';

const relationshipLabels = {
  'parent-child': '亲子',
  family: '家庭',
} satisfies Record<PublishedSceneVersion['relationship'], string>;

type SceneListProps = {
  id?: string;
  scenes: PublishedSceneVersion[];
};

export function SceneList({ id, scenes }: SceneListProps) {
  return (
    <ul id={id} className="scene-list" aria-label="经典场景">
      {scenes.map((scene) => (
        <li key={scene.id}>
          <article className="scene-card">
            <p className="scene-meta">
              {relationshipLabels[scene.relationship]} · {scene.category}
            </p>
            <h2>
              <Link to={`/train/${scene.slug}`}>{scene.title}</Link>
            </h2>
            <p>{scene.observableFacts[0]}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}
