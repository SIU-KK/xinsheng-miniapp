import * as XLSX from 'xlsx'
import {
  buildIdToPrimaryMap,
  formatChineseDateLabel,
  normalizeDateText,
  type LiushuiRollupProfile,
} from './liushuiParse'

export type ActivityParsedRow = {
  dateText: string
  streamerId: string
  nickname: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
}

export type ActivityAggregatedRow = {
  streamerId: string
  nickname: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
  matchedProfile: boolean
}

export type ActivityParseResult = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
  /** One row per Excel 主播ID (pre-profile rollup) */
  rows: ActivityAggregatedRow[]
  rawRows: ActivityParsedRow[]
}

function cellToText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return String(v)
  }
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v).trim()
}

function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, '')
    .replace(/[（）]/gu, (ch) => (ch === '（' ? '(' : ')'))
}

function pickCol(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  }
  const keys = Object.keys(row)
  for (const name of names) {
    const normalizedName = normalizeHeaderKey(name)
    const hit = keys.find((k) => normalizeHeaderKey(k) === normalizedName)
    if (hit) return row[hit]
  }
  return undefined
}

/** Parse integer-ish metric cells; percent / empty → 0. */
export function parseMetricInt(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 0
    return Math.round(v)
  }
  const cleaned = String(v).replace(/,/g, '').replace(/%/g, '').replace(/\s/g, '')
  if (!cleaned) return 0
  const m = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!m) return 0
  const n = Number(m[0])
  return Number.isFinite(n) ? Math.round(n) : 0
}

type AggAcc = {
  streamerId: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
  nickCounts: Map<string, number>
  latestNick: string
  latestDate: string
  order: number
}

function pickNickname(acc: { latestNick: string; nickCounts: Map<string, number> }): string {
  if (acc.latestNick) return acc.latestNick
  let best = ''
  let bestCount = 0
  for (const [nick, count] of acc.nickCounts) {
    if (!nick) continue
    if (count > bestCount) {
      best = nick
      bestCount = count
    }
  }
  return best
}

/**
 * Parse streamer activity workbook.
 * Headers (sample + aliases):
 *   日期, 主播ID, 主播昵称,
 *   打招呼人数, 打招呼信息数量,
 *   主播向陌生人打招呼人数 / 主播向陌生人打招呼人数（有效作业）,
 *   陌生人回复人数 / 陌生人回复人数（有效回复）,
 *   主播发布动态广场动态数
 * Aggregates by 主播ID (sum metrics). Date range from 日期 min/max.
 */
