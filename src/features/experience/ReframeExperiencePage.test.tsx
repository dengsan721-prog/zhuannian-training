import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ReframeExperiencePage } from './ReframeExperiencePage';

function renderExperience() {
  render(
    <MemoryRouter>
      <ReframeExperiencePage />
    </MemoryRouter>,
  );
}

async function completeScene(sceneName: string, thoughtName: string) {
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', {
    name: `选择场景：${sceneName}`,
  }));
  await user.click(screen.getByRole('button', { name: thoughtName }));
  await user.click(screen.getByRole('button', { name: '先看见隐藏的力量' }));

  return user;
}

describe('ReframeExperiencePage', () => {
  afterEach(cleanup);

  it('completes one reframe in four screens and lights one private key', async () => {
    renderExperience();

    expect(screen.getByRole('heading', { name: '今天，先转一个念头' }))
      .toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^选择场景：/ })).toHaveLength(12);

    await completeScene('孩子考试没有考好', '他就是不努力，说多少遍都没用');

    expect(screen.getByRole('heading', { name: '转念一刻' })).toBeInTheDocument();
    expect(screen.getByText(/这张卷子没替他说好话/)).toBeInTheDocument();
    expect(screen.getByText('下一次孩子带回一张分数不理想的试卷时。'))
      .toBeInTheDocument();
    expect(screen.getByText(/我们先把最容易补上的那一题弄懂/))
      .toBeInTheDocument();
    expect(screen.getByText(/你拿到试卷后愿意标错题、改错题/))
      .toBeInTheDocument();
    expect(screen.getByText('已点亮 1 / 12 个幸福密码')).toBeInTheDocument();
  });

  it('keeps the safety link visible during the training screens', async () => {
    const user = userEvent.setup();
    renderExperience();

    await user.click(screen.getByRole('button', {
      name: '选择场景：孩子考试没有考好',
    }));
    expect(screen.getByRole('link', { name: '这里存在伤害或危险' }))
      .toHaveAttribute('href', '/support');

    await user.click(screen.getByRole('button', {
      name: '他就是不努力，说多少遍都没用',
    }));
    expect(screen.getByRole('link', { name: '这里存在伤害或危险' }))
      .toHaveAttribute('href', '/support');

    await user.click(screen.getByRole('button', { name: '先守住事实和边界' }));
    expect(screen.getByRole('link', { name: '这里存在伤害或危险' }))
      .toHaveAttribute('href', '/support');
  });

  it('can reset screens while keeping private progress for unique keys only', async () => {
    renderExperience();
    const user = await completeScene('孩子考试没有考好', '他就是不努力，说多少遍都没用');

    await user.click(screen.getByRole('button', { name: '换一个场景' }));
    expect(screen.getByRole('heading', { name: '今天，先转一个念头' }))
      .toBeInTheDocument();
    expect(screen.getByText('已点亮 1 / 12 个幸福密码')).toBeInTheDocument();

    await completeScene('孩子考试没有考好', '他就是不努力，说多少遍都没用');
    expect(screen.getByText('已点亮 1 / 12 个幸福密码')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再练一次' }));
    expect(screen.getByRole('heading', { name: '你的第一念是什么？' }))
      .toBeInTheDocument();
    expect(screen.getByText('孩子考试没有考好')).toBeInTheDocument();
  });

  it('shows a private milestone after three different keys are lit', async () => {
    renderExperience();

    let user = await completeScene('孩子考试没有考好', '他就是不努力，说多少遍都没用');
    expect(screen.queryByText('你已经开始看见第一念之外的可能'))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '换一个场景' }));
    user = await completeScene('伴侣两个小时没有回复消息', '他就是故意不理我');
    expect(screen.queryByText('你已经开始看见第一念之外的可能'))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '换一个场景' }));
    await completeScene('朋友升职买房发朋友圈', '别人都起来了，只有我还在原地');

    expect(screen.getByText('你已经开始看见第一念之外的可能'))
      .toBeInTheDocument();
  });
});
