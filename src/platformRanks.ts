/** 平台财富/魅力/在线等级表与换算。1 RMB = 100 经验。 */

import type { HomepageSignals } from './types'

export const EXP_PER_RMB = 100

/** 财富等级名 → 最低经验。人民币地板 = exp / 100。 */
export const WEALTH_RANKS: { name: string; minExp: number }[] = [
  { name: '平民', minExp: 8000 },
  { name: '富商', minExp: 40000 },
  { name: '勋爵', minExp: 125000 },
  { name: '男爵', minExp: 285000 },
  { name: '子爵', minExp: 520000 },
  { name: '伯爵', minExp: 710000 },
  { name: '侯爵', minExp: 1300000 },
  { name: '公爵', minExp: 2200000 },
  { name: '郡侯', minExp: 3600000 },
  { name: '郡公', minExp: 6000000 },
  { name: '国公', minExp: 9300000 },
  { name: '郡王', minExp: 14000000 },
  { name: '藩王', minExp: 20000000 },
  { name: '亲王', minExp: 27500000 },
  { name: '国王', minExp: 47000000 },
  { name: '帝王', minExp: 70500000 },
  { name: '帝尊', minExp: 100000000 },
  { name: '皇帝', minExp: 150000000 },
  { name: '天帝', minExp: 250000000 },
  { name: '仙帝', minExp: 400000000 },
  { name: '仙尊', minExp: 700000000 },
  { name: '圣皇', minExp: 3200000000 },
  { name: '神君', minExp: 5700000000 },
]

export const CHARM_TIERS: Record<string, Partial<Record<1 | 2 | 3 | 4 | 5, number>>> = {
  小小萌新: { 1: 10000, 2: 100000, 3: 300000, 4: 500000, 5: 800000 },
  明日之星: { 1: 1000000, 2: 2000000, 3: 3000000, 4: 4000000, 5: 5000000 },
  星芒初露: { 1: 10000000, 2: 15000000, 3: 20000000, 4: 25000000, 5: 30000000 },
  一举成名: { 1: 40000000, 2: 50000000, 3: 60000000, 4: 70000000, 5: 80000000 },
  星途璀璨: { 1: 100000000, 2: 130000000, 3: 160000000 },
}

/** 平台/在线等级 LV → 经验（在线时长）。表到 23。 */
export const ONLINE_LV_EXP: Record<number, number> = {
  1: 0, 2: 100, 3: 400, 4: 900, 5: 1700, 6: 2800, 7: 4400, 8: 6500, 9: 9200,
  10: 12600, 11: 16800, 12: 21800, 13: 27800, 14: 34800, 15: 42900, 16: 52100,
  17: 62600, 18: 74400, 19: 87600, 20: 102300, 21: 118600, 22: 136500, 23: 156200,
}

export const MAX_ONLINE_LV = 23

export type WhaleLabel = '真金大哥' | '互刷嫌疑' | '收礼号倾向' | '信息不足'
export type OnlineStyle = '爆发型砸钱' | '泡时长' | '均衡活跃' | '信息不足'

export interface RankHit {
  name: string
  minExp: number
  rmbFloor: number
  depthHint?: number
  sub?: number
  atLeast: boolean
  naiveTableRmb?: number
}

export interface RankReport {
  wealth?: RankHit
  charm?: RankHit
  onlineLv?: number
  onlineExp?: number
  onlineAboveTable?: boolean
  achievement?: { name: string; depth?: number }
  spendRmbFloor?: number
  recvRmbFloor?: number
  spendLabel?: string
  recvLabel?: string
  whaleLabel: WhaleLabel
  whaleSentence: string
  onlineStyle: OnlineStyle
  analysisLine: string
  printSummary: string
  demoOverride?: boolean
}

const WEALTH_BY_LEN = [...WEALTH_RANKS].sort((a, b) => b.name.length - a.name.length)
const CHARM_NAMES = Object.keys(CHARM_TIERS).sort((a, b) => b.length - a.length)

