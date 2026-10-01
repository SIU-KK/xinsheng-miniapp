import { useCallback, useEffect, useMemo, useState } from 'react'
import { PullToRefresh, useBackHandler } from './uxGestures'
import { fetchStreamerProfiles, type StreamerProfile } from './api'
import { assignProfileSlugs, isReservedSlug } from './pinyinSlug'

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="sp-search-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

/** a.586248.xyz → clean `/<slug>`; local verify → `/wall/<slug>` (also accepts `/p/<slug>`). */
export function isHostWallDomain(): boolean {
  if (typeof window === 'undefined') return false
  return (window.location.hostname || '').toLowerCase() === 'a.586248.xyz'
}

export function wallListHref(): string {
  return isHostWallDomain() ? '/' : '/wall'
}

function compactSlug(slug: string): string {
  return (slug || '').toLowerCase().replace(/-/g, '')
}

export function wallProfileHref(slug: string): string {
  const s = compactSlug(slug)
  if (!s) return wallListHref()
  return isHostWallDomain() ? `/${s}` : `/wall/${s}`
}

/** Canonical share URL for a profile, independent of the local wall alias. */
export function wallProfileUrl(slug: string): string {
  const s = compactSlug(slug)
  if (!s || typeof window === 'undefined') return s ? `/${s}` : ''
  return `${window.location.origin}/${s}`
}

export type WallRoute = { kind: 'list' } | { kind: 'profile'; slug: string }

