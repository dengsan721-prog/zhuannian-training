import { describe, expect, it } from 'vitest';
import { generateComments } from './generateComments';

describe('generateComments', () => {
  it('asks for a concrete detail instead of inventing evidence for vague input', () => {
    expect(generateComments({
      relationshipType: 'family',
      observation: '他很好',
    })).toEqual({
      status: 'needs-detail',
      message: '再给我一个小细节吧：他具体做了什么，或说了哪句话？',
    });
  });

  it('creates three distinct styles that reuse the observable behavior', () => {
    const result = generateComments({
      relationshipType: 'stranger',
      observation: '刚才下雨，一个年轻人自己淋着雨，还停下来替后面的老人扶住了门。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    expect(result.cards.map((card) => card.title)).toEqual([
      '温暖真诚',
      '生动有画面',
      '简洁有力量',
    ]);
    expect(result.cards).toHaveLength(3);
    for (const card of result.cards) {
      expect(card.text).toContain('下雨');
      expect(card.text).toContain('老人');
      expect(card.text).toContain('扶住');
      expect(card.text).toContain('我');
      expect(card.text).toContain('你');
      expect(card.text).not.toMatch(/你就是一个|足以证明|永远/);
      expect(card.text).not.toMatch(/一个人的修养|这个普通时刻|社会的温度/);
    }
    expect(new Set(result.cards.map((card) => card.text)).size).toBe(3);
  });

  it('builds heartfelt first-person comments with evidence, meaning, and impact', () => {
    const result = generateComments({
      relationshipType: 'general',
      observation: '晚饭后，他看见水池里还有碗，就没说什么，自己把碗洗了。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('洗了');
      expect(card.text).toContain('我');
      expect(card.text).toContain('你');
      expect(card.text).toMatch(/看见|注意到|记得|留意/);
      expect(card.text).toMatch(/放在心上|在意|体谅|照顾|担当|分担/);
      expect(card.text).toMatch(/安心|被照顾|愿意靠近|心里一软|心里一暖|轻松一点|踏实/);
      expect(card.text.length).toBeGreaterThanOrEqual(90);
      expect(card.text).not.toMatch(/你真棒|你很好|很棒/);
    }
  });

  it('does not repeat the same stock phrase inside one generated card', () => {
    const result = generateComments({
      relationshipType: 'general',
      observation: '晚饭后，他看见水池里还有碗，就没说什么，自己把碗洗了。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      const stockPhraseCount = card.text.match(/不是一句漂亮话/g)?.length ?? 0;
      expect(stockPhraseCount).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    ['对方今天穿了一件黑色衣服，整个人看起来很干净。', /分寸|精神|舒服|审美/],
    ['三个孩子一起做事，他能主动分清每个人适合做什么。', /能力|判断|安排|看人/],
    ['孩子以前写拼音很难看，今天一笔一画写得整齐多了。', /变化|进步|一点点|坚持/],
    ['厨师长今天做的素菜，比肉菜还好吃。', /真实感受|好吃|手艺|用心/],
    ['他下班后绕路去买水果，提了很远才回来。', /辛苦|不容易|惦记|跑一趟/],
    ['我爱人慢慢培养孩子看电视的习惯，没有急着发火。', /学到|耐心|方法|稳住/],
    ['我安排任务时，他主动帮我找场地，还把细节确认好了。', /人品|人格|靠谱|托付/],
  ])('extracts a fitting comment angle for positive scenes: %s', (
    observation,
    expectedMeaning,
  ) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    expect(result.cards.map((card) => card.text).join(' ')).toMatch(expectedMeaning);
  });

  it.each([
    ['他答应的事都守信，做人表里如一。', /诚信|守信|表里如一/],
    ['她朋友遇到困难时主动帮忙，还很会照顾人。', /乐于助人|会照顾人|关爱他人/],
    ['他做事有计划，提前把步骤列好。', /做事有计划|有条理|安排/],
    ['他遇到分歧没有计较，愿意听别人说完。', /宽容|善于聆听|有容忍心/],
    ['孩子做题时一直很专心，错了也愿意改。', /专心|不冲动|有责任心|坚持/],
  ])('uses the advantage checklist as positive strength references: %s', (
    observation,
    expectedStrength,
  ) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    expect(result.cards.map((card) => card.text).join(' ')).toMatch(expectedStrength);
  });

  it('keeps safety-risk input out of positive reframing', () => {
    const result = generateComments({
      relationshipType: 'close',
      observation: '他说要打我，还把门反锁不让我走。',
    });

    expect(result).toEqual({
      status: 'needs-detail',
      message: '这类内容不适合强行正向点评。请先保护安全、联系可信任的人或当地紧急服务。',
    });
  });

  it('can rotate a replacement line for the same style without changing facts', () => {
    const first = generateComments({
      relationshipType: 'colleague',
      observation: '会议快结束时，她主动把大家零散的意见整理成三条行动项。',
      variantSeed: 0,
    });
    const second = generateComments({
      relationshipType: 'colleague',
      observation: '会议快结束时，她主动把大家零散的意见整理成三条行动项。',
      variantSeed: 1,
    });

    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('expected ready comments');
    }
    expect(first.cards[0].text).not.toBe(second.cards[0].text);
    expect(second.cards[0].text).toContain('会议');
    expect(second.cards[0].text).toContain('行动项');
  });

  it('turns observed third-person facts into direct first-person words to the other person', () => {
    const result = generateComments({
      relationshipType: 'colleague',
      observation: '会议快结束时，她主动把大家零散的意见整理成三条行动项。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('我');
      expect(card.text).toContain('你主动');
      expect(card.text).not.toContain('她主动');
    }
  });

  it('has enough warm line reserves for repeated replacement without feeling thin', () => {
    const lines = Array.from({ length: 8 }, (_, variantSeed) => {
      const result = generateComments({
        relationshipType: 'family',
        observation: '晚饭后，他看见水池里还有碗，就没说什么，自己把碗洗了。',
        variantSeed,
      });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') throw new Error('expected ready comments');
      return result.cards.find((card) => card.style === 'warm')?.text ?? '';
    });

    expect(new Set(lines).size).toBeGreaterThanOrEqual(6);
    for (const line of lines) {
      expect(line).toContain('我');
      expect(line).toContain('你');
      expect(line).toMatch(/心里|踏实|记得|温暖|认真|舒服|被照顾/);
    }
  });

  it('finds a kind reading in uncomfortable words without pretending they felt good', () => {
    const result = generateComments({
      relationshipType: 'family',
      observation: '刚才孩子皱着眉顶嘴说：你烦不烦，别管我。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('我');
      expect(card.text).toContain('你');
      expect(card.text).toMatch(/不好受|有点刺|不舒服|听着会难受/);
      expect(card.text).toMatch(/可能|也许|我愿意先理解|我猜你/);
      expect(card.text).toMatch(/不是不在乎|想把自己的空间守住|急着表达|不知道怎么好好说/);
      expect(card.text).toMatch(/不等于|下次|但我也希望|我会更容易听进去/);
      expect(card.text).not.toMatch(/你就是|永远|证明|应该原谅/);
    }
  });

  it('separates the person from the hurtful delivery in negative scenes', () => {
    const result = generateComments({
      relationshipType: 'general',
      observation: '孩子骂人，骂人，骂同学',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('骂同学');
      expect(card.text).toMatch(/不好受|不舒服|伤人|难受/);
      expect(card.text).toMatch(/不想把你整个人|把你这个人和刚才的说法分开|不把你定在这一句话里/);
      expect(card.text).toMatch(/真正想表达|重新说|换个方式|慢一点/);
      expect(card.text).not.toMatch(/做得很暖|谢谢你|你真棒/);
    }
  });

  it('does not praise insulting classmates as a warm family action', () => {
    const result = generateComments({
      relationshipType: 'family',
      observation: '孩子骂人，骂人，骂同学',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('骂同学');
      expect(card.text).toMatch(/不好受|不赞成|不能这样说|伤人/);
      expect(card.text).toMatch(/可能|也许|我愿意先理解|我猜你/);
      expect(card.text).toMatch(/委屈|着急|没找到更好的说法|不知道怎么好好说/);
      expect(card.text).toMatch(/重新说|换个说法|下次|不等于/);
      expect(card.text).not.toMatch(/家里的温暖|顺手又用心|谢谢你|挺暖|做得很暖/);
    }
  });

  it.each([
    ['family' as const, '孩子回家后一直不写作业，还说作业太多了。'],
    ['close' as const, '朋友约好七点见面，结果迟到了半小时，只说路上耽误了。'],
    ['colleague' as const, '同事在群里阴阳怪气，说这个方案一看就不行。'],
    ['family' as const, '孩子摔门说不想上学了。'],
  ])('uses the negative-scene structure for %s input: %s', (
    relationshipType,
    observation,
  ) => {
    const result = generateComments({ relationshipType, observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('我');
      expect(card.text).toContain('你');
      expect(card.text).toMatch(/不好受|有压力|担心|不舒服|有点刺|着急|会难受/);
      expect(card.text).toMatch(/可能|也许|我愿意先理解|我猜你/);
      expect(card.text).toMatch(/需要|压力|着急|委屈|担心|没找到更好的说法|想把事情做好|想保护/);
      expect(card.text).toMatch(/不等于|下次|重新|换个说法|先把|我会更容易/);
      expect(card.text).not.toMatch(/心里真的一暖|挺暖|做得很暖|谢谢你让|家里的温暖/);
    }
  });

  it.each([
    '孩子骂了同学，说你脑子有病。',
    '他说滚开，我不想看见你。',
    '她摔了杯子，还说都怪你。',
    '同事当众否定我，说这个方案烂透了。',
    '朋友一直已读不回，还在朋友圈发阴阳怪气的话。',
    '孩子骗我说作业写完了，其实一个字没动。',
    '他答应帮忙，最后临时放鸽子。',
    '她翻白眼说随便你，爱怎样怎样。',
  ])('recognizes everyday negative behavior and language: %s', (observation) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('我');
      expect(card.text).toMatch(/不好受|有压力|担心|不舒服|有点刺|会难受|不太舒服|伤人/);
      expect(card.text).toMatch(/可能|也许|我愿意先理解|我猜你/);
      expect(card.text).toMatch(/真正想表达|没找到更好的说法|重新说|换个方式|慢一点|需要/);
      expect(card.text).not.toMatch(/心里真的一暖|挺暖|做得很暖|谢谢你让|被这个小动作暖到|很舒服/);
    }
  });

  it.each([
    '孩子写作业拖拉磨蹭，不爱听父母说话。',
    '夫妻吵架后冷战，一直不回家。',
    '朋友相处时缺乏信任，沟通误会很多。',
    '同事之间价值观冲突，沟通不畅。',
    '工作上一直拖延逃避，畏难情绪严重，还拒绝沟通。',
  ])('uses the happiness checklist as negative references: %s', (observation) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toMatch(/不好受|有压力|担心|不舒服|有点刺|会难受|不太舒服|伤人/);
      expect(card.text).toMatch(/可能|也许|我愿意先理解|我猜你/);
      expect(card.text).not.toMatch(/心里真的一暖|挺暖|做得很暖|谢谢你让|很舒服/);
    }
  });

  it.each([
    '孩子沉迷手机，一说学习就顶嘴。',
    '老人说话总是指责别人，还经常翻旧账。',
    '夫妻之间总是互相抱怨，谁也不愿意先沟通。',
    '朋友借钱迟迟不还，还找各种借口。',
    '同事开会总抢话，别人说完之前就打断。',
    '领导临时改需求，还把责任推给团队。',
    '学生考试失利后破罐子破摔，不愿意复盘。',
    '邻居半夜很吵，提醒后还阴阳怪气。',
    '店员态度冷淡，一直不耐烦。',
    '家里人吃饭不规律，还总熬夜不睡。',
    '他在群里发牢骚，传播负面情绪。',
  ])('covers broad everyday negative domains: %s', (observation) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toMatch(/不好受|有压力|担心|不舒服|有点刺|会难受|不太舒服|伤人/);
      expect(card.text).toMatch(/可能|也许|我愿意先理解|我猜你/);
      expect(card.text).not.toMatch(/心里真的一暖|挺暖|做得很暖|谢谢你让|很舒服/);
    }
  });

  it.each([
    ['孩子主动关掉手机去写作业。', /自律|自我管理|有责任心/],
    ['老人说话很有分寸，愿意体谅年轻人的难处。', /宽容|体谅|有分寸/],
    ['爱人忙完一天还记得问我累不累。', /关爱|体贴|惦记/],
    ['朋友借钱后按时还了，还主动说明情况。', /守信|靠谱|有交代/],
    ['同事开会时认真听完别人的想法再补充。', /善于聆听|尊重他人|团队合作/],
    ['领导出问题时先承担责任，再带大家复盘。', /有担当|领导力|责任感/],
    ['学生考试失利后主动复盘错题。', /复盘|上进|愿意成长/],
    ['邻居看到门口有垃圾，顺手帮忙带下楼。', /爱护环境|乐于助人|体贴/],
    ['店员耐心解释了好几遍，没有不耐烦。', /耐心|服务意识|情绪稳定/],
    ['家里人开始早睡早起，还坚持运动。', /自律|健康意识|坚持/],
    ['他在群里先安抚大家情绪，再把事情说清楚。', /情绪稳定|会沟通|善于组织/],
  ])('covers broad everyday positive domains: %s', (
    observation,
    expectedStrength,
  ) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    expect(result.cards.map((card) => card.text).join(' ')).toMatch(expectedStrength);
  });

  it.each([
    ['孩子主动关掉手机去写作业。', /场地|水果|绕路|提着东西/],
    ['他遇到分歧没有计较，愿意听别人说完。', /场地|水果|绕路|提着东西/],
    ['爱人忙完一天还记得问我累不累。', /场地|水果|绕路|提着东西/],
  ])('does not leak unrelated example scenes into positive comments: %s', (
    observation,
    unrelatedScene,
  ) => {
    const result = generateComments({ relationshipType: 'general', observation });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    expect(result.cards.map((card) => card.text).join(' ')).not.toMatch(unrelatedScene);
  });

  it('keeps the boundary visible when a scene mixes hurtful delivery with care', () => {
    const result = generateComments({
      relationshipType: 'colleague',
      observation: '你刚才提醒我的语气有点急，但还是帮我把材料检查了一遍。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('语气有点急');
      expect(card.text).toContain('材料检查');
      expect(card.text).toMatch(/我会有压力|我当下有点紧|听起来会有点冲/);
      expect(card.text).toMatch(/也谢谢你|我也看见|还是把事情放在心上/);
      expect(card.text).toMatch(/下次|慢一点|换个方式|我会更容易接住/);
    }
  });

  it('uses plain face-to-face language for common negative scenes', () => {
    const result = generateComments({
      relationshipType: 'general',
      observation: '孩子骂人，还骂同学。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toContain('你');
      expect(card.text).toContain('我');
      expect(card.text).toMatch(/这句话|这样说|刚才/);
      expect(card.text).toMatch(/听着会难受|听着不舒服|我不赞成/);
      expect(card.text).toMatch(/我不想把你整个人定在这里|我想把你这个人和刚才的说法分开|我还是愿意相信你里面有/);
      expect(card.text).toMatch(/委屈|着急|在意|想保护自己|想被听见/);
      expect(card.text).toMatch(/重新说|换个说法|慢一点说/);
      expect(card.text).not.toMatch(/边界|负面|反应|表达方式|真正想表达的部分|强行正向|背后/);
    }
  });

  it('does not produce analysis-heavy stock wording for avoidance scenes', () => {
    const result = generateComments({
      relationshipType: 'family',
      observation: '孩子一直拖拉不写作业，还说随便你。',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready comments');
    for (const card of result.cards) {
      expect(card.text).toMatch(/我会担心|我有点着急|我听着会有压力|我心里会紧/);
      expect(card.text).toMatch(/怕自己做不好|不想被催|需要一点缓冲|心里有压力/);
      expect(card.text).toMatch(/我们先从一小步开始|你换个说法告诉我|我们重新说一遍|下次慢一点说/);
      expect(card.text).not.toMatch(/这个细节|铺垫|画面|层|反而|正向点评/);
    }
  });
});
