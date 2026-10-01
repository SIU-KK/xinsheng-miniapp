/** 点位类型标签（存于 profile.point_rate；流水表存计算后的数值字符串） */
export const POINT_TYPES = ['福利图', '歌手', '特殊', '厅管', '半满', '全满', '大哥'] as const

export type PointType = (typeof POINT_TYPES)[number]

export function isPointType(v: string): v is PointType {
  return (POINT_TYPES as readonly string[]).includes(v)
}

/**
 * Excel-equivalent 点位费率：
 * h = 麦序时长 + 主持时长
 * 福利图: h>=35→0.45, h>=21→0.43, else 0.37
 * 歌手 0.45 / 特殊 0.47 / 厅管 0.5 / 半满 0.53 / 全满 0.558 / 大哥 0.52
 */
export function computePointRate(
  type: string,
  micHours: number,
  hostHours: number,
): number | null {
  const h = (micHours || 0) + (hostHours || 0)
  if (type === '福利图') {
    if (h >= 35) return 0.45
    if (h >= 21) return 0.43
    return 0.37
  }
  if (type === '歌手') return 0.45
  if (type === '特殊') return 0.47
  if (type === '厅管') return 0.5
  if (type === '半满') return 0.53
  if (type === '全满') return 0.558
  if (type === '大哥') return 0.52
  return null
}

/** Format computed rate for storage / display (stable string). */
export function formatPointRateValue(n: number): string {
  // Avoid float noise; keep meaningful decimals (e.g. 0.558)
  const s = String(n)
  if (s.includes('e') || s.includes('E')) return n.toFixed(6).replace(/\.?0+$/, '')
  return s
}

/** Compute + format; empty string when type unknown / unmatched. */
export function computedPointRateText(
  type: string,
  micHours: number | null | undefined,
  hostHours: number | null | undefined,
): string {
  const n = computePointRate(type, micHours ?? 0, hostHours ?? 0)
  return n == null ? '' : formatPointRateValue(n)
}
