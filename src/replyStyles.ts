import type { PersonaId, RelationGoal, RelationNow } from './types'

/** 睡/走等场景的口吻家族。只给模型选味，禁止当文案库。 */
export const STYLE_FAMILIES = [
  '软保养',
  '冷保养',
  '霸总',
  '损祝福',
  '轻贫',
  '轻舔',
  '温和教学',
  '占有教学',
] as const

export type StyleFamily = (typeof STYLE_FAMILIES)[number]

export type StyleHint = {
  id: StyleFamily
  vibe: string
  when: string
}

/** 家族说明：何时用。零条完整可复制句子。 */
export const STYLE_HINTS: Record<StyleFamily, StyleHint> = {
  软保养: {
    id: '软保养',
    vibe: '把他当要休息的人：心疼、放人、留一句明早能接的钩。',
    when: '他说困了/要睡；关系还没到损、也没到锁。',
  },
  冷保养: {
    id: '冷保养',
    vibe: '字少、贵、点到为止。准他睡，不追问行踪。',
    when: '人设淡、或他冷淡试探走。',
  },
  霸总: {
    id: '霸总',
    vibe: '排序在她这儿。放人睡也像点名，不求着留。',
    when: '哥们以上或他爷感/要面子；初见慎用。',
  },
  损祝福: {
    id: '损祝福',
    vibe: '损一句当祝福，像损友。钩藏在笑话尾巴。不派厅务、不排麦。',
    when: '逗哥优先；哥们/朋友可用（不脏）。禁止刚认识、禁止软甜。',
  },
  轻贫: {
    id: '轻贫',
    vibe: '贫一句、不派活：损得轻，像微信贫嘴。钩是想见他本人，不是档期。',
    when: '逗哥第二条私聊；和损祝福拆开。朋友/哥们可。刚认识慎用。',
  },
  轻舔: {
    id: '轻舔',
    vibe: '把情绪价值给他：夸他会照顾自己、想见他下一次。不卑微填空。',
    when: '软甜嘴；他偏冷或试探走时给面子。',
  },
  温和教学: {
    id: '温和教学',
    vibe: '像姐姐交代一件小事：睡前注意点，不审讯、不命令。',
    when: '知心人设；或他累了要被安。',
  },
  占有教学: {
    id: '占有教学',
    vibe: '黏着交代：报备/回来找我。占有是宠，不是吓。',
    when: '病娇 + 暧昧及以上。刚认识/朋友禁用。',
  },
}

export const PERSONA_FAMILIES: Record<PersonaId, StyleFamily[]> = {
  soft: ['轻舔', '软保养'],
  possessive: ['霸总', '冷保养', '软保养'],
  tease: ['损祝福', '轻贫', '软保养', '霸总'],
  ice: ['霸总', '冷保养'],
  sister: ['软保养', '温和教学', '冷保养'],
  yandere: ['占有教学', '霸总', '轻舔'],
}

const FINGERPRINTS = [
  '金主那边再催了么',
  '没有我你睡得明白么',
  '祝你尿床',
  '会睡觉得男生很加分',
  '定位发来',
]

export function isExampleFingerprint(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return false
  return FINGERPRINTS.some((f) => t.includes(f.replace(/\s/g, '')))
}

/** 家族名是教练标签，禁止出现在可复制 line。 */
export function isCoachTagInLine(text: string): boolean {
  const raw = text || ''
  const t = raw.replace(/\s/g, '')
  if (!t) return false
  if (/私聊[·.]/.test(raw)) return true
  if (/口吻家族/.test(t)) return true
  if (/朋友阶段|不逼单|出票机率|大哥心态|你的心情|你的语气/.test(t)) return true
  return STYLE_FAMILIES.some((f) => t.includes(f))
}

function closeRel(now: RelationNow): boolean {
  return now === '暧昧' || now === '恋人' || now === '情人'
}

export function allowedStyleFamilies(
  persona: PersonaId,
  now: RelationNow,
  _goal?: RelationGoal,
): StyleFamily[] {
  let pool = [...PERSONA_FAMILIES[persona]]
  if (now === '刚认识') {
    pool = pool.filter((f) => f !== '损祝福' && f !== '占有教学')
  }
  if (now === '朋友') {
    pool = pool.filter((f) => f !== '占有教学')
    if (persona !== 'tease') pool = pool.filter((f) => f !== '损祝福')
  }
  if ((now === '哥们' || now === '朋友') && persona === 'tease') {
    const prefer: StyleFamily[] = ['损祝福', '轻贫', '软保养']
    const rest = pool.filter((f) => !prefer.includes(f))
    pool = [...prefer.filter((f) => pool.includes(f)), ...rest]
    if (!pool.includes('损祝福')) pool.unshift('损祝福')
    if (!pool.includes('轻贫')) pool.splice(1, 0, '轻贫')
    if (!pool.includes('软保养')) pool.push('软保养')
  }
  if (!closeRel(now)) {
    pool = pool.filter((f) => f !== '占有教学')
  }
  if (closeRel(now) && (persona === 'possessive' || persona === 'yandere' || persona === 'ice')) {
    if (!pool.includes('霸总')) pool.push('霸总')
  }
  if (!pool.length) pool = ['软保养']
  return pool
}

export function styleFamilyPrompt(persona: PersonaId, now: RelationNow, goal: RelationGoal): string {
  const allowed = allowedStyleFamilies(persona, now, goal)
  const lines = allowed
    .map((id) => {
      const h = STYLE_HINTS[id]
      return `- ${h.id}：${h.vibe}（${h.when}）`
    })
    .join('\n')
  const teaseSleep =
    persona === 'tease' && (now === '哥们' || now === '朋友')
      ? '俏皮逗哥+哥们/朋友：两条私聊必须是两种冲动，优先损一下对心软放人，禁止同一玩笑贴两个标签。家族名不上 line。'
      : ''
  return `【口吻家族】先在 think 里：①读大哥这句——尤其「睡觉去了」常常是要走试探/想被留一句，不一定是真困；②对照目前关系「${now}」目标「${goal}」该给他什么情绪价值（给他，不是给厅）；③从下列家族挑两个不同的人冲动，两条私聊必须不同冲动、不同玩笑、不同结尾。cue 写成「私聊·家族名」。家族名（软保养/逗/损祝福/轻贫等）只写 cue 和 think，一字不准写进 line。自己发明新鲜口语，禁止背诵范文。
本轮可用：
${lines}
关系闸：刚认识禁止损祝福、禁止老公、禁止要定位。朋友+逗哥可以损祝福但禁止损到脏。哥们可以损祝福。恋人/情人可以霸总或教学占有。
定位/报备类只允许病娇且暧昧以上。软甜禁止脏损祝福。
网感梗（2024–2026）只在贴合时轻轻带：接他的词、反差一句、留钩；禁止硬塞热梗、禁止空厅口号、禁止厅务播报。
睡/走：公屏可省略或 2–6 字打发，禁止第三人称晚安。两条私聊两种冲动（损 vs 软），一条可以问句/残句；最多一条叫名字；至少一条不含睡/晚安。禁止三句同一开头。nextAction 用 让他睡留钩。${teaseSleep}`
}
