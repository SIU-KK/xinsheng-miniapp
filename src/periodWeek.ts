type YmdParts = [number, number, number]

export type MonthWeek = { week: number; monday: string; sunday: string }

function ymdParts(ymd: string): YmdParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (![year, month, day].every((n) => Number.isFinite(n)) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  return [year, month, day]
}

function ymdFromUtcMs(ms: number): string {
  const date = new Date(ms)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function utcNoonYmd(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, 12, 0, 0)
}

/** Today's civil date in Asia/Tokyo. */
export function tokyoTodayYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (year && month && day) return `${year}-${month}-${day}`

  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function addDaysYmd(ymd: string, days: number): string {
  const parts = ymdParts(ymd)
  if (!parts) return ''
  return ymdFromUtcMs(utcNoonYmd(parts[0], parts[1], parts[2]) + days * 86_400_000)
}

/** Monday of the Mon–Sun week containing civil YYYY-MM-DD. */
export function mondayOfYmd(ymd: string): string {
  const parts = ymdParts(ymd)
  if (!parts) return ''
  const ms = utcNoonYmd(parts[0], parts[1], parts[2])
  const dayOfWeek = new Date(ms).getUTCDay()
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  return addDaysYmd(ymd, offset)
}

/**
 * Weeks overlapping a calendar month, numbered 1..5 by Monday order.
 * A cross-month week appears in both months' lists when applicable.
 */
export function listMonthWeeks(year: number, month: number): MonthWeek[] {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return []
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  let monday = mondayOfYmd(first)
  if (!monday) return []

  const weeks: MonthWeek[] = []
  for (let i = 0; i < 6; i += 1) {
    const sunday = addDaysYmd(monday, 6)
    if (sunday >= first && monday <= last) {
      weeks.push({ week: weeks.length + 1, monday, sunday })
      if (weeks.length >= 5) break
    }
    monday = addDaysYmd(monday, 7)
    if (!monday || monday > last) break
  }
  return weeks
}

function adjacentMonth(year: number, month: number, offset: -1 | 1): { year: number; month: number } {
  if (offset === 1) {
    return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  }
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

export function defaultLastWeekPeriod(): { year: number; month: number; week: number } {
  const today = tokyoTodayYmd()
  const thisWeekMonday = mondayOfYmd(today)
  const lastWeekMonday = addDaysYmd(thisWeekMonday, -7)
  const parts = ymdParts(lastWeekMonday)
  if (!parts) return { year: new Date().getFullYear(), month: new Date().getMonth() + 1, week: 1 }

  const [year, month] = parts
  const preferred = listMonthWeeks(year, month).find((week) => week.monday === lastWeekMonday)
  if (preferred) return { year, month, week: preferred.week }

  for (const offset of [1, -1] as const) {
    const other = adjacentMonth(year, month, offset)
    const match = listMonthWeeks(other.year, other.month).find((week) => week.monday === lastWeekMonday)
    if (match) return { year: other.year, month: other.month, week: match.week }
  }

  return { year, month, week: 1 }
}
