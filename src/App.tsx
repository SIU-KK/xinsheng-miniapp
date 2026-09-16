import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PERSONAS } from './personas'
import { hashesFromPmLines, replyCopyText } from './engine'
import { memoryFromSession } from './companionMemory'
import { askGrok } from './grokClient'
import { RecommendCoaches, CoachSetup, CoachThread, sessionListTitle, sessionListSub } from './CoachViews'
import { coachOfId, type CoachId } from './coachAgents'
import { CHAT_SHOT_LABEL, compressChatShot } from './chatShot'
import {
  CHOICE_ASK,
  ackChoiceBot,
  formatSentPm,
  isOpeningReplies,
  offersCopyable,
  parseHostInput,
  suggestedFromBot,
} from './hostChoice'
import { resolveHomepageSignals } from './platformRanks'
import {
  createThread,
  deleteThread,
  fetchMe,
  fetchThreadMessages,
  fetchThreads,
  loginAccount,
  logoutAccount,
  patchThread,
  registerAccount,
  toUserError,
  type AuthUser,
} from './api'
import { dropSession } from './storage'
import { MinePage } from './MineGuide'
import {
  RELATION_GOAL_OPTIONS,
  RELATION_NOW_OPTIONS,
  parseRelationGoal,
  parseRelationNow,
  relationSubtitle,
} from './relation'
import type { BossGender, BotPayload, ChatMessage, Persona, PersonaId, RelationGoal, RelationNow, Session } from './types'

type Tab = 'chat' | 'rec' | 'me'
type Stack =
  | { view: 'tabs' }
  | { view: 'settings'; personaId: PersonaId }
  | { view: 'coachSetup'; coachId: CoachId }
  | { view: 'thread'; sessionId: string }

function nowClock() {
  const d = new Date()
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return h + ':' + m
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return h + ':' + m
}

function personaOf(id: PersonaId): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]
}

function lastPreview(s: Session): string {
  const msgs = s.messages || []
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role !== 'bot') continue
    const pms = (m.bot.replies || []).filter((r) => r.channel === 'pm' && (r.line || '').trim())
    const line = (pms[pms.length - 1]?.line || m.bot.replies[0]?.line || '').trim()
    const an = (m.bot.analysis || '').replace(/【[^】]+】/g, ' ').replace(/\s+/g, ' ').trim()
    const snippet = (line || an).slice(0, 36)
    if (snippet) return snippet
  }
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role !== 'user') continue
    if (m.shot || m.shotOmitted) return '聊天截图'
    if ((m.text || '').trim()) return m.text
  }
  return '新会话'
}

function highlightAnalysis(text: string) {
  const parts = text.split(/(\u300c[^\u300d]+\u300d)/g)
  return parts.map((p, i) =>
    p.startsWith('\u300c') ? <em key={i}>{p}</em> : <span key={i}>{p}</span>,
  )
}

function StatusBar() {
  return (
    <div className="status" aria-hidden="true">
      <span>{nowClock()}</span>
    </div>
  )
}

function payloadFromGrok(grok: Awaited<ReturnType<typeof askGrok>>): BotPayload {
  return {
    analysis: grok.analysis,
    bossMindset: grok.bossMindset,
    hostMood: grok.hostMood,
    hostTone: grok.hostTone,
    replies: grok.replies,
    spicy: grok.spicy,
    scene: grok.scene,
    nextAction: grok.nextAction,
    giftPhase: grok.giftPhase,
    ticketOdds: grok.ticketOdds,
    addressUsed: grok.addressUsed,
    source: grok.source === 'deepseek' ? 'deepseek' : grok.source === 'gemini' ? 'gemini' : 'grok',
  }
}

function giftMeta(session: Session) {
  const self = (session.giftMemory || []).filter((g) => g.kind !== 'other')
  return {
    lastGiftAt: self.length ? Math.max(...self.map((g) => g.at)) : undefined,
    giftCount: self.length,
  }
}

const createWait = new Map<string, Promise<unknown>>()
const openingJobs = new Map<string, Promise<'ok' | 'fail' | 'unauthorized'>>()

