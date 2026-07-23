import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { buildFeedback } from '../../domain/training/buildFeedback';
import type { CompletionResult } from '../../domain/progress/types';
import { completedTrainingDraft } from '../../test/fixtures/training';
import { CompletionPage } from './CompletionPage';

const completionId = '55555555-5555-4555-8555-555555555555';

function renderPage(
  result: CompletionResult,
  withPersonalFeedback = true,
) {
  const completedDraft = completedTrainingDraft();
  return render(
    <MemoryRouter>
      <CompletionPage
        result={result}
        feedback={withPersonalFeedback
          ? buildFeedback(completedDraft.scene, completedDraft)
          : undefined}
        headingRef={createRef<HTMLHeadingElement>()}
      />
    </MemoryRouter>,
  );
}

describe('CompletionPage', () => {
  afterEach(cleanup);

  it('shows personalized feedback and a new award only after a confirmed new completion', () => {
    renderPage({
      completionId,
      awarded: true,
      pointsDelta: 10,
    });

    expect(screen.getByRole('heading', { name: '转念一刻' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('训练完成，获得 10 点转念力');
    expect(screen.getByText('事实没有改变，但我多了两种解释和一个可控动作'))
      .toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续选择场景' }))
      .toHaveAttribute('href', '/scenes');
    expect(screen.getByRole('link', { name: '查看我的转念力' }))
      .toHaveAttribute('href', '/progress');
    expect(screen.getByRole('link', { name: '稍后复盘' }))
      .toHaveAttribute('href', `/reviews/${completionId}`);
  });

  it('uses non-shaming already-recorded copy without inventing an award', () => {
    renderPage({
      completionId,
      awarded: false,
      pointsDelta: 0,
    });

    expect(screen.getByRole('status')).toHaveTextContent('完成已记录');
    expect(screen.queryByText(/获得\s*10|训练完成/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '转念一刻' })).toBeInTheDocument();
  });

  it('shows only a generic result after a hard-refresh retry', () => {
    renderPage({
      completionId,
      awarded: false,
      pointsDelta: 0,
    }, false);

    expect(screen.getByRole('heading', { name: '完成已记录' })).toBeInTheDocument();
    expect(screen.queryByText('我愿意继续核对的可能')).not.toBeInTheDocument();
    expect(screen.queryByText('第一念')).not.toBeInTheDocument();
  });
});
