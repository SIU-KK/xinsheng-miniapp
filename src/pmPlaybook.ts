import type { HallScene, PersonaId, ReplyScript } from './types'
import { isCoachTagInLine, isExampleFingerprint } from './replyStyles'

/** 陪玩私聊三阶段：初见只勾人，升温只聊，圈礼等感情到位。 */
export type PmStage = 'firstContact' | 'warming' | '到位圈礼'

export const BANNED_CLICHES = [
  '我好像在哪看到过你',
  '你在干嘛呢',
  '有没有空理我',
  '想做你今晚记得住的那句',
  '刚才那句我记下了',
  '想听我撒娇还是乖乖听你说',
  '这档耳朵',
  '侧一点',
  '被看见',
  '背景音',
  '挂着当',
  '冷场归冷场',
  '在就不空',
  '灯还开着',
  '金主那边再催了么',
  '没有我你睡得明白么',
  '祝你尿床',
  '会睡觉得男生很加分',
  '定位发来',
  '留个醒嗓位',
  '醒嗓',
  '验收我嗓子',
  '嗓子还在不在',
  '梦里别把麦抢了',
  '梦里把麦抢了',
  '抢麦',
  '留麦位',
  '来厅里点卯',
] as const

const BANNED_EXTRA = [
  /好像在哪[看见]+过你/,
  /有没有空理我/,
  /今晚记得住的那句/,
  /乖乖听你说/,
  /几岁了/,
  /哪里人/,
  /做什么的/,
  /结婚了吗/,
  /有对象吗/,
  /这档耳朵/,
  /侧一点/,
  /被看见/,
  /背景音/,
  /挂着当/,
  /耳朵给你/,
  /耳朵先朝/,
  /朝你侧/,
  /当背景/,
  /正经耳朵/,
  /留耳朵/,
  /这耳朵/,
  /档期/,
  /找人说/,
  /陪我说/,
  /没人聊/,
  /好无聊/,
  /陪我聊/,
  /今晚没人/,
  /想找人/,
  /你来陪/,
  /缺个人/,
  /厅好冷/,
  /陪我坐/,
  /再陪我/,
  /你陪我/,
  /先陪我/,
  /来陪我/,
  /陪我一会儿/,
  /说说话/,
  /找人倾诉/,
  /无聊找人/,
  /冷场归冷场/,
  /在就不空/,
  /灯还开着/,
  /醒嗓/,
  /验收.{0,8}嗓子/,
  /嗓子还在不在/,
  /抢麦/,
  /把麦抢/,
  /留麦位/,
  /留个.{0,8}位/,
  /给你留位/,
  /我给你留.{0,6}(位|麦|醒|嗓)/,
  /来厅里点卯/,
  /点卯/,
  /明天.{0,8}来厅/,
  /醒了.{0,8}来厅/,
]

export const PM_MAX_CHARS = 48

export function pmCharLen(s: string): number {
  return (s || '').replace(/\s/g, '').length
}

export function isLiteraryPm(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return false
  return /这档耳朵|侧一点|被看见|背景音|挂着当|耳朵给你|耳朵先朝|朝你侧|当背景|正经耳朵|留耳朵|这耳朵|档期|醒嗓|抢麦|留麦位|点卯/.test(t)
}

/** 主持把大哥当填空：自己无聊/缺人/要人陪。必须把情绪价值给鲸。 */
export const HOST_VACANCY_RE =
  /找人说|陪我说|没人聊|好无聊|找人倾诉|陪我聊|今晚没人|想找人|你来陪|缺个人|厅好冷|陪我坐|再陪我|你陪我|先陪我|来陪我|陪我一会儿|陪我一下|多陪我|正好.{0,8}找人|没人说话|找人说话|说说话|无聊找人|厅有点空|我谁护|倾诉/

export const WHALE_VALUE_PROMPT = `【情绪价值方向·硬禁】
公屏/私聊/上麦必须把情绪价值给大哥。禁止把大哥当成给主持填空、陪聊、提供情绪价值的人。大哥没有义务给主持提供情绪价值。
禁止（一字不写，写了作废）：主持孤独/无聊/缺人；陪我聊；今晚没人；正好想找人说话；你来陪我；缺个人说说话；厅好冷你来陪；无聊找人倾诉；正好今晚想找人说说话；找人说；陪我说；没人聊；陪我坐；再陪我。
允许：点名看见他、给面子、好奇他本人、独占注意力、想听你说话、留你坐会儿是因为想跟你聊——他是被珍视的那个，不是来填空的。
反例：幕哥哥坐会儿嘛，正好今晚想找人说说话
正例：幕哥哥坐会儿嘛，今晚就想听听你说话
正例：看见你进来才觉得这厅有人了
禁止人机厅口号（一字不写）：冷场归冷场、{n}在就不空、灯还开着。公屏要像随口贫一句，不要套模板。`

