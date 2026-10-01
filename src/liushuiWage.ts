/** Per-row wage formulas for 上传流水 / 计算工资 */

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Parse numeric 点位 from stored text ("0.45" or "0.45（福利图）"). */
export function parsePointRateNumber(pointRateText: string): number | null {
  const m = String(pointRateText || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export type WageInputs = {
  totalFlowYuan: number | null | undefined
  addFlowYuan: number | null | undefined
  deductFlowYuan: number | null | undefined
  /** Numeric point rate (e.g. 0.45), or null if unknown */
  pointRateNum: number | null | undefined
  hostHours: number | null | undefined
  hostWagePerHour: number | null | undefined
  rewardYuan: number | null | undefined
  fineYuan: number | null | undefined
}

export type WageResult = {
  actualFlow: number
  baseWage: number
  hostWage: number
  totalWage: number
}

/**
 * 1. 实际流水 = 总流水 + 添加流水 - 扣除流水
 * 2. 基础工资 = 实际流水 × 点位
 * 3. 主持工资行 = 主持时长 × 主持工资(/小时)
 * 4. 总工资 = 基础工资 + 主持工资行 + 奖励 - 罚款
 */
export function computeRowWages(input: WageInputs): WageResult {
  const total = input.totalFlowYuan ?? 0
  const add = input.addFlowYuan ?? 0
  const deduct = input.deductFlowYuan ?? 0
  const actualFlow = roundMoney(total + add - deduct)
  const rate = input.pointRateNum ?? 0
  const baseWage = roundMoney(actualFlow * rate)
  const hostWage = roundMoney((input.hostHours ?? 0) * (input.hostWagePerHour ?? 0))
  const totalWage = roundMoney(
    baseWage + hostWage + (input.rewardYuan ?? 0) - (input.fineYuan ?? 0),
  )
  return { actualFlow, baseWage, hostWage, totalWage }
}

export function formatMoney2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(2)
}
