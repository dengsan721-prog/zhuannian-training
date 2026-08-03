import {
  analyzeCommentScene,
  type SceneTone,
} from './commentLexicon';

export type ExpertInquiryStatus = 'needs-detail' | 'ready' | 'safety-stop';

export type ExpertInquiry = {
  status: ExpertInquiryStatus;
  tone: SceneTone | 'vague' | 'safety';
  label: string;
  headline: string;
  summary: string;
  questions: string[];
};

export type CommentAuditIssue =
  | 'missing-first-person'
  | 'missing-direct-address'
  | 'missing-boundary'
  | 'missing-kind-reading'
  | 'too-short'
  | 'too-abstract';

export type CommentAudit = {
  passed: boolean;
  issues: CommentAuditIssue[];
};

const safetyPatterns = [
  /打我|打人|殴打|暴力|威胁|反锁|不让我走|控制|自杀|自伤|虐待|侵犯|强迫/,
];

const concretePatterns = /，|。|、|说|问|做|帮|扶|骂|吵|哭|笑|写|拿|给|替|陪|等|摔|发火|提醒|整理|检查|迟到|借口|关掉|还钱|道歉|收拾|洗|确认|安排/;
const judgmentOnlyPatterns = /不懂事|没良心|太差|很差|不好|不行|很棒|很好|真好|坏|懒|自私|讨厌/;

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function hasConcreteDetail(value: string): boolean {
  if (value.length < 8) return false;
  if (judgmentOnlyPatterns.test(value) && !concretePatterns.test(value)) return false;
  return concretePatterns.test(value);
}

function baseQuestions(): string[] {
  return [
    '我看到的是一个动作、一句话，还是我对他的判断？',
    '如果我要当面说，这句话听起来像不像家常话？',
    '这句点评有没有让对方感觉被看见，而不是被教育？',
  ];
}

export function buildExpertInquiry(observation: string): ExpertInquiry {
  const value = normalize(observation);
  if (!value) {
    return {
      status: 'needs-detail',
      tone: 'vague',
      label: '专家质询',
      headline: '先写一个看得见的细节',
      summary: '先别急着夸或评判，把你看见的一句话、一个动作写下来。',
      questions: baseQuestions(),
    };
  }

  if (safetyPatterns.some((pattern) => pattern.test(value))) {
    return {
      status: 'safety-stop',
      tone: 'safety',
      label: '专家质询',
      headline: '先保护安全，不做普通点评',
      summary: '涉及暴力、控制、自伤或强迫时，先保护人身安全，不能强行转成优点。',
      questions: [
        '现在有没有人身安全风险？',
        '我需要联系可信任的人或当地紧急服务吗？',
        '这件事是否已经超出普通沟通点评的范围？',
      ],
    };
  }

  if (!hasConcreteDetail(value)) {
    return {
      status: 'needs-detail',
      tone: 'vague',
      label: '专家质询',
      headline: '先把评价换成事实',
      summary: '现在更像结论。补一句当时他说了什么、做了什么，生成会更准。',
      questions: baseQuestions(),
    };
  }

  const insight = analyzeCommentScene(value);
  if (insight.tone === 'uncomfortable') {
    return {
      status: 'ready',
      tone: 'uncomfortable',
      label: '专家质询',
      headline: '先承认伤人，再寻找善意',
      summary: '负面不是拿来洗白的，要先承认不舒服，再看见背后可能没说好的需要。',
      questions: [
        '这件事里伤人的地方是什么，我要守住哪条边界？',
        '对方背后可能是在着急、在意、害怕，还是不会表达？',
        '我怎样说，才是不纵容行为，也不否定这个人？',
      ],
    };
  }

  if (insight.tone === 'mixed') {
    return {
      status: 'ready',
      tone: 'mixed',
      label: '专家质询',
      headline: '把不舒服和好意分开说',
      summary: '混合场景要两层都说清楚：方式可能让人紧，后面的行动也值得被看见。',
      questions: [
        '哪一部分让我不舒服？',
        '哪一个动作说明对方仍然在意或愿意补位？',
        '我怎样把边界和感谢放在同一句家常话里？',
      ],
    };
  }

  return {
    status: 'ready',
    tone: 'positive',
    label: '专家质询',
    headline: '从小动作里提炼具体优点',
    summary: '正面场景不要空夸，要说出我看见了什么、我有什么感受、我学到了什么。',
    questions: [
      '这个动作体现的是能力、辛苦、变化、品格，还是让我真实有感受？',
      '我能不能用“我看到……”开头，而不是给对方贴标签？',
      '这句话发出去后，对方会不会觉得真诚、具体、舒服？',
    ],
  };
}

export function auditGeneratedComment(text: string, tone: SceneTone): CommentAudit {
  const issues: CommentAuditIssue[] = [];
  if (!/我/.test(text)) issues.push('missing-first-person');
  if (!/你/.test(text)) issues.push('missing-direct-address');
  if (text.length < 36) issues.push('too-short');
  if (/很好|很棒|不错/.test(text) && !/因为|这个细节|这件事|这一/.test(text)) {
    issues.push('too-abstract');
  }

  if (tone === 'uncomfortable' || tone === 'mixed') {
    if (!/不等于|不赞成|不接受|边界|伤人|不舒服|难受|下次|换个方式|重新说/.test(text)) {
      issues.push('missing-boundary');
    }
    if (!/可能|也许|我猜你|不是.*不在乎|着急|在意|压力|担心|委屈|需要|不会.*说/.test(text)) {
      issues.push('missing-kind-reading');
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
