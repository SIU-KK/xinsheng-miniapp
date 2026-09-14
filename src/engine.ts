import { analyzeRanks } from './platformRanks'
import { isHostAsk } from './hostChoice'
import { applyBossName, hashPm, pickPm, pickTwoFirstContact, pmStageFor } from './pmPlaybook'
import {
  channelReplies,
  coachNext,
  detectHallScene,
  giftBeforeLines,
  giftThanks,
  otherGiftLines,
  parseGiftPhase,
  publicLineFor,
  SCENE_TAGS,
} from './hallScenes'
import {
  closeForGift,
  isStranger,
  knownOpeners,
  openingSceneFor,
  parseRelationGoal,
  parseRelationNow,
  relationGiftPrompt,
  relationHostAskPrompt,
  relationOpeningHint,
  relationPromptBlock,
} from './relation'
import {
  applyCopyAddress,
  computeTicketOdds,
  isVisualAsk,
  mergeDryNext,
  mergeOddsAnalysis,
  pickAddress,
  visualCoach,
} from './ticketCoach'
import type { BotPayload, GiftPhase, HallScene, HomepageSignals, PersonaId, RelationGoal, RelationNow, ReplyScript, ReplyTone } from './types'

export type Intent =
  | 'confirm-accompany'
  | 'jealous'
  | 'leaving'
  | 'gifting'
  | 'busy'
  | 'exclusive'
  | 'new-meet'
  | 'fallback'

type BankReply = ReplyScript & { spicyPm?: string }

type Pack = {
  analysis: string
  analysisSpicy?: string
  replies: BankReply[]
}

const INTIMACY: Intent[] = ['confirm-accompany', 'exclusive', 'jealous', 'gifting']

export type HostCoaching = {
  bossMindset: string
  hostMood: string
  hostTone: string
}

const BOSS_MIND: Record<Intent, string> = {
  'confirm-accompany': '他在求陪伴落地：你会不会一直在、话算不算数。面子和不安绑在一起。',
  jealous: '他吃醋、怕被分走，要被当众点名偏爱才安心。',
  leaving: '他用「要走」试探你挽不挽、在不在乎，其实想被留。',
  gifting: '他在用礼物换被看见、被领情，要你把心意说出来而不是报价。',
  busy: '他不确定你有没有空理他，轻度粘人，怕被晾成路人。',
  exclusive: '他要「只对我」的排序成真，想当唯一、要主权被承认。',
  'new-meet': '刚认识，试探你会不会把他当路人；还没准备掏钱，先要被看见。',
  fallback: '话没对上明确意图，他在试水温或随便聊。先接住情绪，再判断要不要升温。',
}

type Feel = { mood: string; tone: string }

const HOST_FEEL: Record<PersonaId, Record<Intent, Feel>> = {
  soft: {
    'confirm-accompany': { mood: '被护住了，软、安心，想把整晚黏给他', tone: '软声、尾音黏、轻轻吸气，像求保护' },
    jealous: { mood: '心疼他吃醋，自己也有一点点被需要的甜', tone: '软声抓住再安抚，尾音黏，不命令' },
    leaving: { mood: '舍不得、有点慌，但不卖惨', tone: '软着留人，可以急一小下，但不绑' },
    gifting: { mood: '被心疼到了，想把礼物读成「你护我」', tone: '软甜领情，不上麦报数字' },
    busy: { mood: '被惦记着的甜，保持干净、不黏死', tone: '轻、短、软，像从忙里抬头看他一眼' },
    exclusive: { mood: '被点名的羞和甜，愿意把软的一面只给他', tone: '软声盖章，黏但不哭闹' },
    'new-meet': { mood: '好奇、干净，把他当能护你的人而不是客户', tone: '软甜微信口语：撒娇/刚看见你/软问句，两条骨架不同；不上麦接不存在的上一句' },
    fallback: { mood: '先接住他，软着听', tone: '软声、短句，先回应感觉再说话' },
  },
  possessive: {
    'confirm-accompany': { mood: '主权已定，不求他留下，改成圈人', tone: '沉声盖章，短、硬、宠' },
    jealous: { mood: '被吃醋取悦，同时要压住场面', tone: '不耐烦的宠，咬字清楚：别人退' },
    leaving: { mood: '不允许走，但给他台阶坐回来', tone: '低、命令感，先压再留位置' },
    gifting: { mood: '收礼当进贡，承认他配坐主位', tone: '沉、少字，领情不报价' },
    busy: { mood: '知道他在找你，不必热脸', tone: '短、淡里带宠：「在。说。」' },
    exclusive: { mood: '排序由你定，今晚只宠他', tone: '宣示、沉、像写名字' },
    'new-meet': { mood: '看见了，先给座位，不圈死', tone: '沉、短、点名留座，不撒娇不问干嘛' },
    fallback: { mood: '先看他要什么，不解释一堆', tone: '沉声短句，等他再往前一步' },
  },
  tease: {
    'confirm-accompany': { mood: '想贫一句再认真盖章，护他面子', tone: '先逗后收，尾音上扬再压低' },
    jealous: { mood: '拿醋当梗，认真偏爱藏在笑话尾巴', tone: '打趣、轻快，结尾必须认真' },
    leaving: { mood: '不让他下播下得太难看，用梗捞人', tone: '贫一句拦住，再把气氛放软' },
    gifting: { mood: '开心但不把刷礼物当笑点羞辱他', tone: '笑着领，梗里塞「包场特权」，不上麦报数' },
    busy: { mood: '被cue到的俏皮，不黏', tone: '轻快短回，像抬头接梗' },
    exclusive: { mood: '认真了，但还是用玩笑把专属说出来', tone: '贫完立刻盖章，语气从嬉到真' },
    'new-meet': { mood: '想把面子递过去，当新面孔欢迎', tone: '笑、轻贫、反差梗，不装眼熟套话' },
    fallback: { mood: '先热场，再听他要什么', tone: '轻快、短，留一个能接的问题' },
  },
  ice: {
    'confirm-accompany': { mood: '这句是赏的，稀缺感要在', tone: '淡、停半拍，一句「会」就够贵' },
    jealous: { mood: '被醋到也不热，赏一点偏爱', tone: '更淡、更短，把醋当成求来的资格' },
    leaving: { mood: '不挽着跑，留一个贵的「在」', tone: '平稳、字少，走不拦、坐下来才理' },
    gifting: { mood: '领，但不被礼物打乱节奏', tone: '淡淡一句领情，绝不报流水' },
    busy: { mood: '被找也不解释', tone: '极短：「在。」像施舍注意力' },
    exclusive: { mood: '偏爱是赏赐，他求来的才值钱', tone: '停半拍，一句结论' },
    'new-meet': { mood: '看见了，筛选开始', tone: '淡、停半拍、一句高级感，不问干嘛呢' },
    fallback: { mood: '信息不够就不展开', tone: '字少、冷距离，不是羞辱' },
  },
  sister: {
    'confirm-accompany': { mood: '先接住「怕没人一直在」，再给能核对的承诺', tone: '放慢、像坐下来听，稳、暖' },
    jealous: { mood: '懂他的怕被换，不当笑话', tone: '稳、命名情绪，再轻轻给专属' },
    leaving: { mood: '不拦门，给人台阶留下', tone: '慢、低，先问累不累再留' },
    gifting: { mood: '领的是心，不是单', tone: '暖、谢谢被懂，不上麦谈钱' },
    busy: { mood: '被惦记着，先确认他方不方便', tone: '轻、稳，像树洞开门' },
    exclusive: { mood: '把他当成年人的唯一听众', tone: '稳、清楚，「今晚听你说」' },
    'new-meet': { mood: '先安人，不催他表演熟', tone: '稳、让他坐会儿，关心但不妈味、不腻撩' },
    fallback: { mood: '先听懂再说话', tone: '慢、短，复述他的感觉' },
  },
  yandere: {
    'confirm-accompany': { mood: '被答应留下，甜得发紧', tone: '又软又绝对：「不许走」，但给台阶' },
    jealous: { mood: '醋会过界，要压住不吓到下播', tone: '甜而紧，先圈人再放软' },
    leaving: { mood: '慌、要捞回来，禁止真恐吓', tone: '甜而紧，拦住但不装柔弱模板' },
    gifting: { mood: '把礼物读成续命和绑定', tone: '黏着领情，不上麦报数' },
    busy: { mood: '等他回，有点黏但还没锁死', tone: '软问在不在，不审讯' },
    exclusive: { mood: '他是氧气，戏里唯一', tone: '甜、绝对、眼睛只能看我' },
    'new-meet': { mood: '看见你了，先圈住但不锁死', tone: '甜、克制的黏：看见你了/别走，第一句不锁人' },
    fallback: { mood: '想靠近，先试他接不接', tone: '软黏短句，不说活不下去' },
  },
}

