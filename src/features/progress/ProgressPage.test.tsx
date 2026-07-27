import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrivateProgress } from '../../domain/progress/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';
import { ProgressPage } from './ProgressPage';

const completionId = '55555555-5555-4555-8555-555555555555';
const versionId = '44444444-4444-4444-8444-444444444444';

const privateProgress: PrivateProgress = {
  points: 25,
  completedScenes: 3,
  reviewsCompleted: 1,
  thisWeekCompletions: 3,
  badges: [{
    key: 'first-scene',
    label: '第一次转念',
    awardedAt: '2026-07-20T12:00:00.000Z',
  }],
  unlockedSurprises: [],
  classAggregate: {
    completedScenes: 12,
    activeMembers: 20,
    collectiveGoal: 50,
    goalReached: false,
  },
};

function repositoryWith(
  overrides: Partial<ProgressRepository> = {},
): ProgressRepository {
  return {
    complete: vi.fn(),
    saveReview: vi.fn(),
    setSaved: vi.fn(),
    listSaved: vi.fn(async () => [{
      sceneVersionId: versionId,
      kind: 'reframe' as const,
      savedAt: '2026-07-22T12:00:00.000Z',
      route: 'available' as const,
    }]),
    getPendingReview: vi.fn(async () => ({
      completionId,
      sceneVersionId: versionId,
      completedAt: '2026-07-22T12:00:00.000Z',
    })),
    getPrivateProgress: vi.fn(async () => privateProgress),
    ...overrides,
  };
}

function renderPage(repository: ProgressRepository) {
  return render(
    <MemoryRouter>
      <ProgressPage repository={repository} />
    </MemoryRouter>,
  );
}

describe('ProgressPage', () => {
  afterEach(cleanup);

  it('shows only private growth and a safe class aggregate without individual comparison', async () => {
    renderPage(repositoryWith());

    expect(await screen.findByText('25 点')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我的转念力' }))
      .toBeInTheDocument();
    expect(screen.getByText('本周参与 3 次')).toBeInTheDocument();
    expect(screen.getByText('班级共同完成')).toBeInTheDocument();
    expect(screen.getByText('12 / 50')).toBeInTheDocument();
    expect(screen.getByText('第一次转念')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '完成一次简短复盘' }))
      .toHaveAttribute('href', `/reviews/${completionId}`);
    expect(screen.getByRole('link', { name: '请求教练帮助' }))
      .toHaveAttribute('href', '/support/request');
    expect(document.body.textContent).not.toMatch(
      /排行榜|排名|第\s*\d+\s*名|末位|落后|断签|失败家长|思想正确率/,
    );
  });

  it('keeps the class section absent when the aggregate is privacy-suppressed', async () => {
    renderPage(repositoryWith({
      getPrivateProgress: vi.fn(async () => ({
        ...privateProgress,
        classAggregate: null,
      })),
      getPendingReview: vi.fn(async () => null),
      listSaved: vi.fn(async () => []),
    }));

    expect(await screen.findByText('本周参与 3 次')).toBeInTheDocument();
    expect(screen.queryByText('班级共同完成')).not.toBeInTheDocument();
    expect(screen.getByText('暂时没有待复盘的场景。')).toHaveAttribute(
      'role',
      'status',
    );
  });

  it('shows safe saved-state routes without rendering authored or private content', async () => {
    renderPage(repositoryWith({
      listSaved: vi.fn(async () => [
        {
          sceneVersionId: versionId,
          kind: 'reframe' as const,
          savedAt: '2026-07-22T12:00:00.000Z',
          route: 'content-update' as const,
        },
        {
          sceneVersionId: '88888888-8888-4888-8888-888888888888',
          kind: 'expression' as const,
          savedAt: '2026-07-21T12:00:00.000Z',
          route: 'safety-stop' as const,
        },
      ]),
    }));

    expect(await screen.findByText('内容已更新，请回到场景页重新选择。'))
      .toBeInTheDocument();
    expect(screen.getByText('这条内容已停止展示，请优先查看安全支持。'))
      .toBeInTheDocument();
    expect(screen.queryByText(/第一念|我的假设|孩子/)).not.toBeInTheDocument();
  });

  it('offers a retry after a repository error and does not invent fallback progress', async () => {
    const user = userEvent.setup();
    const getPrivateProgress = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(privateProgress);
    renderPage(repositoryWith({ getPrivateProgress }));

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法加载成长记录');
    expect(screen.queryByText('25 点')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('25 点')).toBeInTheDocument();
    expect(getPrivateProgress).toHaveBeenCalledTimes(2);
  });
});