export function expToRmb(exp: number): number {
  return exp / EXP_PER_RMB
}

export function formatRmbWan(rmb: number, atLeast: boolean): string {
  const prefix = atLeast ? '至少约' : '约'
  if (rmb >= 10000) {
    const wan = rmb / 10000
    const n = Number.isInteger(wan) ? String(wan) : String(Number(wan.toFixed(1)))
    return `${prefix}${n}万`
  }
  return `${prefix}${Math.round(rmb)}元`
}

export function lookupWealth(name: string): (typeof WEALTH_RANKS)[number] | undefined {
  return WEALTH_RANKS.find((r) => r.name === name)
}

export function lookupCharm(name: string, sub?: number): { exp: number; atLeast: boolean; sub?: number } | undefined {
  const tier = CHARM_TIERS[name]
  if (!tier) return undefined
  if (sub && tier[sub as 1 | 2 | 3 | 4 | 5] != null) {
    return { exp: tier[sub as 1 | 2 | 3 | 4 | 5] as number, atLeast: false, sub }
  }
  const floor = tier[1]
  if (floor == null) return undefined
  return { exp: floor, atLeast: true, sub: sub && tier[sub as 1 | 2 | 3 | 4 | 5] == null ? undefined : 1 }
}

export function lookupOnline(lv: number): { exp?: number; aboveTable: boolean } {
  if (lv > MAX_ONLINE_LV) return { aboveTable: true }
  return { exp: ONLINE_LV_EXP[lv], aboveTable: false }
}

function blobOf(signals?: HomepageSignals, extraText?: string): string {
  const parts = [
    extraText,
    signals?.caption,
    signals?.wealthRank,
    signals?.charmTier != null ? `${signals.charmTier}${signals.charmSub ?? ''}` : '',
    signals?.onlineLv != null ? `在线${signals.onlineLv}` : '',
    signals?.achievement,
    ...(signals?.badges ?? []),
    signals?.hall,
    ...(signals?.tags ?? []),
    signals?.signature,
    signals?.bossHint,
  ]
  return parts.filter(Boolean).join('\n')
}

export function parseRanksFromText(text: string): {
  wealthName?: string
  wealthDepth?: number
  charmName?: string
  charmSub?: number
  onlineLv?: number
  achievementName?: string
  achievementDepth?: number
} {
  const t = text.replace(/\s+/g, '')
  const out: ReturnType<typeof parseRanksFromText> = {}

  for (const r of WEALTH_BY_LEN) {
    const i = t.indexOf(r.name)
    if (i < 0) continue
    out.wealthName = r.name
    const rest = t.slice(i + r.name.length)
    const m = rest.match(/^(\d{1,4})/)
    if (m) out.wealthDepth = Number(m[1])
    break
  }

  for (const name of CHARM_NAMES) {
    const i = t.indexOf(name)
    if (i < 0) continue
    out.charmName = name
    const rest = t.slice(i + name.length)
    const m = rest.match(/^(\d)/)
    if (m) {
      const n = Number(m[1])
      if (n >= 1 && n <= 5) out.charmSub = n
    }
    break
  }

  const ol = t.match(/在线(?:等级)?(\d{1,2})/) || t.match(/(?:平台等级|LV|Lv|lv)[.\s]*(\d{1,2})/)
  if (ol) out.onlineLv = Number(ol[1])

  const ach = t.match(/(皓月下天使|月下天使)(\d{1,3})?/)
  if (ach) {
    out.achievementName = ach[1]
    if (ach[2]) out.achievementDepth = Number(ach[2])
  }

  return out
}