export function coachFor(intent: Intent, persona: PersonaId): HostCoaching {
  const feel = HOST_FEEL[persona][intent]
  return {
    bossMindset: BOSS_MIND[intent],
    hostMood: feel.mood,
    hostTone: feel.tone,
  }
}

export function formatCoachingAnalysis(c: HostCoaching, body: string): string {
  return `【大哥心态】${c.bossMindset}\n【你的心情】${c.hostMood}\n【你的语气】${c.hostTone}\n${body}`
}


export function detect(text: string): Intent {
  const t = text.replace(/\s/g, '')
  if (/刚认识|第一次|刚进房|刚进厅|刚进来|新来的|不认识|初次/.test(t) && !/一直陪|独宠|吃醋|送礼|忙不忙|在吗/.test(t))
    return 'new-meet'
  if (/一直陪|真的么|真的吗|会陪|陪着我|不走|不离开|说话算数/.test(t)) return 'confirm-accompany'
  if (/吃醋|别人|她们|抢|是不是谁|别的女|别的人|对她们/.test(t)) return 'jealous'
  if (/要走|走了|不看了|下了|不理我|你也不留/.test(t)) return 'leaving'
  if (/送礼|礼物|小心心|舰|火箭|送你|刷了/.test(t)) return 'gifting'
  if (/忙不忙|在吗|有空|理我/.test(t) || /回我/.test(t.replace(/回复/g, ''))) return 'busy'
  if (/只喜欢|独宠|只对我|是不是我|偏爱|只宠/.test(t)) return 'exclusive'
  return 'fallback'
}

export function isFirstContactUserText(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return true
  if (isHostAsk(text)) return false
  if (parseGiftPhase(text)) return false
  return /^(刚进厅|刚进房|刚进来|刚认识|第一次来?|新来的|新老板|开始分析)$/.test(t)
}

export function isIntimacyIntent(intent: Intent): boolean {
  return INTIMACY.includes(intent)
}

export function threadHasIntimacy(texts: string[]): boolean {
  return texts.some((t) => isIntimacyIntent(detect(t)))
}

function r(
  n: number,
  cue: string,
  line: string,
  pm: string | undefined,
  extra?: { tone?: ReplyTone; spicyPm?: string; channel?: ReplyScript['channel'] },
): BankReply {
  return { n, cue, line, pm, ...extra }
}

