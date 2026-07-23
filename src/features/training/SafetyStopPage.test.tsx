import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import { validPublishedScene } from '../../test/fixtures/scene';
import { SafetyStopPage } from './SafetyStopPage';

describe('SafetyStopPage', () => {
  afterEach(cleanup);

  it('renders the governed safety route without ordinary training content', () => {
    const scene: PublishedSceneVersion = {
      ...validPublishedScene,
      riskLevel: 'stop',
      hypotheses: [],
      strengthLens: undefined,
      boundary: null,
      newExpression: null,
      microAction: null,
      fallbackPlan: null,
      safetyRoute: {
        heading: '先离开当前危险环境',
        body: '如果能够安全离开，请先前往有人可以提供帮助的地方。',
        actions: ['exit', 'trusted-support', 'local-emergency', 'safety-report'],
      },
    };

    render(
      <SafetyStopPage
        scene={scene}
        context={{ sceneVersionId: scene.id, source: 'server' }}
      />,
    );

    expect(screen.getByRole('heading', { name: '先离开当前危险环境' })).toBeInTheDocument();
    expect(screen.getByText('优先保护你和相关人的安全')).toBeInTheDocument();
    expect(screen.getByText(/当地紧急服务/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出训练' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '联系可信任的人' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '请求转交安全支持' })).toBeInTheDocument();
    expect(screen.queryByText(/一种需要验证的可能|品格种子|自主意识/)).not.toBeInTheDocument();
    expect(screen.queryByText(validPublishedScene.newExpression!)).not.toBeInTheDocument();
  });

  it('uses the reviewed generic fallback and emits only a consented handoff intent', async () => {
    const user = userEvent.setup();
    const onReportHandoff = vi.fn();

    render(
      <SafetyStopPage
        scene={{ ...validPublishedScene, safetyRoute: null }}
        context={{
          sceneVersionId: validPublishedScene.id,
          source: 'user',
          signalCode: 'user_declared_danger',
        }}
        onReportHandoff={onReportHandoff}
      />,
    );

    expect(screen.getByRole('heading', { name: '优先保护你和相关人的安全' }))
      .toBeInTheDocument();
    expect(screen.getByText(/若能够安全离开/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '请求转交安全支持' }));
    expect(onReportHandoff).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/报告已创建/)).not.toBeInTheDocument();
  });

  it('truthfully explains local-only safety actions when no handler exists', async () => {
    const user = userEvent.setup();
    render(
      <SafetyStopPage
        scene={null}
        context={{ sceneVersionId: validPublishedScene.id, source: 'server' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '联系可信任的人' }));
    expect(screen.getByText(/本页不会代你发送消息/)).toHaveAttribute('role', 'status');

    await user.click(screen.getByRole('button', { name: '请求转交安全支持' }));
    expect(screen.getByText(/只保留在本页，尚未提交/)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/报告已创建/)).not.toBeInTheDocument();
  });
});
