import type { HallScene, RelationGoal, RelationNow } from './types'

export const RELATION_NOW_OPTIONS: RelationNow[] = [
  '刚认识',
  '朋友',
  '暧昧',
  '恋人',
  '哥们',
  '追求者',
  '情人',
]

export const RELATION_GOAL_OPTIONS: RelationGoal[] = ['朋友', '暧昧', '恋人', '哥们', '情人']

export const DEFAULT_RELATION_NOW: RelationNow = '刚认识'
export const DEFAULT_RELATION_GOAL: RelationGoal = '朋友'

export function parseRelationNow(raw: unknown): RelationNow {
  return typeof raw === 'string' && (RELATION_NOW_OPTIONS as string[]).includes(raw)
    ? (raw as RelationNow)
    : DEFAULT_RELATION_NOW
}

export function parseRelationGoal(raw: unknown): RelationGoal {
  return typeof raw === 'string' && (RELATION_GOAL_OPTIONS as string[]).includes(raw)
    ? (raw as RelationGoal)
    : DEFAULT_RELATION_GOAL
}

export function isStranger(now: RelationNow | undefined): boolean {
  return !now || now === '刚认识'
}

export function closeForGift(now: RelationNow): boolean {
  return now === '暧昧' || now === '恋人' || now === '情人'
}

export function openingSceneFor(now: RelationNow): HallScene {
  if (now === '刚认识') return '刚进厅'
  if (now === '暧昧' || now === '恋人' || now === '情人') return '表白'
  return '冷厅留人'
}

export function relationSubtitle(now: RelationNow, goal: RelationGoal): string {
  return `目前·${now} → ${goal}`
}

const KNOWN_OPENERS: Record<Exclude<RelationNow, '刚认识'>, [string, string]> = {
  朋友: ['今晚还来呀', '{n}来了就坐这儿聊'],
  暧昧: ['想你了，回我一下', '今晚只想跟你说两句'],
  恋人: ['回来啦，想不想我', '累不累，先报备我'],
  哥们: ['来了啊，这局还坐我这', '今晚贫你两句，别跑'],
  追求者: ['又来守我啦', '先坐着，别急着表'],
  情人: ['今晚位置给你留着', '想你，先回我这句'],
}

export function knownOpeners(now: RelationNow): [string, string] | null {
  if (now === '刚认识') return null
  return KNOWN_OPENERS[now]
}

function paceLine(now: RelationNow, goal: RelationGoal): string {
  if (now === goal) return `目前已是「${now}」，维系即可，不要硬升级，也不要退回刚认识。`
  if (now === '朋友' && goal === '恋人') return '朋友→恋人要慢：先熟、给面子、专属气氛，禁止第一轮表白/软色情/直要礼物。'
  if (now === '暧昧' && goal === '恋人') return '暧昧→恋人可以升温，但仍要一步，不要第一句就逼名分。'
  if (now === '哥们') return '哥们口吻走贫嘴/义气，禁止软色情、禁止恋爱腔硬拉。'
  if (now === '追求者') return '他在追你：接住热度，别装第一面，也别立刻以身相许或直要。'
  if (now === '刚认识') return '刚认识：按第一接触写，禁止礼物钩子。'
  return `从「${now}」往「${goal}」拉，按现有关系说话，禁止跳级。`
}

export function relationPromptBlock(now: RelationNow, goal: RelationGoal): string {
  return `关系档：目前关系「${now}」，目标关系「${goal}」。${paceLine(now, goal)}
禁止把已有关系写成刚进厅第一面（来了呀/刚看见你进来），除非目前确实是刚认识。`
}

export function relationGiftPrompt(now: RelationNow): string {
  if (now === '刚认识') return '刚认识：仅第一接触私聊钩子禁止提礼物。之后出票是主目标，仍先给面子。'
  if (now === '哥们') return '哥们：出票走贫嘴义气，不要软色情。给面子后可小要。'
  if (closeForGift(now)) return '暧昧/恋人/情人：出票是主目标。给面子后可更直接绑票（含视觉福利换刷）。'
  if (now === '追求者') return '追求者：出票优先。给面子后可领情、可小钩。'
  return '朋友：出票是主目标，先给情绪价值再埋小钩，不要纯陪聊。'
}

export function relationHostAskPrompt(now: RelationNow, goal: RelationGoal): string {
  const gift = relationGiftPrompt(now)
  return `回答「会不会刷」时必须参考关系档：目前「${now}」→目标「${goal}」。${gift}
刚认识：现在大概率不会刷，先被看见、先熟。暧昧/恋人/情人：给面子后更可能出票，但仍看线程有没有刚过完任务。哥们：可能义气打赏，不要用软色情换票。`
}

export function relationOpeningHint(now: RelationNow, goal: RelationGoal): string {
  if (now === '刚认识') {
    return '当前是第一接触：游客刚进厅。公屏点名 + 两条初见私聊钩子。第一钩仍不提礼物；出票是后续主目标。'
  }
  return `当前是熟人开场：你们已经是「${now}」，目标「${goal}」。禁止刚进厅第一面钩子。私聊按已有关系写，慢慢拉向目标。`
}