export function isHostVacancyCopy(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return false
  return HOST_VACANCY_RE.test(t)
}

export function rewriteHostVacancyPhrases(line: string): string {
  return (line || '')
    .replace(/正好今晚想找人说说话/g, '今晚就想听听你说话')
    .replace(/正好想找人说说话/g, '今晚就想听听你说话')
    .replace(/想找人说说话/g, '想听听你说话')
    .replace(/找人说说话/g, '听听你说话')
    .replace(/想找人说话/g, '想听听你说话')
    .replace(/找人说话/g, '听听你说话')
    .replace(/陪我聊[天聊]?/g, '想听你说话')
    .replace(/你来陪我/g, '今晚想听你说话')
    .replace(/先陪我坐会儿/g, '先坐会儿，今晚想听听你说话')
    .replace(/再陪我一会儿好不好/g, '再坐会儿嘛，今晚就想听听你说话')
    .replace(/再陪我一会儿/g, '再坐会儿')
    .replace(/你陪我，我也陪你/g, '今晚就想听听你说话')
    .replace(/你陪我/g, '我想听你说话')
    .replace(/先陪我就好/g, '今晚想听听你说话就好')
    .replace(/来陪我/g, '坐这儿')
    .replace(/先陪我/g, '先坐会儿')
    .replace(/多陪我/g, '再坐会儿')
    .replace(/陪我坐会儿/g, '坐会儿，想听你说话')
    .replace(/陪我一下/g, '坐会儿')
    .replace(/陪我一会儿/g, '坐会儿')
    .replace(/陪我说/g, '听你说')
    .replace(/今晚没人/g, '今晚就想听你')
    .replace(/厅好冷你来陪/g, '看见你进来才觉得这厅有人了')
    .replace(/厅好冷/g, '看见你才觉得厅里有人')
    .replace(/厅有点空/g, '看见你在这厅才算有人')
    .replace(/缺个人说说话/g, '就想听听你说话')
    .replace(/缺个人/g, '就想听你')
    .replace(/没人聊/g, '想听你说')
    .replace(/没人说话/g, '想听你说')
    .replace(/好无聊找人/g, '就想听你')
    .replace(/无聊找人倾诉/g, '想听听你说话')
    .replace(/找人倾诉/g, '想听你说')
    .replace(/找人说/g, '听你说')
    .replace(/好无聊/g, '')
    .replace(/你走了我谁护呀，?/g, '')
    .replace(/倾诉/g, '听你说')
    .replace(/说说话/g, '说话')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^，/, '')
    .trim()
}

export function sanitizeWhaleValueLine(line: string, _address = ''): string {
  const raw = (line || '').trim()
  if (!raw) return raw
  if (!isHostVacancyCopy(raw)) return raw
  const next = rewriteHostVacancyPhrases(raw)
  if (next && !isHostVacancyCopy(next)) return next
  return ''
}

/** 厅务播报：排麦/留位/醒嗓/抢麦。睡/走回复必须是关系情商，不是档期口播。 */
export const HALL_OPS_RE =
  /醒嗓|验收.{0,8}嗓子|嗓子还在不在|抢麦|把麦抢|梦里.{0,6}麦|留麦位|留个.{0,8}(位|麦)|给你留位|我给你留.{0,6}(位|麦|醒|嗓)|来厅里点卯|点卯|(明天|明早|醒了).{0,10}来厅|来厅里.{0,10}(醒|验收|麦|嗓|点卯|留)/

export function isHallOpsCopy(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return false
  return HALL_OPS_RE.test(t)
}

