import type {
  MilestoneBadge,
  UnlockedSurprise,
} from './types';

type BadgeRule = {
  key: MilestoneBadge['key'];
  label: string;
  earned: (scenes: number, reviews: number) => boolean;
};

type SurpriseRule = {
  key: UnlockedSurprise['key'];
  label: UnlockedSurprise['label'];
  earned: (scenes: number, reviews: number) => boolean;
};

export const badgeLabels: Record<MilestoneBadge['key'], string> = {
  'first-scene': '第一次转念',
  'five-scenes': '看见五个新可能',
  'ten-reviews': '完成十次复盘',
};

export const badgeRules: readonly BadgeRule[] = [
  {
    key: 'first-scene',
    label: badgeLabels['first-scene'],
    earned: (scenes) => scenes >= 1,
  },
  {
    key: 'five-scenes',
    label: badgeLabels['five-scenes'],
    earned: (scenes) => scenes >= 5,
  },
  {
    key: 'ten-reviews',
    label: badgeLabels['ten-reviews'],
    earned: (_scenes, reviews) => reviews >= 10,
  },
];

export const surpriseRules: readonly SurpriseRule[] = [
  {
    key: 'five-scene-observation-card',
    label: '隐藏观察卡',
    earned: (scenes) => scenes >= 5,
  },
  {
    key: 'ten-review-family-lens',
    label: '家庭关系多面镜',
    earned: (_scenes, reviews) => reviews >= 10,
  },
];
