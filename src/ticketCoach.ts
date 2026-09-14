import type { GiftMemoryItem, NextAction, PersonaId, RelationGoal, RelationNow, ReplyScript } from './types'
import { closeForGift, isStranger, parseRelationGoal, parseRelationNow } from './relation'
import { sanitizeWhaleValueLine } from './pmPlaybook'

export type AddrKind = '哥' | '哥哥' | '宝宝' | '宝贝' | '老公'

export type DrySpell = 'none' | 'mild' | 'hard'

export type TicketScore = {
  odds: number
  band: '高' | '中' | '低'
  label: string
  dry: DrySpell
  minutesSince?: number
}

export function bossStem(name: string): string {
  const n = (name || '').trim() || '哥'
  if (n.length <= 1) return n
  return n.slice(0, 1)
}

export function allowedAddrKinds(persona: PersonaId, now: RelationNow, goal: RelationGoal): AddrKind[] {
  const respectOnly: AddrKind[] = persona === 'tease' ? ['哥'] : persona === 'ice' ? ['哥', '哥哥'] : ['哥哥']
  const noHusband = now === '刚认识' || now === '朋友' || now === '哥们' || now === '追求者'

  let kinds: AddrKind[]
  if (now === '刚认识' || now === '朋友' || now === '哥们') {
    kinds = respectOnly
  } else if (now === '追求者') {
    kinds = persona === 'soft' || persona === 'yandere' ? ['哥哥', '宝宝'] : respectOnly
  } else if (now === '暧昧') {
    if (persona === 'soft' || persona === 'yandere') kinds = ['宝宝', '宝贝', '哥哥']
    else if (persona === 'tease') kinds = ['哥', '哥哥']
    else if (persona === 'ice') kinds = ['哥哥', '哥']
    else if (persona === 'possessive') kinds = ['哥哥']
    else kinds = ['哥哥', '宝宝']
  } else {
    if (persona === 'yandere') kinds = now === '情人' ? ['老公', '宝宝', '宝贝'] : ['宝宝', '宝贝', '老公']
    else if (persona === 'soft') kinds = now === '情人' ? ['宝宝', '宝贝', '老公'] : ['宝宝', '宝贝', '哥哥']
    else if (persona === 'possessive') kinds = now === '情人' ? ['哥哥', '老公'] : ['哥哥']
    else if (persona === 'tease') kinds = ['哥', '宝贝']
    else if (persona === 'ice') kinds = ['哥哥']
    else kinds = ['哥哥', '宝宝']
  }

  if (goal === '恋人' || goal === '情人') {
    if (now === '暧昧' && (persona === 'soft' || persona === 'yandere') && !kinds.includes('宝贝')) kinds.push('宝贝')
    if (now === '朋友' || now === '刚认识' || now === '哥们') {
      kinds = respectOnly
    }
  }
  if (noHusband) kinds = kinds.filter((k) => k !== '老公')
  if (!kinds.length) kinds = ['哥哥']
  return kinds
}

