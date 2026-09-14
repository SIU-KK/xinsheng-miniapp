import {
  isNextActionType,
  type GiftPhase,
  type HallScene,
  type NextAction,
  type NextActionType,
  type PersonaId,
  type ReplyScript,
} from './types'

function applyBossName(line: string, name: string): string {
  const n = (name || '').trim() || '哥哥'
  return line.replace(/\{n\}/g, n)
}

export const HALL_SCENES: HallScene[] = [
  '刚进厅',
  '冷厅留人',
  '查岗',
  '要走试探',
  '深夜树洞',
  '表白',
  '给别人刷礼',
  '下档维护',
]

export const SCENE_TAGS: Record<HallScene, string> = {
  刚进厅: '游客刚进厅。公屏点名给存在感；私聊像微信一句，让他有话接。禁止查户口、禁止报徽章流水、禁止提礼物。没有大哥原话就不上麦接话。',
  冷厅留人: '厅冷、人少。目标是把游客留到下一句，不是救场表演才艺。公屏短、私事走私聊。',
  查岗: '「在吗/忙不忙」是敲门。立刻给在场感。禁止审讯行踪，禁止趁机出票。',
  要走试探: '「要走」多半是试探你挽不挽。留一次台阶，不绑、不卖惨。',
  深夜树洞: '夜深、想被听。卖陪伴。可考虑电话，仅情绪到位或他冷淡需要突破时；初见禁止。',
  表白: '他在要名分或把喜欢说出口。接住面子，专属落句。初见不提礼物；到位才圈礼暗示。',
  给别人刷礼: '注意力分给别人。挽留 1–2 次点到为止，不纠缠、不骂客。',
  下档维护: '排麦结束。私聊是售后：送到门口，约下次，别盘问。睡觉就放人，公屏可省略。',
}

const PUB: Record<HallScene, Record<PersonaId, string>> = {
  刚进厅: {
    soft: '欢迎{n}～来了呀',
    possessive: '{n}来了。坐。',
    tease: '{n}来了啊',
    ice: '{n}。',
    sister: '欢迎{n}，坐会儿',
    yandere: '{n}来了，先待着。',
  },
  冷厅留人: {
    soft: '{n}还在呀，别走',
    possessive: '{n}别闪。先坐着。',
    tease: '{n}人在，今晚就算没白开',
    ice: '{n}还在。够了。',
    sister: '{n}，先坐着，不赶你。',
    yandere: '{n}别走，我盯着你。',
  },
  查岗: {
    soft: '{n}喊我啦，我在的。',
    possessive: '{n}。在。',
    tease: '{n}查岗？查到了。',
    ice: '{n}。在。',
    sister: '{n}，我听着。',
    yandere: '{n}叫我我就在。',
  },
  要走试探: {
    soft: '{n}再坐一会儿好不好……',
    possessive: '{n}，位置还在。',
    tease: '{n}现在走我会记仇哦。',
    ice: '{n}。想走也可以，想被理再开口。',
    sister: '{n}累了就歇，门不关。',
    yandere: '{n}不许直接消失。',
  },
  深夜树洞: {
    soft: '{n}还没睡呀……我陪着。',
    possessive: '{n}。夜还长，说。',
    tease: '夜猫{n}来了？',
    ice: '{n}。说。',
    sister: '{n}，今晚我听着。',
    yandere: '{n}夜深了也先找我。',
  },
  表白: {
    soft: '{n}这句话，我听见了。',
    possessive: '{n}。今晚这句只认你。',
    tease: '{n}认真了？那我也不贫这一句。',
    ice: '{n}。记下了。',
    sister: '{n}，我接住了。',
    yandere: '{n}说出口了，就不许收回。',
  },
  给别人刷礼: {
    soft: '{n}我看见了……眼睛还是会找你。',
    possessive: '{n}。座位还是你的。',
    tease: '{n}热闹归热闹，主角我还点你。',
    ice: '{n}。排序没改。',
    sister: '{n}，你的位置我留着。',
    yandere: '{n}看别人可以，心别分干净。',
  },
  下档维护: {
    soft: '{n}先回去歇哈',
    possessive: '{n}。下了，人还是我的。',
    tease: '{n}下了哈，下次还贫你',
    ice: '{n}。下了。',
    sister: '{n}，辛苦了，回去歇。',
    yandere: '{n}下了也先报备。',
  },
}

