import { useCallback, useEffect, useMemo, useState } from 'react'
import { PullToRefresh } from './uxGestures'
import {
  fetchLastWeekRankings,
  fetchEffectiveJobRankings,
  toUserError,
  type LastWeekRankingRow,
  type LastWeekRankingsResponse,
  type EffectiveJobRankingRow,
  type EffectiveJobRankingsResponse,
} from './api'
import { formatMoney2 } from './liushuiWage'

type RankTab = 'mic' | 'charm' | 'job'

function formatHours(n: number): string {
  if (!Number.isFinite(n)) return '0小时'
  const rounded = Math.round(n * 10) / 10
  const num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${num}小时`
}

function rangeHint(
  data: {
    range: {
      startDateLabel?: string
      startDate?: string
      endDateLabel?: string
      endDate?: string
    } | null
  } | null,
  emptyLabel = '上一周数据',
): string {
  if (!data?.range) return emptyLabel
  const start = data.range.startDateLabel || data.range.startDate
  const end = data.range.endDateLabel || data.range.endDate
  if (start && end) return `${emptyLabel} · ${start} ~ ${end}`
  if (start || end) return `${emptyLabel} · ${start || end}`
  return emptyLabel
}

function sortMic(rows: LastWeekRankingRow[]): LastWeekRankingRow[] {
  return [...rows]
    .sort((a, b) => {
      const ah = (a.hostHours ?? 0) + (a.micHours ?? 0)
      const bh = (b.hostHours ?? 0) + (b.micHours ?? 0)
      if (bh !== ah) return bh - ah
      const af = a.totalFlow ?? -Infinity
      const bf = b.totalFlow ?? -Infinity
      if (bf !== af) return bf - af
      return a.userPlatformId.localeCompare(b.userPlatformId)
    })
    .map((r, i) => ({ ...r, rank: i + 1, totalHours: (r.hostHours ?? 0) + (r.micHours ?? 0) }))
}

function sortCharm(rows: LastWeekRankingRow[]): LastWeekRankingRow[] {
  // persist marks admin, 全满, and 大哥 accounts so they stay out of 魅力榜.
  return rows
    .filter((row) => !row.excludeFromCharm)
    .sort((a, b) => {
      const af = a.totalFlow ?? -Infinity
      const bf = b.totalFlow ?? -Infinity
      if (bf !== af) return bf - af
      const ah = (a.hostHours ?? 0) + (a.micHours ?? 0)
      const bh = (b.hostHours ?? 0) + (b.micHours ?? 0)
      if (bh !== ah) return bh - ah
      return a.userPlatformId.localeCompare(b.userPlatformId)
    })
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

function sortEffectiveJob(rows: EffectiveJobRankingRow[]): EffectiveJobRankingRow[] {
  return [...rows]
    .sort((a, b) => {
      if (b.strangerGreetPeople !== a.strangerGreetPeople) {
        return b.strangerGreetPeople - a.strangerGreetPeople
      }
      if (b.greetPeople !== a.greetPeople) return b.greetPeople - a.greetPeople
      return a.streamerId.localeCompare(b.streamerId, 'zh')
    })
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

function metricValue(tab: RankTab, r: LastWeekRankingRow | EffectiveJobRankingRow): string {
  if (tab === 'mic') {
    const row = r as LastWeekRankingRow
    return formatHours(row.totalHours)
  }
  if (tab === 'job') {
    const row = r as EffectiveJobRankingRow
    return `${row.strangerGreetPeople}人`
  }
  const row = r as LastWeekRankingRow
  return row.totalFlow != null ? formatMoney2(row.totalFlow) : '—'
}

function rowId(r: LastWeekRankingRow | EffectiveJobRankingRow): string {
  if ('userPlatformId' in r) return r.userPlatformId || ''
  return r.streamerId || ''
}

function monogram(name: string): string {
  const t = (name || '').trim()
  if (!t || t === '—') return '?'
  return Array.from(t)[0] ?? '?'
}

function podiumTone(rank: number): string {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return ''
}

function EffectiveJobList({ rows }: { rows: EffectiveJobRankingRow[] }) {
  const metrics = [
    { key: 'greetPeople', label: '人数', value: (row: EffectiveJobRankingRow) => row.greetPeople },
    { key: 'greetMsgs', label: '数量', value: (row: EffectiveJobRankingRow) => row.greetMsgs },
    { key: 'strangerGreetPeople', label: '有效作业', value: (row: EffectiveJobRankingRow) => row.strangerGreetPeople },
    { key: 'strangerReplyPeople', label: '有效回复', value: (row: EffectiveJobRankingRow) => row.strangerReplyPeople },
    { key: 'plazaPosts', label: '动态数', value: (row: EffectiveJobRankingRow) => row.plazaPosts },
  ] as const

  return (
    <ol className="rank-job-list" aria-label="有效作业排行榜">
      {rows.map((row) => {
        const nick = row.nickname || '—'
        return (
          <li key={`${row.streamerId}-${row.rank}`} className="rank-job-row">
            <span className="rank-job-num">{row.rank}</span>
            <span className="rank-job-avatar" aria-hidden="true">
              {monogram(nick)}
            </span>
            <div className="rank-job-content">
              <div className="rank-job-identity">
                <span className="rank-job-nick" title={nick}>{nick}</span>
                <span className="rank-job-id" title={row.streamerId || '—'}>{row.streamerId || '—'}</span>
              </div>
              <div className="rank-job-metrics">
                {metrics.map((metric) => (
                  <div key={metric.key} className={metric.key === 'strangerGreetPeople' ? 'rank-job-metric effective' : 'rank-job-metric'}>
                    <span className="rank-job-metric-label">{metric.label}</span>
                    <span className="rank-job-metric-value">{metric.value(row)}</span>
                  </div>
                ))}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function PodiumSlot({
  row,
  tab,
  place,
}: {
  row: LastWeekRankingRow | EffectiveJobRankingRow | undefined
  tab: RankTab
  place: 1 | 2 | 3
}) {
  const tone = podiumTone(place)
  if (!row) {
    return (
      <div className={`rank-podium-slot place-${place} tone-${tone} is-empty`} aria-hidden="true">
        <div className="rank-podium-card">
          <div className="rank-podium-avatar empty">
            <span className="rank-podium-mono">—</span>
            <span className={`rank-podium-badge tone-${tone}`}>{place}</span>
          </div>
          <span className="rank-podium-nick muted">虚位以待</span>
          <span className="rank-podium-id">&nbsp;</span>
        </div>
        <div className={`rank-podium-base tone-${tone}`}>
          <span className="rank-podium-value muted">—</span>
        </div>
      </div>
    )
  }

  const nick = row.nickname || '—'
  return (
    <div className={`rank-podium-slot place-${place} tone-${tone}`}>
      <div className="rank-podium-card">
        <div className="rank-podium-avatar">
          <span className="rank-podium-mono">{monogram(nick)}</span>
          <span className={`rank-podium-badge tone-${tone}`}>{place}</span>
        </div>
        <span className="rank-podium-nick" title={nick}>
          {nick}
        </span>
        <span className="rank-podium-id">{rowId(row) || '—'}</span>
      </div>
      <div className={`rank-podium-base tone-${tone}`}>
        <span className="rank-podium-value">{metricValue(tab, row)}</span>
      </div>
    </div>
  )
}

export function RankingsPage() {
  const [tab, setTab] = useState<RankTab>('mic')
  const [data, setData] = useState<LastWeekRankingsResponse | null>(null)
  const [jobData, setJobData] = useState<EffectiveJobRankingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [out, jobOut] = await Promise.all([fetchLastWeekRankings(), fetchEffectiveJobRankings()])
      setData(out)
      setJobData(jobOut)
    } catch (e) {
      setData(null)
      setJobData(null)
      setErr(toUserError(e, '加载失败，请重试'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const effectiveJobRows = useMemo(() => sortEffectiveJob(jobData?.rows ?? []), [jobData])

  const list = useMemo(() => {
    if (tab === 'job') return effectiveJobRows
    const rows = data?.rows ?? []
    return tab === 'mic' ? sortMic(rows) : sortCharm(rows)
  }, [data, effectiveJobRows, tab])

  const top1 = list[0] as (LastWeekRankingRow | EffectiveJobRankingRow) | undefined
  const top2 = list[1] as (LastWeekRankingRow | EffectiveJobRankingRow) | undefined
  const top3 = list[2] as (LastWeekRankingRow | EffectiveJobRankingRow) | undefined
  const rest = list.slice(3) as Array<LastWeekRankingRow | EffectiveJobRankingRow>
  const showPodium = tab !== 'job' && list.length > 0
  const podiumPlaces: Array<1 | 2 | 3> =
    list.length >= 3 ? [2, 1, 3] : list.length === 2 ? [2, 1] : list.length === 1 ? [1] : []

  const subtitle =
    tab === 'job' ? rangeHint(jobData, '上周有效作业') : rangeHint(data, '上一周数据')
  const emptyTitle = tab === 'job' ? '暂无有效作业排名' : '暂无上周排名数据'
  const emptyHint =
    tab === 'job' ? '等待活跃度数据上传后显示' : '等待主播流水上传后显示'

  return (
    <div className="pane rank-pane">
      <div className="nav rank-nav">
        <span className="nav-side" />
        <div className="title rank-title">
          <span className="rank-title-text">工会主播排名</span>
          <span className="rank-title-accent" aria-hidden="true" />
          <small className="rank-subtitle">{subtitle}</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="rank-seg" role="tablist" aria-label="榜单">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mic'}
          className={'rank-seg-btn' + (tab === 'mic' ? ' active' : '')}
          onClick={() => setTab('mic')}
        >
          麦序榜
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'charm'}
          className={'rank-seg-btn' + (tab === 'charm' ? ' active' : '')}
          onClick={() => setTab('charm')}
        >
          魅力榜
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'job'}
          className={'rank-seg-btn' + (tab === 'job' ? ' active' : '')}
          onClick={() => setTab('job')}
        >
          有效作业榜
        </button>
      </div>
      <PullToRefresh className="scroll rank-scroll" onRefresh={load}>
        {loading ? <p className="empty rank-loading">加载中…</p> : null}
        {err ? <p className="err rank-err">{err}</p> : null}
        {!loading && !err && list.length === 0 ? (
          <div className="rank-empty">
            <div className="rank-empty-icon" aria-hidden="true">
              ◆
            </div>
            <p className="rank-empty-title">{emptyTitle}</p>
            <p className="rank-empty-hint">{emptyHint}</p>
          </div>
        ) : null}
        {!loading && !err && tab === 'job' && list.length > 0 ? (
          <EffectiveJobList rows={effectiveJobRows} />
        ) : null}
        {!loading && !err && showPodium ? (
          <>
            <div
              className={
                'rank-podium' +
                (list.length === 1 ? ' solo' : '') +
                (list.length === 2 ? ' duo' : '')
              }
            >
              {list.length >= 3 ? (
                <>
                  <PodiumSlot row={top2} tab={tab} place={2} />
                  <PodiumSlot row={top1} tab={tab} place={1} />
                  <PodiumSlot row={top3} tab={tab} place={3} />
                </>
              ) : (
                podiumPlaces.map((place) => (
                  <PodiumSlot
                    key={place}
                    row={place === 1 ? top1 : place === 2 ? top2 : top3}
                    tab={tab}
                    place={place}
                  />
                ))
              )}
            </div>
            {rest.length > 0 ? (
              <ol className="rank-list">
                {rest.map((r) => {
                  const nick = r.nickname || '—'
                  const id = rowId(r)
                  return (
                    <li key={`${id}-${r.rank}`} className="rank-row">
                      <span className="rank-row-num">{r.rank}</span>
                      <span className="rank-row-avatar" aria-hidden="true">
                        {monogram(nick)}
                      </span>
                      <div className="rank-row-meta">
                        <span className="rank-row-nick" title={nick}>
                          {nick}
                        </span>
                        <span className="rank-row-id">{id || '—'}</span>
                      </div>
                      <span className="rank-row-value">{metricValue(tab, r)}</span>
                    </li>
                  )
                })}
              </ol>
            ) : null}
          </>
        ) : null}
      </PullToRefresh>
    </div>
  )
}
