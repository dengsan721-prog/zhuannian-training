import { describe, expect, it } from 'vitest';
import { happinessScenes } from './happinessScenes';

describe('happinessScenes', () => {
  it('publishes 12 unique classic scenes and every Happiness Key once', () => {
    expect(happinessScenes).toHaveLength(12);
    expect(new Set(happinessScenes.map((scene) => scene.id)).size).toBe(12);
    expect(happinessScenes.map((scene) => scene.primaryKey.id).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('keeps every scene concrete, bounded, actionable, and ready to speak', () => {
    for (const scene of happinessScenes) {
      expect(scene.firstThoughts).toHaveLength(3);
      expect(new Set(scene.firstThoughts.map((thought) => thought.id)).size).toBe(3);
      expect(scene.firstThoughts.every((thought) => thought.likelyDirection.length >= 12))
        .toBe(true);
      expect(scene.observableFact.length).toBeGreaterThanOrEqual(12);
      expect(scene.strengthView).toMatch(/也许|可能|或许|可以先|不等于/);
      expect(scene.evidencePrompt.length).toBeGreaterThanOrEqual(10);
      expect(scene.boundary.length).toBeGreaterThanOrEqual(10);
      expect(scene.newThought.length).toBeGreaterThanOrEqual(16);
      expect(scene.newExpression.length).toBeGreaterThanOrEqual(12);
      expect(scene.commentExpression.length).toBeGreaterThanOrEqual(14);
      expect(scene.microAction.length).toBeGreaterThanOrEqual(8);
      expect(scene.nextSceneCue.length).toBeGreaterThanOrEqual(8);
      expect(scene.passCriteria).toHaveLength(3);
      expect(scene.passCriteria.every((criterion) => criterion.length >= 8))
        .toBe(true);
    }
  });
});
