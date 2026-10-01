import { parseRelationGoal, parseRelationNow } from './relation'
import type { ChatMessage, Session } from './types'
import { isCoachId } from './coachAgents'

export type AuthUser = {
  id: string
  username: string
  isHallOwner?: boolean
  hallNo?: string | null
  canAccessRevenueBoard?: boolean
  canAccessPayrollBoard?: boolean
  isFullAdmin?: boolean
  isTingGuan?: boolean
  isDage?: boolean
  pointRate?: string
}

const CODE_ZH: Record<string, string> = {
  unauthorized: '登录已过期，请重新登录',
  'Failed to fetch': '网络异常，请重试',
  'NetworkError when attempting to fetch resource.': '网络异常，请重试',
  'load-failed': '网络异常，请重试',
  'create-failed': '保存失败，请重试',
  'patch-failed': '保存失败，请重试',
  'delete-failed': '删除失败，请重试',
  'bad-json': '请求有误，请重试',
  'no-llm': '模型失败请重试',
  parse: '模型失败请重试',
  shape: '模型失败请重试',
  upstream: '模型失败请重试',
  'vision-unavailable': '模型看不了图请重试',
  'bad-response': '模型失败请重试',
  method: '请求方式不对，请重试',
  'not-found': '内容不存在',
  server: '服务异常，请重试',
}

export function toUserError(e: unknown, fallback: string): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return '网络异常，请重试'
  if (e instanceof TypeError) return '网络异常，请重试'
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (!msg) return fallback
  if (CODE_ZH[msg]) return CODE_ZH[msg]
  if (/failed to fetch|networkerror|load failed|aborterror/i.test(msg)) return '网络异常，请重试'
  if (/[一-鿿]/.test(msg)) return msg
  return fallback
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown
    if (data && typeof data === 'object') return data as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return {}
}

async function request(path: string, init: RequestInit = {}): Promise<{ res: Response; data: Record<string, unknown> }> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  try {
    const res = await fetch(path, { credentials: 'include', ...init, headers })
    const data = await parseJson(res)
    return { res, data }
  } catch (e) {
    throw new Error(toUserError(e, '网络异常，请重试'))
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const { res, data } = await request('/api/auth/me')
    if (!res.ok) return null
    const user = data.user
    if (!user || typeof user !== 'object') return null
    const u = user as Record<string, unknown>
    if (typeof u.id !== 'string' || typeof u.username !== 'string') return null
    const hallNo =
      typeof u.hallNo === 'string'
        ? u.hallNo
        : typeof u.hall_no === 'string'
          ? u.hall_no
          : null
    return {
      id: u.id,
      username: u.username,
      isHallOwner: u.isHallOwner === true || u.is_hall_owner === true || u.isHallOwner === 1,
      hallNo: hallNo ? hallNo : null,
      canAccessRevenueBoard: u.canAccessRevenueBoard === true,
      canAccessPayrollBoard: u.canAccessPayrollBoard === true,
      isFullAdmin: u.isFullAdmin === true || u.is_full_admin === true,
      isTingGuan: u.isTingGuan === true || u.is_ting_guan === true,
      isDage: u.isDage === true || u.is_dage === true,
      pointRate: typeof u.pointRate === 'string' ? u.pointRate : typeof u.point_rate === 'string' ? u.point_rate : '',
    }
  } catch {
    return null
  }
}

export type RegisterResult =
  | { pending: true; message: string }
  | { pending: false; user: AuthUser }

export async function registerAccount(username: string, password: string): Promise<RegisterResult> {
  const { res, data } = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '注册失败', '注册失败，请重试'))
  if (data.pending) {
    return {
      pending: true,
      message: typeof data.message === 'string' ? data.message : '注册已提交，等待管理员确认',
    }
  }
  const user = data.user as AuthUser | undefined
  if (!user?.id || !user.username) throw new Error('注册失败，请重试')
  return { pending: false, user }
}

export type AdminUser = {
  id: string
  username: string
  status: 'pending' | 'approved'
  created_at: number
  pointRate?: string
  isHallOwner?: boolean
  privilegeRank?: number
  canManage?: boolean
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { res, data } = await request('/api/admin/users')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const list = Array.isArray(data.users) ? data.users : []
  return list
    .map((raw): AdminUser | null => {
      if (!raw || typeof raw !== 'object') return null
      const u = raw as Record<string, unknown>
      if (typeof u.id !== 'string' || typeof u.username !== 'string') return null
      const status = u.status === 'pending' ? 'pending' : 'approved'
      const pointRate =
        typeof u.pointRate === 'string' ? u.pointRate : typeof u.point_rate === 'string' ? u.point_rate : ''
      const privilegeRank =
        typeof u.privilegeRank === 'number'
          ? u.privilegeRank
          : typeof u.privilege_rank === 'number'
            ? u.privilege_rank
            : undefined
      const canManage =
        u.canManage === false || u.can_manage === false
          ? false
          : u.canManage === true || u.can_manage === true || u.canManage === undefined
      return {
        id: u.id,
        username: u.username,
        status: status as 'pending' | 'approved',
        created_at: typeof u.created_at === 'number' ? u.created_at : 0,
        pointRate,
        isHallOwner: u.isHallOwner === true || u.is_hall_owner === true,
        privilegeRank,
        canManage,
      }
    })
    .filter((x): x is AdminUser => !!x)
}

export async function approveAdminUser(id: string): Promise<AdminUser> {
  const { res, data } = await request('/api/admin/users/' + encodeURIComponent(id) + '/approve', {
    method: 'POST',
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '同意失败', '同意失败，请重试'))
  const user = data.user as AdminUser | undefined
  if (!user?.id || !user.username) throw new Error('同意失败，请重试')
  return {
    id: user.id,
    username: user.username,
    status: 'approved',
    created_at: typeof user.created_at === 'number' ? user.created_at : 0,
  }
}

export async function rejectAdminUser(id: string): Promise<void> {
  const { res, data } = await request('/api/admin/users/' + encodeURIComponent(id) + '/reject', {
    method: 'POST',
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '拒绝失败', '拒绝失败，请重试'))
}

export async function removeAdminUser(id: string): Promise<void> {
  const { res, data } = await request('/api/admin/users/' + encodeURIComponent(id), {
    method: 'DELETE',
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '移除失败', '移除失败，请重试'))
}


export type LiushuiBatchKind = 'streamer' | 'user'

export type LiushuiBatchSummary = {
  id: string
  label: string
  filename: string
  rowCount: number
  uploadedAt: number
  uploadedBy: string
  startDate: string
  endDate: string
  hostWagePerHour: number | null
  kind: LiushuiBatchKind
  personCount: number
}

export type LiushuiPreviewRow = {
  id: string
  batchId: string
  timeText: string
  userPlatformId: string
  nickname: string
  totalFlowText: string
  totalFlowAmount: number | null
  totalFlowCents: number | null
  pointRate: string
  hostHours: number | null
  micHours: number | null
  rewardYuan: number | null
  fineYuan: number | null
  addFlowYuan: number | null
  deductFlowYuan: number | null
  actualFlow: number | null
  baseWage: number | null
  hostWage: number | null
  totalWage: number | null
  hallNo: string
}

function asLiushuiBatch(raw: unknown): LiushuiBatchSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.id !== 'string') return null
  return {
    id: b.id,
    label: typeof b.label === 'string' ? b.label : '',
    filename: typeof b.filename === 'string' ? b.filename : '',
    rowCount: typeof b.rowCount === 'number' ? b.rowCount : 0,
    uploadedAt: typeof b.uploadedAt === 'number' ? b.uploadedAt : 0,
    uploadedBy: typeof b.uploadedBy === 'string' ? b.uploadedBy : '',
    startDate: typeof b.startDate === 'string' ? b.startDate : '',
    endDate: typeof b.endDate === 'string' ? b.endDate : '',
    hostWagePerHour: asLiushuiNum(b.hostWagePerHour ?? b.host_wage_per_hour),
    kind: b.kind === 'user' ? 'user' : 'streamer',
    personCount:
      typeof b.personCount === 'number' && Number.isFinite(b.personCount)
        ? b.personCount
        : typeof b.person_count === 'number' && Number.isFinite(b.person_count)
          ? b.person_count
          : typeof b.rowCount === 'number'
            ? b.rowCount
            : 0,
  }
}

function asLiushuiNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asLiushuiRow(raw: unknown): LiushuiPreviewRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string') return null
  return {
    id: r.id,
    batchId: typeof r.batchId === 'string' ? r.batchId : '',
    timeText: typeof r.timeText === 'string' ? r.timeText : '',
    userPlatformId: typeof r.userPlatformId === 'string' ? r.userPlatformId : '',
    nickname: typeof r.nickname === 'string' ? r.nickname : '',
    totalFlowText: typeof r.totalFlowText === 'string' ? r.totalFlowText : '',
    totalFlowAmount: typeof r.totalFlowAmount === 'number' && Number.isFinite(r.totalFlowAmount) ? r.totalFlowAmount : null,
    totalFlowCents: typeof r.totalFlowCents === 'number' && Number.isFinite(r.totalFlowCents) ? r.totalFlowCents : null,
    pointRate:
      typeof r.pointRate === 'string'
        ? r.pointRate
        : typeof r.point_rate === 'string'
          ? r.point_rate
          : '',
    hostHours: asLiushuiNum(r.hostHours ?? r.host_hours),
    micHours: asLiushuiNum(r.micHours ?? r.mic_hours),
    rewardYuan: asLiushuiNum(r.rewardYuan ?? r.reward_yuan),
    fineYuan: asLiushuiNum(r.fineYuan ?? r.fine_yuan),
    addFlowYuan: asLiushuiNum(r.addFlowYuan ?? r.add_flow_yuan),
    deductFlowYuan: asLiushuiNum(r.deductFlowYuan ?? r.deduct_flow_yuan),
    actualFlow: asLiushuiNum(r.actualFlow ?? r.actual_flow),
    baseWage: asLiushuiNum(r.baseWage ?? r.base_wage),
    hostWage: asLiushuiNum(r.hostWage ?? r.host_wage),
    totalWage: asLiushuiNum(r.totalWage ?? r.total_wage),
    hallNo: typeof r.hallNo === 'string' ? r.hallNo : typeof r.hall_no === 'string' ? r.hall_no : '',
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('读取文件失败'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export type LiushuiDateRange = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
}

function asLiushuiRange(data: Record<string, unknown>, batch: LiushuiBatchSummary | null): LiushuiDateRange {
  const startDate =
    typeof data.startDate === 'string' && data.startDate
      ? data.startDate
      : batch?.startDate || ''
  const endDate =
    typeof data.endDate === 'string' && data.endDate ? data.endDate : batch?.endDate || ''
  return {
    startDate,
    endDate,
    startDateLabel: typeof data.startDateLabel === 'string' ? data.startDateLabel : '',
    endDateLabel: typeof data.endDateLabel === 'string' ? data.endDateLabel : '',
  }
}

export async function uploadLiushuiExcel(
  file: File,
  kind: LiushuiBatchKind = 'streamer',
): Promise<{
  batch: LiushuiBatchSummary
  rowCount: number
  rows: LiushuiPreviewRow[]
  range: LiushuiDateRange
  rawGiftCount: number
}> {
  const dataBase64 = await fileToBase64(file)
  const { res, data } = await request('/api/admin/liushui/upload', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name || 'upload.xlsx',
      label: kind === 'user' ? '上周用户流水' : '上周主播流水',
      kind,
      dataBase64,
    }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '上传失败', '上传失败，请重试'))
  const batch = asLiushuiBatch(data.batch)
  if (!batch) throw new Error('上传失败，请重试')
  const rowCount = typeof data.rowCount === 'number' ? data.rowCount : batch.rowCount
  const rawGiftCount = typeof data.rawGiftCount === 'number' && Number.isFinite(data.rawGiftCount) ? data.rawGiftCount : 0
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rowCount,
    rows: list.map(asLiushuiRow).filter((x): x is LiushuiPreviewRow => !!x),
    range: asLiushuiRange(data, batch),
    rawGiftCount,
  }
}

export async function fetchLatestLiushui(): Promise<{
  batch: LiushuiBatchSummary | null
  rows: LiushuiPreviewRow[]
  range: LiushuiDateRange
}> {
  const { res, data } = await request('/api/admin/liushui/latest')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const batch = asLiushuiBatch(data.batch)
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rows: list.map(asLiushuiRow).filter((x): x is LiushuiPreviewRow => !!x),
    range: asLiushuiRange(data, batch),
  }
}

export type LiushuiBatchListItem = LiushuiBatchSummary & {
  startDateLabel: string
  endDateLabel: string
}

export async function fetchLiushuiBatches(): Promise<LiushuiBatchListItem[]> {
  const { res, data } = await request('/api/admin/liushui/batches')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const list = Array.isArray(data.batches) ? data.batches : []
  const out: LiushuiBatchListItem[] = []
  for (const raw of list) {
    const batch = asLiushuiBatch(raw)
    if (!batch) continue
    const r = raw as Record<string, unknown>
    out.push({
      ...batch,
      startDateLabel: typeof r.startDateLabel === 'string' ? r.startDateLabel : '',
      endDateLabel: typeof r.endDateLabel === 'string' ? r.endDateLabel : '',
    })
  }
  return out
}

export async function fetchLiushuiBatch(id: string): Promise<{
  batch: LiushuiBatchSummary
  rows: LiushuiPreviewRow[]
  range: LiushuiDateRange
}> {
  const { res, data } = await request(`/api/admin/liushui/batches/${encodeURIComponent(id)}`)
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const batch = asLiushuiBatch(data.batch)
  if (!batch) throw new Error('批次不存在')
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rows: list.map(asLiushuiRow).filter((x): x is LiushuiPreviewRow => !!x),
    range: asLiushuiRange(data, batch),
  }
}

export type LiushuiRowEdits = {
  /** Not used — 点位 is read-only in liushui UI */
  pointRate?: string
  hostHours: number | null
  micHours: number | null
  rewardYuan: number | null
  fineYuan: number | null
  addFlowYuan: number | null
  deductFlowYuan: number | null
}

export async function updateLiushuiBatch(
  id: string,
  edits: { hostWagePerHour: number | null },
): Promise<LiushuiBatchSummary> {
  const { res, data } = await request(`/api/admin/liushui/batches/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(edits),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '保存失败', '保存失败，请重试'))
  const batch = asLiushuiBatch(data.batch)
  if (!batch) throw new Error('保存失败，请重试')
  return batch
}
export async function deleteLiushuiBatch(id: string): Promise<void> {
  const { res, data } = await request(`/api/admin/liushui/batches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '删除失败', '删除失败，请重试'))
}


export async function updateLiushuiRow(
  id: string,
  edits: LiushuiRowEdits,
): Promise<LiushuiPreviewRow> {
  const { res, data } = await request(`/api/admin/liushui/rows/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(edits),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '保存失败', '保存失败，请重试'))
  const row = asLiushuiRow(data.row)
  if (!row) throw new Error('保存失败，请重试')
  return row
}

export async function saveLiushuiRows(
  rows: Array<{ id: string } & LiushuiRowEdits>,
): Promise<LiushuiPreviewRow[]> {
  const { res, data } = await request('/api/admin/liushui/rows', {
    method: 'PUT',
    body: JSON.stringify({ rows }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '保存失败', '保存失败，请重试'))
  const list = Array.isArray(data.rows) ? data.rows : []
  return list.map(asLiushuiRow).filter((x): x is LiushuiPreviewRow => !!x)
}




export type ActivityBatchSummary = {
  id: string
  label: string
  filename: string
  rowCount: number
  uploadedAt: number
  uploadedBy: string
  startDate: string
  endDate: string
}

export type ActivityPreviewRow = {
  id: string
  batchId: string
  streamerId: string
  nickname: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
}

export type ActivityDateRange = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
}

function asActivityBatch(raw: unknown): ActivityBatchSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.id !== 'string' || !b.id) return null
  const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    id: b.id,
    label: asStr(b.label),
    filename: asStr(b.filename),
    rowCount: asNum(b.rowCount ?? b.row_count),
    uploadedAt: asNum(b.uploadedAt ?? b.uploaded_at),
    uploadedBy: asStr(b.uploadedBy ?? b.uploaded_by),
    startDate: asStr(b.startDate ?? b.start_date),
    endDate: asStr(b.endDate ?? b.end_date),
  }
}

function asActivityNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function asActivityRow(raw: unknown): ActivityPreviewRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  return {
    id: r.id,
    batchId: typeof r.batchId === 'string' ? r.batchId : typeof r.batch_id === 'string' ? r.batch_id : '',
    streamerId:
      typeof r.streamerId === 'string'
        ? r.streamerId
        : typeof r.streamer_id === 'string'
          ? r.streamer_id
          : '',
    nickname: typeof r.nickname === 'string' ? r.nickname : '',
    greetPeople: asActivityNum(r.greetPeople ?? r.greet_people),
    greetMsgs: asActivityNum(r.greetMsgs ?? r.greet_msgs),
    strangerGreetPeople: asActivityNum(r.strangerGreetPeople ?? r.stranger_greet_people),
    strangerReplyPeople: asActivityNum(r.strangerReplyPeople ?? r.stranger_reply_people),
    plazaPosts: asActivityNum(r.plazaPosts ?? r.plaza_posts),
  }
}

function asActivityRange(
  data: Record<string, unknown>,
  batch: ActivityBatchSummary | null,
): ActivityDateRange {
  const startDate =
    typeof data.startDate === 'string' && data.startDate
      ? data.startDate
      : batch?.startDate || ''
  const endDate =
    typeof data.endDate === 'string' && data.endDate ? data.endDate : batch?.endDate || ''
  return {
    startDate,
    endDate,
    startDateLabel: typeof data.startDateLabel === 'string' ? data.startDateLabel : '',
    endDateLabel: typeof data.endDateLabel === 'string' ? data.endDateLabel : '',
  }
}

export async function uploadActivityExcel(file: File): Promise<{
  batch: ActivityBatchSummary
  rowCount: number
  rows: ActivityPreviewRow[]
  range: ActivityDateRange
}> {
  const dataBase64 = await fileToBase64(file)
  const { res, data } = await request('/api/admin/activity/upload', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name || 'upload.xlsx',
      label: '上周活跃度',
      dataBase64,
    }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '上传失败', '上传失败，请重试'))
  const batch = asActivityBatch(data.batch)
  if (!batch) throw new Error('上传失败，请重试')
  const rowCount = typeof data.rowCount === 'number' ? data.rowCount : batch.rowCount
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rowCount,
    rows: list.map(asActivityRow).filter((x): x is ActivityPreviewRow => !!x),
    range: asActivityRange(data, batch),
  }
}

export type ActivityBatchListItem = ActivityBatchSummary & {
  startDateLabel: string
  endDateLabel: string
}

export async function fetchActivityBatches(): Promise<ActivityBatchListItem[]> {
  const { res, data } = await request('/api/admin/activity/batches')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const list = Array.isArray(data.batches) ? data.batches : []
  const out: ActivityBatchListItem[] = []
  for (const raw of list) {
    const batch = asActivityBatch(raw)
    if (!batch) continue
    const r = raw as Record<string, unknown>
    out.push({
      ...batch,
      startDateLabel: typeof r.startDateLabel === 'string' ? r.startDateLabel : '',
      endDateLabel: typeof r.endDateLabel === 'string' ? r.endDateLabel : '',
    })
  }
  return out
}

export async function fetchActivityBatch(id: string): Promise<{
  batch: ActivityBatchSummary
  rows: ActivityPreviewRow[]
  range: ActivityDateRange
}> {
  const { res, data } = await request(`/api/admin/activity/batches/${encodeURIComponent(id)}`)
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const batch = asActivityBatch(data.batch)
  if (!batch) throw new Error('批次不存在')
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rows: list.map(asActivityRow).filter((x): x is ActivityPreviewRow => !!x),
    range: asActivityRange(data, batch),
  }
}

export async function deleteActivityBatch(id: string): Promise<void> {
  const { res, data } = await request(`/api/admin/activity/batches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '删除失败', '删除失败，请重试'))
}

