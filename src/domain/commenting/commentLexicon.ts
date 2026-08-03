export type SceneTone = 'positive' | 'uncomfortable' | 'mixed';

export type CommentAngle =
  | 'appearance'
  | 'ability'
  | 'change'
  | 'feeling'
  | 'hardship'
  | 'learning'
  | 'character';

type LexiconRule = string | RegExp;

type SceneLexicon = {
  id: string;
  patterns: LexiconRule[];
};

type AngleLexicon = {
  angle: CommentAngle;
  patterns: LexiconRule[];
};

export type CommentSceneInsight = {
  tone: SceneTone;
  angle: CommentAngle;
  strengths: string[];
};

const negativeSceneLexicon: SceneLexicon[] = [
  {
    id: 'hurtful-language',
    patterns: [
      /骂(?:人|同学|了)?/,
      '滚开',
      '闭嘴',
      '脑子有病',
      '有病',
      '烂透',
      '一看就不行',
      '破罐子破摔',
      '随便你',
      '爱怎样怎样',
      '不想看见你',
      '烦不烦',
      '别管我',
      '发牢骚',
      '负面情绪',
    ],
  },
  {
    id: 'contempt-and-denial',
    patterns: [
      '阴阳怪气',
      '嘲笑',
      '讽刺',
      '翻白眼',
      '嫌弃',
      '当众否定',
      '否定我',
      '看不起',
      '反问',
      '缺乏信任',
      '价值观冲突',
      '抢话',
      '打断',
    ],
  },
  {
    id: 'conflict-behavior',
    patterns: [
      '顶嘴',
      '说话冲',
      '语气急',
      '语气有点急',
      '摔门',
      '摔杯子',
      '摔了',
      '都怪你',
      '抱怨',
      '指责',
      '不耐烦',
      '翻旧账',
      '吼',
      '发火',
      '生气',
      '半夜很吵',
    ],
  },
  {
    id: 'withdrawal-and-coldness',
    patterns: [
      '冷淡',
      '没回',
      '不回',
      '已读不回',
      '不理',
      '沉默',
      '转身走',
      '不沟通',
      '不想谈',
      '沟通误会',
      '沟通不畅',
      '拒绝沟通',
      '不愿意先沟通',
      '不愿意复盘',
    ],
  },
  {
    id: 'avoidance-and-responsibility',
    patterns: [
      '不写作业',
      '一个字没动',
      '拖拉',
      '迟到',
      '迟迟不还',
      '借口',
      '放鸽子',
      '没做',
      '没来',
      '临时取消',
      '临时改需求',
      '推给别人',
      '推给团队',
      '推卸责任',
      '找借口',
      '逃避',
      '畏难',
      '畏难情绪',
    ],
  },
  {
    id: 'dishonesty',
    patterns: [
      '撒谎',
      '骗',
      '骗我',
      '偷拿',
      '瞒着',
    ],
  },
  {
    id: 'health-and-habits',
    patterns: [
      '不规律',
      '吃饭不规律',
      '熬夜',
      '不睡',
      '不爱运动',
      '偏食',
      '挑食',
      '不爱喝水',
    ],
  },
];

const positiveSceneLexicon: SceneLexicon[] = [
  {
    id: 'care-and-support',
    patterns: ['主动', '帮', '扶', '替', '陪', '等', '让', '提醒', '照顾', '惦记', '问我累不累'],
  },
  {
    id: 'responsibility',
    patterns: ['整理', '检查', '收拾', '洗', '承担', '补位', '确认', '安排', '找场地', '按时还', '说明情况'],
  },
  {
    id: 'effort-and-growth',
    patterns: ['练', '坚持', '一笔一画', '整齐', '进步', '改了', '慢慢', '培养', '写作业', '复盘'],
  },
  {
    id: 'restraint',
    patterns: ['没有急着发火', '没急着发火', '没有发火', '没发火', '稳住', '安抚'],
  },
  {
    id: 'skill-and-feeling',
    patterns: ['好吃', '手艺', '能力', '分清', '适合做什么', '做得好', '干净', '听完', '补充'],
  },
];

const commentAngleLexicon: AngleLexicon[] = [
  {
    angle: 'learning',
    patterns: ['我爱人', '培养', '习惯', '没有急着发火', '没急着发火', '稳住', '方法', '复盘'],
  },
  {
    angle: 'character',
    patterns: ['问我累不累', '记得问', /问.*累不累/, '找场地', '确认', '主动帮', '承担', '补位', '靠谱', '托付', '没说什么'],
  },
  {
    angle: 'hardship',
    patterns: ['辛苦', '下班后', '绕路', '买水果', '提了很远', '跑一趟', '忙完', '忙完一天'],
  },
  {
    angle: 'feeling',
    patterns: ['好吃', '素菜', '肉菜', '厨师', '真实感受', '舒服', '感受'],
  },
  {
    angle: 'ability',
    patterns: ['三个孩子', '分清', '适合做什么', '能力', '判断', '安排任务', '方案', '整理成', '安抚', '说清楚'],
  },
  {
    angle: 'appearance',
    patterns: ['衣服', '穿', '黑色', '发型', '干净', '整个人', '精神'],
  },
  {
    angle: 'change',
    patterns: ['以前', '现在', '一笔一画', '整齐多了', '进步', '改了', '慢慢变好'],
  },
];

