export type PersonaId = 'soft' | 'possessive' | 'tease' | 'ice' | 'sister' | 'yandere'

export type ReplyTone = '更甜' | '更撩'

export interface PersonaBible {
  who: string
  taboo: string
  onMic: string
  pm: string
  ticketHook: string
  spicyUnlock: string
}

export interface Persona {
  id: PersonaId
  name: string
  tag: string
  blurb: string
  setting: string
  emoji: string
  accent: string
  bible: PersonaBible
}

export type ReplyChannel = 'pm' | 'mic' | 'public'

export type RelationNow = '刚认识' | '朋友' | '暧昧' | '恋人' | '哥们' | '追求者' | '情人'

export type RelationGoal = '朋友' | '暧昧' | '恋人' | '哥们' | '情人'

export type HallScene =
  | '刚进厅'
  | '冷厅留人'
  | '查岗'
  | '要走试探'
  | '深夜树洞'
  | '表白'
  | '给别人刷礼'
  | '下档维护'

export const NEXT_ACTION_TYPES = [
  '继续发消息',
  '打电话',
  '打视频',
  '让他睡留钩',
  '小额要点',
  '先冷一冷',
  '换个钩子',
] as const

export type NextActionType = (typeof NEXT_ACTION_TYPES)[number]

export function isNextActionType(v: unknown): v is NextActionType {
  return typeof v === 'string' && (NEXT_ACTION_TYPES as readonly string[]).includes(v)
}

export type SeduceGate = 'no' | 'soft'

export type GiftPhase = 'before' | 'after' | 'other_host'

export interface NextAction {
  type: NextActionType
  reason: string
  seduce: SeduceGate
}

export interface GiftMemoryItem {
  item: string
  at: number
  kind?: 'self' | 'other'
}

export interface ReplyScript {
  n: number
  cue: string
  line: string
  pm?: string
  tone?: ReplyTone
  /** opening: copyable 私聊/公屏; later turns: 上麦 mic + 私聊补 */
  channel?: ReplyChannel
}

export interface BotPayload {
  analysis: string
  /** 教练栏：大哥此刻心态 */
  bossMindset: string
  /** 教练栏：主播应持有的内心心情 */
  hostMood: string
  /** 教练栏：语气（初见偏私聊，接话后偏上麦） */
  hostTone: string
  replies: ReplyScript[]
  spicy: boolean
  source?: 'grok' | 'gemini' | 'deepseek' | 'keyword'
  scene?: HallScene
  nextAction?: NextAction
  giftPhase?: GiftPhase
  /** 0-100，分析栏展示出票机率 */
  ticketOdds?: number
  /** 本轮可复制话术使用的亲密称呼 */
  addressUsed?: string
  /** 助聊路径：【注意】 */
  note?: string
  /** 助聊路径：模型原文 */
  rawText?: string
  /** 助聊开场白（非模型） */
  coachOpen?: boolean
}

export type ChatMessage =
  | { id: string; role: 'user'; text: string; shot?: string; shotOmitted?: boolean }
  | { id: string; role: 'bot'; bot: BotPayload }

export interface HomepageSignals {
  age?: string
  gender?: string
  ip?: string
  badges?: string[]
  hall?: string
  giftWall?: string
  tags?: string[]
  signature?: string
  hasCp?: boolean
  whale?: boolean
  caption?: string
  wealthRank?: string
  wealthDepth?: number
  charmTier?: string
  charmSub?: number
  onlineLv?: number
  achievement?: string
  achievementLv?: number
  /** 宸演示档：覆盖表内地板，单位人民币。 */
  spendRmbOverride?: number
  demoChen?: boolean
  bossHint?: string
}

export type CoachKind = 'sweet' | 'possessive' | 'tease' | 'ice' | 'sister' | 'yandere'

export type BossGender = '男' | '女' | '未知'

export interface Session {
  id: string
  bossName: string
  personaId: PersonaId
  screenshot: string | null
  signals?: HomepageSignals
  messages: ChatMessage[]
  updatedAt: number
  /** 已用过的初见私聊哈希，换一批/再分析不再重复 */
  usedPmHashes?: string[]
  /** 上一轮给主播的可复制私聊/回复，编号 1..n */
  lastSuggested?: { n: number; line: string }[]
  /** 主播确认发出的编号（1-based） */
  chosenIndex?: number
  chosenLine?: string
  /** 未选编号时只提醒一次 */
  choiceReminded?: boolean
  /** 本厅记下的出票（刷后），不上屏念数字 */
  giftMemory?: GiftMemoryItem[]
  /** 给别人刷礼后的挽留次数，最多点到 2 次 */
  otherGiftNudge?: number
  /** 目前关系；旧会话缺省为刚认识 */
  relationNow?: RelationNow
  /** 目标关系；旧会话缺省为朋友 */
  relationGoal?: RelationGoal
  /** 本会话陪伴记忆：事实条，不是复述作文 */
  companionMemory?: string
  /** 推荐页助聊会话 */
  coachKind?: CoachKind
  bossGender?: BossGender
  /** 本局人设：来自所选助聊卡的 hostWhoFixed，非用户手填 */
  hostWho?: string
}
