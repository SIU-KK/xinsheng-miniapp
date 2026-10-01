import { useCallback, useEffect, useState } from 'react'
import { PullToRefresh } from './uxGestures'
import {
  confirmMySalary,
  fetchMySalary,
  toUserError,
  type MySalaryPeriod,
  type MySalaryResponse,
} from './api'
import { formatMoney2 } from './liushuiWage'
import { downloadSalaryShareImage } from './salaryShareImage'

function formatHours(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return String(n)
}

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return String(Math.round(n))
}

function formatFlow(row: MySalaryResponse['row']): string {
  if (!row) return '—'
  if (row.totalFlowText) return row.totalFlowText
  return formatMoney2(row.totalFlow)
}

function rangeText(range: MySalaryResponse['range']): string {
  if (!range) return ''
  const start = range.startDateLabel || range.startDate
  const end = range.endDateLabel || range.endDate
  if (start && end) return `${start} ~ ${end}`
  return start || end || ''
}

function formatConfirmedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function MySalaryPage({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<MySalaryPeriod>('last')
  const [data, setData] = useState<MySalaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmErr, setConfirmErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setConfirmErr(null)
    setSaveErr(null)
    try {
      const out = await fetchMySalary(period)
      setData(out)
    } catch (e) {
      setData(null)
      setErr(toUserError(e, '加载失败，请重试'))
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  async function onConfirmSalary() {
    if (!data?.row || data.rowMissing || data.confirmed || confirming) return
    setConfirming(true)
    setConfirmErr(null)
    try {
      const out = await confirmMySalary(period)
      setData((prev) =>
        prev
          ? {
              ...prev,
              confirmed: true,
              confirmedAt: out.confirmedAt,
              batchId: out.batchId || prev.batchId,
            }
          : prev,
      )
    } catch (e) {
      setConfirmErr(toUserError(e, '确认失败，请重试'))
    } finally {
      setConfirming(false)
    }
  }

  async function onSaveImage() {
    if (!data?.row || !data.confirmed || saving) return
    const nickname = (data.me?.nickname || '').trim() || '—'
    const label = rangeText(data.range)
    setSaving(true)
    setSaveErr(null)
    try {
      await downloadSalaryShareImage({
        rangeLabel: label || '—',
        nickname,
        totalWage: data.row.totalWage,
        payQrUrl: data.me?.payQrUrl ?? null,
      })
    } catch (e) {
      setSaveErr(toUserError(e, '保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  const me = data?.me
  const linkedLabel =
    me && me.linkedIds.length ? me.linkedIds.join('、') : '—'
  const rangeLabel = rangeText(data?.range ?? null)
  const showConfirm = !!(data && data.row && !data.rowMissing)
  const canSave = !!(data && data.row && !data.rowMissing && data.confirmed)
  const showSaveSlot = !!(data && data.row && !data.rowMissing)

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">我的工资</div>
        <span className="nav-side" />
      </div>
      <PullToRefresh className="mine-scroll mine-doc" onRefresh={load}>
        <section className="mine-sec">
          <h2 className="mine-sec-title">我的</h2>
          <div className="mine-card mine-salary-profile">
            {loading && !data ? (
              <p className="mine-admin-hint">加载中…</p>
            ) : err && !data ? (
              <p className="mine-admin-hint">{err}</p>
            ) : (
              <>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">昵称</span>
                  <span className="mine-salary-v">{me?.nickname || '—'}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">ID</span>
                  <span className="mine-salary-v">{me?.streamerId || '—'}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">我关联的ID</span>
                  <span className="mine-salary-v">{linkedLabel}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">我的总麦序</span>
                  <span className="mine-salary-v">
                    {me?.myTotalMicHours != null && Number.isFinite(me.myTotalMicHours)
                      ? formatHours(me.myTotalMicHours)
                      : '—'}
                  </span>
                </div>
                <p className="mine-admin-hint" style={{ marginTop: -4 }}>
                  本周麦序时长 + 本周主持时长
                </p>
                <div className="mine-salary-intro">
                  <div className="mine-salary-k">我介绍的主播</div>
                  {me && me.introduced.length ? (
                    <>
                      <ul className="mine-salary-intro-list">
                        {me.introduced.map((u) => {
                          const flow =
                            u.totalFlowYuan != null &&
                            Number.isFinite(u.totalFlowYuan)
                              ? `首月总流水 ${formatMoney2(u.totalFlowYuan)} 元`
                              : '暂无首月流水'
                          const theirMic =
                            u.firstMonthMicHours != null &&
                            Number.isFinite(u.firstMonthMicHours)
                              ? `首月总麦序 ${formatHours(u.firstMonthMicHours)}`
                              : '暂无首月麦序'
                          return (
                            <li key={u.id}>
                              <div className="mine-salary-intro-main">
                                <span className="mine-salary-intro-nick">
                                  {u.nickname || '—'}
                                </span>
                                <span className="mine-salary-intro-id">ID {u.id}</span>
                              </div>
                              <div className="mine-salary-intro-meta">
                                <span className="mine-salary-intro-tenure">
                                  入职 {Math.max(0, Math.floor(u.tenureDays || 0))} 天
                                </span>
                                <span className="mine-salary-intro-flow">{flow}</span>
                                <span className="mine-salary-intro-flow">{theirMic}</span>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="mine-admin-hint">暂无</p>
                  )}
                </div>
                <div className="mine-salary-intro">
                  <div className="mine-salary-k">我的大哥</div>
                  {me && me.myDage.length ? (
                    <ul className="mine-salary-intro-list">
                      {me.myDage.map((d) => (
                        <li key={d.id}>
                          <div className="mine-salary-intro-main">
                            <span className="mine-salary-intro-nick">
                              {d.nickname || '—'}
                            </span>
                            <span className="mine-salary-intro-id">ID {d.id}</span>
                          </div>
                          <div className="mine-salary-intro-meta">
                            <span className="mine-salary-intro-flow">
                              上个月充值金额 {formatMoney2(d.lastMonthCumulative)} 元
                              {typeof d.cumulativeAmount === 'number' &&
                              Number.isFinite(d.cumulativeAmount) &&
                              d.cumulativeAmount > 0 ? (
                                <span className="mine-admin-assoc-hint">
                                  {' '}
                                  （累计金额 {formatMoney2(d.cumulativeAmount)}，仅展示）
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mine-admin-hint">暂无</p>
                  )}
                  <div className="mine-salary-intro-my-total mine-salary-dage-est">
                    <span className="mine-salary-k">预计上月用户提成</span>
                    <span className="mine-salary-v">
                      {formatMoney2(me?.estimatedLastMonthUserCommission ?? 0)} 元
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="mine-sec">
          <div className="mine-salary-period" role="tablist" aria-label="工资周期">
            <button
              type="button"
              role="tab"
              aria-selected={period === 'last'}
              className={`mine-salary-period-btn${period === 'last' ? ' active' : ''}`}
              onClick={() => setPeriod('last')}
            >
              上周工资
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'prev'}
              className={`mine-salary-period-btn${period === 'prev' ? ' active' : ''}`}
              onClick={() => setPeriod('prev')}
            >
              上上周工资
            </button>
          </div>
          {rangeLabel ? (
            <p className="mine-salary-range">{rangeLabel}</p>
          ) : null}
        </section>

        <section className="mine-sec">
          {loading ? (
            <div className="mine-card mine-card-plain">加载中…</div>
          ) : err ? (
            <div className="mine-card mine-card-plain">{err}</div>
          ) : !data?.batchId || !data.range ? (
            <div className="mine-card mine-card-plain">暂无该周流水</div>
          ) : data.rowMissing || !data.row ? (
            <div className="mine-card mine-salary-nums">
              <p className="mine-admin-hint">本周流水中没有你的记录</p>
              <div className="mine-salary-extras">
                <div className="mine-salary-extra-title">
                  {period === 'prev' ? '上上周活跃度' : '上周活跃度'}
                </div>
                {data.activity ? (
                  <div className="mine-salary-grid">
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">人数</span>
                      <span className="mine-salary-v">{formatCount(data.activity.greetPeople)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">数量</span>
                      <span className="mine-salary-v">{formatCount(data.activity.greetMsgs)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">有效作业</span>
                      <span className="mine-salary-v">{formatCount(data.activity.strangerGreetPeople)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">有效回复</span>
                      <span className="mine-salary-v">{formatCount(data.activity.strangerReplyPeople)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">动态广场数</span>
                      <span className="mine-salary-v">{formatCount(data.activity.plazaPosts)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mine-admin-hint">暂无该周活跃度</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mine-card mine-salary-nums">
              <div className="mine-salary-total">
                <div className="mine-salary-total-label">我的总工资</div>
                <div className="mine-salary-total-value">{formatMoney2(data.row.totalWage)}</div>
              </div>
              {data.wageSource === 'hall_revenue' ? (
              <div className="mine-salary-grid">
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">{`${data.hallNo || ''}用户总流水`}</span>
                  <span className="mine-salary-v">{formatMoney2(data.hallUserFlow ?? null)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">{`${data.hallNo || ''}主持总流水`}</span>
                  <span className="mine-salary-v">{formatMoney2(data.hallStreamerFlow ?? null)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">{`${data.hallNo || ''}主持总工资`}</span>
                  <span className="mine-salary-v">{formatMoney2(data.hallStreamerWageTotal ?? null)}</span>
                </div>
              </div>
              ) : (
              <div className="mine-salary-grid">
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">实际流水</span>
                  <span className="mine-salary-v">{formatMoney2(data.row.actualFlow)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">总流水</span>
                  <span className="mine-salary-v">{formatFlow(data.row)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">添加流水</span>
                  <span className="mine-salary-v">{formatMoney2(data.row.addFlow)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">扣除流水</span>
                  <span className="mine-salary-v">{formatMoney2(data.row.deductFlow)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">主持时长</span>
                  <span className="mine-salary-v">{formatHours(data.row.hostHours)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">麦序时长</span>
                  <span className="mine-salary-v">{formatHours(data.row.micHours)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">奖励</span>
                  <span className="mine-salary-v">{formatMoney2(data.row.rewardYuan)}</span>
                </div>
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">罚款</span>
                  <span className="mine-salary-v">{formatMoney2(data.row.fineYuan)}</span>
                </div>
              </div>
              )}


              <div className="mine-salary-extras">
                <div className="mine-salary-extra-title">
                  {period === 'prev' ? '上上周活跃度' : '上周活跃度'}
                </div>
                {data.activity ? (
                  <div className="mine-salary-grid">
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">人数</span>
                      <span className="mine-salary-v">{formatCount(data.activity.greetPeople)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">数量</span>
                      <span className="mine-salary-v">{formatCount(data.activity.greetMsgs)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">有效作业</span>
                      <span className="mine-salary-v">{formatCount(data.activity.strangerGreetPeople)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">有效回复</span>
                      <span className="mine-salary-v">{formatCount(data.activity.strangerReplyPeople)}</span>
                    </div>
                    <div className="mine-salary-kv">
                      <span className="mine-salary-k">动态广场数</span>
                      <span className="mine-salary-v">{formatCount(data.activity.plazaPosts)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mine-admin-hint">暂无该周活跃度</p>
                )}
              </div>

              <div className="mine-salary-grid mine-salary-wage-extra">
                <div className="mine-salary-kv">
                  <span className="mine-salary-k">
                    {period === 'prev' ? '上上周基础工资' : '上周基础工资'}
                  </span>
                  <span className="mine-salary-v">{formatMoney2(data.row.baseWage)}</span>
                </div>
                {data.guildSubsidy != null && data.guildSubsidy > 0 ? (
                  <div className="mine-salary-kv">
                    <span className="mine-salary-k">
                      {period === 'prev' ? '上上周工会补贴' : '上周工会补贴'}
                    </span>
                    <span className="mine-salary-v">{formatMoney2(data.guildSubsidy)}</span>
                  </div>
                ) : null}
              </div>

              <div className="mine-salary-qr">
                <div className="mine-salary-qr-label">收款码</div>
                {me?.payQrUrl ? (
                  <div className="mine-salary-qr-wrap">
                    <img
                      src={me.payQrUrl}
                      alt="收款码"
                      className="mine-salary-qr-img"
                    />
                  </div>
                ) : (
                  <p className="mine-salary-qr-hint">
                    暂无收款码，请先在添加资料上传
                  </p>
                )}
              </div>

              {showConfirm ? (
                <div className="mine-salary-confirm">
                  {data.confirmed ? (
                    <>
                      <button
                        type="button"
                        className="mine-salary-confirm-btn confirmed"
                        disabled
                      >
                        已确认
                      </button>
                      {data.confirmedAt ? (
                        <p className="mine-salary-confirm-time">
                          确认时间 {formatConfirmedAt(data.confirmedAt)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="mine-salary-confirm-btn primary"
                        disabled={confirming}
                        onClick={onConfirmSalary}
                      >
                        {confirming ? '确认中…' : '确认工资无误'}
                      </button>
                      {confirmErr ? (
                        <p className="mine-salary-confirm-err">{confirmErr}</p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {showSaveSlot ? (
                <div className="mine-salary-save">
                  <button
                    type="button"
                    className="mine-salary-save-btn"
                    disabled={!canSave || saving}
                    onClick={onSaveImage}
                  >
                    {saving ? '生成中…' : '保存图片'}
                  </button>
                  {!canSave ? (
                    <p className="mine-salary-save-hint">
                      请先确认工资无误后再保存图片
                    </p>
                  ) : !me?.payQrUrl ? (
                    <p className="mine-salary-save-hint">
                      未上传收款码时，图片中将显示「暂无收款码」
                    </p>
                  ) : null}
                  {saveErr ? (
                    <p className="mine-salary-confirm-err">{saveErr}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </PullToRefresh>
    </div>
  )
}
