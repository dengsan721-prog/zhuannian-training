import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  afterEach(cleanup);

  it('renders the adult-only service boundary', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByText('转念训练')).toBeInTheDocument();
    expect(screen.getByText('仅面向成年人')).toBeInTheDocument();
  });

  it('guides a learner through one family action training loop', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);

    await user.click(screen.getByRole('button', {
      name: /开始训练：我一开口，家人就烦/,
    }));
    await user.type(screen.getByLabelText('刚才我最容易说出口的旧反应'), '你怎么又这样');
    await user.click(screen.getByRole('radio', {
      name: /先说事实，再说请求/,
    }));
    await user.click(screen.getByRole('button', { name: '生成今晚行动卡' }));

    expect(screen.getByText(/24小时内只做一件事/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('我做了什么'), '我先停三秒，说了一句事实');
    await user.type(screen.getByLabelText('对方怎么回应'), '孩子没有马上顶回来');
    await user.type(screen.getByLabelText('和以前有什么不同'), '我没有继续追着讲道理');
    await user.click(screen.getByRole('button', { name: '完成本次训练' }));

    expect(screen.getByRole('heading', { name: '我不是懂了，是做到了' }))
      .toBeInTheDocument();
    expect(screen.getByText(/下次线下课可以拿这三行反馈复盘/))
      .toBeInTheDocument();
  });
});