export const HALL_OPS_BAN_PROMPT = `【禁厅务套话·公屏/私聊一字不写】
睡/走是关系、情商、给他情绪价值，不是厅务播报、不是排麦口播、不是主持「我给你留位」、不是说明书/PA。
禁止：留个醒嗓位、醒嗓、验收我嗓子、嗓子还在不在、梦里把麦抢了、抢麦、留麦位、来厅里点卯、档期、这档耳朵、冷场归冷场。
禁止三句同一骨架（晚安 + 明天来厅 + 嗓子/麦）。禁止同一开头三联（豆哥/睡吧/晚安）。line 禁止写软保养/逗/家族名。
【BAD 厅务播报·照抄作废】
公屏：豆哥晚安，梦里别把麦抢了哈
私聊软保养腔：豆哥快去睡，明天醒了来厅里，我给你留个醒嗓位
私聊逗腔：豆哥晚安，等你明天来验收我嗓子还在不在
【GOOD 味·禁止背成文案】睡觉公屏可省略或两三个字打发，不要第三人称晚安。两条私聊两种人冲动：损一句 vs 软一句，可以问句或残句，不必都叫名字，至少一条不写睡/晚安。禁止示范指纹当结尾。`

export function isCannedHallSlogan(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  return /冷场归冷场|在就不空|灯还开着/.test(t) || isHallOpsCopy(text)
}

export function strippedCopy(text: string): string {
  return (text || '').replace(/\s/g, '').replace(/^[，,。！!？?、~～]+/, '')
}

/** First 2–3 chars after stripping punct. 豆哥 / 睡吧 / 晚安 collide here. */
export function openingHead(text: string, n = 2): string {
  return strippedCopy(text).slice(0, n)
}

export function sharesOpening(a: string, b: string): boolean {
  const x = strippedCopy(a)
  const y = strippedCopy(b)
  if (!x || !y) return false
  if (x.slice(0, 2) && x.slice(0, 2) === y.slice(0, 2)) return true
  if (x.length >= 3 && y.length >= 3 && x.slice(0, 3) === y.slice(0, 3)) return true
  return false
}

const HONORIFIC_START = /^(?:[\u4e00-\u9fff]{1,4}(?:哥|哥哥)|哥哥|宝宝|宝贝|老公)/

export function startsWithHonorific(text: string): boolean {
  return HONORIFIC_START.test(strippedCopy(text))
}

/** 豆哥，睡 / 豆哥快睡 / 豆哥晚安 — canned sleep openers, not WeChat. */
export function isCannedSleepOpener(text: string): boolean {
  const t = strippedCopy(text)
  return /^(?:[\u4e00-\u9fff]{1,4}(?:哥|哥哥)|哥哥|宝宝|宝贝|老公)[，,！!]?(?:快)?(?:去)?(?:睡|晚安)/.test(t)
}

export function hasSleepToken(text: string): boolean {
  return /睡|晚安/.test(strippedCopy(text))
}

export function isSleepPublicStiff(text: string): boolean {
  const t = strippedCopy(text)
  if (!t) return true
  if (t.length > 6) return true
  if (/晚安/.test(t)) return true
  if (startsWithHonorific(t) && hasSleepToken(t)) return true
  return false
}

export function isAnalysisToneLeak(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  return /朋友阶段|不逼单|出票机率|【下一步】|大哥心态|你的心情|你的语气|心态\/心情|给面子放人/.test(t)
}

export const SLEEP_COPY_PROMPT = `【睡觉·随手回微信】公屏可省略，或只回 2–6 字（去吧 / 嗯），禁止第三句晚安、禁止公屏再点名睡。
两条私聊 = 两种人冲动：一句损、一句软；其中一条可以是问句或残句碎片。
硬禁同一开头：任意两句前 2–3 字不得相同（豆哥 / 睡吧 / 晚安）。最多一条以称呼开头。至少一条私聊不含「睡/晚安」。
禁止说明书三件套（注意休息 / 明天再聊 / 别熬夜）。禁止 豆哥睡 / 豆哥快睡 / 豆哥晚安 三联。`

export const SAME_OPENING_BAN = `【禁同一开头】可复制的公屏+私聊，任意两句开头 2–3 字不得相同。最多一条以称呼（X哥/哥哥/宝宝/宝贝/老公）开头。可以不叫名字、可以两个字、可以只接他的字眼。`

type OpeningFilterOpts = {
  sleep?: boolean
  hostAsk?: boolean
}

