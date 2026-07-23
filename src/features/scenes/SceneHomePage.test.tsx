import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';
import { validPublishedScene } from '../../test/fixtures/scene';
import { SceneHomePage } from './SceneHomePage';

const scene = (
  id: number,
  overrides: Partial<PublishedSceneVersion>,
): PublishedSceneVersion => ({
  ...validPublishedScene,
  id: `10000000-0000-0000-0000-${id.toString().padStart(12, '0')}`,
  sceneId: `20000000-0000-0000-0000-${id.toString().padStart(12, '0')}`,
  sceneCode: `PC-${id.toString().padStart(3, '0')}`,
  slug: `classic-scene-${id}`,
  ...overrides,
});

const classicScenes = [
  scene(1, {
    title: '手机放不下',
    category: '手机规则',
    observableFacts: ['约定的时间到了，孩子仍在使用手机'],
  }),
  scene(2, {
    title: '一说就顶嘴',
    category: '情绪冲突',
    observableFacts: ['家长刚开口提醒，孩子立刻提高音量反驳'],
  }),
  scene(3, {
    title: '作业迟迟不开始',
    category: '学习作业',
    observableFacts: ['回家已经一小时，孩子还没有打开作业本'],
  }),
] satisfies PublishedSceneVersion[];

const repositoryWith = (scenes: PublishedSceneVersion[]): SceneRepository => ({
  listPublished: vi.fn(async () => scenes),
  getBySlug: vi.fn(async (slug) => scenes.find((item) => item.slug === slug) ?? null),
});

function renderPage(repository: SceneRepository) {
  return render(
    <MemoryRouter>
      <SceneHomePage sceneRepository={repository} />
    </MemoryRouter>,
  );
}

describe('SceneHomePage', () => {
  afterEach(cleanup);

  it('shows three compact classic scenes and no public ranking', async () => {
    renderPage(repositoryWith(classicScenes));

    expect(await screen.findByText('手机放不下')).toBeInTheDocument();
    expect(screen.getByText('一说就顶嘴')).toBeInTheDocument();
    expect(screen.getByText('作业迟迟不开始')).toBeInTheDocument();
    expect(screen.getByText('约定的时间到了，孩子仍在使用手机')).toBeInTheDocument();
    expect(screen.getByText('亲子 · 手机规则')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '手机放不下' }))
      .toHaveAttribute('href', '/train/classic-scene-1');
    expect(screen.queryByText(/排行榜|末位/)).not.toBeInTheDocument();
  });

  it('announces loading while the catalog request is pending', () => {
    const repository: SceneRepository = {
      listPublished: () => new Promise(() => undefined),
      getBySlug: async () => null,
    };

    renderPage(repository);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载经典场景');
  });

  it('shows at most three cards by default and reveals every matching scene', async () => {
    const fourth = scene(4, {
      title: '家务总要催',
      category: '责任习惯',
      observableFacts: ['约定收好餐具后，餐具仍留在桌上'],
    });
    const user = userEvent.setup();

    renderPage(repositoryWith([...classicScenes, fourth]));

    expect(await screen.findByText('手机放不下')).toBeInTheDocument();
    expect(screen.queryByText('家务总要催')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看全部经典场景' }));

    expect(screen.getByText('家务总要催')).toBeInTheDocument();
  });

  it('filters the loaded catalog by relationship and category', async () => {
    const familyScene = scene(4, {
      sceneCode: 'FR-004',
      relationship: 'family',
      title: '回家只剩沉默',
      category: '夫妻沟通',
      observableFacts: ['伴侣回家后只说了两句话，随后独自坐着'],
    });
    const user = userEvent.setup();

    renderPage(repositoryWith([...classicScenes, familyScene]));
    await screen.findByText('手机放不下');

    await user.selectOptions(screen.getByRole('combobox', { name: '类别' }), '情绪冲突');
    expect(screen.getByText('一说就顶嘴')).toBeInTheDocument();
    expect(screen.queryByText('手机放不下')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '关系' }), 'family');
    expect(screen.getByText('回家只剩沉默')).toBeInTheDocument();
    expect(screen.queryByText('手机放不下')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '类别' }), '夫妻沟通');
    expect(screen.getByText('回家只剩沉默')).toBeInTheDocument();
  });

  it('offers a safe retry after a catalog failure', async () => {
    const listPublished = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(classicScenes);
    const repository: SceneRepository = {
      listPublished,
      getBySlug: async () => null,
    };
    const user = userEvent.setup();

    renderPage(repository);

    expect(await screen.findByRole('alert')).toHaveTextContent('场景加载失败');
    await user.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('手机放不下')).toBeInTheDocument();
    expect(listPublished).toHaveBeenCalledTimes(2);
  });

  it('announces an empty catalog without inventing scene content', async () => {
    renderPage(repositoryWith([]));

    const emptyMessage = await screen.findByText('暂时没有可用的经典场景。');
    expect(emptyMessage).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('link', { name: /开始/ })).not.toBeInTheDocument();
  });
});