function whaleFrom(spend?: number, recv?: number): { label: WhaleLabel; sentence: string } {
  if (spend == null && recv == null) return { label: '信息不足', sentence: '等级信息不足，暂不判断互刷。' }
  if (spend != null && recv == null) {
    return spend > 0
      ? { label: '真金大哥', sentence: '真金大哥不是互刷' }
      : { label: '信息不足', sentence: '等级信息不足，暂不判断互刷。' }
  }
  if (spend == null && recv != null) {
    return recv > 0
      ? { label: '收礼号倾向', sentence: '更像主播号/收礼号' }
      : { label: '信息不足', sentence: '等级信息不足，暂不判断互刷。' }
  }
  const s = spend as number
  const r = Math.max(recv as number, 1)
  const ratio = s / r
  if (ratio >= 5) return { label: '真金大哥', sentence: '真金大哥不是互刷' }
  if (ratio <= 0.2) return { label: '收礼号倾向', sentence: '更像主播号/收礼号' }
  return { label: '互刷嫌疑', sentence: '互刷嫌疑（消费与收礼量级接近）' }
}

function onlineStyleOf(spend?: number, lv?: number, above?: boolean): OnlineStyle {
  if (lv == null && spend == null) return '信息不足'
  if (above) return '均衡活跃'
  const highSpend = (spend ?? 0) >= 50000
  const modestSpend = (spend ?? 0) > 0 && (spend ?? 0) < 10000
  const modestOnline = lv != null && lv <= 16
  const highOnline = lv != null && lv >= 18
  if (highSpend && modestOnline) return '爆发型砸钱'
  if (highOnline && (modestSpend || !highSpend)) return '泡时长'
  return '均衡活跃'
}

function onlineSentence(style: OnlineStyle, lv?: number, above?: boolean): string {
  if (above) return `在线等级高于表内 LV${MAX_ONLINE_LV}，不编造经验。`
  if (lv == null) return ''
  if (style === '爆发型砸钱') return `在线${lv}相对消费矮 → 爆发型砸钱。`
  if (style === '泡时长') return `在线${lv}偏高、消费相对一般 → 泡时长。`
  return `在线LV${lv}。`
}

/** 演示老板「宸」：徽章写仙尊，但档案消费按大约70万覆盖，禁止套表内地板700万。 */
export const CHEN_SPEND_RMB_OVERRIDE = 700000

export const CHEN_SIGNALS: HomepageSignals = {
  age: '25',
  gender: '男',
  ip: '香港',
  badges: ['神', 'VIP', '仙尊137', '明日之星5', '在线14', '皓月下天使34', '名人殿堂'],
  hall: '名人殿堂 · 尊贵入驻1次',
  giftWall: '178/1691',
  tags: ['发财暴富', '奶茶上瘾', '当代二笔青年'],
  signature: '这个人很神秘，没留下丝毫线索',
  hasCp: true,
  whale: true,
  wealthRank: '仙尊',
  wealthDepth: 137,
  charmTier: '明日之星',
  charmSub: 5,
  onlineLv: 14,
  achievement: '皓月下天使',
  achievementLv: 34,
  spendRmbOverride: CHEN_SPEND_RMB_OVERRIDE,
  demoChen: true,
}

export function isChenDemo(bossName: string, fileName?: string, caption?: string): boolean {
  const blob = `${bossName} ${fileName ?? ''} ${caption ?? ''}`
  if (/宸/.test(bossName)) return true
  return /boss-chen|chen-homepage|956d3b98/i.test(blob)
}

export function looksLikeChenShot(fileName?: string, caption?: string): boolean {
  const blob = `${fileName ?? ''} ${caption ?? ''}`
  return /boss-chen|chen-homepage|956d3b98|仙尊137|皓月下天使/i.test(blob)
}

