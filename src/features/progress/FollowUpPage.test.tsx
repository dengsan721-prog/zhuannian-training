import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';
import { FollowUpPage } from './FollowUpPage';

const completionId = '55555555-5555-4555-8555-555555555555';
const reviewId = '66666666-6666-4666-8666-666666666666';
const eventId = '77777777-7777-4777-8777-777777777777';

function repositoryWith(
  saveReview: ProgressRepository['saveReview'] = vi.fn(async () => ({
    reviewId,
    awarded: true as const,
    pointsDelta: 5 as const,
  })),
): ProgressRepository {
  return {
    complete: vi.fn(),
    saveReview,
    setSaved: vi.fn(),
    listSaved: vi.fn(async () => []),
    getPendingReview: vi.fn(async () => null),
    getPrivateProgress: vi.fn(),
  };
}

function renderPage(repository: ProgressRepository, id = completionId) {
  return render(
    <MemoryRouter>
      <FollowUpPage repository={repository} completionId={id} />
    </MemoryRouter>,
  );
}

async function fillReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: '我尝试过' }));
  await user.click(screen.getByRole('radio', { name: '有帮助' }));
  await user.click(screen.getByRole('radio', { name: '这个可能得到一些支持' }));
  await user.click(screen.getByRole('radio', { name: '继续练习' }));
}

describe('FollowUpPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('submits only one boolean and the three controlled enums without free text', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(eventId);
    const saveReview = vi.fn(async () => ({
      reviewId,
      awarded: true as const,
      pointsDelta: 5 as const,
    }));
    const repository = repositoryWith(saveReview);
    const user = userEvent.setup();
    renderPage(repository);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/备注|孩子姓名|补充说明/)).not.toBeInTheDocument();
    await fillReview(user);
    await user.click(screen.getByRole('button', { name: '记录这次复盘' }));

    expect(saveReview).toHaveBeenCalledWith({
      completionId,
      attempted: true,
      observation: 'helpful',
      hypothesisResult: 'supported',
      nextDirection: 'repeat',
      idempotencyKey: eventId,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('复盘已记录，获得 5 点转念力');
  });

  it('offers support voluntarily only after an explicit support selection', async () => {
    const user = userEvent.setup();
    renderPage(repositoryWith());

    expect(screen.queryByRole('link', { name: '了解可选支持' }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '我需要更多支持' }));

    expect(screen.getByRole('link', { name: '了解可选支持' }))
      .toHaveAttribute('href', '/support');
    expect(screen.getByRole('link', { name: '了解可选支持' }))
      .toHaveClass('secondary-action');
    expect(screen.getByText(/不会自动通知教练/)).toBeInTheDocument();
  });

  it('retries an unknown response with the same frozen review and key', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(eventId);
    const saveReview = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        reviewId,
        awarded: false,
        pointsDelta: 0,
      });
    const user = userEvent.setup();
    renderPage(repositoryWith(saveReview));

    await fillReview(user);
    await user.click(screen.getByRole('button', { name: '记录这次复盘' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('复盘记录尚未确认');
    expect(screen.queryByText(/复盘已记录|获得 5/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重试记录' }));
    expect(await screen.findByRole('status')).toHaveTextContent('复盘已记录');
    expect(saveReview).toHaveBeenCalledTimes(2);
    expect(saveReview.mock.calls[1]).toEqual(saveReview.mock.calls[0]);
  });

  it.each([
    'review_already_recorded',
    'database_integrity_failure',
  ])('does not retry or celebrate deterministic review error %s', async (errorName) => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(eventId);
    const saveReview = vi.fn(async () => {
      throw new Error(errorName);
    });
    const user = userEvent.setup();
    renderPage(repositoryWith(saveReview));

    await fillReview(user);
    await user.click(screen.getByRole('button', { name: '记录这次复盘' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '复盘记录未通过核对',
    );
    expect(screen.queryByRole('button', { name: '重试记录' }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/复盘已记录|获得\s*5/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回我的转念力' }))
      .toHaveAttribute('href', '/progress');
  });

  it('fails closed for an invalid completion route without calling the repository', () => {
    const repository = repositoryWith();
    renderPage(repository, 'not-a-uuid');

    expect(screen.getByRole('alert')).toHaveTextContent('复盘链接无效');
    expect(repository.saveReview).not.toHaveBeenCalled();
  });
});
