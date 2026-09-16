import { parseRelationGoal, parseRelationNow } from './relation'
import type { ChatMessage, Session } from './types'
import { isCoachId } from './coachAgents'

export type AuthUser = { id: string; username: string }

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
    return { id: u.id, username: u.username }
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

export type AdminUser = { id: string; username: string; status: 'pending' | 'approved'; created_at: number }

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { res, data } = await request('/api/admin/users')
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '加载失败', '加载失败，请重试'))
  const list = Array.isArray(data.users) ? data.users : []
  return list
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const u = raw as Record<string, unknown>
      if (typeof u.id !== 'string' || typeof u.username !== 'string') return null
      const status = u.status === 'pending' ? 'pending' : 'approved'
      return {
        id: u.id,
        username: u.username,
        status: status as 'pending' | 'approved',
        created_at: typeof u.created_at === 'number' ? u.created_at : 0,
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

export async function loginAccount(username: string, password: string): Promise<AuthUser> {
  const { res, data } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(toUserError(typeof data.error === 'string' ? data.error : '登录失败', '登录失败，请重试'))
  const user = data.user as AuthUser | undefined
  if (!user?.id || !user.username) throw new Error('登录失败，请重试')
  return user
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
