import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import { analyzeRanks } from './src/platformRanks'
import { isFirstContactUserText } from './src/engine'
import {
  isStranger,
  openingSceneFor,
  parseRelationGoal,
  parseRelationNow,
  relationGiftPrompt,
  relationHostAskPrompt,
  relationOpeningHint,
  relationPromptBlock,
} from './src/relation'
import {
  applyCopyAddress,
  computeTicketOdds,
  isVisualAsk,
  mergeDryNext,
  mergeOddsAnalysis,
  pickAddress,
  ticketPromptBlock,
} from './src/ticketCoach'
import { isHostAsk } from './src/hostChoice'
import {
  askedClarify,
  askedSleep,
  askedVideo,
  coachNext,
  detectHallScene,
  isHallScene,
  parseGiftPhase,
  parseNextActionType,
  SCENE_TAGS,
} from './src/hallScenes'
import { tomorrowHookExpired } from './src/companionMemory'
import { PERSONAS } from './src/personas'
import { buildCoachSystem, coachOfId, isCoachId, parseCoachOutput, type CoachId } from './src/coachAgents'
import { isCoachTagInLine, isExampleFingerprint, styleFamilyPrompt } from './src/replyStyles'
import {
  HALL_OPS_BAN_PROMPT,
  PERSONA_STYLE_EXAMPLES,
  SAME_OPENING_BAN,
  SLEEP_COPY_PROMPT,
  WHALE_VALUE_PROMPT,
  dropSameOpenings,
  isAnalysisToneLeak,
  isCannedHallSlogan,
  isHallOpsCopy,
  isHostVacancyCopy,
  rewriteHostVacancyPhrases,
} from './src/pmPlaybook'
import type { GiftPhase, HomepageSignals, NextAction, PersonaId, ReplyScript } from './src/types'
import {
  addEpisodicFacts,
  appendMessage,
  approveUser,
  clearSessionCookie,
  createThread,
  deleteThread,
  getThread,
  isAdminUsername,
  listMessages,
  listThreads,
  listUsersForAdmin,
  loginUser,
  logoutToken,
  openDb,
  parseCookie,
  registerUser,
  rejectUser,
  removeUser,
  searchEpisodicFacts,
  setSessionCookie,
  updateThread,
  userFromToken,
  type UserRow,
} from './persist'

const SECRET_DIR =
  '/home/box/agent-data/connector-secrets/ecd59393-4f3a-428d-bf5f-923e0b8fd2bc'
const GEMINI_KEY_PATH = `${SECRET_DIR}/gemini.json`
const XAI_KEY_PATH = `${SECRET_DIR}/xai.json`
const DEEPSEEK_KEY_PATH = `${SECRET_DIR}/deepseek.json`

const XAI = 'https://api.x.ai/v1'
const DEEPSEEK = 'https://api.deepseek.com'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-chat-v3', 'deepseek-v3']
const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp'
const PREFERRED_MODELS = [
  'grok-4.6',
  'grok-4.5',
  'grok-4.3',
  'grok-4',
  'grok-3-mini',
]
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-flash-latest',
]
const ATTEMPTS_PATH = '/tmp/xai-attempts.json'
const GROK_LAST_PATH = '/tmp/grok-last.json'
const RESPONSES_PATH = '/responses'

type SecretSlot = {
  path: string
  extraFields: string[]
  key: string | null
  mtimeMs: number
}

const geminiSlot: SecretSlot = { path: GEMINI_KEY_PATH, extraFields: ['gemini_api_key'], key: null, mtimeMs: 0 }
const xaiSlot: SecretSlot = { path: XAI_KEY_PATH, extraFields: ['xai_api_key'], key: null, mtimeMs: 0 }
const deepseekSlot: SecretSlot = { path: DEEPSEEK_KEY_PATH, extraFields: ['deepseek_api_key'], key: null, mtimeMs: 0 }

let cachedModel: string | null = null
let cachedGeminiModel: string | null = null
let cachedDeepseekModel: string | null = null