function BibleSheet({ persona, onClose }: { persona: Persona; onClose: () => void }) {
  const b = persona.bible
  return (
    <div className="sheet-mask" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="角色设定"
      >
        <div className="sheet-head">
          <strong>
            {persona.name} · 设定
          </strong>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="sheet-body">
          <section>
            <h4>她是谁</h4>
            <p>{b.who}</p>
          </section>
          <section>
            <h4>禁区</h4>
            <p>{b.taboo}</p>
          </section>
          <section>
            <h4>上麦 vs 私聊</h4>
            <p>{b.onMic}</p>
            <p>{b.pm}</p>
          </section>
          <section>
            <h4>出票钩子</h4>
            <p>{b.ticketHook}</p>
          </section>
          <section>
            <h4>软色情开关</h4>
            <p>{b.spicyUnlock}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteSheet({
  bossName,
  onCancel,
  onConfirm,
}: {
  bossName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="sheet-mask" onClick={onCancel} role="presentation">
      <div
        className="sheet confirm-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="删除聊天"
      >
        <p className="confirm-copy">
          {'删除与「' + bossName + '」的聊天？记录清掉后不能恢复'}
        </p>
        <button type="button" className="danger-btn" onClick={onConfirm}>
          删除
        </button>
        <button type="button" className="ghost-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

function ThreadMoreSheet({
  onBible,
  onDelete,
  onClose,
}: {
  onBible: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div className="sheet-mask" onClick={onClose} role="presentation">
      <div
        className="sheet confirm-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="更多"
      >
        <button type="button" className="ghost-btn" onClick={onBible}>
          角色设定
        </button>
        <button type="button" className="danger-btn" onClick={onDelete}>
          删除聊天
        </button>
        <button type="button" className="ghost-btn" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5h4v2M8 7l.8 13h6.4L16 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function coachOf(bot: BotPayload) {
  const pick = (label: string, field?: string) => {
    if (field && field.trim()) return field.trim()
    const re = new RegExp('【' + label + '】([^\n【]+)')
    const m = bot.analysis.match(re)
    return m ? m[1].trim() : ''
  }
  return {
    bossMindset: pick('大哥心态', bot.bossMindset),
    hostMood: pick('你的心情', bot.hostMood),
    hostTone: pick('你的语气', bot.hostTone),
    body: bot.analysis
      .replace(/【大哥心态】[^\n]*\n?/g, '')
      .replace(/【你的心情】[^\n]*\n?/g, '')
      .replace(/【你的语气】[^\n]*\n?/g, '')
      .trim(),
  }
}

function BotBubble({
  msg,
  onCopy,
  onRefreshPms,
}: {
  msg: Extract<ChatMessage, { role: 'bot' }>
  onCopy: (text: string, channel?: string) => void
  onRefreshPms?: () => void
}) {
  const coach = coachOf(msg.bot)
  const opening = isOpeningReplies(msg.bot.replies)
  const ask = offersCopyable(msg.bot)
  return (
    <div className="bubble-bot">
      <div className="h-label">
        {'\u3010\u5206\u6790\u3011'}
        {msg.bot.scene ? <span className="scene-flag">{msg.bot.scene}</span> : null}
        {msg.bot.source ? (
          <span className="source-flag">
            {msg.bot.source === 'deepseek'
              ? 'DeepSeek'
              : msg.bot.source === 'gemini'
                ? 'Gemini'
                : msg.bot.source === 'keyword'
                  ? '本地'
                  : 'Grok'}
          </span>
        ) : null}
        {typeof msg.bot.ticketOdds === 'number' ? (
          <span className="odds-flag">
            {'出票机率 ' + (msg.bot.ticketOdds >= 55 ? '高' : msg.bot.ticketOdds >= 28 ? '中' : '低') + ' ' + msg.bot.ticketOdds + '%'}
          </span>
        ) : null}
        {msg.bot.spicy ? (
          <span className="spicy-flag">感情到位 · 私聊可撩</span>
        ) : (
          <span className="quiet-flag">未开软色情</span>
        )}
      </div>
      <div className="coach">
        {coach.bossMindset ? (
          <div className="coach-row">
            <span className="coach-k">{'\u3010\u5927\u54e5\u5fc3\u6001\u3011'}</span>
            <span>{coach.bossMindset}</span>
          </div>
        ) : null}
        {coach.hostMood ? (
          <div className="coach-row">
            <span className="coach-k">{'\u3010\u4f60\u7684\u5fc3\u60c5\u3011'}</span>
            <span>{coach.hostMood}</span>
          </div>
        ) : null}
        {coach.hostTone ? (
          <div className="coach-row">
            <span className="coach-k">{'\u3010\u4f60\u7684\u8bed\u6c14\u3011'}</span>
            <span>{coach.hostTone}</span>
          </div>
        ) : null}
      </div>
      {msg.bot.nextAction ? (
        <div className="next-act">
          <div className="h-label">{'\u3010\u4e0b\u4e00\u6b65\u3011'}</div>
          <div className="next-main">
            {msg.bot.nextAction.type}
            <span className={msg.bot.nextAction.seduce === 'soft' ? 'seduce-on' : 'seduce-off'}>
              {msg.bot.nextAction.seduce === 'soft' ? '可以软勾引' : '先别勾引'}
            </span>
          </div>
          <div className="next-why">{msg.bot.nextAction.reason}</div>
          {msg.bot.giftPhase ? (
            <div className="gift-phase">
              {msg.bot.giftPhase === 'before' ? '礼物节点 · 刷前' : msg.bot.giftPhase === 'after' ? '礼物节点 · 刷后' : '礼物节点 · 给别人刷了'}
            </div>
          ) : null}
        </div>
      ) : null}
      {coach.body ? <div className="analysis">{highlightAnalysis(coach.body)}</div> : null}
      {msg.bot.replies.map((r, i) => {
        const ch = r.channel
        const pmIndex = msg.bot.replies.filter((x, j) => j <= i && x.channel === 'pm').length
        const label =
          ch === 'pm'
            ? '\u3010\u79c1\u804a' + pmIndex + '\u3011'
            : ch === 'public'
              ? '\u3010\u516c\u5c4f\u3011'
              : '\u3010\u56de\u590d' + r.n + '\u3011'
        return (
        <div
          key={r.n}
          className="reply"
          onClick={() => onCopy(replyCopyText(r), ch)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onCopy(replyCopyText(r), ch)
          }}
        >
          <div className="h-label">
            {label}
            {r.tone ? <span className="tone">{r.tone}</span> : null}
          </div>
          <div className="cue">{'\uff08' + r.cue + '\uff09'}</div>
          <div className="line">{'\u201c' + r.line + '\u201d'}</div>
          {r.pm && ch !== 'pm' && ch !== 'public' ? (
            <div className="pm">
              <span className="dot" />
              <span>{'\uff08\u79c1\u804a\u8865\uff09' + r.pm}</span>
            </div>
          ) : null}
        </div>
        )
      })}
      {opening && onRefreshPms ? (
        <button type="button" className="refresh-pms" onClick={(e) => { e.stopPropagation(); onRefreshPms() }}>
          换一批
        </button>
      ) : null}
      {ask ? <div className="choice-ask">{CHOICE_ASK}</div> : null}
    </div>
  )
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="主导航">
      <button type="button" className={tab === 'chat' ? 'on' : ''} onClick={() => onTab('chat')}>
        <span className="tab-ico">聊</span>
        聊天
      </button>
      <button type="button" className={tab === 'rec' ? 'on' : ''} onClick={() => onTab('rec')}>
        <span className="tab-ico">荐</span>
        推荐
      </button>
      <button type="button" className={tab === 'me' ? 'on' : ''} onClick={() => onTab('me')}>
        <span className="tab-ico">我</span>
        我的
      </button>
    </nav>
  )
}

function SessionList({
  sessions,
  username,
  onOpen,
  onAskDelete,
  onLogout,
  onGoRec,
}: {
  sessions: Session[]
  username: string
  onOpen: (id: string) => void
  onAskDelete: (session: Session) => void
  onLogout: () => void
  onGoRec: () => void
}) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <div className="pane">
      <div className="nav">
        <span className="nav-side nav-user" title={username}>{username.slice(0, 4)}</span>
        <div className="title">
          聊天
          <small>{username}</small>
        </div>
        <button type="button" className="nav-set" onClick={onLogout}>
          退出
        </button>
      </div>
      <div className="scroll list-scroll">
        {sorted.length === 0 ? (
          <div className="empty-box">
            <p className="empty">还没有老板。去推荐建一个。</p>
            <button type="button" className="primary empty-cta" onClick={onGoRec}>
              去推荐建老板
            </button>
          </div>
        ) : (
          sorted.map((s) => {
            const p = personaOf(s.personaId)
            return (
              <div key={s.id} className="sess-row">
                <button type="button" className="sess" onClick={() => onOpen(s.id)}>
                  <div
                    className="avatar"
                    style={{
                      color: p.accent,
                      borderColor: p.accent,
                      background: p.accent + '22',
                    }}
                  >
                    {s.screenshot ? (
                      <img src={s.screenshot} alt="" />
                    ) : (
                      s.bossName.slice(0, 1)
                    )}
                  </div>
                  <div className="sess-body">
                    <div className="sess-top">
                      <strong>{sessionListTitle(s)}</strong>
                      <time>{fmtTime(s.updatedAt)}</time>
                    </div>
                    <div className="sess-sub">
                      {sessionListSub(s, p.name, lastPreview(s))}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="sess-del"
                  aria-label={'删除与' + s.bossName + '的聊天'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAskDelete(s)
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}


function NewBossSettings({
  persona,
  onBack,
  onStart,
}: {
  persona: Persona
  onBack: () => void
  onStart: (
    bossName: string,
    screenshot: string | null,
    fileName: string | undefined,
    caption: string | undefined,
    relationNow: RelationNow,
    relationGoal: RelationGoal,
  ) => void
}) {
  const [name, setName] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | undefined>()
  const [caption, setCaption] = useState('')
  const [relationNow, setRelationNow] = useState<RelationNow | null>(null)
  const [relationGoal, setRelationGoal] = useState<RelationGoal | null>(null)
  const [err, setErr] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(f: File | undefined) {
    if (!f) return
    setFileName(f.name)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setShot(reader.result)
    }
    reader.readAsDataURL(f)
  }

  function confirm() {
    const n = name.trim()
    if (!n || !relationNow || !relationGoal) {
      setErr(true)
      return
    }
    onStart(n, shot, fileName, caption.trim() || undefined, relationNow, relationGoal)
  }

  return (
    <div className="pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">
          新老板
          <small>{persona.name}</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="settings">
        <p className="lead">先建档，再让她读主页、写第一句。同一人设每次都会新建会话。</p>
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
          目前关系<span>必填</span>
        </label>
        <div className="chip-row">
          {RELATION_NOW_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={'chip' + (relationNow === opt ? ' on' : '')}
              onClick={() => {
                setRelationNow(opt)
                setErr(false)
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        {err && !relationNow ? <p className="err">请选择目前关系</p> : null}

        <label className="field-label">
          目标关系<span>必填</span>
        </label>
        <div className="chip-row">
          {RELATION_GOAL_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={'chip' + (relationGoal === opt ? ' on' : '')}
              onClick={() => {
                setRelationGoal(opt)
                setErr(false)
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        {err && !relationGoal ? <p className="err">请选择目标关系</p> : null}

        <label className="field-label">
          主页截图<span>选填</span>
        </label>
        <button type="button" className="upload" onClick={() => fileRef.current?.click()}>
          {shot ? <img src={shot} alt="主页预览" /> : <span>上传主页截图，便于点名可见信号</span>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {shot ? (
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setShot(null)
              setFileName(undefined)
            }}
          >
            移除截图
          </button>
        ) : null}

        <label className="field-label">
          主页备注 / 识别文字<span>选填</span>
        </label>
        <textarea
          className="textin area"
          placeholder="可粘贴看见的等级：仙尊137、明日之星5、在线14…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
        />

        <button type="button" className="primary" onClick={confirm}>
          开始分析
        </button>
      </div>
    </div>
  )
}

function ChatThread({
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
  const persona = personaOf(session.personaId)
  const [input, setInput] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [more, setMore] = useState(false)
  const [writing, setWriting] = useState(() => session.messages.length === 0)
  const endRef = useRef<HTMLDivElement>(null)
  const shotRef = useRef<HTMLInputElement>(null)
  const messages = session.messages
  const relationNow = parseRelationNow(session.relationNow)
  const relationGoal = parseRelationGoal(session.relationGoal)

  function flash(t: string) {
    setToast(t)
    window.setTimeout(() => setToast(null), 1600)
  }

  function flashAskErr(e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('看不了图')) {
      flash('模型看不了图请重试')
      return
    }
    flash(toUserError(e, '模型失败请重试'))
  }

  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [session.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, writing])

  useEffect(() => {
    let alive = true
    const sid = session.id
    void (async () => {
      let msgs = session.messages
      if (!msgs.length) {
        try {
          const fetched = await fetchThreadMessages(sid)
          if (!alive) return
          if (fetched && fetched.length) {
            onPatch(sid, { messages: fetched })
            setWriting(false)
            return
          }
        } catch (e) {
          if (!alive) return
          if (e instanceof Error && e.message === 'unauthorized') {
            flash('登录已过期，请重新登录')
            setWriting(false)
            return
          }
        }
      }
      if (msgs.length > 0) return
      setWriting(true)
      let job = openingJobs.get(sid)
      if (!job) {
        const personaId = session.personaId
        const bossName = session.bossName
        const signals = session.signals
        const usedPmHashes = session.usedPmHashes
        const relationNow = parseRelationNow(session.relationNow)
        const relationGoal = parseRelationGoal(session.relationGoal)
        job = (async () => {
          try {
            const grok = await askGrok({
              personaId,
              bossName,
              bossProfile: signals,
              messages: [],
              userText: '开始分析',
              usedPmHashes,
              relationNow,
              relationGoal,
              lastGiftAt: undefined,
              giftCount: 0,
              companionMemory: memoryFromSession(session, []),
              threadId: sid,
            })
            const payload = payloadFromGrok(grok)
            const bot: ChatMessage = { id: 'b-' + sid, role: 'bot', bot: payload }
            onPatch(sid, {
              messages: [bot],
              usedPmHashes: hashesFromPmLines(payload, bossName),
              lastSuggested: suggestedFromBot(payload),
              companionMemory: memoryFromSession(session, [bot], payload),
              updatedAt: Date.now(),
            })
            return 'ok' as const
          } catch (e) {
            openingJobs.delete(sid)
            onPatch(sid, {
              messages: [{ id: 'u-open-' + sid, role: 'user', text: '开始分析' }],
              companionMemory: memoryFromSession(session, [{ id: 'u-open-' + sid, role: 'user', text: '开始分析' }]),
              updatedAt: Date.now(),
            })
            if (e instanceof Error && e.message === 'unauthorized') return 'unauthorized' as const
            return 'fail' as const
          }
        })()
        openingJobs.set(sid, job)
      }
      const kind = await job
      if (!alive) return
      if (kind === 'unauthorized') flash('登录已过期，请重新登录')
      else if (kind === 'fail') flash('模型失败请重试')
      setWriting(false)
    })()
    return () => {
      alive = false
    }
    // first-contact DeepSeek once per thread
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  function takeLine(text: string, channel?: string) {
    const ok =
      channel === 'pm' || channel === 'public'
        ? '\u5df2\u590d\u5236\uff0c\u53d1\u7ed9\u5927\u54e5'
        : '\u5df2\u590d\u5236\uff0c\u53d1\u7ed9\u5927\u54e5'
    const w = navigator.clipboard
    if (w && w.writeText) {
      w.writeText(text).then(
        () => flash(ok),
        () => flash(ok),
      )
    } else {
      flash(ok)
    }
  }

  async function refreshPms(botMsgId?: string) {
    const target =
      messages.find((m) => m.id === botMsgId && m.role === 'bot') ||
      messages.find((m) => m.role === 'bot' && isOpeningReplies(m.bot.replies))
    if (!target || target.role !== 'bot' || !isOpeningReplies(target.bot.replies) || writing) return
    setWriting(true)
    try {
      const grok = await askGrok({
        personaId: session.personaId,
        bossName: session.bossName,
        bossProfile: session.signals,
        messages,
        userText: '换一批',
        usedPmHashes: session.usedPmHashes,
        refresh: true,
        relationNow,
        relationGoal,
        ...giftMeta(session),
        companionMemory: memoryFromSession(session, messages),
        threadId: session.id,
      })
      const bot = payloadFromGrok(grok)
      const nextMsgs = messages.map((m) => (m.id === target.id ? { ...m, bot } : m))
      onPatch(session.id, {
        messages: nextMsgs,
        usedPmHashes: [...(session.usedPmHashes || []), ...hashesFromPmLines(bot, session.bossName)],
        lastSuggested: suggestedFromBot(bot),
        chosenIndex: undefined,
        chosenLine: undefined,
        companionMemory: memoryFromSession(session, nextMsgs, bot),
        updatedAt: Date.now(),
      })
    } catch (e) {
      flashAskErr(e)
    } finally {
      setWriting(false)
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || writing) return
    const parsed = parseHostInput(text)
    const suggested = session.lastSuggested || []
    let chosenIndex = session.chosenIndex
    let chosenLine = session.chosenLine
    const extra: Partial<Session> = {}
    if (parsed.giftPhase === 'after') {
      extra.giftMemory = [
        ...(session.giftMemory || []),
        { item: parsed.giftItem || '礼物', at: Date.now(), kind: 'self' as const },
      ]
    }
    if (parsed.giftPhase === 'other_host') {
      extra.otherGiftNudge = (session.otherGiftNudge || 0) + 1
      extra.giftMemory = [
        ...(session.giftMemory || []),
        { item: parsed.giftItem || '给别人', at: Date.now(), kind: 'other' as const },
      ]
    }
    if (parsed.choice) {
      const hit = suggested.find((x) => x.n === parsed.choice) || suggested[parsed.choice - 1]
      if (hit) {
        chosenIndex = parsed.choice
        chosenLine = hit.line
        extra.chosenIndex = chosenIndex
        extra.chosenLine = chosenLine
      }
    }

    const user: ChatMessage = { id: 'u-' + Date.now(), role: 'user', text }
    const next = [...messages, user]
    onPatch(session.id, {
      messages: next,
      updatedAt: Date.now(),
      companionMemory: memoryFromSession({ ...session, ...extra }, next),
      ...extra,
    })
    setInput('')

    if (parsed.choiceOnly && !parsed.giftPhase) {
      const line = chosenLine || suggested.find((x) => x.n === parsed.choice)?.line || ''
      const n = parsed.choice || chosenIndex || 1
      const bot: ChatMessage = {
        id: 'b-' + Date.now(),
        role: 'bot',
        bot: ackChoiceBot(n, line || '（该编号没有可复制正文）'),
      }
      onPatch(session.id, {
        messages: [...next, bot],
        updatedAt: Date.now(),
        ...extra,
      })
      return
    }

    const hostAsk = !!parsed.hostAsk
    const modelText = hostAsk ? text : (parsed.bossText || text)
    const remindPick = !chosenIndex && !session.choiceReminded
    if (remindPick) extra.choiceReminded = true
    const sentPm =
      chosenIndex && chosenLine ? formatSentPm(chosenIndex, chosenLine) : undefined

    setWriting(true)
    try {
      const grok = await askGrok({
        personaId: session.personaId,
        bossName: session.bossName,
        bossProfile: session.signals,
        messages: next,
        userText: modelText || (parsed.giftPhase ? (parsed.giftPhase === 'after' ? '刷了' + (parsed.giftItem || '礼物') : parsed.giftPhase === 'before' ? '还没刷 要不要圈' : '他给别人刷了') : text),
        usedPmHashes: session.usedPmHashes,
        sentPm,
        giftPhase: parsed.giftPhase,
        giftItem: parsed.giftItem,
        giftMemory: (extra.giftMemory || session.giftMemory || []).map((g) => g.item),
        otherGiftNudge: extra.otherGiftNudge ?? session.otherGiftNudge,
        hostAsk,
        role: hostAsk ? 'hostAsk' : undefined,
        relationNow,
        relationGoal,
        ...giftMeta({ ...session, ...extra }),
        companionMemory: memoryFromSession({ ...session, ...extra }, next),
        threadId: session.id,
      })
      let payload = payloadFromGrok(grok)
      if (remindPick && payload.analysis && !payload.analysis.includes('请回 1 或 2')) {
        payload = {
          ...payload,
          analysis: payload.analysis + '\n（另外请回 1 或 2，告诉我你发出了哪条私聊。）',
        }
      }
      const bot: ChatMessage = {
        id: 'b-' + Date.now(),
        role: 'bot',
        bot: payload,
      }
      const newHashes = hashesFromPmLines(payload, session.bossName)
      const suggest = suggestedFromBot(payload)
      onPatch(session.id, {
        messages: [...next, bot],
        updatedAt: Date.now(),
        lastSuggested: suggest.length ? suggest : session.lastSuggested,
        usedPmHashes: newHashes.length ? [...(session.usedPmHashes || []), ...newHashes] : session.usedPmHashes,
        companionMemory: memoryFromSession({ ...session, ...extra }, [...next, bot], payload),
        ...extra,
      })
    } catch (e) {
      flashAskErr(e)
    } finally {
      setWriting(false)
    }
  }

  async function sendShot(file: File) {
    if (writing) return
    const uid = 'u-' + Date.now()
    let dataUrl: string
    try {
      dataUrl = await compressChatShot(file)
    } catch (e) {
      flash(e instanceof Error && /[一-鿿]/.test(e.message) ? e.message : '请上传聊天截图')
      return
    }
    const user: ChatMessage = { id: uid, role: 'user', text: CHAT_SHOT_LABEL, shot: dataUrl }
    const next = [...messages, user]
    onPatch(session.id, {
      messages: next,
      updatedAt: Date.now(),
      companionMemory: memoryFromSession(session, next),
    })
    setWriting(true)
    try {
      const grok = await askGrok({
        personaId: session.personaId,
        bossName: session.bossName,
        bossProfile: session.signals,
        messages: next,
        userText: CHAT_SHOT_LABEL,
        usedPmHashes: session.usedPmHashes,
        chatShot: dataUrl,
        giftMemory: (session.giftMemory || []).map((g) => g.item),
        otherGiftNudge: session.otherGiftNudge,
        relationNow,
        relationGoal,
        ...giftMeta(session),
        companionMemory: memoryFromSession(session, next),
        threadId: session.id,
      })
      const payload = payloadFromGrok(grok)
      const bot: ChatMessage = { id: 'b-' + Date.now(), role: 'bot', bot: payload }
      const newHashes = hashesFromPmLines(payload, session.bossName)
      const suggest = suggestedFromBot(payload)
      onPatch(session.id, {
        messages: [...next, bot],
        updatedAt: Date.now(),
        lastSuggested: suggest.length ? suggest : session.lastSuggested,
        usedPmHashes: newHashes.length ? [...(session.usedPmHashes || []), ...newHashes] : session.usedPmHashes,
        companionMemory: memoryFromSession(session, [...next, bot], payload),
      })
    } catch (e) {
      flashAskErr(e)
    } finally {
      setWriting(false)
    }
  }

  const lastMsg = messages[messages.length - 1]
  const canRetry = !writing && (!messages.length || (lastMsg && lastMsg.role === 'user'))

  async function retryGrok() {
    if (writing) return
    openingJobs.delete(session.id)
    let nextMsgs = messages
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) {
      const placeholder: ChatMessage = { id: 'u-open-' + session.id, role: 'user', text: '开始分析' }
      nextMsgs = [...messages, placeholder]
      onPatch(session.id, {
        messages: nextMsgs,
        companionMemory: memoryFromSession(session, nextMsgs),
        updatedAt: Date.now(),
      })
    }
    const userMsg = [...nextMsgs].reverse().find((m): m is Extract<ChatMessage, { role: 'user' }> => m.role === 'user')
    const text = userMsg ? (userMsg.shot ? CHAT_SHOT_LABEL : userMsg.text || '开始分析') : '开始分析'
    const shot = userMsg?.shot
    setWriting(true)
    try {
      const grok = await askGrok({
        personaId: session.personaId,
        bossName: session.bossName,
        bossProfile: session.signals,
        messages: nextMsgs,
        userText: text,
        usedPmHashes: session.usedPmHashes,
        chatShot: shot,
        giftMemory: (session.giftMemory || []).map((g) => g.item),
        otherGiftNudge: session.otherGiftNudge,
        relationNow,
        relationGoal,
        ...giftMeta(session),
        companionMemory: memoryFromSession(session, nextMsgs),
        threadId: session.id,
      })
      const payload = payloadFromGrok(grok)
      const bot: ChatMessage = { id: 'b-' + Date.now(), role: 'bot', bot: payload }
      const newHashes = hashesFromPmLines(payload, session.bossName)
      const suggest = suggestedFromBot(payload)
      onPatch(session.id, {
        messages: [...nextMsgs, bot],
        updatedAt: Date.now(),
        lastSuggested: suggest.length ? suggest : session.lastSuggested,
        usedPmHashes: newHashes.length ? [...(session.usedPmHashes || []), ...newHashes] : session.usedPmHashes,
        companionMemory: memoryFromSession(session, [...nextMsgs, bot], payload),
      })
    } catch (e) {
      flashAskErr(e)
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
          {session.bossName}
          <small>
            {persona.name} · {relationSubtitle(parseRelationNow(session.relationNow), parseRelationGoal(session.relationGoal))}
          </small>
        </div>
        <button type="button" className="nav-more" aria-label="更多" onClick={() => setMore(true)}>
          ···
        </button>
      </div>
      <div className="scroll">
        {session.screenshot ? (
          <div className="shot-chip">
            <img src={session.screenshot} alt="主页截图" />
            <span>已读主页 · 初见不开软色情</span>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div className="row user" key={m.id}>
              <div className={'bubble-user' + (m.shot || m.shotOmitted ? ' shot-msg' : '')}>
                {m.shot ? <img className="chat-shot" src={m.shot} alt="聊天截图" /> : null}
                {m.shotOmitted && !m.shot ? <span>聊天截图</span> : null}
                {m.text && m.text !== CHAT_SHOT_LABEL ? m.text : null}
              </div>
            </div>
          ) : (
            <div className="row bot" key={m.id}>
              <BotBubble
                msg={m}
                onCopy={takeLine}
                onRefreshPms={isOpeningReplies(m.bot.replies) ? () => { void refreshPms(m.id) } : undefined}
              />
            </div>
          ),
        )}
        {writing ? (
          <div className="row bot">
            <div className="bubble-bot writing">正在写…</div>
          </div>
        ) : null}
        {canRetry ? (
          <div className="row bot">
            <button type="button" className="refresh-pms" onClick={() => void retryGrok()}>
              重试
            </button>
          </div>
        ) : null}
        <div className="hint">点 + 上传聊天截图 · 点黄色块复制发出，再回 1 或 2</div>
        <div ref={endRef} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button className="ico" type="button" aria-label="kb">
          <span className="kb" />
        </button>
        <input
          className="field"
          placeholder="回 1 或 2，贴原话；刷了xx 可以报给AI"
          value={input}
          disabled={writing}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="ico m" type="button" aria-label="sticker">
          M
        </button>
        <button
          className="ico plus"
          type="button"
          aria-label="上传聊天截图"
          disabled={writing}
          onClick={() => shotRef.current?.click()}
        >
          +
        </button>
        <input
          ref={shotRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void sendShot(f)
          }}
        />
      </form>
      {toast ? <div className="toast">{toast}</div> : null}
      {more ? (
        <ThreadMoreSheet
          onBible={() => {
            setMore(false)
            setSheet(true)
          }}
          onDelete={() => {
            setMore(false)
            onAskDelete(session)
          }}
          onClose={() => setMore(false)}
        />
      ) : null}
      {sheet ? <BibleSheet persona={persona} onClose={() => setSheet(false)} /> : null}
    </div>
  )
}



const CAREER_MODAL_KEY = 'xinsheng.careerModal.v1'

type AuthIntent =
  | { kind: 'chat' }
  | { kind: 'coach'; coachId: CoachId }
  | { kind: 'mine' }

function CareerModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="career-modal" role="dialog" aria-label="职业发展前景">
      <div className="career-modal-card">
        <h2 className="career-modal-title">职业发展前景</h2>
        <div className="career-modal-body">
          <p>无论兼职还是全职，只要用心经营，收入都有机会超越本职工作。公会中不少兼职陪玩的收入已远超原有薪资水平。</p>
          <p>🔥 成功秘诀：若无天赋，便以时间换机会。坚持排档、用心服务，积累客户资源只是时间问题。公会顶尖陪玩日均收入可达1000+，更有额外福利如私下转账、名牌包包等。</p>
          <p>💖 核心原则：在追求收入增长的同时，勿忘初心，保持真诚服务的态度。</p>
        </div>
        <button type="button" className="career-modal-btn" onClick={onDismiss}>
          确定
        </button>
      </div>
    </div>
  )
}

function AuthScreen({
  onAuthed,
}: {
  onAuthed: (user: AuthUser) => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const u = username.trim()
    if (!u || password.length < 5) {
      setNotice('')
      setErr(!u ? '请填写用户名' : '密码至少 5 位')
      return
    }
    setBusy(true)
    setErr('')
    setNotice('')
    try {
      if (mode === 'register') {
        const result = await registerAccount(u, password)
        if (result.pending) {
          setMode('login')
          setPassword('')
          setNotice(result.message)
          return
        }
        onAuthed(result.user)
      } else {
        const user = await loginAccount(u, password)
        onAuthed(user)
      }
    } catch (e) {
      setErr(toUserError(e, mode === 'register' ? '注册失败，请重试' : '登录失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pane">
      <div className="nav">
        <span className="nav-side" />
        <div className="title">心声</div>
        <span className="nav-side" />
      </div>
      <div className="settings auth-pane">
        <h1>{mode === 'register' ? '注册主播账号' : '主播登录'}</h1>
        <p className="lead">每个人的聊天只存在自己的账号里。退出后用同一账号登录会从服务器恢复。</p>
        <label className="field-label">用户名</label>
        <input
          className="textin"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label className="field-label">密码</label>
        <input
          className="textin"
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {notice ? <p className="auth-notice">{notice}</p> : null}
        {err ? <p className="err">{err}</p> : null}
        <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? '请稍候…' : mode === 'register' ? '提交注册' : '登录'}
        </button>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setErr('')
            setNotice('')
          }}
        >
          {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [boot, setBoot] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [tab, setTab] = useState<Tab>('me')
  const [stack, setStack] = useState<Stack>({ view: 'tabs' })
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)
  const [pendingAuth, setPendingAuth] = useState<AuthIntent | null>(null)
  const [showCareer, setShowCareer] = useState(false)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => {
    let alive = true
    void (async () => {
      const me = await fetchMe()
      if (!alive) return
      if (me) {
        setUser(me)
        try {
          const list = await fetchThreads()
          if (alive) setSessions(list)
        } catch (e) {
          if (alive && e instanceof Error && e.message === 'unauthorized') setSessions([])
        }
      }
      if (alive) {
        try {
          if (!window.localStorage.getItem(CAREER_MODAL_KEY)) setShowCareer(true)
        } catch {
          setShowCareer(true)
        }
        setBoot(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function dismissCareer() {
    try {
      window.localStorage.setItem(CAREER_MODAL_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowCareer(false)
  }

  async function afterAuth(next: AuthUser) {
    setUser(next)
    const intent = pendingAuth
    setPendingAuth(null)
    try {
      setSessions(await fetchThreads())
    } catch {
      setSessions([])
    }
    if (intent?.kind === 'coach') {
      setTab('rec')
      setStack({ view: 'coachSetup', coachId: intent.coachId })
    } else if (intent?.kind === 'mine') {
      setTab('me')
      setStack({ view: 'tabs' })
    } else {
      setTab('chat')
      setStack({ view: 'tabs' })
    }
  }

  async function doLogout() {
    await logoutAccount()
    setUser(null)
    setSessions([])
    setStack({ view: 'tabs' })
    setTab('me')
    setPendingDelete(null)
    setPendingAuth(null)
  }

  function kickIfUnauthorized(e: unknown) {
    if (e instanceof Error && e.message === 'unauthorized') {
      setUser(null)
      setSessions([])
    }
  }

  const settingsPersona = useMemo(() => {
    if (stack.view !== 'settings') return null
    return personaOf(stack.personaId)
  }, [stack])

  const thread = useMemo(() => {
    if (stack.view !== 'thread') return null
    return sessions.find((s) => s.id === stack.sessionId) ?? null
  }, [stack, sessions])

  function goTab(t: Tab) {
    setStack({ view: 'tabs' })
    if (t === 'chat' && !user) {
      setTab('chat')
      setPendingAuth({ kind: 'chat' })
      return
    }
    setPendingAuth(null)
    setTab(t)
  }

  function patchSession(id: string, patch: Partial<Session>) {
    setSessions((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    void (async () => {
      const wait = createWait.get(id)
      if (wait) await wait
      try {
        const saved = await patchThread(id, patch)
        if (!saved) {
          const full = sessionsRef.current.find((s) => s.id === id)
          const merged = full ? { ...full, ...patch } : null
          if (merged) await createThread(merged)
        }
      } catch (e) {
        kickIfUnauthorized(e)
      }
    })()
  }

  function confirmDeleteSession() {
    const target = pendingDelete
    if (!target) return
    setSessions((all) => dropSession(all, target.id))
    setPendingDelete(null)
    if (stack.view === 'thread' && stack.sessionId === target.id) {
      setTab('chat')
      setStack({ view: 'tabs' })
    }
    void deleteThread(target.id).catch(kickIfUnauthorized)
  }

  function startBoss(
    personaId: PersonaId,
    bossName: string,
    screenshot: string | null,
    fileName: string | undefined,
    caption: string | undefined,
    relationNow: RelationNow,
    relationGoal: RelationGoal,
  ) {
    const id = 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    const signals = resolveHomepageSignals({
      bossName,
      hasScreenshot: !!screenshot,
      fileName,
      caption,
    })
    const session: Session = {
      id,
      bossName,
      personaId,
      screenshot,
      signals,
      messages: [],
      updatedAt: Date.now(),
      usedPmHashes: [],
      relationNow,
      relationGoal,
    }
    setSessions((all) => [session, ...all])
    setTab('chat')
    setStack({ view: 'thread', sessionId: id })
    const created = createThread(session).catch(kickIfUnauthorized)
    createWait.set(id, created)
  }

  function startCoach(coachId: CoachId, bossName: string, bossGender: BossGender) {
    const coach = coachOfId(coachId)
    const id = 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    const session: Session = {
      id,
      bossName,
      personaId: coach.personaId,
      screenshot: null,
      messages: [],
      updatedAt: Date.now(),
      coachKind: coachId,
      bossGender,
      hostWho: coach.hostWhoFixed,
    }
    setSessions((all) => [session, ...all])
    setTab('chat')
    setStack({ view: 'thread', sessionId: id })
    const created = createThread(session).catch(kickIfUnauthorized)
    createWait.set(id, created)
  }

  const needAuthPane = !user && (tab === 'chat' || pendingAuth != null)

  let body: ReactNode
  if (needAuthPane) {
    body = <AuthScreen onAuthed={(u) => void afterAuth(u)} />
  } else if (stack.view === 'settings' && settingsPersona) {
    body = (
      <NewBossSettings
        persona={settingsPersona}
        onBack={() => setStack({ view: 'tabs' })}
        onStart={(n, shot, fn, cap, now, goal) => startBoss(settingsPersona.id, n, shot, fn, cap, now, goal)}
      />
    )
  } else if (stack.view === 'coachSetup') {
    body = (
      <CoachSetup
        coachId={stack.coachId}
        onBack={() => setStack({ view: 'tabs' })}
        onStart={(n, gender) => startCoach(stack.coachId, n, gender)}
      />
    )
  } else if (stack.view === 'thread' && thread) {
    body = thread.coachKind ? (
      <CoachThread
        session={thread}
        onBack={() => {
          setTab('chat')
          setStack({ view: 'tabs' })
        }}
        onPatch={patchSession}
        onAskDelete={setPendingDelete}
      />
    ) : (
      <ChatThread
        session={thread}
        onBack={() => {
          setTab('chat')
          setStack({ view: 'tabs' })
        }}
        onPatch={patchSession}
        onAskDelete={setPendingDelete}
      />
    )
  } else if (tab === 'rec') {
    body = (
      <RecommendCoaches
        onPick={(id) => {
          if (!user) {
            setPendingAuth({ kind: 'coach', coachId: id })
            return
          }
          setTab('rec')
          setStack({ view: 'coachSetup', coachId: id })
        }}
      />
    )
  } else if (tab === 'me') {
    body = (
      <MinePage
        key={tab}
        username={user?.username || ''}
        onLogout={() => void doLogout()}
        onLogin={() => setPendingAuth({ kind: 'mine' })}
      />
    )
  } else {
    body = (
      <SessionList
        sessions={sessions}
        username={user?.username || ''}
        onOpen={(id) => setStack({ view: 'thread', sessionId: id })}
        onAskDelete={setPendingDelete}
        onLogout={() => void doLogout()}
        onGoRec={() => goTab('rec')}
      />
    )
  }

  if (boot) {
    return (
      <div className="app-stage">
        <div className="phone">
          <StatusBar />
          <div className="pane">
            <p className="empty">加载中…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-stage">
      <div className="phone">
        <StatusBar />
        {body}
        {stack.view === 'tabs' ? <TabBar tab={tab} onTab={goTab} /> : null}
        {pendingDelete ? (
          <ConfirmDeleteSheet
            bossName={pendingDelete.bossName}
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDeleteSession}
          />
        ) : null}
        {showCareer ? <CareerModal onDismiss={dismissCareer} /> : null}
      </div>
    </div>
  )
}
