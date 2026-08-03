import {
  analyzeCommentScene,
  type CommentAngle,
} from './commentLexicon';
import type {
  CommentGenerationResult,
  CommentRelationshipType,
  GeneratedCommentCard,
} from './types';

type GenerateCommentsInput = {
  relationshipType: CommentRelationshipType;
  observation: string;
  variantSeed?: number;
};

type RelationshipCopy = {
  warm: string[];
  vivid: string[];
  concise: string[];
};

const detailPrompt = '再给我一个小细节吧：他具体做了什么，或说了哪句话？';
const safetyPrompt = '这类内容不适合强行正向点评。请先保护安全、联系可信任的人或当地紧急服务。';
const vagueInputs = new Set(['他很好', '她很好', '很好', '真好', '很棒', '你真棒']);
const safetyPatterns = [
  /打我|打人|殴打|暴力|威胁|反锁|不让我走|控制|自杀|自伤|虐待|侵犯|强迫/,
];

function normalizeObservation(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function toDirectAddressFact(value: string): string {
  return value
    .replace(/^(妈妈|爸爸|孩子|朋友|同事|家人|爱人|邻居|亲戚|陌生人|同学)(?=下班|主动|听|看|说|骂|顶嘴|迟到|一开始|借钱|已读|当众|临时|翻旧账|看到|没有|抱怨|摔门|一个字|会议|把)/, '你')
    .replace(/一个年轻人/g, '你')
    .replace(/他(?=主动|看见|自己|还|没|说|把|帮|停|做|拿|写|问|等|陪|整理|替|给|洗)/g, '你')
    .replace(/她(?=主动|看见|自己|还|没|说|把|帮|停|做|拿|写|问|等|陪|整理|替|给|洗)/g, '你')
    .replace(/他说/g, '你说')
    .replace(/她说/g, '你说');
}

function hasConcreteDetail(observation: string): boolean {
  if (vagueInputs.has(observation)) return false;
  return observation.length >= 8
    && /[，。、“”]|下雨|会议|整理|扶|说|做|停|帮|拿|写|问|等|陪/.test(observation);
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

const warmOpenings = [
  '{fact} 我当时心里真的一暖。',
  '我注意到这个细节的时候，心里挺踏实的：{fact}',
  '{fact} 我想认真跟你说一句，这事我记在心里了。',
  '刚才这一幕我挺有感觉的：{fact}',
  '{fact} 我没觉得这是小事，心里反而觉得很难得。',
  '{fact} 我心里其实挺被照顾到的。',
  '我刚才一直记得这个细节：{fact}',
  '{fact} 我越想越觉得，心里会被这种真实的心意打动。',
];

const vividOpenings = [
  '{fact} 那个画面我还挺记得的。',
  '我脑子里留下的是这个很具体的画面：{fact}',
  '{fact} 这不是一句漂亮话，是我真的看见了那个动作。',
  '刚才那一刻其实很生活：{fact}',
  '{fact} 我觉得动人的地方就在这里，没什么铺垫，但很真实。',
  '我看到这一幕的时候，第一反应就是：这个细节挺难得。{fact}',
  '{fact} 这一下不夸张，却让人心里很舒服。',
  '我会记住刚才那个小画面：{fact}',
];

const conciseOpenings = [
  '{fact} 我就想直接跟你说，这一下挺打动我的。',
  '{fact} 我心里挺认可你这个处理。',
  '{fact} 我觉得这事做得很暖，也很实在。',
  '{fact} 我看见了，心里也记下了。',
  '{fact} 我想把这句谢谢认真说给你听。',
  '{fact} 我觉得这不是客套，是真的让人舒服。',
  '{fact} 我挺佩服你能把这个小细节做到。',
  '{fact} 我当时就觉得，这句话/这个动作很有分量。',
];

const relationshipCopy: Record<CommentRelationshipType, RelationshipCopy> = {
  general: {
    warm: [
      '你可能没觉得这是多大的事，但我看见的是你愿意把眼前的人和事放在心上，也愿意替别人分担一点。',
      '这种细节不张扬，却会让人觉得被认真对待；我会安心，是因为里面有一份很实在的体谅。',
      '我心里会被触动，是因为这个动作里有一份真实的在意，也有一种不用别人开口你就愿意伸手的担当。',
    ],
    vivid: [
      '这个动作就落在生活里，很小却很有分量；我看见的是你把别人的不方便也放在心上。',
      '这个画面不大，却让人能感觉到你当时没有只顾自己，那份体谅会让旁边的人心里一软。',
      '它很生活，也很具体，所以比空泛夸奖更让人记得住，也让人更愿意靠近你。',
    ],
    concise: [
      '这件事我看见了，也真的放在心上；它让我觉得踏实，也让我更想把感谢说出口。',
      '这个细节挺真，也挺打动我，因为里面有在意、有照顾，也有替别人分担的心。',
      '我想认真说一句：这一下让我感觉很踏实，也让我看见你愿意把人放在心上的一面。',
    ],
  },
  family: {
    warm: [
      '你可能没觉得自己做了什么了不起的事，但家里有人这样默默补位，我心里真的会很踏实。',
      '这种时候我会觉得，家里的温暖不是靠大话撑起来的，就是靠你这种顺手又用心的小事。',
      '我平时不一定说得出口，但这样的细节会让我觉得，被家人放在心上。',
    ],
    vivid: [
      '它不像什么大场面，可放在一天的日子里，就会让人觉得家里有被照应的感觉。',
      '这种家常的小动作很容易被略过去，但我看到的时候，心里是有触动的。',
      '那一刻没有什么大道理，就是你把眼前的事接住了，我看着会觉得安心。',
    ],
    concise: [
      '这事不大，但我心里舒服，也谢谢你。',
      '我看到你在替家里分担，这句话我想认真说出来。',
      '有你这样搭把手，我心里会稳很多。',
    ],
  },
  close: {
    warm: [
      '你可能只是自然地做了，可我会觉得，亲近的人之间最让人踏实的就是这种时候靠得住。',
      '我心里会暖，是因为你不是嘴上说说，而是真的在那个细节里顾到了人。',
      '这种小事会让我觉得，跟你在一起不用总是绷着，心里会放松一点。',
    ],
    vivid: [
      '那个瞬间很普通，却有一种熟人之间才懂的分寸和照顾。',
      '我记住的不是事情有多大，而是你在那个当口没有把人晾在那里。',
      '这种细节很生活，也很见关系，看到的人心里会知道你是在意的。',
    ],
    concise: [
      '我心里有被你照顾到，真的。',
      '你这个细节让我觉得很踏实。',
      '我想直接说，你这样做挺暖的。',
    ],
  },
  colleague: {
    warm: [
      '你可能只是想把事情做好，但我作为一起做事的人，心里会很感谢这种靠谱。',
      '我会被打动，是因为你没有把麻烦丢在那里，而是安安静静把它接住了。',
      '跟你一起做事让人踏实，就是因为这些细节里能看见你愿意补位。',
    ],
    vivid: [
      '那个场面很具体：事情有点散，你把它往前推了一步，大家一下就轻松了。',
      '我看到的不是表现自己，而是你真的在替事情收口。',
      '这种处理很实在，不抢风头，但能让旁边的人明显松一口气。',
    ],
    concise: [
      '这一下很靠谱，我心里是服气的。',
      '你把事情接住了，我真的省心不少。',
      '跟你共事会踏实，就是因为这种细节。',
    ],
  },
  stranger: {
    warm: [
      '你可能只是顺手，但我在旁边看见，心里真的会觉得被这个小动作暖到。',
      '我们可能不认识，可这种细节会让人觉得，路上遇到的善意很真实。',
      '我想认真说声谢谢，因为你这个动作让旁边的人心里都软了一下。',
    ],
    vivid: [
      '那个画面很短，但我会记得：有人赶时间的时候，你还是多顾了一下身后的人。',
      '这不是刻意做给谁看，就是很自然的一下，所以反而更打动人。',
      '我看到的时候觉得，日子里让人舒服的地方，常常就是这种几秒钟的小善意。',
    ],
    concise: [
      '我看见了，真的谢谢你这个小动作。',
      '你可能觉得顺手，但我心里挺受触动的。',
      '这一下很暖，也很难得。',
    ],
  },
  social: {
    warm: [
      '我不是为了客套才评论，是看到这个细节以后，心里真的有点被触动。',
      '这条我看完会想停一下，因为里面有一种很真实、很用心的东西。',
      '我想认真留一句：这样的细节会让看到的人心里变柔软一点。',
    ],
    vivid: [
      '画面感很强，不是因为写得多热闹，而是那个细节本身很真。',
      '我读到这里的时候，脑子里能浮出那个场景，所以会被打动。',
      '这种内容好看，是因为它不飘，就落在一个真实的小动作里。',
    ],
    concise: [
      '我看完挺有触动，想认真给你点个赞。',
      '这个细节很真，也很打动我。',
      '我喜欢这条，不是热闹，是心里有东西。',
    ],
  },
};

const angleCopy: Record<CommentAngle, RelationshipCopy> = {
  appearance: {
    warm: [
      '我不是只看见外在好不好看，而是看见你把自己收拾得干净利落，那里面有一种让人舒服的分寸感。',
      '这件小事让我觉得，你对自己的状态是有要求的，也会把一份清爽和精神带给旁边的人。',
      '我看见的不只是衣服，而是你身上那种干净、稳妥、让人愿意靠近的审美和气质。',
    ],
    vivid: [
      '那种黑色穿在你身上不张扬，却很稳，整个人看起来精神，也让场面一下干净下来。',
      '外在其实会说话，你今天这个状态给人的感觉不是用力表现，而是很有分寸地把自己整理好了。',
      '这个画面很简单，可它让人觉得舒服：干净、稳、不过头，正好露出你的审美。',
    ],
    concise: [
      '你今天这样很有精神，也很有分寸感。',
      '这个状态让人看着舒服，干净又稳。',
      '我喜欢你这个审美，不张扬，但很有质感。',
    ],
  },
  ability: {
    warm: [
      '我看见的是你的判断能力：你不是随便安排，而是真的能看见每个人不同的特点。',
      '能把差别看清楚，又把事情安排顺，这里面有一种很难得的能力和耐心。',
      '我心里会佩服，是因为你不只是在做事，你是在认真看人、看局面、看怎么让事情更合适。',
    ],
    vivid: [
      '几个人摆在一起，别人可能只看见热闹，你能分清谁适合什么，这个判断很稳。',
      '你像是在把一堆线慢慢理顺：人有差别，事情也就有了更合适的位置。',
      '这个能力不吵不闹，但很有用，能让每个人都在合适的地方把力气用出来。',
    ],
    concise: [
      '你这个判断能力挺强，能看人，也能安排事。',
      '这一下很靠谱，不只是主动，是有判断。',
      '我看见你处理事情的能力了，稳，也细。',
    ],
  },
  change: {
    warm: [
      '我最想说的是这个变化：你不是一下子变好的，是一点点愿意练、愿意调整，我真的看见了。',
      '以前不容易的地方，今天能做得更整齐，这里面藏着你的坚持和认真。',
      '我会被触动，是因为进步不是喊出来的，是你一笔一画慢慢做出来的。',
    ],
    vivid: [
      '以前看着有点吃力，今天一笔一画整齐多了，这个前后变化很具体，也很让人心里亮一下。',
      '那个变化不是大张旗鼓的，可看得出来你在慢慢把自己往前带。',
      '我看到的不是一次结果，而是你一点点把难的地方磨顺了。',
    ],
    concise: [
      '我看见你的进步了，真的比以前稳了。',
      '这个变化很明显，也说明你在坚持。',
      '你是一点点练出来的，这个我很珍惜。',
    ],
  },
  feeling: {
    warm: [
      '我想说的是真实感受：这个味道让我觉得舒服，也能吃出你手艺里的用心。',
      '好吃不是客套，我是真的从这道菜里感受到你把火候、味道和人的口味都放在心上。',
      '这件事打动我的地方，是你让一个普通的菜也有了被认真对待的味道。',
    ],
    vivid: [
      '素菜能做得比肉菜还让人记住，这不是凑巧，是手艺和用心一起到了。',
      '这一口下去很实在，味道不抢，却让人愿意多夹一筷子。',
      '它好吃在那种家常又稳的地方，不靠重味道撑场面，是手上真有功夫。',
    ],
    concise: [
      '这道菜是真的好吃，不是客套。',
      '我能吃出你的手艺和用心。',
      '这个味道让我很舒服，也很服气。',
    ],
  },
  hardship: {
    warm: [
      '我看到的不只是水果，是你下班后还愿意绕路跑一趟、提很远回来的那份惦记。',
      '这件事让我心里很软，因为辛苦的部分你没有挂在嘴上，但我知道它不容易。',
      '你可能觉得只是买点东西，可我看见的是你把人放在心上，也愿意为这份惦记多走一段路。',
    ],
    vivid: [
      '下班后还绕路，手里提着东西走回来，这个画面很家常，也很能说明你心里装着人。',
      '水果不重在价格，重在那一趟路和那份没有说出口的惦记。',
      '这一路可能没什么人看见，但我知道那里面有辛苦，也有很实在的心意。',
    ],
    concise: [
      '这一趟辛苦了，我心里真的领情。',
      '你绕路买回来，这份惦记我看见了。',
      '东西不只是东西，里面有你的不容易。',
    ],
  },
  learning: {
    warm: [
      '我从你身上学到的是耐心：你没有急着发火，而是慢慢把孩子的习惯带出来。',
      '这件事让我佩服的是你的方法感，你先稳住自己，再一点点影响孩子。',
      '我看见你不是靠情绪压人，而是用耐心和节奏把事情往好的方向带。',
    ],
    vivid: [
      '很多时候一着急就容易吼出来，但你把那口气稳住了，用方法慢慢带孩子。',
      '你像是在给孩子搭台阶，不是一下把人推上去，而是一点点陪他形成习惯。',
      '这个过程不热闹，但很见功力：先稳住大人，再稳住孩子。',
    ],
    concise: [
      '我想跟你学这个耐心和方法。',
      '你能先稳住自己，这点很难得。',
      '你不是急着发火，是慢慢把习惯带出来。',
    ],
  },
  character: {
    warm: [
      '我看见的是你人品里很靠谱的一面：事情交到你手里，你会主动接住，还会把细节确认好。',
      '这种主动不是为了表现，而是让人觉得可以托付，心里会很踏实。',
      '我会愿意信任你，是因为你不只做表面的事，还会把别人没顾到的地方补上。',
    ],
    vivid: [
      '别人可能只看到一个小动作，我看到的是你把该接住的部分接住了，还让旁边的人心里松下来。',
      '这种靠谱很具体，不在嘴上，在你认真处理、愿意多顾一步的动作里。',
      '你像是把事情接到手里以后，又往前送了一步，让旁边的人心里松下来。',
    ],
    concise: [
      '你这个人很靠谱，事情交给你我踏实。',
      '这件小事里能看见你的人品和担当。',
      '你愿意多顾一步，这点真的很值得托付。',
    ],
  },
};

const warmClosings = [
  '这句话我想当面说给你听，不想让它就这么过去。',
  '你可能没放在心上，但我是真的记住了，也会因为这样的细节更安心。',
  '谢谢你，我心里是有感觉的，也有一种被照顾到的踏实。',
  '这种真诚的小事，真的会让人心里一暖，也会让关系更近一点。',
  '我想把这份感谢说清楚一点，不只是在心里想想。',
  '有些话不说出来就容易错过，所以我想认真告诉你。',
  '这让我觉得舒服，也让我更愿意靠近你。',
  '我知道这不是表演，所以才更打动我。',
];

const vividClosings = [
  '这事放在生活里特别家常，可也正因为家常，才让人觉得真。',
  '我喜欢这种不夸张的好，它不是喊出来的，是做出来的。',
  '它像日子里很小的一盏灯，不刺眼，但会让人心里安一下。',
  '我觉得动人的地方就是，你没有讲大道理，却把心意放在动作里了。',
  '这种细节很难装出来，所以我看到的时候会相信，也会觉得跟你相处更踏实。',
  '它不需要多解释，看到的人心里自然会懂。',
  '我会把这个画面记住，因为它真的挺有人味。',
  '这种舒服不是热闹，是很稳地落在心里的那一下。',
];

const conciseClosings = [
  '谢谢你，这份在意我收到了。',
  '我挺感动的，也觉得安心。',
  '这事我记下了，心里也踏实。',
  '我想认真夸你一句。',
  '真的挺暖的。',
  '我心里很领情。',
  '这一下很有分量，也让我愿意靠近你。',
  '我很珍惜这种细节。',
];

function render(template: string, fact: string): string {
  return template.replace('{fact}', fact);
}

function joinCommentParts(parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

function strengthLine(strengths: string[], seed: number): string {
  if (strengths.length === 0) return '';
  const selected = strengths.slice(0, 3).join('、');
  return pick([
    `这让我看见你身上${selected}的优点，不是贴标签，是从这个具体动作里自然露出来的。`,
    `我想把这个优点说具体一点：这里面有${selected}，所以才会让人心里有感觉。`,
    `这个细节能支撑的不是空泛夸奖，而是你身上${selected}这一面，我是真的看见了。`,
  ], seed);
}

function uncomfortableKindReading(
  relationshipType: CommentRelationshipType,
  seed: number,
): string {
  const shared = [
    '我愿意先理解，你可能心里有压力，也想被听见，只是还没找到更好的说法。',
    '也许你心里有委屈、着急或担心，不是不在意，只是话出口时让人难受了。',
    '我猜你不是想把关系弄坏，而是那一刻太着急，心里有话没说顺。',
  ];
  const byRelation: Record<CommentRelationshipType, string[]> = {
    general: [
      '我愿意先理解，你可能有委屈，也想被听见，只是还没找到更好的说法。',
      '也许你是在意这件事，心里着急，出口时却让人难受了。',
      '我猜你不是想伤人，而是那一刻太急，想保护自己，也想让别人听见你。',
      ...shared,
    ],
    family: [
      '我愿意先理解，你可能不是不在乎，只是怕自己做不好、不想被催，心里有压力，也没找到更好的说法。',
      '也许你不是不在乎，只是需要一点缓冲，心里着急，又不知道怎么好好说。',
      '我猜你心里有委屈，也怕自己做不好，所以急着表达，却没找到更好的说法。',
      '也许你不想被催，想把自己的空间守住，心里有压力，才先用硬话挡了一下。',
      '我愿意先理解，你可能不是不在乎，只是心里着急、怕自己做不好，还不知道怎么好好说。',
      '我猜你需要一点缓冲，也想被听见，只是委屈和压力一上来，就没找到更好的说法。',
    ],
    close: [
      '我愿意先理解，你可能不是不在乎我，只是当时心里有压力，又不知道怎么把软一点的话说出来。',
      '也许你是在保护自己，不想显得太需要别人，所以话先硬了起来。',
      '我猜你不是想推开我，而是希望我能听懂你里面那点着急。',
      ...shared,
    ],
    colleague: [
      '我愿意先理解，你可能不是针对我，而是心里着急，想把事情往前推，话一下子变硬了。',
      '也许你是在担心事情出错，有想把事情做好的压力，只是提醒的方式有点冲。',
      '我猜你想保住的是结果、想把事情做好，不是想让人难受。',
      '我愿意先理解，你可能想把事情做好，只是有压力，话先急了。',
      ...shared,
    ],
    stranger: [
      '我愿意先理解，你可能当时也有自己的急处，只是那句话出来时让人不太舒服。',
      '也许那一刻你不是想伤人，只是没有顾上把话说得柔和一点。',
      '我猜你心里有着急的事，所以表达先冲出来了。',
      ...shared,
    ],
    social: [
      '我愿意先理解，你可能是在表达一种在意，只是文字看起来有点硬。',
      '也许你真正想说的是担心或提醒，不是要把人推远。',
      '我猜你心里有一个认真在乎的点，只是表达方式还可以更温和一点。',
      ...shared,
    ],
  };
  return pick(byRelation[relationshipType], seed);
}

function uncomfortableBoundary(seed: number): string {
  return pick([
    '我不想把你整个人定在这里，但这句话需要重新说；我们先从一小步开始，下次慢一点说。',
    '我想把你这个人和刚才的说法分开；下次你换个方式、换个说法告诉我，我会更愿意听。',
    '我不想把你整个人定在这里，但这样说会伤人，我们重新说一遍，下次慢一点说。',
    '我不想把你整个人定在这里，也不赞成刚才这样说；你换个方式说，我会更容易听进去。',
    '我想把你这个人和刚才的说法分开，我们先从一小步开始，下次重新说一遍。',
    '我不想把你整个人定在这里，只是刚才这句话要换个方式说，我们重新说一遍，下次慢一点说。',
  ], seed);
}

function mixedKindReading(
  relationshipType: CommentRelationshipType,
  seed: number,
): string {
  const byRelation: Record<CommentRelationshipType, string[]> = {
    general: [
      '我也看见，你不是完全不在意，后面还是把事情放在心上了。',
      '也谢谢你，虽然方式有点急，但我看见里面有在意，也有想把事情做好的压力。',
      '我知道这件事不是全好也不是全坏，前面让我有压力，后面那份心意也是真的。',
    ],
    family: [
      '我也看见，你还是把家里的事放在心上，没有真的把它丢开。',
      '也谢谢你，急归急，最后还是愿意把事情接住。',
      '我知道你里面有一份在意，只是刚才出来的方式有点硬。',
    ],
    close: [
      '我也看见，你还是把我和这件事放在心上，不是完全不管。',
      '也谢谢你，虽然方式有点急，但里面那份在意我没有忽略。',
      '我知道你不是想让我难受，你其实还是想把事情弄好。',
    ],
    colleague: [
      '我也看见，你还是把事情放在心上，愿意帮我把材料检查一遍。',
      '也谢谢你，虽然提醒得急，但你没有把问题丢给我一个人。',
      '我知道你是在意结果的，也确实帮我把事情往前推了一步。',
    ],
    stranger: [
      '我也看见，你后面还是做了一个愿意帮人的动作。',
      '也谢谢你，虽然前面的方式有点急，但后面的帮忙是真实的。',
      '我知道那里面还是有一份愿意照应人的心意。',
    ],
    social: [
      '我也看见，你真正想表达的是在意这件事，而不只是发泄。',
      '也谢谢你，虽然语气可以更柔和，但那份在意和担心我看到了。',
      '我知道这条里有一份真心，只是表达还可以再顺一点。',
    ],
  };
  return pick(byRelation[relationshipType], seed);
}

function mixedBoundary(seed: number): string {
  return pick([
    '下次你慢一点说，我会更容易接住，也更容易真的听进去。',
    '如果能换个方式提醒，我会少一点压力，也更能感受到你的好意。',
    '我想把话说清楚：前面让我紧了一下，心意我也看见了；下次慢一点，我会更容易接住。',
    '我不想因为语气急，就把你后面那份在意也抹掉；如果下次换个方式，我会更容易听进去。',
  ], seed);
}

function buildUncomfortableCards(
  relationshipType: CommentRelationshipType,
  fact: string,
  variantSeed: number,
): GeneratedCommentCard[] {
  const feelings = [
    `${fact} 刚才这样说，我听着会难受，也不赞成，我会担心。`,
    `${fact} 这句话出来的时候，我心里会紧，听着不舒服，也不赞成这样说。`,
    `${fact} 我听着不舒服，我有点着急，因为这样说会伤人。`,
    `${fact} 我不赞成这样说话，我听着会有压力，也会不舒服。`,
  ];
  const conciseFeelings = [
    `${fact} 刚才这样说，我听着会难受，也不赞成，我有点着急。`,
    `${fact} 这句话会伤人，我听着不舒服，我心里会紧，也不赞成。`,
    `${fact} 我不赞成这样说，我听着会有压力，也听着会难受。`,
    `${fact} 我听着不舒服，也不赞成，我会担心你是不是心里有压力。`,
  ];
  return [
    {
      style: 'warm',
      title: '温暖真诚',
      text: [
        pick(feelings, variantSeed),
        uncomfortableKindReading(relationshipType, variantSeed + 1),
        uncomfortableBoundary(variantSeed + 2),
      ].join(' '),
    },
    {
      style: 'vivid',
      title: '生动有画面',
      text: [
        pick([
          `${fact} 刚才这样说，我听着会难受，也不赞成，我会担心你是不是心里有压力。`,
          `${fact} 这句话听着不舒服，我不赞成，我有点着急，也猜你里面有着急。`,
          `${fact} 我心里会紧，听着不舒服，也不想把你整个人定在这里。`,
        ], variantSeed + 3),
        uncomfortableKindReading(relationshipType, variantSeed + 4),
        uncomfortableBoundary(variantSeed + 5),
      ].join(' '),
    },
    {
      style: 'concise',
      title: '简洁有力量',
      text: [
        pick(conciseFeelings, variantSeed + 6),
        uncomfortableKindReading(relationshipType, variantSeed + 7),
        uncomfortableBoundary(variantSeed + 8),
      ].join(' '),
    },
  ];
}

function buildMixedCards(
  relationshipType: CommentRelationshipType,
  fact: string,
  variantSeed: number,
): GeneratedCommentCard[] {
  const feelings = [
    `${fact} 我当下有点紧，也会有压力。`,
    `${fact} 前半段听起来会有点冲，我心里会缩一下。`,
    `${fact} 我会有压力，但后面的细节我也看见了。`,
    `${fact} 这个方式让我不太舒服，可我也不想忽略你做了什么。`,
  ];
  return [
    {
      style: 'warm',
      title: '温暖真诚',
      text: [
        pick(feelings, variantSeed),
        mixedKindReading(relationshipType, variantSeed + 1),
        mixedBoundary(variantSeed + 2),
      ].join(' '),
    },
    {
      style: 'vivid',
      title: '生动有画面',
      text: [
        pick([
          `${fact} 前面的语气让我紧了一下，我会有压力；后面的帮忙又让我知道你是在意结果的。`,
          `${fact} 我看到的是一个听起来会有点冲的提醒，也看到你后来还是伸手把事情托了一下。`,
          `${fact} 这件事不是全好也不是全坏，我当下有点紧，心意也是真的。`,
        ], variantSeed + 3),
        mixedKindReading(relationshipType, variantSeed + 4),
        mixedBoundary(variantSeed + 5),
      ].join(' '),
    },
    {
      style: 'concise',
      title: '简洁有力量',
      text: [
        pick([
          `${fact} 听起来会有点冲，但我也看见你还是把事情放在心上。`,
          `${fact} 我当下有点紧，也谢谢你后面还是帮我接住了。`,
          `${fact} 方式让我有压力，心意我也看见了。`,
        ], variantSeed + 6),
        '我知道你里面有在意，也可能是想把事情做好。',
        mixedBoundary(variantSeed + 7),
      ].join(' '),
    },
  ];
}

export function generateComments({
  relationshipType,
  observation,
  variantSeed = 0,
}: GenerateCommentsInput): CommentGenerationResult {
  const fact = normalizeObservation(observation);
  if (!fact || !hasConcreteDetail(fact)) {
    return { status: 'needs-detail', message: detailPrompt };
  }
  if (safetyPatterns.some((pattern) => pattern.test(fact))) {
    return { status: 'needs-detail', message: safetyPrompt };
  }

  const directFact = toDirectAddressFact(fact);
  const insight = analyzeCommentScene(directFact);
  if (insight.tone === 'uncomfortable') {
    return {
      status: 'ready',
      cards: buildUncomfortableCards(relationshipType, directFact, variantSeed),
    };
  }
  if (insight.tone === 'mixed') {
    return {
      status: 'ready',
      cards: buildMixedCards(relationshipType, directFact, variantSeed),
    };
  }

  const copy = relationshipCopy[relationshipType];
  const angle = angleCopy[insight.angle];

  const cards: GeneratedCommentCard[] = [
    {
      style: 'warm',
      title: '温暖真诚',
      text: joinCommentParts([
        render(pick(warmOpenings, variantSeed), directFact),
        pick(angle.warm, variantSeed + 1),
        strengthLine(insight.strengths, variantSeed + 2),
        pick(copy.warm, variantSeed + 2),
        pick(warmClosings, variantSeed + 3),
      ]),
    },
    {
      style: 'vivid',
      title: '生动有画面',
      text: joinCommentParts([
        render(pick(vividOpenings, variantSeed + 2), directFact),
        pick(angle.vivid, variantSeed + 3),
        strengthLine(insight.strengths, variantSeed + 4),
        pick(copy.vivid, variantSeed + 4),
        pick(vividClosings, variantSeed + 5),
      ]),
    },
    {
      style: 'concise',
      title: '简洁有力量',
      text: joinCommentParts([
        render(pick(conciseOpenings, variantSeed + 4), directFact),
        pick(angle.concise, variantSeed + 5),
        strengthLine(insight.strengths, variantSeed + 6),
        pick(copy.concise, variantSeed + 6),
        pick(conciseClosings, variantSeed + 7),
      ]),
    },
  ];

  return { status: 'ready', cards };
}
