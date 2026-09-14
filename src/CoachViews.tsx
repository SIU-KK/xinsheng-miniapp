import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { COACH_AGENTS, coachOfId, type CoachId } from './coachAgents'
import { askCoach } from './grokClient'
import { toUserError } from './api'
import type { BossGender, BotPayload, ChatMessage, Session } from './types'
import { REC_BANNERS, RecArticlePage, type RecArticleId } from './RecArticles'

function flashCopy(setToast: (t: string | null) => void, text: string) {
  const ok = '已复制，发给大哥'
  const w = navigator.clipboard
  if (w && w.writeText) {
    w.writeText(text).then(
      () => {
        setToast(ok)
        window.setTimeout(() => setToast(null), 1600)
      },
      () => {
        setToast(ok)
        window.setTimeout(() => setToast(null), 1600)
      },
    )
  } else {
    setToast(ok)
    window.setTimeout(() => setToast(null), 1600)
  }
}

function openingPayload(text: string): BotPayload {
  return {
    analysis: text,
    bossMindset: '',
    hostMood: '',
    hostTone: '',
    replies: [],
    spicy: false,
    coachOpen: true,
    rawText: text,
    source: 'keyword',
  }
}

function coachPayloadFromAsk(res: Awaited<ReturnType<typeof askCoach>>): BotPayload {
  return {
    analysis: res.analysis,
    bossMindset: '',
    hostMood: '',
    hostTone: '',
    replies: res.replies.map((r) => ({
      n: r.n,
      cue: r.cue,
      line: r.line,
    })),
    spicy: false,
    note: res.note || undefined,
    rawText: res.rawText,
    source: 'deepseek',
  }
}

function RecPromoBanner({ onOpen }: { onOpen: (id: RecArticleId) => void }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const startX = useRef<number | null>(null)
  const count = REC_BANNERS.length

  useEffect(() => {
    if (paused || count < 2) return
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % count)
    }, 4800)
    return () => window.clearInterval(t)
  }, [paused, count])

  function onTouchStart(e: TouchEvent) {
    startX.current = e.changedTouches[0].clientX
    setPaused(true)
  }

  function onTouchEnd(e: TouchEvent) {
    const x0 = startX.current
    startX.current = null
    window.setTimeout(() => setPaused(false), 2600)
    if (x0 == null || count < 2) return
    const dx = e.changedTouches[0].clientX - x0
    if (dx > 40) setIdx((i) => (i - 1 + count) % count)
    else if (dx < -40) setIdx((i) => (i + 1) % count)
  }

  return (
    <div className="rec-banner">
      <div
        className="rec-banner-viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          startX.current = null
          setPaused(false)
        }}
      >
        <div className="rec-banner-row" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {REC_BANNERS.map((b) => (
            <button
              key={b.id}
              type="button"
              className="rec-banner-slide"
              onClick={() => onOpen(b.article)}
            >
              <div className="rec-banner-kicker">{b.kicker}</div>
              <div className="rec-banner-title">{b.title}</div>
              <div className="rec-banner-sub">{b.subtitle}</div>
            </button>
          ))}
        </div>
      </div>
      {count > 1 ? (
        <div className="rec-banner-dots" aria-hidden="true">
          {REC_BANNERS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={'rec-banner-dot' + (i === idx ? ' on' : '')}
              onClick={() => setIdx(i)}
              aria-label={'横幅 ' + String(i + 1)}
            />
          ))}
        </div>
      ) : (
        <div className="rec-banner-dots" aria-hidden="true">
          <span className="rec-banner-dot on" />
        </div>
      )}
    </div>
  )
}

