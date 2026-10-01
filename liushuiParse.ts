import * as XLSX from 'xlsx'

export type LiushuiParsedRow = {
  timeText: string
  userPlatformId: string
  nickname: string
  totalFlowText: string
  /** Parsed yuan amount when recognizable; null if not */
  totalFlowAmount: number | null
  /** Integer cents when amount parsed; null otherwise */
  totalFlowCents: number | null
}

/** Aggregated one-row-per-ID preview/storage shape. */
export type LiushuiAggregatedRow = {
  userPlatformId: string
  nickname: string
  /** Display amount without trailing 元, e.g. `7344.2` */
  totalFlowText: string
  totalFlowAmount: number | null
  totalFlowCents: number | null
}

export type LiushuiParseResult = {
  /** Min date in file as YYYY-MM-DD, or '' if none */
  startDate: string
  /** Max date in file as YYYY-MM-DD, or '' if none */
  endDate: string
  /** e.g. `2026-09-14（星期一）` */
  startDateLabel: string
  /** e.g. `2026-09-17（星期四）` */
  endDateLabel: string
  /** One row per Excel 用户ID (pre-profile rollup), 总流水 summed */
  rows: LiushuiAggregatedRow[]
  /** Raw day-level rows before aggregation (for debugging / optional use) */
  rawRows: LiushuiParsedRow[]
}

/** Registration-list identity used to roll linked Excel IDs into one 主播 row. */
export type LiushuiRollupProfile = {
  /** Primary registration ID (streamer_id) — displayed as ID */
  streamerId: string
  /** 主播名 from profile */
  name: string
  /** Prefill 点位 */
  pointRate: string
  linkedId1?: string
  linkedId2?: string
  linkedId3?: string
}

export type LiushuiRolledRow = LiushuiAggregatedRow & {
  /** Prefill from profile; empty for orphans */
  pointRate: string
  /** True when row matched a registration profile */
  matchedProfile: boolean
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'] as const

function cellToText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    // Avoid scientific notation for IDs / amounts
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

/** Extract numeric yuan from strings like `7344.2元` or `1,234.5`. */
export function parseFlowAmount(text: string): { amount: number | null; cents: number | null } {
  const cleaned = String(text || '').replace(/,/g, '').replace(/\s/g, '')
  const m = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!m) return { amount: null, cents: null }
  const amount = Number(m[0])
  if (!Number.isFinite(amount)) return { amount: null, cents: null }
  return { amount, cents: Math.round(amount * 100) }
}

/** Format yuan for display: strip 元, keep numeric look (e.g. 7344.2). */
export function formatFlowDisplay(amount: number | null, cents: number | null): string {
  if (cents != null && Number.isFinite(cents)) {
    const n = Number((cents / 100).toFixed(2))
    return Object.is(n, -0) ? '0' : String(n)
  }
  if (amount != null && Number.isFinite(amount)) {
    const n = Number((Math.round(amount * 100) / 100).toFixed(2))
    return Object.is(n, -0) ? '0' : String(n)
  }
  return ''
}

function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, '')
    // Excel exports use both ASCII and fullwidth parentheses.
    .replace(/[（）]/gu, (ch) => (ch === '（' ? '(' : ')'))
}

function pickCol(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  }
  // Header matching is trim/whitespace/parenthesis tolerant, including 接收用户ID（用户） variants.
  const keys = Object.keys(row)
  for (const name of names) {
    const normalizedName = normalizeHeaderKey(name)
    const hit = keys.find((k) => normalizeHeaderKey(k) === normalizedName)
    if (hit) return row[hit]
  }
  return undefined
}

/** Normalize time cell to YYYY-MM-DD when possible. */
export function normalizeDateText(timeText: string): string | null {
  const t = String(timeText || '').trim()
  if (!t) return null
  // Already YYYY-MM-DD or YYYY/MM/DD
  const m = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  if (m) {
    const y = m[1]
    const mo = String(Number(m[2])).padStart(2, '0')
    const d = String(Number(m[3])).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  // Excel serial date as number string
  if (/^\d+(\.\d+)?$/.test(t)) {
    const serial = Number(t)
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      // Excel epoch 1899-12-30
      const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000
      const dt = new Date(utc)
      const y = dt.getUTCFullYear()
      const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
      const d = String(dt.getUTCDate()).padStart(2, '0')
      return `${y}-${mo}-${d}`
    }
  }
  return null
}

export function formatChineseDateLabel(iso: string): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  // Noon local avoids DST/TZ edge flipping the weekday
  const dt = new Date(y, mo - 1, d, 12, 0, 0)
  if (Number.isNaN(dt.getTime())) return iso
  const w = WEEKDAY_CN[dt.getDay()] ?? ''
  return `${iso}（星期${w}）`
}