const positiveStrengthLexicon: Array<{
  strengths: string[];
  patterns: LexiconRule[];
}> = [
  {
    strengths: ['诚信', '守信', '表里如一'],
    patterns: ['诚信', '守信', '表里如一', '信守承诺', '说到做到', '按时还', '主动说明情况'],
  },
  {
    strengths: ['乐于助人', '关爱他人', '会照顾人'],
    patterns: ['主动帮', '帮忙', '照顾人', '关心', '扶', '替', '陪'],
  },
  {
    strengths: ['关爱', '体贴', '惦记'],
    patterns: ['问我累不累', '记得问', '惦记', '体贴', '关爱', /问.*累不累/],
  },
  {
    strengths: ['做事有计划', '有条理', '善于安排'],
    patterns: ['做事有计划', '步骤列好', '有条理', '安排', '提前'],
  },
  {
    strengths: ['宽容', '善于聆听', '有容忍心'],
    patterns: ['没有计较', '不计较', '听别人说完', '认真听完', '听完别人', '愿意听', '分歧', '宽容'],
  },
  {
    strengths: ['尊重他人', '团队合作', '善于聆听'],
    patterns: ['认真听完', '听完别人', '再补充', '别人说完', '团队合作'],
  },
  {
    strengths: ['自律', '自我管理', '有责任心'],
    patterns: ['关掉手机', '去写作业', '早睡早起', '坚持运动', '自律', '自我管理'],
  },
  {
    strengths: ['专心', '有责任心', '坚持'],
    patterns: ['专心', '错了也愿意改', '愿意改', '坚持', '负责', '写作业'],
  },
  {
    strengths: ['靠谱', '有担当', '值得托付'],
    patterns: ['找场地', '确认', '主动补位', '承担', '补位', '托付', '按时还', '有交代', '说明情况'],
  },
  {
    strengths: ['耐心', '方法感', '能稳住情绪'],
    patterns: ['培养', '习惯', '没有急着发火', '没急着发火', '稳住', '耐心解释'],
  },
  {
    strengths: ['情绪稳定', '会沟通', '善于组织'],
    patterns: ['安抚大家情绪', '安抚', '说清楚', '群里先', '组织'],
  },
  {
    strengths: ['上进', '愿意成长', '善于复盘'],
    patterns: ['主动复盘', '复盘错题', '复盘', '愿意成长', '上进'],
  },
  {
    strengths: ['爱护环境', '乐于助人', '体贴'],
    patterns: ['垃圾', '带下楼', '爱护环境', '顺手帮忙'],
  },
  {
    strengths: ['健康意识', '自律', '坚持'],
    patterns: ['早睡早起', '坚持运动', '健康意识'],
  },
];

const negativeDominantPatterns = [
  /骗|撒谎|其实.*(?:没|没有|一个字没动)/,
  /答应.*(?:最后|结果|临时).*(?:放鸽子|没来|没做|没帮|取消)/,
  /放鸽子/,
  /不写作业|拖拉磨蹭|不爱听|不愿意复盘|破罐子破摔/,
  /提醒后还.*(?:阴阳怪气|骂|吵|不耐烦)/,
  /还.*(?:阴阳怪气|骂|找借口|推给|拒绝沟通)/,
];

function matchesRule(value: string, rule: LexiconRule): boolean {
  if (typeof rule === 'string') return value.includes(rule);
  return rule.test(value);
}

function isNegatedNegativeWord(value: string, signal: string): boolean {
  if (/^(不|没|没有)/.test(signal)) return false;
  const index = value.indexOf(signal);
  if (index < 0) return false;
  const prefix = value.slice(Math.max(0, index - 5), index);
  return /没|没有|不/.test(prefix);
}

function hasNegativeSignal(value: string): boolean {
  return negativeSceneLexicon.some((category) => (
    category.patterns.some((pattern) => {
      if (typeof pattern !== 'string') return pattern.test(value);
      return value.includes(pattern) && !isNegatedNegativeWord(value, pattern);
    })
  ));
}

function hasPositiveSignal(value: string): boolean {
  return positiveSceneLexicon.some((category) => (
    category.patterns.some((pattern) => matchesRule(value, pattern))
  ));
}

function detectAngle(value: string): CommentAngle {
  return commentAngleLexicon.find((category) => (
    category.patterns.some((pattern) => matchesRule(value, pattern))
  ))?.angle ?? 'character';
}

function detectStrengths(value: string): string[] {
  const strengths = positiveStrengthLexicon
    .filter((category) => (
      category.patterns.some((pattern) => matchesRule(value, pattern))
    ))
    .flatMap((category) => category.strengths);
  return Array.from(new Set(strengths));
}

export function analyzeCommentScene(value: string): CommentSceneInsight {
  const negative = hasNegativeSignal(value);
  const positive = hasPositiveSignal(value);
  const negativeDominant = negativeDominantPatterns.some((pattern) => pattern.test(value));
  const angle = detectAngle(value);
  const strengths = detectStrengths(value);

  if (negative && negativeDominant) {
    return { tone: 'uncomfortable', angle, strengths };
  }

  if (negative && positive) {
    return { tone: 'mixed', angle, strengths };
  }

  if (negative) {
    return { tone: 'uncomfortable', angle, strengths };
  }

  return { tone: 'positive', angle, strengths };
}
