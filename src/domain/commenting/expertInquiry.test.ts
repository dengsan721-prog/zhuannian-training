import { describe, expect, it } from 'vitest';
import { auditGeneratedComment, buildExpertInquiry } from './expertInquiry';
import { generateComments } from './generateComments';

describe('buildExpertInquiry', () => {
  it('asks for observable facts when the input is only a judgment', () => {
    const inquiry = buildExpertInquiry('他就是不懂事');

    expect(inquiry.status).toBe('needs-detail');
    expect(inquiry.headline).toBe('先把评价换成事实');
    expect(inquiry.questions).toContain('我看到的是一个动作、一句话，还是我对他的判断？');
  });

  it('keeps boundaries when questioning a negative scene', () => {
    const inquiry = buildExpertInquiry('孩子骂人，还骂同学。');

    expect(inquiry.status).toBe('ready');
    expect(inquiry.tone).toBe('uncomfortable');
    expect(inquiry.headline).toBe('先承认伤人，再寻找善意');
    expect(inquiry.questions).toContain('这件事里伤人的地方是什么，我要守住哪条边界？');
    expect(inquiry.questions).toContain('我怎样说，才是不纵容行为，也不否定这个人？');
  });
});

describe('auditGeneratedComment', () => {
  it('accepts a negative-scene comment only when it has first person, boundary, and kind reading', () => {
    const result = generateComments({
      relationshipType: 'general',
      observation: '孩子骂人，还骂同学。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const audit = auditGeneratedComment(result.cards[0].text, 'uncomfortable');

    expect(audit.passed).toBe(true);
    expect(audit.issues).not.toContain('missing-first-person');
    expect(audit.issues).not.toContain('missing-boundary');
    expect(audit.issues).not.toContain('missing-kind-reading');
  });
});
