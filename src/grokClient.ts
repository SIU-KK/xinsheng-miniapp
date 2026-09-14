import { HISTORY_KEEP, lastUserLine } from './companionMemory'
import { parseCoachOutput, type CoachId } from './coachAgents'
import { isNextActionType, type BossGender, type BotPayload, type ChatMessage, type GiftPhase, type HomepageSignals, type NextAction, type PersonaId, type RelationGoal, type RelationNow, type ReplyScript } from './types'

export type GrokOk = BotPayload & { ok: true; model: string }

function compactHistory(messages: ChatMessage[]) {
  let slice = messages.slice(-HISTORY_KEEP)
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (lastUser && !slice.some((m) => m.id === lastUser.id)) {
    slice = [...slice.filter((m) => m.id !== lastUser.id).slice(-(HISTORY_KEEP - 1)), lastUser]
  }
  return slice.map((m) => {
    if (m.role === 'user') {
      const shot = !!(m.shot || m.shotOmitted)
      return { role: 'user' as const, text: shot ? (m.text && m.text !== '【聊天截图】' ? m.text : '【聊天截图】') : m.text }
    }
    const pms = (m.bot.replies || []).filter((r) => (r.line || '').trim())
    const copy = pms
      .map((r) => {
        const ch = r.channel === 'public' ? '公屏' : r.channel === 'mic' ? '上麦' : '私聊'
        return ch + '：' + r.line.trim()
      })
      .join(' | ')
    return {
      role: 'bot' as const,
      analysis: (m.bot.analysis || '').slice(0, 180),
      text: copy || pms[0]?.line || '',
    }
  })
}

function asPayload(data: Record<string, unknown>, model: string): GrokOk | null {
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string).trim() : '')
  const analysis = str('analysis')
  const repliesRaw = data.replies
  const replies: ReplyScript[] = []
  if (Array.isArray(repliesRaw)) for (const item of repliesRaw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const line = typeof o.line === 'string' ? o.line.trim() : ''
    if (!line) continue
    const channel =
      o.channel === 'pm' || o.channel === 'public' || o.channel === 'mic' ? o.channel : undefined
    replies.push({
      n: replies.length + 1,
      cue:
        typeof o.cue === 'string' && o.cue.trim()
          ? o.cue.trim()
          : channel === 'pm'
            ? '私聊发出'
            : channel === 'public'
              ? '公屏'
              : '上麦',
      line,
      pm: typeof o.pm === 'string' && o.pm.trim() ? o.pm.trim() : undefined,
      tone: o.tone === '更甜' || o.tone === '更撩' ? o.tone : undefined,
      channel,
    })
  }
  if (!analysis && !replies.length) return null
  const dash = (k: string) => str(k) || '—'
  return {
    ok: true,
    model,
    analysis: analysis || '—',
    bossMindset: dash('bossMindset'),
    hostMood: dash('hostMood'),
    hostTone: dash('hostTone'),
    replies,
    spicy: data.spicy === true,
    scene: data.scene === '刚进厅' || data.scene === '冷厅留人' || data.scene === '查岗' || data.scene === '要走试探' || data.scene === '深夜树洞' || data.scene === '表白' || data.scene === '给别人刷礼' || data.scene === '下档维护' ? data.scene : undefined,
    nextAction: readNext(data.nextAction),
    giftPhase: data.giftPhase === 'before' || data.giftPhase === 'after' || data.giftPhase === 'other_host' ? data.giftPhase : undefined,
    ticketOdds: typeof data.ticketOdds === 'number' && Number.isFinite(data.ticketOdds) ? Math.max(0, Math.min(100, Math.round(data.ticketOdds))) : undefined,
    addressUsed: str('addressUsed') || undefined,
    source:
      data.source === 'deepseek'
        ? 'deepseek'
        : data.source === 'gemini'
          ? 'gemini'
          : 'grok',
  }
}

function readNext(raw: unknown): NextAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (!isNextActionType(o.type)) return undefined
  if (typeof o.reason !== 'string' || !o.reason.trim()) return undefined
  const seduce = o.seduce === 'soft' ? 'soft' : 'no'
  return { type: o.type, reason: o.reason.trim(), seduce }
}