type AggAcc = {
  userPlatformId: string
  centsSum: number
  hasAmount: boolean
  /** nickname -> count */
  nickCounts: Map<string, number>
  /** latest non-empty nickname by date */
  latestNick: string
  latestDate: string
  order: number
}

function pickNickname(acc: {
  latestNick: string
  nickCounts: Map<string, number>
}): string {
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

function collectProfileAliasIds(p: LiushuiRollupProfile): string[] {
  const ids = [p.streamerId, p.linkedId1, p.linkedId2, p.linkedId3]
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Build Excel-ID → primary streamer_id map.
 * If the same Excel ID appears on multiple profiles, first profile wins
 * (stable list order); primary streamer_id always claims itself over linked-only.
 */
export function buildIdToPrimaryMap(profiles: LiushuiRollupProfile[]): Map<string, string> {
  const map = new Map<string, string>()
  // Pass 1: claim primary IDs
  for (const p of profiles) {
    const primary = String(p.streamerId || '').trim()
    if (!primary) continue
    if (!map.has(primary)) map.set(primary, primary)
  }
  // Pass 2: claim linked IDs only if free
  for (const p of profiles) {
    const primary = String(p.streamerId || '').trim()
    if (!primary) continue
    for (const id of collectProfileAliasIds(p)) {
      if (id === primary) continue
      if (!map.has(id)) map.set(id, primary)
    }
  }
  return map
}

type RollAcc = {
  key: string
  displayId: string
  centsSum: number
  hasAmount: boolean
  nickCounts: Map<string, number>
  latestNick: string
  latestDate: string
  order: number
  profileName: string
  pointRate: string
  matchedProfile: boolean
}

/**
 * Roll raw Excel day-rows into one row per registration profile identity.
 * - Excel 用户ID matching primary or any linked_id_* → sum into primary streamer_id
 * - Display ID = primary streamer_id; nickname = profile 主播名 if set, else latest Excel nick
 * - Unmatched Excel IDs stay as orphan rows (点位 empty)
 */
export function rollupLiushuiByProfiles(
  rawRows: LiushuiParsedRow[],
  profiles: LiushuiRollupProfile[],
): LiushuiRolledRow[] {
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
    const excelId = String(row.userPlatformId || '').trim()
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
        centsSum: 0,
        hasAmount: false,
        nickCounts: new Map(),
        latestNick: '',
        latestDate: '',
        order: order++,
        profileName: profile ? String(profile.name || '').trim() : '',
        pointRate: profile ? String(profile.pointRate || '').trim() : '',
        matchedProfile: matched,
      }
      byKey.set(key, acc)
    }

    const cents = row.totalFlowCents
    const amount = row.totalFlowAmount
    if (cents != null) {
      acc.centsSum += cents
      acc.hasAmount = true
    } else if (amount != null) {
      acc.centsSum += Math.round(amount * 100)
      acc.hasAmount = true
    }

    const nickname = String(row.nickname || '').trim()
    if (nickname) {
      acc.nickCounts.set(nickname, (acc.nickCounts.get(nickname) || 0) + 1)
      const iso = normalizeDateText(row.timeText) || ''
      const dateKey = iso || String(row.timeText || '').trim() || ''
      if (!acc.latestDate || (dateKey && dateKey >= acc.latestDate)) {
        acc.latestDate = dateKey
        acc.latestNick = nickname
      }
    }
  }

  return [...byKey.values()]
    .sort((a, b) => a.order - b.order)
    .map((acc) => {
      const totalFlowCents = acc.hasAmount ? acc.centsSum : null
      const totalFlowAmount = totalFlowCents != null ? totalFlowCents / 100 : null
      const excelNick = pickNickname(acc)
      const nickname = acc.profileName || excelNick
      return {
        userPlatformId: acc.displayId,
        nickname,
        totalFlowText: formatFlowDisplay(totalFlowAmount, totalFlowCents),
        totalFlowAmount,
        totalFlowCents,
        pointRate: acc.matchedProfile ? acc.pointRate : '',
        matchedProfile: acc.matchedProfile,
      }
    })
}

/**
 * Parse a weekly flow (.xlsx/.xls) buffer.
 * Aggregates by 用户ID (sum 总流水), strips 元 from display amounts,
 * and returns min/max dates with Chinese weekday labels.
 * Callers that need registration-list rollup should pass rawRows through
 * {@link rollupLiushuiByProfiles}.
 */