export function RecommendCoaches({ onPick }: { onPick: (id: CoachId) => void }) {
  const [view, setView] = useState<'list' | RecArticleId>('list')

  if (view !== 'list') {
    return <RecArticlePage id={view} onBack={() => setView('list')} />
  }

  return (
    <div className="pane">
      <div className="nav">
        <span className="nav-side" />
        <div className="title">推荐</div>
        <span className="nav-side" />
      </div>
      <div className="onboard">
        <RecPromoBanner onOpen={(id) => setView(id)} />
        <h1>助聊工作台</h1>
        <p className="lead">贴大哥原话，立刻拿能复制发出的回复。六位金牌助聊，先选人设再贴原话。</p>
        <div className="cards">
          {COACH_AGENTS.map((p) => (
            <button key={p.id} className="card" type="button" onClick={() => onPick(p.id)}>
              <div
                className="avatar"
                style={{
                  color: p.accent,
                  borderColor: p.accent,
                  background: p.accent + '22',
                }}
              >
                {p.emoji}
              </div>
              <div>
                <h3>{p.name}</h3>
                <div className="tag">{p.tag}</div>
                <div className="blurb">{p.blurb}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CoachSetup({
  coachId,
  onBack,
  onStart,
}: {
  coachId: CoachId
  onBack: () => void
  onStart: (bossName: string, bossGender: BossGender) => void
}) {
  const coach = coachOfId(coachId)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<BossGender>('男')
  const [err, setErr] = useState(false)

  function confirm() {
    const n = name.trim()
    if (!n) {
      setErr(true)
      return
    }
    onStart(n, gender)
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">
          助聊工作台
          <small>{coach.name}</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="settings">
        <p className="lead">先记下这局和大哥的关系，再贴原话拿回复。</p>
        {coach.plot ? <p className="coach-plot">{coach.plot}</p> : null}
        <p className="coach-persona-ro">本局人设：{coach.name}</p>

        <label className="field-label">
          老板名称<span>必填</span>
        </label>
        <input
          className={'textin' + (err && !name.trim() ? ' bad' : '')}
          placeholder="例如：宸"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (e.target.value.trim()) setErr(false)
          }}
        />
        {err && !name.trim() ? <p className="err">请先填写老板名称</p> : null}

        <label className="field-label">
          老板性别<span>默认男</span>
        </label>
        <div className="chip-row">
          {(['男', '女', '未知'] as BossGender[]).map((opt) => (
            <button
              key={opt}
              type="button"
              className={'chip' + (gender === opt ? ' on' : '')}
              onClick={() => setGender(opt)}
            >
              {opt}
            </button>
          ))}
        </div>

        <p className="usage-tip">
          把大哥消息原封不动贴过来；可加备注行 【备注：认识第三天，还没出过票】 再空一行贴原话。
        </p>

        <button type="button" className="primary" onClick={confirm}>
          进入助聊
        </button>
      </div>
    </div>
  )
}

function CoachBubble({
  msg,
  onCopy,
}: {
  msg: Extract<ChatMessage, { role: 'bot' }>
  onCopy: (text: string) => void
}) {
  const bot = msg.bot
  if (bot.coachOpen) {
    return (
      <div className="bubble-bot coach-open">
        <div className="analysis open-line">{bot.analysis}</div>
      </div>
    )
  }
  return (
    <div className="bubble-bot">
      <div className="h-label">
        【分析】
        {bot.source === 'deepseek' ? <span className="source-flag">DeepSeek</span> : null}
      </div>
      {bot.analysis ? <div className="analysis">{bot.analysis}</div> : null}
      {bot.replies.map((r) => (
        <div
          key={r.n}
          className="reply"
          onClick={() => onCopy(r.line)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onCopy(r.line)
          }}
        >
          <div className="h-label">【回复{r.n}】</div>
          <div className="line">{r.line}</div>
          {r.cue ? <div className="cue">（目的：{r.cue}）</div> : null}
        </div>
      ))}
      {bot.note ? (
        <div className="coach-note">
          <div className="h-label">【注意】</div>
          <div className="analysis">{bot.note}</div>
        </div>
      ) : null}
      {!bot.replies.length && bot.rawText && !bot.analysis.includes('【回复') ? (
        <div className="analysis raw-fallback">{bot.rawText}</div>
      ) : null}
    </div>
  )
}

const coachOpenSeeded = new Set<string>()

export function CoachThread({
  session,
  onBack,
  onPatch,
  onAskDelete,
}: {
  session: Session
  onBack: () => void
  onPatch: (id: string, patch: Partial<Session>) => void
  onAskDelete: (session: Session) => void
}) {
  const coach = coachOfId(session.coachKind || 'sweet')
  const [input, setInput] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [more, setMore] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const messages = session.messages

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, writing])

  useEffect(() => {
    if (session.messages.length > 0) {
      coachOpenSeeded.add(session.id)
      return
    }
    if (coachOpenSeeded.has(session.id)) return
    coachOpenSeeded.add(session.id)
    const open: ChatMessage = {
      id: 'b-open-' + session.id,
      role: 'bot',
      bot: openingPayload(coach.opening),
    }
    onPatch(session.id, { messages: [open], updatedAt: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  function takeLine(text: string) {
    flashCopy(setToast, text)
  }

  async function send() {
    const text = input.trim()
    if (!text || writing) return
    const user: ChatMessage = { id: 'u-' + Date.now(), role: 'user', text }
    const next = [...messages, user]
    onPatch(session.id, { messages: next, updatedAt: Date.now() })
    setInput('')
    setWriting(true)
    try {
      const res = await askCoach({
        coachId: coach.id,
        bossName: session.bossName,
        bossGender: session.bossGender || '男',
        hostWho: session.hostWho || coach.hostWhoFixed,
        userText: text,
        messages: next,
      })
      const bot: ChatMessage = {
        id: 'b-' + Date.now(),
        role: 'bot',
        bot: coachPayloadFromAsk(res),
      }
      onPatch(session.id, {
        messages: [...next, bot],
        updatedAt: Date.now(),
        lastSuggested: res.replies.map((r) => ({ n: r.n, line: r.line })),
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'unauthorized') {
        setToast('登录已过期，请重新登录')
      } else {
        setToast(toUserError(e, '模型失败请重试'))
      }
      window.setTimeout(() => setToast(null), 1800)
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">
          {coach.name} · {session.bossName}
          <small>{coach.agentName}</small>
        </div>
        <button type="button" className="nav-more" aria-label="更多" onClick={() => setMore(true)}>
          ···
        </button>
      </div>
      <div className="scroll">
        <p className="usage-tip inline-tip">
          把大哥消息原封不动贴过来；可加备注行 【备注：认识第三天，还没出过票】 再空一行贴原话。
        </p>
        {messages.map((m) =>
          m.role === 'user' ? (
            <div className="row user" key={m.id}>
              <div className="bubble-user">{m.text}</div>
            </div>
          ) : (
            <div className="row bot" key={m.id}>
              <CoachBubble msg={m} onCopy={takeLine} />
            </div>
          ),
        )}
        {writing ? (
          <div className="row bot">
            <div className="bubble-bot writing">正在写…</div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          className="field"
          placeholder="贴大哥原话…"
          value={input}
          disabled={writing}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="ico plus" disabled={!input.trim() || writing} aria-label="发送">
          发
        </button>
      </form>
      {toast ? <div className="toast">{toast}</div> : null}
      {more ? (
        <div className="sheet-mask" onClick={() => setMore(false)} role="presentation">
          <div
            className="sheet confirm-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="更多"
          >
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                setMore(false)
                onAskDelete(session)
              }}
            >
              删除聊天
            </button>
            <button type="button" className="ghost-btn" onClick={() => setMore(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function sessionListTitle(s: Session): string {
  if (s.coachKind) return coachOfId(s.coachKind).name + ' · ' + s.bossName
  return s.bossName
}

export function sessionListSub(s: Session, personaName: string, preview: string): string {
  if (s.coachKind) return coachOfId(s.coachKind).name + ' · ' + preview
  return personaName + ' · ' + preview
}