export function pickAddress(
  persona: PersonaId,
  name: string,
  now: RelationNow,
  goal: RelationGoal,
  salt = 0,
): string {
  const kinds = allowedAddrKinds(persona, now, goal)
  const kind = kinds[Math.abs(salt) % kinds.length]
  return bossStem(name) + kind
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function ensureIntimateAddress(line: string, name: string, address: string): string {
  let s = (line || '').trim()
  if (!s) return s
  const n = (name || '').trim()
  s = s.replace(/\{n\}/g, address)
  if (n && n !== '哥哥' && n !== address) {
    s = s.replace(new RegExp(escapeRe(n) + '(?![哥宝老])', 'g'), address)
  }
  if (s.includes(address)) return s
  if (/^(哥哥|老公|宝宝|宝贝|哥)([，,！!]?)/.test(s)) {
    return s.replace(/^(哥哥|老公|宝宝|宝贝|哥)/, address)
  }
  // 可以不叫名字。禁止给每条都补称呼，否则三句都「豆哥」。
  return s
}

export function lastSelfGiftAt(memory?: GiftMemoryItem[] | number): number | undefined {
  if (typeof memory === 'number' && memory > 0) return memory
  if (!Array.isArray(memory) || !memory.length) return undefined
  const self = memory.filter((g) => g.kind !== 'other')
  const pool = self.length ? self : memory
  return Math.max(...pool.map((g) => g.at || 0)) || undefined
}

export function computeTicketOdds(input: {
  relationNow?: RelationNow | string
  relationGoal?: RelationGoal | string
  lastGiftAt?: number
  giftCount?: number
  giftPhase?: string
  visualAsk?: boolean
}): TicketScore {
  const now = parseRelationNow(input.relationNow)
  const goal = parseRelationGoal(input.relationGoal)
  const baseMap: Record<RelationNow, number> = {
    刚认识: 18,
    朋友: 28,
    哥们: 32,
    追求者: 44,
    暧昧: 54,
    恋人: 66,
    情人: 72,
  }
  let odds = baseMap[now]
  if (goal === '恋人' || goal === '情人') odds += now === '刚认识' ? 2 : 5
  if (goal === '朋友' && now !== '朋友') odds -= 3

  const count = input.giftCount || 0
  if (count >= 1) odds += 6
  if (count >= 3) odds += 4

  let dry: DrySpell = 'none'
  let minutesSince: number | undefined
  const last = input.lastGiftAt
  if (!last && count === 0) {
    dry = isStranger(now) ? 'none' : 'mild'
    if (!isStranger(now)) odds -= 8
    if (closeForGift(now)) odds -= 4
  } else if (last) {
    minutesSince = Math.max(0, (Date.now() - last) / 60000)
    if (minutesSince < 15) {
      odds = Math.min(odds, 42)
      dry = 'none'
    } else if (minutesSince > 180) {
      dry = 'hard'
      odds -= 10
    } else if (minutesSince > 45) {
      dry = 'mild'
      odds -= 4
    }
  }

  if (input.giftPhase === 'after') odds = Math.min(88, odds + 8)
  if (input.giftPhase === 'before' && closeForGift(now)) odds += 6
  if (input.visualAsk && closeForGift(now)) odds += 8
  if (input.visualAsk && (isStranger(now) || now === '朋友')) odds -= 4

  odds = Math.max(8, Math.min(88, Math.round(odds)))
  const band: TicketScore['band'] = odds >= 55 ? '高' : odds >= 28 ? '中' : '低'
  return { odds, band, label: `${band} ${odds}%`, dry, minutesSince }
}

export function oddsLine(score: TicketScore): string {
  return `【出票机率】${score.label}`
}

export function drySpellReason(score: TicketScore): string | null {
  if (score.dry === 'hard') {
    return '长时间不出票，别继续白聊。换钩、示弱小要，或冷却让他自己想。出票是这轮主目标。'
  }
  if (score.dry === 'mild') {
    return '出票偏干。下一句给情绪价值，同时埋小钩，不要纯陪聊。'
  }
  return null
}

export function isVisualAsk(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  return /看腿|看身材|打视频|露脸|看胸|开视频|视频看看|看看你/.test(t)
}

export function visualCoach(now: RelationNow, address: string): { body: string; pms: [string, string] } {
  if (closeForGift(now)) {
    return {
      body: '他要看腿/身材/打视频/露脸。目前已是暧昧以上：可以直接绑票，例如「刷30马上给你打视频」。给面子，但出票是主目标。',
      pms: [`${address}，刷30马上给你打视频`, `${address}，想看就亮一下，我开`],
    }
  }
  if (now === '追求者' || now === '哥们') {
    return {
      body: '他要视觉福利。给面子，小钩可以有，但别白给。可以暗示来厅或小亮一下身份。',
      pms: [`${address}，先来厅里坐，视频不急`, `${address}，想看可以，先让我看见你心意`],
    }
  }
  return {
    body: '刚认识/朋友要看腿或打视频：给面子，先来厅、先熟。不要立刻露，也不要第一句老公。可埋很小的钩。',
    pms: [`${address}，先来厅里坐会儿嘛`, `${address}，视频不急，先让我认识你`],
  }
}

export function applyCopyAddress(replies: ReplyScript[], address: string, name: string): ReplyScript[] {
  return replies.map((r) => {
    const copy = r.channel === 'pm' || r.channel === 'public'
    const line = copy ? ensureIntimateAddress(r.line, name, address) : r.line
    const pm = r.pm ? ensureIntimateAddress(r.pm, name, address) : r.pm
    return {
      ...r,
      line: sanitizeWhaleValueLine(line, address),
      pm: pm ? sanitizeWhaleValueLine(pm, address) : pm,
    }
  })
}

export function mergeOddsAnalysis(analysis: string, score: TicketScore): string {
  const line = oddsLine(score)
  if ((analysis || '').includes('【出票机率】')) return analysis
  if ((analysis || '').startsWith('【大哥心态】')) {
    const i = analysis.indexOf('\n')
    if (i > 0) return analysis.slice(0, i + 1) + line + '\n' + analysis.slice(i + 1)
  }
  return line + '\n' + (analysis || '')
}

export function mergeDryNext(next: NextAction | undefined, score: TicketScore): NextAction | undefined {
  const extra = drySpellReason(score)
  if (next && (next.type === '让他睡留钩' || next.type === '打电话' || next.type === '打视频')) {
    return next
  }
  if (!next) {
    if (!extra) return next
    return {
      type: score.dry === 'hard' ? '换个钩子' : '小额要点',
      reason: extra,
      seduce: 'no',
    }
  }
  if (!extra) return next
  if (next.reason.includes('不出票') || next.reason.includes('白聊')) return next
  if (score.dry === 'hard' && next.type === '继续发消息') {
    return { ...next, type: '小额要点', reason: extra + ' ' + next.reason }
  }
  if (score.dry === 'mild' && next.type === '继续发消息') {
    return { ...next, type: '换个钩子', reason: extra + ' ' + next.reason }
  }
  return { ...next, reason: extra + ' ' + next.reason }
}

export function ticketPromptBlock(persona: PersonaId, name: string, now: RelationNow, goal: RelationGoal, score: TicketScore, address: string): string {
  const kinds = allowedAddrKinds(persona, now, goal).map((k) => bossStem(name) + k).join('/')
  const visual = closeForGift(now)
    ? '暧昧/恋人/情人：对方要看腿、看身材、打视频、露脸时，可以直接绑票（例：刷30马上给你打视频）。'
    : '刚认识/朋友：对方要视觉福利时给面子，先来厅或小钩，不要立刻露、不要白给。'
  const firstGift = isStranger(now)
    ? '刚认识的第一接触私聊钩子仍禁止提礼物。之后出票是主目标。'
    : '出票是主目标。给面子之后可以埋钩、小要；长时间不出票禁止纯陪聊。'
  const dry =
    score.dry === 'hard'
      ? '当前长时间不出票：【下一步】选 小额要点 / 换个钩子 / 先冷一冷，禁止一直「继续发消息」白聊。'
      : score.dry === 'mild'
        ? '出票偏干：边给情绪价值边埋钩。'
        : ''
  return `称呼合同：可复制公屏/私聊可以不叫名字、可以两个字。最多一条以称呼开头。需要称呼时用「${address}」（可用 ${kinds}），禁止光喊原名「${(name || '').trim() || '宸'}」。刚认识/朋友/哥们只用哥/哥哥，禁止老公。目标关系只允许轻轻往下一档拉，禁止刚认识跳老公。
JSON 必须含 ticketOdds 数字（0-100）和 addressUsed 字符串。出票机率按关系+出票记录+距上次出票时长估：现在约 ${score.label}。
教练栏 bossMindset/hostMood/hostTone 各一句短句，禁止复读「朋友阶段/不逼单」。分析口吻不准进 line。
${firstGift}
${visual}
${dry}`
}