export function parseLiushuiWorkbook(buf: Buffer | ArrayBuffer | Uint8Array): LiushuiParseResult {
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

  const rawRows: LiushuiParsedRow[] = []
  const byId = new Map<string, AggAcc>()
  let order = 0
  let minDate = ''
  let maxDate = ''

  for (const row of jsonRows) {
    const timeText = cellToText(pickCol(row, ['时间', '日期']))
    const userPlatformId = cellToText(pickCol(row, ['用户ID', '用户Id', '用户id', 'ID', 'Id', 'id']))
    const nickname = cellToText(pickCol(row, ['用户昵称', '昵称']))
    const totalFlowRaw = cellToText(pickCol(row, ['总流水', '总流水(元)', '总流水（元）']))
    if (!userPlatformId && !nickname && !totalFlowRaw) continue

    const { amount, cents } = parseFlowAmount(totalFlowRaw)
    const totalFlowText = formatFlowDisplay(amount, cents) || totalFlowRaw.replace(/元\s*$/u, '').trim()

    rawRows.push({
      timeText,
      userPlatformId,
      nickname,
      totalFlowText,
      totalFlowAmount: amount,
      totalFlowCents: cents,
    })

    const iso = normalizeDateText(timeText)
    if (iso) {
      if (!minDate || iso < minDate) minDate = iso
      if (!maxDate || iso > maxDate) maxDate = iso
    }

    const key = userPlatformId || `__anon_${order}`
    let acc = byId.get(key)
    if (!acc) {
      acc = {
        userPlatformId,
        centsSum: 0,
        hasAmount: false,
        nickCounts: new Map(),
        latestNick: '',
        latestDate: '',
        order: order++,
      }
      byId.set(key, acc)
    }

    if (cents != null) {
      acc.centsSum += cents
      acc.hasAmount = true
    } else if (amount != null) {
      acc.centsSum += Math.round(amount * 100)
      acc.hasAmount = true
    }

    if (nickname) {
      acc.nickCounts.set(nickname, (acc.nickCounts.get(nickname) || 0) + 1)
      const dateKey = iso || timeText || ''
      if (!acc.latestDate || (dateKey && dateKey >= acc.latestDate)) {
        acc.latestDate = dateKey
        acc.latestNick = nickname
      }
    }
  }

  const rows: LiushuiAggregatedRow[] = [...byId.values()]
    .sort((a, b) => a.order - b.order)
    .map((acc) => {
      const totalFlowCents = acc.hasAmount ? acc.centsSum : null
      const totalFlowAmount = totalFlowCents != null ? totalFlowCents / 100 : null
      return {
        userPlatformId: acc.userPlatformId,
        nickname: pickNickname(acc),
        totalFlowText: formatFlowDisplay(totalFlowAmount, totalFlowCents),
        totalFlowAmount,
        totalFlowCents,
      }
    })

  return {
    startDate: minDate,
    endDate: maxDate,
    startDateLabel: formatChineseDateLabel(minDate),
    endDateLabel: formatChineseDateLabel(maxDate),
    rows,
    rawRows,
  }
}


/** One row per 接收用户ID after gift rollup (hall / nick / tipTime retained). */
export type LiushuiUserParsedRow = {
  hallNo: string
  nickname: string
  /** 接收用户ID — store, do not show in table */
  userPlatformId: string
  /** 打赏时间: latest tip, or earliest~latest range when they differ */
  tipTime: string
  totalFlowText: string
  totalFlowAmount: number | null
  totalFlowCents: number | null
}

export type LiushuiUserParseResult = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
  /** One row per user platform ID (gifts summed) */
  rows: LiushuiUserParsedRow[]
  /** Distinct user IDs with non-empty ID (= rows with ID) */
  personCount: number
  /** Gift-level row count before rollup */
  rawGiftCount?: number
}

type UserAggAcc = {
  userPlatformId: string
  centsSum: number
  hasAmount: boolean
  /** last non-empty nickname in file order */
  latestNick: string
  /** hallNo -> cents contributed (for max-flow hall pick) */
  hallCents: Map<string, number>
  firstHall: string
  earliestTip: string
  latestTip: string
  order: number
}

/**
 * Parse user-gift flow workbook, then aggregate by 接收用户ID.
 * - 流水: SUM of gifts for that ID
 * - 用户昵称: last non-empty nickname
 * - 厅号: hall with highest total 流水 for that ID (else first seen)
 * - 打赏时间: latest tip (or earliest~latest range when both differ)
 * Headers: 靓号厅ID/厅号/厅ID, 用户昵称, 接收用户ID（用户）/用户ID, 打赏时间, 流水
 */