export function analyzeRanks(input: {
  signals?: HomepageSignals
  extraText?: string
  bossName?: string
}): RankReport {
  const s = input.signals
  const parsed = parseRanksFromText(blobOf(s, input.extraText))

  const wealthName = s?.wealthRank || parsed.wealthName
  const wealthDepth = s?.wealthDepth ?? parsed.wealthDepth
  const charmName = s?.charmTier || parsed.charmName
  const charmSub = s?.charmSub ?? parsed.charmSub
  const onlineLv = s?.onlineLv ?? parsed.onlineLv
  const achName = s?.achievement || parsed.achievementName
  const achDepth = s?.achievementLv ?? parsed.achievementDepth

  let wealth: RankHit | undefined
  if (wealthName) {
    const row = lookupWealth(wealthName)
    if (row) {
      const naive = expToRmb(row.minExp)
      wealth = {
        name: row.name,
        minExp: row.minExp,
        rmbFloor: naive,
        naiveTableRmb: naive,
        depthHint: wealthDepth,
        atLeast: true,
      }
    }
  }

  let charm: RankHit | undefined
  if (charmName) {
    const hit = lookupCharm(charmName, charmSub)
    if (hit) {
      charm = {
        name: charmName,
        minExp: hit.exp,
        rmbFloor: expToRmb(hit.exp),
        sub: hit.sub,
        atLeast: hit.atLeast,
      }
    }
  }

  const demo = !!(s?.demoChen || s?.spendRmbOverride != null)

  if (demo && wealth) {
    wealth.rmbFloor = s?.spendRmbOverride ?? CHEN_SPEND_RMB_OVERRIDE
    wealth.atLeast = false
  }

  let onlineAboveTable = false
  let onlineExp: number | undefined
  if (onlineLv != null) {
    const o = lookupOnline(onlineLv)
    onlineAboveTable = o.aboveTable
    onlineExp = o.exp
  }

  const spendRmbFloor = wealth?.rmbFloor
  const recvRmbFloor = charm?.rmbFloor
  const { label: whaleLabel, sentence: whaleSentence } = whaleFrom(spendRmbFloor, recvRmbFloor)
  const onlineStyle = onlineStyleOf(spendRmbFloor, onlineLv, onlineAboveTable)

  const spendLabel = wealth
    ? demo
      ? '消费大约70万'
      : `${formatRmbWan(wealth.rmbFloor, wealth.atLeast)}消费`
    : undefined
  const recvLabel = charm
    ? `${formatRmbWan(charm.rmbFloor, charm.atLeast)}收礼`
    : undefined

  const bits: string[] = []
  if (wealth && charm) {
    const depth =
      wealth.depthHint != null ? `徽章「${wealth.name}」深度${wealth.depthHint}只作展示提示；` : ''
    if (demo) {
      bits.push(
        `${depth}消费大约70万 vs ${charm.name}${charm.sub ?? ''}：${recvLabel} → ${whaleSentence}。`,
      )
    } else {
      const depth2 =
        wealth.depthHint != null
          ? `「${wealth.name}」深度${wealth.depthHint}只作展示，不另加人民币；`
          : ''
      bits.push(
        `${depth2}财富「${wealth.name}」${spendLabel} vs 魅力「${charm.name}」${charm.sub ?? ''}：${recvLabel} → ${whaleSentence}。`,
      )
    }
  } else if (wealth) {
    bits.push(demo ? `消费大约70万。收礼等级未识别。` : `财富「${wealth.name}」${spendLabel}。收礼等级未识别。`)
  } else if (charm) {
    bits.push(`魅力「${charm.name}」${recvLabel}。消费等级未识别。`)
  }

  const ol = onlineSentence(onlineStyle, onlineLv, onlineAboveTable)
  if (ol) bits.push(ol)

  if (achName) {
    bits.push(`成就「${achName}」${achDepth ?? ''}只辅助人设，不直接换算人民币。`)
  }

  const life: string[] = []
  if (s?.ip) life.push(`${s.ip}IP`)
  if (s?.signature && /神秘/.test(s.signature)) life.push('神秘签名')
  if (s?.tags?.some((x) => x.includes('奶茶'))) life.push('奶茶上瘾')
  if (s?.hasCp) life.push('有CP')
  if (life.length) bits.push(life.join('，') + '。')

  const analysisLine = bits.join('')

  const printSummary = [
    `spendRmbFloor=${spendRmbFloor ?? ''}`,
    `spendLabel=${spendLabel ?? ''}`,
    `recvRmbFloor=${recvRmbFloor ?? ''}`,
    `recvLabel=${recvLabel ?? ''}`,
    `whale=${whaleSentence}`,
    `onlineStyle=${onlineStyle}`,
    `demoOverride=${demo ? '1' : '0'}`,
    `analysis=${analysisLine}`,
  ].join('\n')

  return {
    wealth,
    charm,
    onlineLv,
    onlineExp,
    onlineAboveTable,
    achievement: achName ? { name: achName, depth: achDepth } : undefined,
    spendRmbFloor,
    recvRmbFloor,
    spendLabel,
    recvLabel,
    whaleLabel,
    whaleSentence,
    onlineStyle,
    analysisLine,
    printSummary,
    demoOverride: demo || undefined,
  }
}

