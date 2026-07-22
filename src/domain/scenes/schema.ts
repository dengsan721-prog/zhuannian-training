import { z } from 'zod';
import type { SceneVersion } from './types';

const hypothesis = z.object({
  id: z.string().min(1),
  kind: z.enum(['benevolent', 'constraint', 'boundary']),
  text: z.string().min(8),
  evidencePrompt: z.string().min(8),
});

const uncertaintyLanguage = /也许|可能|或许|有待确认|需要验证/;

const strengthPossibility = z.object({
  id: z.string().min(1),
  possibility: z.string().min(8)
    .regex(uncertaintyLanguage, 'strength possibility requires uncertainty language'),
  evidencePrompt: z.string().min(8),
});

const evidenceCheckId = z.enum([
  'recurrence',
  'known-facts',
  'assumptions',
  'danger',
  'directly-solvable',
  'next-need',
]);

const safetyAction = z.enum(['exit', 'trusted-support', 'local-emergency', 'safety-report']);

export const sceneSchema: z.ZodType<SceneVersion> = z.object({
  schemaVersion: z.literal(1),
  sceneCode: z.string().regex(/^(PC|FR)-\d{3}$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  title: z.string().min(4),
  category: z.string().min(2),
  relationship: z.enum(['parent-child', 'family']),
  applicability: z.array(z.string().min(2)).min(1),
  observableFacts: z.array(z.string().min(6)).min(1),
  riskLevel: z.enum(['standard', 'caution', 'stop']),
  stopConditions: z.array(z.string()).min(1),
  thoughtOptions: z.array(z.object({
    id: z.string(),
    label: z.string().min(4),
    likelyEmotion: z.string().min(2),
    likelyWords: z.string().min(4),
    likelyAction: z.string().min(4),
    possibleResponse: z.string().min(4),
  })),
  predictionOptions: z.array(z.string().min(4)),
  hypotheses: z.array(hypothesis),
  evidenceChecks: z.array(z.object({ id: evidenceCheckId, prompt: z.string().min(6) })),
  controllabilityQuestion: z.string().min(8).nullable(),
  strengthLens: z.array(strengthPossibility).optional(),
  boundary: z.string().min(8).nullable(),
  newExpression: z.string().min(8).nullable(),
  microAction: z.string().min(6).nullable(),
  fallbackPlan: z.string().min(8).nullable(),
  safetyRoute: z.object({
    heading: z.string().trim().min(4),
    body: z.string().trim().min(12),
    actions: z.array(safetyAction).min(2),
  }).nullable(),
  changeSummary: z.string().min(4),
}).superRefine((scene, ctx) => {
  if (scene.riskLevel === 'stop' && scene.safetyRoute === null) {
    ctx.addIssue({ code: 'custom', message: 'stop scenes require a safety route' });
  }

  if (scene.safetyRoute) {
    const safetyActions = new Set(scene.safetyRoute.actions);
    if (safetyActions.size !== scene.safetyRoute.actions.length
      || !safetyActions.has('exit') || !safetyActions.has('trusted-support')) {
      ctx.addIssue({
        code: 'custom',
        message: 'safety route requires unique exit and trusted-support actions',
      });
    }
  }

  if (scene.riskLevel === 'stop' && (
    scene.thoughtOptions.length > 0 || scene.predictionOptions.length > 0 || scene.hypotheses.length > 0
    || scene.evidenceChecks.length > 0 || scene.controllabilityQuestion !== null
    || (scene.strengthLens?.length ?? 0) > 0 || scene.boundary !== null
    || scene.newExpression !== null || scene.microAction !== null || scene.fallbackPlan !== null
  )) {
    ctx.addIssue({ code: 'custom', message: 'stop scenes must not contain ordinary reframe content' });
  }

  if (scene.riskLevel !== 'stop') {
    const kinds = new Set(scene.hypotheses.map((item) => item.kind));
    const hypothesisIds = new Set(scene.hypotheses.map((item) => item.id));
    const hypothesisTexts = new Set(scene.hypotheses.map((item) => item.text.trim()));
    const evidenceIds = new Set(scene.evidenceChecks.map((item) => item.id));
    const requiredEvidenceIds = ['recurrence', 'known-facts', 'assumptions', 'danger', 'directly-solvable', 'next-need'] as const;

    if (scene.thoughtOptions.length < 3) {
      ctx.addIssue({ code: 'custom', message: 'at least three thought options' });
    }
    if (scene.predictionOptions.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'at least two predictions' });
    }
    if (scene.hypotheses.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'at least two hypotheses' });
    }
    if (hypothesisIds.size !== scene.hypotheses.length
      || hypothesisTexts.size !== scene.hypotheses.length) {
      ctx.addIssue({ code: 'custom', message: 'hypotheses require unique ids and texts' });
    }
    if (scene.hypotheses.some((item) => item.kind !== 'boundary'
      && !uncertaintyLanguage.test(item.text))) {
      ctx.addIssue({
        code: 'custom',
        message: 'positive hypothesis requires uncertainty language',
      });
    }
    if (scene.evidenceChecks.length !== 6 || evidenceIds.size !== 6
      || requiredEvidenceIds.some((id) => !evidenceIds.has(id))) {
      ctx.addIssue({ code: 'custom', message: 'all six unique evidence checks required' });
    }
    if (!scene.controllabilityQuestion || !scene.boundary) {
      ctx.addIssue({ code: 'custom', message: 'ordinary scene evidence and boundary content required' });
    }
    if (!scene.newExpression || !scene.microAction || !scene.fallbackPlan) {
      ctx.addIssue({ code: 'custom', message: 'ordinary scene action content required' });
    }
    for (const kind of ['benevolent', 'constraint', 'boundary'] as const) {
      if (!kinds.has(kind)) {
        ctx.addIssue({ code: 'custom', message: `missing hypothesis kind: ${kind}` });
      }
    }
  }

  if ((scene.relationship === 'parent-child') !== scene.sceneCode.startsWith('PC-')) {
    ctx.addIssue({ code: 'custom', message: 'sceneCode relationship mismatch' });
  }
});
