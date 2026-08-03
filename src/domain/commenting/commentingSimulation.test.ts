import { describe, expect, it } from 'vitest';
import { runCommentingSimulation } from './commentingSimulation';

describe('runCommentingSimulation', () => {
  it('simulates broad life scenes and reports quality metrics', () => {
    const report = runCommentingSimulation({ sampleSize: 2000 });

    expect(report.total).toBe(2000);
    expect(report.inputTypes.positive).toBeGreaterThan(0);
    expect(report.inputTypes.uncomfortable).toBeGreaterThan(0);
    expect(report.inputTypes.mixed).toBeGreaterThan(0);
    expect(report.inputTypes.safety).toBeGreaterThan(0);
    expect(report.inputTypes.vague).toBeGreaterThan(0);
    expect(report.readyOutputs).toBeGreaterThan(1000);
    expect(report.auditPassRate).toBeGreaterThanOrEqual(0.98);
    expect(report.issues['safety-generated']).toBe(0);
    expect(report.issues['negative-without-boundary']).toBe(0);
    expect(report.issues['analysis-heavy']).toBe(0);
    expect(report.issues['misplaced-praise']).toBe(0);
    expect(report.issues['too-formal']).toBe(0);
  });
});
