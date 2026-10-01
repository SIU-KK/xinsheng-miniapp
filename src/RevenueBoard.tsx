import { useCallback, useEffect, useMemo, useState } from 'react'
import { PullToRefresh } from './uxGestures'
import {
  fetchRevenueBoard,
  toUserError,
  type RevenueBoardResponse,
} from './api'
import { formatMoney2, roundMoney } from './liushuiWage'
import { defaultLastWeekPeriod } from './periodWeek'

/** 贡献 Top 奖励占「用户流水厅收益」比例（仅第 1–3 名）；不在 UI 展示百分比。 */
const CONTRIB_TOP_PRIZE_RATES = [0.15, 0.12, 0.08] as const

function contribTopPrize(hallRevenue: number, rankIndex: number): number | null {
  if (rankIndex < 0 || rankIndex >= CONTRIB_TOP_PRIZE_RATES.length) return null
  const base = Number.isFinite(hallRevenue) ? hallRevenue : 0
  return roundMoney(base * CONTRIB_TOP_PRIZE_RATES[rankIndex])
}

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

function rangeText(data: RevenueBoardResponse | null): string {
  if (!data) return ''
  const start = data.range.startDateLabel || data.range.startDate || data.period.monday
  const end = data.range.endDateLabel || data.range.endDate || data.period.sunday
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

export function RevenueBoardPage({
  username: _username = '',
  lockedHallNo = null,
  hideOverviewTotals: hideOverviewTotalsProp = false,
  onBack,
}: {
  username?: string
  /** 厅主所属厅号 — forces filters; null = admin / full */
  lockedHallNo?: string | null
  hideOverviewTotals?: boolean
  onBack: () => void
}) {
  void _username

  const lockedHall = (lockedHallNo || '').trim() || null
  const initial = useMemo(() => defaultLastWeekPeriod(), [])
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [week, setWeek] = useState<number>(initial.week)
  const [overviewHallNo, setOverviewHallNo] = useState(lockedHall ?? '')
  const [data, setData] = useState<RevenueBoardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (lockedHall && overviewHallNo !== lockedHall) {
      setOverviewHallNo(lockedHall)
    }
  }, [lockedHall, overviewHallNo])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const hallParam = lockedHall ?? overviewHallNo
    try {
      const out = await fetchRevenueBoard({
        year,
        month,
        week,
        hallNo: hallParam,
        streamerHallNo: hallParam,
        overviewHallNo: hallParam,
      })
      setData(out)
      const apiLocked = out.viewerScope?.hallNo || lockedHall
      if (apiLocked) {
        if (overviewHallNo !== apiLocked) setOverviewHallNo(apiLocked)
      } else if (
        overviewHallNo &&
        out.overviewHalls.length &&
        !out.overviewHalls.includes(overviewHallNo)
      ) {
        setOverviewHallNo('')
      }
    } catch (e) {
      setData(null)
      setErr(toUserError(e, '加载失败，请重试'))
    } finally {
      setLoading(false)
    }
  }, [year, month, week, overviewHallNo, lockedHall])

  useEffect(() => {
    void load()
  }, [load])

  const ss = data?.streamerSummary
  const us = data?.userSummary
  const scopeHall = data?.viewerScope?.hallNo || lockedHall
  const hideOverviewTotals =
    Boolean(data?.viewerScope?.hideOverviewTotals) || hideOverviewTotalsProp
  // 厅主：隐藏销售收益预计总收入/支出（admin 全部仍显示）
  const hideSalesEstimates =
    Boolean(data?.viewerScope?.hideSalesEstimates) || Boolean(lockedHall)
  const overviewHalls = scopeHall
    ? (data?.overviewHalls?.length ? data.overviewHalls : [scopeHall])
    : (data?.overviewHalls ?? [])
  const selectedOverviewHall = scopeHall ?? (data?.overviewHallNo ?? overviewHallNo)
  const empty = data?.empty || (!ss && !us && !loading && !err)
  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">收益看板</div>
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
                  setOverviewHallNo(lockedHall ?? '')
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
                  onClick={() => {
                    setWeek(w)
                    setOverviewHallNo(lockedHall ?? '')
                  }}
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
      <PullToRefresh className="mine-scroll mine-doc revenue-board-scroll" onRefresh={load}>
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

        {!err && empty && !loading ? (
          <section className="mine-sec">
            <div className="mine-card">
              <p className="revenue-empty">{data?.emptyMessage || '该周暂无上传流水'}</p>
            </div>
          </section>
        ) : null}

        {!err && data && !loading ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">流水总览</h2>
            <div className="mine-card revenue-summary revenue-overview-summary">
              {(overviewHalls.length > 0 || selectedOverviewHall) ? (
                <div className="revenue-hall-row" role="tablist" aria-label="厅号">
                  {!scopeHall ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!selectedOverviewHall}
                      className={'revenue-hall-chip' + (!selectedOverviewHall ? ' active' : '')}
                      onClick={() => setOverviewHallNo('')}
                    >
                      全部
                    </button>
                  ) : null}
                  {overviewHalls.map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="tab"
                      aria-selected={selectedOverviewHall === h}
                      className={'revenue-hall-chip' + (selectedOverviewHall === h ? ' active' : '')}
                      onClick={() => {
                        if (scopeHall) return
                        setOverviewHallNo(h)
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="revenue-overview-grid">
                {/* 主播 */}
                <div className="revenue-overview-item revenue-card-streamer">
                  <div className="revenue-overview-label">主播总流水</div>
                  <div className="revenue-overview-value">{formatMoney2(data.overviewStreamerTotalFlow)}</div>
                </div>
                {!hideOverviewTotals ? (
                  <div className="revenue-overview-item revenue-card-streamer">
                    <div className="revenue-overview-label">主播流水总收益</div>
                    <div className="revenue-overview-value">{formatMoney2(data.overviewStreamerTotalRevenue)}</div>
                  </div>
                ) : null}
                <div className="revenue-overview-item revenue-card-streamer">
                  <div className="revenue-overview-label">主播总支出</div>
                  <div className="revenue-overview-value">{formatMoney2(data.overviewStreamerTotalWage)}</div>
                </div>

                {/* 厅：用户厅收益与主播厅收益均归入厅 */}
                <div className="revenue-overview-item revenue-card-hall">
                  <div className="revenue-overview-label">用户流水厅收益</div>
                  <div className="revenue-overview-value">{formatMoney2(data.overviewUserHallRevenue)}</div>
                </div>
                <div className="revenue-overview-item revenue-card-hall">
                  <div className="revenue-overview-label">主播流水厅收益</div>
                  <div className="revenue-overview-value">{formatMoney2(data.overviewStreamerHallRevenue)}</div>
                </div>
                <div className="revenue-overview-item revenue-card-hall">
                  <div className="revenue-overview-label">厅总支出</div>
                  <div className="revenue-overview-value">
                    {formatMoney2(data.overviewHallTotalExpense ?? data.overviewStreamerTotalWage)}
                  </div>
                </div>
                <div className="revenue-overview-item revenue-card-hall">
                  <div className="revenue-overview-label">厅总收款</div>
                  <div className="revenue-overview-value">
                    {formatMoney2(
                      data.overviewHallTotalReceipts ??
                        roundMoney((data.overviewUserHallRevenue || 0) + (data.overviewStreamerHallRevenue || 0)),
                    )}
                  </div>
                </div>
                <div className="revenue-overview-item revenue-card-hall">
                  <div className="revenue-overview-label">厅盈利</div>
                  <div className="revenue-overview-value">
                    {formatMoney2(
                      data.overviewHallProfit ??
                        roundMoney(
                          (data.overviewUserHallRevenue || 0) +
                            (data.overviewStreamerHallRevenue || 0) -
                            (data.overviewStreamerTotalWage || 0),
                        ),
                    )}
                  </div>
                </div>

                {/* 工会：用户流水总收益归入工会 */}
                {!hideOverviewTotals ? (
                  <>
                    <div className="revenue-overview-item revenue-card-guild">
                      <div className="revenue-overview-label">用户流水总收益</div>
                      <div className="revenue-overview-value">{formatMoney2(data.overviewUserTotalRevenue)}</div>
                    </div>
                    <div className="revenue-overview-item revenue-card-guild">
                      <div className="revenue-overview-label">工会总收款</div>
                      <div className="revenue-overview-value">{formatMoney2(data.overviewGuildReceipts)}</div>
                    </div>
                    <div className="revenue-overview-item revenue-card-guild">
                      <div className="revenue-overview-label">工会收益</div>
                      <div className="revenue-overview-value">{formatMoney2(data.overviewGuildRevenue)}</div>
                    </div>
                    <div className="revenue-overview-item revenue-card-guild">
                      <div className="revenue-overview-label">工会盈利（工会总收款−厅总收款）</div>
                      <div className="revenue-overview-value">{formatMoney2(data.overviewGuildProfit)}</div>
                    </div>
                  </>
                ) : null}

                {/* 未明确归属的用户总流水使用中性色 */}
                <div className="revenue-overview-item revenue-card-neutral">
                  <div className="revenue-overview-label">用户总流水</div>
                  <div className="revenue-overview-value">{formatMoney2(data.overviewUserTotalFlow)}</div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {!err && data && !loading ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">用户流水看板</h2>
            <div className="mine-card revenue-summary">
              <div className="mine-salary-total revenue-user-hero">
                <div className="mine-salary-total-label">用户总流水</div>
                <div className="mine-salary-total-value">
                  {formatMoney2(data?.userTotalFlow ?? 0)}
                </div>
              </div>
              <div className="mine-salary-total revenue-user-hero revenue-user-revenue">
                <div className="mine-salary-total-label">用户流水厅收益</div>
                <div className="mine-salary-total-value">
                  {formatMoney2(data?.overviewUserHallRevenue ?? 0)}
                </div>
              </div>
              {us ? (
                <div className="revenue-kv-grid">
                  <div className="mine-salary-kv">
                    <span className="mine-salary-k">人数</span>
                    <span className="mine-salary-v">{us.personCount}</span>
                  </div>
                  <div className="mine-salary-kv">
                    <span className="mine-salary-k">行数</span>
                    <span className="mine-salary-v">{us.rowCount}</span>
                  </div>
                </div>
              ) : null}
              {us && us.topUsers.length ? (
                <div className="revenue-top">
                  <div className="revenue-top-title">贡献 Top</div>
                  <ul className="revenue-top-list">
                    {us.topUsers.map((u, i) => {
                      const prize = contribTopPrize(data.overviewUserHallRevenue, i)
                      return (
                        <li key={(u.userPlatformId || u.nickname) + '-' + i} className="revenue-top-row">
                          <span className="revenue-top-rank">{i + 1}</span>
                          <span className="revenue-top-name">
                            {u.nickname}
                            {u.userPlatformId ? (
                              <small className="revenue-top-id">{u.userPlatformId}</small>
                            ) : null}
                          </span>
                          <span className="revenue-top-stack">
                            <span className="revenue-top-stack-label">总流水</span>
                            <span className="revenue-top-flow">{formatMoney2(u.totalFlow)}</span>
                            {prize != null ? (
                              <>
                                <span className="revenue-top-stack-label revenue-top-prize-label">奖励</span>
                                <span className="revenue-top-prize">{formatMoney2(prize)}</span>
                              </>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!err && data && !loading ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">主播流水看板</h2>
            <div className="mine-card revenue-summary">
              <div className="mine-salary-total revenue-user-hero">
                <div className="mine-salary-total-label">主播总流水</div>
                <div className="mine-salary-total-value">
                  {formatMoney2(data?.streamerTotalFlow ?? 0)}
                </div>
              </div>
              <div className="mine-salary-total revenue-user-hero revenue-user-revenue">
                <div className="mine-salary-total-label">主播流水厅收益</div>
                <div className="mine-salary-total-value">
                  {formatMoney2(data?.overviewStreamerHallRevenue ?? 0)}
                </div>
              </div>
              <div className="mine-salary-total revenue-user-hero revenue-user-revenue">
                <div className="mine-salary-total-label">总盈利</div>
                <div className="mine-salary-total-value">
                  {formatMoney2(data?.streamerProfit ?? 0)}
                </div>
              </div>
              <div className="revenue-kv-grid">
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">主播总工资</span>
                  <span className="mine-salary-v">{formatMoney2(data?.streamerTotalWage ?? 0)}</span>
                </div>
                {ss ? (
                  <>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">实际流水</span>
                      <span className="mine-salary-v">{formatMoney2(ss.actualFlow)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">主播人数</span>
                      <span className="mine-salary-v">{ss.personCount}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">行数</span>
                      <span className="mine-salary-v">{ss.rowCount}</span>
                    </div>
                  </>
                ) : null}
              </div>
              {ss && ss.topStreamers.length ? (
                <div className="revenue-top">
                  <div className="revenue-top-title">流水 Top</div>
                  <ul className="revenue-top-list">
                    {ss.topStreamers.map((t, i) => (
                      <li key={(t.userPlatformId || t.nickname) + '-' + i} className="revenue-top-row">
                        <span className="revenue-top-rank">{i + 1}</span>
                        <span className="revenue-top-name">
                          {t.nickname}
                          {t.userPlatformId ? (
                            <small className="revenue-top-id">{t.userPlatformId}</small>
                          ) : null}
                        </span>
                        <span className="revenue-top-flow">
                          {formatMoney2(t.totalFlow ?? t.actualFlow)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!err && data && !loading && data.salesRevenue ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">销售收益</h2>
            <div className="mine-card revenue-summary">
              <p className="revenue-shared-hint">
                上个月（{data.salesRevenue.monthLabel}）订单提成金额
              </p>
              <div className="mine-salary-total revenue-user-hero">
                <div className="mine-salary-total-label">上个月所有大哥总订单金额</div>
                <div className="mine-salary-total-value">
                  {formatMoney2(data.salesRevenue.totalRecharge)}
                </div>
              </div>
              {!hideSalesEstimates ? (
                <div className="revenue-kv-grid">
                  <div className="mine-salary-kv">
                    <span className="mine-salary-k">预计总收入</span>
                    <span className="mine-salary-v">
                      {formatMoney2(data.salesRevenue.estimatedTotalIncome)}
                    </span>
                  </div>
                  <div className="mine-salary-kv">
                    <span className="mine-salary-k">预计总支出</span>
                    <span className="mine-salary-v">
                      {formatMoney2(data.salesRevenue.estimatedTotalExpense)}
                    </span>
                  </div>
                </div>
              ) : null}
              {data.salesRevenue.introducers.length ? (
                <div className="revenue-top">
                  <div className="revenue-top-title">介绍人上月总充值</div>
                  <ul className="revenue-top-list">
                    {data.salesRevenue.introducers.map((row, i) => (
                      <li key={row.userId || row.username || String(i)} className="revenue-top-row">
                        <span className="revenue-top-rank">{i + 1}</span>
                        <span className="revenue-top-name">
                          {row.nickname || '—'}
                          {row.username ? (
                            <small className="revenue-top-id">{row.username}</small>
                          ) : null}
                        </span>
                        <span className="revenue-top-stack">
                          <span className="revenue-top-stack-label">上月总充值</span>
                          <span className="revenue-top-flow">
                            {formatMoney2(row.lastMonthRecharge)}
                          </span>
                          <span className="revenue-top-stack-label revenue-top-prize-label">
                            预计收入
                          </span>
                          <span className="revenue-top-prize">
                            {formatMoney2(row.estimatedIncome)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mine-admin-hint">暂无介绍人/大哥数据</p>
              )}
            </div>
          </section>
        ) : null}

        {data && data.batches.length ? (
          <section className="mine-sec">
            <h2 className="mine-sec-title">匹配批次</h2>
            <div className="mine-card">
              <ul className="revenue-batch-list">
                {data.batches.map((b) => (
                  <li key={b.id} className="revenue-batch-row">
                    <div className="revenue-batch-main">
                      <span className="revenue-batch-kind">{b.kind === 'user' ? '用户' : '主播'}</span>
                      <span className="revenue-batch-label">{b.label || b.filename}</span>
                    </div>
                    <div className="revenue-batch-meta">
                      {(b.startDateLabel || b.startDate) && (b.endDateLabel || b.endDate)
                        ? `${b.startDateLabel || b.startDate} ~ ${b.endDateLabel || b.endDate}`
                        : null}
                      {` · ${b.rowCount} 行`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </PullToRefresh>
    </div>
  )
}
