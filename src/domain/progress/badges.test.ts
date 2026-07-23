import { describe, expect, it } from 'vitest';
import {
  badgeLabels,
  badgeRules,
  surpriseRules,
} from './badges';

describe('private progress milestone rules', () => {
  it.each([
    [0, 0, []],
    [1, 0, ['first-scene']],
    [4, 9, ['first-scene']],
    [5, 9, ['first-scene', 'five-scenes']],
    [1, 10, ['first-scene', 'ten-reviews']],
  ])(
    'derives deterministic badges for %i scenes and %i reviews',
    (scenes, reviews, expected) => {
      expect(
        badgeRules
          .filter((rule) => rule.earned(scenes, reviews))
          .map((rule) => rule.key),
      ).toEqual(expected);
    },
  );

  it('keeps the three badge labels constant and ordered', () => {
    expect(badgeRules.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'first-scene', label: '第一次转念' },
      { key: 'five-scenes', label: '看见五个新可能' },
      { key: 'ten-reviews', label: '完成十次复盘' },
    ]);
    expect(badgeLabels).toEqual({
      'first-scene': '第一次转念',
      'five-scenes': '看见五个新可能',
      'ten-reviews': '完成十次复盘',
    });
  });

  it('unlocks the ten-review surprise independently of scene count', () => {
    expect(
      surpriseRules
        .filter((rule) => rule.earned(1, 10))
        .map(({ key, label }) => ({ key, label })),
    ).toEqual([
      {
        key: 'ten-review-family-lens',
        label: '家庭关系多面镜',
      },
    ]);
  });
});