export function parseActivityWorkbook(buf: Buffer | ArrayBuffer | Uint8Array): ActivityParseResult {
  const data =
    buf instanceof Buffer
      ? buf
      : buf instanceof ArrayBuffer
        ? Buffer.from(buf)
        : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)

  const wb = XLSX.read(data, { type: 'buffer', cellDates: true, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { startDate: '', endDate: '', startDateLabel: '', endDateLabel: '', rows: [], rawRows: [] }
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return { startDate: '', endDate: '', startDateLabel: '', endDateLabel: '', rows: [], rawRows: [] }
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const rawRows: ActivityParsedRow[] = []
  const byId = new Map<string, AggAcc>()
  let order = 0
  let minDate = ''
  let maxDate = ''

  for (const row of jsonRows) {
    const dateText = cellToText(pickCol(row, ['日期', '时间', '统计日期']))
    const streamerId = cellToText(
      pickCol(row, ['主播ID', '主播Id', '主播id', '用户ID', '用户Id', 'ID', 'Id']),
    )
    const nickname = cellToText(pickCol(row, ['主播昵称', '用户昵称', '昵称']))
    const greetPeople = parseMetricInt(pickCol(row, ['打招呼人数']))
    const greetMsgs = parseMetricInt(pickCol(row, ['打招呼信息数量']))
    const strangerGreetPeople = parseMetricInt(
      pickCol(row, [
        '主播向陌生人打招呼人数（有效作业）',
        '主播向陌生人打招呼人数(有效作业)',
        '主播向陌生人打招呼人数',
      ]),
    )
    const strangerReplyPeople = parseMetricInt(
      pickCol(row, [
        '陌生人回复人数（有效回复）',
        '陌生人回复人数(有效回复)',
        '陌生人回复人数',
      ]),
    )
    const plazaPosts = parseMetricInt(pickCol(row, ['主播发布动态广场动态数']))

    if (!streamerId && !nickname && !dateText) continue
    // Skip total blank metric rows without an ID
    if (!streamerId) continue

    rawRows.push({
      dateText,
      streamerId,
      nickname,
      greetPeople,
      greetMsgs,
      strangerGreetPeople,
      strangerReplyPeople,
      plazaPosts,
    })

    const iso = normalizeDateText(dateText)
    if (iso) {
      if (!minDate || iso < minDate) minDate = iso
      if (!maxDate || iso > maxDate) maxDate = iso
    }

    let acc = byId.get(streamerId)
    if (!acc) {
      acc = {
        streamerId,
        greetPeople: 0,
        greetMsgs: 0,
        strangerGreetPeople: 0,
        strangerReplyPeople: 0,
        plazaPosts: 0,
        nickCounts: new Map(),
        latestNick: '',
        latestDate: '',
        order: order++,
      }
      byId.set(streamerId, acc)
    }

    acc.greetPeople += greetPeople
    acc.greetMsgs += greetMsgs
    acc.strangerGreetPeople += strangerGreetPeople
    acc.strangerReplyPeople += strangerReplyPeople
    acc.plazaPosts += plazaPosts

    if (nickname) {
      acc.nickCounts.set(nickname, (acc.nickCounts.get(nickname) || 0) + 1)
      const d = iso || ''
      if (!acc.latestDate || (d && d >= acc.latestDate)) {
        acc.latestDate = d || acc.latestDate
        acc.latestNick = nickname
      }
    }
  }

  const rows: ActivityAggregatedRow[] = [...byId.values()]
    .sort((a, b) => a.order - b.order)
    .map((acc) => ({
      streamerId: acc.streamerId,
      nickname: pickNickname(acc),
      greetPeople: acc.greetPeople,
      greetMsgs: acc.greetMsgs,
      strangerGreetPeople: acc.strangerGreetPeople,
      strangerReplyPeople: acc.strangerReplyPeople,
      plazaPosts: acc.plazaPosts,
      matchedProfile: false,
    }))

  return {
    startDate: minDate,
    endDate: maxDate,
    startDateLabel: formatChineseDateLabel(minDate),
    endDateLabel: formatChineseDateLabel(maxDate),
    rows,
    rawRows,
  }
}

type RollAcc = {
  key: string
  displayId: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
  nickCounts: Map<string, number>
  latestNick: string
  latestDate: string
  order: number
  profileName: string
  matched: boolean
}

/**
 * Roll raw Excel day-rows into one row per registration profile identity
 * (same linked-ID merge as 上传流水).
 */
export function rollupActivityByProfiles(
  rawRows: ActivityParsedRow[],
  profiles: LiushuiRollupProfile[],
): ActivityAggregatedRow[] {
  const idToPrimary = buildIdToPrimaryMap(profiles)
  const profileByPrimary = new Map<string, LiushuiRollupProfile>()
  for (const p of profiles) {
    const primary = String(p.streamerId || '').trim()
    if (!primary) continue
    if (!profileByPrimary.has(primary)) profileByPrimary.set(primary, p)
  }

  const byKey = new Map<string, RollAcc>()
  let order = 0

  for (const row of rawRows) {
    const excelId = String(row.streamerId || '').trim()
    const primary = excelId ? idToPrimary.get(excelId) : undefined
    const profile = primary ? profileByPrimary.get(primary) : undefined
    const matched = !!profile
    const displayId = matched ? primary! : excelId
    const key = displayId || `__anon_${order}`

    let acc = byKey.get(key)
    if (!acc) {
      acc = {
        key,
        displayId,
        greetPeople: 0,
        greetMsgs: 0,
        strangerGreetPeople: 0,
        strangerReplyPeople: 0,
        plazaPosts: 0,
        nickCounts: new Map(),
        latestNick: '',
        latestDate: '',
        order: order++,
        profileName: profile ? String(profile.name || '').trim() : '',
        matched,
      }
      byKey.set(key, acc)
    }

    acc.greetPeople += row.greetPeople || 0
    acc.greetMsgs += row.greetMsgs || 0
    acc.strangerGreetPeople += row.strangerGreetPeople || 0
    acc.strangerReplyPeople += row.strangerReplyPeople || 0
    acc.plazaPosts += row.plazaPosts || 0

    const nick = String(row.nickname || '').trim()
    if (nick) {
      acc.nickCounts.set(nick, (acc.nickCounts.get(nick) || 0) + 1)
      const iso = normalizeDateText(row.dateText) || ''
      if (!acc.latestDate || (iso && iso >= acc.latestDate)) {
        acc.latestDate = iso || acc.latestDate
        acc.latestNick = nick
      }
    }
  }

  return [...byKey.values()]
    .sort((a, b) => a.order - b.order)
    .map((acc) => ({
      streamerId: acc.displayId,
      nickname: acc.profileName || pickNickname(acc),
      greetPeople: acc.greetPeople,
      greetMsgs: acc.greetMsgs,
      strangerGreetPeople: acc.strangerGreetPeople,
      strangerReplyPeople: acc.strangerReplyPeople,
      plazaPosts: acc.plazaPosts,
      matchedProfile: acc.matched,
    }))
}
