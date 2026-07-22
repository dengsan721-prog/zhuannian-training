import { describe, expect, it } from 'vitest';
import { validScene } from '../../test/fixtures/scene';
import { validateScene } from './validateScene';

describe('validateScene', () => {
  it('accepts a complete standard scene', () => {
    expect(validateScene(validScene).slug).toBe('phone-time-overrun');
  });

  it('rejects a scene without competing hypotheses', () => {
    expect(() => validateScene({ ...validScene, hypotheses: [validScene.hypotheses[0]] }))
      .toThrow('at least two hypotheses');
  });

  it('requires an immediate safety route for stop scenes', () => {
    expect(() => validateScene({
      ...validScene,
      riskLevel: 'stop',
      thoughtOptions: [], predictionOptions: [], hypotheses: [], evidenceChecks: [],
      controllabilityQuestion: null, strengthLens: [], boundary: null,
      newExpression: null, microAction: null, fallbackPlan: null, safetyRoute: null,
    })).toThrow('safety route');
  });

  it('accepts a stop scene containing only safety-routing content', () => {
    const stopScene = {
      ...validScene,
      riskLevel: 'stop' as const,
      thoughtOptions: [], predictionOptions: [], hypotheses: [], evidenceChecks: [],
      controllabilityQuestion: null, strengthLens: [], boundary: null,
      newExpression: null, microAction: null, fallbackPlan: null,
      safetyRoute: {
        heading: '先保护安全',
        body: '停止普通训练，优先离开危险并联系可信任的人。',
        actions: ['exit', 'trusted-support', 'local-emergency', 'safety-report'],
      },
    };
    expect(validateScene(stopScene).riskLevel).toBe('stop');
  });

  it('rejects ordinary reframe content on stop scenes', () => {
    expect(() => validateScene({
      ...validScene,
      riskLevel: 'stop',
      safetyRoute: { heading: '先保护安全', body: '停止普通训练，优先离开危险并联系可信任的人。', actions: ['exit'] },
    })).toThrow('must not contain ordinary reframe content');
  });

  it('requires each of the six evidence check IDs exactly once for ordinary scenes', () => {
    expect(() => validateScene({
      ...validScene,
      evidenceChecks: [...validScene.evidenceChecks.slice(0, 5), validScene.evidenceChecks[0]],
    })).toThrow('all six unique evidence checks required');
  });
});
