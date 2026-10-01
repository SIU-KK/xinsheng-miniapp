/**
 * Global mobile UX: left-edge swipe-back + pull-to-refresh.
 * Back handlers stack by depth so sheets/modals close before page back.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react'

type BackEntry = { id: number; depth: number; fn: () => void }

const backStack: BackEntry[] = []
let backSeq = 0
const listeners = new Set<() => void>()

function notifyBackStack() {
  listeners.forEach((l) => l())
}

function topBack(): BackEntry | null {
  if (!backStack.length) return null
  let best = backStack[0]
  for (let i = 1; i < backStack.length; i++) {
    const e = backStack[i]
    if (e.depth > best.depth || (e.depth === best.depth && e.id > best.id)) best = e
  }
  return best
}

function registerBack(depth: number, fn: () => void): () => void {
  const id = ++backSeq
  const entry: BackEntry = { id, depth, fn }
  backStack.push(entry)
  notifyBackStack()
  return () => {
    const i = backStack.indexOf(entry)
    if (i >= 0) backStack.splice(i, 1)
    notifyBackStack()
  }
}

const BackDepthCtx = createContext(0)

/** Increase nesting depth for child back handlers (sheets over pages). */
export function BackScope({ children }: { children: ReactNode }) {
  const d = useContext(BackDepthCtx)
  return <BackDepthCtx.Provider value={d + 1}>{children}</BackDepthCtx.Provider>
}

/**
 * Register a back action while mounted. Highest depth wins on edge-swipe.
 * Pass null/undefined to skip (e.g. root list with nowhere to go).
 */
export function useBackHandler(handler: (() => void) | null | undefined) {
  const depth = useContext(BackDepthCtx)
  const fnRef = useRef(handler)
  fnRef.current = handler

  useEffect(() => {
    if (!handler) return
    const stable = () => {
      fnRef.current?.()
    }
    return registerBack(depth, stable)
  }, [handler, depth])
}

const EDGE_PX = 28
const SWIPE_MIN_DX = 64
const SWIPE_MAX_DY = 72

/**
 * Mount once near the app root. Left-edge swipe-right invokes the top back handler.
 * Does not steal vertical scroll or mid-screen horizontal pans.
 */
export function EdgeSwipeBack({ children }: { children?: ReactNode }) {
  const startRef = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const [hintX, setHintX] = useState(0)
  const [hasBack, setHasBack] = useState(() => topBack() != null)

  useEffect(() => {
    const sync = () => setHasBack(topBack() != null)
    listeners.add(sync)
    sync()
    return () => {
      listeners.delete(sync)
    }
  }, [])

  useEffect(() => {
    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE_PX) {
        startRef.current = null
        return
      }
      const el = e.target
      if (el instanceof Element) {
        if (el.closest('input, textarea, select, [contenteditable="true"]')) {
          startRef.current = null
          return
        }
      }
      if (!topBack()) {
        startRef.current = null
        return
      }
      startRef.current = { x: t.clientX, y: t.clientY, active: true }
      setHintX(0)
    }

    function onMove(e: TouchEvent) {
      const s = startRef.current
      if (!s?.active || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - s.x
      const dy = Math.abs(t.clientY - s.y)
      if (dy > SWIPE_MAX_DY && dy > Math.abs(dx)) {
        s.active = false
        setHintX(0)
        return
      }
      if (dx > 8 && Math.abs(dx) > dy) {
        // Claim horizontal edge gesture; avoid browser back / rubber-band conflicts.
        if (e.cancelable) e.preventDefault()
        setHintX(Math.min(72, dx * 0.35))
      }
    }

    function onEnd(e: TouchEvent) {
      const s = startRef.current
      startRef.current = null
      setHintX(0)
      if (!s?.active) return
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - s.x
      const dy = Math.abs(t.clientY - s.y)
      if (dx < SWIPE_MIN_DX || dy > SWIPE_MAX_DY || dx < dy * 1.2) return
      const top = topBack()
      if (top) top.fn()
    }

    function onCancel() {
      startRef.current = null
      setHintX(0)
    }

    document.addEventListener('touchstart', onStart, { passive: true, capture: true })
    document.addEventListener('touchmove', onMove, { passive: false, capture: true })
    document.addEventListener('touchend', onEnd, { passive: true, capture: true })
    document.addEventListener('touchcancel', onCancel, { passive: true, capture: true })
    return () => {
      document.removeEventListener('touchstart', onStart, true)
      document.removeEventListener('touchmove', onMove, true)
      document.removeEventListener('touchend', onEnd, true)
      document.removeEventListener('touchcancel', onCancel, true)
    }
  }, [])

  return (
    <>
      {children}
      {hasBack ? (
        <div
          className="edge-swipe-hint"
          aria-hidden="true"
          style={{
            transform: hintX ? `translateX(${hintX}px)` : undefined,
            opacity: hintX > 4 ? Math.min(1, hintX / 40) : 0,
          }}
        />
      ) : null}
    </>
  )
}

type PullProps = {
  onRefresh: () => void | Promise<void>
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Disable while a blocking overlay is open, etc. */
  disabled?: boolean
}

const PULL_TRIGGER = 68
const PULL_MAX = 110

/**
 * Wrap a scroll container. Pull down from top reloads; normal scroll stays intact.
 */
export function PullToRefresh({ onRefresh, children, className, style, disabled }: PullProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const pulling = useRef(false)
  const [offset, setOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const finishRefresh = useCallback(async () => {
    setRefreshing(true)
    setOffset(48)
    try {
      await onRefreshRef.current()
    } finally {
      setRefreshing(false)
      setOffset(0)
    }
  }, [])

  function onTouchStart(e: ReactTouchEvent) {
    if (disabled || refreshing) return
    const el = scrollerRef.current
    if (!el || el.scrollTop > 1) {
      pulling.current = false
      return
    }
    startY.current = e.touches[0].clientY
    pulling.current = true
  }

  function onTouchMove(e: ReactTouchEvent) {
    if (!pulling.current || disabled || refreshing) return
    const el = scrollerRef.current
    if (!el) return
    if (el.scrollTop > 1) {
      pulling.current = false
      setOffset(0)
      return
    }
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) {
      setOffset(0)
      return
    }
    // Resist pull; don't block native scroll once user scrolls content.
    if (dy > 6 && e.cancelable) e.preventDefault()
    const resisted = Math.min(PULL_MAX, dy * 0.45)
    setOffset(resisted)
  }

  function onTouchEnd() {
    if (!pulling.current) return
    pulling.current = false
    if (disabled || refreshing) {
      setOffset(0)
      return
    }
    if (offset >= PULL_TRIGGER) {
      void finishRefresh()
    } else {
      setOffset(0)
    }
  }

  function onTouchCancel() {
    pulling.current = false
    if (!refreshing) setOffset(0)
  }

  const indicatorOn = offset > 8 || refreshing
  const ready = offset >= PULL_TRIGGER

  return (
    <div
      ref={scrollerRef}
      className={className}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div
        className={'ptr-indicator' + (indicatorOn ? ' on' : '') + (ready || refreshing ? ' ready' : '')}
        aria-hidden="true"
      >
        <span className={'ptr-spinner' + (refreshing ? ' spin' : '')} />
        <span className="ptr-label">
          {refreshing ? '刷新中…' : ready ? '松开刷新' : '下拉刷新'}
        </span>
      </div>
      <div
        className="ptr-content"
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: pulling.current ? undefined : 'transform 180ms ease',
        }}
      >
        {children}
      </div>
    </div>
  )
}
