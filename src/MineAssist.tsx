import { useEffect, useRef, useState } from 'react'
import { postMineAssist, toUserError } from './api'

export const MINE_ASSIST_GREETING =
  '请问你想要了解什么？可以说福利制度、处罚规则、麦序/主持费、入职流程、如何进厅、整蛊、私信、大哥养成、沟通技巧、我的工资、上周流水、主持/麦序时长、实发工资、工会流水排名（仅本人）、收益看板、销售收益、工资发放、点位规则、主播/关联ID库、马甲、PK、游戏和我的菜单；我只按当前账号权限回答。'

type Msg = { role: 'user' | 'assistant'; content: string }

export function MineAssistPage({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: MINE_ASSIST_GREETING },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setErr('')
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const nextUser: Msg = { role: 'user', content: text }
    setMessages((prev) => [...prev, nextUser])
    setLoading(true)
    try {
      const reply = await postMineAssist({ message: text, history })
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setErr(toUserError(e, '解答失败，请重试'))
    } finally {
      setLoading(false)
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="pane mine-assist-pane">
      <div className="nav">
        <button type="button" aria-label="back" onClick={onBack}>
          {'<'}
        </button>
        <div className="title">
          AI解答
          <small>云梦传媒厅助手</small>
        </div>
        <span className="nav-side" />
      </div>
      <div className="scroll mine-assist-scroll">
        {messages.map((m, i) => (
          <div key={i} className={'row ' + (m.role === 'user' ? 'user' : 'bot')}>
            {m.role === 'user' ? (
              <div className="bubble-user">{m.content}</div>
            ) : (
              <div className="bubble-bot mine-assist-bubble">
                <div className="mine-assist-text">{m.content}</div>
              </div>
            )}
          </div>
        ))}
        {loading ? (
          <div className="row bot">
            <div className="bubble-bot mine-assist-bubble">
              <div className="mine-assist-text muted">思考中…</div>
            </div>
          </div>
        ) : null}
        {err ? <div className="mine-warn">{err}</div> : null}
        <div ref={bottomRef} />
      </div>
      <div className="composer">
        <input
          ref={inputRef}
          className="field"
          value={input}
          placeholder="问入职、进厅、整蛊、私信、养成、沟通、工资、马甲、PK…"
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="button"
          className="ico plus mine-assist-send"
          disabled={loading || !input.trim()}
          onClick={() => void send()}
          aria-label="发送"
        >
          发
        </button>
      </div>
    </div>
  )
}