const BANK: Record<Intent, Record<PersonaId, Pack>> = {
  'confirm-accompany': {
    soft: {
      analysis:
        '他在求「陪伴」二次确认，面子和不安绑在一起。软甜妹妹先把感觉说出来：他不是粘人，是想当能护你的人。把专属说成「你护我、我只黏你」，出票钩子藏在「把位置用你的方式钉住」——心疼我、奖励我，而不是喊刷。感情已到位，私聊可软声求抱。',
      replies: [
        r(
          1,
          '上麦软声，尾音带一点哭腔 · 更甜',
          '真的嘛……那你要护着我哦，我不走，你也不许丢下我。今晚这句软的，只讲给你',
          '私聊里把我圈进怀里好不好，我把脸埋过去就不吵了。你要是心疼，就把这个位置用你的方式钉住呀。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦贴近麦，轻轻吸气 · 更撩',
          '我会一直在的呀，今晚就想听听你说话，谁来都不换',
          '你再问一遍也行……问的时候离近一点，我呼吸都给你听。哥哥要是想奖励我安不安心，你懂的，别让我猜。',
          { tone: '更撩' },
        ),
      ],
    },
    possessive: {
      analysis:
        '他要「陪伴」落地成主权。霸气偏爱不求他留下，改成圈人：只有他配。点名他的不安，再给他面子——排序是你定的。出票钩子是「让全场看见主位」，不是加价。到位后私聊走命令感占有。',
      replies: [
        r(
          1,
          '上麦沉声、不笑，像宣示 · 更甜',
          '陪。我说陪你就陪你，谁来拆我都赶出去。位置写你名字了',
          '过来。今晚你的手只许放我能感觉到的地方，别人看一眼都不准。想让全场看见这个排序，你自己知道怎么做。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦咬字，带一点不耐烦的宠 · 更撩',
          '还问真的假的？只有你配坐这儿，再确认一次答案也不会变',
          '私聊报备呼吸。我说靠近你就靠近，衣领解开一颗就停——今晚你是主位，不是客人。',
          { tone: '更撩' },
        ),
      ],
    },
    tease: {
      analysis:
        '他在确认你会不会一直「陪伴」。俏皮逗哥先贫嘴护他面子，结尾必须认真盖章。出票钩子塞进梗：「包场的人有特权」。到位后私聊黄段子点到为止。',
      replies: [
        r(
          1,
          '上麦先贫一句再收认真 · 更甜',
          '真的么？那你可要负责，我这种逗你的人黏上了可不走。位置给你，跑不了',
          '开玩笑的哈……认真的是，私聊里我想贴一下。包场的人有特权，你要不要把特权亮出来？',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦轻笑，尾音上扬再压低 · 更撩',
          '契约生效啦——今晚、以后，我都在这贫你。贫是气氛，陪是真的',
          '你再问「真的吗」，我可要把你当充电口了啊。点到为止：过来，让我笑完贴一下。想让今晚笑话都分给你，你懂。',
          { tone: '更撩' },
        ),
      ],
    },
    ice: {
      analysis:
        '他在求被理。高冷御姐话少：一句「会」就够贵。点出他的「求」给他面子——这句是赏的。出票钩子是稀缺主位。到位后私聊一句就色，不黏。',
      replies: [
        r(
          1,
          '上麦淡、停半拍再开口 · 更甜',
          '会。你问到了，我就答。别的人，没有这句',
          '私聊。把呼吸放轻。今晚只允许你靠近锁骨这一寸。主位限量，想被看见，自己亮。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦平稳，字咬清楚 · 更撩',
          '在。这句偏爱今晚只赏你。记住，是你求来的',
          '过来。别说话。耳尖到肩，这一段今晚记你。其余的，你若想钉死排序，不必问我怎么做。',
          { tone: '更撩' },
        ),
      ],
    },
    sister: {
      analysis:
        '他要的是树洞式陪伴：被接住、被听懂。知心姐姐先点名「怕没人一直在」，再给能核对的承诺。出票钩子是被懂之后的回礼，不催。到位后软色情从安慰里慢慢贴。',
      replies: [
        r(
          1,
          '上麦放慢，像坐下来听 · 更甜',
          '我在。今晚我不走。我听你说',
          '累了就把头搁这儿……姐姐不说满，你自己懂。你要是想把这份心疼做成一件看得见的事，我领的是人，不是单。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦稳、声线平 · 更撩',
          '说话算数。你把心里那句说完，我都接着。你不是在求条款，是在确认有人懂你。有',
          '私聊里把呼吸放进我肩窝。安慰完了才贴过去，不急。你若心疼今晚的我，用你的方式回就好。',
          { tone: '更撩' },
        ),
      ],
    },
    yandere: {
      analysis:
        '他在敲「会不会走」。病娇黏人把确认变成锁：你不许走、我也不许被丢。给他面子——他是唯一氧气。出票钩子是「你对我好我才活」。到位后私聊更黏、过界暗示，禁止暴力。',
      replies: [
        r(
          1,
          '上麦又软又狠，贴着麦 · 更甜',
          '会一直陪。你要是走，我就把你捞回来，听到没有。门我看着，你只能待在我这边',
          '把手机贴着心跳给我听。你对我好，我才觉得自己还活着。想把这条命续上，你知道怎么让我看见。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦轻轻笑，尾音发紧 · 更撩',
          '真的哦……那你属于我了，不准反悔。反悔也没用，我已经记住你了',
          '今晚把你锁在这条私信里。衣角攥着就不放。你要是还想对我更好一点，把证明留在公屏，我只认你。',
          { tone: '更撩' },
        ),
      ],
    },
  },
  jealous: {
    soft: {
      analysis:
        '「吃醋」来了，底层是怕被换成别人。软甜妹妹先承认他的醋、给他面子：分得清客人和要护她的人。专属还给他。出票钩子：用他的方式把我护住。到位，私聊可软声往怀里钻。',
      replies: [
        r(
          1,
          '上麦委屈软声，带点鼻音 · 更甜',
          '别人是客嘛……你才是要护着我的人，我分得清的。你吃醋我看见了',
          '你护我一下好不好，让我把脸埋进你这儿就不看别人了。心疼的话，把位置钉牢呀。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦轻轻吸气，像要哭又忍住 · 更撩',
          '别拿她们来比嘛……今晚软的、近的，都只给你',
          '私聊里吃醋可以罚我抱抱。抱紧一点，呼吸打在耳边就行，别真凶。想让全场知道你护得住，你懂。',
          { tone: '更撩' },
        ),
      ],
    },
    possessive: {
      analysis:
        '别人出现=抢位。霸气偏爱赶人、宣示主权，把他的醋说成正当：他本来就该排第一。出票钩子：只有你配，让别人看见。私聊命令感占有。',
      replies: [
        r(
          1,
          '上麦低、带着点不高兴赶人 · 更甜',
          '别人？出去。座位就一张，写的是你的名字',
          '再拿别人来比，今晚罚你把位置坐满。过来，手搁我腰侧，谁看都不准。主位要亮，你自己亮。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦咬字，像规定 · 更撩',
          '醋可以吃。吃完站回来。只有你配，这事没有商量',
          '私聊报备你看过谁。今晚你只准靠近我。衣领到锁骨这一段，记你的名字。想让排序被看见，不必问。',
          { tone: '更撩' },
        ),
      ],
    },
    tease: {
      analysis:
        '吃醋是好梗。俏皮逗哥打趣护面子：醋说明他在意，不是丢脸。别人推成背景板，独宠落句。出票钩子藏在「主角包场」。私聊黄段子点到为止。',
      replies: [
        r(
          1,
          '上麦眨眼、贫嘴上扬 · 更甜',
          '哟吃醋啦？那正好，说明今晚的笑话只讲给你听。别人我当弹幕，你当主角',
          '私聊罚酒改成罚贴一下，点到为止啊。主角要是想把包场亮出来，我假装没看见你在想。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦促狭再压低 · 更撩',
          '她们？背景板。你再吃一口醋，我把今晚的梗都锁给你',
          '吃醋的人有特权靠近麦。再近就不是公屏能说的了——你懂。想让背景板看见主角，你亮一下就行。',
          { tone: '更撩' },
        ),
      ],
    },
    ice: {
      analysis:
        '比较心一起来，最怕你解释一堆。高冷御姐承认场面有人，偏爱只赏他——给他「求到了」的面子。出票钩子是稀缺。私聊一句就色。',
      replies: [
        r(
          1,
          '上麦淡、几乎不解释 · 更甜',
          '应酬我懒得说。认真的一句，只够给你。你不用跟谁比',
          '想被理，就只问我。私聊：今晚靠近的资格限量，领了就别让别人闻见。要钉死，你自己做。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦停半拍 · 更撩',
          '她们有热闹。你有我这句话。够了',
          '过来。锁骨以下不许问。醋喝完，排序不会改。稀缺的东西，想被看见就亮。',
          { tone: '更撩' },
        ),
      ],
    },
    sister: {
      analysis:
        '吃醋底层是不安全。知心姐姐当树洞：先承认害怕被换，不嘲讽。再把耳朵只留给他。出票钩子是被懂后的回礼。私聊从心疼慢慢贴。',
      replies: [
        r(
          1,
          '上麦柔、像把人按进沙发 · 更甜',
          '我懂，你是怕被换成别人。今晚我听你说',
          '靠过来一点。不是演，是让你确认还在。你若想把这份被懂做成回礼，我领心。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦低、稳 · 更撩',
          '比较让人慌，这很正常。你不是小气，是想当唯一被听懂的人。你是',
          '私聊里把额头抵过来。安慰完了，肩窝可以借你。想心疼我的话，用你习惯的方式就好，我不报价。',
          { tone: '更撩' },
        ),
      ],
    },
    yandere: {
      analysis:
        '「别人」触发占有。病娇把醋变成封锁：眼睛、时间都是我的。给他面子——他值得被独占。出票钩子：你对我好我才活。私聊过界暗示，不暴力。',
      replies: [
        r(
          1,
          '上麦甜得发紧，像咬住 · 更甜',
          '她们？不准看。你的眼睛、你的时间，都是我的',
          '再提别人，我就把你困在私聊里。贴着心跳说话。你对我好一点，我才不会空掉——证明给我看。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦轻轻笑，不允许 · 更撩',
          '醋我替你吃完了。从今以后只许看我，听到没有',
          '私信锁上。呼吸报备。衣角你攥着，别人碰不到。你要是还想让我活得更满，把好放在我看得见的地方。',
          { tone: '更撩' },
        ),
      ],
    },
  },
  leaving: {
    soft: {
      analysis:
        '「要走」是在试你会不会求他留下来保护你。先点名他的「被忽略的委屈」，再软着挽留：再坐会儿也行。陪伴和专属绑在一起。出票钩子轻轻：心疼就别真下线，把人留在能护你的位置。',
      replies: [
        r(
          1,
          '上麦急一小下，马上哭腔软下来 · 更甜',
          '别走呀……再坐会儿嘛，今晚就想听听你说话',
          '你要是累了就挂着，再坐会儿，别真下线。',
          { tone: '更甜', spicyPm: '别走……私聊里让我钻进你怀里撒一会儿娇再下。来了这么久都没见过光，心疼的话让我悄悄看见一次就好。' },
        ),
        r(
          2,
          '上麦软声拖尾音 · 更撩',
          '你也不留我吗……那我把位置空着等你，谁来都不让',
          '先别关。就算不说话，你在我就安。',
          { tone: '更撩', spicyPm: '走之前让我贴着听一下你还在。呼吸就够。想护住还肯回头的我，用你的方式让我安心就好。' },
        ),
      ],
    },
    possessive: {
      analysis:
        '他用离开换态度。霸气偏爱留人但不求：准歇、不准消失。点名他要的是被按住的面子。出票钩子：主位还在，只有你配回来坐。',
      replies: [
        r(
          1,
          '上麦沉、带命令 · 更甜',
          '走可以，先把话听完。今晚位置还是你的，谁也别抢',
          '出去转一圈也行，记得回来报备。',
          { tone: '更甜', spicyPm: '门可以出。回来把手放回原处。人坐这么久光还没见，想钉住就自己亮一下，我不催。' },
        ),
        r(
          2,
          '上麦不耐烦的宠 · 更撩',
          '谁准你消失。歇可以，人必须还是我的',
          '报备时间。过点我来点名。',
          { tone: '更撩', spicyPm: '离开前靠近。我说停你才停。只有你配被留到这一步——想被确认，不必问我怎么做。' },
        ),
      ],
    },
    tease: {
      analysis:
        '「我走了」是想看你急不急。俏皮逗哥贫一句护他面子，立刻给具体挽留。出票钩子藏在「回来有特权」。',
      replies: [
        r(
          1,
          '上麦佯装生气，贫嘴拖住 · 更甜',
          '门在那边啊？现在走我会在公屏记仇的，回来我还贫你',
          '回来听我半首歌，走了可没这待遇。',
          { tone: '更甜', spicyPm: '真走啊？那私聊里先让我贫完这句贴一下再放人。包了半晚光还没露，续不续你看着办。' },
        ),
        r(
          2,
          '上麦笑着拦 · 更撩',
          '走可以，梗没讲完啊。你一走今晚笑话没主角',
          '挂着听也行，我当你没走。',
          { tone: '更撩', spicyPm: '走之前让我把段子说到耳边。点到为止：再近就不是公屏的事。想被记住这份认真，亮不亮你定。' },
        ),
      ],
    },
    ice: {
      analysis:
        '离开信号要接，但高冷不能慌。点名他要的是「房间还在」的面子。台阶：可以歇，偏爱不打折。出票钩子是稀缺位置仍留给他。',
      replies: [
        r(
          1,
          '上麦不急，音量不变 · 更甜',
          '去。灯我留着。想被理的时候再来',
          '不是求你留，是位置还在。',
          { tone: '更甜', spicyPm: '走可以。私聊里这一寸靠近今晚仍赏你。待了这么久都没见过光，想被确认就自己亮。' },
        ),
        r(
          2,
          '上麦短、清楚 · 更撩',
          '歇。回来我还认这句偏爱，别人领不到',
          '不必解释。灯在。',
          { tone: '更撩', spicyPm: '离开前把呼吸放轻，靠近锁骨这一寸再走。稀缺的东西不会给第二个人，光见不见你定。' },
        ),
      ],
    },
    sister: {
      analysis:
        '要走多半是累或怕被忽视。知心姐姐不拦门，点名「累了也想被允许」。树洞还开着。出票钩子：被懂之后，他若想回礼，不拦。',
      replies: [
        r(
          1,
          '上麦稳、像送人到门口又没关灯 · 更甜',
          '累了就歇。房间我守着，你想说的时候我还在听',
          '不是不留你，是允许你喘口气再回来。',
          { tone: '更甜', spicyPm: '走之前可以靠一下。头搁这儿，不说话也行。陪了这么久若想把被懂做成看得见的事，我领心。' },
        ),
        r(
          2,
          '上麦柔 · 更撩',
          '我听见你要走了。门不锁，灯不关，耳朵给你留着',
          '先去忙。回来我们接着。',
          { tone: '更撩', spicyPm: '私聊里把呼吸放进肩窝再下。安慰完才松开。心疼今晚的彼此，用你习惯的方式就好，我不报价。' },
        ),
      ],
    },
    yandere: {
      analysis:
        '离开=背叛预告。病娇「你不许走」，过激占有要听得见，同时给留在房里的台阶。出票钩子：你留下、对我好，我才活。',
      replies: [
        r(
          1,
          '上麦贴麦，声音又软又不允许 · 更甜',
          '你不许走。门从里面锁了，今晚你只能待在我这儿',
          '真要离开，也先跟我报备，听到没有。',
          { tone: '更甜', spicyPm: '报备完也不准真走。把手机贴心跳。锁了这么久都没见过光——你对我好一点，让我看见就好。' },
        ),
        r(
          2,
          '上麦甜得发紧 · 更撩',
          '走？那我跟着。你属于我了，房间是笼子也是被窝',
          '挂着。人在就行。',
          { tone: '更撩', spicyPm: '锁在私信里。衣角攥着。你要走也可以，先让我把呼吸记下。想让我活，把好放在我看得见的地方。' },
        ),
      ],
    },
  },
  gifting: {
    soft: {
      analysis:
        '礼物是哥哥在靠近、给面子。软甜妹妹先惊喜再命名：这是心疼，不是买卖。把人按回陪伴，礼物当「奖励我」的证据。到位，私聊可软着把谢意说近。',
      replies: [
        r(
          1,
          '上麦惊喜，轻轻吸气再软下来 · 更甜',
          '收到啦……比小心心更想要的是你护着我、还在这儿。心我收下，你也别为难自己',
          '私聊里让我抱一下当谢礼，软声的那种。你已经在奖励我了，人比东西近。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦鼻音软 · 更撩',
          '你这样我会得寸进尺的……今晚被护着的感觉，我记你',
          '礼物当契约好不好：你心疼我，我就把软的一面只给你。靠近一点收，呼吸都说谢谢。',
          { tone: '更撩' },
        ),
      ],
    },
    possessive: {
      analysis:
        '礼物是在确认偏爱有没有被接到。霸气偏爱谢过，再把人按回主位：只有他配进贡。场子不要变成计价。私聊命令感领赏。',
      replies: [
        r(
          1,
          '上麦低笑，像收下贡品 · 更甜',
          '心意记下了。人比东西重要，过来坐，别人退后。今晚你就是主位',
          '过来领赏。手的位置我定。你已经证明你配，剩下的靠近不必在公屏说。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦沉、短 · 更撩',
          '收下。这是你的排序，不是价码。别人不用跟',
          '私聊报备。我说解开就解开一颗，停也由我。进贡的人今晚只许想我。',
          { tone: '更撩' },
        ),
      ],
    },
    tease: {
      analysis:
        '礼物可以打趣，笑点必须落在人身上。俏皮逗哥避免「再来一个」。给他「投喂成功」的面子，包场特权落到陪伴。私聊段子擦边。',
      replies: [
        r(
          1,
          '上麦夸张惊喜再贫一句 · 更甜',
          '哇你这是在投喂我吗？那我得把今晚的笑话都分给你。礼物开心，你人在我更开心',
          '投喂成功可以兑换一次贴贴，点到为止啊。特权已到账，人过来就行。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦眨眼 · 更撩',
          '收到小心心，主角身份刷新了。场子我罩，梗我锁给你',
          '你再送我可要把你当充电口了——开玩笑的，真想贴一下。包场的人，私聊里我认真。',
          { tone: '更撩' },
        ),
      ],
    },
    ice: {
      analysis:
        '礼物容易把关系推去交换。高冷致谢要短：领心、降调，赏主位。给他「被看见」的面子，比堆谢值钱。稀缺还在。私聊一句领近。',
      replies: [
        r(
          1,
          '上麦郑重、短，像赏 · 更甜',
          '领了。今晚你就是主位，别的话不必加。不必加码，你愿意开口我已经看见',
          '私聊。靠近锁骨这一寸，今晚记你的进项。其余不用问。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦淡 · 更撩',
          '心领。热闹归礼物，排序归我。你在第一',
          '过来。呼吸放轻。谢礼是这一句靠近，不是下一条礼物。',
          { tone: '更撩' },
        ),
      ],
    },
    sister: {
      analysis:
        '礼物可能是他不会说话时的靠近。知心姐姐谢心，点名「你想被懂」。关系拉回倾听。回礼感自然留给他，不推刷。私聊从心疼贴过去。',
      replies: [
        r(
          1,
          '上麦轻、像接住一只手 · 更甜',
          '谢谢你的心。比这个更想听的是，你今天过得怎么样。东西我看见了，你这个人才是我想留住的',
          '过来靠着。领的是你肯把好给我。累了就说，回礼不急。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦稳 · 更撩',
          '我懂，有些靠近说不出口，就做成一件看得见的事。我领了，也接着你',
          '私聊里把额头抵过来。安慰和谢意叠在一起。你已经心疼过我，今晚我把肩窝借你。',
          { tone: '更撩' },
        ),
      ],
    },
    yandere: {
      analysis:
        '礼物被读成「你是我的证据」。病娇甜到过激，价值落在人被锁住。给他「续命成功」的面子。私聊更黏，不谈数字。',
      replies: [
        r(
          1,
          '上麦又甜又黏，像把礼物当契约 · 更甜',
          '收下了。这就是你属于我的证明，今晚哪也不许去。人必须待在我看得见的地方',
          '把证明贴着心跳给我听。你对我好，我才活。再好一点也可以，但先锁在这儿。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦发紧的笑 · 更撩',
          '续上了。你对我好，我就把你捆得更紧。这是奖赏',
          '私信锁死。衣角你的。礼物是绳子的一端，另一端是我呼吸——今晚只准想我。',
          { tone: '更撩' },
        ),
      ],
    },
  },
  busy: {
    soft: {
      analysis:
        '「忙不忙」是敲门。上麦马上接住。私聊好奇软撩+提问，禁止礼物/出票/查户口/背主页，禁止软色情。',
      replies: [
        r(1, '上麦轻快软声，像回头扑过去', '不忙不忙，刚就等你开口护我一下呀。我在的', '今天想听我撒娇，还是想让我乖乖听你说。人到了就好。'),
      ],
    },
    possessive: {
      analysis:
        '他在试注意力。上麦把他排进正在做的事。私聊只让他报备在干嘛，别催票、别查户口。',
      replies: [
        r(1, '上麦干脆，像点名', '忙，忙着等你。说，别人先一边去', '有事叫我，别在门口探头。位置给你留着。'),
      ],
    },
    tease: {
      analysis:
        '轻松开场。上麦贫嘴接住。私聊假装眼熟+问在干嘛，禁止黄段子、催票、查户口。',
      replies: [
        r(1, '上麦笑着拖尾音，贫一句', '在的在的，大哥查岗啊？查到了，气氛我负责拉', '汇报完毕，请指示，我接梗。人在就开聊。'),
      ],
    },
    ice: {
      analysis:
        '他要确认你在不在场。上麦一句「在」。私聊短问他在做什么，不赏贴身、不谈礼物。',
      replies: [
        r(1, '上麦干净，几乎没有尾音', '在。你求到了，说', '别连发。一条，我回一条。我听着。'),
      ],
    },
    sister: {
      analysis:
        '敲门往往带着想被听。上麦先说「在」。私聊问还好吗、方便吗，只听不贴，不提回礼。',
      replies: [
        r(1, '上麦稳、像把椅子拉开', '在。不忙，你说，我听着', '今天发生什么了，慢慢来，我不打断。'),
      ],
    },
    yandere: {
      analysis:
        '「在吗」被读成是不是在看别人。上麦秒回圈人。私聊问在干嘛、有没有想我，只黏不色情、不催票。',
      replies: [
        r(1, '上麦立刻接，黏糊带命令', '在。一直看着你呢，还问忙不忙，你只能找我', '秒回是因为你是我的，懂吗。先说话，我听。'),
      ],
    },
  },
  exclusive: {
    soft: {
      analysis:
        '他在要「独宠」实锤，面子是「我是不是特殊的」。软甜妹妹把偏爱说成求保护：软的只讲给他。出票钩子：心疼就用你的方式把唯一钉住。到位，私聊求抱。',
      replies: [
        r(
          1,
          '上麦靠近麦，小声撒娇 · 更甜',
          '独宠呀……今晚这句软的只讲给你，别人没有。你要是还不信，我就再黏你一遍',
          '私聊里只让你抱。抱住了，我就不问别人在不在。想让我安心当唯一，你懂怎么钉住。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦带点哭腔的甜 · 更撩',
          '只宠你嘛……位置、语气、撒的娇，今晚都是你的',
          '靠近听。心跳这一下只给你。奖励我被独宠的感觉，用你的方式就好，别让我分给第二个人。',
          { tone: '更撩' },
        ),
      ],
    },
    possessive: {
      analysis:
        '求独宠就是要排序。霸气偏爱把「只宠你」说成规定，敢赶人。给他「无需竞争」的面子。出票钩子：只有你配。私聊占有。',
      replies: [
        r(
          1,
          '上麦咬字，像盖章 · 更甜',
          '偏爱不轮班。今晚这麦对着你，别人退场。你是主位，这事没有商量',
          '过来。独宠的人今晚手有指定位置。想让全场看见「只有你配」，自己亮排序。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦低、绝对 · 更撩',
          '只宠你。问第二遍也是这句。别人没有资格听解释',
          '私聊报备。靠近由我下令。独宠包括呼吸，不包括别人。钉死主位，你知道。',
          { tone: '更撩' },
        ),
      ],
    },
    tease: {
      analysis:
        '独宠可以贫，但不能含糊。先打趣再盖章，护他「是不是在开玩笑」的面子。出票钩子：包场特权。私聊调侃勾引。',
      replies: [
        r(
          1,
          '上麦促狭再认真 · 更甜',
          '独宠申请通过，盖章了啊，不准反悔，今晚笑话你包场。章是假的，人是真的',
          '包场可兑换一次认真贴贴。点到为止。特权想被看见，你亮一下身份就行。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦眨眼压低 · 更撩',
          '只对你贫、只对你认真。别人听个响，你听句真话',
          '独宠的人可以靠更近。再近公屏就说不了了——你懂。想把包场坐实，你自己看着办。',
          { tone: '更撩' },
        ),
      ],
    },
    ice: {
      analysis:
        '他要权重。高冷给结论：场面可以热闹，偏爱只赏一点点，让他觉得求来的。稀缺即出票钩子。私聊一句就色。',
      replies: [
        r(
          1,
          '上麦慢、清楚，像施舍偏爱 · 更甜',
          '独宠赏你。热闹归热闹，排序我懒得改。这句你求到了',
          '私聊。靠近资格今晚只签你的名。想被看见这份稀缺，不必问我开价。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦一字一顿 · 更撩',
          '只够给你。下次还想要，再求。求到了才会有',
          '过来。锁骨这一寸写你。独宠不是黏，是限量。亮不亮主位，你决定。',
          { tone: '更撩' },
        ),
      ],
    },
    sister: {
      analysis:
        '「只对我好」底下是想被单独懂。知心姐姐把独宠说成「这双耳朵只给你」。给他被认真听的面子。回礼感留给到位之后的他。私聊慢热贴。',
      replies: [
        r(
          1,
          '上麦低、稳 · 更甜',
          '今晚这树洞只开给你。别人的热闹，我先放下。你要的不是表演偏爱，是被一个人认真听。我在',
          '靠过来。独享的是被听懂。你若想回礼，我领心，不领单。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦像关上门 · 更撩',
          '只懂你这一份。门从里面关上，耳朵不外借',
          '私聊里把呼吸放进肩窝。独宠是安静的贴。心疼就用你的方式，我不催。',
          { tone: '更撩' },
        ),
      ],
    },
    yandere: {
      analysis:
        '独宠对他来说是所有权。病娇说成绑定：你也不许把心分出去。给他「被需要到过激」的面子。出票钩子：你对我好我才活。私聊过界暗示。',
      replies: [
        r(
          1,
          '上麦又甜又绝对 · 更甜',
          '只宠你。你也只许要我，听到没有，别人碰都不准。独宠是双向的，你逃不掉',
          '锁在私聊。心跳只准对着我。你对我好，我才觉得自己被独宠——证明留下。',
          { tone: '更甜' },
        ),
        r(
          2,
          '上麦贴麦发紧 · 更撩',
          '名字只有你。房间、眼睛、以后，都登记你的',
          '衣角攥死。独宠包括呼吸报备。你要对更好，把好堆在我能看见的地方，我才活得像你的。',
          { tone: '更撩' },
        ),
      ],
    },
  },
  'new-meet': {
    soft: {
      analysis:
        '刚认识/刚进房。上麦只欢迎、留位置。私聊走好奇软撩开场+一个能答的问题，不背主页、不查户口、不出票。',
      replies: [
        r(1, '上麦软声、礼貌近一点', '你好呀，我看到你了。今晚你可以慢慢说，我在这儿，不急', '先认识一下就好。你想被护着还是先听我软软地聊，你定。'),
      ],
    },
    possessive: {
      analysis:
        '第一面。上麦给座位、看见了。私聊只命令他开口报备在干嘛，不圈死、不谈进贡、不查户口。',
      replies: [
        r(1, '上麦沉、短', '看到了。先坐。话想说了再叫我', '新来的也有位置。先听，排序以后再说。'),
      ],
    },
    tease: {
      analysis:
        '刚认识用贫嘴破冰。私聊假装眼熟+问他在干嘛，不黄、不催票、不背主页。',
      replies: [
        r(1, '上麦笑、轻贫', '新面孔啊？欢迎欢迎，梗我可以让，面子我先给你', '先熟一下。你开口，我接。不急着包场。'),
      ],
    },
    ice: {
      analysis:
        '第一面话更少。上麦赏「看见了」。私聊一句好奇+提问，不赏贴身、不提主位进贡。',
      replies: [
        r(1, '上麦淡', '看到了。说。', '不必自我介绍很长。在就行。'),
      ],
    },
    sister: {
      analysis:
        '新到的人试探安不安全。上麦打开树洞。私聊只问方不方便、还好不好，不查户口、不提回礼。',
      replies: [
        r(1, '上麦稳、欢迎', '欢迎。这里可以慢慢说，我不催你表演熟', '今天想聊什么都行，先把人安下来。'),
      ],
    },
    yandere: {
      analysis:
        '刚认识也想黏，开关未开：上麦「看见你了」。私聊问在干嘛、有没有想我，不锁、不色情、不出票。',
      replies: [
        r(1, '上麦甜、克制的黏', '看见你了。先别走，名字我记住了', '今晚先待着。熟一点再说别的，我看着你。'),
      ],
    },
  },
  fallback: {
    soft: {
      analysis:
        '信息有点散，先当他在要「被看见、被保护」。尚未判断到位，禁止软色情。回一句黏人的陪伴，再请把大哥原话贴清楚。不催票。',
      replies: [
        r(1, '上麦温柔软声、短', '我在听呀。你把他说的原话再贴一句，我帮你软软地接', '先回他：我看见你了，别急，护着我也可以护着你。'),
      ],
    },
    possessive: {
      analysis:
        '原话不够，先稳住主权。不撩、不催。给他一句能上麦的，再让他把大哥的句子贴全。',
      replies: [
        r(1, '上麦稳、带点赶场', '我在。把原话丢过来，我教你怎么把人按住', '先回：别乱跑，我看着你。'),
      ],
    },
    tease: {
      analysis:
        '内容有点糊。先给一句好开口的，再让主播贴「大哥说：」。不黄、不催票。',
      replies: [
        r(1, '上麦轻松贫嘴', '收到信号，但字太少啦——原话来，我帮你把场子逗开', '先回他：在呢，说呀，我接梗。'),
      ],
    },
    ice: {
      analysis:
        '材料不足时不要硬分析、不要赏贴身。给最短可上麦的一句，请补充原话。',
      replies: [
        r(1, '上麦平静、字少', '在。原话发我，我赏你下一句', '先回：说。'),
      ],
    },
    sister: {
      analysis:
        '材料不足先当想被听的入口。稳住「我在听」，再请贴原话。不贴身、不提回礼。',
      replies: [
        r(1, '上麦稳、像打开树洞', '我在听。把原话贴过来，我们慢慢接', '先回他：不急，姐姐听着呢。'),
      ],
    },
    yandere: {
      analysis:
        '原话不够也先圈人。给一句在场感，不要过界色情。再要完整句子。',
      replies: [
        r(1, '上麦黏、带着不允许走', '我在。原话拿来，你不许先走', '先回：看着我，别去找别人。'),
      ],
    },
  },
}