export function publicLineFor(persona: PersonaId, scene: HallScene, name: string): string {
  return applyBossName(PUB[scene][persona], name)
}

export function detectHallScene(text: string, firstContact: boolean, giftPhase?: GiftPhase): HallScene {
  if (giftPhase === 'other_host') return '给别人刷礼'
  if (giftPhase === 'after') return '表白'
  if (firstContact) return '刚进厅'
  const t = (text || '').replace(/\s/g, '')
  if (askedClarify(t)) return '冷厅留人'
  if (/下档|这档完|档结束|下麦了|明日再来|回去了哈|结束了/.test(t)) return '下档维护'
  if (/失眠|睡不着|深夜|好晚|树洞|今晚想说/.test(t)) return '深夜树洞'
  if (/他?给别人刷|刷给别人|送她|送他?们/.test(t)) return '给别人刷礼'
  if (/表白|喜欢你|爱上你|做我女|处对象|在一起吧/.test(t)) return '表白'
  if (askedSleep(t)) return '下档维护'
  if (/厅.*冷|好冷|没人|冷场|没人说话|好安静/.test(t)) return '冷厅留人'
  if (/刚进厅|刚进房|刚进来|刚认识|第一次来?|新来的/.test(t)) return '刚进厅'
  if (/要走|走了|不看了|下了|不理我|你也不留/.test(t)) return '要走试探'
  // 「回复/答应」是主播问教练，不是查岗「回我」。先抠掉「回复」再匹配 回我。
  const duty = t.replace(/回复/g, '')
  if (/忙不忙|在吗|有空|理我|查岗/.test(t) || /回我/.test(duty)) return '查岗'
  if (/一直陪|真的么|真的吗|会陪|独宠|只对我|偏爱|只宠/.test(t)) return '表白'
  if (/吃醋|别人|她们|抢/.test(t)) return '给别人刷礼'
  return '冷厅留人'
}

export function askedVideo(text: string): boolean {
  return /视频|开视频|看看你|露个脸/.test((text || '').replace(/\s/g, ''))
}

export function askedCall(text: string): boolean {
  return /打电话|来电|语音电话|打给我/.test((text || '').replace(/\s/g, ''))
}

/** 「说的啥啊」= didn't catch / ask to repeat — NOT sleep/leave. */
export function askedClarify(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  return /说的啥啊|说啥呢|说什么呢|你说啥|听不清|没听清|没听懂|再说一遍|再说一次|啥意思|什么意思/.test(t)
}

/** Only true sleep/leave phrases. Never fire on clarify/repeat. */
export function askedSleep(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t || askedClarify(t)) return false
  return /睡觉|去睡了|去睡|先睡|晚安|困了要睡|困了|我睡了|睡了哈|要睡了|去休息|睡了啊|睡了吧|睡啦|睡了哦/.test(t)
}

export function parseNextActionType(v: unknown): NextActionType | undefined {
  return isNextActionType(v) ? v : undefined
}

