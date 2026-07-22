import { describe, expect, it } from 'vitest';
import { validScene } from '../../test/fixtures/scene';
import type { SceneVersion } from './types';
import { validateScene } from './validateScene';

const validStopScene: SceneVersion = {
  ...validScene,
  riskLevel: 'stop',
  thoughtOptions: [],
  predictionOptions: [],
  hypotheses: [],
  evidenceChecks: [],
  controllabilityQuestion: null,
  strengthLens: undefined,
  boundary: null,
  newExpression: null,
  microAction: null,
  fallbackPlan: null,
  safetyRoute: {
    heading: '先保护安全',
    body: '停止普通训练，优先离开危险并联系可信任的人。',
    actions: ['exit', 'trusted-support', 'local-emergency', 'safety-report'],
  },
};

describe('validateScene', () => {
  it('accepts a complete standard scene', () => {
    expect(validateScene(validScene).slug).toBe('phone-time-overrun');
  });

  it('rejects a scene without competing hypotheses', () => {
    expect(() => validateScene({ ...validScene, hypotheses: [validScene.hypotheses[0]] }))
      .toThrow('at least two hypotheses');
  });

  it.each([
    ['duplicate id', [validScene.hypotheses[0], { ...validScene.hypotheses[1], id: validScene.hypotheses[0].id }]],
    ['duplicate text', [validScene.hypotheses[0], { ...validScene.hypotheses[1], text: ` ${validScene.hypotheses[0].text} ` }]],
  ])('rejects hypotheses with %s', (_case, hypotheses) => {
    expect(() => validateScene({ ...validScene, hypotheses }))
      .toThrow('unique ids and texts');
  });

  it('rejects a strength label presented as a verified trait', () => {
    expect(() => validateScene({
      ...validScene,
      strengthLens: [{
        id: 'autonomy-signal',
        possibility: '这体现了正在发展的自主意识。',
        evidencePrompt: '他是否也能在其他情境中表达并承担选择？',
      }],
    })).toThrow('uncertainty language');
  });

  it.each([
    ['benevolent', '他就是在保护一天里少有的自主时间。'],
    ['constraint', '他就是缺少从娱乐切换到任务的能力。'],
  ] as const)('rejects a %s hypothesis presented as a verified fact', (kind, text) => {
    expect(() => validateScene({
      ...validScene,
      hypotheses: validScene.hypotheses.map((item) => item.kind === kind
        ? { ...item, text }
        : item),
    })).toThrow('positive hypothesis requires uncertainty language');
  });

  it('requires an immediate safety route for stop scenes', () => {
    expect(() => validateScene({ ...validStopScene, safetyRoute: null }))
      .toThrow('safety route');
  });

  it('accepts a stop scene containing only safety-routing content', () => {
    expect(validateScene(validStopScene).riskLevel).toBe('stop');
  });

  it.each([
    ['empty heading', { heading: '', body: '停止普通训练，优先离开危险并联系可信任的人。', actions: ['exit', 'trusted-support'] }],
    ['empty body', { heading: '先保护安全', body: '', actions: ['exit', 'trusted-support'] }],
  ])('rejects an incomplete safety route: %s', (_case, safetyRoute) => {
    expect(() => validateScene({ ...validStopScene, safetyRoute })).toThrow();
  });

  it.each([
    ['missing exit', ['trusted-support', 'safety-report']],
    ['missing trusted support', ['exit', 'safety-report']],
    ['duplicate action', ['exit', 'trusted-support', 'exit']],
  ])('rejects invalid safety actions: %s', (_case, actions) => {
    expect(() => validateScene({
      ...validStopScene,
      safetyRoute: { ...validStopScene.safetyRoute!, actions },
    })).toThrow('unique exit and trusted-support actions');
  });

  it.each<readonly [keyof SceneVersion, unknown]>([
    ['thoughtOptions', validScene.thoughtOptions],
    ['predictionOptions', validScene.predictionOptions],
    ['hypotheses', validScene.hypotheses],
    ['evidenceChecks', validScene.evidenceChecks],
    ['controllabilityQuestion', validScene.controllabilityQuestion],
    ['strengthLens', validScene.strengthLens],
    ['boundary', validScene.boundary],
    ['newExpression', validScene.newExpression],
    ['microAction', validScene.microAction],
    ['fallbackPlan', validScene.fallbackPlan],
  ])('rejects stop-scene ordinary content in %s', (field, value) => {
    expect(() => validateScene({ ...validStopScene, [field]: value }))
      .toThrow('must not contain ordinary reframe content');
  });

  it('requires each of the six evidence check IDs exactly once for ordinary scenes', () => {
    expect(() => validateScene({
      ...validScene,
      evidenceChecks: [...validScene.evidenceChecks.slice(0, 5), validScene.evidenceChecks[0]],
    })).toThrow('all six unique evidence checks required');
  });

  it('requires the scene code prefix to match the relationship', () => {
    expect(() => validateScene({ ...validScene, sceneCode: 'FR-003' }))
      .toThrow('sceneCode relationship mismatch');
  });
});