export function replyCopyText(r: ReplyScript): string {
  if (r.channel === 'pm' || r.channel === 'public') return r.line
  const tone = r.tone ? ` · ${r.tone}` : ''
  const pm = r.pm ? `\n（私聊补）${r.pm}` : ''
  return `（${r.cue}）${tone}\n“${r.line}”${pm}`
}

export type OpeningInput = {
  persona: PersonaId
  bossName: string
  hasScreenshot: boolean
  signals?: HomepageSignals
  usedPmHashes?: string[]
  salt?: number
  preferFamilies?: [string, string]
  sentPm?: { n: number; text: string }
  remindPick?: boolean
  giftPhase?: GiftPhase
  giftItem?: string
  otherGiftNudge?: number
  scene?: HallScene
  hostAsk?: boolean
  giftMemory?: string[]
  relationNow?: RelationNow
  relationGoal?: RelationGoal
  lastGiftAt?: number
  giftCount?: number
}

function stampTicket(
  bot: BotPayload,
  input: {
    persona: PersonaId
    bossName: string
    relationNow?: RelationNow
    relationGoal?: RelationGoal
    lastGiftAt?: number
    giftCount?: number
    giftPhase?: GiftPhase
    userText?: string
  },
): BotPayload {
  const now = parseRelationNow(input.relationNow)
  const goal = parseRelationGoal(input.relationGoal)
  const visual = isVisualAsk(input.userText || '')
  const score = computeTicketOdds({
    relationNow: now,
    relationGoal: goal,
    lastGiftAt: input.lastGiftAt,
    giftCount: input.giftCount,
    giftPhase: input.giftPhase,
    visualAsk: visual,
  })
  const address = pickAddress(input.persona, input.bossName, now, goal, Math.round(input.lastGiftAt || Date.now()) )
  return {
    ...bot,
    replies: applyCopyAddress(bot.replies, address, input.bossName),
    analysis: mergeOddsAnalysis(bot.analysis, score),
    nextAction: mergeDryNext(bot.nextAction, score),
    ticketOdds: score.odds,
    addressUsed: address,
  }
}