export type CommissionBatchSummary = {
  id: string
  label: string
  filename: string
  rowCount: number
  uploadedAt: number
  uploadedBy: string
  startDate: string
  endDate: string
}

export type CommissionPreviewRow = {
  id: string
  batchId: string
  userAccount: string
  nickname: string
  payAmount: number
  saleAmount: number
  cumulativeAmount: number
}

export type CommissionDateRange = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
}

function asCommissionBatch(raw: unknown): CommissionBatchSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.id !== 'string' || !b.id) return null
  const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    id: b.id,
    label: asStr(b.label),
    filename: asStr(b.filename),
    rowCount: asNum(b.rowCount ?? b.row_count),
    uploadedAt: asNum(b.uploadedAt ?? b.uploaded_at),
    uploadedBy: asStr(b.uploadedBy ?? b.uploaded_by),
    startDate: asStr(b.startDate ?? b.start_date),
    endDate: asStr(b.endDate ?? b.end_date),
  }
}

function asCommissionMoney(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function asCommissionRow(raw: unknown): CommissionPreviewRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  return {
    id: r.id,
    batchId: typeof r.batchId === 'string' ? r.batchId : typeof r.batch_id === 'string' ? r.batch_id : '',
    userAccount:
      typeof r.userAccount === 'string'
        ? r.userAccount
        : typeof r.user_account === 'string'
          ? r.user_account
          : '',
    nickname: typeof r.nickname === 'string' ? r.nickname : '',
    payAmount: asCommissionMoney(r.payAmount ?? r.pay_amount),
    saleAmount: asCommissionMoney(r.saleAmount ?? r.sale_amount),
    cumulativeAmount: asCommissionMoney(r.cumulativeAmount ?? r.cumulative_amount),
  }
}

function asCommissionRange(
  data: Record<string, unknown>,
  batch: CommissionBatchSummary | null,
): CommissionDateRange {
  const startDate =
    typeof data.startDate === 'string' && data.startDate
      ? data.startDate
      : batch?.startDate || ''
  const endDate =
    typeof data.endDate === 'string' && data.endDate ? data.endDate : batch?.endDate || ''
  return {
    startDate,
    endDate,
    startDateLabel: typeof data.startDateLabel === 'string' ? data.startDateLabel : '',
    endDateLabel: typeof data.endDateLabel === 'string' ? data.endDateLabel : '',
  }
}

export async function uploadCommissionExcel(file: File): Promise<{
  batch: CommissionBatchSummary
  rowCount: number
  rows: CommissionPreviewRow[]
  range: CommissionDateRange
}> {
  const dataBase64 = await fileToBase64(file)
  const { res, data } = await request('/api/admin/commission/upload', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name || 'upload.xlsx',
      dataBase64,
    }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '上传失败', '上传失败，请重试'))
  const batch = asCommissionBatch(data.batch)
  if (!batch) throw new Error('上传失败，请重试')
  const rowCount = typeof data.rowCount === 'number' ? data.rowCount : batch.rowCount
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rowCount,
    rows: list.map(asCommissionRow).filter((x): x is CommissionPreviewRow => !!x),
    range: asCommissionRange(data, batch),
  }
}

export type CommissionBatchListItem = CommissionBatchSummary & {
  startDateLabel: string
  endDateLabel: string
}

export async function fetchCommissionBatches(): Promise<CommissionBatchListItem[]> {
  const { res, data } = await request('/api/admin/commission/batches')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const list = Array.isArray(data.batches) ? data.batches : []
  const out: CommissionBatchListItem[] = []
  for (const raw of list) {
    const batch = asCommissionBatch(raw)
    if (!batch) continue
    const r = raw as Record<string, unknown>
    out.push({
      ...batch,
      startDateLabel: typeof r.startDateLabel === 'string' ? r.startDateLabel : '',
      endDateLabel: typeof r.endDateLabel === 'string' ? r.endDateLabel : '',
    })
  }
  return out
}

export async function fetchCommissionBatch(id: string): Promise<{
  batch: CommissionBatchSummary
  rows: CommissionPreviewRow[]
  range: CommissionDateRange
}> {
  const { res, data } = await request(`/api/admin/commission/batches/${encodeURIComponent(id)}`)
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const batch = asCommissionBatch(data.batch)
  if (!batch) throw new Error('批次不存在')
  const list = Array.isArray(data.rows) ? data.rows : []
  return {
    batch,
    rows: list.map(asCommissionRow).filter((x): x is CommissionPreviewRow => !!x),
    range: asCommissionRange(data, batch),
  }
}