export function parseUserLiushuiWorkbook(buf: Buffer | ArrayBuffer | Uint8Array): LiushuiUserParseResult {
  const data =
    buf instanceof Buffer
      ? buf
      : buf instanceof ArrayBuffer
        ? Buffer.from(buf)
        : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)

  const wb = XLSX.read(data, { type: 'buffer', cellDates: true, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { startDate: '', endDate: '', startDateLabel: '', endDateLabel: '', rows: [], personCount: 0, rawGiftCount: 0 }
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return { startDate: '', endDate: '', startDateLabel: '', endDateLabel: '', rows: [], personCount: 0, rawGiftCount: 0 }
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const byId = new Map<string, UserAggAcc>()
  let order = 0
  let minDate = ''
  let maxDate = ''
  let rawGiftCount = 0

  for (const row of jsonRows) {
    const hallNo = cellToText(
      pickCol(row, ['靓号厅ID', '靓号厅Id', '厅号', '厅ID', '厅Id']),
    )
    const nickname = cellToText(pickCol(row, ['用户昵称', '昵称']))
    const userPlatformId = cellToText(
      pickCol(row, [
        '接收用户ID（用户）',
        '接收用户ID(用户)',
        '接收用户ID',
        '用户ID',
        '用户Id',
        '用户id',
      ]),
    )
    const tipTime = cellToText(pickCol(row, ['打赏时间', '时间', '日期']))
    const flowRaw = cellToText(pickCol(row, ['流水', '流水(元)', '流水（元）', '总流水']))
    if (!hallNo && !nickname && !userPlatformId && !flowRaw && !tipTime) continue

    const { amount, cents } = parseFlowAmount(flowRaw)
    rawGiftCount++

    const iso = normalizeDateText(tipTime)
    if (iso) {
      if (!minDate || iso < minDate) minDate = iso
      if (!maxDate || iso > maxDate) maxDate = iso
    }

    // Empty IDs stay as separate orphan gift rows (do not merge all blanks).
    const key = userPlatformId || `__anon_${order}`
    let acc = byId.get(key)
    if (!acc) {
      acc = {
        userPlatformId,
        centsSum: 0,
        hasAmount: false,
        latestNick: '',
        hallCents: new Map(),
        firstHall: '',
        earliestTip: '',
        latestTip: '',
        order: order++,
      }
      byId.set(key, acc)
    }

    const addCents =
      cents != null ? cents : amount != null ? Math.round(amount * 100) : null
    if (addCents != null) {
      acc.centsSum += addCents
      acc.hasAmount = true
    }

    if (nickname) acc.latestNick = nickname

    if (hallNo) {
      if (!acc.firstHall) acc.firstHall = hallNo
      const prev = acc.hallCents.get(hallNo) || 0
      acc.hallCents.set(hallNo, prev + (addCents != null ? addCents : 0))
    }

    if (tipTime) {
      if (!acc.earliestTip || tipTime < acc.earliestTip) acc.earliestTip = tipTime
      if (!acc.latestTip || tipTime > acc.latestTip) acc.latestTip = tipTime
    }
  }

  const rows: LiushuiUserParsedRow[] = [...byId.values()]
    .map((acc) => {
      const totalFlowCents = acc.hasAmount ? acc.centsSum : null
      const totalFlowAmount = totalFlowCents != null ? totalFlowCents / 100 : null

      let hallNo = acc.firstHall
      let bestHallCents = -1
      for (const [h, c] of acc.hallCents) {
        if (!h) continue
        if (c > bestHallCents) {
          bestHallCents = c
          hallNo = h
        }
      }

      let tipTime = acc.latestTip || acc.earliestTip || ''
      if (acc.earliestTip && acc.latestTip && acc.earliestTip !== acc.latestTip) {
        tipTime = `${acc.earliestTip} ~ ${acc.latestTip}`
      }

      return {
        hallNo,
        nickname: acc.latestNick,
        userPlatformId: acc.userPlatformId,
        tipTime,
        totalFlowText: formatFlowDisplay(totalFlowAmount, totalFlowCents),
        totalFlowAmount,
        totalFlowCents,
      }
    })

  rows.sort((a, b) => {
    const av = a.totalFlowAmount != null && Number.isFinite(a.totalFlowAmount) ? a.totalFlowAmount : -Infinity
    const bv = b.totalFlowAmount != null && Number.isFinite(b.totalFlowAmount) ? b.totalFlowAmount : -Infinity
    if (bv !== av) return bv - av
    return (a.userPlatformId || '').localeCompare(b.userPlatformId || '', 'zh')
  })

  const personCount = rows.filter((r) => (r.userPlatformId || '').trim()).length

  return {
    startDate: minDate,
    endDate: maxDate,
    startDateLabel: formatChineseDateLabel(minDate),
    endDateLabel: formatChineseDateLabel(maxDate),
    rows,
    personCount,
    rawGiftCount,
  }
}