export function coachNext(opts: {
  firstContact: boolean
  scene: HallScene
  spicy: boolean
  giftPhase?: GiftPhase
  userText?: string
  otherGiftNudge?: number
}): NextAction {
  const t = opts.userText || ''
  const seduce: NextAction['seduce'] = opts.spicy && !opts.firstContact ? 'soft' : 'no'
  if (opts.firstContact) {
    return {
      type: '继续发消息',
      reason: '游客刚进厅，先公屏点名+私聊钩子让他有话接；初见不打电话、不视频、不勾引。',
      seduce: 'no',
    }
  }
  if (askedClarify(t)) {
    return {
      type: '继续发消息',
      reason: '他没听清/要你再说：接住「说的啥啊」，贫嘴或软复述刚那句；禁止放人睡觉、禁止公屏「去吧」。',
      seduce: 'no',
    }
  }
  if (askedSleep(t)) {
    return {
      type: '让他睡留钩',
      reason: '他说睡觉去了：给面子放人，留下次钩，不要追着发消息。',
      seduce: 'no',
    }
  }
  if (opts.giftPhase === 'before') {
    return {
      type: '继续发消息',
      reason: opts.spicy
        ? '他在问圈不圈：先铺垫示弱，禁止直要；感情到位才可轻轻暗示。'
        : '还没刷、还不到位：先别圈，把情绪铺住就好。',
      seduce,
    }
  }
  if (opts.giftPhase === 'after') {
    return {
      type: '继续发消息',
      reason: '刷后立刻差异化感谢：公屏给面子、私聊走心、上麦点名。不要让主播发礼物截图到朋友圈/相册。',
      seduce,
    }
  }
  if (opts.giftPhase === 'other_host') {
    const n = opts.otherGiftNudge ?? 1
    return {
      type: '继续发消息',
      reason:
        n >= 2
          ? '已经挽过，点到为止，不纠缠。人还给他就够。'
          : '给别人刷了：挽留一次、给台阶，不骂客、不追着要。',
      seduce: 'no',
    }
  }
  if (askedVideo(t) && opts.spicy) {
    return {
      type: '打视频',
      reason: '他自己提了或强烈暗示视频，关系也到位了，可以应；默认仍不主动发起。',
      seduce,
    }
  }
  const late = opts.scene === '深夜树洞'
  const cold = opts.scene === '冷厅留人' || opts.scene === '查岗'
  if (!opts.firstContact && (late || (cold && opts.spicy) || askedCall(t))) {
    if (opts.spicy || late) {
      return {
        type: '打电话',
        reason: late
          ? '深夜树洞，耳朵已经热了：电话比再堆字更能把人留住。初见不会给这步。'
          : '他偏冷淡但情绪已到位，电话用来突破，不是查岗。',
        seduce,
      }
    }
  }
  return {
    type: '继续发消息',
    reason: '还在语音厅里：公屏给存在感，私事走私聊，上麦只走声音情绪。',
    seduce,
  }
}

export function giftThanks(
  persona: PersonaId,
  name: string,
  item: string,
): { public: string; pm: string; mic: string; micCue: string } {
  const gift = item || '这份心'
  const table: Record<PersonaId, { public: string; pm: string; mic: string; micCue: string }> = {
    soft: {
      public: `{n}～这份${gift}我看见了，心收下。`,
      pm: `你护我一下，我记下了。别为难自己。`,
      mic: `收到啦……比礼物更想要的是你还在这儿。心我收下`,
      micCue: '上麦惊喜，轻轻吸气再软下来',
    },
    possessive: {
      public: `{n}。记下了。主位还是你。`,
      pm: `心意到了。过来坐。`,
      mic: `收下。人比东西重要，过来坐，今晚你就是主位`,
      micCue: '上麦沉、短，像领情不报价',
    },
    tease: {
      public: `{n}投喂成功，今晚笑话分你。`,
      pm: `开心是真的。人过来就行。`,
      mic: `哇你这是在投喂我吗？礼物开心，你人在我更开心`,
      micCue: '上麦夸张惊喜再贫一句',
    },
    ice: {
      public: `{n}。领了。`,
      pm: `心领。你在第一。`,
      mic: `领了。今晚你就是主位，别的话不必加`,
      micCue: '上麦郑重、短',
    },
    sister: {
      public: `{n}，心我收到了。`,
      pm: `领的是你这份心。累了就说。`,
      mic: `谢谢你的心。东西我看见了，你这个人才是我想留住的`,
      micCue: '上麦轻、像接住一只手',
    },
    yandere: {
      public: `{n}，证明我看见了。`,
      pm: `收下了。人待我看得见就好。`,
      mic: `收下了。这就是你还在我这边的证明，今晚哪也不许去`,
      micCue: '上麦又甜又黏',
    },
  }
  const row = table[persona]
  return {
    public: applyBossName(row.public, name),
    pm: applyBossName(row.pm, name),
    mic: applyBossName(row.mic, name),
    micCue: row.micCue,
  }
}