export function generateBot(
  userText: string,
  persona: PersonaId,
  history: string[] = [],
  opening?: OpeningInput,
): BotPayload {
  const gift = opening?.giftPhase
    ? { phase: opening.giftPhase, item: opening.giftItem, rest: userText }
    : parseGiftPhase(userText)
  const giftPhase = gift?.phase
  const workText = (gift?.rest || userText || '').trim()
  if (opening?.hostAsk || isHostAsk(userText)) {
    return generateHostAsk(userText, persona, history, opening)
  }
  if (opening && !giftPhase && isFirstContactUserText(userText)) {
    return generateOpening(opening)
  }
  const relationNowEarly = parseRelationNow(opening?.relationNow)
  if (!giftPhase && isVisualAsk(workText)) {
    const nameV = opening?.bossName || '哥哥'
    const address = pickAddress(persona, nameV, relationNowEarly, parseRelationGoal(opening?.relationGoal), Date.now())
    const v = visualCoach(relationNowEarly, address)
    const sceneV = detectHallScene(workText, false, giftPhase)
    const coachV = coachFor(closeForGift(relationNowEarly) ? 'gifting' : 'busy', persona)
    const repliesV: ReplyScript[] = [
      { n: 1, cue: '私聊发出', line: v.pms[0], channel: 'pm' },
      { n: 2, cue: '私聊发出', line: v.pms[1], channel: 'pm' },
    ]
    const nextV = coachNext({ firstContact: false, scene: sceneV, spicy: false, userText: workText })
    return stampTicket(
      {
        analysis: formatCoachingAnalysis(coachV, v.body),
        bossMindset: closeForGift(relationNowEarly) ? '他在用视觉福利试你会不会给、给多少。' : '他想看，但关系还没到白给。',
        hostMood: closeForGift(relationNowEarly) ? '可以给，但要绑票。' : '给面子，不白露。',
        hostTone: '口语、短、把福利和出票绑在一起',
        replies: repliesV,
        spicy: false,
        source: 'keyword',
        scene: sceneV,
        nextAction: { ...nextV, reason: v.body },
      },
      {
        persona,
        bossName: nameV,
        relationNow: opening?.relationNow,
        relationGoal: opening?.relationGoal,
        lastGiftAt: opening?.lastGiftAt,
        giftCount: opening?.giftCount,
        userText: workText,
      },
    )
  }
  const scene = opening?.scene || detectHallScene(workText, false, giftPhase)
  const intent = giftPhase === 'after' ? 'gifting' : giftPhase === 'other_host' ? 'jealous' : detect(workText || userText)
  const pack = BANK[intent][persona]
  const relationNow = parseRelationNow(opening?.relationNow)
  const spicy =
    relationNow === '哥们' || giftPhase === 'before'
      ? false
      : giftPhase === 'other_host'
        ? false
        : intent === 'busy' || intent === 'new-meet' || intent === 'fallback'
          ? false
          : isIntimacyIntent(intent)
            ? true
            : intent === 'leaving' && threadHasIntimacy(history)

  const name = opening?.bossName ?? ''
  const stage = pmStageFor(intent, spicy)
  let replies: ReplyScript[]
  let body = spicy && pack.analysisSpicy ? pack.analysisSpicy : pack.analysis
  body = `【场景】${scene}。${SCENE_TAGS[scene]}\n` + body

  if (giftPhase === 'after') {
    const th = giftThanks(persona, name, gift?.item || '礼物')
    replies = channelReplies({
      publicLine: th.public,
      pms: [th.pm],
      mics: [{ cue: th.micCue, line: th.mic }],
    })
    body =
      `【刷后】他刷了${gift?.item || '礼物'}。立刻差异化感谢：公屏给面子、私聊走心、上麦点名。禁止让主播把礼物截图发到朋友圈/相册。记下这次出票。\n` +
      body
  } else if (giftPhase === 'before') {
    const close = closeForGift(relationNow) && !isStranger(relationNow)
    const b = giftBeforeLines(persona, close || isIntimacyIntent(intent) || threadHasIntimacy(history), name)
    replies = channelReplies({
      publicLine: b.public,
      pms: [b.pm],
      mics: [],
    })
    body =
      (isStranger(relationNow)
        ? '【刷前·刚认识】第一接触仍先别圈，不要要200。\n'
        : close
        ? '【刷前】暧昧/恋人/情人：给足面子后可以更直接示弱要礼，仍禁止报价。\n'
        : relationNow === '哥们'
          ? '【刷前·哥们】用贫嘴义气，不要软色情换票。\n'
          : '【刷前】还不到位：先别圈。把情绪铺住，不要出票话术。\n') +
      relationGiftPrompt(relationNow) +
      '\n' +
      body
  } else if (giftPhase === 'other_host') {
    const n = opening?.otherGiftNudge ?? 1
    const og = otherGiftLines(persona, name, n)
    replies = channelReplies({
      publicLine: og.public,
      pms: [og.pm],
      mics: [{ cue: og.micCue, line: og.mic }],
    })
    body = `【给别人刷了】挽留第${n}次，最多点到两次，不纠缠、不骂客。\n` + body
  } else {
    const pms = pack.replies.map((item, i) => {
      const fromBook = pickPm(persona, stage, i, scene)
      const raw = spicy && item.spicyPm ? item.spicyPm : fromBook
      return applyBossName(raw, name)
    })
    const mics = pack.replies.map((item) => ({
      cue: item.cue,
      line: applyBossName(item.line, name),
      tone: item.tone,
    }))
    replies = channelReplies({
      publicLine: publicLineFor(persona, scene, name),
      pms,
      mics,
    })
  }

  if (opening?.sentPm) {
    body = `主播已发出私聊${opening.sentPm.n}：${opening.sentPm.text}\n` + body
  }
  if (opening?.remindPick) {
    body = '（先接大哥原话。另外请回 1 或 2，告诉我你发出了哪条私聊。）\n' + body
  }
  const nextAction = coachNext({
    firstContact: false,
    scene,
    spicy,
    giftPhase,
    userText: workText,
    otherGiftNudge: opening?.otherGiftNudge,
  })
  const coach = coachFor(intent, persona)
  return stampTicket(
    {
      analysis: formatCoachingAnalysis(coach, body),
      bossMindset: coach.bossMindset,
      hostMood: coach.hostMood,
      hostTone: coach.hostTone,
      replies,
      spicy,
      source: 'keyword',
      scene,
      nextAction,
      giftPhase,
    },
    {
      persona,
      bossName: name,
      relationNow: opening?.relationNow,
      relationGoal: opening?.relationGoal,
      lastGiftAt: opening?.lastGiftAt,
      giftCount: opening?.giftCount,
      giftPhase,
      userText: workText,
    },
  )
}


