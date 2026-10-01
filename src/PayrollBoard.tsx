import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { PullToRefresh, useBackHandler } from './uxGestures'
import {
  fetchPayrollBoard,
  markSalaryPaidApi,
  toUserError,
  type PayrollBoardResponse,
  type PayrollBoardRow,
} from './api'
import { formatMoney2 } from './liushuiWage'
import { defaultLastWeekPeriod } from './periodWeek'

const WEEK_OPTIONS = [1, 2, 3, 4, 5] as const

function monthInputValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function parseMonthInput(v: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null
  return { year, month }
}

function rangeText(data: PayrollBoardResponse | null): string {
  if (!data) return ''
  const start = data.range.startDateLabel || data.range.startDate || data.period.monday
  const end = data.range.endDateLabel || data.range.endDate || data.period.sunday
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Keep 厅主 rows pinned, then preserve the unpaid-first wage ordering. */
function payrollRowOrder(a: PayrollBoardRow, b: PayrollBoardRow): number {
  const aHallOwner = a.isHallOwner === true
  const bHallOwner = b.isHallOwner === true
  if (aHallOwner !== bHallOwner) return aHallOwner ? -1 : 1
  if (a.paid !== b.paid) return a.paid ? 1 : -1
  const aw = a.totalWage ?? -Infinity
  const bw = b.totalWage ?? -Infinity
  if (bw !== aw) return bw - aw
  return a.streamerId.localeCompare(b.streamerId)
}

/** Recompute paid/unpaid/weekBalance after local row updates (keep payableTotal). */
function recomputePayrollTotals(
  rows: PayrollBoardRow[],
  payableTotal: number,
): Pick<PayrollBoardResponse, 'paidTotal' | 'unpaidTotal' | 'payableTotal' | 'weekBalance'> {
  let paidTotal = 0
  let unpaidTotal = 0
  for (const r of rows) {
    const w = r.totalWage != null && Number.isFinite(r.totalWage) ? r.totalWage : 0
    if (r.paid) paidTotal += w
    else unpaidTotal += w
  }
  paidTotal = roundMoney2(paidTotal)
  unpaidTotal = roundMoney2(unpaidTotal)
  const payable = roundMoney2(payableTotal)
  return {
    paidTotal,
    unpaidTotal,
    payableTotal: payable,
    weekBalance: roundMoney2(payable - paidTotal),
  }
}

export function PayrollBoardPage({ onBack }: { onBack: () => void }) {
  const initial = useMemo(() => defaultLastWeekPeriod(), [])
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [week, setWeek] = useState<number>(initial.week)
  const [data, setData] = useState<PayrollBoardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<PayrollBoardRow | null>(null)
  const [paying, setPaying] = useState(false)
  const [payErr, setPayErr] = useState<string | null>(null)
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null)

  function closeQrPreview() {
    setQrPreviewUrl(null)
  }

  function closeDetail() {
    if (paying) return
    setDetail(null)
    setPayErr(null)
    setQrPreviewUrl(null)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const out = await fetchPayrollBoard({ year, month, week })
      setData(out)
    } catch (e) {
      setData(null)
      setErr(toUserError(e, '加载失败，请重试'))
    } finally {
      setLoading(false)
    }
  }, [year, month, week])

  useEffect(() => {
    void load()
  }, [load])

  useBackHandler(qrPreviewUrl ? () => closeQrPreview() : detail && !paying ? () => closeDetail() : null)

  function onQrClick(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const url = detail?.payQrUrl
    if (!url) return
    setQrPreviewUrl(url)
  }

  async function onMarkPaid() {
    if (!detail || !data?.selectedBatchId || detail.paid || paying) return
    setPaying(true)
    setPayErr(null)
    try {
      const out = await markSalaryPaidApi(data.selectedBatchId, detail.streamerId, { year, month, week })
      setData((prev) => {
        if (!prev) return prev
        const rows = prev.rows
          .map((r) =>
            r.streamerId === detail.streamerId && r.rowId === detail.rowId
              ? { ...r, paid: true, paidAt: out.paidAt }
              : r,
          )
          .sort(payrollRowOrder)
        return {
          ...prev,
          rows,
          ...recomputePayrollTotals(rows, prev.payableTotal),
        }
      })
      setDetail((prev) => (prev ? { ...prev, paid: true, paidAt: out.paidAt } : prev))
    } catch (e) {
      setPayErr(toUserError(e, '标记失败，请重试'))
    } finally {
      setPaying(false)
    }
  }

  const rows = data?.rows ?? []
  const empty = data?.empty || (!loading && !err && rows.length === 0)

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">工资发放</div>
        <span className="nav-side" />
      </div>

      <div className="revenue-period-bar">
        <section className="mine-sec revenue-period-sec">
          <h2 className="mine-sec-title">周期</h2>
          <div className="mine-card revenue-period">
            <label className="revenue-month-label">
              <span>年月</span>
              <input
                type="month"
                className="revenue-month-input"
                value={monthInputValue(year, month)}
                onChange={(e) => {
                  const parsed = parseMonthInput(e.target.value)
                  if (!parsed) return
                  setYear(parsed.year)
                  setMonth(parsed.month)
                }}
              />
            </label>
            <div className="revenue-week-row" role="tablist" aria-label="周次">
              {WEEK_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={week === w}
                  className={'revenue-week-btn' + (week === w ? ' active' : '')}
                  onClick={() => setWeek(w)}
                >
                  第{w}周
                </button>
              ))}
            </div>
            {data?.period.sharedLabel ? (
              <p className="revenue-shared-hint">
                与「{data.period.sharedLabel}」为同一周组（跨月共享）
              </p>
            ) : null}
            {rangeText(data) ? <p className="mine-salary-range">{rangeText(data)}</p> : null}
          </div>
        </section>
      </div>

      <PullToRefresh className="mine-scroll mine-doc payroll-board-scroll" onRefresh={load}>
        {loading && !data ? (
          <section className="mine-sec">
            <p className="mine-admin-hint">加载中…</p>
          </section>
        ) : null}

        {err ? (
          <section className="mine-sec">
            <p className="mine-admin-hint">{err}</p>
          </section>
        ) : null}

        {!err && data && !loading ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">本周汇总</h2>
            <div className="mine-card revenue-summary revenue-overview-summary">
              <div className="revenue-overview-grid">
                <div className="revenue-overview-item">
                  <div className="revenue-overview-label">应到账</div>
                  <div className="revenue-overview-value">{formatMoney2(data.payableTotal)}</div>
                </div>
                <div className="revenue-overview-item">
                  <div className="revenue-overview-label">已发工资</div>
                  <div className="revenue-overview-value">{formatMoney2(data.paidTotal)}</div>
                </div>
                <div className="revenue-overview-item">
                  <div className="revenue-overview-label">差额</div>
                  <div className="revenue-overview-value">{formatMoney2(data.weekBalance)}</div>
                </div>
              </div>
              <p className="mine-admin-hint" style={{ marginTop: 8 }}>
                未发放工资总额 {formatMoney2(data.unpaidTotal)}（列表内未付款合计）
              </p>
            </div>
          </section>
        ) : null}

        {!err && empty && !loading ? (
          <section className="mine-sec">
            <div className="mine-card">
              <p className="revenue-empty">{data?.emptyMessage || '该周暂无主播流水'}</p>
            </div>
          </section>
        ) : null}

        {!err && rows.length > 0 ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">发放列表</h2>
            <ul className="payroll-list">
              {rows.map((r) => (
                <li key={r.rowId}>
                  <button
                    type="button"
                    className={'payroll-row' + (r.paid ? ' paid' : '')}
                    onClick={() => {
                      setPayErr(null)
                      setQrPreviewUrl(null)
                      setDetail(r)
                    }}
                  >
                    <div className="payroll-row-main">
                      <div className="payroll-row-name">
                        {r.nickname}
                        {r.isHallOwner ? <span className="payroll-badge hall-owner">厅主</span> : null}
                      </div>
                      <div className="payroll-row-id">ID {r.streamerId || '—'}</div>
                      {r.isHallOwner && r.hallNo ? (
                        <div className="payroll-row-hall-lines">
                          <div>{`${r.hallNo}用户总流水`} {formatMoney2(r.hallUserFlow ?? null)}</div>
                          <div>{`${r.hallNo}主持总流水`} {formatMoney2(r.hallStreamerFlow ?? null)}</div>
                          <div>{`${r.hallNo}主持总工资`} {formatMoney2(r.hallStreamerWageTotal ?? null)}</div>
                        </div>
                      ) : null}
                    </div>
                    <div className="payroll-row-nums">
                      <div className="payroll-row-kv">
                        <span className="payroll-row-k">合并流水</span>
                        <span className="payroll-row-v">{formatMoney2(r.mergedFlow)}</span>
                      </div>
                      <div className="payroll-row-kv">
                        <span className="payroll-row-k">总工资</span>
                        <span className="payroll-row-v wage">{formatMoney2(r.totalWage)}</span>
                      </div>
                      <div className="payroll-row-badges">
                        <span className={'payroll-badge' + (r.confirmed ? ' ok' : '')}>
                          {r.confirmed ? '已确认' : '未确认'}
                        </span>
                        {r.paid ? <span className="payroll-badge paid-badge">已付款</span> : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PullToRefresh>

      {detail ? (
        <div
          className="sheet-mask"
          onClick={closeDetail}
          role="presentation"
        >
          <div
            className="sheet payroll-detail-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="资料"
          >
            <div className="sheet-head">
              <div className="title">资料</div>
              <button
                type="button"
                aria-label="close"
                disabled={paying}
                onClick={closeDetail}
              >
                ×
              </button>
            </div>
            <div className="sheet-body payroll-detail-body">
              <div className="payroll-detail-meta">
                <div className="payroll-detail-name">{detail.nickname}</div>
                <div className="payroll-detail-id">ID {detail.streamerId || '—'}</div>
              </div>
              <div className="payroll-qr-wrap">
                {detail.payQrUrl ? (
                  <button
                    type="button"
                    className="payroll-qr-tap"
                    aria-label="点击放大收款码"
                    onClick={onQrClick}
                  >
                    <img
                      className="payroll-qr-img"
                      src={detail.payQrUrl}
                      alt="收款码"
                      draggable={false}
                    />
                  </button>
                ) : (
                  <div className="payroll-qr-empty">暂无收款码</div>
                )}
              </div>
              {detail.payQrUrl ? (
                <p className="payroll-qr-hint">点击放大，长按可识别二维码</p>
              ) : null}
              <div className="payroll-detail-amount">
                <span className="payroll-detail-amount-label">总工资</span>
                <span className="payroll-detail-amount-value">
                  {formatMoney2(detail.totalWage)}
                </span>
              </div>
              {detail.isHallOwner && detail.hallNo ? (
                <div className="payroll-detail-hall">
                  <div className="payroll-detail-hall-row">
                    <span>{`${detail.hallNo}用户总流水`}</span>
                    <span>{formatMoney2(detail.hallUserFlow ?? null)}</span>
                  </div>
                  <div className="payroll-detail-hall-row">
                    <span>{`${detail.hallNo}主持总流水`}</span>
                    <span>{formatMoney2(detail.hallStreamerFlow ?? null)}</span>
                  </div>
                  <div className="payroll-detail-hall-row">
                    <span>{`${detail.hallNo}主持总工资`}</span>
                    <span>{formatMoney2(detail.hallStreamerWageTotal ?? null)}</span>
                  </div>
                </div>
              ) : null}
              {detail.paid ? (
                <p className="payroll-detail-paid-hint">已付款</p>
              ) : null}
              {payErr ? <p className="mine-admin-hint">{payErr}</p> : null}
              <div className="payroll-detail-actions">
                <button
                  type="button"
                  className="payroll-btn ghost"
                  disabled={paying}
                  onClick={closeDetail}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="payroll-btn primary"
                  disabled={paying || detail.paid}
                  onClick={onMarkPaid}
                >
                  {detail.paid ? '已付款' : paying ? '处理中…' : '已付款'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {qrPreviewUrl ? (
        <div
          className="payroll-qr-preview-mask"
          onClick={closeQrPreview}
          role="presentation"
        >
          <button
            type="button"
            className="payroll-qr-preview-close"
            aria-label="关闭预览"
            onClick={(e) => {
              e.stopPropagation()
              closeQrPreview()
            }}
          >
            ×
          </button>
          <div
            className="payroll-qr-preview-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="收款码预览"
          >
            <img
              className="payroll-qr-preview-img"
              src={qrPreviewUrl}
              alt="收款码"
              draggable={false}
            />
            <p className="payroll-qr-preview-hint">长按图片可识别二维码</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
