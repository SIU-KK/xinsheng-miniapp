import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import initSqlJs, { type Database } from 'sql.js'
import { parseRelationGoal, parseRelationNow } from './src/relation'
import { normalizeFact, scoreFact } from './src/episodicMemory'

const scrypt = promisify(scryptCb)

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'app.db')
const COOKIE = 'xinsheng_sid'
const TOKEN_DAYS = 30
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

export type UserRow = { id: string; username: string }

let db: Database | null = null
let saving = Promise.resolve()

function uid(prefix: string) {
  return prefix + Date.now().toString(36) + '-' + randomBytes(8).toString('hex')
}

function persistNow() {
  if (!db) return
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const data = db.export()
  const tmp = DB_PATH + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(data))
  fs.renameSync(tmp, DB_PATH)
}

function scheduleSave() {
  saving = saving.then(() => persistNow()).catch(() => persistNow())
}

export async function openDb(): Promise<Database> {
  if (db) return db
  const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({
    locateFile: (file) => (file.endsWith('.wasm') ? wasmPath : file),
  })
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH))
  } else {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    db = new SQL.Database()
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      boss_name TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
    CREATE TABLE IF NOT EXISTS episodic_facts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      fact TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_episodic_thread ON episodic_facts(thread_id, user_id, created_at);
  `)
  persistNow()
  return db
}

function one<T>(database: Database, sql: string, params: (string | number)[]): T | null {
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? (stmt.getAsObject() as T) : null
  stmt.free()
  return row
}

function all<T>(database: Database, sql: string, params: (string | number)[]): T[] {
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

function hashEncode(salt: Buffer, key: Buffer) {
  return ['scrypt', String(SCRYPT_N), String(SCRYPT_R), String(SCRYPT_P), salt.toString('base64'), key.toString('base64')].join('$')
}

async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = (await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer
  return hashEncode(salt, key)
}

async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  if (!salt.length || !expected.length || !N || !r || !p) return false
  const key = (await scrypt(password, salt, expected.length, { N, r, p })) as Buffer
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}

export function parseCookie(header: string | undefined, name = COOKIE): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (k === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function setSessionCookie(token: string) {
  const maxAge = TOKEN_DAYS * 24 * 3600
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

function normalizeUsername(raw: string) {
  return raw.trim()
}

export function validateCredentials(username: string, password: string): string | null {
  const u = normalizeUsername(username)
  if (u.length < 2 || u.length > 32) return '用户名需要 2–32 个字符'
  if (!/^[\p{L}\p{N}_.-]+$/u.test(u)) return '用户名只能含字母、数字、._-'
  if (password.length < 6 || password.length > 72) return '密码需要 6–72 个字符'
  return null
}

export async function registerUser(username: string, password: string): Promise<{ ok: true; user: UserRow; token: string } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const err = validateCredentials(username, password)
  if (err) return { ok: false, error: err, status: 400 }
  const u = normalizeUsername(username)
  const existing = one<{ id: string }>(database, 'SELECT id FROM users WHERE username = ? COLLATE NOCASE', [u])
  if (existing) return { ok: false, error: '用户名已被占用', status: 409 }
  const id = uid('u-')
  const password_hash = await hashPassword(password)
  database.run('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)', [
    id,
    u,
    password_hash,
    Date.now(),
  ])
  const token = await issueToken(id)
  scheduleSave()
  return { ok: true, user: { id, username: u }, token }
}

export async function loginUser(username: string, password: string): Promise<{ ok: true; user: UserRow; token: string } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const u = normalizeUsername(username)
  const row = one<{ id: string; username: string; password_hash: string }>(
    database,
    'SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE',
    [u],
  )
  if (!row) return { ok: false, error: '用户名或密码不对', status: 401 }
  const good = await verifyPassword(password, row.password_hash)
  if (!good) return { ok: false, error: '用户名或密码不对', status: 401 }
  const token = await issueToken(row.id)
  scheduleSave()
  return { ok: true, user: { id: row.id, username: row.username }, token }
}

async function issueToken(userId: string) {
  const database = await openDb()
  const token = randomBytes(24).toString('base64url')
  const expires = Date.now() + TOKEN_DAYS * 24 * 3600 * 1000
  database.run('INSERT INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expires])
  return token
}

export async function userFromToken(token: string | null): Promise<UserRow | null> {
  if (!token) return null
  const database = await openDb()
  const now = Date.now()
  const row = one<{ id: string; username: string }>(
    database,
    `SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token = ? AND t.expires_at > ?`,
    [token, now],
  )
  return row
}

export async function logoutToken(token: string | null) {
  if (!token) return
  const database = await openDb()
  database.run('DELETE FROM tokens WHERE token = ?', [token])
  scheduleSave()
}

export type ThreadPayload = Record<string, unknown>

function parsePayload(raw: string): ThreadPayload {
  try {
    const data = JSON.parse(raw) as unknown
    if (data && typeof data === 'object') return data as ThreadPayload
  } catch {
    /* ignore */
  }
  return {}
}

function parseThreadPayload(raw: string): ThreadPayload {
  return hydrateThread(parsePayload(raw))
}

function clipMemory(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  if (!t) return undefined
  return t.length > 1200 ? t.slice(0, 1200) : t
}

function hydrateThread(payload: ThreadPayload): ThreadPayload {
  const companionMemory = clipMemory(payload.companionMemory)
  return {
    ...payload,
    relationNow: parseRelationNow(payload.relationNow),
    relationGoal: parseRelationGoal(payload.relationGoal),
    ...(companionMemory ? { companionMemory } : {}),
  }
}

export async function listThreads(userId: string): Promise<ThreadPayload[]> {
  const database = await openDb()
  const rows = all<{ id: string; payload: string }>(
    database,
    'SELECT id, payload FROM threads WHERE user_id = ? ORDER BY updated_at DESC',
    [userId],
  )
  return rows.map((r) => {
    const thread = parseThreadPayload(r.payload)
    const msgs = asMessages(thread)
    if (msgs.length) return thread
    const stored = all<{ payload: string }>(
      database,
      'SELECT payload FROM messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC',
      [r.id, userId],
    )
    if (stored.length) thread.messages = stored.map((m) => parsePayload(m.payload))
    return thread
  })
}

export async function getThread(userId: string, id: string): Promise<ThreadPayload | null> {
  const database = await openDb()
  const row = one<{ payload: string }>(
    database,
    'SELECT payload FROM threads WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  return row ? parseThreadPayload(row.payload) : null
}

function asMessages(payload: ThreadPayload): unknown[] {
  return Array.isArray(payload.messages) ? payload.messages : []
}

const MAX_STORED_SHOT = 180_000

function slimMessages(messages: unknown[]): unknown[] {
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m
    const o = m as Record<string, unknown>
    if (o.role !== 'user' || typeof o.shot !== 'string') return m
    if (o.shot.length <= MAX_STORED_SHOT) return m
    const { shot: _drop, ...rest } = o
    const text = typeof rest.text === 'string' && rest.text.trim() ? rest.text : '【聊天截图】'
    return { ...rest, text, shotOmitted: true }
  })
}

function slimPayload(payload: ThreadPayload): ThreadPayload {
  if (!Array.isArray(payload.messages)) return payload
  return { ...payload, messages: slimMessages(payload.messages) }
}

function syncMessageRows(database: Database, userId: string, threadId: string, messages: unknown[]) {
  database.run('DELETE FROM messages WHERE thread_id = ? AND user_id = ?', [threadId, userId])
  const now = Date.now()
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    const o = m as Record<string, unknown>
    const mid = typeof o.id === 'string' ? o.id : uid('m-')
    database.run('INSERT OR REPLACE INTO messages (id, thread_id, user_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', [
      mid,
      threadId,
      userId,
      JSON.stringify(m),
      now,
    ])
  }
}

export async function createThread(userId: string, payload: ThreadPayload): Promise<ThreadPayload | { error: string; status: number }> {
  const database = await openDb()
  const id = typeof payload.id === 'string' && payload.id ? payload.id : uid('s-')
  const boss = typeof payload.bossName === 'string' ? payload.bossName.trim() : ''
  const persona = typeof payload.personaId === 'string' ? payload.personaId : 'soft'
  if (!boss) return { error: '缺少老板名称', status: 400 }
  const stored = slimPayload(hydrateThread({ ...payload, id, bossName: boss, personaId: persona, updatedAt: Date.now() }))
  const exists = one<{ id: string }>(database, 'SELECT id FROM threads WHERE id = ?', [id])
  if (exists) return { error: '会话已存在', status: 409 }
  database.run('INSERT INTO threads (id, user_id, boss_name, persona_id, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    userId,
    boss,
    persona,
    JSON.stringify(stored),
    stored.updatedAt as number,
  ])
  syncMessageRows(database, userId, id, asMessages(stored))
  scheduleSave()
  return stored
}

export async function updateThread(
  userId: string,
  id: string,
  patch: ThreadPayload,
): Promise<ThreadPayload | null> {
  const database = await openDb()
  const row = one<{ payload: string }>(
    database,
    'SELECT payload FROM threads WHERE id = ? AND user_id = ?',
    [id, userId],
  )
  if (!row) return null
  const prev = parsePayload(row.payload)
  const next = slimPayload(hydrateThread({ ...prev, ...patch, id, updatedAt: Date.now() }))
  const boss = typeof next.bossName === 'string' ? next.bossName : String(prev.bossName || '')
  const persona = typeof next.personaId === 'string' ? next.personaId : String(prev.personaId || 'soft')
  database.run(
    'UPDATE threads SET boss_name = ?, persona_id = ?, payload = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [boss, persona, JSON.stringify(next), next.updatedAt as number, id, userId],
  )
  if (Array.isArray(next.messages)) syncMessageRows(database, userId, id, next.messages)
  scheduleSave()
  return next
}

export async function deleteThread(userId: string, id: string): Promise<boolean> {
  const database = await openDb()
  const row = one<{ id: string }>(database, 'SELECT id FROM threads WHERE id = ? AND user_id = ?', [id, userId])
  if (!row) return false
  database.run('DELETE FROM messages WHERE thread_id = ? AND user_id = ?', [id, userId])
  database.run('DELETE FROM episodic_facts WHERE thread_id = ? AND user_id = ?', [id, userId])
  database.run('DELETE FROM threads WHERE id = ? AND user_id = ?', [id, userId])
  scheduleSave()
  return true
}

export async function listMessages(userId: string, threadId: string): Promise<unknown[] | null> {
  const thread = await getThread(userId, threadId)
  if (!thread) return null
  const database = await openDb()
  const rows = all<{ payload: string }>(
    database,
    'SELECT payload FROM messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC',
    [threadId, userId],
  )
  if (rows.length) return rows.map((r) => parsePayload(r.payload))
  return asMessages(thread)
}

export async function appendMessage(
  userId: string,
  threadId: string,
  message: unknown,
): Promise<ThreadPayload | null> {
  const database = await openDb()
  const row = one<{ payload: string }>(
    database,
    'SELECT payload FROM threads WHERE id = ? AND user_id = ?',
    [threadId, userId],
  )
  if (!row) return null
  const payload = parsePayload(row.payload)
  const messages = asMessages(payload)
  const msg = message && typeof message === 'object' ? { ...(message as Record<string, unknown>) } : null
  if (!msg) return payload
  if (typeof msg.id !== 'string' || !msg.id) msg.id = uid('m-')
  messages.push(msg)
  payload.messages = slimMessages(messages)
  payload.updatedAt = Date.now()
  database.run(
    'UPDATE threads SET payload = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [JSON.stringify(payload), payload.updatedAt as number, threadId, userId],
  )
  database.run('INSERT OR REPLACE INTO messages (id, thread_id, user_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', [
    String(msg.id),
    threadId,
    userId,
    JSON.stringify(msg),
    Date.now(),
  ])
  scheduleSave()
  return payload
}


const EPISODIC_THREAD_MAX = 80

export async function addEpisodicFacts(userId: string, threadId: string, facts: string[]): Promise<void> {
  if (!userId || !threadId || !facts?.length) return
  const database = await openDb()
  const existing = all<{ id: string; fact: string }>(
    database,
    'SELECT id, fact FROM episodic_facts WHERE thread_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?',
    [threadId, userId, EPISODIC_THREAD_MAX],
  )
  const existingTexts = existing.map((r) => r.fact)
  const toAdd: string[] = []
  for (const raw of facts.slice(0, 3)) {
    const fact = normalizeFact(raw)
    if (!fact) continue
    const dup = existingTexts.some((e) => e === fact || e.includes(fact) || fact.includes(e))
      || toAdd.some((e) => e === fact || e.includes(fact) || fact.includes(e))
    if (dup) continue
    toAdd.push(fact)
  }
  if (!toAdd.length) return
  const now = Date.now()
  for (const fact of toAdd) {
    database.run('INSERT INTO episodic_facts (id, user_id, thread_id, fact, created_at) VALUES (?, ?, ?, ?, ?)', [
      uid('ef-'),
      userId,
      threadId,
      fact,
      now,
    ])
  }
  const countRow = one<{ c: number }>(
    database,
    'SELECT COUNT(*) AS c FROM episodic_facts WHERE thread_id = ? AND user_id = ?',
    [threadId, userId],
  )
  const total = Number(countRow?.c || 0)
  if (total > EPISODIC_THREAD_MAX) {
    const overflow = total - EPISODIC_THREAD_MAX
    const oldest = all<{ id: string }>(
      database,
      'SELECT id FROM episodic_facts WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT ?',
      [threadId, userId, overflow],
    )
    for (const row of oldest) {
      database.run('DELETE FROM episodic_facts WHERE id = ?', [row.id])
    }
  }
  scheduleSave()
}

export async function searchEpisodicFacts(
  userId: string,
  threadId: string,
  query: string,
  limit = 6,
): Promise<string[]> {
  if (!userId || !threadId) return []
  const database = await openDb()
  const rows = all<{ fact: string }>(
    database,
    'SELECT fact FROM episodic_facts WHERE thread_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?',
    [threadId, userId, EPISODIC_THREAD_MAX],
  )
  const facts = rows.map((r) => r.fact).filter(Boolean)
  if (!facts.length) return []
  const lim = Math.max(1, Math.min(limit, 12))
  const q = (query || '').trim()
  if (!q) {
    return [...new Set(facts.slice(0, Math.min(3, lim)))]
  }
  const scored = facts
    .map((fact) => ({ fact, score: scoreFact(q, fact) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || facts.indexOf(a.fact) - facts.indexOf(b.fact))
  if (!scored.length) {
    return [...new Set(facts.slice(0, Math.min(3, lim)))]
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of scored) {
    if (seen.has(s.fact)) continue
    seen.add(s.fact)
    out.push(s.fact)
    if (out.length >= lim) break
  }
  return out
}

export { DB_PATH, COOKIE }