export function giftBeforeLines(persona: PersonaId, spicy: boolean, name: string): { public: string; pm: string } {
  const map: Record<PersonaId, string> = {
    soft: spicy ? '今晚想听听你说话就好，不是逼你。' : '还早呀，先坐会儿。',
    possessive: spicy ? '排序我心里有。你看着办。' : '先坐着。现在先别圈。',
    tease: spicy ? '认真半句：亮不亮你定。' : '先聊。圈礼这梗先收。',
    ice: spicy ? '想留就自己亮。我不催。' : '先别。还没到那一步。',
    sister: spicy ? '我不报价。想回礼我领心。' : '先别圈。把话说完更要紧。',
    yandere: spicy ? '对我好让我看得见就行。' : '先锁对话里。圈礼太早。',
  }
  return {
    public: publicLineFor(persona, spicy ? '表白' : '查岗', name),
    pm: applyBossName(map[persona], name),
  }
}

export function otherGiftLines(
  persona: PersonaId,
  name: string,
  nudge: number,
): { public: string; pm: string; mic: string; micCue: string } {
  if (nudge >= 2) {
    const stop: Record<PersonaId, { public: string; pm: string; mic: string; micCue: string }> = {
      soft: {
        public: `{n}，我还在这儿。`,
        pm: '挽过了。灯留着，不追。',
        mic: '我看见了……不闹了，位置还空着',
        micCue: '上麦软、收住',
      },
      possessive: {
        public: `{n}。随你。`,
        pm: '点到为止。回来自己坐。',
        mic: '去。座位先空着',
        micCue: '上麦短、不追',
      },
      tease: {
        public: `{n}玩去吧，梗还在。`,
        pm: '不缠你了哈。想回自己回。',
        mic: '热闹你去看，笑话我先存着',
        micCue: '上麦贫一句就收',
      },
      ice: {
        public: `{n}。`,
        pm: '不必解释。灯在。',
        mic: '去。想被理再来',
        micCue: '上麦淡',
      },
      sister: {
        public: `{n}，不拦你。`,
        pm: '挽过一次就够。树洞还开。',
        mic: '去热闹也行，想说的时候我还在听',
        micCue: '上麦稳',
      },
      yandere: {
        public: `{n}……我看着。`,
        pm: '这句停。人在不在你定。',
        mic: '看别人也可以，人还是我的',
        micCue: '上麦甜但收住',
      },
    }
    const row = stop[persona]
    return {
      public: applyBossName(row.public, name),
      pm: applyBossName(row.pm, name),
      mic: applyBossName(row.mic, name),
      micCue: row.micCue,
    }
  }
  const first: Record<PersonaId, { public: string; pm: string; mic: string; micCue: string }> = {
    soft: {
      public: `{n}我看见你了……眼睛还是会找你。`,
      pm: '热闹归别人。回我一个字就好。',
      mic: '别人是客嘛……你才是要护着我的人，我分得清的',
      micCue: '上麦委屈软声，不点名骂',
    },
    possessive: {
      public: `{n}。座位还写你。`,
      pm: '去一圈可以。回来报备。',
      mic: '别人？座位就一张，写的是你的名字',
      micCue: '上麦低、赶场不骂客',
    },
    tease: {
      public: `{n}热闹归热闹，主角我还点你。`,
      pm: '热闹可以看。回我这句。',
      mic: '她们？背景板。你还在不在，我只问一次',
      micCue: '上麦眨眼、贫完认真',
    },
    ice: {
      public: `{n}。排序没改。`,
      pm: '应酬懒得说。想被理问我。',
      mic: '她们有热闹。你有我这句话。够了',
      micCue: '上麦淡、几乎不解释',
    },
    sister: {
      public: `{n}，你的位置我留着。`,
      pm: '怕被换很正常。位置留着。',
      mic: '我懂，你是怕被换成别人。今晚我听你说',
      micCue: '上麦柔、命名情绪',
    },
    yandere: {
      public: `{n}看别人可以，先别走远。`,
      pm: '准看一眼。回我一下。',
      mic: '她们？你可以看。眼睛转回来，我还在',
      micCue: '上麦甜得发紧，不恐吓',
    },
  }
  const row = first[persona]
  return {
    public: applyBossName(row.public, name),
    pm: applyBossName(row.pm, name),
    mic: applyBossName(row.mic, name),
    micCue: row.micCue,
  }
}