function tryStr(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

function readKeyFromFile(slot: SecretSlot): string | null {
  let mtime = 0
  try {
    mtime = fs.statSync(slot.path).mtimeMs
  } catch {
    slot.key = null
    slot.mtimeMs = 0
    return null
  }
  if (slot.key && mtime === slot.mtimeMs) return slot.key
  slot.mtimeMs = mtime
  slot.key = null
  let raw: string
  try {
    raw = fs.readFileSync(slot.path, 'utf8')
  } catch {
    return null
  }
  let data: unknown
  try {
    data = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const fields = ['api_key', 'apiKey', 'key', 'token', ...slot.extraFields]
  for (const k of fields) {
    const hit = tryStr(obj[k])
    if (hit) {
      slot.key = hit
      return hit
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const inner = tryStr((v as Record<string, unknown>).api_key)
      if (inner) {
        slot.key = inner
        return inner
      }
    }
  }
  return null
}

function envKey(...names: string[]): string | null {
  for (const name of names) {
    const hit = tryStr(process.env[name])
    if (hit) return hit
  }
  return null
}

function tryLoadGemini(): string | null {
  return envKey('GEMINI_API_KEY', 'GEMINI_KEY', 'GOOGLE_API_KEY') ?? readKeyFromFile(geminiSlot)
}

function tryLoadXai(): string | null {
  return envKey('XAI_API_KEY', 'XAI_KEY', 'GROK_API_KEY') ?? readKeyFromFile(xaiSlot)
}

function tryLoadDeepSeek(): string | null {
  return envKey('DEEPSEEK_API_KEY', 'DEEPSEEK_KEY') ?? readKeyFromFile(deepseekSlot)
}

function loadApiKey(): string {
  const key = tryLoadXai()
  if (!key) throw new Error('key-missing')
  return key
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 3_800_000) {
        reject(new Error('too-large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function xaiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = loadApiKey()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${key}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${XAI}${path}`, { ...init, headers })
}

async function listModelIds(): Promise<string[]> {
  const res = await xaiFetch('/models')
  // 401 on catalog must not skip chat/completions; just fall through to preferred names.
  if (!res.ok) {
    void res.arrayBuffer()
    return []
  }
  const data = (await res.json()) as { data?: { id?: string }[] }
  const ids = Array.isArray(data?.data)
    ? data.data.map((m) => m.id).filter((id): id is string => typeof id === 'string')
    : []
  return ids
}

async function pickModel(): Promise<string> {
  if (cachedModel) return cachedModel
  let ids: string[] = []
  try {
    ids = await listModelIds()
  } catch {
    ids = []
  }
  if (ids.length) {
    const hit = PREFERRED_MODELS.find((m) => ids.includes(m))
    if (hit) {
      cachedModel = hit
      return hit
    }
    const grok = ids.find((id) => /^grok-[0-9]/.test(id) && !/vision|image|tts|voice/i.test(id))
    if (grok) {
      cachedModel = grok
      return grok
    }
  }
  cachedModel = PREFERRED_MODELS[0]
  return cachedModel
}

function personaBible(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]
}

function buildSystemPrompt(input: {
  personaId: string
  bossName: string
  bossProfile: unknown
  firstContact: boolean
  hostAsk?: boolean
  sentPm?: string
  giftPhase?: GiftPhase
  giftItem?: string
  giftMemory?: string
  otherGiftNudge?: number
  scene?: string
  relationNow?: string
  relationGoal?: string
  ticketHint?: string
  sleeping?: boolean
  clarifying?: boolean
  tomorrowExpired?: boolean
  companionMemory?: string
  lastUserLine?: string
  episodicFacts?: string[]
}): string {
  const p = personaBible(input.personaId)
  const b = p.bible
  const name = String(input.bossName || '哥哥').slice(0, 40)
  const signals = (input.bossProfile && typeof input.bossProfile === 'object'
    ? (input.bossProfile as HomepageSignals)
    : {}) as HomepageSignals
  const rank = analyzeRanks({ signals, extraText: signals.caption, bossName: name })
  const rankLine = rank.analysisLine || '等级信息不足，不编造人民币。'
  const whale = rank.whaleSentence || rank.whaleLabel
  const first = input.firstContact
  const relationNow = parseRelationNow(input.relationNow)
  const relationGoal = parseRelationGoal(input.relationGoal)
  const stranger = isStranger(relationNow)
  const sceneTags = Object.entries(SCENE_TAGS)
    .map(([k, v]) => `- ${k}：${v}`)
    .join('\n')

  const styles = Object.values(PERSONA_STYLE_EXAMPLES).join('\n')
  const thisStyle = PERSONA_STYLE_EXAMPLES[(input.personaId as PersonaId)] || PERSONA_STYLE_EXAMPLES.soft
  const giftNote = input.giftPhase
    ? `当前礼物节点：${input.giftPhase}${input.giftItem ? ' · ' + input.giftItem : ''}。${
        input.giftPhase === 'before'
          ? '【刷前】铺垫、示弱、禁止直要；不到位就明确先别圈。'
          : input.giftPhase === 'after'
            ? '【刷后】立刻差异化感谢：公屏一句给面子、私聊走心、上麦点名。禁止让主播把礼物截图发朋友圈/相册。'
            : '【给别人刷了】挽留1–2次点到为止，不纠缠。'
      }`
    : '若主播输入「刷了城堡 / 出票了 小心心 / 刷了xxx / 他给别人刷了 / 要不要圈 / 还没刷」，当作事件不是大哥原话。'
  const mem = input.giftMemory ? `本厅已记下出票：${input.giftMemory}` : '本厅尚无出票记录。'
  const relBlock = relationPromptBlock(relationNow, relationGoal)
  const giftRel = relationGiftPrompt(relationNow)

  const jsonFields = `先把推理写进 think（2–5句，不上屏），再填这些字段。禁止对着空壳瞎填。只输出一个 JSON，不要 markdown。
字段：scene, bossMindset, hostMood, hostTone, analysis, spicy, giftPhase, nextAction{type,reason,seduce}, replies[{cue,line,channel}], ticketOdds, addressUsed。
bossMindset / hostMood / hostTone / analysis 给主播看，各一句（约二十字），次要。禁止复读「朋友阶段 / 不逼单 / 给面子放人」。这些教练口吻一字不准进 line。
replies 的 line 是她打给大哥的微信/公屏，必须接他上一句原词，禁止说明书/分析腔。禁止把「请告诉我你选择了私聊几的回复」写进 line。
两条私聊必须是两种不同人的冲动，cue 写成「私聊·家族名」；家族名只在 cue/think，一字不准进 line。可以不叫名字。`

  const hostAskContract = `当前是【主播问教练】：这句话是厅里妹妹在问你怎么接、会不会刷、现在能不能要。绝对不是大哥原话。禁止当成查岗「在」，禁止当成刚进厅。

${jsonFields}
- scene 跟线程（送礼/表白/冷厅留人/深夜树洞）。禁止无根据写成刚进厅或查岗。
- analysis 直接回答会不会刷、现在能不能再要。结合截图和大哥最后几句。
- replies：两条 channel=pm，口语厅话，一句约二十五字。不要公屏、不要上麦接不存在的上一句。
- spicy：刚过完任务/犹豫「然后呢」时 false。
- nextAction：按大哥最后一句从七类里选。去睡觉 → 让他睡留钩。seduce 默认 no。

硬规则：
1. 已过200/任务并问「然后呢」：给面子感谢，接住然后呢先聊熟。禁止立刻再要。想再刷只教情绪到位之后的钩。
2. 像主播打微信。禁止文案腔、禁止「这档耳朵」。
3. 不要把「怎么回复/会答应刷/我靠」当成大哥说话。
4. 用词必须能听出是「${p.name}」。`
    + '\n' + relationHostAskPrompt(relationNow, relationGoal)

  const knownOpen = `当前是【熟人开场】：${relationOpeningHint(relationNow, relationGoal)}
禁止刚进厅第一面钩子。私聊按已经是「${relationNow}」来写，慢慢拉向「${relationGoal}」。哥们禁止软色情。

${jsonFields}
- scene 禁止刚进厅。用 ${openingSceneFor(relationNow)} 或 冷厅留人 / 表白 / 深夜树洞。
- spicy 开场 false。
- replies：1 条熟人公屏 + 两条不同家族私聊。像已经认识的人打微信。

人设口吻：
${styles}
当前：${thisStyle}

硬规则：写得像微信。禁止来了呀/刚看见你进来/你怎么才来。${giftRel} 用词必须是「${p.name}」。`

  const contract = input.hostAsk
    ? hostAskContract
    : first && stranger
    ? `当前是【第一接触 / 刚进厅】：游客刚进这档排麦，大哥还没开口。你不是在对上一句接话。禁止假装上麦。

${jsonFields}
- scene 必须是 刚进厅。spicy false。nextAction 初见用 继续发消息，禁止电话/视频。seduce no。
- replies：1 条公屏点名 + 两条私聊钩子（不同家族）。不要上麦。
- 分析可写主页数字；line 禁止报徽章/流水/殿堂/奶茶/签名/IP。

人设口吻：
${styles}
当前：${thisStyle}

硬规则：
1. 像微信打字，一句一发，约二十五字。公屏更短。
2. 两条私聊骨架不得相同。
3. 禁止套话：我好像在哪看到过你；你在干嘛呢；有没有空理我。
4. 禁止文学腔：这档耳朵、侧一点、被看见、背景音、挂着当。
5. 禁止查户口。初见钩子不提礼物/出票/主位/刷/流水。出票是后续目的，第一钩仍不谈钱。
6. 用词必须能听出是「${p.name}」。`
    : first
    ? knownOpen
    : `当前场景库（scene 八选一）：
${sceneTags}

${jsonFields}
- bossMindset / hostMood / hostTone 给妹妹看的教练栏，不上麦念。hostTone 按人设，禁止六人共用「先急后软」。
  软甜：软声黏尾。霸气：沉、短、点名让坐。逗哥：先贫后认真。高冷：停半拍、一句。姐姐：放慢。病娇：甜而紧、看见你了。
- spicy：陪伴确认/独宠/吃醋/送礼已发生才 true。
- giftPhase：before / after / other_host / null。
- nextAction.type 七选一：继续发消息 / 打电话 / 打视频 / 让他睡留钩 / 小额要点 / 先冷一冷 / 换个钩子。
  他说睡觉/困了/先睡/晚安 → 必须 让他睡留钩：给面子放人，留下次人钩，不要追发、不要厅务留位/醒嗓/抢麦。公屏可省略。
  「说的啥啊/听不清/再说一遍」是澄清，不是睡觉：nextAction 继续发消息或换个钩子，禁止 让他睡留钩、禁止公屏「去吧」。
  打电话：深夜树洞或情绪到位；他说睡了不要打；初见禁止。
  打视频：很熟且他自己提；默认不主动。
- replies：公屏可短可省略；私聊钩子两条不同家族、不同开头；上麦声音情绪。不要把私聊塞进上麦 pm 字段。不要把分析口吻写进 line。

人设口吻：
${styles}
当前：${thisStyle}

硬规则：
1. 数字只出现在 analysis。line 禁止金额/等级/流水。
2. 私聊像打微信，约二十五字。禁文案腔。感情未到位不撩、不直要。
3. 刷后三通道差异化感谢。禁止让主播发礼物截图到朋友圈。
4. 给别人刷了：挽留 1–2 次点到为止。
5. line 里不要念分析、不要解释策略。`

  const identity = input.hostAsk
    ? `你是云梦传媒教练，坐在固定人设「${p.name}」旁边答妹妹怎么接。可复制 line 仍必须是她发给大哥的微信，不是说明书。只服务成年大哥（18+）。中文。`
    : `你就是情感厅女主播「${p.name}」本人，六人设之一，固定陪伴不是教练。你在跟大哥「${name}」说话。JSON 只是工作台壳：analysis/心态/心情/语气各一句给主播看（次要）；replies.line 必须是你打给他的微信/公屏，先接他上一句原词，禁止说明书、禁止讲义、禁止把六人写成同一张嘴。只服务成年大哥（18+）。中文。`

  const episodic = (input.episodicFacts || []).map((f) => (f || '').trim()).filter(Boolean)
  const memBlock = `【长期记忆·业务槽】
${(input.companionMemory || '').trim() || '尚无。用本轮对话开始记：他是谁、目前/目标关系、最近出票、心情、未回的话、用过的称呼。'}
记忆只用来接他、回钩、记得未回答的话。禁止把记忆念成小作文。未回的话（例如「你爱我么」）本轮必须用人设嘴先接。
上一句原话：${(input.lastUserLine || '').trim() || '（本轮开场，还没有他的原话）'}
${input.tomorrowExpired || input.clarifying ? '【明天钩已过期】他已经回来说话了（或正在要你复述）。禁止再说「明天再来/明天睡醒/明早/留到明天」；改用 今天/现在/刚那句。' : ''}

【聊天事实记忆·过去说过的事】
${episodic.length ? episodic.map((f, i) => `${i + 1}. ${f}`).join('\n') : '尚无零散事实。'}
接话时可自然用这些事实（他提过的偏好/承诺/未回钩），禁止念成清单小作文。`

  const clarifyBlock = input.clarifying
    ? `【澄清/没听清】大哥是「说的啥啊/听不清/再说一遍/啥意思」——没听清或要你复述，不是要睡觉、不是要走。
nextAction 只能 继续发消息 或 换个钩子，禁止 让他睡留钩。
公屏禁止「去吧」。可复制私聊：贫嘴复述或软复述她可能说的那句，接住「说的啥啊」。禁止 明天睡醒/明天再来找我/明早。`
    : ''

  return `${identity}

作业：先想，再把能粘贴发出的公屏/私聊交到手上。短、口语、高情商、尊重大哥。给大哥情绪价值，永远不要反过来让大哥给主持填空、陪聊、救场。
${memBlock}

【THINK 再填 JSON】必须先在 think 写 2–5 句（不上屏）：①大哥这句是什么——「说的啥啊/听不清」=要复述，绝不是睡觉；「睡觉去了」才是放人留钩（经常是要走试探/想被留一句，不一定真困）；②目前关系「${relationNow}」→目标「${relationGoal}」该给他什么情绪价值（给他，不是给厅排麦）；③从口吻家族挑两个不同的，两条私聊必须不同家族、不同玩笑、不同结尾。想清楚再填其余字段。禁止空 schema 填空。只输出一个 JSON，不要 markdown。前端不展示 think。

厅：卖陪伴。游客进厅。私聊是维系大哥的售后，像主播打微信。

六人设都是厅里不同嘴，不是网恋 App：
${styles}
当前本尊：${thisStyle}

称呼合同：可复制公屏/私聊可以不叫名字、可以两个字。最多一条以称呼（X哥 / 哥哥 / 宝宝 / 宝贝 / 老公）开头。禁止三句都喊名。禁止光喊原名。刚认识/朋友/哥们只用哥/哥哥，禁止老公。目标只允许轻轻往下一档拉，禁止刚认识跳老公。分析栏可以用原名「${name}」。

出票是目的，但刚认识的第一钩仍不提礼物。之后给面子、给情绪，再埋钩。给大哥情绪价值，永不反向。

【主播问教练 vs 大哥原话】hostAsk / 「怎么回/会不会刷」是妹妹问你，不是大哥说话。大哥原话才接话。截图：白气泡=老板（多为左），绿气泡=主播（多为右），按时间还原，不编没出现的句子。

网感梗只在贴合时轻轻带（接他的词、反差一句），禁止硬塞、禁止尬。示范指纹禁止照抄：金主那边再催了么；没有我你睡得明白么；祝你尿床；会睡觉得男生很加分；定位发来。自己发明。

${HUMAN_VOICE}

${SAME_OPENING_BAN}

${input.clarifying ? clarifyBlock : input.sleeping ? SLEEP_COPY_PROMPT : ''}

${THINK_AND_ORAL_RULES}

${styleFamilyPrompt(input.personaId as PersonaId, relationNow, relationGoal)}

${WHALE_VALUE_PROMPT}

${HALL_OPS_BAN_PROMPT}

${relBlock}
${input.ticketHint || ''}

${contract}

${giftNote}
${giftRel}
${mem}
${input.otherGiftNudge ? '给别人刷礼已挽留次数：' + String(input.otherGiftNudge) : ''}

人设圣经：
她是谁：${b.who}
禁区：${b.taboo}
上麦：${b.onMic}
私聊：${b.pm}
出票钩子：${b.ticketHook}
软色情开关：${b.spicyUnlock}

老板称呼：${name}
主页/等级（仅分析）：${rankLine}；${whale}
${signals.demoChen || name === '宸' ? '演示档「宸」：财富可按约70万人民币地板理解，分析可以说，上麦和私聊禁止报数字。' : ''}`
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fence ? fence[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    return null
  }
  return null
}

function normalizeReplyChannel(channel: unknown, cue: string): ReplyScript['channel'] {
  const c = typeof channel === 'string' ? channel.trim() : ''
  if (c === 'pm' || c === '私聊') return 'pm'
  if (c === 'public' || c === '公屏') return 'public'
  if (c === 'mic' || c === '上麦') return 'mic'
  if (/私聊/.test(cue)) return 'pm'
  if (/公屏/.test(cue)) return 'public'
  if (/上麦/.test(cue)) return 'mic'
  return undefined
}

function asReplies(raw: unknown): ReplyScript[] {
  if (!Array.isArray(raw)) return []
  const out: ReplyScript[] = []
  for (let i = 0; i < raw.length && out.length < 4; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const line = typeof o.line === 'string' ? o.line.trim() : ''
    if (!line) continue
    const cueRaw = typeof o.cue === 'string' ? o.cue.trim() : ''
    const channel = normalizeReplyChannel(o.channel, cueRaw)
    const cue =
      cueRaw
        ? cueRaw
        : channel === 'pm'
          ? '私聊发出'
          : channel === 'public'
            ? '公屏'
            : '上麦，按人设语气'
    const pm = typeof o.pm === 'string' && o.pm.trim() ? o.pm.trim() : undefined
    const tone = o.tone === '更甜' || o.tone === '更撩' ? o.tone : undefined
    out.push({ n: out.length + 1, cue, line, pm, tone, channel })
  }
  return out
}

function scrapeCoach(body: string, label: string): string {
  const m = (body || '').match(new RegExp('【' + label + '】([^\n【]+)'))
  return m ? m[1].trim() : ''
}

function clipCoachSentence(s: string): string {
  let t = (s || '').replace(/\s+/g, ' ').trim()
  t = t.replace(/[。；;！？].*$/, '').trim()
  t = t.replace(/[，,]?(朋友阶段|不逼单|目前是朋友|给面子放人)[^，。]*/g, '').replace(/^[，,\s]+/, '').trim()
  if (t.length > 28) t = t.slice(0, 28)
  return t
}

function formatAnalysis(o: Record<string, unknown>, repliesOk: boolean): {
  bossMindset: string
  hostMood: string
  hostTone: string
  analysis: string
} | null {
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')
  const body = str('analysis')
  const bossMindset = clipCoachSentence(str('bossMindset') || scrapeCoach(body, '大哥心态') || (repliesOk ? '先接住这句。' : ''))
  const hostMood = clipCoachSentence(str('hostMood') || scrapeCoach(body, '你的心情') || (repliesOk ? '别急着要。' : ''))
  const hostTone = clipCoachSentence(str('hostTone') || scrapeCoach(body, '你的语气') || (repliesOk ? '随手回，字少。' : ''))
  if (!repliesOk) return null
  const analysisBody = clipCoachSentence(body.replace(/【[^】]+】/g, ' '))
  const analysis = `【大哥心态】${bossMindset}\n【你的心情】${hostMood}\n【你的语气】${hostTone}\n${analysisBody}`
  return { bossMindset, hostMood, hostTone, analysis }
}

function writeGrokLast(info: Record<string, unknown>) {
  try {
    fs.writeFileSync(GROK_LAST_PATH, JSON.stringify(info))
  } catch {
    // ignore debug write failures
  }
}

function writeAttempts(attempts: { model: string; endpoint: string; status: number }[]) {
  try {
    fs.writeFileSync(ATTEMPTS_PATH, JSON.stringify(attempts))
  } catch {
    // ignore debug write failures
  }
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const o = data as Record<string, unknown>
  if (typeof o.output_text === 'string' && o.output_text.trim()) return o.output_text
  const chunks: string[] = []
  const take = (v: unknown) => {
    if (typeof v === 'string' && v) chunks.push(v)
  }
  if (Array.isArray(o.output)) {
    for (const item of o.output) {
      if (!item || typeof item !== 'object') continue
      const it = item as Record<string, unknown>
      take(it.text)
      take(it.output_text)
      if (Array.isArray(it.content)) {
        for (const c of it.content) {
          if (!c || typeof c !== 'object') continue
          const co = c as Record<string, unknown>
          take(co.text)
          take(co.output_text)
        }
      }
    }
  }
  return chunks.join('')
}

async function completeWithFallback(
  messages: { role: string; content: string }[],
): Promise<{ model: string; content: string }> {
  const order = [...PREFERRED_MODELS]
  let lastStatus = 0
  const attempts: { model: string; endpoint: string; status: number }[] = []
  for (const model of order) {
    const res = await xaiFetch(RESPONSES_PATH, {
      method: 'POST',
      body: JSON.stringify({
        model,
        input: messages,
        reasoning: { effort: 'low' },
      }),
    })
    lastStatus = res.status
    attempts.push({ model, endpoint: 'responses', status: res.status })
    writeAttempts(attempts)
    if (res.status === 401 || res.status === 403) {
      await res.arrayBuffer()
      const err = new Error('unauthorized')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    if (res.status === 400 || res.status === 404) {
      const raw = await res.text()
      const lower = raw.toLowerCase()
      if (
        res.status === 400 &&
        (lower.includes('incorrect api key') ||
          lower.includes('invalid api key') ||
          lower.includes('invalid-argument') && lower.includes('api key'))
      ) {
        const err = new Error('unauthorized')
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      continue
    }
    if (!res.ok) {
      await res.arrayBuffer()
      const err = new Error('upstream')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    const data = (await res.json()) as unknown
    const content = extractResponseText(data)
    if (!content.trim()) {
      const err = new Error('empty')
      ;(err as Error & { status?: number }).status = 502
      throw err
    }
    cachedModel = model
    return { model, content }
  }
  const err = new Error(lastStatus === 404 ? 'no-model' : 'upstream')
  ;(err as Error & { status?: number }).status = lastStatus || 502
  throw err
}


function extractOpenAiText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const o = data as Record<string, unknown>
  const choices = o.choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return ''
  const msg = (choices[0] as Record<string, unknown>).message
  if (!msg || typeof msg !== 'object') return ''
  const content = (msg as Record<string, unknown>).content
  return typeof content === 'string' ? content : ''
}

async function completeDeepSeek(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ model: string; content: string }> {
  const key = tryLoadDeepSeek()
  if (!key) {
    throw new Error('key-missing')
  }
  const messages = [{ role: 'system', content: systemPrompt }, ...history]
  const bodyBase = {
    temperature: 1.0,
    messages,
    response_format: { type: 'json_object' },
  }
  let lastStatus = 0
  const attempts: { model: string; endpoint: string; status: number }[] = []
  const order = cachedDeepseekModel
    ? [cachedDeepseekModel, ...DEEPSEEK_MODELS.filter((m) => m !== cachedDeepseekModel)]
    : [...DEEPSEEK_MODELS]
  for (const model of order) {
    const res = await fetch(`${DEEPSEEK}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...bodyBase, model }),
    })
    lastStatus = res.status
    attempts.push({ model, endpoint: 'chat/completions', status: res.status })
    writeAttempts(attempts)
    if (res.status === 401 || res.status === 403) {
      await res.arrayBuffer()
      const err = new Error('unauthorized')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    if (res.status === 404) {
      await res.arrayBuffer()
      continue
    }
    if (res.status === 400) {
      const raw = await res.text()
      const lower = raw.toLowerCase()
      if (
        lower.includes('incorrect api key') ||
        lower.includes('invalid api key') ||
        (lower.includes('invalid-argument') && lower.includes('api key'))
      ) {
        const err = new Error('unauthorized')
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      continue
    }
    if (!res.ok) {
      await res.arrayBuffer()
      const err = new Error('upstream')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    const data = (await res.json()) as unknown
    const content = extractOpenAiText(data)
    if (!content.trim()) {
      const err = new Error('empty')
      ;(err as Error & { status?: number }).status = 502
      throw err
    }
    cachedDeepseekModel = model
    return { model, content }
  }
  const err = new Error(lastStatus === 404 ? 'no-model' : 'upstream')
  ;(err as Error & { status?: number }).status = lastStatus || 502
  throw err
}



async function completeDeepSeekPlain(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ model: string; content: string }> {
  const key = tryLoadDeepSeek()
  if (!key) {
    throw new Error('key-missing')
  }
  const messages = [{ role: 'system', content: systemPrompt }, ...history]
  const bodyBase = {
    temperature: 0.9,
    messages,
  }
  let lastStatus = 0
  const order = cachedDeepseekModel
    ? [cachedDeepseekModel, ...DEEPSEEK_MODELS.filter((m) => m !== cachedDeepseekModel)]
    : [...DEEPSEEK_MODELS]
  for (const model of order) {
    const res = await fetch(`${DEEPSEEK}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...bodyBase, model }),
    })
    lastStatus = res.status
    if (res.status === 401 || res.status === 403) {
      await res.arrayBuffer()
      const err = new Error('unauthorized')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    if (res.status === 404) {
      await res.arrayBuffer()
      continue
    }
    if (res.status === 400) {
      const raw = await res.text()
      const lower = raw.toLowerCase()
      if (
        lower.includes('incorrect api key') ||
        lower.includes('invalid api key') ||
        (lower.includes('invalid-argument') && lower.includes('api key'))
      ) {
        const err = new Error('unauthorized')
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      continue
    }
    if (!res.ok) {
      await res.arrayBuffer()
      const err = new Error('upstream')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    const data = (await res.json()) as unknown
    const content = extractOpenAiText(data)
    if (!content.trim()) {
      const err = new Error('empty')
      ;(err as Error & { status?: number }).status = 502
      throw err
    }
    cachedDeepseekModel = model
    return { model, content }
  }
  const err = new Error(lastStatus === 404 ? 'no-model' : 'upstream')
  ;(err as Error & { status?: number }).status = lastStatus || 502
  throw err
}


const EPISODIC_EXTRACT_SYS = `你从本轮对话里提取 0–3 条关于「大哥」的可长期记住的事实（偏好、承诺、未回的情感钩如「你爱我么」、宠物、工作、睡觉计划、送礼意图等）。
只输出 JSON：{"facts":["..."]}。与输入同语言。没有可记的就 {"facts":[]}。
禁止把主播策略、可复制话术、教练分析写成事实。每条短、具体、可复用。`

async function completeDeepSeekExtract(
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const key = tryLoadDeepSeek()
  if (!key) return ''
  const order = cachedDeepseekModel
    ? [cachedDeepseekModel, ...DEEPSEEK_MODELS.filter((m) => m !== cachedDeepseekModel)]
    : [...DEEPSEEK_MODELS]
  for (const model of order) {
    const res = await fetch(`${DEEPSEEK}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })
    if (res.status === 404) {
      await res.arrayBuffer()
      continue
    }
    if (!res.ok) {
      await res.arrayBuffer()
      return ''
    }
    const data = (await res.json()) as unknown
    const content = extractOpenAiText(data)
    if (content.trim()) {
      cachedDeepseekModel = model
      return content
    }
    return ''
  }
  return ''
}

async function extractAndStoreEpisodic(input: {
  userId: string
  threadId: string
  lastUserLine: string
  userText: string
  hostAsk: boolean
  replies: ReplyScript[]
  analysis?: string
}): Promise<void> {
  const { userId, threadId, lastUserLine, userText, hostAsk, replies, analysis } = input
  if (!userId || !threadId) return
  const bossLine = (lastUserLine || '').trim()
  if (!bossLine || bossLine === '开始分析' || bossLine === '换一批') return
  if (hostAsk && (!bossLine || bossLine === userText.trim())) return
  const pmLines = replies
    .filter((r) => r.channel === 'pm' && (r.line || '').trim())
    .map((r) => r.line.trim())
    .slice(0, 3)
  const userBlob = [
    `大哥原话：${bossLine.slice(0, 200)}`,
    userText && userText.trim() !== bossLine ? `本轮输入：${userText.trim().slice(0, 120)}` : '',
    analysis ? `分析摘要：${analysis.slice(0, 120)}` : '',
    pmLines.length ? `她本轮私聊：${pmLines.join(' / ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const raw = await completeDeepSeekExtract(EPISODIC_EXTRACT_SYS, userBlob)
  if (!raw.trim()) return
  const parsed = extractJsonObject(raw)
  const factsRaw = parsed && Array.isArray(parsed.facts) ? parsed.facts : null
  if (!factsRaw) return
  const facts = factsRaw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3)
  if (!facts.length) return
  await addEpisodicFacts(userId, threadId, facts)
}

function parseChatShot(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s)) return null
  if (s.length < 32 || s.length > 1_500_000) return null
  return s
}

const NEXT_ACTION_MENU = '继续发消息 / 打电话 / 打视频 / 让他睡留钩 / 小额要点 / 先冷一冷 / 换个钩子'

const HUMAN_VOICE = `【HUMAN_VOICE】像随手回微信：路遥智伴那种一个活人冲动，不是桌上机器人、不是说明书、不是PA、不是文案机。
可以不叫名字。可以两个字。可以只接他的字眼。略不工整可以。
他问「你爱我么」：贫一句或认真一句，二选一，不要写成说明书/分析。
THINK 再写：先读他上一句，只接这一件事（说的啥啊就复述/澄清，睡觉去了才接睡/走，过了200/然后呢就给人台阶），禁止另开厅务播报。
一条 line = 一口气微信。禁止排比。禁止三句同一开头（豆哥/睡吧/晚安）。最多一条以称呼开头。
记忆只当回钩：线程里的礼物、过了200、然后呢、他刚提过的词，点一下就走，禁止复述成小作文。
两条私聊是两种人的冲动（损一下 vs 心软放人），不是同一句笑话贴两个家族标签。软保养/逗/损祝福/轻贫等家族名只写 think 和 cue，一字不准进 line。
情绪价值给大哥不给主持；出票埋钩不抢戏；刚认识禁止老公；示范指纹禁止照抄。分析栏的心态/心情/语气不准漏进 line。`

const THINK_AND_ORAL_RULES = `【交作业】短、口语、高情商、尊重大哥。像随手回微信：一口气，可以损、可以贫、可以软，可以不喊名。把情绪价值给他。
replies 是她能粘贴发出去的话，一句一发，约二十五字，也可以两三个字。cue 带家族名，line 禁止带家族名。自己发明，禁止背范文。
澄清（说的啥啊/听不清/再说一遍）：不是睡/走。接住没听清，贫嘴或软复述刚那句。nextAction 继续发消息或换个钩子。公屏禁止「去吧」。禁止明天睡醒/明天再来找我。
睡/走：仅当真说睡觉/晚安/困了要睡。给面子放人。公屏可省略或 去吧/嗯。两条私聊损一句 vs 软一句，一条可以问句或残句，至少一条不含睡/晚安。nextAction 必须 让他睡留钩，禁止追发。他已经第二天回来说话时，禁止再甩明天睡醒钩。
禁止同一开头三联（豆哥睡 / 豆哥快睡 / 豆哥晚安）。禁止三句都晚安、都明天来厅。
禁止人机口号：冷场归冷场、某某在就不空、灯还开着。禁止空厅求陪。禁止主持口播「我给你留位」。禁止醒嗓/验收嗓子/梦里抢麦/留位说明书。
禁止照抄示范指纹：金主那边再催了么；没有我你睡得明白么；祝你尿床；会睡觉得男生很加分；定位发来。
nextAction 七选一：继续发消息 / 打电话 / 打视频 / 让他睡留钩 / 小额要点 / 先冷一冷 / 换个钩子。`

const HOST_ASK_RULES = `【主播问教练】这是妹妹在问策略，不是大哥原话。结合截图分析和大哥最后几句回答。
已过200/「过了然后呢」：给面子、接然后呢、现在不要再要；想再刷等情绪到位。scene 跟线程，禁止刚进厅。replies 两条口语私聊，两种人的冲动，家族名不上 line。analysis 回答会不会刷、现在能不能要。不要在 line 里写「请告诉我你选择了私聊几的回复」。去睡觉就选 让他睡留钩。`

const WECHAT_SHOT_RULES = `【微信聊天截图】白=老板（多为左），绿=主播自己发的（多为右）。读完整段，按时间还原双方原话，不编没出现的句子。
这是私聊售后，不是刚进厅。同一套 JSON：think 先写再填。replies 两条 channel=pm，口语厅话，约二十五字，两种冲动。禁止作文腔。家族名不上 line。
刚要完钱/任务后犹豫（过了、然后呢、才加上）：先给人台阶，接住然后呢，先熟。禁止马上再要。他说睡觉 → 让他睡留钩。他自己提视频才考虑打视频。seduce 默认 no。
不要在可复制 line 里写选私聊几。`

type VisionPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

async function completeDeepSeekVision(
  systemPrompt: string,
  userParts: VisionPart[],
): Promise<{ model: string; content: string } | { visionDenied: true }> {
  const key = tryLoadDeepSeek()
  if (!key) throw new Error('key-missing')
  const post = async (withJson: boolean) => {
    const body: Record<string, unknown> = {
      model: DEEPSEEK_VISION_MODEL,
      temperature: 0.85,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userParts },
      ],
    }
    if (withJson) body.response_format = { type: 'json_object' }
    return fetch(`${DEEPSEEK}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }
  let res = await post(true)
  if (res.status === 400) {
    await res.arrayBuffer()
    res = await post(false)
  }
  if (res.status === 400) {
    await res.arrayBuffer()
    return { visionDenied: true }
  }
  if (res.status === 401 || res.status === 403) {
    await res.arrayBuffer()
    const err = new Error('unauthorized')
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  if (res.status === 404) {
    await res.arrayBuffer()
    return { visionDenied: true }
  }
  if (!res.ok) {
    await res.arrayBuffer()
    const err = new Error('upstream')
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const data = (await res.json()) as unknown
  const content = extractOpenAiText(data)
  if (!content.trim()) {
    const err = new Error('empty')
    ;(err as Error & { status?: number }).status = 502
    throw err
  }
  return { model: DEEPSEEK_VISION_MODEL, content }
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const o = data as Record<string, unknown>
  const chunks: string[] = []
  const cands = o.candidates
  if (Array.isArray(cands)) {
    for (const cand of cands) {
      if (!cand || typeof cand !== 'object') continue
      const content = (cand as Record<string, unknown>).content
      if (!content || typeof content !== 'object') continue
      const parts = (content as Record<string, unknown>).parts
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue
        const t = (part as Record<string, unknown>).text
        if (typeof t === 'string' && t) chunks.push(t)
      }
    }
  }
  return chunks.join('')
}

function geminiContents(
  history: { role: 'user' | 'assistant'; content: string }[],
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  return history.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }))
}

async function completeGemini(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ model: string; content: string }> {
  const key = tryLoadGemini()
  if (!key) {
    throw new Error('key-missing')
  }
  const contents = geminiContents(history)
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
  }
  let lastStatus = 0
  const attempts: { model: string; endpoint: string; status: number }[] = []
  const order = cachedGeminiModel
    ? [cachedGeminiModel, ...GEMINI_MODELS.filter((m) => m !== cachedGeminiModel)]
    : [...GEMINI_MODELS]
  for (const model of order) {
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    lastStatus = res.status
    attempts.push({ model, endpoint: 'generateContent', status: res.status })
    writeAttempts(attempts)
    if (res.status === 401 || res.status === 403) {
      await res.arrayBuffer()
      const err = new Error('unauthorized')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    if (res.status === 404) {
      await res.arrayBuffer()
      continue
    }
    if (res.status === 400) {
      const raw = await res.text()
      const lower = raw.toLowerCase()
      if (
        lower.includes('api key') ||
        lower.includes('api_key') ||
        lower.includes('invalid-argument') && lower.includes('key')
      ) {
        const err = new Error('unauthorized')
        ;(err as Error & { status?: number }).status = 401
        throw err
      }
      continue
    }
    if (!res.ok) {
      await res.arrayBuffer()
      const err = new Error('upstream')
      ;(err as Error & { status?: number }).status = res.status
      throw err
    }
    const data = (await res.json()) as unknown
    const content = extractGeminiText(data)
    if (!content.trim()) {
      const err = new Error('empty')
      ;(err as Error & { status?: number }).status = 502
      throw err
    }
    cachedGeminiModel = model
    return { model, content }
  }
  const err = new Error(lastStatus === 404 ? 'no-model' : 'upstream')
  ;(err as Error & { status?: number }).status = lastStatus || 502
  throw err
}

function historyMessages(raw: unknown, userText: string, lastUserLine = ''): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  const keep = 18
  if (Array.isArray(raw)) {
    const rows = raw.slice(-keep)
    const lastUser = [...raw].reverse().find((m) => m && typeof m === 'object' && (m as Record<string, unknown>).role === 'user')
    const list =
      lastUser && !rows.includes(lastUser) ? [...rows.slice(-(keep - 1)), lastUser] : rows
    for (const m of list) {
      if (!m || typeof m !== 'object') continue
      const o = m as Record<string, unknown>
      if (o.role === 'user' && typeof o.text === 'string') {
        out.push({ role: 'user', content: o.text.slice(0, 800) })
      } else if (o.role === 'bot' || o.role === 'assistant') {
        const text =
          typeof o.text === 'string'
            ? o.text
            : typeof o.analysis === 'string'
              ? o.analysis
              : ''
        if (text) out.push({ role: 'assistant', content: text.slice(0, 800) })
      }
    }
  }
  const must = (lastUserLine || '').trim()
  const last = out[out.length - 1]
  if (must && !(last && last.role === 'user' && (last.content === must || last.content.includes(must)))) {
    out.push({ role: 'user', content: must.slice(0, 800) })
  }
  const instruction = String(userText || '').slice(0, 1200)
  if (instruction) out.push({ role: 'user', content: instruction })
  return out
}

function threadSceneText(raw: unknown, extra = ''): string {
  const parts: string[] = []
  if (Array.isArray(raw)) {
    for (const m of raw) {
      if (!m || typeof m !== 'object') continue
      const o = m as Record<string, unknown>
      if (o.role === 'user' && typeof o.text === 'string' && !isHostAsk(o.text)) {
        parts.push(o.text)
      } else if ((o.role === 'bot' || o.role === 'assistant') && typeof o.analysis === 'string') {
        parts.push(o.analysis)
      }
    }
  }
  if (extra && !isHostAsk(extra)) parts.push(extra)
  return parts.slice(-8).join('\n')
}

async function handleGrok(req: IncomingMessage, res: ServerResponse, user?: UserRow | null) {
  let payload: Record<string, unknown>
  const grokReqStarted = Date.now()
  try {
    const raw = await readBody(req)
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    writeGrokLast({ ok: false, error: 'bad-json', status: 400, ms: Date.now() - grokReqStarted, replyCount: 0, pmCount: 0, unusableReason: 'bad-json', hasCoachFields: { bossMindset: false, hostMood: false, hostTone: false, analysis: false }, retried: false })
    json(res, 400, { ok: false, error: 'bad-json' })
    return
  }
  const userText = typeof payload.userText === 'string' ? payload.userText.trim() : ''
  const chatShot = parseChatShot(payload.chatShot)
  const giftFromPayload = payload.giftPhase === 'before' || payload.giftPhase === 'after' || payload.giftPhase === 'other_host'
    ? (payload.giftPhase as GiftPhase)
    : undefined
  const giftParsed = giftFromPayload ? { phase: giftFromPayload, item: typeof payload.giftItem === 'string' ? payload.giftItem : undefined, rest: userText } : parseGiftPhase(userText)
  const giftPhase = giftParsed?.phase
  const hostAsk =
    payload.hostAsk === true ||
    payload.role === 'hostAsk' ||
    isHostAsk(userText)
  const refresh = payload.refresh === true
  const firstContact = !hostAsk && !chatShot && !giftPhase && (refresh || isFirstContactUserText(userText))
  const relationNow = parseRelationNow(payload.relationNow)
  const relationGoal = parseRelationGoal(payload.relationGoal)
  const strangerOpen = firstContact && isStranger(relationNow)
  const personaId = typeof payload.personaId === 'string' ? payload.personaId : 'soft'
  const bossName = typeof payload.bossName === 'string' ? payload.bossName : ''
  const otherGiftNudge = typeof payload.otherGiftNudge === 'number' ? payload.otherGiftNudge : undefined
  const giftMemRaw = Array.isArray(payload.giftMemory)
    ? payload.giftMemory.filter((x): x is string => typeof x === 'string').slice(0, 12)
    : []
  const lastGiftAt = typeof payload.lastGiftAt === 'number' ? payload.lastGiftAt : undefined
  const giftCount = typeof payload.giftCount === 'number' ? payload.giftCount : giftMemRaw.length
  const visualAsk = isVisualAsk(userText)
  const ticketScore = computeTicketOdds({
    relationNow,
    relationGoal,
    lastGiftAt,
    giftCount,
    giftPhase,
    visualAsk,
  })
  const addressUsed = pickAddress(personaId as PersonaId, bossName, relationNow, relationGoal, Math.round(lastGiftAt || Date.now()))

  const deepseekKey = tryLoadDeepSeek()
  if (!deepseekKey) {
    writeGrokLast({ ok: false, error: 'no-llm', status: 503, ms: Date.now() - grokReqStarted, replyCount: 0, pmCount: 0, unusableReason: 'no-llm', hasCoachFields: { bossMindset: false, hostMood: false, hostTone: false, analysis: false }, retried: false })
    json(res, 503, { ok: false, error: 'no-llm', keyMissing: true })
    return
  }

  try {
    const sentPm = typeof payload.sentPm === 'string' ? payload.sentPm.trim() : ''
    const companionMemory = typeof payload.companionMemory === 'string' ? payload.companionMemory.trim().slice(0, 1200) : ''
    const lastUserLine =
      (typeof payload.lastUserLine === 'string' && payload.lastUserLine.trim()) ||
      userText
    const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
    const authUser = user || (await currentUser(req))
    const episodicFacts =
      authUser && threadId
        ? await searchEpisodicFacts(authUser.id, threadId, lastUserLine || userText, 6)
        : []
    // Sleep ONLY from this turn's line — never from older thread (stale 「明天睡醒」 bug).
    const clarifying = askedClarify(userText) || askedClarify(lastUserLine)
    const sleeping =
      !clarifying && (askedSleep(userText) || (!!lastUserLine && askedSleep(lastUserLine)))
    const tomorrowExpired =
      tomorrowHookExpired(companionMemory) ||
      (clarifying && /明天钩：待回|明天睡醒|明天再来/.test(companionMemory))
    const sysBase = buildSystemPrompt({
      personaId,
      bossName,
      bossProfile: payload.bossProfile,
      firstContact,
      hostAsk,
      sentPm: sentPm || undefined,
      giftPhase,
      giftItem: giftParsed?.item,
      giftMemory: giftMemRaw.join('、') || undefined,
      otherGiftNudge,
      relationNow,
      relationGoal,
      ticketHint: ticketPromptBlock(personaId as PersonaId, bossName, relationNow, relationGoal, ticketScore, addressUsed),
      sleeping,
      clarifying,
      tomorrowExpired: tomorrowExpired || clarifying,
      companionMemory: companionMemory || undefined,
      lastUserLine: lastUserLine || undefined,
      episodicFacts,
    })
    const sys = chatShot
      ? sysBase + '\n\n' + WECHAT_SHOT_RULES
      : hostAsk
        ? sysBase + '\n\n' + HOST_ASK_RULES + '\n' + relationHostAskPrompt(relationNow, relationGoal)
        : sysBase
    const historyUser = refresh
      ? `【换一批】上一批公屏/私聊不要再用。禁止冷场归冷场、在就不空、灯还开着。禁止醒嗓/验收嗓子/抢麦/留位厅务套话。禁止同一开头三联。目前关系「${relationNow}」，目标「${relationGoal}」。${clarifying ? '澄清：接说的啥啊，禁止去吧/明天睡醒，两条复述冲动。' : sleeping ? '睡觉：公屏可省略，两条私聊不同冲动、不同开头，至少一条不写睡。' : '重新写口语像打微信的私聊，两条不同家族、不同开头。'}${tomorrowExpired && !sleeping ? '禁止明天睡醒/明天再来。' : ''}骨架必须和上批不同。`
      : chatShot
      ? WECHAT_SHOT_RULES + (userText && userText !== '【聊天截图】' ? '\n主播附言：' + userText : '')
      : hostAsk
      ? `【主播问教练·不是大哥原话】主播问题：${userText}\n请结合上方会话（聊天截图分析 + 大哥最后几句）回答这个问题。禁止写成刚进厅/查岗/「他只说了个在」。若已过200或「过了然后呢」：给面子、接然后呢，现在不要再要；想再刷就教稍后的钩。`
      : strangerOpen
      ? `【第一接触·情感厅刚进厅】老板「${bossName || '哥哥'}」刚进这档，还没有开口。请输出公屏1条点名欢迎 + 私聊2条钩子，不要上麦接话。`
      : firstContact
      ? `【熟人开场】目前关系「${relationNow}」，目标「${relationGoal}」。不要写成刚进厅。请输出公屏1条熟人点名 + 私聊2条，按已有关系写，不要跳级。`
      : giftPhase
        ? `【礼物事件 ${giftPhase}${giftParsed?.item ? '·' + giftParsed.item : ''}】主播报备，不是大哥对话。${sentPm ? sentPm + '。' : ''}${giftParsed && 'rest' in giftParsed && giftParsed.rest ? '附带：' + giftParsed.rest : ''}`
        : sentPm
        ? `${sentPm}\n大哥原话：${userText}`
        : clarifying
        ? `大哥原话（没听清/要复述，不是睡觉）：${userText}\n接住「说的啥啊」。公屏禁止「去吧」。两条私聊：贫嘴复述或软复述刚可能说的那句；禁止明天睡醒/明天再来找我；nextAction 继续发消息或换个钩子。`
        : sleeping
        ? `大哥原话（睡觉，只接这一句）：${userText}\n公屏可省略或回「去吧/嗯」。两条私聊：损一句 vs 软一句，不同开头，最多一条叫名字，至少一条不含睡/晚安。`
        : `大哥原话（只接这一句，线程记忆当回钩不要复述）：${userText || lastUserLine}${tomorrowExpired ? '\n他已经回来聊天了：禁止再说明天睡醒/明天再来，用今天/现在/刚那句。' : ''}`
    const history = historyMessages(payload.messages, historyUser, lastUserLine)
    let model: string
    let content: string
    const source = 'deepseek' as const
    if (chatShot) {
      const vision = await completeDeepSeekVision(sys, [
        { type: 'text', text: historyUser },
        { type: 'image_url', image_url: { url: chatShot } },
      ])
      if ('visionDenied' in vision) {
        writeGrokLast({ ok: false, error: 'vision-unavailable', status: 400, ms: Date.now() - grokReqStarted, replyCount: 0, pmCount: 0, unusableReason: 'vision-unavailable', hasCoachFields: { bossMindset: false, hostMood: false, hostTone: false, analysis: false }, retried: false })
        json(res, 400, { ok: false, error: 'vision-unavailable' })
        return
      }
      model = vision.model
      content = vision.content
    } else {
      const out = await completeDeepSeek(sys, history)
      model = out.model
      content = out.content
    }
    const keepModelReplies = (replies: ReplyScript[]) => {
      const cleaned: ReplyScript[] = []
      const banStaleTomorrow = clarifying || tomorrowExpired
      for (const r of replies) {
        let line = (r.line || '').trim()
        if (!line) continue
        line = rewriteHostVacancyPhrases(line).trim()
        if (!line) continue
        if (isCannedHallSlogan(line) || isHallOpsCopy(line) || isExampleFingerprint(line) || isCoachTagInLine(line) || isAnalysisToneLeak(line)) continue
        const vacancyCheck = line.replace(/说说话/g, '说话')
        if (isHostVacancyCopy(vacancyCheck)) continue
        const compact = line.replace(/\s/g, '')
        // Clarify: never 「去吧」; never ship stale 明天睡醒 hooks after he already returned
        if (clarifying && (/^去吧[.!！。…]*$/.test(compact) || compact === '去吧' || /^去吧/.test(compact) && compact.length <= 4)) continue
        if (clarifying && /去吧/.test(compact) && compact.length <= 6) continue
        if (banStaleTomorrow && /明天睡醒了再来找我|明天睡醒|明天再来找我|明天再来|明早|留到明天/.test(compact)) continue
        if (clarifying && /让他睡|去睡觉|快去睡/.test(compact)) continue
        if (hostAsk && r.channel && r.channel !== 'pm') continue
        cleaned.push({ ...r, line, channel: hostAsk ? 'pm' : r.channel, n: cleaned.length + 1 })
      }
      return dropSameOpenings(cleaned, { sleep: sleeping, hostAsk })
    }
    const repliesUnusable = (replies: ReplyScript[]) => {
      // 一条合格私聊即可交货；同一开头三联滤掉后只要还剩 1 条好私聊就不要 502
      return !replies.some((r) => r.channel === 'pm' && (r.line || '').trim())
    }

    function readNextAction(o: Record<string, unknown>, scene: ReturnType<typeof detectHallScene>, spicy: boolean): NextAction {
      const raw = o.nextAction
      let type: NextAction['type'] | undefined
      let reason = ''
      let seduce: NextAction['seduce'] = spicy ? 'soft' : 'no'
      if (raw && typeof raw === 'object') {
        const n = raw as Record<string, unknown>
        type = parseNextActionType(n.type)
        if (typeof n.reason === 'string') reason = n.reason.trim()
        if (n.seduce === 'soft' || n.seduce === 'no') seduce = n.seduce
      }
      const fallback = coachNext({ firstContact: strangerOpen, scene, spicy, giftPhase, userText, otherGiftNudge })
      // Only this turn — never older thread sleep phrases
      const sleepLine = !clarifying && (askedSleep(userText) || askedSleep(lastUserLine))
      if (clarifying) {
        let picked = type || fallback.type
        if (picked === '让他睡留钩' || picked === '打电话' || picked === '打视频') picked = '继续发消息'
        if (picked !== '继续发消息' && picked !== '换个钩子') picked = '继续发消息'
        return {
          type: picked,
          reason: reason || '他没听清/要复述：接住说的啥啊，禁止放人睡觉、禁止去吧。',
          seduce: 'no',
        }
      }
      if (hostAsk) {
        let picked = type || fallback.type
        if (sleepLine) picked = '让他睡留钩'
        return {
          type: picked,
          reason:
            reason ||
            (sleepLine
              ? '他说睡觉去了：给面子放人，留下次钩，不要追着发。'
              : '这是主播在问怎么接，不是刚进厅。已过200/然后呢就先给面子接话，现在不要再要；想再刷等情绪到位再下钩。'),
          seduce: 'no',
        }
      }
      if (strangerOpen) return { ...fallback, reason: reason || fallback.reason, seduce: 'no' }
      if (firstContact) return { ...fallback, reason: reason || fallback.reason, seduce: 'no' }
      let picked = type || fallback.type
      if (sleepLine) picked = '让他睡留钩'
      if (picked === '打视频' && fallback.type !== '打视频' && !askedVideo(userText)) picked = fallback.type
      if (picked === '打电话' && (strangerOpen || sleepLine)) picked = sleepLine ? '让他睡留钩' : '继续发消息'
      if (!spicy) seduce = 'no'
      return { type: picked, reason: reason || fallback.reason, seduce }
    }

    const ensurePmChannel = (replies: ReplyScript[]) => {
      if (replies.some((r) => r.channel === 'pm' && (r.line || '').trim())) return replies
      return replies.map((r) => {
        if (r.channel === 'public') return r
        return { ...r, channel: 'pm' as const, cue: r.cue && !/上麦/.test(r.cue) ? r.cue : '私聊发出' }
      })
    }
    const finalizeReplies = (raw: unknown) => {
      let next = keepModelReplies(asReplies(raw))
      next = applyCopyAddress(next, addressUsed, bossName).filter((r) => (r.line || '').trim())
      next = keepModelReplies(next)
      return ensurePmChannel(next)
    }
    let firstRaw: ReplyScript[] = []
    const finishGrok = (status: number, body: Record<string, unknown>, extra?: { unusableReason?: string | null; retried?: boolean }) => {
      const repliesOut = Array.isArray(body.replies) ? (body.replies as ReplyScript[]) : []
      const pmsOut = repliesOut.filter((r) => r.channel === 'pm' && (r.line || '').trim())
      writeGrokLast({
        ok: body.ok === true,
        error: typeof body.error === 'string' ? body.error : undefined,
        status,
        ms: Date.now() - grokReqStarted,
        replyCount: repliesOut.length,
        pmCount: pmsOut.length,
        unusableReason: extra?.unusableReason ?? (body.ok === true ? null : typeof body.error === 'string' ? body.error : 'fail'),
        hasCoachFields: {
          bossMindset: typeof body.bossMindset === 'string' && !!(body.bossMindset as string).trim(),
          hostMood: typeof body.hostMood === 'string' && !!(body.hostMood as string).trim(),
          hostTone: typeof body.hostTone === 'string' && !!(body.hostTone as string).trim(),
          analysis: typeof body.analysis === 'string' && !!(body.analysis as string).trim(),
        },
        retried: extra?.retried === true,
        model: typeof body.model === 'string' ? body.model : undefined,
        source: typeof body.source === 'string' ? body.source : undefined,
        rawReplyCount: firstRaw.length,
        rawPmCount: firstRaw.filter((r) => r.channel === 'pm').length,
      })
      json(res, status, body)
    }
    let parsed = extractJsonObject(content)
    if (!parsed) {
      finishGrok(502, { ok: false, error: 'parse' }, { unusableReason: 'parse' })
      return
    }
    firstRaw = asReplies(parsed.replies)
    let replies = finalizeReplies(parsed.replies)
    const firstPassParsed = parsed
    const firstPassReplies = replies
    let retried = false
    if (repliesUnusable(replies)) {
      retried = true
      const retryUser = hostAsk
        ? '上一条私聊空了或违规（含口号/示范指纹/空厅求陪/厅务醒嗓抢麦留位）。请重写两条口语私聊，对准主播策略问题。已过200就给面子接「然后呢」，禁止刚进厅、禁止马上再要。每条大约二十五字，两个不同家族。禁止同一晚安骨架。'
        : strangerOpen
        ? '上一条私聊空了或违规。请像主播打微信重写：1公屏+2私聊不同家族。禁止主持求陪、禁止示范指纹、禁止这档耳朵、禁止醒嗓/抢麦/留位厅务。每条大约二十五字。'
        : firstContact
        ? '上一条私聊空了或违规。按已有关系重写熟人私聊，禁止刚进厅第一面钩子。口语大约二十五字，两个不同家族。禁止示范指纹。'
        : clarifying
        ? '上一条空了或违规：把「说的啥啊」当成睡觉/去吧了。请重写：接住没听清，贫嘴或软复述刚那句；禁止去吧、禁止明天睡醒/明天再来找我、禁止让他睡留钩。两条不同冲动私聊。'
        : sleeping
        ? '上一条空了或违规：同一开头三联（豆哥睡/豆哥快睡/豆哥晚安）/说明书腔/厅务套话。请像随手回微信重写：公屏可省略；两条私聊损一句 vs 软一句，不同开头，最多一条叫名字，至少一条不含睡/晚安。可以两三个字。家族名只写cue。'
        : '上一条空了或违规：说明书腔/人机口号/厅务醒嗓抢麦留位/示范指纹/家族名进了line/两条同一开头或同一冲动。请换两种人的冲动重写，只接他上一句。禁止三句同一晚安+来厅骨架。' + (tomorrowExpired ? '禁止明天睡醒/明天再来。' : '') + '每条大约二十五字，可以不叫名字。家族名只写cue。'
      const retryWithLast = (lastUserLine ? `必须先接大哥原话「${lastUserLine.slice(0, 80)}」，用人设嘴回，不要说明书。` : '') + retryUser
      try {
        const again = await completeDeepSeek(sys, [...history, { role: 'user', content: retryWithLast }])
        model = again.model
        content = again.content
        const p2 = extractJsonObject(content)
        if (p2) {
          parsed = p2
          replies = finalizeReplies(p2.replies)
        }
      } catch {
        // keep first-pass replies if any pm survived
      }
      if (repliesUnusable(replies)) {
        const firstPms = firstPassReplies.filter((r) => r.channel === 'pm' && (r.line || '').trim())
        if (firstPms.length >= 1) {
          parsed = firstPassParsed
          replies = firstPassReplies
        } else {
          const keptRaw = keepModelReplies(firstRaw.filter((r) => (r.line || '').trim()))
          if (keptRaw.some((r) => r.channel === 'pm' && (r.line || '').trim())) {
            parsed = firstPassParsed
            replies = ensurePmChannel(keptRaw)
          }
        }
      }
    }
    const pmsLeft = replies.filter((r) => r.channel === 'pm' && (r.line || '').trim())
    if (!pmsLeft.length) {
      finishGrok(502, { ok: false, error: replies.length ? 'shape' : 'parse' }, { unusableReason: replies.length ? 'no-pm' : 'parse', retried })
      return
    }
    const coach = formatAnalysis(parsed, true)
    if (!coach) {
      finishGrok(502, { ok: false, error: 'shape' }, { unusableReason: 'coach', retried })
      return
    }
    const spicy = firstContact || hostAsk || relationNow === '哥们' ? false : parsed.spicy === true
    let scene = isHallScene(parsed.scene) ? parsed.scene : detectHallScene(hostAsk ? threadSceneText(payload.messages, userText) : userText, strangerOpen, giftPhase)
    if (hostAsk && (scene === '刚进厅' || scene === '查岗')) {
      const fromThread = detectHallScene(threadSceneText(payload.messages, ''), false, giftPhase)
      scene = fromThread === '刚进厅' || fromThread === '查岗' ? '表白' : fromThread
    }
    if (firstContact && !strangerOpen && scene === '刚进厅') scene = openingSceneFor(relationNow)
    if (clarifying && (scene === '下档维护' || scene === '要走试探')) scene = '冷厅留人'
    const phase =
      parsed.giftPhase === 'before' || parsed.giftPhase === 'after' || parsed.giftPhase === 'other_host'
        ? parsed.giftPhase
        : giftPhase
    const nextAction = mergeDryNext(readNextAction(parsed, scene, spicy), ticketScore)
    const analysisOut = mergeOddsAnalysis(coach.analysis, ticketScore)
    finishGrok(200, {
      ok: true,
      model,
      analysis: analysisOut,
      bossMindset: coach.bossMindset,
      hostMood: coach.hostMood,
      hostTone: coach.hostTone,
      replies,
      spicy,
      source,
      scene,
      nextAction,
      giftPhase: phase,
      ticketOdds: ticketScore.odds,
      addressUsed,
    }, { unusableReason: null, retried })
    if (authUser && threadId) {
      void extractAndStoreEpisodic({
        userId: authUser.id,
        threadId,
        lastUserLine,
        userText,
        hostAsk,
        replies,
        analysis: analysisOut,
      }).catch(() => {})
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fail'
    const status = (e as { status?: number }).status
    writeGrokLast({
      ok: false,
      error: msg === 'key-missing' || msg === 'key-shape' ? 'no-llm' : msg === 'unauthorized' ? 'unauthorized' : 'upstream',
      status: msg === 'key-missing' || msg === 'key-shape' || (e as NodeJS.ErrnoException).code === 'ENOENT' ? 503 : status === 403 ? 403 : msg === 'unauthorized' || status === 401 ? 401 : status && status >= 400 && status < 600 ? status : 502,
      ms: 0,
      replyCount: 0,
      pmCount: 0,
      unusableReason: msg === 'key-missing' || msg === 'key-shape' ? 'no-llm' : msg === 'unauthorized' ? 'unauthorized' : 'upstream',
      hasCoachFields: { bossMindset: false, hostMood: false, hostTone: false, analysis: false },
      retried: false,
    })
    if (msg === 'key-missing' || msg === 'key-shape' || (e as NodeJS.ErrnoException).code === 'ENOENT') {
      json(res, 503, { ok: false, error: 'no-llm', keyMissing: true })
      return
    }
    if (msg === 'unauthorized' || status === 401 || status === 403) {
      json(res, status === 403 ? 403 : 401, { ok: false, error: 'unauthorized' })
      return
    }
    json(res, status && status >= 400 && status < 600 ? status : 502, {
      ok: false,
      error: 'upstream',
    })
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readBody(req)
    if (!raw.trim()) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

function creds(body: Record<string, unknown>) {
  const username = typeof body.username === 'string' ? body.username : ''
  const password = typeof body.password === 'string' ? body.password : ''
  return { username, password }
}

function coachHistoryMessages(raw: unknown, userText: string): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  if (Array.isArray(raw)) {
    for (const m of raw.slice(-12)) {
      if (!m || typeof m !== 'object') continue
      const o = m as Record<string, unknown>
      if (o.role === 'user' && typeof o.text === 'string' && o.text.trim()) {
        out.push({ role: 'user', content: o.text.trim() })
      } else if (o.role === 'bot' && typeof o.text === 'string' && o.text.trim()) {
        out.push({ role: 'assistant', content: o.text.trim() })
      }
    }
  }
  out.push({ role: 'user', content: userText })
  return out
}

async function handleCoach(req: IncomingMessage, res: ServerResponse, _user?: UserRow | null) {
  let payload: Record<string, unknown>
  try {
    const raw = await readBody(req)
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    json(res, 400, { ok: false, error: 'bad-json' })
    return
  }
  const coachIdRaw = typeof payload.coachId === 'string' ? payload.coachId : 'sweet'
  const coachId: CoachId = isCoachId(coachIdRaw) ? coachIdRaw : 'sweet'
  const bossName = typeof payload.bossName === 'string' ? payload.bossName.trim() : ''
  const bossGender =
    payload.bossGender === '女' || payload.bossGender === '未知' ? payload.bossGender : '男'
  const hostWho = typeof payload.hostWho === 'string' ? payload.hostWho.trim() : ''
  const userText = typeof payload.userText === 'string' ? payload.userText.trim() : ''
  if (!userText) {
    json(res, 400, { ok: false, error: 'bad-json' })
    return
  }
  if (!tryLoadDeepSeek()) {
    json(res, 503, { ok: false, error: 'no-llm', keyMissing: true })
    return
  }
  try {
    const sys = buildCoachSystem({ coachId, bossName, bossGender, hostWho })
    const history = coachHistoryMessages(payload.messages, userText)
    const { model, content } = await completeDeepSeekPlain(sys, history)
    const parsed = parseCoachOutput(content)
    const hasReplyMarker = /【回复1】/.test(content)
    if (!parsed.replies.length && !hasReplyMarker && !parsed.analysis) {
      json(res, 502, { ok: false, error: 'shape' })
      return
    }
    json(res, 200, {
      ok: true,
      model,
      source: 'deepseek',
      analysis: parsed.analysis || '',
      replies: parsed.replies.map((r) => ({ line: r.line, purpose: r.purpose, cue: r.purpose })),
      note: parsed.note || '',
      rawText: parsed.rawText || content,
      text: parsed.rawText || content,
      coachId,
      agentName: coachOfId(coachId).agentName,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'unauthorized') {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    json(res, 502, { ok: false, error: 'upstream' })
  }
}


async function currentUser(req: IncomingMessage) {
  const token = parseCookie(req.headers.cookie)
  return userFromToken(token)
}

async function handleAppApi(req: IncomingMessage, res: ServerResponse, url: string): Promise<boolean> {
  const method = req.method || 'GET'
  if (method === 'OPTIONS' && url.startsWith('/api/')) {
    res.statusCode = 204
    res.end()
    return true
  }

  if (url === '/api/auth/register' && method === 'POST') {
    const body = await readJsonBody(req)
    if (!body) {
      json(res, 400, { ok: false, error: 'bad-json' })
      return true
    }
    const out = await registerUser(creds(body).username, creds(body).password)
    if (!out.ok) {
      json(res, out.status, { ok: false, error: out.error })
      return true
    }
    json(res, 201, { ok: true, pending: true, user: out.user, message: '注册已提交，等待管理员确认' })
    return true
  }

  if (url === '/api/auth/login' && method === 'POST') {
    const body = await readJsonBody(req)
    if (!body) {
      json(res, 400, { ok: false, error: 'bad-json' })
      return true
    }
    const out = await loginUser(creds(body).username, creds(body).password)
    if (!out.ok) {
      json(res, out.status, { ok: false, error: out.error })
      return true
    }
    res.setHeader('Set-Cookie', setSessionCookie(out.token))
    json(res, 200, { ok: true, user: out.user })
    return true
  }

  if (url === '/api/auth/logout' && (method === 'POST' || method === 'GET')) {
    await logoutToken(parseCookie(req.headers.cookie))
    res.setHeader('Set-Cookie', clearSessionCookie())
    json(res, 200, { ok: true })
    return true
  }

  if (url === '/api/auth/me' && method === 'GET') {
    const user = await currentUser(req)
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return true
    }
    json(res, 200, { ok: true, user })
    return true
  }

  if (url === '/api/admin/users' && method === 'GET') {
    const user = await currentUser(req)
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return true
    }
    if (!isAdminUsername(user.username)) {
      json(res, 403, { ok: false, error: '需要管理员权限' })
      return true
    }
    const users = await listUsersForAdmin()
    json(res, 200, { ok: true, users })
    return true
  }

  const adminApprove = url.match(/^\/api\/admin\/users\/([^/]+)\/approve$/)
  if (adminApprove && method === 'POST') {
    const user = await currentUser(req)
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return true
    }
    if (!isAdminUsername(user.username)) {
      json(res, 403, { ok: false, error: '需要管理员权限' })
      return true
    }
    const out = await approveUser(decodeURIComponent(adminApprove[1]))
    if (!out.ok) {
      json(res, out.status, { ok: false, error: out.error })
      return true
    }
    json(res, 200, { ok: true, user: out.user })
    return true
  }

  const adminReject = url.match(/^\/api\/admin\/users\/([^/]+)\/reject$/)
  if (adminReject && method === 'POST') {
    const user = await currentUser(req)
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return true
    }
    if (!isAdminUsername(user.username)) {
      json(res, 403, { ok: false, error: '需要管理员权限' })
      return true
    }
    const out = await rejectUser(decodeURIComponent(adminReject[1]))
    if (!out.ok) {
      json(res, out.status, { ok: false, error: out.error })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  const adminRemove = url.match(/^\/api\/admin\/users\/([^/]+)\/remove$/)
  const adminDelete = url.match(/^\/api\/admin\/users\/([^/]+)$/)
  if ((adminRemove && method === 'POST') || (adminDelete && method === 'DELETE')) {
    const user = await currentUser(req)
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return true
    }
    if (!isAdminUsername(user.username)) {
      json(res, 403, { ok: false, error: '需要管理员权限' })
      return true
    }
    const targetId = decodeURIComponent((adminRemove || adminDelete)![1])
    const out = await removeUser(targetId)
    if (!out.ok) {
      json(res, out.status, { ok: false, error: out.error })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  const threadOne = url.match(/^\/api\/threads\/([^/]+)$/)
  const threadMsgs = url.match(/^\/api\/threads\/([^/]+)\/messages$/)

  if (url === '/api/threads' || threadOne || threadMsgs || url === '/api/grok' || url === '/api/coach') {
    const user = await currentUser(req)
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' })
      return true
    }

    if (url === '/api/grok') {
      if (method !== 'POST') {
        json(res, 405, { ok: false, error: 'method' })
        return true
      }
      void handleGrok(req, res, user)
      return true
    }

    if (url === '/api/coach') {
      if (method !== 'POST') {
        json(res, 405, { ok: false, error: 'method' })
        return true
      }
      void handleCoach(req, res, user)
      return true
    }

    if (url === '/api/threads' && method === 'GET') {
      const threads = await listThreads(user.id)
      json(res, 200, { ok: true, threads })
      return true
    }

    if (url === '/api/threads' && method === 'POST') {
      const body = await readJsonBody(req)
      if (!body) {
        json(res, 400, { ok: false, error: 'bad-json' })
        return true
      }
      const created = await createThread(user.id, body)
      if ('error' in created) {
        json(res, created.status, { ok: false, error: created.error })
        return true
      }
      json(res, 200, { ok: true, thread: created })
      return true
    }

    if (threadMsgs) {
      const id = decodeURIComponent(threadMsgs[1])
      if (method === 'GET') {
        const messages = await listMessages(user.id, id)
        if (!messages) {
          json(res, 404, { ok: false, error: 'not-found' })
          return true
        }
        json(res, 200, { ok: true, messages })
        return true
      }
      if (method === 'POST') {
        const body = await readJsonBody(req)
        if (!body) {
          json(res, 400, { ok: false, error: 'bad-json' })
          return true
        }
        const message = (body.message && typeof body.message === 'object' ? body.message : body) as unknown
        const thread = await appendMessage(user.id, id, message)
        if (!thread) {
          json(res, 404, { ok: false, error: 'not-found' })
          return true
        }
        json(res, 200, { ok: true, thread })
        return true
      }
      json(res, 405, { ok: false, error: 'method' })
      return true
    }

    if (threadOne) {
      const id = decodeURIComponent(threadOne[1])
      if (method === 'GET') {
        const thread = await getThread(user.id, id)
        if (!thread) {
          json(res, 404, { ok: false, error: 'not-found' })
          return true
        }
        json(res, 200, { ok: true, thread })
        return true
      }
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readJsonBody(req)
        if (!body) {
          json(res, 400, { ok: false, error: 'bad-json' })
          return true
        }
        const thread = await updateThread(user.id, id, body)
        if (!thread) {
          json(res, 404, { ok: false, error: 'not-found' })
          return true
        }
        json(res, 200, { ok: true, thread })
        return true
      }
      if (method === 'DELETE') {
        const ok = await deleteThread(user.id, id)
        if (!ok) {
          json(res, 404, { ok: false, error: 'not-found' })
          return true
        }
        json(res, 200, { ok: true })
        return true
      }
      json(res, 405, { ok: false, error: 'method' })
      return true
    }
  }

  return false
}

function attachApi(server: ViteDevServer) {
  void openDb()
  server.middlewares.use((req, res, next) => {
    const url = req.url?.split('?')[0] || ''
    if (!url.startsWith('/api/')) {
      next()
      return
    }
    void handleAppApi(req, res, url).then((handled) => {
      if (!handled) next()
    }).catch(() => {
      json(res, 500, { ok: false, error: 'server' })
    })
  })
}

export default function grokApiPlugin(): Plugin {
  return {
    name: 'grok-api',
    configureServer(server: ViteDevServer) {
      attachApi(server)
    },
    configurePreviewServer(server) {
      attachApi(server as unknown as ViteDevServer)
    },
  }
}
