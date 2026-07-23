import {
  type RefObject,
  useEffect,
  useRef,
} from 'react';
import { Link } from 'react-router-dom';
import type { CompletionResult } from '../../domain/progress/types';
import type { TrainingFeedback } from '../../domain/training/types';
import { CompletionFeedback } from '../training/CompletionFeedback';

type CompletionPageProps = {
  result: CompletionResult;
  feedback?: TrainingFeedback;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

export function CompletionPage({
  result,
  feedback,
  headingRef,
}: CompletionPageProps) {
  const fallbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const resolvedHeadingRef = headingRef ?? fallbackHeadingRef;

  useEffect(() => {
    resolvedHeadingRef.current?.focus();
  }, [resolvedHeadingRef]);

  return (
    <section className="completion-page">
      {feedback ? (
        <CompletionFeedback feedback={feedback} headingRef={resolvedHeadingRef} />
      ) : (
        <h1 ref={resolvedHeadingRef} tabIndex={-1}>完成已记录</h1>
      )}

      <p className="completion-result" role="status">
        {result.awarded
          ? '训练完成，获得 10 点转念力'
          : '完成已记录'}
      </p>

      <nav className="completion-actions" aria-label="完成后的选择">
        <Link className="primary-action" to="/scenes">继续选择场景</Link>
        <Link className="secondary-action" to="/progress">查看我的转念力</Link>
        <Link
          className="secondary-action"
          to={`/reviews/${result.completionId}`}
        >
          稍后复盘
        </Link>
      </nav>
    </section>
  );
}