export async function deleteCommissionBatch(id: string): Promise<void> {
  const { res, data } = await request(`/api/admin/commission/batches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '删除失败', '删除失败，请重试'))
}

export type EffectiveJobRankingRow = {
  rank: number
  nickname: string
  streamerId: string
  strangerGreetPeople: number
  greetPeople: number
  greetMsgs: number
  strangerReplyPeople: number
  plazaPosts: number
}

export type EffectiveJobRankingsResponse = {
  range: {
    startDate: string
    endDate: string
    startDateLabel: string
    endDateLabel: string
  } | null
  batchId: string | null
  rows: EffectiveJobRankingRow[]
  empty: boolean
  fallbackNewest: boolean
}

export async function fetchEffectiveJobRankings(): Promise<EffectiveJobRankingsResponse> {
  const { res, data } = await request('/api/rankings/effective-job')
  if (!res.ok) {
    throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  }
  const rangeRaw = data.range && typeof data.range === 'object' ? (data.range as Record<string, unknown>) : null
  const asNum = (v: unknown, fallback = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '')
  const rowsRaw = Array.isArray(data.rows) ? data.rows : []
  const rows: EffectiveJobRankingRow[] = []
  for (const item of rowsRaw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    rows.push({
      rank: asNum(o.rank, rows.length + 1),
      nickname: asStr(o.nickname) || '—',
      streamerId: asStr(o.streamerId ?? o.streamer_id),
      strangerGreetPeople: asNum(o.strangerGreetPeople ?? o.stranger_greet_people),
      greetPeople: asNum(o.greetPeople ?? o.greet_people),
      greetMsgs: asNum(o.greetMsgs ?? o.greet_msgs),
      strangerReplyPeople: asNum(o.strangerReplyPeople ?? o.stranger_reply_people),
      plazaPosts: asNum(o.plazaPosts ?? o.plaza_posts),
    })
  }
  return {
    range: rangeRaw
      ? {
          startDate: asStr(rangeRaw.startDate),
          endDate: asStr(rangeRaw.endDate),
          startDateLabel: asStr(rangeRaw.startDateLabel),
          endDateLabel: asStr(rangeRaw.endDateLabel),
        }
      : null,
    batchId: typeof data.batchId === 'string' ? data.batchId : null,
    rows,
    empty: data.empty === true || rows.length === 0,
    fallbackNewest: data.fallbackNewest === true,
  }
}


export type AdminUserDetail = {
  user: AdminUser
  profile: StreamerProfile | null
  /** 我的大哥充值账号 ID 列表 */
  myDageIds: string[]
}

export type AdminUserDetailFields = {
  hallNo: string
  name: string
  streamerId: string
  liveTime: string
  region: string
  height: string
  weight: string
  type: string
  skills: string
  pointRate: string
  referrerId: string
  linkedId1: string
  linkedId2: string
  linkedId3: string
  isHallOwner: boolean
  /** union=工会代发工资；self=厅主自行发工资 */
  hallPayMode: 'union' | 'self'
  /** 厅主：厅点位 default 0.53 */
  hallPointRate: number
  /** 厅主：用户流水点位 default 0.74 */
  userFlowPointRate: number
  /** 我的大哥充值账号 ID（可多项） */
  myDageIds: string[]
}

export async function fetchAdminUserDetail(id: string): Promise<AdminUserDetail> {
  const { res, data } = await request('/api/admin/users/' + encodeURIComponent(id) + '/detail')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const rawUser = data.user
  if (!rawUser || typeof rawUser !== 'object') throw new Error('加载失败，请重试')
  const u = rawUser as Record<string, unknown>
  if (typeof u.id !== 'string' || typeof u.username !== 'string') throw new Error('加载失败，请重试')
  const user: AdminUser = {
    id: u.id,
    username: u.username,
    status: u.status === 'pending' ? 'pending' : 'approved',
    created_at: typeof u.created_at === 'number' ? u.created_at : 0,
  }
  const profile = data.profile ? asStreamerProfile(data.profile) : null
  const rawIds = data.myDageIds ?? data.my_dage_ids
  const myDageIds = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    : []
  return { user, profile, myDageIds }
}

export async function saveAdminUserDetail(id: string, fields: AdminUserDetailFields): Promise<AdminUserDetail> {
  const { res, data } = await request('/api/admin/users/' + encodeURIComponent(id) + '/detail', {
    method: 'PUT',
    body: JSON.stringify(fields),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '保存失败', '保存失败，请重试'))
  const rawUser = data.user
  if (!rawUser || typeof rawUser !== 'object') throw new Error('保存失败，请重试')
  const u = rawUser as Record<string, unknown>
  if (typeof u.id !== 'string' || typeof u.username !== 'string') throw new Error('保存失败，请重试')
  const user: AdminUser = {
    id: u.id,
    username: u.username,
    status: u.status === 'pending' ? 'pending' : 'approved',
    created_at: typeof u.created_at === 'number' ? u.created_at : 0,
  }
  const profile = data.profile ? asStreamerProfile(data.profile) : null
  const rawIds = data.myDageIds ?? data.my_dage_ids
  const myDageIds = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    : []
  return { user, profile, myDageIds }
}

export async function loginAccount(username: string, password: string): Promise<AuthUser> {
  const { res, data } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '登录失败', '登录失败，请重试'))
  const raw = data.user
  if (!raw || typeof raw !== 'object') throw new Error('登录失败，请重试')
  const u = raw as Record<string, unknown>
  if (typeof u.id !== 'string' || typeof u.username !== 'string') throw new Error('登录失败，请重试')
  const hallNo =
    typeof u.hallNo === 'string'
      ? u.hallNo
      : typeof u.hall_no === 'string'
        ? u.hall_no
        : null
  return {
    id: u.id,
    username: u.username,
    isHallOwner: u.isHallOwner === true || u.is_hall_owner === true || u.isHallOwner === 1,
    hallNo: hallNo ? hallNo : null,
    canAccessRevenueBoard: u.canAccessRevenueBoard === true,
    canAccessPayrollBoard: u.canAccessPayrollBoard === true,
    isFullAdmin: u.isFullAdmin === true || u.is_full_admin === true,
    isTingGuan: u.isTingGuan === true || u.is_ting_guan === true,
    isDage: u.isDage === true || u.is_dage === true,
    pointRate: typeof u.pointRate === 'string' ? u.pointRate : typeof u.point_rate === 'string' ? u.point_rate : '',
  }
}

export async function logoutAccount() {
  await request('/api/auth/logout', { method: 'POST' })
}

function asSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Session
  if (typeof s.id !== 'string' || typeof s.bossName !== 'string') return null
  if (!Array.isArray(s.messages)) s.messages = []
  s.relationNow = parseRelationNow(s.relationNow)
  s.relationGoal = parseRelationGoal(s.relationGoal)
  if (typeof s.companionMemory === 'string') s.companionMemory = s.companionMemory.trim().slice(0, 1200)
  else delete s.companionMemory
  if (typeof s.coachKind === 'string' && isCoachId(s.coachKind)) {
    /* keep */
  } else {
    delete s.coachKind
  }
  if (s.bossGender === '男' || s.bossGender === '女' || s.bossGender === '未知') {
    /* keep */
  } else {
    delete s.bossGender
  }
  if (typeof s.hostWho === 'string') s.hostWho = s.hostWho.trim().slice(0, 200)
  else delete s.hostWho
  if (s.systemNotice === true) {
    /* keep */
  } else {
    delete s.systemNotice
  }
  return s
}

export async function fetchThreads(): Promise<Session[]> {
  const { res, data } = await request('/api/threads')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error('load-failed')
  const list = Array.isArray(data.threads) ? data.threads : []
  return list.map(asSession).filter((x): x is Session => !!x)
}

export async function createThread(session: Session): Promise<Session> {
  const { res, data } = await request('/api/threads', {
    method: 'POST',
    body: JSON.stringify(session),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'create-failed')
  return asSession(data.thread) ?? session
}

export async function patchThread(id: string, patch: Partial<Session>): Promise<Session | null> {
  const { res, data } = await request('/api/threads/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 404) return null
  if (!res.ok) throw new Error('patch-failed')
  return asSession(data.thread)
}

export async function deleteThread(id: string): Promise<void> {
  const { res } = await request('/api/threads/' + encodeURIComponent(id), { method: 'DELETE' })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok && res.status !== 404) throw new Error('delete-failed')
}

export async function fetchThreadMessages(id: string): Promise<ChatMessage[] | null> {
  const { res, data } = await request('/api/threads/' + encodeURIComponent(id) + '/messages')
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 404) return null
  if (!res.ok) throw new Error('load-failed')
  return Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : []
}

export type StreamerPhoto = { id: string; url: string; sort: number }

export type StreamerProfile = {
  id: string
  userId: string
  hallNo: string
  name: string
  streamerId: string
  liveTime: string
  region: string
  height: string
  weight: string
  type: string
  skills: string
  pointRate: string
  referrerId: string
  linkedId1: string
  linkedId2: string
  linkedId3: string
  isHallOwner: boolean
  hallPayMode: 'union' | 'self'
  hallPointRate: number
  userFlowPointRate: number
  /** Profile photos shown on the public wall and owner/admin views */
  photos: StreamerPhoto[]
  /** Payment QR is owner/admin only; always null on the public wall */
  payQrUrl: string | null
  /** Public profile URL slug (pinyin of display name); set on wall list */
  slug?: string
  createdAt: number
  updatedAt: number
}

function asStreamerProfile(raw: unknown): StreamerProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const photosRaw = Array.isArray(o.photos) ? o.photos : []
  const photos: StreamerPhoto[] = photosRaw
    .map((p) => {
      if (!p || typeof p !== 'object') return null
      const ph = p as Record<string, unknown>
      if (typeof ph.id !== 'string' || typeof ph.url !== 'string') return null
      return { id: ph.id, url: ph.url, sort: typeof ph.sort === 'number' ? ph.sort : 0 }
    })
    .filter((x): x is StreamerPhoto => !!x)
  return {
    id: o.id,
    userId: typeof o.userId === 'string' ? o.userId : '',
    hallNo: typeof o.hallNo === 'string' ? o.hallNo : '',
    name: o.name,
    streamerId: typeof o.streamerId === 'string' ? o.streamerId : '',
    liveTime: typeof o.liveTime === 'string' ? o.liveTime : '',
    region: typeof o.region === 'string' ? o.region : '',
    height: typeof o.height === 'string' ? o.height : '',
    weight: typeof o.weight === 'string' ? o.weight : '',
    type: typeof o.type === 'string' ? o.type : '',
    skills: typeof o.skills === 'string' ? o.skills : '',
    pointRate: typeof o.pointRate === 'string' ? o.pointRate : typeof o.point_rate === 'string' ? o.point_rate : '',
    referrerId: typeof o.referrerId === 'string' ? o.referrerId : typeof o.referrer_id === 'string' ? o.referrer_id : '',
    linkedId1: typeof o.linkedId1 === 'string' ? o.linkedId1 : typeof o.linked_id_1 === 'string' ? o.linked_id_1 : '',
    linkedId2: typeof o.linkedId2 === 'string' ? o.linkedId2 : typeof o.linked_id_2 === 'string' ? o.linked_id_2 : '',
    linkedId3: typeof o.linkedId3 === 'string' ? o.linkedId3 : typeof o.linked_id_3 === 'string' ? o.linked_id_3 : '',
    isHallOwner:
      o.isHallOwner === true ||
      o.is_hall_owner === true ||
      o.isHallOwner === 1 ||
      o.is_hall_owner === 1,
    hallPayMode:
      (typeof o.hallPayMode === 'string' ? o.hallPayMode : typeof o.hall_pay_mode === 'string' ? o.hall_pay_mode : '') ===
      'self'
        ? 'self'
        : 'union',
    hallPointRate: (() => {
      const n = Number(o.hallPointRate ?? o.hall_point_rate)
      return Number.isFinite(n) ? n : 0.53
    })(),
    userFlowPointRate: (() => {
      const n = Number(o.userFlowPointRate ?? o.user_flow_point_rate)
      return Number.isFinite(n) ? n : 0.74
    })(),
    photos,
    payQrUrl:
      typeof o.payQrUrl === 'string' && o.payQrUrl
        ? o.payQrUrl
        : typeof o.pay_qr_url === 'string' && o.pay_qr_url
          ? o.pay_qr_url
          : null,
    slug: typeof o.slug === 'string' && o.slug ? o.slug : undefined,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
  }
}

export async function fetchStreamerProfiles(): Promise<StreamerProfile[]> {
  const { res, data } = await request('/api/streamer-profiles')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const list = Array.isArray(data.profiles) ? data.profiles : []
  return list.map(asStreamerProfile).filter((x): x is StreamerProfile => !!x)
}

export async function fetchMyStreamerProfile(): Promise<StreamerProfile | null> {
  const { res, data } = await request('/api/streamer-profiles/me')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  if (!data.profile) return null
  return asStreamerProfile(data.profile)
}

export type SaveStreamerPhoto =
  | { keep: true; id: string }
  | { dataUrl: string }

export type SaveStreamerPayQr =
  | { keep: true }
  | { dataUrl: string }
  | { clear: true }

export async function saveStreamerProfile(payload: {
  hallNo: string
  name: string
  streamerId: string
  liveTime: string
  region: string
  height: string
  weight: string
  type: string
  skills: string
  photos: SaveStreamerPhoto[]
  payQr?: SaveStreamerPayQr
}): Promise<StreamerProfile> {
  const { res, data } = await request('/api/streamer-profiles', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '保存失败', '保存失败，请重试'))
  const profile = asStreamerProfile(data.profile)
  if (!profile) throw new Error('保存失败，请重试')
  return profile
}

export async function deleteMyStreamerProfile(): Promise<void> {
  const { res, data } = await request('/api/streamer-profiles/me', { method: 'DELETE' })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '删除失败', '删除失败，请重试'))
}

export async function postMineAssist(payload: {
  message: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}): Promise<string> {
  const { res, data } = await request('/api/mine-assist', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '解答失败', '解答失败，请重试'))
  const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
  if (!reply) throw new Error('解答失败，请重试')
  return reply
}

export type MySalaryPeriod = 'last' | 'prev'

export type MySalaryIntroduced = {
  id: string
  nickname: string
  registeredAt: number
  tenureDays: number
  /** 首月总流水 (合并流水) for join-day through +30 days; null if none */
  totalFlowYuan: number | null
  /** 首月总麦序 = sum(麦序时长+主持时长) in same window; null if none */
  firstMonthMicHours: number | null
  /** Per-referral window hours (compat); 我的总麦序 top-level is 本周麦序+主持 */
  myMicHoursInWindow: number | null
}

export type MySalaryDage = {
  id: string
  nickname: string
  /** 上个月充值 = sum(payAmount)；字段名兼容旧 API */
  lastMonthCumulative: number
  /** 累计金额（仅展示，不参与提成） */
  cumulativeAmount?: number
}

export type MySalaryMe = {
  nickname: string
  streamerId: string
  linkedIds: string[]
  introduced: MySalaryIntroduced[]
  /** 本周麦序时长 + 本周主持时长；null if none */
  myTotalMicHours: number | null
  payQrUrl: string | null
  /** 我的大哥 + 上个月充值（payAmount 合计） */
  myDage: MySalaryDage[]
  /** 预计上月用户提成 = sum(payAmount) × 0.1 */
  estimatedLastMonthUserCommission: number
}

export type MySalaryRange = {
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
}

export type MySalaryActivity = {
  greetPeople: number
  greetMsgs: number
  /** 有效作业 */
  strangerGreetPeople: number
  /** 有效回复 */
  strangerReplyPeople: number
  /** 动态广场数 */
  plazaPosts: number
}

export type MySalaryRowView = {
  totalWage: number | null
  actualFlow: number | null
  totalFlow: number | null
  totalFlowText: string
  addFlow: number | null
  deductFlow: number | null
  hostHours: number | null
  micHours: number | null
  rewardYuan: number | null
  fineYuan: number | null
  /** 基础工资 */
  baseWage: number | null
}

export type MySalaryResponse = {
  me: MySalaryMe
  period: MySalaryPeriod
  range: MySalaryRange | null
  batchId: string | null
  row: MySalaryRowView | null
  rowMissing: boolean
  confirmed: boolean
  confirmedAt: string | null
  /** hall_revenue = 厅主 hall-revenue wage; row = normal liushui/点位 */
  wageSource: 'row' | 'hall_revenue'
  hallNo?: string | null
  hallPayMode?: 'union' | 'self' | null
  hallUserFlow?: number | null
  hallStreamerFlow?: number | null
  hallStreamerWageTotal?: number | null
  /** Selected-week activity matched by streamer ID; null if none */
  activity: MySalaryActivity | null
  /** 工会补贴; null when ≤0 or missing (hide in UI) */
  guildSubsidy: number | null
}

export type ConfirmMySalaryResponse = {
  confirmed: boolean
  confirmedAt: string
  batchId: string
}

function asMySalaryIntroduced(v: unknown): MySalaryIntroduced[] {
  if (!Array.isArray(v)) return []
  const out: MySalaryIntroduced[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const nickname = typeof o.nickname === 'string' ? o.nickname : ''
    if (!id && !nickname) continue
    const registeredAt =
      typeof o.registeredAt === 'number' && Number.isFinite(o.registeredAt)
        ? o.registeredAt
        : typeof o.registered_at === 'number' && Number.isFinite(o.registered_at)
          ? o.registered_at
          : 0
    let tenureDays =
      typeof o.tenureDays === 'number' && Number.isFinite(o.tenureDays)
        ? Math.max(0, Math.floor(o.tenureDays))
        : typeof o.tenure_days === 'number' && Number.isFinite(o.tenure_days)
          ? Math.max(0, Math.floor(o.tenure_days))
          : 0
    const totalFlowYuan = asLiushuiNum(o.totalFlowYuan ?? o.total_flow_yuan)
    const firstMonthMicHours = asLiushuiNum(
      o.firstMonthMicHours ?? o.first_month_mic_hours,
    )
    const myMicHoursInWindow = asLiushuiNum(
      o.myMicHoursInWindow ?? o.my_mic_hours_in_window,
    )
    out.push({
      id,
      nickname: nickname || id,
      registeredAt,
      tenureDays,
      totalFlowYuan,
      firstMonthMicHours,
      myMicHoursInWindow,
    })
  }
  return out
}

function asMySalaryDage(v: unknown): MySalaryDage[] {
  if (!Array.isArray(v)) return []
  const out: MySalaryDage[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    if (!id) continue
    const nickname = typeof o.nickname === 'string' && o.nickname.trim() ? o.nickname.trim() : '—'
    const cumRaw = o.lastMonthCumulative ?? o.last_month_cumulative
    const n = typeof cumRaw === 'number' ? cumRaw : Number(cumRaw)
    const dispRaw = o.cumulativeAmount ?? o.cumulative_amount
    const disp = typeof dispRaw === 'number' ? dispRaw : Number(dispRaw)
    out.push({
      id,
      nickname,
      lastMonthCumulative: Number.isFinite(n) ? Math.round(n * 100) / 100 : 0,
      cumulativeAmount: Number.isFinite(disp) ? Math.round(disp * 100) / 100 : undefined,
    })
  }
  return out
}

function asMySalaryMe(v: unknown): MySalaryMe {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const linkedRaw = o.linkedIds
  const linkedIds = Array.isArray(linkedRaw)
    ? linkedRaw.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : []
  return {
    nickname: typeof o.nickname === 'string' ? o.nickname : '',
    streamerId: typeof o.streamerId === 'string' ? o.streamerId : '',
    linkedIds,
    introduced: asMySalaryIntroduced(o.introduced),
    myTotalMicHours: asLiushuiNum(o.myTotalMicHours ?? o.my_total_mic_hours),
    payQrUrl:
      typeof o.payQrUrl === 'string' && o.payQrUrl ? o.payQrUrl : null,
    myDage: asMySalaryDage(o.myDage ?? o.my_dage),
    estimatedLastMonthUserCommission: (() => {
      const raw = o.estimatedLastMonthUserCommission ?? o.estimated_last_month_user_commission
      const n = typeof raw === 'number' ? raw : Number(raw)
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
    })(),
  }
}

function asMySalaryRange(v: unknown): MySalaryRange | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return {
    startDate: typeof o.startDate === 'string' ? o.startDate : '',
    endDate: typeof o.endDate === 'string' ? o.endDate : '',
    startDateLabel: typeof o.startDateLabel === 'string' ? o.startDateLabel : '',
    endDateLabel: typeof o.endDateLabel === 'string' ? o.endDateLabel : '',
  }
}

function asMySalaryActivity(v: unknown): MySalaryActivity | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const asInt = (x: unknown) => {
    const n = typeof x === 'number' && Number.isFinite(x) ? x : Number(x)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  return {
    greetPeople: asInt(o.greetPeople ?? o.greet_people),
    greetMsgs: asInt(o.greetMsgs ?? o.greet_msgs),
    strangerGreetPeople: asInt(o.strangerGreetPeople ?? o.stranger_greet_people),
    strangerReplyPeople: asInt(o.strangerReplyPeople ?? o.stranger_reply_people),
    plazaPosts: asInt(o.plazaPosts ?? o.plaza_posts),
  }
}

function asMySalaryRow(v: unknown): MySalaryRowView | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return {
    totalWage: asLiushuiNum(o.totalWage ?? o.total_wage),
    actualFlow: asLiushuiNum(o.actualFlow ?? o.actual_flow),
    totalFlow: asLiushuiNum(o.totalFlow ?? o.total_flow),
    totalFlowText: typeof o.totalFlowText === 'string' ? o.totalFlowText : typeof o.total_flow_text === 'string' ? o.total_flow_text : '',
    addFlow: asLiushuiNum(o.addFlow ?? o.add_flow),
    deductFlow: asLiushuiNum(o.deductFlow ?? o.deduct_flow),
    hostHours: asLiushuiNum(o.hostHours ?? o.host_hours),
    micHours: asLiushuiNum(o.micHours ?? o.mic_hours),
    rewardYuan: asLiushuiNum(o.rewardYuan ?? o.reward_yuan),
    fineYuan: asLiushuiNum(o.fineYuan ?? o.fine_yuan),
    baseWage: asLiushuiNum(o.baseWage ?? o.base_wage),
  }
}

export async function fetchMySalary(period: MySalaryPeriod = 'last'): Promise<MySalaryResponse> {
  const { res, data } = await request(`/api/my-salary?period=${period === 'prev' ? 'prev' : 'last'}`)
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const confirmedAt =
    typeof data.confirmedAt === 'string' && data.confirmedAt
      ? data.confirmedAt
      : typeof data.confirmed_at === 'string' && data.confirmed_at
        ? data.confirmed_at
        : null
  const guildRaw = data.guildSubsidy ?? data.guild_subsidy
  const guildSubsidy =
    typeof guildRaw === 'number' && Number.isFinite(guildRaw) && guildRaw > 0
      ? guildRaw
      : null
  return {
    me: asMySalaryMe(data.me),
    period: data.period === 'prev' ? 'prev' : 'last',
    range: asMySalaryRange(data.range),
    batchId: typeof data.batchId === 'string' ? data.batchId : null,
    row: asMySalaryRow(data.row),
    rowMissing: !!data.rowMissing,
    confirmed: !!data.confirmed,
    confirmedAt,
    wageSource: data.wageSource === 'hall_revenue' ? 'hall_revenue' : 'row',
    hallNo: typeof data.hallNo === 'string' && data.hallNo ? data.hallNo : typeof data.hall_no === 'string' && data.hall_no ? data.hall_no : null,
    hallPayMode:
      (typeof data.hallPayMode === 'string' ? data.hallPayMode : typeof data.hall_pay_mode === 'string' ? data.hall_pay_mode : '') ===
      'self'
        ? 'self'
        : data.wageSource === 'hall_revenue'
          ? 'union'
          : null,
    hallUserFlow: asLiushuiNum(data.hallUserFlow ?? data.hall_user_flow),
    hallStreamerFlow: asLiushuiNum(data.hallStreamerFlow ?? data.hall_streamer_flow),
    hallStreamerWageTotal: asLiushuiNum(data.hallStreamerWageTotal ?? data.hall_streamer_wage_total),
    activity: asMySalaryActivity(data.activity),
    guildSubsidy,
  }
}

export async function confirmMySalary(period: MySalaryPeriod = 'last'): Promise<ConfirmMySalaryResponse> {
  const { res, data } = await request('/api/my-salary/confirm', {
    method: 'POST',
    body: JSON.stringify({ period: period === 'prev' ? 'prev' : 'last' }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) {
    throw new Error(toUserError(typeof data.error === 'string' ? data.error : '确认失败', '确认失败，请重试'))
  }
  const confirmedAt =
    typeof data.confirmedAt === 'string' && data.confirmedAt
      ? data.confirmedAt
      : typeof data.confirmed_at === 'string' && data.confirmed_at
        ? data.confirmed_at
        : ''
  const batchId = typeof data.batchId === 'string' ? data.batchId : typeof data.batch_id === 'string' ? data.batch_id : ''
  if (!confirmedAt || !batchId) throw new Error('确认失败，请重试')
  return { confirmed: true, confirmedAt, batchId }
}


export type RevenueBoardTopStreamer = {
  nickname: string
  userPlatformId: string
  totalFlow: number | null
  actualFlow: number | null
  totalWage: number | null
}

export type RevenueBoardStreamerSummary = {
  totalFlow: number
  actualFlow: number
  totalWage: number
  rowCount: number
  personCount: number
  topStreamers: RevenueBoardTopStreamer[]
}

export type RevenueBoardUserSummary = {
  totalFlow: number
  rowCount: number
  personCount: number
  topUsers: RevenueBoardTopUser[]
}

export type RevenueBoardTopUser = {
  userPlatformId: string
  nickname: string
  totalFlow: number | null
}

export type RevenueBoardBatchInfo = {
  id: string
  kind: LiushuiBatchKind
  label: string
  filename: string
  startDate: string
  endDate: string
  startDateLabel: string
  endDateLabel: string
  rowCount: number
  personCount: number
  uploadedAt: number
}

export type SalesRevenueIntroducer = {
  userId: string
  nickname: string
  username: string
  lastMonthRecharge: number
  estimatedIncome: number
}

export type SalesRevenue = {
  monthLabel: string
  monthStart: string
  monthEnd: string
  totalRecharge: number
  estimatedTotalIncome: number
  estimatedTotalExpense: number
  introducers: SalesRevenueIntroducer[]
  commissionBatchId: string | null
}

export type RevenueBoardResponse = {
  period: {
    year: number
    month: number
    week: number
    label: string
    sharedLabel: string | null
    monday: string
    sunday: string
  }
  range: {
    startDate: string
    endDate: string
    startDateLabel: string
    endDateLabel: string
  }
  userTotalFlow: number
  userTotalRevenue: number
  overviewUserTotalFlow: number
  overviewUserTotalRevenue: number
  overviewUserHallRevenue: number
  streamerTotalFlow: number
  streamerTotalRevenue: number
  overviewStreamerTotalFlow: number
  overviewStreamerTotalRevenue: number
  overviewStreamerHallRevenue: number
  overviewStreamerTotalWage: number
  overviewPayableTotal: number
  /** 厅总收款 = 主播流水厅收益 + 用户流水厅收益 */
  overviewHallTotalReceipts: number
  overviewHallTotalExpense: number
  overviewHallProfit: number
  /**
   * 工会收款 / 工会收入 =
   *   Σ主播流水×工会主播点位(default 0.558) + Σ用户流水×工会用户流水点位(default 0.93)
   */
  overviewGuildReceipts: number
  overviewGuildRevenue: number
  /** 工会盈利 = 工会总收款 − 厅总收款 */
  overviewGuildProfit: number
  guildPointRates: { streamerPointRate: number; userFlowPointRate: number }
  overviewHalls: string[]
  overviewHallNo: string
  streamerTotalWage: number
  streamerProfit: number
  halls: string[]
  hallNo: string
  streamerHalls: string[]
  streamerHallNo: string
  streamerHallHasEmpty: boolean
  streamerSummary: RevenueBoardStreamerSummary | null
  userSummary: RevenueBoardUserSummary | null
  batches: RevenueBoardBatchInfo[]
  empty: boolean
  emptyMessage: string | null
  /** 销售收益 — admin 全部，或厅主锁定厅；admin 选具体厅时为 null. */
  salesRevenue: SalesRevenue | null
  /** Present for scoped viewers (厅主): hall lock + hide overview totals. */
  viewerScope?: {
    hallNo: string | null
    hideOverviewTotals: boolean
    /** 厅主：隐藏销售收益的预计总收入/预计总支出 */
    hideSalesEstimates?: boolean
  }
}

export async function fetchRevenueBoard(params: {
  year: number
  month: number
  week: number
  hallNo?: string
  streamerHallNo?: string
  overviewHallNo?: string
}): Promise<RevenueBoardResponse> {
  const q = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
    week: String(params.week),
  })
  const hall = (params.hallNo || '').trim()
  if (hall) q.set('hallNo', hall)
  const streamerHall = (params.streamerHallNo || '').trim()
  if (streamerHall) q.set('streamerHallNo', streamerHall)
  const overviewHall = (params.overviewHallNo || '').trim()
  if (overviewHall) q.set('overviewHallNo', overviewHall)
  const { res, data } = await request('/api/admin/revenue-board?' + q.toString())
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 403) throw new Error('需要管理员权限')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const periodRaw = data.period && typeof data.period === 'object' ? (data.period as Record<string, unknown>) : {}
  const rangeRaw = data.range && typeof data.range === 'object' ? (data.range as Record<string, unknown>) : {}
  const asNum = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const asNumOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '')

  let streamerSummary: RevenueBoardStreamerSummary | null = null
  if (data.streamerSummary && typeof data.streamerSummary === 'object') {
    const s = data.streamerSummary as Record<string, unknown>
    const topsRaw = Array.isArray(s.topStreamers) ? s.topStreamers : []
    const topStreamers: RevenueBoardTopStreamer[] = []
    for (const item of topsRaw) {
      if (!item || typeof item !== 'object') continue
      const t = item as Record<string, unknown>
      topStreamers.push({
        nickname: asStr(t.nickname) || '—',
        userPlatformId: asStr(t.userPlatformId),
        totalFlow: asNumOrNull(t.totalFlow),
        actualFlow: asNumOrNull(t.actualFlow),
        totalWage: asNumOrNull(t.totalWage),
      })
    }
    streamerSummary = {
      totalFlow: asNum(s.totalFlow),
      actualFlow: asNum(s.actualFlow),
      totalWage: asNum(s.totalWage),
      rowCount: asNum(s.rowCount),
      personCount: asNum(s.personCount),
      topStreamers,
    }
  }

  let userSummary: RevenueBoardUserSummary | null = null
  if (data.userSummary && typeof data.userSummary === 'object') {
    const u = data.userSummary as Record<string, unknown>
    const topsRaw = Array.isArray(u.topUsers) ? u.topUsers : []
    const topUsers: RevenueBoardTopUser[] = []
    for (const item of topsRaw) {
      if (!item || typeof item !== 'object') continue
      const t = item as Record<string, unknown>
      topUsers.push({
        nickname: asStr(t.nickname) || '—',
        userPlatformId: asStr(t.userPlatformId),
        totalFlow: asNumOrNull(t.totalFlow),
      })
    }
    userSummary = {
      totalFlow: asNum(u.totalFlow),
      rowCount: asNum(u.rowCount),
      personCount: asNum(u.personCount),
      topUsers,
    }
  }

  const batches: RevenueBoardBatchInfo[] = []
  if (Array.isArray(data.batches)) {
    for (const raw of data.batches) {
      if (!raw || typeof raw !== 'object') continue
      const b = raw as Record<string, unknown>
      const kind: LiushuiBatchKind = b.kind === 'user' ? 'user' : 'streamer'
      batches.push({
        id: asStr(b.id),
        kind,
        label: asStr(b.label),
        filename: asStr(b.filename),
        startDate: asStr(b.startDate),
        endDate: asStr(b.endDate),
        startDateLabel: asStr(b.startDateLabel),
        endDateLabel: asStr(b.endDateLabel),
        rowCount: asNum(b.rowCount),
        personCount: asNum(b.personCount),
        uploadedAt: asNum(b.uploadedAt),
      })
    }
  }

  const halls: string[] = []
  if (Array.isArray(data.halls)) {
    for (const h of data.halls) {
      if (typeof h === 'string' && h.trim()) halls.push(h.trim())
    }
  }

  const streamerHalls: string[] = []
  if (Array.isArray(data.streamerHalls)) {
    for (const h of data.streamerHalls) {
      if (typeof h === 'string' && h.trim()) streamerHalls.push(h.trim())
    }
  }

  const overviewHalls: string[] = []
  if (Array.isArray(data.overviewHalls)) {
    for (const h of data.overviewHalls) {
      if (typeof h === 'string' && h.trim()) overviewHalls.push(h.trim())
    }
  }

  let salesRevenue: SalesRevenue | null = null
  const srRaw = data.salesRevenue ?? data.sales_revenue
  if (srRaw && typeof srRaw === 'object') {
    const sr = srRaw as Record<string, unknown>
    const introducers: SalesRevenueIntroducer[] = []
    const introRaw = Array.isArray(sr.introducers) ? sr.introducers : []
    for (const item of introRaw) {
      if (!item || typeof item !== 'object') continue
      const t = item as Record<string, unknown>
      const lastMonthRecharge = asNum(t.lastMonthRecharge ?? t.last_month_recharge)
      introducers.push({
        userId: asStr(t.userId ?? t.user_id),
        nickname: asStr(t.nickname) || '—',
        username: asStr(t.username),
        lastMonthRecharge,
        estimatedIncome: asNum(t.estimatedIncome ?? t.estimated_income),
      })
    }
    salesRevenue = {
      monthLabel: asStr(sr.monthLabel ?? sr.month_label),
      monthStart: asStr(sr.monthStart ?? sr.month_start),
      monthEnd: asStr(sr.monthEnd ?? sr.month_end),
      totalRecharge: asNum(sr.totalRecharge ?? sr.total_recharge),
      estimatedTotalIncome: asNum(sr.estimatedTotalIncome ?? sr.estimated_total_income),
      estimatedTotalExpense: asNum(sr.estimatedTotalExpense ?? sr.estimated_total_expense),
      introducers,
      commissionBatchId:
        typeof sr.commissionBatchId === 'string'
          ? sr.commissionBatchId
          : typeof sr.commission_batch_id === 'string'
            ? sr.commission_batch_id
            : null,
    }
  }

  return {
    period: {
      year: asNum(periodRaw.year, params.year),
      month: asNum(periodRaw.month, params.month),
      week: asNum(periodRaw.week, params.week),
      label: asStr(periodRaw.label) || `${params.year}年${params.month}月第${params.week}周`,
      sharedLabel: typeof periodRaw.sharedLabel === 'string' ? periodRaw.sharedLabel : null,
      monday: asStr(periodRaw.monday),
      sunday: asStr(periodRaw.sunday),
    },
    range: {
      startDate: asStr(rangeRaw.startDate),
      endDate: asStr(rangeRaw.endDate),
      startDateLabel: asStr(rangeRaw.startDateLabel),
      endDateLabel: asStr(rangeRaw.endDateLabel),
    },
    userTotalFlow: asNum(data.userTotalFlow),
    userTotalRevenue: asNum(data.userTotalRevenue),
    overviewUserTotalFlow: asNum(data.overviewUserTotalFlow, asNum(data.userTotalFlow)),
    overviewUserTotalRevenue: asNum(data.overviewUserTotalRevenue, asNum(data.userTotalRevenue)),
    overviewUserHallRevenue: asNum(data.overviewUserHallRevenue),
    streamerTotalFlow: asNum(data.streamerTotalFlow),
    streamerTotalRevenue: asNum(data.streamerTotalRevenue),
    overviewStreamerTotalFlow: asNum(data.overviewStreamerTotalFlow, asNum(data.streamerTotalFlow)),
    overviewStreamerTotalRevenue: asNum(data.overviewStreamerTotalRevenue, asNum(data.streamerTotalRevenue)),
    overviewStreamerHallRevenue: asNum(data.overviewStreamerHallRevenue),
    overviewStreamerTotalWage: asNum(data.overviewStreamerTotalWage),
    overviewPayableTotal: asNum(data.overviewPayableTotal),
    overviewHallTotalReceipts: asNum(
      data.overviewHallTotalReceipts,
      asNum(data.overviewStreamerHallRevenue) + asNum(data.overviewUserHallRevenue),
    ),
    overviewHallTotalExpense: asNum(
      data.overviewHallTotalExpense,
      asNum(data.overviewStreamerTotalWage),
    ),
    overviewHallProfit: asNum(data.overviewHallProfit),
    overviewGuildReceipts: asNum(data.overviewGuildReceipts, asNum(data.overviewPayableTotal)),
    overviewGuildRevenue: asNum(data.overviewGuildRevenue, asNum(data.overviewPayableTotal)),
    overviewGuildProfit: asNum(data.overviewGuildProfit),
    guildPointRates: (() => {
      const g = data.guildPointRates ?? data.guild_point_rates
      if (g && typeof g === 'object') {
        const o = g as Record<string, unknown>
        const s = Number(o.streamerPointRate ?? o.streamer_point_rate)
        const u = Number(o.userFlowPointRate ?? o.user_flow_point_rate)
        return {
          streamerPointRate: Number.isFinite(s) ? s : 0.558,
          userFlowPointRate: Number.isFinite(u) ? u : 0.93,
        }
      }
      return { streamerPointRate: 0.558, userFlowPointRate: 0.93 }
    })(),
    overviewHalls,
    overviewHallNo: asStr(data.overviewHallNo),
    streamerTotalWage: asNum(data.streamerTotalWage),
    streamerProfit: asNum(data.streamerProfit),
    halls,
    hallNo: asStr(data.hallNo),
    streamerHalls,
    streamerHallNo: asStr(data.streamerHallNo),
    streamerHallHasEmpty: Boolean(data.streamerHallHasEmpty),
    streamerSummary,
    userSummary,
    batches,
    empty: Boolean(data.empty),
    emptyMessage: typeof data.emptyMessage === 'string' ? data.emptyMessage : null,
    salesRevenue,
    viewerScope: (() => {
      const vs = data.viewerScope
      if (!vs || typeof vs !== 'object') return undefined
      const o = vs as Record<string, unknown>
      return {
        hallNo: typeof o.hallNo === 'string' ? o.hallNo : null,
        hideOverviewTotals: Boolean(o.hideOverviewTotals),
        hideSalesEstimates: Boolean(o.hideSalesEstimates),
      }
    })(),
  }
}

export type LastWeekRankingRow = {
  rank: number
  nickname: string
  userPlatformId: string
  excludeFromCharm: boolean
  hostHours: number | null
  micHours: number | null
  totalHours: number
  totalFlow: number | null
}


export type GuildPointRates = {
  streamerPointRate: number
  userFlowPointRate: number
}

export async function fetchGuildPointRates(): Promise<GuildPointRates> {
  const { res, data } = await request('/api/admin/guild-point-rates')
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 403) throw new Error('需要管理员权限')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const s = Number(data.streamerPointRate ?? data.streamer_point_rate)
  const u = Number(data.userFlowPointRate ?? data.user_flow_point_rate)
  return {
    streamerPointRate: Number.isFinite(s) ? s : 0.558,
    userFlowPointRate: Number.isFinite(u) ? u : 0.93,
  }
}

export async function updateGuildPointRates(input: {
  streamerPointRate?: number
  userFlowPointRate?: number
}): Promise<GuildPointRates> {
  const { res, data } = await request('/api/admin/guild-point-rates', {
    method: 'PUT',
    body: JSON.stringify({
      streamerPointRate: input.streamerPointRate,
      userFlowPointRate: input.userFlowPointRate,
    }),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 403) throw new Error('需要管理员权限')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '保存失败', '保存失败，请重试'))
  const s = Number(data.streamerPointRate ?? data.streamer_point_rate)
  const u = Number(data.userFlowPointRate ?? data.user_flow_point_rate)
  return {
    streamerPointRate: Number.isFinite(s) ? s : 0.558,
    userFlowPointRate: Number.isFinite(u) ? u : 0.93,
  }
}

export type LastWeekRankingsResponse = {
  range: {
    startDate: string
    endDate: string
    startDateLabel: string
    endDateLabel: string
  } | null
  batchId: string | null
  rows: LastWeekRankingRow[]
  empty: boolean
  fallbackNewest: boolean
}

export async function fetchLastWeekRankings(): Promise<LastWeekRankingsResponse> {
  const { res, data } = await request('/api/rankings/last-week')
  if (!res.ok) {
    throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  }
  const rangeRaw = data.range && typeof data.range === 'object' ? (data.range as Record<string, unknown>) : null
  const asNumOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '')
  const asNum = (v: unknown, fallback = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback

  const rowsRaw = Array.isArray(data.rows) ? data.rows : []
  const rows: LastWeekRankingRow[] = []
  for (const item of rowsRaw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    rows.push({
      rank: asNum(o.rank, rows.length + 1),
      nickname: asStr(o.nickname) || '—',
      userPlatformId: asStr(o.userPlatformId),
      excludeFromCharm: Boolean(o.excludeFromCharm),
      hostHours: asNumOrNull(o.hostHours),
      micHours: asNumOrNull(o.micHours),
      totalHours: asNum(o.totalHours, 0),
      totalFlow: asNumOrNull(o.totalFlow),
    })
  }

  return {
    range: rangeRaw
      ? {
          startDate: asStr(rangeRaw.startDate),
          endDate: asStr(rangeRaw.endDate),
          startDateLabel: asStr(rangeRaw.startDateLabel),
          endDateLabel: asStr(rangeRaw.endDateLabel),
        }
      : null,
    batchId: typeof data.batchId === 'string' ? data.batchId : null,
    rows,
    empty: Boolean(data.empty) || rows.length === 0,
    fallbackNewest: Boolean(data.fallbackNewest),
  }
}

export type PayrollBoardRow = {
  rowId: string
  nickname: string
  streamerId: string
  mergedFlow: number
  totalWage: number | null
  confirmed: boolean
  confirmedAt: string | null
  paid: boolean
  paidAt: string | null
  payQrUrl: string | null
  profileName: string | null
  isHallOwner?: boolean
  hallNo?: string | null
  hallPayMode?: 'union' | 'self' | null
  hallUserFlow?: number | null
  hallStreamerFlow?: number | null
  hallStreamerWageTotal?: number | null
}

export type PayrollBoardResponse = {
  period: {
    year: number
    month: number
    week: number
    label: string
    sharedLabel: string | null
    monday: string
    sunday: string
  }
  range: {
    startDate: string
    endDate: string
    startDateLabel: string
    endDateLabel: string
  }
  selectedBatchId: string | null
  rows: PayrollBoardRow[]
  empty: boolean
  emptyMessage?: string
  paidTotal: number
  unpaidTotal: number
  payableTotal: number
  weekBalance: number
  /** all = guild-profit summary; hall = own-hall revenue summary for scoped viewers. */
  summaryScope: 'all' | 'hall'
}

function asPayrollRow(v: unknown): PayrollBoardRow | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const rowId = typeof o.rowId === 'string' ? o.rowId : ''
  if (!rowId) return null
  const mergedFlow =
    typeof o.mergedFlow === 'number' && Number.isFinite(o.mergedFlow) ? o.mergedFlow : 0
  const totalWage =
    typeof o.totalWage === 'number' && Number.isFinite(o.totalWage) ? o.totalWage : null
  const hallNo =
    typeof o.hallNo === 'string' && o.hallNo
      ? o.hallNo
      : typeof o.hall_no === 'string' && o.hall_no
        ? o.hall_no
        : null
  const isHallOwner =
    o.isHallOwner === true ||
    o.is_hall_owner === true ||
    o.isHallOwner === 1 ||
    o.is_hall_owner === 1
  const hallPayRaw =
    typeof o.hallPayMode === 'string'
      ? o.hallPayMode
      : typeof o.hall_pay_mode === 'string'
        ? o.hall_pay_mode
        : ''
  return {
    rowId,
    nickname: typeof o.nickname === 'string' && o.nickname ? o.nickname : '—',
    streamerId: typeof o.streamerId === 'string' ? o.streamerId : '',
    mergedFlow,
    totalWage,
    confirmed: Boolean(o.confirmed),
    confirmedAt: typeof o.confirmedAt === 'string' && o.confirmedAt ? o.confirmedAt : null,
    paid: Boolean(o.paid),
    paidAt: typeof o.paidAt === 'string' && o.paidAt ? o.paidAt : null,
    payQrUrl: typeof o.payQrUrl === 'string' && o.payQrUrl ? o.payQrUrl : null,
    profileName: typeof o.profileName === 'string' && o.profileName ? o.profileName : null,
    isHallOwner: isHallOwner || undefined,
    hallNo,
    hallPayMode: hallPayRaw === 'self' ? 'self' : isHallOwner || hallNo ? 'union' : null,
    hallUserFlow: asLiushuiNum(o.hallUserFlow ?? o.hall_user_flow),
    hallStreamerFlow: asLiushuiNum(o.hallStreamerFlow ?? o.hall_streamer_flow),
    hallStreamerWageTotal: asLiushuiNum(o.hallStreamerWageTotal ?? o.hall_streamer_wage_total),
  }
}

export async function fetchPayrollBoard(params: {
  year: number
  month: number
  week: number
}): Promise<PayrollBoardResponse> {
  const q = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
    week: String(params.week),
  })
  const { res, data } = await request(`/api/admin/payroll?${q.toString()}`)
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 403) throw new Error('需要管理员权限')
  if (!res.ok) {
    const err = typeof data.error === 'string' ? data.error : '加载失败'
    throw new Error(err)
  }
  const periodRaw = data.period && typeof data.period === 'object' ? (data.period as Record<string, unknown>) : {}
  const rangeRaw = data.range && typeof data.range === 'object' ? (data.range as Record<string, unknown>) : {}
  const asNum = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '')

  const rows: PayrollBoardRow[] = []
  if (Array.isArray(data.rows)) {
    for (const raw of data.rows) {
      const r = asPayrollRow(raw)
      if (r) rows.push(r)
    }
  }
  const selectedBatchId =
    typeof data.selectedBatchId === 'string' && data.selectedBatchId
      ? data.selectedBatchId
      : null
  const empty = Boolean(data.empty) || rows.length === 0
  return {
    period: {
      year: asNum(periodRaw.year, params.year),
      month: asNum(periodRaw.month, params.month),
      week: asNum(periodRaw.week, params.week),
      label: asStr(periodRaw.label),
      sharedLabel: typeof periodRaw.sharedLabel === 'string' ? periodRaw.sharedLabel : null,
      monday: asStr(periodRaw.monday),
      sunday: asStr(periodRaw.sunday),
    },
    range: {
      startDate: asStr(rangeRaw.startDate),
      endDate: asStr(rangeRaw.endDate),
      startDateLabel: asStr(rangeRaw.startDateLabel),
      endDateLabel: asStr(rangeRaw.endDateLabel),
    },
    selectedBatchId,
    rows,
    empty,
    emptyMessage: typeof data.emptyMessage === 'string' ? data.emptyMessage : undefined,
    paidTotal: asNum(data.paidTotal, 0),
    unpaidTotal: asNum(data.unpaidTotal, 0),
    payableTotal: asNum(data.payableTotal, 0),
    weekBalance: asNum(data.weekBalance, 0),
    summaryScope: data.summaryScope === 'hall' ? 'hall' : 'all',
  }
}

export type MarkSalaryPaidResponse = {
  paidAt: string
  batchId: string
  userPlatformId: string
}

export async function markSalaryPaidApi(
  batchId: string,
  userPlatformId: string,
  period?: { year: number; month: number; week: number },
): Promise<MarkSalaryPaidResponse> {
  const { res, data } = await request('/api/admin/payroll/paid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batchId,
      userPlatformId,
      ...(period
        ? { year: period.year, month: period.month, week: period.week }
        : {}),
    }),
  })
  if (!res.ok) {
    const err = typeof data.error === 'string' ? data.error : '标记失败'
    throw new Error(err)
  }
  const paidAt = typeof data.paidAt === 'string' ? data.paidAt : ''
  const bid = typeof data.batchId === 'string' ? data.batchId : batchId
  const pid = typeof data.userPlatformId === 'string' ? data.userPlatformId : userPlatformId
  if (!paidAt) throw new Error('标记失败，请重试')
  return { paidAt, batchId: bid, userPlatformId: pid }
}