export function parseWallRoute(pathname: string): WallRoute {
  const parts = (pathname || '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => p.toLowerCase())

  if (parts.length === 0) return { kind: 'list' }

  // /p/<slug> alias (any host)
  if (parts[0] === 'p' && parts[1] && !isReservedSlug(parts[1])) {
    return { kind: 'profile', slug: parts[1] }
  }

  // /wall or /wall/<slug> (local + alias on host wall)
  if (parts[0] === 'wall') {
    if (!parts[1]) return { kind: 'list' }
    if (!isReservedSlug(parts[1])) return { kind: 'profile', slug: parts[1] }
    return { kind: 'list' }
  }

  // a.586248.xyz clean path: /<slug>
  if (parts.length === 1 && isHostWallDomain() && !isReservedSlug(parts[0])) {
    return { kind: 'profile', slug: parts[0] }
  }

  return { kind: 'list' }
}

function ensureSlugs(list: StreamerProfile[]): StreamerProfile[] {
  // Always derive compact slugs locally so older hyphenated API values are upgraded.
  const map = assignProfileSlugs(list)
  return list.map((p) => ({ ...p, slug: map.get(p.id) || '' }))
}

export function StreamerCard({
  profile,
  href,
  onOpen,
}: {
  profile: StreamerProfile
  href: string
  onOpen?: () => void
}) {
  const cover = profile.photos[0]?.url
  return (
    <a
      className="sp-card"
      href={href}
      aria-label={`查看${profile.name || '主播'}资料`}
      onClick={(e) => {
        if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        onOpen()
      }}
    >
      <div className="sp-cover" style={cover ? { backgroundImage: `url(${JSON.stringify(cover)})` } : undefined}>
        <div className="sp-cover-grad" />
        <span className="sp-live">直播</span>
        <div className="sp-mid">
          <div className="sp-mid-text">
            <div className="sp-name">{profile.name || '主播'}</div>
            <div className="sp-hall">厅号 {profile.hallNo || '—'}</div>
          </div>
          <div className="sp-region">
            <PinIcon />
            <span>{profile.region || '—'}</span>
          </div>
        </div>
      </div>
      <div className="sp-meta">
        <div className="sp-social">直播时间 {profile.liveTime || '—'}</div>
        <div className="sp-meta-row">
          <span className="sp-id-pill">
            <span className="sp-id-tag">ID</span>
            {profile.streamerId || '—'}
          </span>
        </div>
      </div>
    </a>
  )
}

/** Shared 资料卡 body (photos + fields; never payment QR). */
export function StreamerProfileCardBody({ profile }: { profile: StreamerProfile }) {
  const [selectedPhoto, setSelectedPhoto] = useState(profile.photos[0]?.url || '')

  useEffect(() => {
    setSelectedPhoto(profile.photos[0]?.url || '')
  }, [profile.id, profile.photos])

  return (
    <div className="sp-detail-body">
      {profile.photos.length > 0 ? (
        <div className="sp-gallery">
          <img
            className="sp-gallery-main"
            src={selectedPhoto || profile.photos[0].url}
            alt={`${profile.name || '主播'}照片`}
          />
          {profile.photos.length > 1 ? (
            <div className="sp-gallery-thumbs">
              {profile.photos.map((photo) => (
                <button
                  type="button"
                  key={photo.id}
                  className={`sp-thumb${(selectedPhoto || profile.photos[0].url) === photo.url ? ' on' : ''}`}
                  onClick={() => setSelectedPhoto(photo.url)}
                  aria-label="查看照片"
                >
                  <img src={photo.url} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <dl className="sp-fields">
        <div>
          <dt>厅号</dt>
          <dd>{profile.hallNo || '—'}</dd>
        </div>
        <div>
          <dt>主播</dt>
          <dd>{profile.name || '—'}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd>{profile.streamerId || '—'}</dd>
        </div>
        <div>
          <dt>直播时间</dt>
          <dd>{profile.liveTime || '—'}</dd>
        </div>
        <div>
          <dt>地区</dt>
          <dd>{profile.region || '—'}</dd>
        </div>
        <div>
          <dt>身高</dt>
          <dd>{profile.height || '—'}</dd>
        </div>
        <div>
          <dt>体重</dt>
          <dd>{profile.weight || '—'}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{profile.type || '—'}</dd>
        </div>
        <div className="sp-fields-full">
          <dt>技能</dt>
          <dd>{profile.skills || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

function StreamerProfileModal({
  profile,
  slug,
  loading,
  onClose,
}: {
  profile: StreamerProfile | null
  slug: string
  loading: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  useBackHandler(onClose)

  function copyProfileUrl() {
    if (!profile) return
    const url = wallProfileUrl(profile.slug || slug)
    const done = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
    const fallbackCopy = () => {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
      } finally {
        textarea.remove()
      }
    }
    const clipboard = navigator.clipboard
    if (clipboard?.writeText) {
      void clipboard.writeText(url).then(done, () => {
        fallbackCopy()
        done()
      })
    } else {
      fallbackCopy()
      done()
    }
  }

  return (
    <div className="sheet-mask sp-profile-mask" onClick={onClose} role="presentation">
      <div
        className="sheet sp-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${profile?.name || '主播'}资料卡`}
      >
        <div className="sheet-head sp-detail-head">
          <strong>{profile?.name || '主播'} · 资料卡</strong>
          <div className="sp-detail-actions">
            {profile ? (
              <button type="button" className="sp-copy-link" onClick={copyProfileUrl}>
                {copied ? '已复制' : '复制链接'}
              </button>
            ) : null}
            <button type="button" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="sheet-body">
          {loading ? (
            <p className="empty">加载中…</p>
          ) : !profile ? (
            <div className="empty-box">
              <p>未找到主播</p>
              <p className="muted">资料已下架或链接无效</p>
              <button type="button" className="linkish" onClick={onClose}>
                返回主播墙
              </button>
            </div>
          ) : (
            <StreamerProfileCardBody profile={profile} />
          )}
        </div>
      </div>
    </div>
  )
}

function WallList({
  profiles,
  loading,
  err,
  onOpenProfile,
  onRefresh,
}: {
  profiles: StreamerProfile[]
  loading: boolean
  err: string
  onOpenProfile?: (profile: StreamerProfile) => void
  onRefresh?: () => void | Promise<void>
}) {
  const [search, setSearch] = useState('')
  const searchTerm = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!searchTerm) return profiles
    return profiles.filter((profile) =>
      [profile.region, profile.skills].some((field) => field.toLowerCase().includes(searchTerm)),
    )
  }, [profiles, searchTerm])

  const clearSearch = () => setSearch('')

  return (
    <div className="pane">
      <div className="nav">
        <span className="nav-side" />
        <div className="title">
          主播
          <small>资料墙</small>
        </div>
        <span className="nav-side" />
      </div>
      <PullToRefresh
        className="scroll sp-list-scroll"
        onRefresh={onRefresh || (async () => {})}
        disabled={!onRefresh}
      >
        <div className="sp-wall-tools" role="search" aria-label="搜索主播资料">
          <div className="sp-search">
            <SearchIcon />
            <input
              id="sp-wall-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索地区或技能"
              aria-label="搜索地区或技能"
              autoComplete="off"
            />
            {search ? (
              <button type="button" className="sp-search-clear" onClick={clearSearch} aria-label="清除搜索">
                ×
              </button>
            ) : null}
          </div>
          {!loading && !err ? (
            <div className="sp-search-hint">
              <span>按地区或技能模糊查找</span>
              <span className="sp-search-count">{searchTerm ? `匹配 ${filtered.length} 位` : `共 ${profiles.length} 位`}</span>
            </div>
          ) : null}
        </div>
        {loading ? <p className="empty">加载中…</p> : null}
        {err ? (
          <p className="err" style={{ padding: '12px 16px' }}>
            {err}
          </p>
        ) : null}
        {!loading && !err && filtered.length === 0 ? (
          <div className="empty-box">
            <p>{searchTerm ? '未找到匹配主播' : '暂无主播资料'}</p>
            <p className="muted">{searchTerm ? '试试其他地区或技能关键词' : '登录后在「我的 → 添加资料」发布'}</p>
            {searchTerm ? (
              <button type="button" className="linkish" onClick={clearSearch}>
                清除搜索
              </button>
            ) : null}
          </div>
        ) : null}
        {filtered.length > 0 ? (
          <div className="sp-grid">
            {filtered.map((p) => (
              <StreamerCard
                key={p.id}
                profile={p}
                href={wallProfileHref(p.slug || '')}
                onOpen={onOpenProfile ? () => onOpenProfile(p) : undefined}
              />
            ))}
          </div>
        ) : null}
      </PullToRefresh>
    </div>
  )
}

export function StreamerProfilesPage() {
  const [profiles, setProfiles] = useState<StreamerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [path, setPath] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'))

  const syncPath = useCallback(() => {
    setPath(window.location.pathname || '/')
  }, [])

  useEffect(() => {
    const onPop = () => syncPath()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [syncPath])

  // Intercept same-origin wall links for SPA navigation (keep shareable real hrefs).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const t = e.target
      if (!(t instanceof Element)) return
      const a = t.closest('a')
      if (!a || a.target === '_blank' || a.download) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('//')) return
      const url = new URL(href, window.location.origin)
      if (url.origin !== window.location.origin) return
      const route = parseWallRoute(url.pathname)
      const listHref = wallListHref()
      const isWallNav =
        url.pathname === listHref ||
        url.pathname === '/' ||
        route.kind === 'profile' ||
        url.pathname.startsWith('/wall') ||
        url.pathname.startsWith('/p/')
      if (!isWallNav) return
      e.preventDefault()
      if (url.pathname !== window.location.pathname) {
        window.history.pushState({ wallNav: true }, '', url.pathname + url.search)
      }
      syncPath()
      window.scrollTo(0, 0)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [syncPath])

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const list = await fetchStreamerProfiles()
      setProfiles(ensureSlugs(list))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const route = useMemo(() => parseWallRoute(path), [path])

  function goList() {
    const href = wallListHref()
    if (window.location.pathname === href) {
      syncPath()
      return
    }
    // Profile opened via pushState → history.back (popstate syncs). Direct /p/* landings use replace.
    const st = window.history.state as { wallNav?: boolean } | null
    if (st && st.wallNav) {
      window.history.back()
      return
    }
    window.history.replaceState({}, '', href)
    syncPath()
  }

  function openProfile(profile: StreamerProfile) {
    const href = wallProfileHref(profile.slug || '')
    if (window.location.pathname !== href) {
      window.history.pushState({ wallNav: true }, '', href)
    }
    syncPath()
  }

  const profile =
    route.kind === 'profile'
      ? profiles.find((p) => {
          return compactSlug(p.slug || '') === compactSlug(route.slug)
        }) || null
      : null

  return (
    <>
      <WallList profiles={profiles} loading={loading} err={err} onOpenProfile={openProfile} onRefresh={load} />
      {route.kind === 'profile' ? (
        <StreamerProfileModal profile={err ? null : profile} slug={route.slug} loading={loading} onClose={goList} />
      ) : null}
    </>
  )
}
