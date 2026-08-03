import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentingPage } from './CommentingPage';

describe('CommentingPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('generates three copy-ready comment cards from one concrete observation', async () => {
    const user = userEvent.setup();
    render(<CommentingPage />);

    expect(screen.getByRole('heading', { name: '点评工具' })).toBeInTheDocument();
    expect(screen.getByText('学会说话，矛盾自化')).toBeInTheDocument();
    expect(screen.queryByText('关系类型')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '家人' })).not.toBeInTheDocument();
    expect(screen.getByText(
      '写下家人、亲属、同事、朋友圈或陌生人的一个真实动作、一句话或一个小细节。',
    )).toBeInTheDocument();
    expect(screen.getAllByText('先写一个看得见的细节')).not.toHaveLength(0);
    expect(screen.getByLabelText('专家质询')).toHaveTextContent('我看到的是一个动作、一句话，还是我对他的判断？');
    await user.type(
      screen.getByLabelText('写下你看见的一幕'),
      '刚才下雨，一个年轻人自己淋着雨，还停下来替后面的老人扶住了门。',
    );
    expect(screen.getByText('可以生成了')).toBeInTheDocument();
    expect(screen.getByText('这类内容会从具体动作里提炼善意、能力和人品。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成可直接说出口的点评' }));

    expect(screen.getByText('最推荐')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '温暖真诚' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '生动有画面' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '简洁有力量' })).toBeInTheDocument();
    expect(screen.getByTestId('comment-card-warm')).toHaveClass('comment-card-featured');
    expect(screen.getAllByRole('button', { name: '复制' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: '换一句' })).toHaveLength(3);
    expect(screen.getAllByText('⧉')).toHaveLength(3);
    expect(screen.getAllByText('↻')).toHaveLength(3);
    const results = screen.getByLabelText('生成的三种点评');
    expect(results.textContent).toContain('扶住');
    expect(results.textContent).toContain('你自己淋着雨');
    expect(results.textContent).toContain('我');
    expect(results.textContent).not.toContain('一个年轻人自己淋着雨');
  });

  it('asks for a concrete detail when the observation is vague', async () => {
    const user = userEvent.setup();
    render(<CommentingPage />);

    await user.type(screen.getByLabelText('写下你看见的一幕'), '他很好');
    expect(screen.getByText('再补一个具体动作')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成可直接说出口的点评' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '再给我一个小细节吧：他具体做了什么，或说了哪句话？',
    );
    expect(screen.queryByRole('heading', { name: '温暖真诚' })).not.toBeInTheDocument();
  });

  it('rotates one card when changing a sentence', async () => {
    const user = userEvent.setup();
    render(<CommentingPage />);

    await user.type(
      screen.getByLabelText('写下你看见的一幕'),
      '会议快结束时，她主动把大家零散的意见整理成三条行动项。',
    );
    await user.click(screen.getByRole('button', { name: '生成可直接说出口的点评' }));
    const before = screen.getByTestId('comment-card-warm').textContent;

    await user.click(screen.getAllByRole('button', { name: '换一句' })[0]);

    expect(screen.getByTestId('comment-card-warm').textContent).not.toBe(before);
    expect(screen.getByTestId('comment-card-warm')).toHaveTextContent('会议');
  });

  it('copies a card to the clipboard when available', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<CommentingPage />);

    await user.type(
      screen.getByLabelText('写下你看见的一幕'),
      '会议快结束时，她主动把大家零散的意见整理成三条行动项。',
    );
    await user.click(screen.getByRole('button', { name: '生成可直接说出口的点评' }));
    await user.click(screen.getAllByRole('button', { name: '复制' })[0]);

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('会议'));
    expect(screen.getByRole('status')).toHaveTextContent('已复制');
  });

  it('guides negative scenes toward a kind interpretation without approving the hurtful behavior', async () => {
    const user = userEvent.setup();
    render(<CommentingPage />);

    await user.type(
      screen.getByLabelText('写下你看见的一幕'),
      '孩子骂人，还骂同学。',
    );

    expect(screen.getByText('先稳住边界，再找善意')).toBeInTheDocument();
    expect(screen.getByText('我会先承认这句话让人不舒服，再看见背后的着急、在意或不会表达。')).toBeInTheDocument();
    expect(screen.getByLabelText('专家质询')).toHaveTextContent('这件事里伤人的地方是什么，我要守住哪条边界？');
    expect(screen.getByLabelText('专家质询')).toHaveTextContent('我怎样说，才是不纵容行为，也不否定这个人？');
  });
});
