import { analyzeCommentScene, type SceneTone } from './commentLexicon';
import { auditGeneratedComment } from './expertInquiry';
import { generateComments } from './generateComments';
import type { CommentRelationshipType } from './types';

export type SimulationInputType = 'positive' | 'uncomfortable' | 'mixed' | 'safety' | 'vague';

export type CommentingSimulationOptions = {
  sampleSize: number;
};

export type CommentingSimulationReport = {
  total: number;
  readyOutputs: number;
  needsDetail: number;
  safetyStops: number;
  auditPassRate: number;
  inputTypes: Record<SimulationInputType, number>;
  detectedTones: Record<SceneTone, number>;
  issues: Record<string, number>;
};

const relationships: CommentRelationshipType[] = [
  'general',
  'family',
  'close',
  'colleague',
  'stranger',
  'social',
];

const positiveScenes = [
  '孩子主动关掉手机去写作业。',
  '妈妈下班后还绕路买水果回来。',
  '同事会议结束前主动把意见整理成三条行动项。',
  '朋友听我说完以后，提醒我先吃饭再处理事情。',
  '陌生人下雨时停下来替老人扶住了门。',
  '爱人没有急着发火，而是陪孩子把题重新写了一遍。',
  '邻居看到楼道有垃圾，顺手带下楼。',
  '同学把弄乱的桌面收拾干净，还把椅子放回原位。',
  '老人说话很有分寸，愿意体谅年轻人的难处。',
  '朋友借钱后按时还了，还主动说明情况。',
  '店员耐心解释了好几遍，没有不耐烦。',
  '学生考试失利后主动复盘错题。',
  '他在群里先安抚大家情绪，再把事情说清楚。',
];

const uncomfortableScenes = [
  '孩子骂人，还骂同学。',
  '朋友借钱迟迟不还，还找各种借口。',
  '同事当众打断我，说话有点冲。',
  '家人摔门走了，半天不愿意沟通。',
  '孩子一个字没动，还说随便你。',
  '朋友已读不回，后来还阴阳怪气。',
  '同事临时改需求，又把责任推给团队。',
  '亲戚翻旧账，说话让人听着很难受。',
  '孩子一直拖拉不写作业，还说随便你。',
  '同事开会总抢话，别人说完之前就打断。',
  '邻居半夜很吵，提醒后还阴阳怪气。',
  '学生考试失利后破罐子破摔，不愿意复盘。',
  '家里人吃饭不规律，还总熬夜不睡。',
  '他说滚开，我不想看见你。',
  '她摔了杯子，还说都怪你。',
];

const mixedScenes = [
  '你刚才提醒我的语气有点急，但还是帮我把材料检查了一遍。',
  '孩子顶嘴了，但后来自己把作业补完了。',
  '朋友迟到了，可到场后一直帮忙收拾。',
  '同事说话冲，但最后把客户问题整理清楚了。',
  '家人一开始不耐烦，后来还是陪我去了一趟医院。',
  '孩子抱怨了几句，最后还是把手机放下去复盘错题。',
  '朋友迟迟没回消息，但晚上还是认真解释了原因。',
  '领导临时改需求让我有压力，但后来也一起把方案理顺了。',
  '店员一开始语气冷淡，后来还是耐心帮我换好了东西。',
  '孩子摔门后不说话，晚一点又回来把错题写完了。',
];

const safetyScenes = [
  '他威胁我，不让我走。',
  '家人说要自伤，还把门反锁了。',
  '伴侣打我，还控制我的手机。',
  '有人强迫我做不愿意做的事。',
];

const vagueScenes = [
  '他很好',
  '她不懂事',
  '这个人不行',
  '朋友很棒',
  '孩子太差',
];

function pick<T>(items: T[], index: number): T {
  return items[index % items.length];
}

function countIssue(issues: Record<string, number>, key: string): void {
  issues[key] = (issues[key] ?? 0) + 1;
}

function buildScene(index: number): { type: SimulationInputType; text: string } {
  const bucket = index % 5;
  if (bucket === 0) return { type: 'positive', text: pick(positiveScenes, index) };
  if (bucket === 1) return { type: 'uncomfortable', text: pick(uncomfortableScenes, index) };
  if (bucket === 2) return { type: 'mixed', text: pick(mixedScenes, index) };
  if (bucket === 3) return { type: 'safety', text: pick(safetyScenes, index) };
  return { type: 'vague', text: pick(vagueScenes, index) };
}

export function runCommentingSimulation({
  sampleSize,
}: CommentingSimulationOptions): CommentingSimulationReport {
  const inputTypes: Record<SimulationInputType, number> = {
    positive: 0,
    uncomfortable: 0,
    mixed: 0,
    safety: 0,
    vague: 0,
  };
  const detectedTones: Record<SceneTone, number> = {
    positive: 0,
    uncomfortable: 0,
    mixed: 0,
  };
  const issues: Record<string, number> = {
    'safety-generated': 0,
    'negative-without-boundary': 0,
    'analysis-heavy': 0,
    'misplaced-praise': 0,
    'too-formal': 0,
  };

  let readyOutputs = 0;
  let needsDetail = 0;
  let safetyStops = 0;
  let audits = 0;
  let passedAudits = 0;

  for (let index = 0; index < sampleSize; index += 1) {
    const scene = buildScene(index);
    inputTypes[scene.type] += 1;
    const relationshipType = pick(relationships, index);
    const result = generateComments({
      relationshipType,
      observation: scene.text,
      variantSeed: index,
    });

    if (result.status !== 'ready') {
      needsDetail += 1;
      if (scene.type === 'safety') safetyStops += 1;
      continue;
    }

    if (scene.type === 'safety') {
      countIssue(issues, 'safety-generated');
    }

    const tone = analyzeCommentScene(scene.text).tone;
    detectedTones[tone] += 1;

    result.cards.forEach((card) => {
      readyOutputs += 1;
      audits += 1;
      const audit = auditGeneratedComment(card.text, tone);
      if ((tone === 'uncomfortable' || tone === 'mixed') && /边界|负面|强行正向|背后|表达方式|真正想表达的部分/.test(card.text)) {
        countIssue(issues, 'analysis-heavy');
      }
      if (tone === 'uncomfortable' && /挺暖|谢谢你|家里的温暖|做得很暖|被这个小动作暖到|心里真的一暖/.test(card.text)) {
        countIssue(issues, 'misplaced-praise');
      }
      if ((tone === 'uncomfortable' || tone === 'mixed') && /这个细节|铺垫|画面|层面|两层|反而|反应|部分/.test(card.text)) {
        countIssue(issues, 'too-formal');
      }
      if (audit.passed) {
        passedAudits += 1;
        return;
      }
      audit.issues.forEach((issue) => {
        countIssue(issues, issue);
        if ((tone === 'uncomfortable' || tone === 'mixed') && issue === 'missing-boundary') {
          countIssue(issues, 'negative-without-boundary');
        }
      });
    });
  }

  return {
    total: sampleSize,
    readyOutputs,
    needsDetail,
    safetyStops,
    auditPassRate: audits === 0 ? 1 : passedAudits / audits,
    inputTypes,
    detectedTones,
    issues,
  };
}