export async function askGrok(input: {
  personaId: PersonaId
  bossName: string
  bossProfile?: HomepageSignals
  messages: ChatMessage[]
  userText: string
  usedPmHashes?: string[]
  sentPm?: string
  giftPhase?: GiftPhase
  giftItem?: string
  giftMemory?: string[]
  otherGiftNudge?: number
  chatShot?: string
  hostAsk?: boolean
  role?: 'hostAsk'
  relationNow?: RelationNow
  relationGoal?: RelationGoal
  lastGiftAt?: number
  giftCount?: number
  refresh?: boolean
  companionMemory?: string
  threadId?: string
}): Promise<GrokOk> {
  const res = await fetch('/api/grok', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personaId: input.personaId,
      bossName: input.bossName,
      bossProfile: input.bossProfile ?? null,
      messages: compactHistory(input.messages),
      userText: input.userText,
      usedPmHashes: input.usedPmHashes ?? [],
      sentPm: input.sentPm || undefined,
      giftPhase: input.giftPhase,
      giftItem: input.giftItem,
      giftMemory: input.giftMemory ?? [],
      otherGiftNudge: input.otherGiftNudge,
      chatShot: input.chatShot || undefined,
      hostAsk: input.hostAsk || undefined,
      role: input.hostAsk ? 'hostAsk' : input.role,
      relationNow: input.relationNow,
      relationGoal: input.relationGoal,
      lastGiftAt: input.lastGiftAt,
      giftCount: input.giftCount,
      refresh: input.refresh || undefined,
      companionMemory: input.companionMemory || undefined,
      lastUserLine: lastUserLine(input.messages) || input.userText,
      threadId: input.threadId || undefined,
    }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error('bad-response')
  }
  if (!res.ok || data.ok !== true) {
    const err = typeof data.error === 'string' ? data.error : ''
    if (err) console.error('[grok]', err)
    if (err === 'unauthorized') throw new Error('unauthorized')
    if (err === 'vision-unavailable' || err.includes('看不了图')) throw new Error('模型看不了图请重试')
    throw new Error('upstream')
  }
  const model = typeof data.model === 'string' ? data.model : 'grok'
  const parsed = asPayload(data, model)
  if (!parsed) {
    console.error('[grok]', 'shape')
    throw new Error('shape')
  }
  return parsed
}


export type CoachOk = {
  ok: true
  model: string
  source: 'deepseek'
  analysis: string
  replies: { n: number; cue: string; line: string }[]
  note: string
  rawText: string
  bossMindset: string
  hostMood: string
  hostTone: string
  spicy: false
}

function compactCoachHistory(messages: ChatMessage[]) {
  return messages.slice(-12).map((m) => {
    if (m.role === 'user') return { role: 'user' as const, text: m.text }
    const raw = (m.bot.rawText || '').trim()
    if (raw) return { role: 'bot' as const, text: raw.slice(0, 1200) }
    const parts = [
      m.bot.analysis ? '【分析】' + m.bot.analysis : '',
      ...(m.bot.replies || []).map(
        (r) =>
          `【回复${r.n}】${r.line}` +
          (r.cue && r.cue !== '可直接复制发出' ? `\n（目的：${r.cue}）` : ''),
      ),
      m.bot.note ? '【注意】' + m.bot.note : '',
    ].filter(Boolean)
    return { role: 'bot' as const, text: parts.join('\n\n').slice(0, 1200) }
  })
}

export async function askCoach(input: {
  coachId: CoachId
  bossName: string
  bossGender?: BossGender | string
  hostWho?: string
  userText: string
  messages: ChatMessage[]
}): Promise<CoachOk> {
  const res = await fetch('/api/coach', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coachId: input.coachId,
      bossName: input.bossName,
      bossGender: input.bossGender || '男',
      hostWho: input.hostWho || '',
      userText: input.userText,
      messages: compactCoachHistory(input.messages),
    }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error('bad-response')
  }
  if (!res.ok || data.ok !== true) {
    const err = typeof data.error === 'string' ? data.error : ''
    if (err === 'unauthorized') throw new Error('unauthorized')
    throw new Error('upstream')
  }
  const rawText =
    typeof data.rawText === 'string'
      ? data.rawText
      : typeof data.text === 'string'
        ? data.text
        : ''
  const parsed =
    typeof data.analysis === 'string' || Array.isArray(data.replies)
      ? {
          analysis: typeof data.analysis === 'string' ? data.analysis : '',
          replies: Array.isArray(data.replies)
            ? data.replies
                .map((item) => {
                  if (!item || typeof item !== 'object') return null
                  const o = item as Record<string, unknown>
                  const line = typeof o.line === 'string' ? o.line.trim() : ''
                  if (!line) return null
                  const purpose =
                    typeof o.purpose === 'string' && o.purpose.trim()
                      ? o.purpose.trim()
                      : typeof o.cue === 'string' && o.cue.trim()
                        ? o.cue.trim()
                        : '可直接复制发出'
                  return { line, purpose }
                })
                .filter((x): x is { line: string; purpose: string } => !!x)
            : [],
          note: typeof data.note === 'string' ? data.note : '',
          rawText: rawText || (typeof data.analysis === 'string' ? data.analysis : ''),
        }
      : parseCoachOutput(rawText)

  if (!parsed.analysis && !parsed.replies.length && !parsed.rawText) {
    throw new Error('shape')
  }

  const replies = parsed.replies.map((r, i) => ({
    n: i + 1,
    cue: r.purpose || '可直接复制发出',
    line: r.line,
  }))

  return {
    ok: true,
    model: typeof data.model === 'string' ? data.model : 'deepseek',
    source: 'deepseek',
    analysis: parsed.analysis || parsed.rawText || '—',
    replies,
    note: parsed.note,
    rawText: parsed.rawText || rawText,
    bossMindset: '',
    hostMood: '',
    hostTone: '',
    spicy: false,
  }
}