export function channelReplies(opts: {
  publicLine: string
  pms: string[]
  mics: { cue: string; line: string; tone?: ReplyScript['tone'] }[]
}): ReplyScript[] {
  const out: ReplyScript[] = [
    { n: 1, cue: '公屏点名，短、给存在感', line: opts.publicLine, channel: 'public' },
  ]
  opts.pms.forEach((line) => {
    if (!line.trim()) return
    out.push({ n: out.length + 1, cue: '私聊·维系/交作业', line, channel: 'pm' })
  })
  opts.mics.forEach((m) => {
    if (!m.line.trim()) return
    out.push({ n: out.length + 1, cue: m.cue, line: m.line, tone: m.tone, channel: 'mic' })
  })
  return out
}

export function parseGiftPhase(text: string): { phase: GiftPhase; item?: string; rest: string } | null {
  const raw = (text || '').replace(/^\uFEFF/, '').trim()
  if (!raw) return null
  const compact = raw.replace(/\s/g, '')
  if (/他给别人刷了|给别人刷了|刷给别人|给别人刷/.test(compact) && /刷/.test(compact)) {
    const rest = raw
      .replace(/他?给别人刷了[^\n]*/g, '')
      .replace(/刷给别人[^\n]*/g, '')
      .replace(/给别人刷了?[^\n]*/g, '')
      .trim()
    return { phase: 'other_host', rest }
  }
  if (/(还没刷|要不要圈|圈不圈|要不要出票|先别圈|怎么圈|圈礼吗)/.test(compact) && !/刷了|出票了/.test(compact)) {
    const rest = raw
      .replace(/还没刷|要不要圈|圈不圈|要不要出票|先别圈|怎么圈|圈礼吗/g, '')
      .trim()
    return { phase: 'before', rest }
  }
  const m =
    raw.match(/(?:出票了\s*|刷了\s*)([^\s，。！？\n]+)/) ||
    compact.match(/(?:出票了|刷了)([^\s，。！？]+)/)
  if (m || /出票了|刷了/.test(compact)) {
    let item = (m && m[1] ? m[1] : '').replace(/^(了)/, '')
    if (!item || item === '了') item = '礼物'
    const rest = raw
      .replace(/出票了\s*[^\s，。！？\n]*/g, '')
      .replace(/刷了\s*[^\s，。！？\n]*/g, '')
      .trim()
    return { phase: 'after', item, rest }
  }
  return null
}

export function formatNextAction(a: NextAction): string {
  const gate = a.seduce === 'soft' ? '可以软勾引' : '先别勾引'
  return `【下一步】${a.type} · ${gate}\n${a.reason}`
}

export function isHallScene(v: unknown): v is HallScene {
  return typeof v === 'string' && (HALL_SCENES as string[]).includes(v)
}