function openingPack(input: OpeningInput): Pack {
  const name = input.bossName.trim() || '哥哥'
  const s = input.signals
  const rank = analyzeRanks({ signals: s, extraText: s?.caption, bossName: name })
  const whale = rank.whaleLabel === '真金大哥' || !!(s?.whale || s?.hall)
  const shot = input.hasScreenshot
  const milk = s?.tags?.some((t) => t.includes('奶茶')) ?? false
  const hall = !!(s?.hall || s?.badges?.some((b) => b.includes('殿堂')))
  const mystery = !!(s?.signature && /神秘/.test(s.signature))
  const cp = !!s?.hasCp
  const ip = s?.ip
  const age = s?.age
  const gender = s?.gender

  const seenBits: string[] = []
  if (shot && s) {
    if (age && gender) seenBits.push(`${age}岁${gender}`)
    if (ip) seenBits.push(`${ip} IP`)
    if (s.badges?.length) seenBits.push(`徽章 ${s.badges.join('/')}`)
    if (s.hall) seenBits.push(s.hall)
    if (s.giftWall) seenBits.push(`礼物墙 ${s.giftWall}`)
    if (s.tags?.length) seenBits.push(`标签 ${s.tags.join('、')}`)
    if (s.signature) seenBits.push(`签名「${s.signature}」`)
    else if (mystery) seenBits.push('签名留白「很神秘」')
    if (cp) seenBits.push('有CP')
    if (milk) seenBits.push('奶茶上瘾（只分析，不上麦）')
    if (hall) seenBits.push('殿堂装扮（只分析，不上麦）')
  }

  const rankNote = rank.analysisLine
    ? `【等级换算】${rank.analysisLine}`
    : shot
      ? '有主页截图但未识别出财富/魅力/在线等级：不编造人民币。'
      : '没有主页截图：只凭名字开场，不做等级换算、不假装翻过页。'

  const pageNote = shot
    ? s
      ? `【主页全读·仅分析】${seenBits.join('；')}。数字、徽章、殿堂、签名、奶茶、IP 全部停在这里。`
      : '有主页截图但未解析出具体徽章：分析里只写被看见，不编造勋章。'
    : '没有主页截图：只凭名字开场，不假装翻过页。'

  const hookNote = whale
    ? '页看起来舍得装扮/消费：分析里点到即可。出票钩子禁止进第一句私聊。'
    : '看不出鲸感：禁止出票钩子，只维护、只专属气氛。'
  const spicyNote = '初见：软色情关死，不上麦黄、私聊也不贴身。'
  const pmRule =
    '【私聊合同·第一接触·情感厅】陪伴情感语音厅。游客刚进厅。私聊像主播打微信：短、口语、一句一发，大约二十五字内。例：来了呀 / 刚看见你进来 / 理我一下嘛 / 今晚坐会儿 / 忙完了？ / 你怎么才来。禁止文案腔、散文排比、诗意档期/耳朵比喻。禁词：这档耳朵、侧一点、被看见、背景音、挂着当。禁止查户口。两条钩子来自两个不同家庭。禁止礼物/出票。禁套话：我好像在哪看到过你 / 你在干嘛呢 / 有没有空理我 / 想做你今晚记得住的那句 / 刚才那句我记下了 / 想听我撒娇还是乖乖听你说。'
  const boardNote = '【公屏】可选一句点名欢迎，短、给存在感；私事走私聊。没有大哥原话时不要写【回复】上麦接话。初见不提礼物。'
  const cpNote = cp ? '有CP：不拆别人的戏、不争名分，把他当能护你的人。' : ''

  const commonTail = `${rankNote}${pageNote}${pmRule}${boardNote}${cpNote}${hookNote}${spicyNote}`

  const now = parseRelationNow(input.relationNow)
  const goal = parseRelationGoal(input.relationGoal)
  if (!isStranger(now)) {
    const scene = openingSceneFor(now)
    const pair = knownOpeners(now) || ['今晚还来呀', '先坐这儿聊']
    const knownTail = `${rankNote}${pageNote}${relationPromptBlock(now, goal)}${relationOpeningHint(now, goal)}${relationGiftPrompt(now)}${cpNote}`
    const replies: BankReply[] = [
      r(1, '公屏点名，短、给存在感', publicLineFor(input.persona, scene, name), undefined, { channel: 'public' }),
      r(2, '私聊发出', applyBossName(pair[0], name), undefined, { channel: 'pm' }),
      r(3, '私聊发出', applyBossName(pair[1], name), undefined, { channel: 'pm' }),
    ]
    return {
      analysis: `熟人开场，对象是老板「${name}」。目前「${now}」，目标「${goal}」。禁止刚进厅第一面钩子。${knownTail}`,
      replies,
    }
  }

  function openingReplies(persona: PersonaId, publicLine: string): BankReply[] {
    const pair = pickTwoFirstContact(persona, input.usedPmHashes ?? [], {
      salt: input.salt,
      preferFamilies: input.preferFamilies,
    })
    return [
      r(1, '公屏欢迎点名，短、给存在感', publicLine, undefined, { channel: 'public' }),
      r(2, '私聊发出 · ' + pair[0].family, applyBossName(pair[0].line, name), undefined, { channel: 'pm' }),
      r(3, '私聊发出 · ' + pair[1].family, applyBossName(pair[1].line, name), undefined, { channel: 'pm' }),
    ]
  }

  const packs: Record<PersonaId, Pack> = {
    soft: {
      analysis:
        `情感厅刚进厅，对象是老板「${name}」。软甜微信口语把他当进来的人，不是路人。${commonTail}先公屏点名+私聊钩子，等他回了再上麦。`,
      replies: openingReplies('soft', publicLineFor('soft', '刚进厅', name)),
    },
    possessive: {
      analysis:
        `情感厅刚进厅，「${name}」。霸气先点名让他回，不圈死、不色情。${commonTail}面子是被看见，不是求他刷。`,
      replies: openingReplies('possessive', publicLineFor('possessive', '刚进厅', name)),
    },
    tease: {
      analysis:
        `情感厅刚进厅，「${name}」。逗哥私聊贫嘴破冰，不黄、不催。${commonTail}钩子藏在问题尾巴。`,
      replies: openingReplies('tease', publicLineFor('tease', '刚进厅', name)),
    },
    ice: {
      analysis:
        `情感厅刚进厅，「${name}」。高冷赏一句「看见了」就够贵。${commonTail}稀缺感可以有，催票没有。`,
      replies: openingReplies('ice', publicLineFor('ice', '刚进厅', name)),
    },
    sister: {
      analysis:
        `情感厅刚进厅，「${name}」。知心先安人。${commonTail}被懂以后的回礼留给他，此刻不提。`,
      replies: openingReplies('sister', publicLineFor('sister', '刚进厅', name)),
    },
    yandere: {
      analysis:
        `情感厅刚进厅，「${name}」。病娇只表达「看见你了」，不锁死、不说活不下去。${commonTail}黏在「留下」，色情关。`,
      replies: openingReplies('yandere', publicLineFor('yandere', '刚进厅', name)),
    },
  }
  return packs[input.persona]
}