export function dropSameOpenings(replies: ReplyScript[], opts: OpeningFilterOpts = {}): ReplyScript[] {
  const out: ReplyScript[] = []
  let honorifics = 0
  for (const r of replies) {
    const line = (r.line || '').trim()
    if (!line) continue
    const channel = opts.hostAsk ? 'pm' : r.channel
    if (opts.sleep && channel === 'public' && isSleepPublicStiff(line)) continue
    if (out.some((x) => sharesOpening(x.line, line))) continue
    if (startsWithHonorific(line)) {
      if (honorifics >= 1) continue
      honorifics += 1
    }
    out.push({ ...r, line, channel, n: out.length + 1 })
  }
  const canned = out.filter((r) => isCannedSleepOpener(r.line) && (r.channel === 'pm' || r.channel === 'public'))
  if (canned.length >= 2) {
    const goodPm = out.filter((r) => r.channel === 'pm' && !isCannedSleepOpener(r.line))
    let next = out.filter((r) => !isCannedSleepOpener(r.line))
    if (!next.some((r) => r.channel === 'pm')) {
      const fallback = canned.find((r) => r.channel === 'pm')
      if (fallback && !goodPm.length) next = [...next, fallback]
    }
    out.length = 0
    out.push(...next)
  }
  if (opts.sleep) {
    const pms = out.filter((r) => r.channel === 'pm')
    const without = pms.filter((r) => !hasSleepToken(r.line))
    if (pms.length >= 2 && without.length === 0) {
      const keep = pms[0]
      return out.filter((r) => r.channel !== 'pm' || r === keep).map((r, i) => ({ ...r, n: i + 1 }))
    }
  }
  return out.map((r, i) => ({ ...r, n: i + 1 }))
}


/** Length is a prompt hint only — never a 502 / drop gate. */
export function pmTooLong(text: string): boolean {
  return pmCharLen(text) > PM_MAX_CHARS
}

export function pmNeedsSwap(text: string): boolean {
  const t = (text || '').trim()
  return !t || hasBannedCliche(t) || isLiteraryPm(t) || isHostVacancyCopy(t) || isCannedHallSlogan(t) || isHallOpsCopy(t) || isExampleFingerprint(t) || isCoachTagInLine(t) || isCannedSleepOpener(t) || isAnalysisToneLeak(t)
}

export type FirstFamily = string

export type FamilyBank = Record<FirstFamily, readonly string[]>

/** 人设内部分家，禁止跨人设混用。{n} = 老板名。微信口语，一句一发。 */
export const FIRST_FAMILIES: Record<PersonaId, FamilyBank> = {
  soft: {
    撒娇: [
      '理我一下嘛',
      '{n}，回我一下嘛',
      '你理理我嘛',
      '撒个娇，你理不理',
    ],
    刚看见: [
      '刚看见你进来',
      '{n}我看见你了呀',
      '看见你进来了',
    ],
    软问句: [
      '今晚坐会儿？',
      '忙完了？',
      '你怎么才来',
    ],
  },
  possessive: {
    短: [
      '到了。开口。',
      '看见了。说。',
      '{n}。人到了就说。',
    ],
    点名: [
      '{n}。点你了。',
      '叫你了，别装没看见。',
      '名字点过了，你说。',
    ],
    留座: [
      '坐这儿。别站着。',
      '位置给你了，坐。',
      '先坐下。',
    ],
  },
  tease: {
    有趣开场: [
      '{n}来了啊，厅活了',
      '来了就说话呀',
      '进厅了？接一下',
    ],
    贫嘴: [
      '别装路过啊',
      '打个招呼嘛',
      '{n}，装酷我就贫你',
    ],
    反差梗: [
      '贫你两句，人是认真的',
      '先逗你一口。回不回？',
      '笑话归厅，你先开口',
    ],
  },
  ice: {
    高级感: [
      '你来了。看见了。',
      '来了。抬一眼。',
      '这一句给你。领不领。',
    ],
    话少: [
      '看见。说。',
      '在。你说。',
      '{n}。',
    ],
    不问行踪: [
      '人在就行。',
      '不必解释。',
      '坐。灯开着。',
    ],
  },
  sister: {
    关心: [
      '来了就好，累不累',
      '想说就说，我不催',
      '人到了就行',
    ],
    安人: [
      '先坐会儿',
      '不急，慢慢来',
      '{n}，今晚坐会儿',
    ],
    不腻: [
      '欢迎。慢慢来。',
      '先坐。不想说也行。',
      '不吵你。要聊敲一下。',
    ],
  },
  yandere: {
    黏: [
      '看见你了，理我一下',
      '先回我一下嘛',
      '{n}，我看见你了',
    ],
    看见你了: [
      '看见你了。不是路过。',
      '你名字刚亮，我记住了',
      '刚看见你进来',
    ],
    别走: [
      '先别走，待一会儿',
      '走之前回我一个字',
      '别闪呀，人在就行',
    ],
  },
}