export function printChenRankAnalysis(): string {
  return analyzeRanks({ signals: CHEN_SIGNALS, bossName: '宸' }).printSummary
}

export function resolveHomepageSignals(opts: {
  bossName: string
  hasScreenshot: boolean
  fileName?: string
  caption?: string
}): HomepageSignals | undefined {
  const caption = opts.caption?.trim() || undefined
  const demoShot =
    opts.hasScreenshot &&
    (/宸/.test(opts.bossName) || looksLikeChenShot(opts.fileName, caption))
  const fromText = parseRanksFromText([opts.fileName, caption, opts.bossName].filter(Boolean).join('\n'))
  const hasKw = !!(fromText.wealthName || fromText.charmName || fromText.onlineLv || fromText.achievementName)

  if (demoShot || (opts.hasScreenshot && /宸/.test(opts.bossName))) {
    return {
      ...CHEN_SIGNALS,
      caption,
      wealthRank: fromText.wealthName || CHEN_SIGNALS.wealthRank,
      wealthDepth: fromText.wealthDepth ?? CHEN_SIGNALS.wealthDepth,
      charmTier: fromText.charmName || CHEN_SIGNALS.charmTier,
      charmSub: fromText.charmSub ?? CHEN_SIGNALS.charmSub,
      onlineLv: fromText.onlineLv ?? CHEN_SIGNALS.onlineLv,
      achievement: fromText.achievementName || CHEN_SIGNALS.achievement,
      achievementLv: fromText.achievementDepth ?? CHEN_SIGNALS.achievementLv,
    }
  }

  if (!opts.hasScreenshot && !caption) return undefined

  if (!hasKw && !caption) return opts.hasScreenshot ? {} : undefined

  const signals: HomepageSignals = { caption }
  if (fromText.wealthName) {
    signals.wealthRank = fromText.wealthName
    signals.wealthDepth = fromText.wealthDepth
    signals.badges = [...(signals.badges ?? []), fromText.wealthName + (fromText.wealthDepth ?? '')]
  }
  if (fromText.charmName) {
    signals.charmTier = fromText.charmName
    signals.charmSub = fromText.charmSub
    signals.badges = [...(signals.badges ?? []), fromText.charmName + (fromText.charmSub ?? '')]
  }
  if (fromText.onlineLv != null) {
    signals.onlineLv = fromText.onlineLv
    signals.badges = [...(signals.badges ?? []), `在线${fromText.onlineLv}`]
  }
  if (fromText.achievementName) {
    signals.achievement = fromText.achievementName
    signals.achievementLv = fromText.achievementDepth
  }
  const report = analyzeRanks({ signals, extraText: caption, bossName: opts.bossName })
  if (report.whaleLabel === '真金大哥') signals.whale = true
  return signals
}