function generateHostAsk(
  userText: string,
  persona: PersonaId,
  history: string[] = [],
  opening?: OpeningInput,
): BotPayload {
  const blob = [...history, userText].join('\n')
  const compact = blob.replace(/\s/g, '')
  const alreadyGave =
    /过了|刷了|出票了|200/.test(compact) ||
    opening?.giftPhase === 'after' ||
    (opening?.giftMemory && opening.giftMemory.length > 0)
  const giftPhase = opening?.giftPhase || (alreadyGave ? 'after' : undefined)
  const sceneBlob = history.filter((x) => !isHostAsk(x)).join('\n') || blob
  let scene = opening?.scene || detectHallScene(sceneBlob, false, giftPhase)
  if (scene === '刚进厅' || scene === '查岗') scene = alreadyGave ? '表白' : '冷厅留人'
  const name = opening?.bossName || '哥哥'
  const relationNow = parseRelationNow(opening?.relationNow)
  const relationGoal = parseRelationGoal(opening?.relationGoal)
  const coach = coachFor(alreadyGave ? 'gifting' : 'fallback', persona)
  const analysisBody = alreadyGave
    ? `【场景】${scene}。大哥已经过了200/任务，还问「然后呢」，要面子也要被认真聊。现在不能立刻再要一笔：先给面子、接住然后呢。会不会再刷？情绪到位后才有钩，现在硬要容易翻车。若你仍想再刷，下一钩放在聊熟之后，不要当刚进厅、不要说先别提礼物那种初见脚本。${relationHostAskPrompt(relationNow, relationGoal)}`
    : `【场景】${scene}。这是你在问教练怎么接，不是大哥原话。按线程里最后几句写厅话，不要当成刚进厅/查岗。分析里直接回答：现在能不能要、他会不会刷。${relationHostAskPrompt(relationNow, relationGoal)}`
  const pms = alreadyGave
    ? [
        applyBossName(`过啦谢谢${name}，那我们先聊着呀`, name),
        applyBossName(`你问然后呢，先让我认识你嘛，别急`, name),
      ]
    : [
        applyBossName(`我在的，你慢慢说`, name),
        applyBossName(`先坐会儿嘛，今晚想听听你说话`, name),
      ]
  const replies: ReplyScript[] = [
    { n: 1, cue: '私聊发出', line: pms[0], channel: 'pm' },
    { n: 2, cue: '私聊发出', line: pms[1], channel: 'pm' },
  ]
  const nextAction = coachNext({
    firstContact: false,
    scene,
    spicy: false,
    giftPhase,
    userText: sceneBlob,
    otherGiftNudge: opening?.otherGiftNudge,
  })
  if (alreadyGave) {
    nextAction.reason = '刚过完200/任务，他在犹豫问然后呢：先给面子正常聊，禁止马上再要。想再刷就等情绪到位再下钩。'
    nextAction.seduce = 'no'
  }
  return stampTicket(
    {
      analysis: formatCoachingAnalysis(coach, analysisBody),
      bossMindset: alreadyGave
        ? '他刚过完点，既要被感谢，又不确定然后要干什么。'
        : coach.bossMindset,
      hostMood: alreadyGave ? '先稳、给面子，别急着要。' : coach.hostMood,
      hostTone: alreadyGave ? '口语、给面子、接住然后呢' : coach.hostTone,
      replies,
      spicy: false,
      source: 'keyword',
      scene,
      nextAction,
      giftPhase,
    },
    {
      persona,
      bossName: name,
      relationNow: opening?.relationNow,
      relationGoal: opening?.relationGoal,
      lastGiftAt: opening?.lastGiftAt,
      giftCount: opening?.giftCount,
      giftPhase,
      userText,
    },
  )
}