export const PERSONA_STYLE_EXAMPLES: Record<PersonaId, string> = {
  soft: '情感厅·软甜：微信口语，撒娇/刚看见你/软问句。例：「来了呀」「刚看见你进来」「理我一下嘛」「今晚坐会儿？」。禁止文案腔、禁止这档耳朵/侧一点/背景音。',
  possessive: '情感厅·霸气：短、点名、让坐，像打字命令。例：「到了。开口。」「坐这儿。」禁止撒娇黏糊、禁止诗意档期。',
  tease: '情感厅·逗：贫嘴口语。例：「来了啊，厅活了」「别装路过啊」。禁止高冷一句、禁止软声求护、禁止文学比喻。',
  ice: '情感厅·高冷：字少、像回微信。例：「你来了。看见了。」「在。你说。」禁止撒娇、禁止排比散文。',
  sister: '情感厅·知心：关心但不妈味。例：「来了就好，累不累」「今晚坐会儿」。禁止留耳朵/这档比喻、禁止软撩套话。',
  yandere: '情感厅·病娇：黏、看见你了、别走。例：「看见你了，理我一下」「你怎么才来」。禁止查岗「你在干嘛呢」、禁止诗意锁人。',
}

/** 八场景私聊交作业/维系，按人设分嘴。每条口语，约25字内。 */
export const SCENE_PM: Record<PersonaId, Record<HallScene, readonly string[]>> = {
  soft: {
    刚进厅: ['刚看见你进来'],
    冷厅留人: ['看见你在，这厅才算有人'],
    查岗: ['在的。忙完了？'],
    要走试探: ['别真下线呀，再坐会儿'],
    深夜树洞: ['还没睡？我陪着'],
    表白: ['喜欢呀，今晚坐会儿'],
    给别人刷礼: ['热闹归热闹，理我一下'],
    下档维护: ['先回去歇，下次还来'],
  },
  possessive: {
    刚进厅: ['到了。开口。'],
    冷厅留人: ['人少也坐着。报备。'],
    查岗: ['在。有事叫我。'],
    要走试探: ['走可以，回来报备。'],
    深夜树洞: ['夜还长。说。'],
    表白: ['话接住了。继续说。'],
    给别人刷礼: ['去一圈。回来报备。'],
    下档维护: ['下了。下次开口我在。'],
  },
  tease: {
    刚进厅: ['{n}来了啊，接一下'],
    冷厅留人: ['冷场也行，你丢一句'],
    查岗: ['查岗收到。人在。'],
    要走试探: ['现在走我记仇哦'],
    深夜树洞: ['夜猫来了？说呀'],
    表白: ['认真了？那我不贫这句'],
    给别人刷礼: ['热闹可以看。回我这句'],
    下档维护: ['下了哈，下次还贫你'],
  },
  ice: {
    刚进厅: ['你来了。看见了。'],
    冷厅留人: ['厅冷。你在就行。'],
    查岗: ['在。一条回一条。'],
    要走试探: ['去。想被理再来。'],
    深夜树洞: ['夜深。说。'],
    表白: ['听到了。记下了。'],
    给别人刷礼: ['应酬懒得说。问我。'],
    下档维护: ['下了。灯在。'],
  },
  sister: {
    刚进厅: ['来了就好，坐会儿'],
    冷厅留人: ['人少也没事，先坐'],
    查岗: ['在。不忙。慢慢说。'],
    要走试探: ['累了就歇，门不关。'],
    深夜树洞: ['夜深了，想说就说。'],
    表白: ['喜欢先放一放。累不累？'],
    给别人刷礼: ['位置给你留着。'],
    下档维护: ['辛苦了，回去歇。'],
  },
  yandere: {
    刚进厅: ['看见你了。先回我一下。'],
    冷厅留人: ['厅里我只盯你。别闪。'],
    查岗: ['在。一直看着你。说。'],
    要走试探: ['真走也先报备。'],
    深夜树洞: ['夜深了也先找我。'],
    表白: ['说喜欢了就不许收回。'],
    给别人刷礼: ['准看一眼。回我一下。'],
    下档维护: ['下了也报备。下次找我。'],
  },
}

