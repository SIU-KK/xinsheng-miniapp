import * as XLSX from 'xlsx'
import { formatChineseDateLabel, normalizeDateText } from './liushuiParse'

export type CommissionAggregatedRow = {
  userAccount: string
  nickname: string
  payAmount: number
  saleAmount: number
  cumulativeAmount: number
}

export type CommissionParseResult = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
  rows: CommissionAggregatedRow[]
  rawOrderCount: number
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
    const hh = String(v.getHours()).padStart(2, '0')
    const mm = String(v.getMinutes()).padStart(2, '0')
    const ss = String(v.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
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

/** Parse money cells to float, rounded to 2 decimals. */
export function parseMoneyFloat(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 0
    return Math.round(v * 100) / 100
  }
  const cleaned = String(v).replace(/,/g, '').replace(/¥|￥|元/g, '').replace(/\s/g, '')
  if (!cleaned) return 0
  const m = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!m) return 0
  const n = Number(m[0])
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/**
 * Build a sortable datetime key (YYYY-MM-DDTHH:MM:SS) from 支付时间 text.
 * Falls back to date-only (T00:00:00) or empty string.
 */
export function normalizePayDateTimeKey(timeText: string): string {
  const t = String(timeText || '').trim()
  if (!t) return ''
  const m = t.match(
    /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?/,
  )
  if (m) {
    const y = m[1]
    const mo = String(Number(m[2])).padStart(2, '0')
    const d = String(Number(m[3])).padStart(2, '0')
    const hh = String(Number(m[4] ?? 0)).padStart(2, '0')
    const mm = String(Number(m[5] ?? 0)).padStart(2, '0')
    const ss = String(Number(m[6] ?? 0)).padStart(2, '0')
    return `${y}-${mo}-${d}T${hh}:${mm}:${ss}`
  }
  // Excel serial
  if (/^\d+(\.\d+)?$/.test(t)) {
    const serial = Number(t)
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const whole = Math.floor(serial)
      const frac = serial - whole
      const utc = Date.UTC(1899, 11, 30) + whole * 86400000
      const msInDay = Math.round(frac * 86400000)
      const dt = new Date(utc + msInDay)
      const y = dt.getUTCFullYear()
      const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
      const d = String(dt.getUTCDate()).padStart(2, '0')
      const hh = String(dt.getUTCHours()).padStart(2, '0')
      const mm = String(dt.getUTCMinutes()).padStart(2, '0')
      const ss = String(dt.getUTCSeconds()).padStart(2, '0')
      return `${y}-${mo}-${d}T${hh}:${mm}:${ss}`
    }
  }
  const iso = normalizeDateText(t)
  return iso ? `${iso}T00:00:00` : ''
}

type AggAcc = {
  userAccount: string
  payAmount: number
  saleAmount: number
  cumulativeAmount: number
  maxCumulative: number
  nickname: string
  latestKey: string
  order: number
}

/**
 * Parse order-commission workbook.
 * Headers (sample + aliases):
 *   用户账号, 用户昵称, 支付金额, 销售金额, 累计金额, 支付时间
 * Aggregates by 用户账号:
 *   sum 支付金额, sum 销售金额,
 *   累计金额 + nickname from the row with latest 支付时间 (fallback max 累计金额).
 * Date range from 支付时间 min/max.
 */
export function parseCommissionWorkbook(
  buf: Buffer | ArrayBuffer | Uint8Array,
): CommissionParseResult {
  const data =
    buf instanceof Buffer
      ? buf
      : buf instanceof ArrayBuffer
        ? Buffer.from(buf)
        : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)

  const wb = XLSX.read(data, { type: 'buffer', cellDates: true, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return {
      startDate: '',
      endDate: '',
      startDateLabel: '',
      endDateLabel: '',
      rows: [],
      rawOrderCount: 0,
    }
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return {
      startDate: '',
      endDate: '',
      startDateLabel: '',
      endDateLabel: '',
      rows: [],
      rawOrderCount: 0,
    }
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const byAccount = new Map<string, AggAcc>()
  let order = 0
  let minDate = ''
  let maxDate = ''
  let rawOrderCount = 0

  for (const row of jsonRows) {
    const userAccount = cellToText(
      pickCol(row, ['用户账号', '账号', '用户ID', '用户Id', '用户id']),
    )
    const nickname = cellToText(pickCol(row, ['用户昵称', '昵称']))
    const payAmount = parseMoneyFloat(pickCol(row, ['支付金额', '实付金额', '付款金额']))
    const saleAmount = parseMoneyFloat(pickCol(row, ['销售金额', '售卖金额']))
    const cumulativeAmount = parseMoneyFloat(pickCol(row, ['累计金额', '累计充值', '累计支付']))
    const payTimeText = cellToText(pickCol(row, ['支付时间', '付款时间', '下单时间', '时间']))

    if (!userAccount && !nickname && !payTimeText) continue
    if (!userAccount) continue

    rawOrderCount++

    const iso = normalizeDateText(payTimeText)
    if (iso) {
      if (!minDate || iso < minDate) minDate = iso
      if (!maxDate || iso > maxDate) maxDate = iso
    }

    const dtKey = normalizePayDateTimeKey(payTimeText)

    let acc = byAccount.get(userAccount)
    if (!acc) {
      acc = {
        userAccount,
        payAmount: 0,
        saleAmount: 0,
        cumulativeAmount: 0,
        maxCumulative: 0,
        nickname: '',
        latestKey: '',
        order: order++,
      }
      byAccount.set(userAccount, acc)
    }

    acc.payAmount = Math.round((acc.payAmount + payAmount) * 100) / 100
    acc.saleAmount = Math.round((acc.saleAmount + saleAmount) * 100) / 100
    if (cumulativeAmount > acc.maxCumulative) acc.maxCumulative = cumulativeAmount

    if (dtKey && (!acc.latestKey || dtKey >= acc.latestKey)) {
      acc.latestKey = dtKey
      acc.cumulativeAmount = cumulativeAmount
      if (nickname) acc.nickname = nickname
    } else if (!acc.latestKey) {
      // No usable pay time yet: keep max cumulative + any nickname
      if (cumulativeAmount >= acc.cumulativeAmount) {
        acc.cumulativeAmount = cumulativeAmount
      }
      if (nickname && !acc.nickname) acc.nickname = nickname
    } else if (nickname && !acc.nickname) {
      acc.nickname = nickname
    }
  }

  const rows: CommissionAggregatedRow[] = [...byAccount.values()]
    .sort((a, b) => a.order - b.order)
    .map((acc) => ({
      userAccount: acc.userAccount,
      nickname: acc.nickname,
      payAmount: acc.payAmount,
      saleAmount: acc.saleAmount,
      // If we never got a datetime-keyed cumulative, fall back to max
      cumulativeAmount: acc.latestKey ? acc.cumulativeAmount : acc.maxCumulative,
    }))

  return {
    startDate: minDate,
    endDate: maxDate,
    startDateLabel: formatChineseDateLabel(minDate),
    endDateLabel: formatChineseDateLabel(maxDate),
    rows,
    rawOrderCount,
  }
}

/** Default batch label: YYYY年M月订单提成 when startDate has a month, else 订单提成. */
export function defaultCommissionLabel(startDate: string): string {
  const m = String(startDate || '').match(/^(\d{4})-(\d{2})/)
  if (!m) return '订单提成'
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!y || !mo) return '订单提成'
  return `${y}年${mo}月订单提成`
}