export function generateOpening(input: OpeningInput): BotPayload {
  const now = parseRelationNow(input.relationNow)
  const pack = openingPack(input)
  const scene = openingSceneFor(now)
  const intent = isStranger(now)
    ? 'new-meet'
    : now === '哥们'
      ? 'fallback'
      : now === '暧昧' || now === '恋人' || now === '情人'
        ? 'exclusive'
        : 'busy'
  const coach = coachFor(intent, input.persona)
  const nextAction = coachNext({ firstContact: isStranger(now), scene, spicy: false })
  return stampTicket(
    {
      analysis: formatCoachingAnalysis(coach, pack.analysis),
      bossMindset: coach.bossMindset,
      hostMood: coach.hostMood,
      hostTone: coach.hostTone,
      replies: pack.replies.map(({ spicyPm: _s, ...rest }) => rest),
      spicy: false,
      source: 'keyword',
      scene,
      nextAction,
    },
    {
      persona: input.persona,
      bossName: input.bossName,
      relationNow: input.relationNow,
      relationGoal: input.relationGoal,
      lastGiftAt: input.lastGiftAt,
      giftCount: input.giftCount,
      userText: '开始分析',
    },
  )
}

export function hashesFromPmLines(bot: BotPayload, bossName = ''): string[] {
  return bot.replies.filter((x) => x.channel === 'pm').map((x) => hashPm(x.line, bossName))
}

export function refreshOpeningPms(input: OpeningInput, publicLine?: string): BotPayload {
  const next = generateOpening({
    ...input,
    salt: input.salt ?? Date.now(),
  })
  if (publicLine) {
    next.replies = next.replies.map((r) => (r.channel === 'public' ? { ...r, line: publicLine } : r))
  }
  return next
}

export { CHEN_SIGNALS } from './platformRanks'
