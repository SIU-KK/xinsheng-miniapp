import type { BotPayload, ChatMessage, GiftMemoryItem, RelationGoal, RelationNow, Session } from './types'

export const HISTORY_KEEP = 18
export const MEMORY_MAX = 900

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) : t
}

export function lastUserLine(messages: ChatMessage[] | undefined): string {
  if (!messages?.length) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (m.shot || m.shotOmitted) return '【聊天截图】'
    return (m.text || '').trim()
  }
  return ''
}

/** Sleep / tomorrow-callback residue in 未回 or memory lines. */
export function isSleepHookResidue(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  return /睡觉|去睡|先睡|晚安|困了|去休息|明天睡醒|明天再来|明早|留到明天|睡醒了再|让他睡|去吧/.test(t)
}

export function isTrueSleepLine(text: string): boolean {
  const t = (text || '').replace(/\s/g, '')
  if (!t) return false
  if (/说的啥啊|说啥呢|说什么呢|你说啥|听不清|没听清|没听懂|再说一遍|再说一次|啥意思|什么意思/.test(t)) return false
  return /睡觉|去睡了|去睡|先睡|晚安|困了要睡|困了|我睡了|睡了哈|要睡了|去休息|睡了啊|睡了吧|睡啦/.test(t)
}

export function tomorrowHookExpired(memory: string | undefined): boolean {
  const prev = (memory || '').trim()
  if (!prev) return false
  const v = takeLine(prev, '明天钩')
  return v === '已过期' || /明天钩已过期/.test(prev)
}

/** User lines with no following bot reply — retry must still see these. */
export function unansweredUserLines(messages: ChatMessage[] | undefined): string[] {
  if (!messages?.length) return []
  const out: string[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const next = messages[i + 1]
    if (next && next.role === 'bot') continue
    const text = m.shot || m.shotOmitted ? '【聊天截图】' : (m.text || '').trim()
    if (text) out.push(clip(text, 80))
  }
  return out.slice(-4)
}

function takeLine(block: string, key: string): string {
  const re = new RegExp('^' + key + '：(.+)$', 'm')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function mergeCsv(a: string, b: string, maxItems: number) {
  const seen = new Set<string>()
  const items: string[] = []
  for (const raw of (a + '、' + b).split(/[、,，|]/)) {
    const x = raw.trim()
    if (!x || seen.has(x)) continue
    seen.add(x)
    items.push(x)
    if (items.length >= maxItems) break
  }
  return items.join('、')
}

export function refreshCompanionMemory(input: {
  prev?: string
  bossName: string
  relationNow?: RelationNow
  relationGoal?: RelationGoal
  gifts?: GiftMemoryItem[]
  addressUsed?: string
  lastMood?: string
  lastBossMind?: string
  lastUser?: string
  unanswered?: string[]
  answered?: boolean
}): string {
  const prev = (input.prev || '').trim()
  const gifts = (input.gifts || [])
    .filter((g) => g.kind !== 'other')
    .slice(-4)
    .map((g) => g.item)
    .filter(Boolean)
  const lastGifts = gifts.length ? gifts.join('、') : takeLine(prev, '最近出票')
  let unanswered = (input.unanswered || []).filter(Boolean)
  const prevUnans = takeLine(prev, '未回')
  if (prevUnans && prevUnans !== '无') {
    for (const x of prevUnans.split('、')) {
      const y = x.trim()
      if (y && !unanswered.includes(y)) unanswered.push(y)
    }
  }
  if (input.answered && input.lastUser) {
    const hit = input.lastUser
    unanswered = unanswered.filter((x) => x !== hit && !hit.includes(x) && !x.includes(hit))
  }
  const lastRaw = (input.lastUser || '').trim()
  const returnedAwake = !!lastRaw && lastRaw !== '【聊天截图】' && !isTrueSleepLine(lastRaw)
  // He is talking again (clarify / daytime pickup): drop stale sleep 未回 + expire pending tomorrow hook
  let tomorrowHook = takeLine(prev, '明天钩') || '无'
  if (returnedAwake) {
    const prevAsk = takeLine(prev, '上一句')
    const hadSleepResidue =
      tomorrowHook === '待回' ||
      unanswered.some((x) => isSleepHookResidue(x)) ||
      isTrueSleepLine(prevAsk) ||
      isSleepHookResidue(prevAsk) ||
      /明天睡醒|明天再来找我|明天再来|留到明天|睡醒了再|让他睡/.test(prev)
    unanswered = unanswered.filter((x) => !isSleepHookResidue(x))
    if (hadSleepResidue || tomorrowHook === '待回') tomorrowHook = '已过期'
  } else if (lastRaw && isTrueSleepLine(lastRaw)) {
    tomorrowHook = '待回'
  }
  unanswered = unanswered.slice(-4)
  const nick = mergeCsv(takeLine(prev, '称呼'), input.addressUsed || '', 4)
  const mood = clip(input.lastMood || takeLine(prev, '她心情') || '', 24)
  const bossMind = clip(input.lastBossMind || takeLine(prev, '他心情') || '', 24)
  const lastAsk = clip(input.lastUser || takeLine(prev, '上一句') || '', 40)
  const lines = [
    `大哥：${clip(input.bossName || takeLine(prev, '大哥') || '哥哥', 20)}`,
    `目前：${input.relationNow || takeLine(prev, '目前') || '刚认识'}`,
    `目标：${input.relationGoal || takeLine(prev, '目标') || '朋友'}`,
    `最近出票：${lastGifts || '无'}`,
    `他心情：${bossMind || '未知'}`,
    `她心情：${mood || '未知'}`,
    `上一句：${lastAsk || '无'}`,
    `未回：${unanswered.length ? unanswered.join('、') : '无'}`,
    `明天钩：${tomorrowHook || '无'}`,
    `称呼：${nick || '未定'}`,
  ]
  const block = lines.join('\n')
  return block.length > MEMORY_MAX ? block.slice(0, MEMORY_MAX) : block
}

export function memoryFromSession(session: Session, messages?: ChatMessage[], bot?: BotPayload): string {
  const msgs = messages || session.messages || []
  const unanswered = unansweredUserLines(msgs)
  return refreshCompanionMemory({
    prev: session.companionMemory,
    bossName: session.bossName,
    relationNow: session.relationNow,
    relationGoal: session.relationGoal,
    gifts: session.giftMemory,
    addressUsed: bot?.addressUsed || session.messages?.reduceRight<string | undefined>((acc, m) => acc || (m.role === 'bot' ? m.bot.addressUsed : undefined), undefined),
    lastMood: bot?.hostMood,
    lastBossMind: bot?.bossMindset,
    lastUser: lastUserLine(msgs),
    unanswered,
    answered: !!bot,
  })
}