export const PM_PLAYBOOK: Record<PersonaId, Record<PmStage, readonly string[]>> = {
  soft: {
    firstContact: flatten(FIRST_FAMILIES.soft),
    warming: [
      '你回我了，今晚坐会儿？',
      '喜欢呀，今晚想聊啥',
      '我接着了。再说一句嘛',
    ],
    到位圈礼: [
      '来这么久，心疼就让我知道',
      '软的都给你了，你护我就行',
    ],
  },
  possessive: {
    firstContact: flatten(FIRST_FAMILIES.possessive),
    warming: [
      '话接住了。继续说。',
      '喜欢说这么早？先坐下。',
      '报备完了。下一句。',
    ],
    到位圈礼: [
      '坐这么久了。想钉就自己亮。',
      '排序我心里有。你看着办。',
    ],
  },
  tease: {
    firstContact: flatten(FIRST_FAMILIES.tease),
    warming: [
      '梗接上了。再丢一句。',
      '表白这么快，我可要贫你哦',
      '认真半句：我在听。',
    ],
    到位圈礼: [
      '包场半晚了，亮不亮你定。',
      '认真那半句给你。你懂。',
    ],
  },
  ice: {
    firstContact: flatten(FIRST_FAMILIES.ice),
    warming: [
      '听到了。下一条。',
      '喜欢来得早。所为何事。',
      '继续。字少我也听。',
    ],
    到位圈礼: [
      '待这么久了。想留就自己亮。',
      '这句赏过了。其余你定。',
    ],
  },
  sister: {
    firstContact: flatten(FIRST_FAMILIES.sister),
    warming: [
      '这句我接着了。慢慢说。',
      '喜欢先放一放。累不累？',
      '我还在听。说完就好。',
    ],
    到位圈礼: [
      '陪这么久了。想回礼我领心。',
      '我不报价。你习惯的方式就好。',
    ],
  },
  yandere: {
    firstContact: flatten(FIRST_FAMILIES.yandere),
    warming: [
      '你回我了，我就只看你。',
      '说喜欢了？视线别分出去。',
      '回了就好。接着说。',
    ],
    到位圈礼: [
      '对我好一点，让我看得见。',
      '把好放我看得见的地方。',
    ],
  },
}

function flatten(bank: FamilyBank): string[] {
  return Object.values(bank).flatMap((xs) => [...xs])
}

