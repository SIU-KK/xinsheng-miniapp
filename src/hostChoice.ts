import { parseGiftPhase } from './hallScenes'
import type { BotPayload, GiftPhase, ReplyScript } from './types'

export const CHOICE_ASK = '请告诉我你选择了私聊几的回复'

export type SuggestedPm = { n: number; line: string }

export type ParsedHost = {
  choice?: number
  bossText: string
  choiceOnly: boolean
  giftPhase?: GiftPhase
  giftItem?: string
  hostAsk?: boolean
}

/** 主播在问教练策略，不是在贴大哥原话。短句「在」「过了然后呢」不当成 host-ask。 */
export function isHostAsk(raw: string): boolean {
  const full = (raw || '').replace(/^\uFEFF/, '').trim()
  if (!full) return false
  const compact = full.replace(/\s+/g, '')
  if (
    /^(在|在呀|在的|嗯+|哦+|啊+|哈+|好的|好呀|过了|然后呢|过了然后呢|才加上|比较我们才加上|忙不忙|在吗)$/.test(
      compact,
    )
  ) {
    return false
  }
  if (compact.length <= 6 && !/怎么|刷|答应|出票|该不该/.test(compact)) return false

  if (/怎么回[复]?|怎么接|怎么说|怎么聊|该怎么回/.test(compact)) return true
  if (/会不会刷|会答应|能不能刷|会刷[吗么]/.test(compact)) return true
  if (/刷200|给我刷|让他刷|再刷一|让他出票/.test(compact)) return true
  if (/出票/.test(compact) && /怎么|会不会|能不能|该不该|答应/.test(compact)) return true
  if (/怎么办|下一步怎么|该不该/.test(compact)) return true
  if (/我靠/.test(compact) && /怎么|刷|答应|回复/.test(compact)) return true
  if (/大哥会|他会答应|他会不会|他能不能|才能给[我咱]刷|怎么才能/.test(compact)) return true
  if (/[么吗？?]$/.test(compact) && /会答应|会刷|能不能刷|给我刷|怎么回/.test(compact)) return true
  return false
}

function asHostAsk(base: ParsedHost, source: string): ParsedHost {
  const quoted = source.match(/大哥说[:：]\s*([\s\S]+)/)
  const bossText = quoted ? quoted[1].trim() : ''
  if (!isHostAsk(source) && !isHostAsk(base.bossText)) return base
  // 明确报备「刷了/出票了」仍走礼物节点，不当纯提问。
  const event = /出票了|刷了/.test((source || '').replace(/\s/g, ''))
  if (event) return base
  return {
    ...base,
    hostAsk: true,
    bossText,
    choiceOnly: false,
  }
}

export function suggestedFromBot(bot: BotPayload): SuggestedPm[] {
  const copyable = bot.replies.filter((r) => r.channel === 'pm')
  return copyable.map((r, i) => ({ n: i + 1, line: r.line }))
}

export function offersCopyable(bot: BotPayload): boolean {
  return bot.replies.some((r) => r.channel === 'pm' && r.line)
}

export function quoteSlice(line: string, n = 16): string {
  const t = (line || '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  return t.slice(0, n) + '…'
}

export function formatSentPm(n: number, text: string): string {
  return `主播已发出私聊${n}：${text}`
}

export function parseHostInput(raw: string): ParsedHost {
  const full = (raw || '').replace(/^\uFEFF/, '').trim()
  if (!full) return { bossText: '', choiceOnly: false }

  const nl = full.indexOf('\n')
  const head = (nl >= 0 ? full.slice(0, nl) : full).trim()
  const tail = (nl >= 0 ? full.slice(nl + 1) : '').trim()

  const only = head.match(/^(?:私聊|回复)\s*([1-9])\s*$/) || head.match(/^([1-9])\s*$/)
  if (only) {
    const choice = Number(only[1])
    const bossText = stripBossPrefix(tail)
    return asHostAsk(withGift({ choice, bossText, choiceOnly: !bossText }), tail || full)
  }

  const inline = head.match(/^(?:私聊|回复)\s*([1-9])\s*[.、:：，,]?\s+([\s\S]+)$/)
    || head.match(/^([1-9])[.、:：，,]\s*([\s\S]+)$/)
    || head.match(/^([1-9])[ \t　]+([\s\S]+)$/)
  if (inline) {
    const choice = Number(inline[1])
    const rest = stripBossPrefix([inline[2], tail].filter(Boolean).join('\n'))
    return asHostAsk(withGift({ choice, bossText: rest, choiceOnly: !rest }), rest || full)
  }

  return asHostAsk(withGift({ bossText: stripBossPrefix(full), choiceOnly: false }), full)
}

function stripBossPrefix(s: string): string {
  return (s || '').replace(/^大哥说[:：]\s*/, '').trim()
}

function withGift(parsed: ParsedHost): ParsedHost {
  const g = parseGiftPhase(parsed.bossText)
  if (!g) return parsed
  return {
    ...parsed,
    bossText: g.rest,
    choiceOnly: false,
    giftPhase: g.phase,
    giftItem: g.item,
  }
}

export function ackChoiceBot(n: number, line: string): BotPayload {
  const slice = quoteSlice(line)
  const analysis =
    `记下了。你发出了私聊${n}「${slice}」。把大哥回你的原话贴过来，我再写下一条。`
  return {
    analysis,
    bossMindset: '他还没有把原话递过来，或你还没贴。',
    hostMood: '先等原话，不接不存在的上一句。',
    hostTone: '先别上麦。',
    replies: [],
    spicy: false,
    source: 'keyword',
    scene: '刚进厅',
    nextAction: {
      type: '继续发消息',
      reason: '先记下你发了哪条私聊。把大哥原话贴过来再写下一句。',
      seduce: 'no',
    },
  }
}

export function withChoiceAsk(bot: BotPayload): BotPayload {
  return bot
}

export function isOpeningReplies(replies: ReplyScript[]): boolean {
  if (!replies.some((r) => r.channel === 'pm')) return false
  return replies.every((r) => r.channel === 'pm' || r.channel === 'public')
}