export function hashPm(s: string, bossName = ''): string {
  let h = 2166136261
  let t = (s || '').replace(/\{n\}/g, '').replace(/\s/g, '')
  const n = (bossName || '').trim()
  if (n) t = t.split(n).join('')
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export function applyBossName(line: string, name: string): string {
  const n = (name || '').trim() || '哥哥'
  return line.replace(/\{n\}/g, n)
}

export function hasBannedCliche(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return false
  for (const c of BANNED_CLICHES) {
    if (t.includes(c.replace(/\s/g, ''))) return true
  }
  return BANNED_EXTRA.some((re) => re.test(t))
}

export function skeletonKey(s: string): string {
  return (s || '')
    .replace(/\{n\}/g, '')
    .replace(/[，。！？…~～、,.!?\s「」""']/g, '')
    .replace(/你在干嘛呢?|有没有空|好像在哪.{0,4}你/g, '')
    .slice(0, 8)
}

export function linesLookSimilar(a: string, b: string): boolean {
  const x = (a || '').replace(/\s/g, '')
  const y = (b || '').replace(/\s/g, '')
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x))) return true
  const ka = skeletonKey(x)
  const kb = skeletonKey(y)
  if (ka && kb && (ka === kb || (ka.length >= 4 && kb.startsWith(ka)) || (kb.length >= 4 && ka.startsWith(kb)))) {
    return true
  }
  const endsA = /[吗嘛呀呢？?]$/.test(x)
  const endsB = /[吗嘛呀呢？?]$/.test(y)
  const startsSame = x.slice(0, 4) === y.slice(0, 4)
  return startsSame && endsA && endsB
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type FamilyPick = { family: string; line: string; hash: string }

export function pickTwoFirstContact(
  persona: PersonaId,
  usedHashes: readonly string[] = [],
  opts?: { salt?: number; preferFamilies?: [string, string] },
): [FamilyPick, FamilyPick] {
  const bank = FIRST_FAMILIES[persona]
  const families = Object.keys(bank)
  const used = new Set(usedHashes)
  const rng = mulberry32(opts?.salt ?? Date.now() ^ persona.length * 997)

  const unusedIn = (fam: string) => bank[fam].filter((l) => !used.has(hashPm(l)))

  let order = [...families]
  if (opts?.preferFamilies) {
    order = [
      ...opts.preferFamilies.filter((f) => families.includes(f)),
      ...families.filter((f) => !opts.preferFamilies?.includes(f)),
    ]
  } else {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }

  const take = (fam: string, avoidLine?: string): FamilyPick | null => {
    let pool = unusedIn(fam)
    if (!pool.length) pool = [...bank[fam]]
    if (avoidLine) pool = pool.filter((l) => !linesLookSimilar(l, avoidLine))
    if (!pool.length) pool = [...bank[fam]]
    const line = pool[Math.floor(rng() * pool.length)] || bank[fam][0]
    return { family: fam, line, hash: hashPm(line) }
  }

  const famA = order[0]
  const famB = order.find((f) => f !== famA) || order[1] || order[0]
  const a = take(famA)!
  const b = take(famB, a.line)!
  if (a.family === b.family || linesLookSimilar(a.line, b.line) || a.hash === b.hash) {
    for (const f of families) {
      if (f === a.family) continue
      const alt = take(f, a.line)
      if (alt && alt.hash !== a.hash && !linesLookSimilar(alt.line, a.line)) {
        return [a, alt]
      }
    }
  }
  return [a, b]
}

export function swapSecondFromPool(
  persona: PersonaId,
  firstLine: string,
  usedHashes: readonly string[] = [],
  salt?: number,
): FamilyPick {
  const [x, y] = pickTwoFirstContact(persona, usedHashes, { salt })
  if (!linesLookSimilar(y.line, firstLine) && hashPm(y.line) !== hashPm(firstLine)) return y
  if (!linesLookSimilar(x.line, firstLine)) return x
  const bank = FIRST_FAMILIES[persona]
  for (const [family, lines] of Object.entries(bank)) {
    for (const line of lines) {
      if (!linesLookSimilar(line, firstLine) && !pmNeedsSwap(line)) {
        return { family, line, hash: hashPm(line) }
      }
    }
  }
  return y
}

export function diversifyPmPair(
  persona: PersonaId,
  lineA: string,
  lineB: string,
  usedHashes: readonly string[] = [],
  name = '',
): [string, string] {
  let a = lineA.trim()
  let b = lineB.trim()
  const used = [...usedHashes]
  if (pmNeedsSwap(a)) {
    const p = pickTwoFirstContact(persona, used)
    a = applyBossName(p[0].line, name)
    used.push(p[0].hash)
  }
  if (pmNeedsSwap(b) || linesLookSimilar(a, b)) {
    const p = swapSecondFromPool(persona, a, used)
    b = applyBossName(p.line, name)
  }
  if (pmNeedsSwap(b) || linesLookSimilar(a, b)) {
    const p = swapSecondFromPool(persona, a, used, 42)
    b = applyBossName(p.line, name)
  }
  return [a, b]
}

export function pickPm(persona: PersonaId, stage: PmStage, variant = 0, scene?: HallScene): string {
  if (scene && SCENE_PM[persona][scene]?.length) {
    const bank = SCENE_PM[persona][scene]
    const i = ((variant % bank.length) + bank.length) % bank.length
    return bank[i]
  }
  const bank = PM_PLAYBOOK[persona][stage]
  const i = ((variant % bank.length) + bank.length) % bank.length
  return bank[i]
}

export function pmStageFor(
  intent: 'new-meet' | 'busy' | 'fallback' | 'leaving' | 'confirm-accompany' | 'jealous' | 'gifting' | 'exclusive',
  spicy: boolean,
): PmStage {
  if (intent === 'new-meet' || intent === 'busy') return 'firstContact'
  if (
    intent === 'confirm-accompany' ||
    intent === 'exclusive' ||
    intent === 'jealous' ||
    intent === 'gifting' ||
    (intent === 'leaving' && spicy)
  ) {
    return '到位圈礼'
  }
  return 'warming'
}
