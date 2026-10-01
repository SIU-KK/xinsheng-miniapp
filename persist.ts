import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import initSqlJs, { type Database } from 'sql.js'
import { parseRelationGoal, parseRelationNow } from './src/relation'
import { normalizeFact, scoreFact } from './src/episodicMemory'
import {
  formatChineseDateLabel,
  formatFlowDisplay,
  rollupLiushuiByProfiles,
  type LiushuiParsedRow,
  type LiushuiRollupProfile,
} from './liushuiParse'
import {
  rollupActivityByProfiles,
  type ActivityParsedRow,
} from './activityParse'
import { computedPointRateText } from './src/pointRate'
import { computeRowWages, formatMoney2, parsePointRateNumber, roundMoney } from './src/liushuiWage'
import { withProfileSlugs } from './src/pinyinSlug'

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

export type UserStatus = 'pending' | 'approved'

export type AdminUserRow = {
  id: string
  username: string
  status: UserStatus
  created_at: number
  pointRate?: string
  isHallOwner?: boolean
  privilegeRank?: number
  canManage?: boolean
}

/** Bootstrap 会长 / guild president (username `admin`). Point-rate 全满 is checked via isFullAdminAccess.
 * 半满 (without 厅主) is a normal 主播 — no admin/revenue/payroll menus. */
export function isAdminUsername(username: string) {
  return username.trim().toLowerCase() === 'admin'
}

/** Normalize 点位 type label (strip numeric suffix / parentheses). */
export function normalizePointTypeLabel(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  for (const label of ['福利图', '歌手', '特殊', '厅管', '半满', '全满', '大哥'] as const) {
    if (t === label || t.startsWith(label) || new RegExp(`[（(]\\s*${label}\\s*[）)]`, 'u').test(t)) {
      return label
    }
  }
  return t
}

export function isQuanManPoint(pointRate: string): boolean {
  return normalizePointTypeLabel(pointRate) === '全满'
}

export function isTingGuanPoint(pointRate: string): boolean {
  return normalizePointTypeLabel(pointRate) === '厅管'
}

export function isDagePoint(pointRate: string): boolean {
  return normalizePointTypeLabel(pointRate) === '大哥'
}

/** Privilege rank: admin/会长 > 全满 > 厅管/厅主 > 主播/半满 > 大哥 */
export function accountPrivilegeRank(opts: {
  username: string
  pointRate?: string
  isHallOwner?: boolean
}): number {
  if (isAdminUsername(opts.username)) return 100
  const pt = normalizePointTypeLabel(opts.pointRate || '')
  if (pt === '全满') return 80
  if (pt === '厅管' || opts.isHallOwner) return 60
  if (pt === '大哥') return 20
  return 40
}

export async function resolveUserPrivilegeRank(userId: string, username: string): Promise<number> {
  if (isAdminUsername(username)) return 100
  if (!userId) return accountPrivilegeRank({ username })
  const profile = await getStreamerProfileByUser(userId)
  return accountPrivilegeRank({
    username,
    pointRate: profile?.pointRate || '',
    isHallOwner: !!profile?.isHallOwner,
  })
}

/** Lower privilege cannot open/view/edit higher-privilege accounts. Equal rank OK; self OK. */
export async function canManageAccount(
  actorId: string,
  actorUsername: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const target = one<{ id: string; username: string }>(
    database,
    'SELECT id, username FROM users WHERE id = ?',
    [targetUserId],
  )
  if (!target) return { ok: false, error: '用户不存在', status: 404 }
  const actorRank = await resolveUserPrivilegeRank(actorId, actorUsername)
  const targetRank = await resolveUserPrivilegeRank(target.id, target.username)
  if (actorRank < targetRank) {
    return { ok: false, error: '权限不足，无法查看或编辑更高权限账号', status: 403 }
  }
  return { ok: true }
}

/** Default 厅点位 / 用户流水点位 for 厅主 hall-income formulas (per-hall, NOT guild). */
export const DEFAULT_HALL_POINT_RATE = 0.53
export const DEFAULT_USER_FLOW_POINT_RATE = 0.74

/**
 * Guild-level 工会点位 defaults (global, editable by admin/会长).
 * Used for 工会收款 / 工会收益 / 流水总收益 — distinct from per-hall 厅主 rates.
 * 主播点位 0.558 consolidates historical platform factor 0.6×0.93.
 * 用户流水点位 0.93 matches historical platform factor (editable placeholder).
 */
export const DEFAULT_GUILD_STREAMER_POINT_RATE = 0.558
export const DEFAULT_GUILD_USER_FLOW_POINT_RATE = 0.93

export function normalizeHallPointRate(v: unknown, fallback = DEFAULT_HALL_POINT_RATE): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 2) return fallback
  return Math.round(n * 10000) / 10000
}

export function normalizeUserFlowPointRate(v: unknown, fallback = DEFAULT_USER_FLOW_POINT_RATE): number {
  return normalizeHallPointRate(v, fallback)
}

export function normalizeGuildStreamerPointRate(
  v: unknown,
  fallback = DEFAULT_GUILD_STREAMER_POINT_RATE,
): number {
  return normalizeHallPointRate(v, fallback)
}

export function normalizeGuildUserFlowPointRate(
  v: unknown,
  fallback = DEFAULT_GUILD_USER_FLOW_POINT_RATE,
): number {
  return normalizeHallPointRate(v, fallback)
}

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
  migrateUsers(db)
  migrateStreamer(db)
  migrateLiushui(db)
  migrateActivity(db)
  migrateCommission(db)
  migrateMyDage(db)
  migrateSalaryConfirmations(db)
  migrateSalaryPayments(db)
  migrateAppSettings(db)
  // Idempotent: freeze live wages onto legacy 已付款 rows with NULL paid_wage
  const backfill = await backfillFrozenPaidWages(db)
  if (backfill.scanned > 0) {
    console.info('[persist] backfillFrozenPaidWages', backfill)
  }
  await ensureAdminUser(db)
  persistNow()
  return db
}

function tableHasColumn(database: Database, table: string, column: string) {
  const cols = all<{ name: string }>(database, `PRAGMA table_info(${table})`, [])
  return cols.some((c) => c.name === column)
}

function migrateUsers(database: Database) {
  if (!tableHasColumn(database, 'users', 'status')) {
    database.run(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'`)
  }
  database.run(`UPDATE users SET status = 'approved' WHERE status IS NULL OR status = ''`)
}

function migrateSalaryConfirmations(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS salary_confirmations (
      user_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, batch_id)
    );
  `)
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_salary_confirmations_batch ON salary_confirmations(batch_id)`,
  )
}

function migrateSalaryPayments(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      batch_id TEXT NOT NULL,
      user_platform_id TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      paid_by TEXT NOT NULL,
      paid_wage REAL,
      paid_snapshot TEXT,
      PRIMARY KEY (batch_id, user_platform_id)
    );
  `)
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_salary_payments_batch ON salary_payments(batch_id)`,
  )
  // Existing DBs created before wage snapshot columns — ADD COLUMN, do not wipe.
  // Streamer paid rows use snapshots; 厅主 rows always calculate live wages and ignore them.
  if (!tableHasColumn(database, 'salary_payments', 'paid_wage')) {
    database.run(`ALTER TABLE salary_payments ADD COLUMN paid_wage REAL`)
  }
  if (!tableHasColumn(database, 'salary_payments', 'paid_snapshot')) {
    database.run(`ALTER TABLE salary_payments ADD COLUMN paid_snapshot TEXT`)
  }
}

/** Global key-value settings (工会点位 etc.). */
function migrateAppSettings(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

const GUILD_STREAMER_POINT_KEY = 'guild_streamer_point_rate'
const GUILD_USER_FLOW_POINT_KEY = 'guild_user_flow_point_rate'

export type GuildPointRates = {
  /** 工会点位·主播点位 — default 0.558 */
  streamerPointRate: number
  /** 工会点位·用户流水点位 — default 0.93 */
  userFlowPointRate: number
}

function readAppSetting(database: Database, key: string): string | null {
  migrateAppSettings(database)
  const row = one<{ value: string }>(database, `SELECT value FROM app_settings WHERE key = ?`, [key])
  return row ? String(row.value) : null
}

function writeAppSetting(database: Database, key: string, value: string) {
  migrateAppSettings(database)
  const now = Date.now()
  database.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  )
}

/** Load global 工会点位 (主播点位 / 用户流水点位). Persisted; defaults 0.558 / 0.93. */
export async function getGuildPointRates(): Promise<GuildPointRates> {
  const database = await openDb()
  migrateAppSettings(database)
  // Number(null)===0 would pass normalize — treat missing key as default.
  const rawStreamer = readAppSetting(database, GUILD_STREAMER_POINT_KEY)
  const rawUser = readAppSetting(database, GUILD_USER_FLOW_POINT_KEY)
  return {
    streamerPointRate:
      rawStreamer == null || rawStreamer === ''
        ? DEFAULT_GUILD_STREAMER_POINT_RATE
        : normalizeGuildStreamerPointRate(rawStreamer),
    userFlowPointRate:
      rawUser == null || rawUser === ''
        ? DEFAULT_GUILD_USER_FLOW_POINT_RATE
        : normalizeGuildUserFlowPointRate(rawUser),
  }
}

/** Update global 工会点位. Admin/会长 only at API layer. */
export async function setGuildPointRates(input: {
  streamerPointRate?: unknown
  userFlowPointRate?: unknown
}): Promise<GuildPointRates> {
  const database = await openDb()
  migrateAppSettings(database)
  const current = await getGuildPointRates()
  const streamerPointRate =
    input.streamerPointRate !== undefined
      ? normalizeGuildStreamerPointRate(input.streamerPointRate, current.streamerPointRate)
      : current.streamerPointRate
  const userFlowPointRate =
    input.userFlowPointRate !== undefined
      ? normalizeGuildUserFlowPointRate(input.userFlowPointRate, current.userFlowPointRate)
      : current.userFlowPointRate
  writeAppSetting(database, GUILD_STREAMER_POINT_KEY, String(streamerPointRate))
  writeAppSetting(database, GUILD_USER_FLOW_POINT_KEY, String(userFlowPointRate))
  scheduleSave()
  return { streamerPointRate, userFlowPointRate }
}

export type BackfillFrozenPaidWagesResult = {
  scanned: number
  updated: number
  skipped: number
  errors: number
  errorDetails?: string[]
}

let lastBackfillFrozenPaidWagesResult: BackfillFrozenPaidWagesResult | null = null

export function getLastBackfillFrozenPaidWagesResult(): BackfillFrozenPaidWagesResult | null {
  return lastBackfillFrozenPaidWagesResult
}

/**
 * Freeze live wages into paid_wage/paid_snapshot for legacy streamer 已付款 rows
 * that predate snapshot columns (paid_wage IS NULL). 厅主 rows are deliberately
 * skipped because their payroll must remain live. Idempotent: only touches NULL
 * paid_wage; does not change paid_at / paid_by.
 *
 * When called without `database`, opens the DB (which also runs this once);
 * returns the last backfill result from that open path.
 */
export async function backfillFrozenPaidWages(
  database?: Database,
): Promise<BackfillFrozenPaidWagesResult> {
  if (!database) {
    await openDb()
    return (
      lastBackfillFrozenPaidWagesResult ?? {
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      }
    )
  }
  const dbToUse = database
  migrateSalaryPayments(dbToUse)
  migrateLiushui(dbToUse)
  migrateStreamer(dbToUse)

  const rows = all<{ batch_id: string; user_platform_id: string }>(
    dbToUse,
    `SELECT batch_id, user_platform_id FROM salary_payments WHERE paid_wage IS NULL`,
    [],
  )

  let updated = 0
  let skipped = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const row of rows) {
    const bid = String(row.batch_id || '').trim()
    const pid = String(row.user_platform_id || '').trim()
    if (!bid || !pid) {
      skipped++
      continue
    }
    try {
      // 厅主 wages are never frozen, including legacy payment rows.
      const hallOwner = one<{ id: string }>(
        dbToUse,
        `SELECT id FROM streamer_profiles
         WHERE COALESCE(is_hall_owner, 0) = 1
           AND TRIM(COALESCE(hall_no, '')) != ''
           AND (
             streamer_id = ?
             OR linked_id_1 = ?
             OR linked_id_2 = ?
             OR linked_id_3 = ?
           )
         LIMIT 1`,
        [pid, pid, pid, pid],
      )
      if (hallOwner) {
        skipped++
        continue
      }
      const snap = await resolveWageSnapshotForPay(dbToUse, bid, pid, null)
      if (snap.paidWage == null && snap.paidSnapshot == null) {
        skipped++
        continue
      }
      dbToUse.run(
        `UPDATE salary_payments
         SET paid_wage = ?, paid_snapshot = ?
         WHERE batch_id = ? AND user_platform_id = ? AND paid_wage IS NULL`,
        [snap.paidWage, snap.paidSnapshot, bid, pid],
      )
      updated++
    } catch (e) {
      errors++
      const msg = e instanceof Error ? e.message : String(e)
      if (errorDetails.length < 20) errorDetails.push(`${bid}/${pid}: ${msg}`)
    }
  }

  if (updated > 0) {
    scheduleSave()
    await saving
  }

  const result: BackfillFrozenPaidWagesResult = {
    scanned: rows.length,
    updated,
    skipped,
    errors,
    ...(errorDetails.length ? { errorDetails } : {}),
  }
  lastBackfillFrozenPaidWagesResult = result
  return result
}

/** Hall-owner detail frozen at 已付款 time (JSON in paid_snapshot). */
type HallPaidSnapshot = {
  hallUserFlow: number
  hallStreamerFlow: number
  hallStreamerWageTotal: number
}

type SalaryPayHit = {
  paidAt: string
  paidWage: number | null
  paidSnapshot: HallPaidSnapshot | null
}

function parseHallPaidSnapshot(raw: unknown): HallPaidSnapshot | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  try {
    const o = JSON.parse(s) as Record<string, unknown>
    const hallUserFlow = typeof o.hallUserFlow === 'number' && Number.isFinite(o.hallUserFlow) ? o.hallUserFlow : null
    const hallStreamerFlow =
      typeof o.hallStreamerFlow === 'number' && Number.isFinite(o.hallStreamerFlow) ? o.hallStreamerFlow : null
    const hallStreamerWageTotal =
      typeof o.hallStreamerWageTotal === 'number' && Number.isFinite(o.hallStreamerWageTotal)
        ? o.hallStreamerWageTotal
        : null
    if (hallUserFlow == null || hallStreamerFlow == null || hallStreamerWageTotal == null) return null
    return { hallUserFlow, hallStreamerFlow, hallStreamerWageTotal }
  } catch {
    return null
  }
}

function stringifyHallPaidSnapshot(s: HallPaidSnapshot): string {
  return JSON.stringify({
    hallUserFlow: s.hallUserFlow,
    hallStreamerFlow: s.hallStreamerFlow,
    hallStreamerWageTotal: s.hallStreamerWageTotal,
  })
}

async function ensureAdminUser(database: Database) {
  const existing = one<{ id: string; password_hash: string; status: string }>(
    database,
    `SELECT id, password_hash, status FROM users WHERE username = ? COLLATE NOCASE`,
    ['admin'],
  )
  if (!existing) {
    const password_hash = await hashPassword('99267')
    database.run(
      `INSERT INTO users (id, username, password_hash, created_at, status) VALUES (?, ?, ?, ?, ?)`,
      [uid('u-'), 'admin', password_hash, Date.now(), 'approved'],
    )
  } else if (existing.status !== 'approved') {
    database.run(`UPDATE users SET status = 'approved' WHERE id = ?`, [existing.id])
  }
  // Do not create a passwordless account, but promote the existing named admin.
  database.run(`UPDATE users SET status = 'approved' WHERE username = ? COLLATE NOCASE`, ['顾清欢'])
}

function one<T>(database: Database, sql: string, params: (string | number | null)[]): T | null {
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? (stmt.getAsObject() as T) : null
  stmt.free()
  return row
}

function all<T>(database: Database, sql: string, params: (string | number | null)[]): T[] {
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
  if (password.length < 5 || password.length > 72) return '密码需要 5–72 个字符'
  return null
}

export async function registerUser(username: string, password: string): Promise<{ ok: true; pending: true; user: UserRow } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const err = validateCredentials(username, password)
  if (err) return { ok: false, error: err, status: 400 }
  const u = normalizeUsername(username)
  if (isAdminUsername(u)) return { ok: false, error: '用户名已被占用', status: 409 }
  const existing = one<{ id: string }>(database, 'SELECT id FROM users WHERE username = ? COLLATE NOCASE', [u])
  if (existing) return { ok: false, error: '用户名已被占用', status: 409 }
  const id = uid('u-')
  const password_hash = await hashPassword(password)
  database.run('INSERT INTO users (id, username, password_hash, created_at, status) VALUES (?, ?, ?, ?, ?)', [
    id,
    u,
    password_hash,
    Date.now(),
    'pending',
  ])
  scheduleSave()
  return { ok: true, pending: true, user: { id, username: u } }
}

export async function loginUser(username: string, password: string): Promise<{ ok: true; user: UserRow; token: string } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const u = normalizeUsername(username)
  const row = one<{ id: string; username: string; password_hash: string; status: string }>(
    database,
    'SELECT id, username, password_hash, status FROM users WHERE username = ? COLLATE NOCASE',
    [u],
  )
  if (!row) return { ok: false, error: '用户名或密码不对', status: 401 }
  const good = await verifyPassword(password, row.password_hash)
  if (!good) return { ok: false, error: '用户名或密码不对', status: 401 }
  if ((row.status || 'approved') !== 'approved') {
    return { ok: false, error: '账号待管理员确认', status: 403 }
  }
  const token = await issueToken(row.id)
  scheduleSave()
  return { ok: true, user: { id: row.id, username: row.username }, token }
}

export async function listUsersForAdmin(
  actorId?: string,
  actorUsername?: string,
): Promise<AdminUserRow[]> {
  const database = await openDb()
  migrateStreamer(database)
  const rows = all<{ id: string; username: string; status: string; created_at: number }>(
    database,
    `SELECT id, username, status, created_at FROM users ORDER BY
      CASE WHEN username = 'admin' COLLATE NOCASE THEN 0 ELSE 1 END,
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      created_at DESC`,
    [],
  )
  const actorRank =
    actorId && actorUsername
      ? await resolveUserPrivilegeRank(actorId, actorUsername)
      : 100
  const out: AdminUserRow[] = []
  for (const r of rows) {
    const profile = await getStreamerProfileByUser(r.id)
    const pointRate = profile?.pointRate || ''
    const isHallOwner = !!profile?.isHallOwner
    const privilegeRank = accountPrivilegeRank({
      username: r.username,
      pointRate,
      isHallOwner,
    })
    out.push({
      id: r.id,
      username: r.username,
      status: (r.status === 'pending' ? 'pending' : 'approved') as UserStatus,
      created_at: Number(r.created_at) || 0,
      pointRate,
      isHallOwner,
      privilegeRank,
      canManage: actorRank >= privilegeRank,
    })
  }
  return out
}

export async function approveUser(userId: string): Promise<{ ok: true; user: AdminUserRow } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const row = one<{ id: string; username: string; status: string; created_at: number }>(
    database,
    'SELECT id, username, status, created_at FROM users WHERE id = ?',
    [userId],
  )
  if (!row) return { ok: false, error: '用户不存在', status: 404 }
  database.run(`UPDATE users SET status = 'approved' WHERE id = ?`, [userId])
  scheduleSave()
  return {
    ok: true,
    user: {
      id: row.id,
      username: row.username,
      status: 'approved',
      created_at: Number(row.created_at) || 0,
    },
  }
}

function deleteUserCascade(database: Database, userId: string) {
  const sp = one<{ id: string }>(database, 'SELECT id FROM streamer_profiles WHERE user_id = ?', [userId])
  if (sp) {
    deletePhotoFiles(database, sp.id)
    try {
      const dir = path.join(UPLOADS_DIR, sp.id)
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    database.run('DELETE FROM streamer_profiles WHERE id = ?', [sp.id])
  }
  try {
    database.run('DELETE FROM streamer_my_dage WHERE user_id = ?', [userId])
  } catch {
    /* table may not exist yet on very old DBs mid-migrate */
  }
  database.run('DELETE FROM tokens WHERE user_id = ?', [userId])
  database.run('DELETE FROM messages WHERE user_id = ?', [userId])
  database.run('DELETE FROM episodic_facts WHERE user_id = ?', [userId])
  database.run('DELETE FROM threads WHERE user_id = ?', [userId])
  database.run('DELETE FROM users WHERE id = ?', [userId])
}

/** Reject a pending registration: delete the user row (+ tokens/related rows). */
export async function rejectUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const row = one<{ id: string; username: string; status: string }>(
    database,
    'SELECT id, username, status FROM users WHERE id = ?',
    [userId],
  )
  if (!row) return { ok: false, error: '用户不存在', status: 404 }
  if (isAdminUsername(row.username)) return { ok: false, error: '不能拒绝管理员账号', status: 403 }
  if ((row.status || 'approved') !== 'pending') {
    return { ok: false, error: '只能拒绝待确认账号', status: 400 }
  }
  deleteUserCascade(database, userId)
  scheduleSave()
  return { ok: true }
}

/** Remove an approved (or any non-admin) account: cascade tokens/threads/messages/facts. */
export async function removeUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  const row = one<{ id: string; username: string; status: string }>(
    database,
    'SELECT id, username, status FROM users WHERE id = ?',
    [userId],
  )
  if (!row) return { ok: false, error: '用户不存在', status: 404 }
  if (isAdminUsername(row.username)) return { ok: false, error: '不能移除管理员账号', status: 403 }
  deleteUserCascade(database, userId)
  scheduleSave()
  return { ok: true }
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


/* ── streamer profiles ─────────────────────────────────────────── */

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'profiles')

export type StreamerPhoto = {
  id: string
  url: string
  sort: number
}

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
  /** 点位类型标签 (福利图/歌手/特殊/厅管/半满/全满) */
  pointRate: string
  /** 介绍人ID */
  referrerId: string
  /** 关联其他ID ×3 — 关联账号流水归属本主播 */
  linkedId1: string
  linkedId2: string
  linkedId3: string
  /** 厅主：可看本厅收益看板；工资按厅收益合计 */
  isHallOwner: boolean
  /** 厅主发薪方式：union=工会代发工资；self=厅主自行发工资 */
  hallPayMode: 'union' | 'self'
  /** 厅主：厅点位（主播流水×此点位）；默认 0.53 */
  hallPointRate: number
  /** 厅主：用户流水点位；默认 0.74 */
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

function ensureStreamerTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS streamer_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      hall_no TEXT NOT NULL,
      name TEXT NOT NULL,
      streamer_id TEXT NOT NULL,
      live_time TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL,
      height TEXT NOT NULL DEFAULT '',
      weight TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '',
      point_rate TEXT NOT NULL DEFAULT '',
      referrer_id TEXT NOT NULL DEFAULT '',
      linked_id_1 TEXT NOT NULL DEFAULT '',
      linked_id_2 TEXT NOT NULL DEFAULT '',
      linked_id_3 TEXT NOT NULL DEFAULT '',
      pay_qr_path TEXT NOT NULL DEFAULT '',
      pay_qr_mime TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS streamer_photos (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      mime TEXT NOT NULL DEFAULT 'image/jpeg',
      path TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_streamer_photos_profile ON streamer_photos(profile_id, sort);
  `)
}

function migrateStreamer(database: Database) {
  ensureStreamerTables(database)
  const cols: [string, string][] = [
    ['point_rate', "ALTER TABLE streamer_profiles ADD COLUMN point_rate TEXT NOT NULL DEFAULT ''"],
    ['referrer_id', "ALTER TABLE streamer_profiles ADD COLUMN referrer_id TEXT NOT NULL DEFAULT ''"],
    ['linked_id_1', "ALTER TABLE streamer_profiles ADD COLUMN linked_id_1 TEXT NOT NULL DEFAULT ''"],
    ['linked_id_2', "ALTER TABLE streamer_profiles ADD COLUMN linked_id_2 TEXT NOT NULL DEFAULT ''"],
    ['linked_id_3', "ALTER TABLE streamer_profiles ADD COLUMN linked_id_3 TEXT NOT NULL DEFAULT ''"],
    ['pay_qr_path', "ALTER TABLE streamer_profiles ADD COLUMN pay_qr_path TEXT NOT NULL DEFAULT ''"],
    ['pay_qr_mime', "ALTER TABLE streamer_profiles ADD COLUMN pay_qr_mime TEXT NOT NULL DEFAULT ''"],
  ]
  for (const [col, sql] of cols) {
    if (!tableHasColumn(database, 'streamer_profiles', col)) {
      database.run(sql)
    }
  }
  // One-time: add is_hall_owner + seed legacy 澜心 as hall owner of 8833
  if (!tableHasColumn(database, 'streamer_profiles', 'is_hall_owner')) {
    database.run(
      `ALTER TABLE streamer_profiles ADD COLUMN is_hall_owner INTEGER NOT NULL DEFAULT 0`,
    )
    seedLegacyHallOwnerLanxin(database)
  }
  // hall_pay_mode: union=工会代发工资；self=厅主自行发工资 (DEFAULT union)
  if (!tableHasColumn(database, 'streamer_profiles', 'hall_pay_mode')) {
    database.run(
      `ALTER TABLE streamer_profiles ADD COLUMN hall_pay_mode TEXT NOT NULL DEFAULT 'union'`,
    )
  }
  if (!tableHasColumn(database, 'streamer_profiles', 'hall_point_rate')) {
    database.run(
      `ALTER TABLE streamer_profiles ADD COLUMN hall_point_rate REAL NOT NULL DEFAULT 0.53`,
    )
  }
  if (!tableHasColumn(database, 'streamer_profiles', 'user_flow_point_rate')) {
    database.run(
      `ALTER TABLE streamer_profiles ADD COLUMN user_flow_point_rate REAL NOT NULL DEFAULT 0.74`,
    )
  }
  migrateMyDage(database)
}

export type HallPayMode = 'union' | 'self'

export function normalizeHallPayMode(v: unknown): HallPayMode {
  return String(v ?? '').trim() === 'self' ? 'self' : 'union'
}

/** Migration seed only — do not use for access checks. */
const HALL_OWNER_SEED_USERNAME = '澜心'
const HALL_OWNER_SEED_HALL_NO = '8833'

function seedLegacyHallOwnerLanxin(database: Database) {
  const user = one<{ id: string }>(
    database,
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE',
    [HALL_OWNER_SEED_USERNAME],
  )
  if (!user) return
  const now = Date.now()
  const existing = one<{ id: string; hall_no: string }>(
    database,
    'SELECT id, hall_no FROM streamer_profiles WHERE user_id = ?',
    [user.id],
  )
  if (existing) {
    const hall = String(existing.hall_no || '').trim() || HALL_OWNER_SEED_HALL_NO
    database.run(
      `UPDATE streamer_profiles
       SET is_hall_owner = 1, hall_no = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [hall, now, existing.id, user.id],
    )
  } else {
    database.run(
      `INSERT INTO streamer_profiles
        (id, user_id, hall_no, name, streamer_id, live_time, region, height, weight, type, skills,
         is_hall_owner, created_at, updated_at)
       VALUES (?, ?, ?, '', '', '', '', '', '', '', '', 1, ?, ?)`,
      [uid('sp-'), user.id, HALL_OWNER_SEED_HALL_NO, now, now],
    )
  }
}

function photoPublicUrl(relPath: string) {
  const safe = relPath.replace(/\\/g, '/')
  return '/api/uploads/' + safe.replace(/^uploads\//, '')
}

function absPhotoPath(relPath: string) {
  return path.join(DATA_DIR, relPath)
}

function listPhotosForProfile(database: Database, profileId: string): StreamerPhoto[] {
  const rows = all<{ id: string; sort: number; path: string }>(
    database,
    'SELECT id, sort, path FROM streamer_photos WHERE profile_id = ? ORDER BY sort ASC, id ASC',
    [profileId],
  )
  return rows.map((r) => ({
    id: r.id,
    sort: Number(r.sort) || 0,
    url: photoPublicUrl(r.path),
  }))
}

function rowToProfile(
  database: Database,
  row: {
    id: string
    user_id: string
    hall_no: string
    name: string
    streamer_id: string
    live_time: string
    region: string
    height: string
    weight: string
    type: string
    skills: string
    point_rate?: string
    referrer_id?: string
    linked_id_1?: string
    linked_id_2?: string
    linked_id_3?: string
    is_hall_owner?: number
    hall_pay_mode?: string
    hall_point_rate?: number
    user_flow_point_rate?: number
    pay_qr_path?: string
    pay_qr_mime?: string
    created_at: number
    updated_at: number
  },
  opts?: { includePayQr?: boolean; includePhotos?: boolean },
): StreamerProfile {
  const includePayQr = opts?.includePayQr === true
  const includePhotos = opts?.includePhotos === true
  const payPath = (row.pay_qr_path || '').trim()
  return {
    id: row.id,
    userId: row.user_id,
    hallNo: row.hall_no,
    name: row.name,
    streamerId: row.streamer_id,
    liveTime: row.live_time || '',
    region: row.region,
    height: row.height || '',
    weight: row.weight || '',
    type: row.type || '',
    skills: row.skills || '',
    pointRate: row.point_rate || '',
    referrerId: row.referrer_id || '',
    linkedId1: row.linked_id_1 || '',
    linkedId2: row.linked_id_2 || '',
    linkedId3: row.linked_id_3 || '',
    isHallOwner: Number(row.is_hall_owner) === 1,
    hallPayMode: normalizeHallPayMode(row.hall_pay_mode),
    hallPointRate: normalizeHallPointRate(row.hall_point_rate),
    userFlowPointRate: normalizeUserFlowPointRate(row.user_flow_point_rate),
    // Public wall list includes photos; payment QR stays private.
    photos: includePhotos ? listPhotosForProfile(database, row.id) : [],
    payQrUrl: includePayQr && payPath ? photoPublicUrl(payPath) : null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }
}

const PROFILE_SELECT = `SELECT id, user_id, hall_no, name, streamer_id, live_time, region, height, weight, type, skills, point_rate, referrer_id, linked_id_1, linked_id_2, linked_id_3, is_hall_owner, hall_pay_mode, hall_point_rate, user_flow_point_rate, pay_qr_path, pay_qr_mime, created_at, updated_at FROM streamer_profiles`

export async function listStreamerProfiles(): Promise<StreamerProfile[]> {
  const database = await openDb()
  migrateStreamer(database)
  // Public wall list includes profile photos, but never payment-QR URLs.
  // Still require at least one photo on file so incomplete drafts stay off the wall.
  // Exclude point_rate 「大哥」 (guest/大哥 accounts) from the public wall; owner/admin keep them.
  const rows = all<{
    id: string
    user_id: string
    hall_no: string
    name: string
    streamer_id: string
    live_time: string
    region: string
    height: string
    weight: string
    type: string
    skills: string
    created_at: number
    updated_at: number
  }>(
    database,
    PROFILE_SELECT +
      ` WHERE EXISTS (SELECT 1 FROM streamer_photos WHERE profile_id = streamer_profiles.id)
         AND TRIM(COALESCE(point_rate, '')) != '大哥'
       ORDER BY updated_at DESC`,
    [],
  )
  const profiles = rows.map((r) => rowToProfile(database, r, { includePayQr: false, includePhotos: true }))
  return withProfileSlugs(profiles)
}

export async function getStreamerProfileByUser(userId: string): Promise<StreamerProfile | null> {
  const database = await openDb()
  migrateStreamer(database)
  const row = one<{
    id: string
    user_id: string
    hall_no: string
    name: string
    streamer_id: string
    live_time: string
    region: string
    height: string
    weight: string
    type: string
    skills: string
    created_at: number
    updated_at: number
  }>(database, PROFILE_SELECT + ' WHERE user_id = ?', [userId])
  return row ? rowToProfile(database, row, { includePayQr: true, includePhotos: true }) : null
}

export type StreamerPhotoInput =
  | { kind: 'keep'; id: string }
  | { kind: 'data'; dataUrl: string }

export type StreamerPayQrInput =
  | { kind: 'keep' }
  | { kind: 'data'; dataUrl: string }
  | { kind: 'clear' }

function parseDataUrl(dataUrl: string): { mime: string; buf: Buffer } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim())
  if (!m) return null
  const mime = m[1].toLowerCase()
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(mime)) return null
  try {
    const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64')
    if (!buf.length || buf.length > 2_500_000) return null
    return { mime: mime === 'image/jpg' ? 'image/jpeg' : mime, buf }
  } catch {
    return null
  }
}

function extForMime(mime: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'jpg'
}

function deletePhotoFiles(database: Database, profileId: string) {
  const rows = all<{ path: string }>(database, 'SELECT path FROM streamer_photos WHERE profile_id = ?', [profileId])
  for (const r of rows) {
    try {
      const abs = absPhotoPath(r.path)
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
  database.run('DELETE FROM streamer_photos WHERE profile_id = ?', [profileId])
}

function writePhotoFile(profileId: string, photoId: string, mime: string, buf: Buffer): string {
  const dir = path.join(UPLOADS_DIR, profileId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const ext = extForMime(mime)
  const rel = path.join('uploads', 'profiles', profileId, photoId + '.' + ext)
  fs.writeFileSync(absPhotoPath(rel), buf)
  return rel.replace(/\\/g, '/')
}

function unlinkStoredFile(relPath: string) {
  const clean = (relPath || '').trim()
  if (!clean) return
  try {
    const abs = absPhotoPath(clean)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch {
    /* ignore */
  }
}

function writePayQrFile(profileId: string, mime: string, buf: Buffer): string {
  const dir = path.join(UPLOADS_DIR, profileId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const ext = extForMime(mime)
  const fileId = uid('pq-')
  const rel = path.join('uploads', 'profiles', profileId, fileId + '.' + ext)
  fs.writeFileSync(absPhotoPath(rel), buf)
  return rel.replace(/\\/g, '/')
}

export async function upsertStreamerProfile(
  userId: string,
  fields: {
    hallNo: string
    name: string
    streamerId: string
    liveTime: string
    region: string
    height: string
    weight: string
    type: string
    skills: string
  },
  photos: StreamerPhotoInput[],
  payQr?: StreamerPayQrInput,
): Promise<{ ok: true; profile: StreamerProfile } | { ok: false; error: string; status: number }> {
  const hallNo = fields.hallNo.trim()
  const name = fields.name.trim()
  const streamerId = fields.streamerId.trim()
  const region = fields.region.trim()
  const liveTime = (fields.liveTime || '').trim().slice(0, 120)
  const height = (fields.height || '').trim().slice(0, 40)
  const weight = (fields.weight || '').trim().slice(0, 40)
  const type = (fields.type || '').trim().slice(0, 80)
  const skills = (fields.skills || '').trim().slice(0, 400)
  if (!hallNo) return { ok: false, error: '请填写厅号', status: 400 }
  if (!name) return { ok: false, error: '请填写主播名称', status: 400 }
  if (!streamerId) return { ok: false, error: '请填写 ID', status: 400 }
  if (!region) return { ok: false, error: '请填写地区', status: 400 }
  if (hallNo.length > 64 || name.length > 64 || streamerId.length > 64 || region.length > 64) {
    return { ok: false, error: '字段过长', status: 400 }
  }
  if (photos.length > 5) {
    return { ok: false, error: '相片最多 5 张', status: 400 }
  }

  const database = await openDb()
  migrateStreamer(database)
  const existing = one<{ id: string; pay_qr_path: string }>(
    database,
    'SELECT id, pay_qr_path FROM streamer_profiles WHERE user_id = ?',
    [userId],
  )
  const now = Date.now()
  const profileId = existing?.id || uid('sp-')

  if (payQr?.kind === 'data' && !parseDataUrl(payQr.dataUrl)) {
    return { ok: false, error: '收款码格式不支持', status: 400 }
  }

  // payment QR required (sensitive — never exposed on public list)
  const payAction = payQr || { kind: 'keep' as const }
  const willHavePayQr =
    payAction.kind === 'data' ||
    (payAction.kind === 'keep' && !!(existing?.pay_qr_path || '').trim())
  if (!willHavePayQr) {
    return { ok: false, error: '请上传收款码', status: 400 }
  }

  const keepIds = new Set(photos.filter((p): p is { kind: 'keep'; id: string } => p.kind === 'keep').map((p) => p.id))
  const oldPhotos = existing
    ? all<{ id: string; path: string; mime: string }>(
        database,
        'SELECT id, path, mime FROM streamer_photos WHERE profile_id = ?',
        [profileId],
      )
    : []
  const oldById = new Map(oldPhotos.map((p) => [p.id, p]))

  for (const p of photos) {
    if (p.kind === 'keep' && !oldById.has(p.id)) {
      return { ok: false, error: '相片无效，请重新上传', status: 400 }
    }
    if (p.kind === 'data' && !parseDataUrl(p.dataUrl)) {
      return { ok: false, error: '相片格式不支持', status: 400 }
    }
  }

  if (!existing) {
    database.run(
      `INSERT INTO streamer_profiles
        (id, user_id, hall_no, name, streamer_id, live_time, region, height, weight, type, skills,
         point_rate, referrer_id, linked_id_1, linked_id_2, linked_id_3, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', ?, ?)`,
      [profileId, userId, hallNo, name, streamerId, liveTime, region, height, weight, type, skills, now, now],
    )
  } else {
    database.run(
      `UPDATE streamer_profiles SET
        hall_no = ?, name = ?, streamer_id = ?, live_time = ?, region = ?,
        height = ?, weight = ?, type = ?, skills = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [hallNo, name, streamerId, liveTime, region, height, weight, type, skills, now, profileId, userId],
    )
  }

  // remove photos not kept
  for (const old of oldPhotos) {
    if (keepIds.has(old.id)) continue
    try {
      const abs = absPhotoPath(old.path)
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
    database.run('DELETE FROM streamer_photos WHERE id = ?', [old.id])
  }

  // rewrite sort order; insert new
  let sort = 0
  for (const p of photos) {
    if (p.kind === 'keep') {
      database.run('UPDATE streamer_photos SET sort = ? WHERE id = ? AND profile_id = ?', [sort, p.id, profileId])
      sort += 1
      continue
    }
    const parsed = parseDataUrl(p.dataUrl)!
    const photoId = uid('ph-')
    const rel = writePhotoFile(profileId, photoId, parsed.mime, parsed.buf)
    database.run(
      'INSERT INTO streamer_photos (id, profile_id, sort, mime, path) VALUES (?, ?, ?, ?, ?)',
      [photoId, profileId, sort, parsed.mime, rel],
    )
    sort += 1
  }

  // apply payment QR (required — validated above; clear rejected)
  if (payAction.kind === 'data') {
    const parsed = parseDataUrl(payAction.dataUrl)!
    unlinkStoredFile(existing?.pay_qr_path || '')
    const rel = writePayQrFile(profileId, parsed.mime, parsed.buf)
    database.run(`UPDATE streamer_profiles SET pay_qr_path = ?, pay_qr_mime = ? WHERE id = ?`, [
      rel,
      parsed.mime,
      profileId,
    ])
  }
  // keep: leave existing pay_qr_path as-is

  scheduleSave()
  const profile = await getStreamerProfileByUser(userId)
  if (!profile) return { ok: false, error: '保存失败', status: 500 }
  return { ok: true, profile }
}

function ensureMyDageTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS streamer_my_dage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      dage_account TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, dage_account)
    )
  `)
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_streamer_my_dage_user ON streamer_my_dage(user_id, sort_order)`,
  )
}

function migrateMyDage(database: Database) {
  ensureMyDageTables(database)
}

export function listMyDageAccounts(database: Database, userId: string): string[] {
  migrateMyDage(database)
  const rows = all<{ dage_account: string }>(
    database,
    `SELECT dage_account FROM streamer_my_dage
     WHERE user_id = ?
     ORDER BY sort_order ASC, rowid ASC`,
    [userId],
  )
  return rows.map((r) => String(r.dage_account || '').trim()).filter(Boolean)
}

/** Replace 我的大哥 IDs for a user. Trims, drops empties, dedupes (first wins). */
export function replaceMyDageAccounts(
  database: Database,
  userId: string,
  ids: string[],
): string[] {
  migrateMyDage(database)
  const cleaned: string[] = []
  const seen = new Set<string>()
  for (const raw of ids || []) {
    const id = String(raw || '').trim().slice(0, 64)
    if (!id || seen.has(id)) continue
    seen.add(id)
    cleaned.push(id)
  }
  database.run('DELETE FROM streamer_my_dage WHERE user_id = ?', [userId])
  cleaned.forEach((dageAccount, i) => {
    database.run(
      `INSERT INTO streamer_my_dage (id, user_id, dage_account, sort_order)
       VALUES (?, ?, ?, ?)`,
      [uid('md-'), userId, dageAccount, i],
    )
  })
  return cleaned
}

export type AdminUserDetail = {
  user: AdminUserRow
  profile: StreamerProfile | null
  /** 我的大哥：充值账号 ID 列表（订单提成「用户账号」） */
  myDageIds: string[]
}

export async function getAdminUserDetail(
  userId: string,
): Promise<{ ok: true; detail: AdminUserDetail } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  migrateStreamer(database)
  const row = one<{ id: string; username: string; status: string; created_at: number }>(
    database,
    'SELECT id, username, status, created_at FROM users WHERE id = ?',
    [userId],
  )
  if (!row) return { ok: false, error: '用户不存在', status: 404 }
  const profile = await getStreamerProfileByUser(userId)
  const myDageIds = listMyDageAccounts(database, userId)
  return {
    ok: true,
    detail: {
      user: {
        id: row.id,
        username: row.username,
        status: (row.status === 'pending' ? 'pending' : 'approved') as UserStatus,
        created_at: Number(row.created_at) || 0,
      },
      profile,
      myDageIds,
    },
  }
}

export type AdminProfileFields = {
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
  hallPayMode: HallPayMode
  /** 厅主：厅点位 default 0.53 */
  hallPointRate?: number
  /** 厅主：用户流水点位 default 0.74 */
  userFlowPointRate?: number
  /** 我的大哥账号 ID 列表 */
  myDageIds?: string[]
}

/**
 * 主播ID库 uniqueness: streamer_id + linked_id_1/2/3 across all profiles.
 * Returns binder username (or streamerId) when `id` is already taken by another user.
 */
function findStreamerIdBinder(
  database: Database,
  id: string,
  excludeUserId: string,
): string | null {
  const needle = String(id || '').trim()
  if (!needle) return null
  const row = one<{ username: string | null; streamer_id: string | null; name: string | null }>(
    database,
    `SELECT u.username AS username, sp.streamer_id AS streamer_id, sp.name AS name
     FROM streamer_profiles sp
     LEFT JOIN users u ON u.id = sp.user_id
     WHERE sp.user_id != ?
       AND (
         sp.streamer_id = ? OR sp.linked_id_1 = ? OR sp.linked_id_2 = ? OR sp.linked_id_3 = ?
       )
     LIMIT 1`,
    [excludeUserId, needle, needle, needle, needle],
  )
  if (!row) return null
  const username = String(row.username || '').trim()
  const name = String(row.name || '').trim()
  const sid = String(row.streamer_id || '').trim()
  return username || name || sid || '未知账号'
}

/**
 * 大哥ID库 uniqueness: streamer_my_dage across all users.
 * Returns binder username when `id` is already taken by another user.
 */
function findDageIdBinder(
  database: Database,
  id: string,
  excludeUserId: string,
): string | null {
  migrateMyDage(database)
  const needle = String(id || '').trim()
  if (!needle) return null
  const row = one<{ username: string | null; name: string | null }>(
    database,
    `SELECT u.username AS username, sp.name AS name
     FROM streamer_my_dage md
     LEFT JOIN users u ON u.id = md.user_id
     LEFT JOIN streamer_profiles sp ON sp.user_id = md.user_id
     WHERE md.user_id != ? AND md.dage_account = ?
     LIMIT 1`,
    [excludeUserId, needle],
  )
  if (!row) return null
  const username = String(row.username || '').trim()
  const name = String(row.name || '').trim()
  return username || name || '未知账号'
}

function idBoundError(id: string, binder: string): string {
  return `ID已被绑定（${id} → ${binder}）`
}

function clipAdminField(v: string, max: number) {
  return (v || '').trim().slice(0, max)
}

export async function upsertAdminUserDetail(
  userId: string,
  fields: AdminProfileFields,
): Promise<{ ok: true; detail: AdminUserDetail } | { ok: false; error: string; status: number }> {
  const database = await openDb()
  migrateStreamer(database)
  const row = one<{ id: string; username: string; status: string; created_at: number }>(
    database,
    'SELECT id, username, status, created_at FROM users WHERE id = ?',
    [userId],
  )
  if (!row) return { ok: false, error: '用户不存在', status: 404 }

  const hallNo = clipAdminField(fields.hallNo, 64)
  const name = clipAdminField(fields.name, 64)
  const streamerId = clipAdminField(fields.streamerId, 64)
  const region = clipAdminField(fields.region, 64)
  const liveTime = clipAdminField(fields.liveTime, 120)
  const height = clipAdminField(fields.height, 40)
  const weight = clipAdminField(fields.weight, 40)
  const type = clipAdminField(fields.type, 80)
  const skills = clipAdminField(fields.skills, 400)
  const pointRate = clipAdminField(fields.pointRate, 64)
  const referrerId = clipAdminField(fields.referrerId, 64)
  const linkedId1 = clipAdminField(fields.linkedId1, 64)
  const linkedId2 = clipAdminField(fields.linkedId2, 64)
  const linkedId3 = clipAdminField(fields.linkedId3, 64)
  const isHallOwner = fields.isHallOwner === true ? 1 : 0
  const hallPayMode = normalizeHallPayMode(fields.hallPayMode)
  const hallPointRate = normalizeHallPointRate(
    fields.hallPointRate,
    isHallOwner ? DEFAULT_HALL_POINT_RATE : DEFAULT_HALL_POINT_RATE,
  )
  const userFlowPointRate = normalizeUserFlowPointRate(
    fields.userFlowPointRate,
    DEFAULT_USER_FLOW_POINT_RATE,
  )

  // 主播ID库：primary + linked must be unique within library (cross-check each id)
  const streamerLibIds = collectNonEmptyIds(streamerId, linkedId1, linkedId2, linkedId3)
  // Within-form duplicates
  {
    const seen = new Set<string>()
    for (const id of streamerLibIds) {
      if (seen.has(id)) {
        return { ok: false, error: idBoundError(id, '本账号表单内重复'), status: 409 }
      }
      seen.add(id)
    }
  }
  for (const id of streamerLibIds) {
    const binder = findStreamerIdBinder(database, id, userId)
    if (binder) {
      return { ok: false, error: idBoundError(id, binder), status: 409 }
    }
  }

  // 大哥ID库：validate uniqueness before replace
  const incomingDage = Array.isArray(fields.myDageIds) ? fields.myDageIds : null
  let cleanedDage: string[] | null = null
  if (incomingDage) {
    cleanedDage = []
    const seen = new Set<string>()
    for (const raw of incomingDage) {
      const id = String(raw || '').trim().slice(0, 64)
      if (!id) continue
      if (seen.has(id)) {
        return { ok: false, error: idBoundError(id, '本账号表单内重复'), status: 409 }
      }
      seen.add(id)
      const binder = findDageIdBinder(database, id, userId)
      if (binder) {
        return { ok: false, error: idBoundError(id, binder), status: 409 }
      }
      cleanedDage.push(id)
    }
  }

  const existing = one<{ id: string }>(database, 'SELECT id FROM streamer_profiles WHERE user_id = ?', [userId])
  const now = Date.now()
  const profileId = existing?.id || uid('sp-')

  if (!existing) {
    database.run(
      `INSERT INTO streamer_profiles
        (id, user_id, hall_no, name, streamer_id, live_time, region, height, weight, type, skills,
         point_rate, referrer_id, linked_id_1, linked_id_2, linked_id_3, is_hall_owner, hall_pay_mode,
         hall_point_rate, user_flow_point_rate, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profileId, userId, hallNo, name, streamerId, liveTime, region, height, weight, type, skills,
        pointRate, referrerId, linkedId1, linkedId2, linkedId3, isHallOwner, hallPayMode,
        hallPointRate, userFlowPointRate, now, now,
      ],
    )
  } else {
    database.run(
      `UPDATE streamer_profiles SET
        hall_no = ?, name = ?, streamer_id = ?, live_time = ?, region = ?,
        height = ?, weight = ?, type = ?, skills = ?,
        point_rate = ?, referrer_id = ?, linked_id_1 = ?, linked_id_2 = ?, linked_id_3 = ?,
        is_hall_owner = ?, hall_pay_mode = ?,
        hall_point_rate = ?, user_flow_point_rate = ?,
        updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        hallNo, name, streamerId, liveTime, region, height, weight, type, skills,
        pointRate, referrerId, linkedId1, linkedId2, linkedId3, isHallOwner, hallPayMode,
        hallPointRate, userFlowPointRate, now, profileId, userId,
      ],
    )
  }

  const myDageIds = cleanedDage != null
    ? replaceMyDageAccounts(database, userId, cleanedDage)
    : listMyDageAccounts(database, userId)

  scheduleSave()
  const profile = await getStreamerProfileByUser(userId)
  return {
    ok: true,
    detail: {
      user: {
        id: row.id,
        username: row.username,
        status: (row.status === 'pending' ? 'pending' : 'approved') as UserStatus,
        created_at: Number(row.created_at) || 0,
      },
      profile,
      myDageIds,
    },
  }
}

export async function deleteStreamerProfileByUser(userId: string): Promise<boolean> {
  const database = await openDb()
  migrateStreamer(database)
  const row = one<{ id: string }>(database, 'SELECT id FROM streamer_profiles WHERE user_id = ?', [userId])
  if (!row) return false
  deletePhotoFiles(database, row.id)
  try {
    const dir = path.join(UPLOADS_DIR, row.id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  database.run('DELETE FROM streamer_profiles WHERE id = ?', [row.id])
  scheduleSave()
  return true
}

export function resolveUploadPath(urlPath: string): { abs: string; mime: string } | null {
  // urlPath like /api/uploads/profiles/<id>/<file>
  const prefix = '/api/uploads/'
  if (!urlPath.startsWith(prefix)) return null
  const rel = urlPath.slice(prefix.length)
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '')
  if (normalized.includes('..')) return null
  const abs = path.join(DATA_DIR, 'uploads', normalized)
  const root = path.join(DATA_DIR, 'uploads')
  if (!abs.startsWith(root + path.sep) && abs !== root) return null
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null
  const ext = path.extname(abs).toLowerCase()
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
  return { abs, mime }
}


export type LiushuiBatchKind = 'streamer' | 'user'

export type LiushuiBatch = {
  id: string
  label: string
  filename: string
  rowCount: number
  uploadedAt: number
  uploadedBy: string
  /** Min date in upload YYYY-MM-DD */
  startDate: string
  /** Max date in upload YYYY-MM-DD */
  endDate: string
  /** Host wage rate in yuan per hour. */
  hostWagePerHour: number | null
  /** streamer = payroll rollup; user = per-user-ID gift rollup */
  kind: LiushuiBatchKind
  /** Distinct people count (for user batches: unique IDs; streamer: same as rowCount) */
  personCount: number
}

export type LiushuiRow = {
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
  /** 实际流水 (yuan) */
  actualFlow: number | null
  /** 基础工资 (yuan) */
  baseWage: number | null
  /** 主持工资行 (yuan) */
  hostWage: number | null
  /** 总工资 (yuan) */
  totalWage: number | null
  uploadedAt: number
  uploadedBy: string
  /** 厅号 (user kind); empty for streamer */
  hallNo: string
}

function ensureLiushuiTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS liushui_batches (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      host_wage_per_hour REAL
    );
    CREATE TABLE IF NOT EXISTS liushui_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      time_text TEXT NOT NULL DEFAULT '',
      user_platform_id TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      total_flow_text TEXT NOT NULL DEFAULT '',
      total_flow_amount REAL,
      total_flow_cents INTEGER,
      point_rate TEXT NOT NULL DEFAULT '',
      host_hours REAL,
      mic_hours REAL,
      reward_yuan REAL,
      fine_yuan REAL,
      add_flow_yuan REAL NOT NULL DEFAULT 0,
      deduct_flow_yuan REAL NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_liushui_rows_batch ON liushui_rows(batch_id);
    CREATE INDEX IF NOT EXISTS idx_liushui_rows_user ON liushui_rows(user_platform_id);
    CREATE INDEX IF NOT EXISTS idx_liushui_batches_uploaded ON liushui_batches(uploaded_at);
  `)
}

function migrateLiushui(database: Database) {
  ensureLiushuiTables(database)
  database.run(`CREATE INDEX IF NOT EXISTS idx_liushui_rows_user ON liushui_rows(user_platform_id)`)
  if (!tableHasColumn(database, 'liushui_rows', 'total_flow_cents')) {
    database.run(`ALTER TABLE liushui_rows ADD COLUMN total_flow_cents INTEGER`)
  }
  if (!tableHasColumn(database, 'liushui_batches', 'start_date')) {
    database.run(`ALTER TABLE liushui_batches ADD COLUMN start_date TEXT NOT NULL DEFAULT ''`)
  }
  if (!tableHasColumn(database, 'liushui_batches', 'end_date')) {
    database.run(`ALTER TABLE liushui_batches ADD COLUMN end_date TEXT NOT NULL DEFAULT ''`)
  }
  if (!tableHasColumn(database, 'liushui_batches', 'host_wage_per_hour')) {
    database.run(`ALTER TABLE liushui_batches ADD COLUMN host_wage_per_hour REAL`)
  }
  const editCols: [string, string][] = [
    ['point_rate', "ALTER TABLE liushui_rows ADD COLUMN point_rate TEXT NOT NULL DEFAULT ''"],
    ['host_hours', 'ALTER TABLE liushui_rows ADD COLUMN host_hours REAL'],
    ['mic_hours', 'ALTER TABLE liushui_rows ADD COLUMN mic_hours REAL'],
    ['reward_yuan', 'ALTER TABLE liushui_rows ADD COLUMN reward_yuan REAL'],
    ['fine_yuan', 'ALTER TABLE liushui_rows ADD COLUMN fine_yuan REAL'],
    ['add_flow_yuan', 'ALTER TABLE liushui_rows ADD COLUMN add_flow_yuan REAL DEFAULT 0'],
    ['deduct_flow_yuan', 'ALTER TABLE liushui_rows ADD COLUMN deduct_flow_yuan REAL DEFAULT 0'],
    ['actual_flow', 'ALTER TABLE liushui_rows ADD COLUMN actual_flow REAL'],
    ['base_wage', 'ALTER TABLE liushui_rows ADD COLUMN base_wage REAL'],
    ['host_wage', 'ALTER TABLE liushui_rows ADD COLUMN host_wage REAL'],
    ['total_wage', 'ALTER TABLE liushui_rows ADD COLUMN total_wage REAL'],
  ]
  for (const [col, sql] of editCols) {
    if (!tableHasColumn(database, 'liushui_rows', col)) {
      database.run(sql)
    }
  }
  if (!tableHasColumn(database, 'liushui_batches', 'kind')) {
    database.run(`ALTER TABLE liushui_batches ADD COLUMN kind TEXT NOT NULL DEFAULT 'streamer'`)
  }
  if (!tableHasColumn(database, 'liushui_batches', 'person_count')) {
    database.run(`ALTER TABLE liushui_batches ADD COLUMN person_count INTEGER NOT NULL DEFAULT 0`)
    // Backfill: streamer batches treat person_count = row_count
    database.run(`UPDATE liushui_batches SET person_count = row_count WHERE person_count = 0`)
  }
  if (!tableHasColumn(database, 'liushui_rows', 'hall_no')) {
    database.run(`ALTER TABLE liushui_rows ADD COLUMN hall_no TEXT NOT NULL DEFAULT ''`)
  }
}

function rowToLiushuiBatch(r: {
  id: string
  label: string
  filename: string
  row_count: number
  uploaded_at: number
  uploaded_by: string
  start_date?: string
  end_date?: string
  host_wage_per_hour?: number | null
  kind?: string | null
  person_count?: number | null
}): LiushuiBatch {
  const kindRaw = typeof r.kind === 'string' ? r.kind.trim() : ''
  const kind: LiushuiBatchKind = kindRaw === 'user' ? 'user' : 'streamer'
  const personCount =
    r.person_count != null && Number.isFinite(Number(r.person_count))
      ? Number(r.person_count)
      : Number(r.row_count) || 0
  return {
    id: r.id,
    label: r.label,
    filename: r.filename,
    rowCount: Number(r.row_count) || 0,
    uploadedAt: Number(r.uploaded_at) || 0,
    uploadedBy: r.uploaded_by,
    startDate: typeof r.start_date === 'string' ? r.start_date : '',
    endDate: typeof r.end_date === 'string' ? r.end_date : '',
    hostWagePerHour: nullableNum(r.host_wage_per_hour),
    kind,
    personCount,
  }
}

function nullableNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function rowToLiushuiRow(r: {
  id: string
  batch_id: string
  time_text: string
  user_platform_id: string
  nickname: string
  total_flow_text: string
  total_flow_amount: number | null
  total_flow_cents: number | null
  point_rate?: string
  host_hours?: number | null
  mic_hours?: number | null
  reward_yuan?: number | null
  fine_yuan?: number | null
  add_flow_yuan?: number | null
  deduct_flow_yuan?: number | null
  actual_flow?: number | null
  base_wage?: number | null
  host_wage?: number | null
  total_wage?: number | null
  uploaded_at: number
  uploaded_by: string
  hall_no?: string
}): LiushuiRow {
  const amount =
    r.total_flow_amount == null || r.total_flow_amount === ('' as unknown)
      ? null
      : Number(r.total_flow_amount)
  const cents =
    r.total_flow_cents == null || r.total_flow_cents === ('' as unknown)
      ? null
      : Number(r.total_flow_cents)
  return {
    id: r.id,
    batchId: r.batch_id,
    timeText: r.time_text || '',
    userPlatformId: r.user_platform_id || '',
    nickname: r.nickname || '',
    totalFlowText: r.total_flow_text || '',
    totalFlowAmount: amount != null && Number.isFinite(amount) ? amount : null,
    totalFlowCents: cents != null && Number.isFinite(cents) ? Math.round(cents) : null,
    pointRate: typeof r.point_rate === 'string' ? r.point_rate : '',
    hostHours: nullableNum(r.host_hours),
    micHours: nullableNum(r.mic_hours),
    rewardYuan: nullableNum(r.reward_yuan),
    fineYuan: nullableNum(r.fine_yuan),
    addFlowYuan: nullableNum(r.add_flow_yuan),
    deductFlowYuan: nullableNum(r.deduct_flow_yuan),
    actualFlow: nullableNum(r.actual_flow),
    baseWage: nullableNum(r.base_wage),
    hostWage: nullableNum(r.host_wage),
    totalWage: nullableNum(r.total_wage),
    uploadedAt: Number(r.uploaded_at) || 0,
    uploadedBy: r.uploaded_by,
    hallNo: typeof r.hall_no === 'string' ? r.hall_no : '',
  }
}

export type LiushuiUploadRowInput = {
  timeText: string
  userPlatformId: string
  nickname: string
  totalFlowText: string
  totalFlowAmount: number | null
  totalFlowCents: number | null
  pointRate?: string
  hostHours?: number | null
  micHours?: number | null
  rewardYuan?: number | null
  fineYuan?: number | null
  addFlowYuan?: number | null
  deductFlowYuan?: number | null
  hallNo?: string
}

export type LiushuiRowEditInput = {
  /** Ignored — 点位 recomputed from profile 点位类型 + hours on save */
  pointRate?: string
  hostHours?: number | null
  micHours?: number | null
  rewardYuan?: number | null
  fineYuan?: number | null
  addFlowYuan?: number | null
  deductFlowYuan?: number | null
}

function loadLiushuiRollupProfiles(database: Database): LiushuiRollupProfile[] {
  const rows = all<{
    streamer_id: string
    name: string
    point_rate: string
    linked_id_1: string
    linked_id_2: string
    linked_id_3: string
  }>(
    database,
    `SELECT streamer_id, name, point_rate, linked_id_1, linked_id_2, linked_id_3
     FROM streamer_profiles
     WHERE streamer_id IS NOT NULL AND streamer_id != ''`,
    [],
  )
  return rows.map((r) => ({
    streamerId: String(r.streamer_id || '').trim(),
    name: typeof r.name === 'string' ? r.name : '',
    pointRate: typeof r.point_rate === 'string' ? r.point_rate : '',
    linkedId1: typeof r.linked_id_1 === 'string' ? r.linked_id_1 : '',
    linkedId2: typeof r.linked_id_2 === 'string' ? r.linked_id_2 : '',
    linkedId3: typeof r.linked_id_3 === 'string' ? r.linked_id_3 : '',
  }))
}

/** Create batch + rows in SQLite from in-memory parse. Does NOT write the Excel file to disk. */
export async function createLiushuiBatch(opts: {
  label: string
  filename: string
  uploadedBy: string
  /** Pre-aggregated Excel rows (per 用户ID). Prefer rawRows for profile rollup. */
  rows?: LiushuiUploadRowInput[]
  /** Raw day-level Excel rows — rolled up by registration profile identity when provided. */
  rawRows?: LiushuiParsedRow[]
  startDate?: string
  endDate?: string
  /** Default 'streamer'. 'user' stores one row per 接收用户ID (already aggregated in parse). */
  kind?: LiushuiBatchKind
  /** Distinct people for user batches; defaults to unique IDs or row count. */
  personCount?: number
}): Promise<{ batch: LiushuiBatch; rows: LiushuiRow[] }> {
  const database = await openDb()
  migrateLiushui(database)
  migrateStreamer(database)
  const now = Date.now()
  const batchId = uid('lb-')
  const kind: LiushuiBatchKind = opts.kind === 'user' ? 'user' : 'streamer'
  const label =
    (opts.label || (kind === 'user' ? '上周用户流水' : '上周主播流水')).trim() ||
    (kind === 'user' ? '上周用户流水' : '上周主播流水')
  const filename = (opts.filename || 'upload.xlsx').trim() || 'upload.xlsx'
  const uploadedBy = opts.uploadedBy
  const startDate = (opts.startDate || '').trim()
  const endDate = (opts.endDate || '').trim()

  type StoreRow = {
    timeText: string
    userPlatformId: string
    nickname: string
    totalFlowText: string
    totalFlowAmount: number | null
    totalFlowCents: number | null
    pointRate: string
    hallNo: string
  }

  let toStore: StoreRow[] = []

  if (kind === 'user') {
    // One row per user platform ID (aggregated in parseUserLiushuiWorkbook); no streamer profile rollup
    toStore = (opts.rows || []).map((r) => ({
      timeText: r.timeText || '',
      userPlatformId: r.userPlatformId || '',
      nickname: r.nickname || '',
      totalFlowText: r.totalFlowText || '',
      totalFlowAmount: r.totalFlowAmount,
      totalFlowCents: r.totalFlowCents,
      pointRate: '',
      hallNo: (r.hallNo || '').trim(),
    }))
    toStore.sort((a, b) => {
      const av = a.totalFlowAmount != null && Number.isFinite(a.totalFlowAmount) ? a.totalFlowAmount : -Infinity
      const bv = b.totalFlowAmount != null && Number.isFinite(b.totalFlowAmount) ? b.totalFlowAmount : -Infinity
      if (bv !== av) return bv - av
      return (a.userPlatformId || '').localeCompare(b.userPlatformId || '', 'zh')
    })
  } else {
    const profiles = loadLiushuiRollupProfiles(database)
    let rolled: Array<{
      userPlatformId: string
      nickname: string
      totalFlowText: string
      totalFlowAmount: number | null
      totalFlowCents: number | null
      pointRate: string
    }>
    if (opts.rawRows && opts.rawRows.length) {
      rolled = rollupLiushuiByProfiles(opts.rawRows, profiles).map((r) => ({
        userPlatformId: r.userPlatformId,
        nickname: r.nickname,
        totalFlowText: r.totalFlowText,
        totalFlowAmount: r.totalFlowAmount,
        totalFlowCents: r.totalFlowCents,
        pointRate: (() => {
          const t = (r.pointRate || '').trim()
          const c = computedPointRateText(t, 0, 0)
          return c ? (t ? `${c}（${t}）` : c) : ''
        })(),
      }))
    } else {
      const synthetic: LiushuiParsedRow[] = (opts.rows || []).map((r) => ({
        timeText: r.timeText || '',
        userPlatformId: r.userPlatformId || '',
        nickname: r.nickname || '',
        totalFlowText: r.totalFlowText || '',
        totalFlowAmount: r.totalFlowAmount,
        totalFlowCents: r.totalFlowCents,
      }))
      rolled = rollupLiushuiByProfiles(synthetic, profiles).map((r) => ({
        userPlatformId: r.userPlatformId,
        nickname: r.nickname,
        totalFlowText: r.totalFlowText,
        totalFlowAmount: r.totalFlowAmount,
        totalFlowCents: r.totalFlowCents,
        pointRate: (() => {
          const t = (r.pointRate || '').trim()
          const c = computedPointRateText(t, 0, 0)
          return c ? (t ? `${c}（${t}）` : c) : ''
        })(),
      }))
    }
    toStore = rolled.map((r) => ({
      timeText: '',
      userPlatformId: r.userPlatformId,
      nickname: r.nickname,
      totalFlowText: r.totalFlowText,
      totalFlowAmount: r.totalFlowAmount,
      totalFlowCents: r.totalFlowCents,
      pointRate: r.pointRate,
      hallNo: '',
    }))
  }

  const personCount =
    opts.personCount != null && Number.isFinite(opts.personCount)
      ? Math.max(0, Math.round(opts.personCount))
      : (() => {
          const ids = new Set(
            toStore.map((r) => (r.userPlatformId || '').trim()).filter(Boolean),
          )
          return ids.size || toStore.length
        })()

  const stored: LiushuiRow[] = []
  database.run('BEGIN')
  try {
    database.run(
      `INSERT INTO liushui_batches (id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchId,
        label,
        filename,
        toStore.length,
        now,
        uploadedBy,
        startDate,
        endDate,
        null,
        kind,
        personCount,
      ],
    )

    for (const row of toStore) {
      const id = uid('lr-')
      const amount = row.totalFlowAmount
      const cents = row.totalFlowCents
      const pointRate = (row.pointRate || '').trim()
      const totalFlowText = row.totalFlowText || formatFlowDisplay(amount, cents)
      database.run(
        `INSERT INTO liushui_rows
          (id, batch_id, time_text, user_platform_id, nickname, total_flow_text,
           total_flow_amount, total_flow_cents, point_rate, host_hours, mic_hours,
           reward_yuan, fine_yuan, add_flow_yuan, deduct_flow_yuan, uploaded_at, uploaded_by, hall_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          batchId,
          row.timeText || '',
          row.userPlatformId || '',
          row.nickname || '',
          totalFlowText,
          amount != null && Number.isFinite(amount) ? amount : null,
          cents != null && Number.isFinite(cents) ? Math.round(cents) : null,
          pointRate,
          null,
          null,
          null,
          null,
          0,
          0,
          now,
          uploadedBy,
          row.hallNo || '',
        ],
      )
      stored.push({
        id,
        batchId,
        timeText: row.timeText || '',
        userPlatformId: row.userPlatformId || '',
        nickname: row.nickname || '',
        totalFlowText,
        totalFlowAmount: amount != null && Number.isFinite(amount) ? amount : null,
        totalFlowCents: cents != null && Number.isFinite(cents) ? Math.round(cents) : null,
        pointRate,
        hostHours: null,
        micHours: null,
        rewardYuan: null,
        fineYuan: null,
        addFlowYuan: 0,
        deductFlowYuan: 0,
        actualFlow: null,
        baseWage: null,
        hostWage: null,
        totalWage: null,
        uploadedAt: now,
        uploadedBy,
        hallNo: row.hallNo || '',
      })
    }

    database.run('COMMIT')
  } catch (e) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }

  scheduleSave()
  return {
    batch: {
      id: batchId,
      label,
      filename,
      rowCount: toStore.length,
      uploadedAt: now,
      uploadedBy,
      startDate,
      endDate,
      hostWagePerHour: null,
      kind,
      personCount,
    },
    rows: stored,
  }
}


export async function getLatestLiushuiBatch(sampleLimit = 20): Promise<{
  batch: LiushuiBatch | null
  rows: LiushuiRow[]
}> {
  const database = await openDb()
  migrateLiushui(database)
  const batchRow = one<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches ORDER BY uploaded_at DESC LIMIT 1`,
    [],
  )
  if (!batchRow) return { batch: null, rows: [] }
  const limit = Math.max(1, Math.min(200, sampleLimit | 0 || 20))
  const rows = all<{
    id: string
    batch_id: string
    time_text: string
    user_platform_id: string
    nickname: string
    total_flow_text: string
    total_flow_amount: number | null
    total_flow_cents: number | null
    point_rate: string
    host_hours: number | null
    mic_hours: number | null
    reward_yuan: number | null
    fine_yuan: number | null
    add_flow_yuan: number | null
    deduct_flow_yuan: number | null
    actual_flow: number | null
    base_wage: number | null
    host_wage: number | null
    total_wage: number | null
    uploaded_at: number
    uploaded_by: string
  }>(
    database,
    `SELECT id, batch_id, time_text, user_platform_id, nickname, total_flow_text,
            total_flow_amount, total_flow_cents, point_rate, host_hours, mic_hours,
            reward_yuan, fine_yuan, add_flow_yuan, deduct_flow_yuan,
            actual_flow, base_wage, host_wage, total_wage, uploaded_at, uploaded_by, hall_no
     FROM liushui_rows WHERE batch_id = ? ORDER BY rowid ASC LIMIT ?`,
    [batchRow.id, limit],
  )
  return {
    batch: rowToLiushuiBatch(batchRow),
    rows: (() => {
      const mapped = rows.map(rowToLiushuiRow)
      return rowToLiushuiBatch(batchRow).kind === 'user' ? sortUserLiushuiRows(mapped) : mapped
    })(),
  }
}


function sortUserLiushuiRows<T extends { totalFlowAmount: number | null; userPlatformId: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const av = a.totalFlowAmount != null && Number.isFinite(a.totalFlowAmount) ? a.totalFlowAmount : -Infinity
    const bv = b.totalFlowAmount != null && Number.isFinite(b.totalFlowAmount) ? b.totalFlowAmount : -Infinity
    if (bv !== av) return bv - av
    return (a.userPlatformId || '').localeCompare(b.userPlatformId || '', 'zh')
  })
}

export async function listLiushuiBatches(): Promise<LiushuiBatch[]> {
  const database = await openDb()
  migrateLiushui(database)
  const batchRows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches ORDER BY uploaded_at DESC`,
    [],
  )
  return batchRows.map(rowToLiushuiBatch)
}

export async function getLiushuiBatch(
  batchId: string,
  sampleLimit = 200,
): Promise<{ batch: LiushuiBatch | null; rows: LiushuiRow[] }> {
  const database = await openDb()
  migrateLiushui(database)
  const batchRow = one<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches WHERE id = ?`,
    [batchId],
  )
  if (!batchRow) return { batch: null, rows: [] }
  const limit = Math.max(1, Math.min(2000, sampleLimit | 0 || 200))
  const rows = all<{
    id: string
    batch_id: string
    time_text: string
    user_platform_id: string
    nickname: string
    total_flow_text: string
    total_flow_amount: number | null
    total_flow_cents: number | null
    point_rate: string
    host_hours: number | null
    mic_hours: number | null
    reward_yuan: number | null
    fine_yuan: number | null
    add_flow_yuan: number | null
    deduct_flow_yuan: number | null
    actual_flow: number | null
    base_wage: number | null
    host_wage: number | null
    total_wage: number | null
    uploaded_at: number
    uploaded_by: string
  }>(
    database,
    `SELECT id, batch_id, time_text, user_platform_id, nickname, total_flow_text,
            total_flow_amount, total_flow_cents, point_rate, host_hours, mic_hours,
            reward_yuan, fine_yuan, add_flow_yuan, deduct_flow_yuan,
            actual_flow, base_wage, host_wage, total_wage, uploaded_at, uploaded_by, hall_no
     FROM liushui_rows WHERE batch_id = ? ORDER BY rowid ASC LIMIT ?`,
    [batchId, limit],
  )
  return {
    batch: rowToLiushuiBatch(batchRow),
    rows: (() => {
      const mapped = rows.map(rowToLiushuiRow)
      return rowToLiushuiBatch(batchRow).kind === 'user' ? sortUserLiushuiRows(mapped) : mapped
    })(),
  }
}

export async function updateLiushuiBatch(
  batchId: string,
  edits: { hostWagePerHour?: number | null },
): Promise<LiushuiBatch | null> {
  const database = await openDb()
  migrateLiushui(database)
  const existing = one<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches WHERE id = ?`,
    [batchId],
  )
  if (!existing) return null
  const hostWagePerHour =
    edits.hostWagePerHour !== undefined
      ? nullableNum(edits.hostWagePerHour)
      : nullableNum(existing.host_wage_per_hour)
  database.run('UPDATE liushui_batches SET host_wage_per_hour = ? WHERE id = ?', [hostWagePerHour, batchId])
  scheduleSave()
  return rowToLiushuiBatch({ ...existing, host_wage_per_hour: hostWagePerHour })
}

export async function updateLiushuiRow(
  rowId: string,
  edits: LiushuiRowEditInput,
): Promise<LiushuiRow | null> {
  const database = await openDb()
  migrateLiushui(database)
  const existing = one<{
    id: string
    batch_id: string
    time_text: string
    user_platform_id: string
    nickname: string
    total_flow_text: string
    total_flow_amount: number | null
    total_flow_cents: number | null
    point_rate: string
    host_hours: number | null
    mic_hours: number | null
    reward_yuan: number | null
    fine_yuan: number | null
    add_flow_yuan: number | null
    deduct_flow_yuan: number | null
    actual_flow: number | null
    base_wage: number | null
    host_wage: number | null
    total_wage: number | null
    uploaded_at: number
    uploaded_by: string
  }>(
    database,
    `SELECT id, batch_id, time_text, user_platform_id, nickname, total_flow_text,
            total_flow_amount, total_flow_cents, point_rate, host_hours, mic_hours,
            reward_yuan, fine_yuan, add_flow_yuan, deduct_flow_yuan,
            actual_flow, base_wage, host_wage, total_wage, uploaded_at, uploaded_by, hall_no
     FROM liushui_rows WHERE id = ?`,
    [rowId],
  )
  if (!existing) return null

  // Snapshot 点位 at 计算工资 time from 注册列表 点位类型 + hours (frozen thereafter in UI)
  const hostHours =
    edits.hostHours !== undefined ? nullableNum(edits.hostHours) : nullableNum(existing.host_hours)
  const micHours =
    edits.micHours !== undefined ? nullableNum(edits.micHours) : nullableNum(existing.mic_hours)
  const platformId = String(existing.user_platform_id || '').trim()
  const typeRow = platformId
    ? one<{ point_rate: string }>(
        database,
        `SELECT point_rate FROM streamer_profiles WHERE streamer_id = ? LIMIT 1`,
        [platformId],
      )
    : null
  const typeLabel = typeof typeRow?.point_rate === 'string' ? typeRow.point_rate.trim() : ''
  const computed = computedPointRateText(typeLabel, micHours, hostHours)
  const pointRate = computed
    ? typeLabel
      ? `${computed}（${typeLabel}）`
      : computed
    : existing.point_rate || ''
  const rewardYuan =
    edits.rewardYuan !== undefined ? nullableNum(edits.rewardYuan) : nullableNum(existing.reward_yuan)
  const fineYuan =
    edits.fineYuan !== undefined ? nullableNum(edits.fineYuan) : nullableNum(existing.fine_yuan)
  const addFlowYuan =
    edits.addFlowYuan !== undefined
      ? nullableNum(edits.addFlowYuan) ?? 0
      : nullableNum(existing.add_flow_yuan) ?? 0
  const deductFlowYuan =
    edits.deductFlowYuan !== undefined
      ? nullableNum(edits.deductFlowYuan) ?? 0
      : nullableNum(existing.deduct_flow_yuan) ?? 0

  // Batch-level host wage rate for 主持工资行
  const batchRow = one<{ host_wage_per_hour: number | null }>(
    database,
    `SELECT host_wage_per_hour FROM liushui_batches WHERE id = ?`,
    [existing.batch_id],
  )
  const hostWagePerHour = nullableNum(batchRow?.host_wage_per_hour)
  const totalFlowYuan =
    existing.total_flow_amount != null && Number.isFinite(Number(existing.total_flow_amount))
      ? Number(existing.total_flow_amount)
      : existing.total_flow_cents != null && Number.isFinite(Number(existing.total_flow_cents))
        ? Number(existing.total_flow_cents) / 100
        : null
  const wages = computeRowWages({
    totalFlowYuan,
    addFlowYuan,
    deductFlowYuan,
    pointRateNum: parsePointRateNumber(pointRate),
    hostHours,
    hostWagePerHour,
    rewardYuan,
    fineYuan,
  })
  const actualFlow = wages.actualFlow
  const baseWage = wages.baseWage
  const hostWage = wages.hostWage
  const totalWage = wages.totalWage

  database.run(
    `UPDATE liushui_rows
     SET point_rate = ?, host_hours = ?, mic_hours = ?, reward_yuan = ?, fine_yuan = ?,
         add_flow_yuan = ?, deduct_flow_yuan = ?,
         actual_flow = ?, base_wage = ?, host_wage = ?, total_wage = ?
     WHERE id = ?`,
    [
      pointRate,
      hostHours,
      micHours,
      rewardYuan,
      fineYuan,
      addFlowYuan,
      deductFlowYuan,
      actualFlow,
      baseWage,
      hostWage,
      totalWage,
      rowId,
    ],
  )
  scheduleSave()
  return rowToLiushuiRow({
    ...existing,
    point_rate: pointRate,
    host_hours: hostHours,
    mic_hours: micHours,
    reward_yuan: rewardYuan,
    fine_yuan: fineYuan,
    add_flow_yuan: addFlowYuan,
    deduct_flow_yuan: deductFlowYuan,
    actual_flow: actualFlow,
    base_wage: baseWage,
    host_wage: hostWage,
    total_wage: totalWage,
  })
}

export async function updateLiushuiRowsBatch(
  items: Array<{ id: string } & LiushuiRowEditInput>,
): Promise<LiushuiRow[]> {
  const out: LiushuiRow[] = []
  for (const item of items) {
    if (!item?.id) continue
    const updated = await updateLiushuiRow(item.id, item)
    if (updated) out.push(updated)
  }
  return out
}
export async function deleteLiushuiBatch(batchId: string): Promise<boolean> {
  const database = await openDb()
  migrateLiushui(database)
  const existing = one<{ id: string }>(
    database,
    `SELECT id FROM liushui_batches WHERE id = ?`,
    [batchId],
  )
  if (!existing) return false
  database.run('BEGIN')
  try {
    database.run(`DELETE FROM liushui_rows WHERE batch_id = ?`, [batchId])
    database.run(`DELETE FROM liushui_batches WHERE id = ?`, [batchId])
    database.run('COMMIT')
  } catch (e) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  scheduleSave()
  return true
}


export type ActivityBatch = {
  id: string
  label: string
  filename: string
  rowCount: number
  uploadedAt: number
  uploadedBy: string
  startDate: string
  endDate: string
}

export type ActivityRow = {
  id: string
  batchId: string
  streamerId: string
  nickname: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
  uploadedAt: number
  uploadedBy: string
}

function ensureActivityTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS activity_batches (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS activity_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      streamer_id TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      greet_people INTEGER NOT NULL DEFAULT 0,
      greet_msgs INTEGER NOT NULL DEFAULT 0,
      stranger_greet_people INTEGER NOT NULL DEFAULT 0,
      stranger_reply_people INTEGER NOT NULL DEFAULT 0,
      plaza_posts INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_rows_batch ON activity_rows(batch_id);
    CREATE INDEX IF NOT EXISTS idx_activity_rows_streamer ON activity_rows(streamer_id);
    CREATE INDEX IF NOT EXISTS idx_activity_batches_uploaded ON activity_batches(uploaded_at);
  `)
}

function migrateActivity(database: Database) {
  ensureActivityTables(database)
}

function rowToActivityBatch(r: {
  id: string
  label: string
  filename: string
  row_count: number
  uploaded_at: number
  uploaded_by: string
  start_date?: string
  end_date?: string
}): ActivityBatch {
  return {
    id: r.id,
    label: r.label,
    filename: r.filename,
    rowCount: Number(r.row_count) || 0,
    uploadedAt: Number(r.uploaded_at) || 0,
    uploadedBy: r.uploaded_by,
    startDate: typeof r.start_date === 'string' ? r.start_date : '',
    endDate: typeof r.end_date === 'string' ? r.end_date : '',
  }
}

function rowToActivityRow(r: {
  id: string
  batch_id: string
  streamer_id: string
  nickname: string
  greet_people: number
  greet_msgs: number
  stranger_greet_people: number
  stranger_reply_people: number
  plaza_posts: number
  uploaded_at: number
  uploaded_by: string
}): ActivityRow {
  const asInt = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  return {
    id: r.id,
    batchId: r.batch_id,
    streamerId: r.streamer_id || '',
    nickname: r.nickname || '',
    greetPeople: asInt(r.greet_people),
    greetMsgs: asInt(r.greet_msgs),
    strangerGreetPeople: asInt(r.stranger_greet_people),
    strangerReplyPeople: asInt(r.stranger_reply_people),
    plazaPosts: asInt(r.plaza_posts),
    uploadedAt: Number(r.uploaded_at) || 0,
    uploadedBy: r.uploaded_by,
  }
}

export type ActivityUploadRowInput = {
  streamerId: string
  nickname: string
  greetPeople: number
  greetMsgs: number
  strangerGreetPeople: number
  strangerReplyPeople: number
  plazaPosts: number
}

/** Create activity batch + rows. Does NOT write the Excel file to disk. */
export async function createActivityBatch(opts: {
  label: string
  filename: string
  uploadedBy: string
  startDate?: string
  endDate?: string
  /** Prefer rawRows for profile-linked-ID rollup. */
  rawRows?: ActivityParsedRow[]
  rows?: ActivityUploadRowInput[]
}): Promise<{ batch: ActivityBatch; rows: ActivityRow[] }> {
  const database = await openDb()
  migrateActivity(database)
  migrateStreamer(database)
  const now = Date.now()
  const batchId = uid('ab-')
  const label = (opts.label || '上周活跃度').trim() || '上周活跃度'
  const filename = (opts.filename || 'upload.xlsx').trim() || 'upload.xlsx'
  const uploadedBy = opts.uploadedBy
  const startDate = (opts.startDate || '').trim()
  const endDate = (opts.endDate || '').trim()

  let toStore: ActivityUploadRowInput[] = []
  if (opts.rawRows && opts.rawRows.length) {
    const profiles = loadLiushuiRollupProfiles(database)
    toStore = rollupActivityByProfiles(opts.rawRows, profiles).map((r) => ({
      streamerId: r.streamerId,
      nickname: r.nickname,
      greetPeople: r.greetPeople,
      greetMsgs: r.greetMsgs,
      strangerGreetPeople: r.strangerGreetPeople,
      strangerReplyPeople: r.strangerReplyPeople,
      plazaPosts: r.plazaPosts,
    }))
  } else {
    toStore = (opts.rows || []).map((r) => ({
      streamerId: (r.streamerId || '').trim(),
      nickname: (r.nickname || '').trim(),
      greetPeople: Math.round(Number(r.greetPeople) || 0),
      greetMsgs: Math.round(Number(r.greetMsgs) || 0),
      strangerGreetPeople: Math.round(Number(r.strangerGreetPeople) || 0),
      strangerReplyPeople: Math.round(Number(r.strangerReplyPeople) || 0),
      plazaPosts: Math.round(Number(r.plazaPosts) || 0),
    }))
  }

  const stored: ActivityRow[] = []
  database.run('BEGIN')
  try {
    database.run(
      `INSERT INTO activity_batches (id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, label, filename, toStore.length, now, uploadedBy, startDate, endDate],
    )
    for (const row of toStore) {
      const id = uid('ar-')
      database.run(
        `INSERT INTO activity_rows
          (id, batch_id, streamer_id, nickname, greet_people, greet_msgs,
           stranger_greet_people, stranger_reply_people, plaza_posts, uploaded_at, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          batchId,
          row.streamerId,
          row.nickname,
          row.greetPeople,
          row.greetMsgs,
          row.strangerGreetPeople,
          row.strangerReplyPeople,
          row.plazaPosts,
          now,
          uploadedBy,
        ],
      )
      stored.push({
        id,
        batchId,
        streamerId: row.streamerId,
        nickname: row.nickname,
        greetPeople: row.greetPeople,
        greetMsgs: row.greetMsgs,
        strangerGreetPeople: row.strangerGreetPeople,
        strangerReplyPeople: row.strangerReplyPeople,
        plazaPosts: row.plazaPosts,
        uploadedAt: now,
        uploadedBy,
      })
    }
    database.run('COMMIT')
  } catch (e) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  scheduleSave()
  return {
    batch: {
      id: batchId,
      label,
      filename,
      rowCount: stored.length,
      uploadedAt: now,
      uploadedBy,
      startDate,
      endDate,
    },
    rows: stored,
  }
}

export async function listActivityBatches(): Promise<ActivityBatch[]> {
  const database = await openDb()
  migrateActivity(database)
  const rows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM activity_batches ORDER BY uploaded_at DESC`,
    [],
  )
  return rows.map(rowToActivityBatch)
}

export async function getActivityBatch(
  batchId: string,
  sampleLimit = 2000,
): Promise<{ batch: ActivityBatch | null; rows: ActivityRow[] }> {
  const database = await openDb()
  migrateActivity(database)
  const batchRow = one<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM activity_batches WHERE id = ?`,
    [batchId],
  )
  if (!batchRow) return { batch: null, rows: [] }
  const limit = Math.max(1, Math.min(5000, sampleLimit | 0 || 2000))
  const rows = all<{
    id: string
    batch_id: string
    streamer_id: string
    nickname: string
    greet_people: number
    greet_msgs: number
    stranger_greet_people: number
    stranger_reply_people: number
    plaza_posts: number
    uploaded_at: number
    uploaded_by: string
  }>(
    database,
    `SELECT id, batch_id, streamer_id, nickname, greet_people, greet_msgs,
            stranger_greet_people, stranger_reply_people, plaza_posts, uploaded_at, uploaded_by
     FROM activity_rows WHERE batch_id = ? ORDER BY rowid ASC LIMIT ?`,
    [batchId, limit],
  )
  return { batch: rowToActivityBatch(batchRow), rows: rows.map(rowToActivityRow) }
}

export async function getLatestActivityBatch(sampleLimit = 80): Promise<{
  batch: ActivityBatch | null
  rows: ActivityRow[]
}> {
  const database = await openDb()
  migrateActivity(database)
  const batchRow = one<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM activity_batches ORDER BY uploaded_at DESC LIMIT 1`,
    [],
  )
  if (!batchRow) return { batch: null, rows: [] }
  return getActivityBatch(batchRow.id, sampleLimit)
}

export async function deleteActivityBatch(batchId: string): Promise<boolean> {
  const database = await openDb()
  migrateActivity(database)
  const existing = one<{ id: string }>(
    database,
    `SELECT id FROM activity_batches WHERE id = ?`,
    [batchId],
  )
  if (!existing) return false
  database.run('BEGIN')
  try {
    database.run(`DELETE FROM activity_rows WHERE batch_id = ?`, [batchId])
    database.run(`DELETE FROM activity_batches WHERE id = ?`, [batchId])
    database.run('COMMIT')
  } catch (e) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  scheduleSave()
  return true
}

export type CommissionBatch = {
  id: string
  label: string
  filename: string
  rowCount: number
  uploadedAt: number
  uploadedBy: string
  startDate: string
  endDate: string
}

export type CommissionRow = {
  id: string
  batchId: string
  userAccount: string
  nickname: string
  payAmount: number
  saleAmount: number
  cumulativeAmount: number
  uploadedAt: number
  uploadedBy: string
}

function ensureCommissionTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS commission_batches (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS commission_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      user_account TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      pay_amount REAL NOT NULL DEFAULT 0,
      sale_amount REAL NOT NULL DEFAULT 0,
      cumulative_amount REAL NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commission_rows_batch ON commission_rows(batch_id);
    CREATE INDEX IF NOT EXISTS idx_commission_rows_account ON commission_rows(user_account);
    CREATE INDEX IF NOT EXISTS idx_commission_batches_uploaded ON commission_batches(uploaded_at);
  `)
}

function migrateCommission(database: Database) {
  ensureCommissionTables(database)
}

function rowToCommissionBatch(r: {
  id: string
  label: string
  filename: string
  row_count: number
  uploaded_at: number
  uploaded_by: string
  start_date?: string
  end_date?: string
}): CommissionBatch {
  return {
    id: r.id,
    label: r.label,
    filename: r.filename,
    rowCount: Number(r.row_count) || 0,
    uploadedAt: Number(r.uploaded_at) || 0,
    uploadedBy: r.uploaded_by,
    startDate: typeof r.start_date === 'string' ? r.start_date : '',
    endDate: typeof r.end_date === 'string' ? r.end_date : '',
  }
}

function rowToCommissionRow(r: {
  id: string
  batch_id: string
  user_account: string
  nickname: string
  pay_amount: number
  sale_amount: number
  cumulative_amount: number
  uploaded_at: number
  uploaded_by: string
}): CommissionRow {
  const asMoney = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
  }
  return {
    id: r.id,
    batchId: r.batch_id,
    userAccount: r.user_account || '',
    nickname: r.nickname || '',
    payAmount: asMoney(r.pay_amount),
    saleAmount: asMoney(r.sale_amount),
    cumulativeAmount: asMoney(r.cumulative_amount),
    uploadedAt: Number(r.uploaded_at) || 0,
    uploadedBy: r.uploaded_by,
  }
}

export type CommissionUploadRowInput = {
  userAccount: string
  nickname: string
  payAmount: number
  saleAmount: number
  cumulativeAmount: number
}

/** Create commission batch + rows. Does NOT write the Excel file to disk. */
export async function createCommissionBatch(opts: {
  label: string
  filename: string
  uploadedBy: string
  startDate?: string
  endDate?: string
  rows?: CommissionUploadRowInput[]
}): Promise<{ batch: CommissionBatch; rows: CommissionRow[] }> {
  const database = await openDb()
  migrateCommission(database)
  const now = Date.now()
  const batchId = uid('cb-')
  const label = (opts.label || '订单提成').trim() || '订单提成'
  const filename = (opts.filename || 'upload.xlsx').trim() || 'upload.xlsx'
  const uploadedBy = opts.uploadedBy
  const startDate = (opts.startDate || '').trim()
  const endDate = (opts.endDate || '').trim()

  const toStore: CommissionUploadRowInput[] = (opts.rows || []).map((r) => ({
    userAccount: (r.userAccount || '').trim(),
    nickname: (r.nickname || '').trim(),
    payAmount: Math.round((Number(r.payAmount) || 0) * 100) / 100,
    saleAmount: Math.round((Number(r.saleAmount) || 0) * 100) / 100,
    cumulativeAmount: Math.round((Number(r.cumulativeAmount) || 0) * 100) / 100,
  }))

  const stored: CommissionRow[] = []
  database.run('BEGIN')
  try {
    database.run(
      `INSERT INTO commission_batches (id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, label, filename, toStore.length, now, uploadedBy, startDate, endDate],
    )
    for (const row of toStore) {
      const id = uid('cr-')
      database.run(
        `INSERT INTO commission_rows
          (id, batch_id, user_account, nickname, pay_amount, sale_amount,
           cumulative_amount, uploaded_at, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          batchId,
          row.userAccount,
          row.nickname,
          row.payAmount,
          row.saleAmount,
          row.cumulativeAmount,
          now,
          uploadedBy,
        ],
      )
      stored.push({
        id,
        batchId,
        userAccount: row.userAccount,
        nickname: row.nickname,
        payAmount: row.payAmount,
        saleAmount: row.saleAmount,
        cumulativeAmount: row.cumulativeAmount,
        uploadedAt: now,
        uploadedBy,
      })
    }
    database.run('COMMIT')
  } catch (e) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  scheduleSave()
  return {
    batch: {
      id: batchId,
      label,
      filename,
      rowCount: stored.length,
      uploadedAt: now,
      uploadedBy,
      startDate,
      endDate,
    },
    rows: stored,
  }
}

export async function listCommissionBatches(): Promise<CommissionBatch[]> {
  const database = await openDb()
  migrateCommission(database)
  const rows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM commission_batches ORDER BY uploaded_at DESC`,
    [],
  )
  return rows.map(rowToCommissionBatch)
}

export async function getCommissionBatch(
  batchId: string,
  sampleLimit = 2000,
): Promise<{ batch: CommissionBatch | null; rows: CommissionRow[] }> {
  const database = await openDb()
  migrateCommission(database)
  const batchRow = one<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM commission_batches WHERE id = ?`,
    [batchId],
  )
  if (!batchRow) return { batch: null, rows: [] }
  const limit = Math.max(1, Math.min(5000, sampleLimit | 0 || 2000))
  const rows = all<{
    id: string
    batch_id: string
    user_account: string
    nickname: string
    pay_amount: number
    sale_amount: number
    cumulative_amount: number
    uploaded_at: number
    uploaded_by: string
  }>(
    database,
    `SELECT id, batch_id, user_account, nickname, pay_amount, sale_amount,
            cumulative_amount, uploaded_at, uploaded_by
     FROM commission_rows WHERE batch_id = ? ORDER BY rowid ASC LIMIT ?`,
    [batchId, limit],
  )
  return { batch: rowToCommissionBatch(batchRow), rows: rows.map(rowToCommissionRow) }
}

export async function deleteCommissionBatch(batchId: string): Promise<boolean> {
  const database = await openDb()
  migrateCommission(database)
  const existing = one<{ id: string }>(
    database,
    `SELECT id FROM commission_batches WHERE id = ?`,
    [batchId],
  )
  if (!existing) return false
  database.run('BEGIN')
  try {
    database.run(`DELETE FROM commission_rows WHERE batch_id = ?`, [batchId])
    database.run(`DELETE FROM commission_batches WHERE id = ?`, [batchId])
    database.run('COMMIT')
  } catch (e) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
  scheduleSave()
  return true
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

export type EffectiveJobRankingsResult = {
  ok: true
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

/**
 * Public 有效作业排行榜 from uploaded activity data.
 * Ranked by 主播向陌生人打招呼人数（有效作业） desc.
 * Prefer calendar previous Mon–Sun (Asia/Tokyo); else newest activity batch.
 */
export async function getEffectiveJobRankings(): Promise<EffectiveJobRankingsResult> {
  const database = await openDb()
  migrateActivity(database)

  const today = tokyoYmd(Date.now())
  const thisMonday = mondayOfYmd(today)
  const prevMonday = thisMonday ? addDaysYmd(thisMonday, -7) : ''
  const prevSunday = prevMonday ? addDaysYmd(prevMonday, 6) : ''

  const batchRows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM activity_batches ORDER BY uploaded_at DESC`,
    [],
  )
  const batches = batchRows.map(rowToActivityBatch)

  let picked = null as ActivityBatch | null
  let fallbackNewest = false

  if (prevMonday && prevSunday) {
    const matching = batches.filter((b) => {
      const bm = batchWeekMonday(b)
      if (bm && bm === prevMonday) return true
      if (b.startDate && b.endDate && rangesOverlap(b.startDate, b.endDate, prevMonday, prevSunday)) {
        return true
      }
      return false
    })
    picked = pickNewestBatch(matching)
  }

  if (!picked) {
    picked = pickNewestBatch(batches)
    fallbackNewest = !!picked
  }

  if (!picked) {
    return {
      ok: true,
      range: null,
      batchId: null,
      rows: [],
      empty: true,
      fallbackNewest: false,
    }
  }

  const startDate = picked.startDate || prevMonday || ''
  const endDate = picked.endDate || prevSunday || ''
  const range = {
    startDate,
    endDate,
    startDateLabel: formatChineseDateLabel(startDate),
    endDateLabel: formatChineseDateLabel(endDate),
  }

  const rowRows = all<{
    streamer_id: string
    nickname: string
    greet_people: number
    greet_msgs: number
    stranger_greet_people: number
    stranger_reply_people: number
    plaza_posts: number
  }>(
    database,
    `SELECT streamer_id, nickname, greet_people, greet_msgs,
            stranger_greet_people, stranger_reply_people, plaza_posts
     FROM activity_rows WHERE batch_id = ? ORDER BY rowid ASC`,
    [picked.id],
  )

  const mapped = rowRows
    .map((r) => ({
      nickname: (r.nickname || '').trim() || '—',
      streamerId: (r.streamer_id || '').trim(),
      greetPeople: Math.round(Number(r.greet_people) || 0),
      greetMsgs: Math.round(Number(r.greet_msgs) || 0),
      strangerGreetPeople: Math.round(Number(r.stranger_greet_people) || 0),
      strangerReplyPeople: Math.round(Number(r.stranger_reply_people) || 0),
      plazaPosts: Math.round(Number(r.plaza_posts) || 0),
    }))
    .sort((a, b) => {
      if (b.strangerGreetPeople !== a.strangerGreetPeople) {
        return b.strangerGreetPeople - a.strangerGreetPeople
      }
      if (b.greetPeople !== a.greetPeople) return b.greetPeople - a.greetPeople
      return a.streamerId.localeCompare(b.streamerId, 'zh')
    })

  const rows: EffectiveJobRankingRow[] = mapped.map((r, i) => ({
    rank: i + 1,
    nickname: r.nickname,
    streamerId: r.streamerId,
    strangerGreetPeople: r.strangerGreetPeople,
    greetPeople: r.greetPeople,
    greetMsgs: r.greetMsgs,
    strangerReplyPeople: r.strangerReplyPeople,
    plazaPosts: r.plazaPosts,
  }))

  return {
    ok: true,
    range,
    batchId: picked.id,
    rows,
    empty: rows.length === 0,
    fallbackNewest,
  }
}


export type MySalaryPeriod = 'last' | 'prev'

export type MySalaryIntroduced = {
  id: string
  nickname: string
  /** Site registration / 入职 time (users.created_at ms preferred), or 0 if unknown */
  registeredAt: number
  /** Calendar-day tenure in Asia/Tokyo since registeredAt, min 0 */
  tenureDays: number
  /**
   * 首月总流水: sum of 合并流水 for this streamerId + linked IDs over
   * [tokyoYmd(registeredAt), +30 days] inclusive, using streamer liushui batches
   * whose [start_date,end_date] overlaps that window (deduped by week range).
   * 合并流水 = actual_flow if set, else 总流水+添加流水-扣除流水.
   * null when no overlapping rows / unknown join date.
   */
  totalFlowYuan: number | null
  /**
   * 首月总麦序: sum of (麦序时长 + 主持时长) for this streamer over the same window.
   * null when none / unknown join date.
   */
  firstMonthMicHours: number | null
  /**
   * 我的总麦序 (per referral): sum of the referrer's (麦序时长 + 主持时长)
   * over this referred streamer's same first-30-days calendar window.
   * null when none / unknown join date.
   */
  myMicHoursInWindow: number | null
}

export type MySalaryDage = {
  /** 大哥充值账号 ID（订单提成「用户账号」） */
  id: string
  nickname: string
  /**
   * 上个月充值金额 = sum(payAmount) for previous calendar month (Tokyo).
   * Field name kept for API compat; value is pay-sum, NOT cumulativeAmount.
   */
  lastMonthCumulative: number
  /** Display-only: 累计金额 from commission row (not used in commission math). */
  cumulativeAmount?: number
}

export type MySalaryMe = {
  nickname: string
  streamerId: string
  linkedIds: string[]
  introduced: MySalaryIntroduced[]
  /**
   * 我的总麦序 = 本周麦序时长 + 本周主持时长（当前用户，Asia/Tokyo 本周）.
   * null when no matching liushui for this week.
   */
  myTotalMicHours: number | null
  payQrUrl: string | null
  /** 我的大哥：配置的充值账号 + 上个月支付金额合计 */
  myDage: MySalaryDage[]
  /**
   * 预计上月用户提成 = sum(myDage.lastMonthCumulative[=payAmount sum]) × 0.1, 2 decimals.
   * 0 when no 大哥 / all zeros.
   */
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
  /** 有效作业 = 主播向陌生人打招呼人数 */
  strangerGreetPeople: number
  /** 有效回复 = 陌生人回复人数 */
  strangerReplyPeople: number
  /** 动态广场数 */
  plazaPosts: number
}

export type MySalaryRow = {
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
  /** 基础工资 from 主播流水 */
  baseWage: number | null
}

export type MySalaryResult = {
  ok: true
  me: MySalaryMe
  period: MySalaryPeriod
  range: MySalaryRange | null
  batchId: string | null
  row: MySalaryRow | null
  /** true when a batch/week was found but no matching row for this user */
  rowMissing: boolean
  confirmed: boolean
  confirmedAt: string | null
  /**
   * row = computeRowWages / liushui row (default).
   * hall_revenue = 厅主: hall pay-mode wage (union/self).
   */
  wageSource: 'row' | 'hall_revenue'
  /** 厅主明细 — only set when wageSource === 'hall_revenue' */
  hallNo?: string | null
  hallPayMode?: HallPayMode | null
  hallUserFlow?: number | null
  hallStreamerFlow?: number | null
  hallStreamerWageTotal?: number | null
  /**
   * Last-week (selected period) activity for this streamer ID from uploaded activity data.
   * null when no matching activity batch/row.
   */
  activity: MySalaryActivity | null
  /**
   * 工会补贴 = 总工资 − 合并流水×0.53×0.93, rounded to 2 decimals.
   * null when ≤ 0 or inputs missing (UI should hide the line).
   */
  guildSubsidy: number | null
}

function collectNonEmptyIds(...vals: (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of vals) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Pick distinct week ranges from liushui_batches (newest first).
 * Same startDate|endDate keeps the newest upload; weeks ordered by endDate then uploadedAt.
 */
function pickDistinctWeekBatches(
  batches: Array<{
    id: string
    startDate: string
    endDate: string
    uploadedAt: number
  }>,
): Array<{ id: string; startDate: string; endDate: string; uploadedAt: number }> {
  const sorted = [...batches].sort((a, b) => {
    const ae = a.endDate || ''
    const be = b.endDate || ''
    if (ae !== be) return be.localeCompare(ae)
    const as = a.startDate || ''
    const bs = b.startDate || ''
    if (as !== bs) return bs.localeCompare(as)
    return b.uploadedAt - a.uploadedAt
  })
  const seen = new Set<string>()
  const out: typeof sorted = []
  for (const b of sorted) {
    const key =
      b.startDate || b.endDate
        ? `${b.startDate}|${b.endDate}`
        : `upload:${b.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(b)
  }
  return out
}


/** Inclusive [winStart, winEnd] overlap with batch [startDate, endDate] (YYYY-MM-DD). */
function batchOverlapsYmdWindow(
  startDate: string,
  endDate: string,
  winStart: string,
  winEnd: string,
): boolean {
  const s = (startDate || endDate || '').trim()
  const e = (endDate || startDate || '').trim()
  if (!ymdParts(s) || !ymdParts(e) || !ymdParts(winStart) || !ymdParts(winEnd)) return false
  return s <= winEnd && e >= winStart
}

/** 合并流水 for one liushui row: prefer actual_flow, else 总流水+添加-扣除. */
function rowMergedFlowYuan(r: {
  total_flow_amount: number | null
  total_flow_cents: number | null
  add_flow_yuan: number | null
  deduct_flow_yuan: number | null
  actual_flow: number | null
}): number | null {
  const actual = nullableNum(r.actual_flow)
  if (actual != null) return actual
  const amount = nullableNum(r.total_flow_amount)
  const cents = nullableNum(r.total_flow_cents)
  let total: number | null = null
  if (amount != null) total = amount
  else if (cents != null) total = cents / 100
  const add = nullableNum(r.add_flow_yuan)
  const deduct = nullableNum(r.deduct_flow_yuan)
  if (total == null && add == null && deduct == null) return null
  return roundMoney((total ?? 0) + (add ?? 0) - (deduct ?? 0))
}

/** 麦序时长 + 主持时长; null if both missing. */
function rowMicSeqHours(r: {
  host_hours: number | null
  mic_hours: number | null
}): number | null {
  const host = nullableNum(r.host_hours)
  const mic = nullableNum(r.mic_hours)
  if (host == null && mic == null) return null
  return (host ?? 0) + (mic ?? 0)
}

function roundHours2(n: number): number {
  return Math.round(n * 100) / 100
}

/** YYYY-MM-DD calendar date in Asia/Tokyo for a unix-ms timestamp. */
function tokyoYmd(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

/**
 * Calendar-day difference in Asia/Tokyo: today - registration date, floored, min 0.
 * Same calendar day => 0.
 */
function tenureDaysFromRegisteredAt(registeredAt: number, nowMs = Date.now()): number {
  if (!registeredAt || !Number.isFinite(registeredAt) || registeredAt <= 0) return 0
  const today = tokyoYmd(nowMs)
  const reg = tokyoYmd(registeredAt)
  const [ty, tm, td] = today.split('-').map(Number)
  const [ry, rm, rd] = reg.split('-').map(Number)
  if (![ty, tm, td, ry, rm, rd].every((n) => Number.isFinite(n))) return 0
  const t = Date.UTC(ty, tm - 1, td)
  const r = Date.UTC(ry, rm - 1, rd)
  return Math.max(0, Math.floor((t - r) / 86_400_000))
}


/**
 * Activity metrics for a salary week, matched by streamer/linked IDs.
 * Prefer activity batch overlapping the payroll week (Mon–Sun); no newest fallback.
 */
function lookupMySalaryActivity(
  database: Database,
  startDate: string,
  endDate: string,
  matchIds: string[],
  primaryStreamerId: string,
): MySalaryActivity | null {
  if (!matchIds.length) return null
  migrateActivity(database)

  const monday =
    (startDate && ymdParts(startDate) ? mondayOfYmd(startDate) : '') ||
    (endDate && ymdParts(endDate) ? mondayOfYmd(endDate) : '')
  const sunday = monday ? addDaysYmd(monday, 6) : ''

  const batchRows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date
     FROM activity_batches ORDER BY uploaded_at DESC`,
    [],
  )
  const batches = batchRows.map(rowToActivityBatch)

  let picked: ActivityBatch | null = null
  if (monday && sunday) {
    const matching = batches.filter((b) => {
      const bm = batchWeekMonday(b)
      if (bm && bm === monday) return true
      if (b.startDate && b.endDate && rangesOverlap(b.startDate, b.endDate, monday, sunday)) {
        return true
      }
      return false
    })
    picked = pickNewestBatch(matching)
  }

  if (!picked) return null

  const placeholders = matchIds.map(() => '?').join(',')
  const rows = all<{
    streamer_id: string
    greet_people: number
    greet_msgs: number
    stranger_greet_people: number
    stranger_reply_people: number
    plaza_posts: number
  }>(
    database,
    `SELECT streamer_id, greet_people, greet_msgs,
            stranger_greet_people, stranger_reply_people, plaza_posts
     FROM activity_rows
     WHERE batch_id = ? AND streamer_id IN (${placeholders})
     ORDER BY rowid ASC`,
    [picked.id, ...matchIds],
  )
  if (!rows.length) return null

  let chosen = rows[0]
  if (primaryStreamerId && rows.length > 1) {
    const primary = rows.find((r) => String(r.streamer_id || '').trim() === primaryStreamerId)
    if (primary) chosen = primary
  }

  return {
    greetPeople: Math.round(Number(chosen.greet_people) || 0),
    greetMsgs: Math.round(Number(chosen.greet_msgs) || 0),
    strangerGreetPeople: Math.round(Number(chosen.stranger_greet_people) || 0),
    strangerReplyPeople: Math.round(Number(chosen.stranger_reply_people) || 0),
    plazaPosts: Math.round(Number(chosen.plaza_posts) || 0),
  }
}

/**
 * 工会补贴 = 总工资 − 合并流水×工会主播点位
 * Default 工会主播点位 0.558 (= historical 0.6×0.93). Prefer live rate from getGuildPointRates.
 * Returns null when ≤ 0 or when wage/flow missing (caller hides the line).
 */
function computeGuildSubsidy(
  totalWage: number | null | undefined,
  mergedFlow: number | null | undefined,
  streamerPointRate: number = DEFAULT_GUILD_STREAMER_POINT_RATE,
): number | null {
  if (totalWage == null || !Number.isFinite(totalWage)) return null
  if (mergedFlow == null || !Number.isFinite(mergedFlow)) return null
  const rate =
    Number.isFinite(streamerPointRate) && streamerPointRate > 0
      ? streamerPointRate
      : DEFAULT_GUILD_STREAMER_POINT_RATE
  const subsidy = roundMoney(totalWage - mergedFlow * rate)
  if (!(subsidy > 0)) return null
  return subsidy
}

/** Previous calendar month [start,end] YYYY-MM-DD in Asia/Tokyo. */
function previousCalendarMonthRange(nowMs = Date.now()): { start: string; end: string; yyyymm: string } {
  const today = tokyoYmd(nowMs)
  const [y, m] = today.split('-').map(Number)
  let py = y
  let pm = m - 1
  if (pm < 1) {
    pm = 12
    py = y - 1
  }
  const start = `${py}-${String(pm).padStart(2, '0')}-01`
  // Last day of previous month = day 0 of current month in UTC civil math
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate()
  const end = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end, yyyymm: `${py}-${String(pm).padStart(2, '0')}` }
}

function datesOverlapYmd(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  return aStart <= bEnd && aEnd >= bStart
}

/**
 * Current user + linked accounts (注册列表 linkedId1/2/3) as one identity for
 * 「我介绍的主播」 / 「我的大哥」 merges in 我的工资.
 * platformIds: streamerId + linkedIds + username (and linked accounts' streamerIds).
 * userIds: this user + any registered users whose streamer_id / username is in that set.
 */
function resolveMySalaryIdentity(
  database: Database,
  userId: string,
  profile:
    | {
        streamerId?: string | null
        linkedId1?: string | null
        linkedId2?: string | null
        linkedId3?: string | null
      }
    | null
    | undefined,
  username: string,
): { platformIds: string[]; userIds: string[] } {
  migrateStreamer(database)
  const platformIds = collectNonEmptyIds(
    profile?.streamerId,
    profile?.linkedId1,
    profile?.linkedId2,
    profile?.linkedId3,
    username,
  )
  const userIds = collectNonEmptyIds(userId)
  if (!platformIds.length) return { platformIds, userIds }

  const ph = platformIds.map(() => '?').join(',')
  const profileRows = all<{
    user_id: string
    streamer_id: string | null
  }>(
    database,
    `SELECT sp.user_id AS user_id, sp.streamer_id AS streamer_id
     FROM streamer_profiles sp
     LEFT JOIN users u ON u.id = sp.user_id
     WHERE sp.streamer_id IN (${ph})
        OR IFNULL(u.username, '') IN (${ph})`,
    [...platformIds, ...platformIds],
  )
  for (const r of profileRows) {
    const uid = String(r.user_id || '').trim()
    if (uid && !userIds.includes(uid)) userIds.push(uid)
    const sid = String(r.streamer_id || '').trim()
    if (sid && !platformIds.includes(sid)) platformIds.push(sid)
  }

  const userRows = all<{ id: string }>(
    database,
    `SELECT id FROM users WHERE username IN (${ph})`,
    platformIds,
  )
  for (const r of userRows) {
    const uid = String(r.id || '').trim()
    if (uid && !userIds.includes(uid)) userIds.push(uid)
  }

  return { platformIds, userIds }
}

/** Union 我的大哥 accounts across identity user ids; first occurrence wins. */
function listMyDageAccountsMerged(database: Database, userIds: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const uid of userIds) {
    if (!uid) continue
    for (const acc of listMyDageAccounts(database, uid)) {
      if (seen.has(acc)) continue
      seen.add(acc)
      out.push(acc)
    }
  }
  return out
}

/**
 * Resolve 我的大哥 salary rows from streamer_my_dage + commission batches overlapping last month.
 * `userIds` may include linked accounts so their 大哥 merge into the view.
 */
function lookupMyDageForSalary(database: Database, userIds: string | string[]): MySalaryDage[] {
  migrateMyDage(database)
  migrateCommission(database)
  const ids = Array.isArray(userIds) ? userIds : [userIds]
  const accounts = listMyDageAccountsMerged(database, ids)
  if (!accounts.length) return []

  const { start: monthStart, end: monthEnd } = previousCalendarMonthRange()

  const batchRows = all<{
    id: string
    start_date: string
    end_date: string
    uploaded_at: number
  }>(
    database,
    `SELECT id, start_date, end_date, uploaded_at FROM commission_batches
     ORDER BY end_date DESC, uploaded_at DESC`,
    [],
  )

  let pickedId: string | null = null
  for (const b of batchRows) {
    const bs = typeof b.start_date === 'string' ? b.start_date : ''
    const be = typeof b.end_date === 'string' ? b.end_date : ''
    if (datesOverlapYmd(bs, be, monthStart, monthEnd)) {
      pickedId = b.id
      break // already ordered by end_date DESC, uploaded_at DESC
    }
  }

  type CommHit = { nickname: string; paySum: number; cumulative: number }
  const byAccount = new Map<string, CommHit>()
  if (pickedId) {
    const placeholders = accounts.map(() => '?').join(',')
    const rows = all<{
      user_account: string
      nickname: string
      pay_amount: number
      cumulative_amount: number
    }>(
      database,
      `SELECT user_account, nickname, pay_amount, cumulative_amount
       FROM commission_rows
       WHERE batch_id = ? AND user_account IN (${placeholders})`,
      [pickedId, ...accounts],
    )
    for (const r of rows) {
      const acc = String(r.user_account || '').trim()
      if (!acc) continue
      const pay = Number(r.pay_amount)
      const cum = Number(r.cumulative_amount)
      const existing = byAccount.get(acc)
      const payAdd = Number.isFinite(pay) ? pay : 0
      const cumVal = Number.isFinite(cum) ? Math.round(cum * 100) / 100 : 0
      if (existing) {
        existing.paySum = Math.round((existing.paySum + payAdd) * 100) / 100
        if (!existing.nickname) existing.nickname = String(r.nickname || '').trim()
        if (cumVal > existing.cumulative) existing.cumulative = cumVal
      } else {
        byAccount.set(acc, {
          nickname: String(r.nickname || '').trim(),
          paySum: Math.round(payAdd * 100) / 100,
          cumulative: cumVal,
        })
      }
    }
  }

  // Nickname fallback from any commission row when no last-month match
  const needNick = accounts.filter((a) => !byAccount.get(a)?.nickname)
  if (needNick.length) {
    const placeholders = needNick.map(() => '?').join(',')
    const rows = all<{
      user_account: string
      nickname: string
      uploaded_at: number
    }>(
      database,
      `SELECT user_account, nickname, uploaded_at
       FROM commission_rows
       WHERE user_account IN (${placeholders})
         AND nickname IS NOT NULL AND nickname != ''
       ORDER BY uploaded_at DESC`,
      needNick,
    )
    const seen = new Set<string>()
    for (const r of rows) {
      const acc = String(r.user_account || '').trim()
      if (!acc || seen.has(acc)) continue
      seen.add(acc)
      const existing = byAccount.get(acc)
      const nick = String(r.nickname || '').trim()
      if (!nick) continue
      if (existing) {
        if (!existing.nickname) existing.nickname = nick
      } else {
        byAccount.set(acc, { nickname: nick, paySum: 0, cumulative: 0 })
      }
    }
  }

  return accounts.map((id) => {
    const hit = byAccount.get(id)
    return {
      id,
      nickname: hit?.nickname || '—',
      lastMonthCumulative: hit ? hit.paySum : 0,
      cumulativeAmount: hit ? hit.cumulative : 0,
    }
  })
}

/**
 * 销售收益：上个月（Asia/Tokyo）订单提成 payAmount 合计。
 * - 总充值 = unique 大哥账号的 last-month payAmount 之和
 *   · admin 全部：全局 unique 大哥
 *   · 厅主锁定厅：仅该厅介绍人名下大哥（unique）之和
 * - 介绍人行 = 其名下大哥 payAmount 之和；预计收入 = ×0.1；按上月总充值降序
 */
function buildSalesRevenue(
  database: Database,
  opts?: { introducerHallNo?: string },
): SalesRevenue {
  migrateMyDage(database)
  migrateCommission(database)
  migrateStreamer(database)

  const introducerHallNo = (opts?.introducerHallNo || '').trim()

  const { start: monthStart, end: monthEnd, yyyymm } = previousCalendarMonthRange()
  const [py, pm] = yyyymm.split('-').map(Number)
  const monthLabel = `${py}年${pm}月`

  const batchRows = all<{
    id: string
    start_date: string
    end_date: string
    uploaded_at: number
  }>(
    database,
    `SELECT id, start_date, end_date, uploaded_at FROM commission_batches
     ORDER BY end_date DESC, uploaded_at DESC`,
    [],
  )

  let pickedId: string | null = null
  for (const b of batchRows) {
    const bs = typeof b.start_date === 'string' ? b.start_date : ''
    const be = typeof b.end_date === 'string' ? b.end_date : ''
    if (datesOverlapYmd(bs, be, monthStart, monthEnd)) {
      pickedId = b.id
      break
    }
  }

  const linkRows = all<{ user_id: string; dage_account: string }>(
    database,
    `SELECT user_id, dage_account FROM streamer_my_dage
     ORDER BY user_id ASC, sort_order ASC, rowid ASC`,
    [],
  )

  const uniqueDage = new Set<string>()
  const byIntroducer = new Map<string, string[]>()
  for (const r of linkRows) {
    const uid = String(r.user_id || '').trim()
    const acc = String(r.dage_account || '').trim()
    if (!uid || !acc) continue
    uniqueDage.add(acc)
    const list = byIntroducer.get(uid) || []
    if (!list.includes(acc)) list.push(acc)
    byIntroducer.set(uid, list)
  }

  const payByAccount = new Map<string, number>()
  if (pickedId && uniqueDage.size) {
    const accounts = [...uniqueDage]
    const placeholders = accounts.map(() => '?').join(',')
    const rows = all<{ user_account: string; pay_amount: number }>(
      database,
      `SELECT user_account, pay_amount
       FROM commission_rows
       WHERE batch_id = ? AND user_account IN (${placeholders})`,
      [pickedId, ...accounts],
    )
    for (const r of rows) {
      const acc = String(r.user_account || '').trim()
      if (!acc) continue
      const n = Number(r.pay_amount)
      const add = Number.isFinite(n) ? n : 0
      payByAccount.set(acc, Math.round(((payByAccount.get(acc) ?? 0) + add) * 100) / 100)
    }
  }

  const introIds = [...byIntroducer.keys()]
  const nameByUser = new Map<string, { nickname: string; username: string; hallNo: string }>()
  if (introIds.length) {
    const placeholders = introIds.map(() => '?').join(',')
    const rows = all<{
      id: string
      username: string
      name: string | null
      hall_no: string | null
    }>(
      database,
      `SELECT u.id AS id, u.username AS username, sp.name AS name, sp.hall_no AS hall_no
       FROM users u
       LEFT JOIN streamer_profiles sp ON sp.user_id = u.id
       WHERE u.id IN (${placeholders})`,
      introIds,
    )
    for (const r of rows) {
      const id = String(r.id || '').trim()
      if (!id) continue
      const username = String(r.username || '').trim()
      const nickname = String(r.name || '').trim() || username || '—'
      const hallNo = String(r.hall_no || '').trim()
      nameByUser.set(id, { nickname, username, hallNo })
    }
  }

  const introducers: SalesRevenueIntroducer[] = []
  const hallScopedDage = new Set<string>()
  for (const [uid, accounts] of byIntroducer) {
    const names = nameByUser.get(uid)
    if (introducerHallNo) {
      // 厅主：只显示所属厅号匹配的介绍人
      if (!names || names.hallNo !== introducerHallNo) continue
    }
    let sum = 0
    for (const acc of accounts) {
      sum += payByAccount.get(acc) ?? 0
      hallScopedDage.add(acc)
    }
    sum = roundMoney(sum)
    introducers.push({
      userId: uid,
      nickname: names?.nickname || '—',
      username: names?.username || '',
      lastMonthRecharge: sum,
      estimatedIncome: roundMoney(sum * 0.1),
    })
  }
  introducers.sort((a, b) => {
    if (b.lastMonthRecharge !== a.lastMonthRecharge) return b.lastMonthRecharge - a.lastMonthRecharge
    return a.nickname.localeCompare(b.nickname, 'zh-CN')
  })

  // Admin: global unique 大哥; 厅主: unique 大哥 among this hall's introducers only
  const totalAccounts = introducerHallNo ? hallScopedDage : uniqueDage
  let totalRecharge = 0
  for (const acc of totalAccounts) {
    totalRecharge += payByAccount.get(acc) ?? 0
  }
  totalRecharge = roundMoney(totalRecharge)

  return {
    monthLabel,
    monthStart,
    monthEnd,
    totalRecharge,
    estimatedTotalIncome: roundMoney(totalRecharge * 0.2),
    estimatedTotalExpense: roundMoney(totalRecharge * 0.1),
    introducers,
    commissionBatchId: pickedId,
  }
}

/**
 * 本周（Asia/Tokyo Mon–Sun）麦序时长 + 主持时长 for the given platform IDs.
 * Uses newest streamer-kind batch overlapping this week.
 */
function lookupThisWeekMicHostHours(
  database: Database,
  platformIds: string[],
): number | null {
  const ids = collectNonEmptyIds(...platformIds)
  if (!ids.length) return null
  migrateLiushui(database)
  const today = tokyoYmd(Date.now())
  const monday = mondayOfYmd(today)
  if (!monday) return null
  const sunday = addDaysYmd(monday, 6)

  const batchRows = all<{
    id: string
    start_date: string
    end_date: string
    uploaded_at: number
  }>(
    database,
    `SELECT id, start_date, end_date, uploaded_at
     FROM liushui_batches
     WHERE COALESCE(kind, 'streamer') = 'streamer'
     ORDER BY uploaded_at DESC`,
    [],
  )
  const matching = batchRows.filter((r) => {
    const startDate = typeof r.start_date === 'string' ? r.start_date : ''
    const endDate = typeof r.end_date === 'string' ? r.end_date : ''
    const bm = batchWeekMonday({ startDate, endDate })
    if (bm && bm === monday) return true
    if (startDate && endDate && rangesOverlap(startDate, endDate, monday, sunday)) return true
    return false
  })
  const picked = pickNewestBatch(
    matching.map((r) => ({
      id: r.id,
      uploadedAt: Number(r.uploaded_at) || 0,
      start_date: r.start_date,
      end_date: r.end_date,
    })),
  )
  if (!picked) return null

  const ph = ids.map(() => '?').join(',')
  const rows = all<{ host_hours: number | null; mic_hours: number | null }>(
    database,
    `SELECT host_hours, mic_hours FROM liushui_rows
     WHERE batch_id = ? AND user_platform_id IN (${ph})`,
    [picked.id, ...ids],
  )
  let sum = 0
  let any = false
  for (const r of rows) {
    const h = rowMicSeqHours(r)
    if (h != null) {
      sum += h
      any = true
    }
  }
  return any ? roundHours2(sum) : null
}

export async function getMySalary(
  userId: string,
  period: MySalaryPeriod = 'last',
): Promise<MySalaryResult> {
  const database = await openDb()
  migrateStreamer(database)
  migrateLiushui(database)
  migrateSalaryConfirmations(database)

  const userRow = one<{ id: string; username: string }>(
    database,
    'SELECT id, username FROM users WHERE id = ?',
    [userId],
  )
  const username = userRow?.username || ''
  const profile = await getStreamerProfileByUser(userId)
  const streamerId = (profile?.streamerId || '').trim()
  const nickname =
    (profile?.name || '').trim() ||
    username ||
    '—'
  const linkedIds = collectNonEmptyIds(
    profile?.linkedId1,
    profile?.linkedId2,
    profile?.linkedId3,
  )
  // Current user + linked accounts share one identity for 介绍人 / 我的大哥.
  const salaryIdentity = resolveMySalaryIdentity(database, userId, profile, username)
  const referrerIds = salaryIdentity.platformIds
  const myDage = lookupMyDageForSalary(database, salaryIdentity.userIds)

  // 我介绍的主播：referrer_id equals my streamer platform ID or any linked-account ID
  // 入职日 = users.created_at (Asia/Tokyo YMD), else streamer_profiles.created_at.
  // 首月窗口 = [入职日, 入职日+30] inclusive.
  // 首月总流水 = sum 合并流水; 首月总麦序 = sum(麦序+主持) for referred IDs in window.
  // 我的总麦序 (top-level) = 本周麦序+主持；per-referral myMicHoursInWindow kept for compat.
  const introduced: MySalaryIntroduced[] = []
  let myTotalMicHours: number | null = null
  if (referrerIds.length) {
    const refPh = referrerIds.map(() => '?').join(',')
    const selfUserPh = salaryIdentity.userIds.map(() => '?').join(',')
    const introRows = all<{
      streamer_id: string
      name: string
      username: string | null
      user_created_at: number | null
      user_status: string | null
      profile_created_at: number | null
      linked_id_1: string | null
      linked_id_2: string | null
      linked_id_3: string | null
    }>(
      database,
      `SELECT sp.streamer_id AS streamer_id,
              sp.name AS name,
              u.username AS username,
              u.created_at AS user_created_at,
              u.status AS user_status,
              sp.created_at AS profile_created_at,
              sp.linked_id_1 AS linked_id_1,
              sp.linked_id_2 AS linked_id_2,
              sp.linked_id_3 AS linked_id_3
       FROM streamer_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE sp.referrer_id IN (${refPh})
         AND sp.streamer_id IS NOT NULL AND sp.streamer_id != ''
         AND sp.streamer_id NOT IN (${refPh})
         AND (sp.user_id IS NULL OR sp.user_id NOT IN (${selfUserPh}))
       ORDER BY
         CASE WHEN u.status = 'approved' THEN 0 ELSE 1 END,
         COALESCE(u.created_at, sp.created_at) DESC,
         sp.updated_at DESC`,
      [...referrerIds, ...referrerIds, ...salaryIdentity.userIds],
    )

    type IntroDraft = {
      id: string
      nickname: string
      registeredAt: number
      tenureDays: number
      joinYmd: string
      winEndYmd: string
      matchIds: string[]
      matchIdSet: Set<string>
    }
    const drafts: IntroDraft[] = []
    const idToPrimary = new Map<string, string>()
    const allMatchIds: string[] = []
    const allMatchSeen = new Set<string>()
    const seenIntroIds = new Set<string>()

    for (const r of introRows) {
      const id = String(r.streamer_id || '').trim()
      if (!id || seenIntroIds.has(id)) continue
      seenIntroIds.add(id)
      const username = String(r.username || '').trim()
      const profileName = String(r.name || '').trim()
      const nickname = profileName || username || id
      const userCreated = Number(r.user_created_at) || 0
      const profileCreated = Number(r.profile_created_at) || 0
      // Prefer users.created_at (site registration / 入职); fall back to profile created_at.
      const registeredAt = userCreated > 0 ? userCreated : profileCreated
      const joinYmd = registeredAt > 0 ? tokyoYmd(registeredAt) : ''
      const winEndYmd = joinYmd ? addDaysYmd(joinYmd, 30) : ''
      const matchIds = collectNonEmptyIds(
        id,
        r.linked_id_1,
        r.linked_id_2,
        r.linked_id_3,
      )
      drafts.push({
        id,
        nickname,
        registeredAt,
        tenureDays: tenureDaysFromRegisteredAt(registeredAt),
        joinYmd,
        winEndYmd,
        matchIds,
        matchIdSet: new Set(matchIds),
      })
      for (const mid of matchIds) {
        if (!idToPrimary.has(mid)) idToPrimary.set(mid, id)
        if (!allMatchSeen.has(mid)) {
          allMatchSeen.add(mid)
          allMatchIds.push(mid)
        }
      }
    }

    // Match Excel rows for my identity (primary + linked + linked-account streamer ids)
    const myMatchIds = collectNonEmptyIds(...referrerIds)
    const myMatchIdSet = new Set(myMatchIds)

    // Distinct streamer week batches (newest upload per start|end)
    const batchMeta = all<{
      id: string
      start_date: string
      end_date: string
      uploaded_at: number
    }>(
      database,
      `SELECT id, start_date, end_date, uploaded_at
       FROM liushui_batches
       WHERE COALESCE(kind, 'streamer') = 'streamer'`,
      [],
    )
    const distinctBatches = pickDistinctWeekBatches(
      batchMeta.map((b) => ({
        id: String(b.id),
        startDate: String(b.start_date || ''),
        endDate: String(b.end_date || ''),
        uploadedAt: Number(b.uploaded_at) || 0,
      })),
    )
    const batchById = new Map(
      distinctBatches.map((b) => [b.id, b] as const),
    )
    const distinctBatchIds = distinctBatches.map((b) => b.id)

    type FlowRow = {
      batch_id: string
      user_platform_id: string
      total_flow_amount: number | null
      total_flow_cents: number | null
      add_flow_yuan: number | null
      deduct_flow_yuan: number | null
      actual_flow: number | null
      host_hours: number | null
      mic_hours: number | null
    }
    const queryIds = collectNonEmptyIds(...allMatchIds, ...myMatchIds)
    let flowRows: FlowRow[] = []
    if (distinctBatchIds.length && queryIds.length) {
      const bPh = distinctBatchIds.map(() => '?').join(',')
      const uPh = queryIds.map(() => '?').join(',')
      flowRows = all<FlowRow>(
        database,
        `SELECT batch_id, user_platform_id, total_flow_amount, total_flow_cents,
                add_flow_yuan, deduct_flow_yuan, actual_flow, host_hours, mic_hours
         FROM liushui_rows
         WHERE batch_id IN (${bPh})
           AND user_platform_id IN (${uPh})`,
        [...distinctBatchIds, ...queryIds],
      )
    }

    // Pre-index rows by batch for window filtering
    const rowsByBatch = new Map<string, FlowRow[]>()
    for (const fr of flowRows) {
      const bid = String(fr.batch_id || '')
      if (!batchById.has(bid)) continue
      let list = rowsByBatch.get(bid)
      if (!list) {
        list = []
        rowsByBatch.set(bid, list)
      }
      list.push(fr)
    }

    for (const d of drafts) {
      let flowSum = 0
      let flowAny = false
      let theirMicSum = 0
      let theirMicAny = false
      let myMicSum = 0
      let myMicAny = false

      if (d.joinYmd && d.winEndYmd) {
        for (const b of distinctBatches) {
          if (!batchOverlapsYmdWindow(b.startDate, b.endDate, d.joinYmd, d.winEndYmd)) {
            continue
          }
          const rows = rowsByBatch.get(b.id)
          if (!rows) continue
          for (const fr of rows) {
            const pid = String(fr.user_platform_id || '').trim()
            if (!pid) continue
            if (d.matchIdSet.has(pid)) {
              const merged = rowMergedFlowYuan(fr)
              if (merged != null) {
                flowSum += merged
                flowAny = true
              }
              const mic = rowMicSeqHours(fr)
              if (mic != null) {
                theirMicSum += mic
                theirMicAny = true
              }
            }
            if (myMatchIdSet.has(pid)) {
              const mic = rowMicSeqHours(fr)
              if (mic != null) {
                myMicSum += mic
                myMicAny = true
              }
            }
          }
        }
      }

      const totalFlowYuan = flowAny ? roundMoney(flowSum) : null
      const firstMonthMicHours = theirMicAny ? roundHours2(theirMicSum) : null
      // Per-referral window hours kept for API compat; UI no longer labels as 我的总麦序.
      const myMicHoursInWindow = myMicAny ? roundHours2(myMicSum) : null

      introduced.push({
        id: d.id,
        nickname: d.nickname,
        registeredAt: d.registeredAt,
        tenureDays: d.tenureDays,
        totalFlowYuan,
        firstMonthMicHours,
        myMicHoursInWindow,
      })
    }
  }

  // 我的总麦序 = 本周（Asia/Tokyo）麦序时长 + 主持时长 for current user IDs
  myTotalMicHours = lookupThisWeekMicHostHours(database, referrerIds)

  const estimatedLastMonthUserCommission = roundMoney(
    myDage.reduce((s, d) => s + (Number.isFinite(d.lastMonthCumulative) ? d.lastMonthCumulative : 0), 0) * 0.1,
  )
  const me: MySalaryMe = {
    nickname,
    streamerId,
    linkedIds,
    introduced,
    myTotalMicHours,
    payQrUrl: profile?.payQrUrl ?? null,
    myDage,
    estimatedLastMonthUserCommission,
  }

  const batchRows = all<{
    id: string
    start_date: string
    end_date: string
    uploaded_at: number
  }>(
    database,
    `SELECT id, start_date, end_date, uploaded_at
     FROM liushui_batches
     WHERE COALESCE(kind, 'streamer') = 'streamer'
     ORDER BY end_date DESC, uploaded_at DESC`,
    [],
  )
  const weeks = pickDistinctWeekBatches(
    batchRows.map((r) => ({
      id: r.id,
      startDate: typeof r.start_date === 'string' ? r.start_date : '',
      endDate: typeof r.end_date === 'string' ? r.end_date : '',
      uploadedAt: Number(r.uploaded_at) || 0,
    })),
  )

  const idx = period === 'prev' ? 1 : 0
  const picked = weeks[idx] || null
  if (!picked) {
    return {
      ok: true,
      me,
      period,
      range: null,
      batchId: null,
      row: null,
      rowMissing: false,
      confirmed: false,
      confirmedAt: null,
      wageSource: 'row',
      hallNo: null,
      hallPayMode: null,
      hallUserFlow: null,
      hallStreamerFlow: null,
      hallStreamerWageTotal: null,
      activity: null,
      guildSubsidy: null,
    }
  }

  const range: MySalaryRange = {
    startDate: picked.startDate,
    endDate: picked.endDate,
    startDateLabel: formatChineseDateLabel(picked.startDate),
    endDateLabel: formatChineseDateLabel(picked.endDate),
  }

  // Match my primary ID or any linked ID (rollup stores under primary, but also check aliases)
  const matchIds = collectNonEmptyIds(streamerId, ...linkedIds)
  let rowData: MySalaryRow | null = null
  let rowMissing = false

  if (matchIds.length) {
    const placeholders = matchIds.map(() => '?').join(',')
    const candidates = all<{
      user_platform_id: string
      total_flow_text: string
      total_flow_amount: number | null
      host_hours: number | null
      mic_hours: number | null
      reward_yuan: number | null
      fine_yuan: number | null
      add_flow_yuan: number | null
      deduct_flow_yuan: number | null
      actual_flow: number | null
      base_wage: number | null
      total_wage: number | null
    }>(
      database,
      `SELECT user_platform_id, total_flow_text, total_flow_amount,
              host_hours, mic_hours, reward_yuan, fine_yuan,
              add_flow_yuan, deduct_flow_yuan, actual_flow, base_wage, total_wage
       FROM liushui_rows
       WHERE batch_id = ? AND user_platform_id IN (${placeholders})
       ORDER BY rowid ASC`,
      [picked.id, ...matchIds],
    )
    // Prefer row whose platform id equals primary streamerId
    let chosen = candidates[0] || null
    if (streamerId && candidates.length > 1) {
      const primary = candidates.find((c) => c.user_platform_id === streamerId)
      if (primary) chosen = primary
    }
    if (chosen) {
      rowData = {
        totalWage: nullableNum(chosen.total_wage),
        actualFlow: nullableNum(chosen.actual_flow),
        totalFlow: nullableNum(chosen.total_flow_amount),
        totalFlowText: chosen.total_flow_text || '',
        addFlow: nullableNum(chosen.add_flow_yuan),
        deductFlow: nullableNum(chosen.deduct_flow_yuan),
        hostHours: nullableNum(chosen.host_hours),
        micHours: nullableNum(chosen.mic_hours),
        rewardYuan: nullableNum(chosen.reward_yuan),
        fineYuan: nullableNum(chosen.fine_yuan),
        baseWage: nullableNum(chosen.base_wage),
      }
    } else {
      rowMissing = true
    }
  } else {
    // No streamer/linked IDs on profile — treat as missing row if batch exists
    rowMissing = true
  }

  // 厅主：总工资按 hall_pay_mode（工会代发 / 自行发）— 与工资发放同源 computeHallOwnerWage
  let wageSource: 'row' | 'hall_revenue' = 'row'
  let hallNoOut: string | null = null
  let hallPayModeOut: HallPayMode | null = null
  let hallUserFlow: number | null = null
  let hallStreamerFlow: number | null = null
  let hallStreamerWageTotal: number | null = null
  const hallWageNo = profile?.isHallOwner ? (profile.hallNo || '').trim() : ''
  if (hallWageNo && profile) {
    const monday =
      (picked.startDate && ymdParts(picked.startDate) ? mondayOfYmd(picked.startDate) : '') ||
      (picked.endDate && ymdParts(picked.endDate) ? mondayOfYmd(picked.endDate) : '')
    const ymw = monday ? resolveYearMonthWeekForMonday(monday) : null
    if (ymw) {
      const hw = await computeHallOwnerWage(ymw.year, ymw.month, ymw.week, profile)
      if (hw) {
        const prevBaseWage = rowData?.baseWage ?? null
        rowData = {
          totalWage: hw.totalWage,
          actualFlow: null,
          totalFlow: null,
          totalFlowText: '',
          addFlow: null,
          deductFlow: null,
          hostHours: null,
          micHours: null,
          rewardYuan: null,
          fineYuan: null,
          baseWage: prevBaseWage,
        }
        rowMissing = false
        wageSource = 'hall_revenue'
        hallNoOut = hw.hallNo
        hallPayModeOut = hw.hallPayMode
        hallUserFlow = hw.hallUserFlow
        hallStreamerFlow = hw.hallStreamerFlow
        hallStreamerWageTotal = hw.hallStreamerWageTotal
      }
    }
  }

  // 普通主播已付款后使用快照；厅主工资已由 computeHallOwnerWage live 计算，永不冻结。
  if (wageSource !== 'hall_revenue' && rowData && picked.id) {
    migrateSalaryPayments(database)
    const payIds = matchIds.length ? matchIds : collectNonEmptyIds(streamerId)
    if (payIds.length) {
      const placeholders = payIds.map(() => '?').join(',')
      const pay = one<{ paid_wage: number | null; paid_snapshot: string | null }>(
        database,
        `SELECT paid_wage, paid_snapshot FROM salary_payments
         WHERE batch_id = ? AND user_platform_id IN (${placeholders})
         ORDER BY CASE WHEN paid_wage IS NOT NULL THEN 0 ELSE 1 END, paid_at DESC
         LIMIT 1`,
        [picked.id, ...payIds],
      )
      const frozen = nullableNum(pay?.paid_wage)
      if (frozen != null) {
        rowData = { ...rowData, totalWage: frozen }
        const snap = parseHallPaidSnapshot(pay?.paid_snapshot)
        if (snap) {
          hallUserFlow = snap.hallUserFlow
          hallStreamerFlow = snap.hallStreamerFlow
          hallStreamerWageTotal = snap.hallStreamerWageTotal
        }
      }
    }
  }

  let confirmed = false
  let confirmedAt: string | null = null
  if (rowData) {
    const conf = one<{ confirmed_at: string }>(
      database,
      `SELECT confirmed_at FROM salary_confirmations WHERE user_id = ? AND batch_id = ?`,
      [userId, picked.id],
    )
    if (conf && conf.confirmed_at) {
      confirmed = true
      confirmedAt = String(conf.confirmed_at)
    }
  }

  const activity = lookupMySalaryActivity(
    database,
    picked.startDate,
    picked.endDate,
    matchIds,
    streamerId,
  )

  // 合并流水 = actualFlow, else 总流水+添加流水-扣除流水
  let mergedFlow: number | null = null
  if (rowData) {
    if (rowData.actualFlow != null && Number.isFinite(rowData.actualFlow)) {
      mergedFlow = rowData.actualFlow
    } else if (
      wageSource === 'row' &&
      (rowData.totalFlow != null || rowData.addFlow != null || rowData.deductFlow != null)
    ) {
      mergedFlow = roundMoney(
        (rowData.totalFlow ?? 0) + (rowData.addFlow ?? 0) - (rowData.deductFlow ?? 0),
      )
    }
  }
  const guildRates = await getGuildPointRates()
  const guildSubsidy = computeGuildSubsidy(
    rowData?.totalWage,
    mergedFlow,
    guildRates.streamerPointRate,
  )

  return {
    ok: true,
    me,
    period,
    range,
    batchId: picked.id,
    row: rowData,
    rowMissing,
    confirmed,
    confirmedAt,
    wageSource,
    hallNo: hallNoOut,
    hallPayMode: hallPayModeOut,
    hallUserFlow,
    hallStreamerFlow,
    hallStreamerWageTotal,
    activity,
    guildSubsidy,
  }
}

export type ConfirmMySalaryResult =
  | { ok: true; confirmedAt: string; batchId: string }
  | { ok: false; error: string; status: number }

/**
 * Employee confirms this week's salary for the same batch/row resolution as getMySalary.
 * Upserts; does not allow un-confirm from this API.
 */
export async function confirmMySalary(
  userId: string,
  period: MySalaryPeriod = 'last',
): Promise<ConfirmMySalaryResult> {
  const salary = await getMySalary(userId, period)
  if (!salary.batchId || !salary.range) {
    return { ok: false, error: '暂无该周流水', status: 404 }
  }
  if (salary.rowMissing || !salary.row) {
    return { ok: false, error: '本周流水中没有你的记录', status: 404 }
  }

  const database = await openDb()
  migrateSalaryConfirmations(database)
  const confirmedAt = new Date().toISOString()
  database.run(
    `INSERT INTO salary_confirmations (user_id, batch_id, confirmed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, batch_id) DO UPDATE SET confirmed_at = excluded.confirmed_at`,
    [userId, salary.batchId, confirmedAt],
  )
  scheduleSave()
  return { ok: true, confirmedAt, batchId: salary.batchId }
}

export { DB_PATH, COOKIE, DATA_DIR, UPLOADS_DIR }


/** Compact privacy-safe payroll blob for AI解答 — only the given user's rows. */
export async function buildMyLiushuiAssistContext(userId: string): Promise<string> {
  const database = await openDb()
  migrateStreamer(database)
  migrateLiushui(database)

  const profile = await getStreamerProfileByUser(userId)
  const streamerId = (profile?.streamerId || '').trim()
  const linkedIds = collectNonEmptyIds(
    profile?.linkedId1,
    profile?.linkedId2,
    profile?.linkedId3,
  )
  const matchIds = collectNonEmptyIds(streamerId, ...linkedIds)
  const usernameForWage =
    one<{ username: string }>(database, 'SELECT username FROM users WHERE id = ?', [userId])?.username ||
    ''
  const nickname =
    (profile?.name || '').trim() ||
    usernameForWage ||
    ''

  const batchRows = all<{
    id: string
    label: string
    filename: string
    start_date: string
    end_date: string
    uploaded_at: number
  }>(
    database,
    `SELECT id, label, filename, start_date, end_date, uploaded_at
     FROM liushui_batches
     WHERE COALESCE(kind, 'streamer') = 'streamer'
     ORDER BY end_date DESC, uploaded_at DESC`,
    [],
  )
  const weeks = pickDistinctWeekBatches(
    batchRows.map((r) => ({
      id: r.id,
      startDate: typeof r.start_date === 'string' ? r.start_date : '',
      endDate: typeof r.end_date === 'string' ? r.end_date : '',
      uploadedAt: Number(r.uploaded_at) || 0,
    })),
  ).slice(0, 4)

  if (!weeks.length) {
    return [
      '【我的流水资料（仅本人，禁止编造他人数据）】',
      `昵称：${nickname || '—'}；主播ID：${streamerId || '未绑定'}`,
      '暂无流水批次。',
      '规则：只回答本人数据；若问他人流水/工资/时长/排名细节 → 礼貌拒绝；无数据时说「暂无流水」。',
    ].join('\n')
  }

  const batchMeta = new Map(
    batchRows.map((r) => [
      r.id,
      {
        label: r.label || '',
        filename: r.filename || '',
        startDate: typeof r.start_date === 'string' ? r.start_date : '',
        endDate: typeof r.end_date === 'string' ? r.end_date : '',
      },
    ]),
  )

  const fmt = (n: number | null | undefined): string => {
    if (n == null || !Number.isFinite(n)) return '—'
    return Number.isInteger(n) ? String(n) : n.toFixed(2)
  }

  const sections: string[] = [
    '【我的流水资料（仅本人，禁止编造他人数据）】',
    `昵称：${nickname || '—'}；主播ID：${streamerId || '未绑定'}${linkedIds.length ? `；关联ID：${linkedIds.join('、')}` : ''}`,
  ]

  if (!matchIds.length) {
    const hallWageNo = profile?.isHallOwner ? (profile.hallNo || '').trim() : ''
    if (hallWageNo) {
      // 厅主工资不依赖主播行：用 我的工资 API 同源公式补充最近两周
      for (const p of ['last', 'prev'] as const) {
        const sal = await getMySalary(userId, p)
        if (!sal.range || !sal.row) continue
        const tag = p === 'last' ? '（最近一周）' : '（上上周）'
        const startLabel = sal.range.startDateLabel || sal.range.startDate || '—'
        const endLabel = sal.range.endDateLabel || sal.range.endDate || '—'
        const modeNote =
          sal.hallPayMode === 'self'
            ? `${hallWageNo}厅收益（厅主自行发工资）`
            : `${hallWageNo}厅收益−主持工资（工会代发工资）`
        sections.push(
          `■ ${startLabel}～${endLabel}${tag}\n实发工资(总工资)：${fmt(sal.row.totalWage)}（${modeNote}）`,
        )
      }
      sections.push(
        '规则：只根据以上本人数据回答实发工资；禁止编造或透露他人工资；可引导去「我的→我的工资」查看。',
      )
      return sections.join('\n')
    }
    sections.push('资料未绑定主播/关联ID，暂无流水。')
    sections.push(
      '规则：只回答本人数据；若问他人流水/工资/时长/排名细节 → 礼貌拒绝；无数据时说「暂无流水」。',
    )
    return sections.join('\n')
  }

  let anyRow = false
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i]!
    const meta = batchMeta.get(week.id)
    const startLabel = formatChineseDateLabel(week.startDate) || week.startDate || '—'
    const endLabel = formatChineseDateLabel(week.endDate) || week.endDate || '—'
    const label = (meta?.label || '').trim()
    const filename = (meta?.filename || '').trim()
    const weekTag = i === 0 ? '（最近一周）' : i === 1 ? '（上上周）' : ''
    const header = `■ 批次 ${startLabel}～${endLabel}${weekTag}${label ? `｜${label}` : ''}${filename ? `｜${filename}` : ''}`

    const placeholders = matchIds.map(() => '?').join(',')
    const myCandidates = all<{
      user_platform_id: string
      total_flow_amount: number | null
      add_flow_yuan: number | null
      deduct_flow_yuan: number | null
      actual_flow: number | null
      host_hours: number | null
      mic_hours: number | null
      reward_yuan: number | null
      fine_yuan: number | null
      total_wage: number | null
    }>(
      database,
      `SELECT user_platform_id, total_flow_amount, add_flow_yuan, deduct_flow_yuan,
              actual_flow, host_hours, mic_hours, reward_yuan, fine_yuan, total_wage
       FROM liushui_rows
       WHERE batch_id = ? AND user_platform_id IN (${placeholders})
       ORDER BY rowid ASC`,
      [week.id, ...matchIds],
    )

    let mine = myCandidates[0] || null
    if (streamerId && myCandidates.length > 1) {
      const primary = myCandidates.find((c) => c.user_platform_id === streamerId)
      if (primary) mine = primary
    }

    // Rank by total_flow_amount (fallback actual_flow) among all rows in batch — privacy: only my rank + count
    const allFlows = all<{
      user_platform_id: string
      total_flow_amount: number | null
      actual_flow: number | null
    }>(
      database,
      `SELECT user_platform_id, total_flow_amount, actual_flow
       FROM liushui_rows WHERE batch_id = ?`,
      [week.id],
    )
    const scored = allFlows.map((r) => {
      const tf = nullableNum(r.total_flow_amount)
      const af = nullableNum(r.actual_flow)
      const score = tf != null ? tf : af != null ? af : Number.NEGATIVE_INFINITY
      return { id: r.user_platform_id, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const totalPeople = scored.length
    let myRank: number | null = null
    if (mine) {
      const idx = scored.findIndex((s) => s.id === mine!.user_platform_id)
      myRank = idx >= 0 ? idx + 1 : null
    }

    if (!mine) {
      sections.push(`${header}\n本批暂无你的流水行。`)
      continue
    }
    anyRow = true
    const rankLine =
      myRank != null && totalPeople > 0
        ? `工会流水排名：第 ${myRank} 名 / 共 ${totalPeople} 人（仅本人名次，不含他人昵称/ID/金额）`
        : `工会流水排名：暂无（共 ${totalPeople} 人）`

    let wageDisplay = fmt(nullableNum(mine.total_wage))
    const hallWageNoForWeek = profile?.isHallOwner ? (profile.hallNo || '').trim() : ''
    if (hallWageNoForWeek && profile) {
      const monday =
        (week.startDate && ymdParts(week.startDate) ? mondayOfYmd(week.startDate) : '') ||
        (week.endDate && ymdParts(week.endDate) ? mondayOfYmd(week.endDate) : '')
      const ymw = monday ? resolveYearMonthWeekForMonday(monday) : null
      if (ymw) {
        const hw = await computeHallOwnerWage(ymw.year, ymw.month, ymw.week, profile)
        if (hw) wageDisplay = fmt(hw.totalWage)
      }
    }
    sections.push(
      [
        header,
        `总流水：${fmt(nullableNum(mine.total_flow_amount))}；添加：${fmt(nullableNum(mine.add_flow_yuan))}；扣除：${fmt(nullableNum(mine.deduct_flow_yuan))}；实际流水：${fmt(nullableNum(mine.actual_flow))}`,
        `主持时长：${fmt(nullableNum(mine.host_hours))}；麦序时长：${fmt(nullableNum(mine.mic_hours))}`,
        `奖励：${fmt(nullableNum(mine.reward_yuan))}；罚款：${fmt(nullableNum(mine.fine_yuan))}；实发工资(总工资)：${wageDisplay}`,
        rankLine,
      ].join('\n'),
    )
  }

  if (!anyRow) {
    sections.push('上述批次中暂无与你 ID 匹配的流水。')
  }

  sections.push(
    '规则：只根据以上本人数据回答日/周流水、主持/麦序时长、实发工资、本人工会流水排名；禁止编造或透露他人工资/时长/流水/昵称/ID；若问他人 → 礼貌拒绝；无匹配数据时说「暂无流水」。可引导去「我的→我的工资」查看。',
  )
  return sections.join('\n\n')
}

/** Username `admin`（会长）OR point-rate 全满 — full admin menus (注册/上传/收益/发薪).
 * 半满 / 福利图 / 歌手 / 特殊 alone → normal 主播 (no special menus). 厅管 → payroll only. */
export async function isFullAdminAccess(userId: string, username: string): Promise<boolean> {
  if (isAdminUsername(username)) return true
  if (!userId) return false
  const profile = await getStreamerProfileByUser(userId)
  return isQuanManPoint(profile?.pointRate || '')
}

/** Strict board admin: username `admin` or 全满. */
export async function isRevenueBoardAdminAsync(userId: string, username: string): Promise<boolean> {
  return isFullAdminAccess(userId, username)
}

/** Sync check for username-only paths (admin bootstrap). Prefer async full-admin when userId known. */
export function isRevenueBoardAdmin(username: string) {
  return isAdminUsername(username)
}

/** Alias kept for imports; prefer canAccessPayrollBoard. */
export const isPayrollAdmin = isRevenueBoardAdmin

export type HallOwnerFlags = {
  isHallOwner: boolean
  hallNo: string | null
}

/** Lookup 厅主 flag + 所属厅号 by username (DB-backed). */
export async function getHallOwnerFlags(username: string): Promise<HallOwnerFlags> {
  const trimmed = username.trim()
  if (!trimmed) return { isHallOwner: false, hallNo: null }
  const database = await openDb()
  migrateStreamer(database)
  const row = one<{ is_hall_owner: number; hall_no: string }>(
    database,
    `SELECT sp.is_hall_owner AS is_hall_owner, sp.hall_no AS hall_no
     FROM streamer_profiles sp
     JOIN users u ON u.id = sp.user_id
     WHERE u.username = ? COLLATE NOCASE`,
    [trimmed],
  )
  if (!row || Number(row.is_hall_owner) !== 1) {
    return { isHallOwner: false, hallNo: null }
  }
  const hallNo = String(row.hall_no || '').trim() || null
  return { isHallOwner: true, hallNo }
}

export type AuthHallFlags = {
  isHallOwner: boolean
  hallNo: string | null
  canAccessRevenueBoard: boolean
  canAccessPayrollBoard: boolean
  /** Full admin menus: username admin（会长）or 点位 全满 */
  isFullAdmin: boolean
  /** 点位 厅管 — payroll (scoped) but not revenue */
  isTingGuan: boolean
  isDage: boolean
  pointRate: string
}

/** Auth extras for /api/auth/me and login. */
export async function getAuthHallFlags(
  userId: string,
  username: string,
): Promise<AuthHallFlags> {
  const flags = await getHallOwnerFlags(username)
  const profile = userId ? await getStreamerProfileByUser(userId) : null
  let isHallOwner = flags.isHallOwner
  let hallNo = flags.hallNo
  if (!isHallOwner && profile?.isHallOwner) {
    isHallOwner = true
    hallNo = (profile.hallNo || '').trim() || null
  }
  const pointRate = (profile?.pointRate || '').trim()
  const isDage = isDagePoint(pointRate)
  // 半满 without 厅主 → isFullAdmin/isTingGuan false → normal 主播 menus only
  const isFullAdmin = isAdminUsername(username) || isQuanManPoint(pointRate)
  const isTingGuan = isTingGuanPoint(pointRate)
  // 收益：会长(admin)/全满/厅主；厅管不可见收益看板
  const canAccessRevenueBoard =
    !isDage && (isFullAdmin || (isHallOwner && !!hallNo))
  // 工资发放：会长(admin)/全满/厅管（厅管优选本厅 scope）
  const canAccessPayrollBoard = !isDage && (isFullAdmin || isTingGuan)
  return {
    isHallOwner,
    hallNo,
    canAccessRevenueBoard,
    canAccessPayrollBoard,
    isFullAdmin,
    isTingGuan,
    isDage,
    pointRate,
  }
}

/** True when the logged-in user's registration-list point type is 大哥. */
export async function isDageUser(userId: string): Promise<boolean> {
  const profile = await getStreamerProfileByUser(userId)
  return isDagePoint(profile?.pointRate || '')
}

/** Open 收益看板 menu / API: 会长(admin)/全满 OR 厅主 with 所属厅号 (厅管 still no 收益看板). */
export async function canAccessRevenueBoard(username: string, userId?: string): Promise<boolean> {
  const trimmed = username.trim()
  if (userId) {
    const flags = await getAuthHallFlags(userId, trimmed)
    return flags.canAccessRevenueBoard
  }
  if (isAdminUsername(trimmed)) return true
  const flags = await getHallOwnerFlags(trimmed)
  return flags.isHallOwner && !!flags.hallNo
}

/**
 * 工资发放 access.
 * - admin / 全满: full board
 * - 厅管: scoped to own hallNo when known; if hallNo missing → allow API but empty board
 * Returns hallScope null = full; string = filter to that hall; false = denied.
 */
export async function getPayrollAccess(
  userId: string,
  username: string,
): Promise<{ ok: false } | { ok: true; hallScope: string | null }> {
  const flags = await getAuthHallFlags(userId, username)
  if (!flags.canAccessPayrollBoard) return { ok: false }
  if (flags.isFullAdmin) return { ok: true, hallScope: null }
  if (flags.isTingGuan) {
    // Prefer scope to own hall. Missing hallNo → empty string = show no rows (documented).
    return { ok: true, hallScope: flags.hallNo || '' }
  }
  return { ok: false }
}

export async function canAccessPayrollBoard(userId: string, username: string): Promise<boolean> {
  const a = await getPayrollAccess(userId, username)
  return a.ok
}

/** Hall scope for restricted viewers; null = full (会长 admin/全满) or not scoped. */
export async function getRevenueBoardHallScope(
  username: string,
  userId?: string,
): Promise<{ hallNo: string } | null> {
  if (userId) {
    const flags = await getAuthHallFlags(userId, username)
    if (flags.isFullAdmin) return null
    if (flags.isHallOwner && flags.hallNo) return { hallNo: flags.hallNo }
    return null
  }
  if (isAdminUsername(username)) return null
  const flags = await getHallOwnerFlags(username)
  if (!flags.isHallOwner || !flags.hallNo) return null
  return { hallNo: flags.hallNo }
}

/** Hide guild-level 流水总览 totals from scoped viewers (厅主); 会长/全满 always see them. */
export async function shouldHideRevenueOverviewTotals(username: string, userId?: string): Promise<boolean> {
  if (userId) {
    const flags = await getAuthHallFlags(userId, username)
    if (flags.isFullAdmin) return false
    return flags.isHallOwner
  }
  if (isAdminUsername(username)) return false
  const flags = await getHallOwnerFlags(username)
  return flags.isHallOwner
}

/** 厅主 我的工资 uses hall-revenue sum instead of liushui row / 点位. */
export async function usesHallRevenueWage(username: string): Promise<boolean> {
  const flags = await getHallOwnerFlags(username)
  return flags.isHallOwner && !!flags.hallNo
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
  /** 该介绍人名下所有大哥的上个月支付金额合计（sum payAmount） */
  lastMonthRecharge: number
  /** 预计收入 = lastMonthRecharge × 0.1 */
  estimatedIncome: number
}

/** 销售收益（admin 全部，或厅主锁定厅；按 Asia/Tokyo 上个月订单提成 payAmount） */
export type SalesRevenue = {
  monthLabel: string
  monthStart: string
  monthEnd: string
  /** 上个月大哥总充值（unique 大哥 payAmount 之和；厅主时仅本厅介绍人） */
  totalRecharge: number
  /** 预计总收入 = totalRecharge × 0.2 */
  estimatedTotalIncome: number
  /** 预计总支出 = totalRecharge × 0.1 */
  estimatedTotalExpense: number
  introducers: SalesRevenueIntroducer[]
  commissionBatchId: string | null
}

export type RevenueBoardResult = {
  period: {
    year: number
    month: number
    week: number
    label: string
    /** When week 5 of M shares ISO week with week 1 of M+1 (or vice versa). */
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
  /** Sum of user-liushui 总流水 for week-group (+ optional hall filter). */
  userTotalFlow: number
  /** userTotalFlow × 用户流水点位 (hall-owner rate or default 0.74). */
  userTotalRevenue: number
  /** Week-group user total for the combined overview board (optional overview hall filter). */
  overviewUserTotalFlow: number
  overviewUserTotalRevenue: number
  /** 用户流水厅收益 = sum(userFlow × 用户流水点位) per hall-owner rates. */
  overviewUserHallRevenue: number
  /** SUM 合并流水 (= 总流水+添加流水-扣除流水) from newest streamer batch for week. */
  streamerTotalFlow: number
  /** streamerTotalFlow × 厅点位 (hall-owner rate or default 0.53). */
  streamerTotalRevenue: number
  /** Week-group streamer 合并流水 total for the combined overview board (optional overview hall filter). */
  overviewStreamerTotalFlow: number
  overviewStreamerTotalRevenue: number
  /** 主播流水厅收益 = sum(streamerFlow × 厅点位) per hall-owner rates. */
  overviewStreamerHallRevenue: number
  /** UI: 主播总支出 — sum of total_wage on overview-hall-filtered streamer rows (null → 0). */
  overviewStreamerTotalWage: number
  /** 应到账总金额 = overviewStreamerTotalRevenue + overviewUserTotalRevenue (2 decimals). Never expose formula in UI. */
  overviewPayableTotal: number
  /**
   * 厅总收款 / 厅收入 =
   *   sum(主播流水 × 厅点位) + sum(用户流水 × 用户流水点位)
   * per-hall 厅主 rates (defaults 0.53 / 0.74). Same as overviewStreamerHallRevenue + overviewUserHallRevenue.
   */
  overviewHallTotalReceipts: number
  /** 厅总支出 = overviewStreamerTotalWage (主播工资发放合计). */
  overviewHallTotalExpense: number
  /** 厅盈利 = 厅总收款 − 厅总支出. */
  overviewHallProfit: number
  /**
   * 工会收款 / 工会收入 / 工会收益 =
   *   sum(all streamer liushui) × 工会主播点位(default 0.558)
   * + sum(all user liushui) × 工会用户流水点位(default 0.93)
   * Guild rates are global & editable by admin/会长 (NOT per-hall 厅主 rates).
   */
  overviewGuildReceipts: number
  /** 工会收益 — same base as 工会收款 (guild settlement before wage expense). */
  overviewGuildRevenue: number
  /** 工会盈利 = 工会总收款 − 厅总收款. */
  overviewGuildProfit: number
  /** Current global 工会点位 used for the guild formulas above. */
  guildPointRates: GuildPointRates
  /** Union of user-row hall_no and streamer profile 所属厅号 for overview chips. */
  overviewHalls: string[]
  /** Selected overview hall filter; empty string = 全部. */
  overviewHallNo: string
  /** SUM row total_wage (null → 0) from newest streamer batch. */
  streamerTotalWage: number
  /** streamerTotalRevenue - streamerTotalWage. */
  streamerProfit: number
  /** Distinct 靓号厅ID (hallNo) from user rows in the week's user batch. */
  halls: string[]
  /** Selected user hall filter; empty string = 全部. */
  hallNo: string
  /** Distinct 所属厅号 from streamer_profiles for streamer rows in the week's streamer batch. */
  streamerHalls: string[]
  /** Selected streamer hall filter; empty string = 全部; __empty__ = 未填厅号. */
  streamerHallNo: string
  /** Whether any streamer row lacks profile 所属厅号 (for 未填厅号 chip). */
  streamerHallHasEmpty: boolean
  streamerSummary: RevenueBoardStreamerSummary | null
  userSummary: RevenueBoardUserSummary | null
  batches: RevenueBoardBatchInfo[]
  empty: boolean
  emptyMessage: string | null
  /** Present only when overview hall filter is 全部; null when a hall is selected. */
  salesRevenue: SalesRevenue | null
}

function ymdParts(ymd: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (![y, mo, d].every((n) => Number.isFinite(n)) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return [y, mo, d]
}

function ymdFromUtcMs(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

function utcNoonYmd(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 12, 0, 0)
}

function addDaysYmd(ymd: string, days: number): string {
  const p = ymdParts(ymd)
  if (!p) return ''
  return ymdFromUtcMs(utcNoonYmd(p[0], p[1], p[2]) + days * 86_400_000)
}

/** Monday of the Mon–Sun week containing civil YYYY-MM-DD (Asia/Tokyo payroll weeks). */
function mondayOfYmd(ymd: string): string {
  const p = ymdParts(ymd)
  if (!p) return ''
  const ms = utcNoonYmd(p[0], p[1], p[2])
  const dow = new Date(ms).getUTCDay() // 0=Sun … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow
  return addDaysYmd(ymd, offset)
}

type MonthWeek = { week: number; monday: string; sunday: string }

/**
 * Weeks overlapping calendar month, numbered 1..5 by Monday order (Asia/Tokyo civil dates).
 * A week whose Monday falls in month M is week-of-M; weeks spanning months still appear
 * in both months' lists when they overlap (so 第5周 of M and 第1周 of M+1 can share Monday).
 */
function listMonthWeeks(year: number, month: number): MonthWeek[] {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return []
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  let monday = mondayOfYmd(first)
  if (!monday) return []
  const out: MonthWeek[] = []
  // Walk at most 6 weeks; cap display numbering at 5
  for (let i = 0; i < 6; i++) {
    const sunday = addDaysYmd(monday, 6)
    if (sunday >= first && monday <= last) {
      out.push({ week: out.length + 1, monday, sunday })
      if (out.length >= 5) break
    }
    monday = addDaysYmd(monday, 7)
    if (!monday || monday > last) break
  }
  return out
}

function periodLabel(year: number, month: number, week: number): string {
  return `${year}年${month}月第${week}周`
}

/** Map a Mon–Sun week's Monday to a year/month/week index for getRevenueBoard. */
function resolveYearMonthWeekForMonday(
  monday: string,
): { year: number; month: number; week: number } | null {
  const p = ymdParts(monday)
  if (!p) return null
  const [y, m] = p
  for (const delta of [0, -1, 1]) {
    let month = m + delta
    let year = y
    if (month < 1) {
      month = 12
      year -= 1
    } else if (month > 12) {
      month = 1
      year += 1
    }
    const weeks = listMonthWeeks(year, month)
    const found = weeks.find((w) => w.monday === monday)
    if (found) return { year, month, week: found.week }
  }
  return null
}

function batchWeekMonday(b: { startDate: string; endDate: string }): string {
  if (b.startDate && ymdParts(b.startDate)) return mondayOfYmd(b.startDate)
  if (b.endDate && ymdParts(b.endDate)) return mondayOfYmd(b.endDate)
  return ''
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  return aStart <= bEnd && bStart <= aEnd
}

function pickNewestBatch<T extends { uploadedAt: number }>(list: T[]): T | null {
  if (!list.length) return null
  return [...list].sort((a, b) => b.uploadedAt - a.uploadedAt)[0] ?? null
}


/** Sentinel for streamer rows with no profile 所属厅号 (matches AdminLiushuiPage). */
export const STREAMER_HALL_EMPTY = '__empty__'

/** streamerId (+ linked IDs) → 所属厅号 from 注册列表 / streamer_profiles */
function buildHallNoByStreamerIdFromDb(database: Database): Record<string, string> {
  const rows = all<{
    streamer_id: string
    hall_no: string
    linked_id_1: string | null
    linked_id_2: string | null
    linked_id_3: string | null
  }>(
    database,
    `SELECT streamer_id, hall_no, linked_id_1, linked_id_2, linked_id_3
     FROM streamer_profiles
     WHERE streamer_id IS NOT NULL AND streamer_id != ''`,
    [],
  )
  const map: Record<string, string> = {}
  // Pass 1: primary streamerId claims hallNo
  for (const r of rows) {
    const primary = String(r.streamer_id || '').trim()
    if (!primary) continue
    if (!(primary in map)) map[primary] = String(r.hall_no || '').trim()
  }
  // Pass 2: linked IDs resolve to primary profile hallNo if free
  for (const r of rows) {
    const primary = String(r.streamer_id || '').trim()
    if (!primary) continue
    const hall = primary in map ? map[primary] : String(r.hall_no || '').trim()
    for (const raw of [r.linked_id_1, r.linked_id_2, r.linked_id_3]) {
      const id = String(raw || '').trim()
      if (!id || id === primary) continue
      if (!(id in map)) map[id] = hall
    }
  }
  return map
}

/** hall_no → highest { hallPointRate, userFlowPointRate } across all 厅主 profiles. */
function buildHallIncomeRatesByHallNo(database: Database): Map<
  string,
  { hallPointRate: number; userFlowPointRate: number }
> {
  migrateStreamer(database)
  const rows = all<{
    hall_no: string
    hall_point_rate: number | null
    user_flow_point_rate: number | null
  }>(
    database,
    `SELECT hall_no, hall_point_rate, user_flow_point_rate
     FROM streamer_profiles
     WHERE COALESCE(is_hall_owner, 0) = 1
       AND hall_no IS NOT NULL AND TRIM(hall_no) != ''`,
    [],
  )
  const map = new Map<string, { hallPointRate: number; userFlowPointRate: number }>()
  for (const r of rows) {
    const hn = String(r.hall_no || '').trim()
    if (!hn) continue
    const hallPointRate = normalizeHallPointRate(r.hall_point_rate)
    const userFlowPointRate = normalizeUserFlowPointRate(r.user_flow_point_rate)
    const previous = map.get(hn)
    map.set(hn, {
      hallPointRate: Math.max(previous?.hallPointRate ?? hallPointRate, hallPointRate),
      userFlowPointRate: Math.max(previous?.userFlowPointRate ?? userFlowPointRate, userFlowPointRate),
    })
  }
  return map
}

function ratesForHall(
  map: Map<string, { hallPointRate: number; userFlowPointRate: number }>,
  hallNo: string,
): { hallPointRate: number; userFlowPointRate: number } {
  const hit = map.get((hallNo || '').trim())
  return {
    hallPointRate: hit?.hallPointRate ?? DEFAULT_HALL_POINT_RATE,
    userFlowPointRate: hit?.userFlowPointRate ?? DEFAULT_USER_FLOW_POINT_RATE,
  }
}

/**
 * Admin revenue board for year/month/week (1..5).
 * Week-group key = Monday YYYY-MM-DD of Mon–Sun payroll week (Asia/Tokyo civil).
 * 第5周 of M and 第1周 of M+1 that share the same Monday are one data group.
 */
export async function getRevenueBoard(
  year: number,
  month: number,
  week: number,
  hallNoFilter: string = '',
  streamerHallNoFilter: string = '',
  overviewHallNoFilter: string = '',
  /**
   * 厅主锁定厅号：即使 overview 厅已锁定，仍返回销售收益，
   * 且介绍人列表按该厅号过滤。Admin 选具体厅时不传（保持 null）。
   */
  salesIntroducerHallNo: string = '',
): Promise<RevenueBoardResult> {
  const selectedHallNo = (hallNoFilter || '').trim()
  const selectedStreamerHallNo = (streamerHallNoFilter || '').trim()
  const selectedOverviewHallNo = (overviewHallNoFilter || '').trim()
  const salesHallOwnerNo = (salesIntroducerHallNo || '').trim()
  const weeks = listMonthWeeks(year, month)
  const selected = weeks.find((w) => w.week === week)

  const emptyBase = (label: string, monday = '', sunday = '', shared: string | null = null): RevenueBoardResult => ({
    period: { year, month, week, label, sharedLabel: shared, monday, sunday },
    range: {
      startDate: monday,
      endDate: sunday,
      startDateLabel: formatChineseDateLabel(monday),
      endDateLabel: formatChineseDateLabel(sunday),
    },
    userTotalFlow: 0,
    userTotalRevenue: 0,
    overviewUserTotalFlow: 0,
    overviewUserTotalRevenue: 0,
    overviewUserHallRevenue: 0,
    streamerTotalFlow: 0,
    streamerTotalRevenue: 0,
    overviewStreamerTotalFlow: 0,
    overviewStreamerTotalRevenue: 0,
    overviewStreamerHallRevenue: 0,
    overviewStreamerTotalWage: 0,
    overviewPayableTotal: 0,
    overviewHalls: [],
    overviewHallNo: selectedOverviewHallNo,
    streamerTotalWage: 0,
    streamerProfit: 0,
    halls: [],
    hallNo: selectedHallNo,
    streamerHalls: [],
    streamerHallNo: selectedStreamerHallNo,
    streamerHallHasEmpty: false,
    streamerSummary: null,
    userSummary: null,
    batches: [],
    empty: true,
    emptyMessage: '该周暂无上传流水',
    salesRevenue: null,
  })

  if (!selected) {
    const empty = emptyBase(periodLabel(year, month, week))
    // admin 全部 OR 厅主（salesHallOwnerNo）→ 返回销售收益
    if (!selectedOverviewHallNo || salesHallOwnerNo) {
      const database = await openDb()
      empty.salesRevenue = buildSalesRevenue(
        database,
        salesHallOwnerNo ? { introducerHallNo: salesHallOwnerNo } : undefined,
      )
    }
    return empty
  }

  const { monday, sunday } = selected
  const label = periodLabel(year, month, week)

  // Shared group: week5 of M ↔ week1 of M+1 (same Monday), and week1 of M ↔ week5 of M-1
  let sharedLabel: string | null = null
  if (week === 5) {
    const nextY = month === 12 ? year + 1 : year
    const nextM = month === 12 ? 1 : month + 1
    const nextWeeks = listMonthWeeks(nextY, nextM)
    const w1 = nextWeeks.find((w) => w.week === 1)
    if (w1 && w1.monday === monday) sharedLabel = periodLabel(nextY, nextM, 1)
  } else if (week === 1) {
    const prevY = month === 1 ? year - 1 : year
    const prevM = month === 1 ? 12 : month - 1
    const prevWeeks = listMonthWeeks(prevY, prevM)
    const w5 = prevWeeks.find((w) => w.week === 5)
    if (w5 && w5.monday === monday) sharedLabel = periodLabel(prevY, prevM, 5)
  }

  const database = await openDb()
  migrateLiushui(database)
  // 销售收益：admin 全部，或厅主锁定厅（介绍人按厅过滤）；admin 选具体厅仍为 null
  const salesRevenue =
    !selectedOverviewHallNo
      ? buildSalesRevenue(database)
      : salesHallOwnerNo
        ? buildSalesRevenue(database, { introducerHallNo: salesHallOwnerNo })
        : null

  const batchRows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
    kind: string | null
    person_count: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches ORDER BY uploaded_at DESC`,
    [],
  )
  const batches = batchRows.map(rowToLiushuiBatch)

  const matching = batches.filter((b) => {
    const bm = batchWeekMonday(b)
    if (bm && bm === monday) return true
    if (b.startDate && b.endDate && rangesOverlap(b.startDate, b.endDate, monday, sunday)) return true
    return false
  })

  const streamerMatches = matching.filter((b) => b.kind === 'streamer')
  const userMatches = matching.filter((b) => b.kind === 'user')
  const streamerBatch = pickNewestBatch(streamerMatches)
  const userBatch = pickNewestBatch(userMatches)

  const used: LiushuiBatch[] = []
  if (streamerBatch) used.push(streamerBatch)
  if (userBatch) used.push(userBatch)

  if (!used.length) {
    const empty = emptyBase(label, monday, sunday, sharedLabel)
    empty.salesRevenue = salesRevenue
    return empty
  }

  const batchInfos: RevenueBoardBatchInfo[] = used.map((b) => ({
    id: b.id,
    kind: b.kind,
    label: b.label,
    filename: b.filename,
    startDate: b.startDate,
    endDate: b.endDate,
    startDateLabel: formatChineseDateLabel(b.startDate),
    endDateLabel: formatChineseDateLabel(b.endDate),
    rowCount: b.rowCount,
    personCount: b.personCount,
    uploadedAt: b.uploadedAt,
  }))

  // Profile 所属厅号 map (streamerId + linked IDs) — NOT Excel 靓号厅ID
  migrateStreamer(database)
  const hallNoByStreamerId = buildHallNoByStreamerIdFromDb(database)
  const hallIncomeRates = buildHallIncomeRatesByHallNo(database)
  const guildRates = await getGuildPointRates()

  let streamerSummary: RevenueBoardStreamerSummary | null = null
  let streamerTotalFlow = 0
  let streamerTotalWage = 0
  let overviewStreamerTotalFlow = 0
  let overviewStreamerTotalWage = 0
  let streamerHalls: string[] = []
  let streamerHallHasEmpty = false
  if (streamerBatch) {
    const rows = all<{
      user_platform_id: string
      nickname: string
      total_flow_amount: number | null
      add_flow_yuan: number | null
      deduct_flow_yuan: number | null
      total_wage: number | null
    }>(
      database,
      `SELECT user_platform_id, nickname, total_flow_amount, add_flow_yuan, deduct_flow_yuan, total_wage
       FROM liushui_rows WHERE batch_id = ?`,
      [streamerBatch.id],
    )
    /** 合并流水 = 总流水 + 添加流水 - 扣除流水 (same as payroll mergedFlow / 实际流水). */
    const rowMergedFlow = (r: {
      total_flow_amount: number | null
      add_flow_yuan: number | null
      deduct_flow_yuan: number | null
    }): number => {
      const total = nullableNum(r.total_flow_amount) ?? 0
      const add = nullableNum(r.add_flow_yuan) ?? 0
      const deduct = nullableNum(r.deduct_flow_yuan) ?? 0
      return roundMoney(total + add - deduct)
    }
    const hallSet = new Set<string>()
    let hasEmpty = false
    for (const r of rows) {
      const id = (r.user_platform_id || '').trim()
      const h = id ? (hallNoByStreamerId[id] || '').trim() : ''
      if (h) hallSet.add(h)
      else hasEmpty = true
    }
    streamerHalls = [...hallSet].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    streamerHallHasEmpty = hasEmpty

    const filtered = selectedStreamerHallNo
      ? rows.filter((r) => {
          const id = (r.user_platform_id || '').trim()
          const h = id ? (hallNoByStreamerId[id] || '').trim() : ''
          if (selectedStreamerHallNo === STREAMER_HALL_EMPTY) return !h
          return h === selectedStreamerHallNo
        })
      : rows

    const overviewStreamerRows = selectedOverviewHallNo
      ? rows.filter((r) => {
          const id = (r.user_platform_id || '').trim()
          const h = id ? (hallNoByStreamerId[id] || '').trim() : ''
          // Rows with no hall do NOT match a specific hall filter
          return h === selectedOverviewHallNo
        })
      : rows
    for (const r of overviewStreamerRows) {
      overviewStreamerTotalFlow += rowMergedFlow(r)
      const tw = nullableNum(r.total_wage)
      overviewStreamerTotalWage += tw != null ? tw : 0
    }
    overviewStreamerTotalFlow = roundMoney(overviewStreamerTotalFlow)
    overviewStreamerTotalWage = roundMoney(overviewStreamerTotalWage)

    let totalFlow = 0
    let actualFlow = 0
    let totalWage = 0
    const tops: RevenueBoardTopStreamer[] = []
    for (const r of filtered) {
      const merged = rowMergedFlow(r)
      const tw = nullableNum(r.total_wage)
      totalFlow += merged
      actualFlow += merged
      // null wage counts as 0 toward 主播总工资
      totalWage += tw != null ? tw : 0
      tops.push({
        nickname: (r.nickname || '').trim() || '—',
        userPlatformId: (r.user_platform_id || '').trim(),
        // totalFlow / actualFlow both carry 合并流水 for 流水 Top rank + display
        totalFlow: merged,
        actualFlow: merged,
        totalWage: tw,
      })
    }
    totalFlow = roundMoney(totalFlow)
    totalWage = roundMoney(totalWage)
    actualFlow = roundMoney(actualFlow)
    tops.sort((a, b) => {
      const av = a.totalFlow != null ? a.totalFlow : a.actualFlow != null ? a.actualFlow : -Infinity
      const bv = b.totalFlow != null ? b.totalFlow : b.actualFlow != null ? b.actualFlow : -Infinity
      return bv - av
    })
    streamerTotalFlow = totalFlow
    streamerTotalWage = totalWage
    streamerSummary = {
      totalFlow,
      actualFlow,
      totalWage,
      rowCount: filtered.length,
      personCount: selectedStreamerHallNo
        ? filtered.length
        : streamerBatch.personCount || rows.length,
      topStreamers: tops.slice(0, 10),
    }
  }
  // 厅收益：主播流水 × 厅点位（per-hall from 厅主 profile; default 0.53）
  let overviewStreamerHallRevenue = 0
  if (streamerBatch) {
    const rows = all<{
      user_platform_id: string
      total_flow_amount: number | null
      add_flow_yuan: number | null
      deduct_flow_yuan: number | null
    }>(
      database,
      `SELECT user_platform_id, total_flow_amount, add_flow_yuan, deduct_flow_yuan
       FROM liushui_rows WHERE batch_id = ?`,
      [streamerBatch.id],
    )
    const overviewStreamerRows = selectedOverviewHallNo
      ? rows.filter((r) => {
          const id = (r.user_platform_id || '').trim()
          const h = id ? (hallNoByStreamerId[id] || '').trim() : ''
          return h === selectedOverviewHallNo
        })
      : rows
    for (const r of overviewStreamerRows) {
      const id = (r.user_platform_id || '').trim()
      const h = id ? (hallNoByStreamerId[id] || '').trim() : ''
      const rate = ratesForHall(hallIncomeRates, h || selectedOverviewHallNo).hallPointRate
      const total = nullableNum(r.total_flow_amount) ?? 0
      const add = nullableNum(r.add_flow_yuan) ?? 0
      const deduct = nullableNum(r.deduct_flow_yuan) ?? 0
      overviewStreamerHallRevenue += (total + add - deduct) * rate
    }
    overviewStreamerHallRevenue = roundMoney(overviewStreamerHallRevenue)
  } else if (selectedOverviewHallNo) {
    const rate = ratesForHall(hallIncomeRates, selectedOverviewHallNo).hallPointRate
    overviewStreamerHallRevenue = roundMoney(overviewStreamerTotalFlow * rate)
  } else {
    overviewStreamerHallRevenue = roundMoney(overviewStreamerTotalFlow * DEFAULT_HALL_POINT_RATE)
  }
  const streamerHallRate = ratesForHall(
    hallIncomeRates,
    selectedStreamerHallNo && selectedStreamerHallNo !== STREAMER_HALL_EMPTY
      ? selectedStreamerHallNo
      : selectedOverviewHallNo,
  ).hallPointRate
  const streamerTotalRevenue = roundMoney(streamerTotalFlow * streamerHallRate)
  // 主播流水总收益 (guild): 主播总流水 × 工会主播点位 (default 0.558; was 0.6×0.93)
  const overviewStreamerTotalRevenue = roundMoney(
    overviewStreamerTotalFlow * guildRates.streamerPointRate,
  )
  const streamerProfit = roundMoney(streamerTotalRevenue - streamerTotalWage)

  let userSummary: RevenueBoardUserSummary | null = null
  let userTotalFlow = 0
  let overviewUserTotalFlow = 0
  let halls: string[] = []
  if (userBatch) {
    const rows = all<{
      user_platform_id: string
      nickname: string
      total_flow_amount: number | null
      total_flow_cents: number | null
      hall_no: string | null
    }>(
      database,
      `SELECT user_platform_id, nickname, total_flow_amount, total_flow_cents, hall_no
       FROM liushui_rows WHERE batch_id = ?`,
      [userBatch.id],
    )
    const hallSet = new Set<string>()
    for (const r of rows) {
      const h = (r.hall_no || '').trim()
      if (h) hallSet.add(h)
    }
    halls = [...hallSet].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))

    const filtered = selectedHallNo
      ? rows.filter((r) => (r.hall_no || '').trim() === selectedHallNo)
      : rows

    const overviewUserRows = selectedOverviewHallNo
      ? rows.filter((r) => (r.hall_no || '').trim() === selectedOverviewHallNo)
      : rows
    for (const r of overviewUserRows) {
      const tf = nullableNum(r.total_flow_amount)
      const cents = nullableNum(r.total_flow_cents)
      const flow = tf != null ? tf : cents != null ? cents / 100 : null
      if (flow != null) overviewUserTotalFlow += flow
    }
    overviewUserTotalFlow = roundMoney(overviewUserTotalFlow)

    let totalFlow = 0
    const tops: RevenueBoardTopUser[] = []
    for (const r of filtered) {
      const tf = nullableNum(r.total_flow_amount)
      const cents = nullableNum(r.total_flow_cents)
      const flow = tf != null ? tf : cents != null ? cents / 100 : null
      if (flow != null) totalFlow += flow
      tops.push({
        userPlatformId: (r.user_platform_id || '').trim(),
        nickname: (r.nickname || '').trim() || '—',
        totalFlow: flow,
      })
    }
    totalFlow = roundMoney(totalFlow)
    userTotalFlow = totalFlow
    tops.sort((a, b) => (b.totalFlow ?? -Infinity) - (a.totalFlow ?? -Infinity))
    userSummary = {
      totalFlow,
      rowCount: filtered.length,
      personCount: selectedHallNo ? filtered.length : userBatch.personCount || rows.length,
      topUsers: tops.slice(0, 10),
    }
  }
  // 用户流水厅收益：用户流水 × 用户流水点位（per-hall; default 0.74）
  let overviewUserHallRevenue = 0
  if (userBatch) {
    const rows = all<{
      total_flow_amount: number | null
      total_flow_cents: number | null
      hall_no: string | null
    }>(
      database,
      `SELECT total_flow_amount, total_flow_cents, hall_no
       FROM liushui_rows WHERE batch_id = ?`,
      [userBatch.id],
    )
    const overviewUserRows = selectedOverviewHallNo
      ? rows.filter((r) => (r.hall_no || '').trim() === selectedOverviewHallNo)
      : rows
    for (const r of overviewUserRows) {
      const tf = nullableNum(r.total_flow_amount)
      const cents = nullableNum(r.total_flow_cents)
      const flow = tf != null ? tf : cents != null ? cents / 100 : null
      if (flow == null) continue
      const h = (r.hall_no || '').trim()
      const rate = ratesForHall(hallIncomeRates, h || selectedOverviewHallNo).userFlowPointRate
      overviewUserHallRevenue += flow * rate
    }
    overviewUserHallRevenue = roundMoney(overviewUserHallRevenue)
  } else if (selectedOverviewHallNo) {
    const rate = ratesForHall(hallIncomeRates, selectedOverviewHallNo).userFlowPointRate
    overviewUserHallRevenue = roundMoney(overviewUserTotalFlow * rate)
  } else {
    overviewUserHallRevenue = roundMoney(overviewUserTotalFlow * DEFAULT_USER_FLOW_POINT_RATE)
  }
  const userHallRate = ratesForHall(hallIncomeRates, selectedHallNo || selectedOverviewHallNo).userFlowPointRate
  const userTotalRevenue = roundMoney(userTotalFlow * userHallRate)
  // 用户流水总收益 (guild): 用户总流水 × 工会用户流水点位 (default 0.93)
  const overviewUserTotalRevenue = roundMoney(overviewUserTotalFlow * guildRates.userFlowPointRate)
  const overviewPayableTotal = roundMoney(overviewStreamerTotalRevenue + overviewUserTotalRevenue)

  // 厅总收款 = 主播流水厅收益 + 用户流水厅收益 (= 主播流水×厅点位 + 用户流水×用户流水点位)
  const overviewHallTotalReceipts = roundMoney(overviewStreamerHallRevenue + overviewUserHallRevenue)
  const overviewHallTotalExpense = overviewStreamerTotalWage
  const overviewHallProfit = roundMoney(overviewHallTotalReceipts - overviewHallTotalExpense)

  // 工会收款 / 工会收入 = Σ主播流水×工会主播点位 + Σ用户流水×工会用户流水点位
  const overviewGuildReceipts = roundMoney(
    overviewStreamerTotalFlow * guildRates.streamerPointRate +
      overviewUserTotalFlow * guildRates.userFlowPointRate,
  )
  const overviewGuildRevenue = overviewGuildReceipts
  const overviewGuildProfit = roundMoney(overviewGuildReceipts - overviewHallTotalReceipts)

  const overviewHalls = [...new Set([...halls, ...streamerHalls])].sort((a, b) =>
    a.localeCompare(b, 'zh-CN', { numeric: true }),
  )

  return {
    period: { year, month, week, label, sharedLabel, monday, sunday },
    range: {
      startDate: monday,
      endDate: sunday,
      startDateLabel: formatChineseDateLabel(monday),
      endDateLabel: formatChineseDateLabel(sunday),
    },
    userTotalFlow,
    userTotalRevenue,
    overviewUserTotalFlow,
    overviewUserTotalRevenue,
    overviewUserHallRevenue,
    streamerTotalFlow,
    streamerTotalRevenue,
    overviewStreamerTotalFlow,
    overviewStreamerTotalRevenue,
    overviewStreamerHallRevenue,
    overviewStreamerTotalWage,
    overviewPayableTotal,
    overviewHallTotalReceipts,
    overviewHallTotalExpense,
    overviewHallProfit,
    overviewGuildReceipts,
    overviewGuildRevenue,
    overviewGuildProfit,
    guildPointRates: guildRates,
    overviewHalls,
    overviewHallNo: selectedOverviewHallNo,
    streamerTotalWage,
    streamerProfit,
    halls,
    hallNo: selectedHallNo,
    streamerHalls,
    streamerHallNo: selectedStreamerHallNo,
    streamerHallHasEmpty,
    streamerSummary,
    userSummary,
    batches: batchInfos,
    empty: !streamerSummary && !userSummary,
    emptyMessage: !streamerSummary && !userSummary ? '该周暂无上传流水' : null,
    salesRevenue,
  }
}

export type LastWeekRankingRow = {
  rank: number
  nickname: string
  userPlatformId: string
  /** True when this account must not appear in 魅力榜 (admin / 全满 / 大哥). */
  excludeFromCharm: boolean
  hostHours: number | null
  micHours: number | null
  totalHours: number
  totalFlow: number | null
}

export type LastWeekRankingsResult = {
  ok: true
  range: {
    startDate: string
    endDate: string
    startDateLabel: string
    endDateLabel: string
  } | null
  batchId: string | null
  rows: LastWeekRankingRow[]
  empty: boolean
  /** True when falling back to newest streamer batch (not calendar last week). */
  fallbackNewest: boolean
}

/**
 * Public last-week streamer rankings from newest matching 主播流水 batch.
 * Prefer calendar previous Mon–Sun (Asia/Tokyo); else newest streamer batch.
 */
export async function getLastWeekRankings(): Promise<LastWeekRankingsResult> {
  const database = await openDb()
  migrateLiushui(database)
  migrateStreamer(database)

  const today = tokyoYmd(Date.now())
  const thisMonday = mondayOfYmd(today)
  const prevMonday = thisMonday ? addDaysYmd(thisMonday, -7) : ''
  const prevSunday = prevMonday ? addDaysYmd(prevMonday, 6) : ''

  const batchRows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
    kind: string | null
    person_count: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches
     WHERE COALESCE(kind, 'streamer') = 'streamer'
     ORDER BY uploaded_at DESC`,
    [],
  )
  const batches = batchRows.map(rowToLiushuiBatch)

  let picked = null as (typeof batches)[0] | null
  let fallbackNewest = false

  if (prevMonday && prevSunday) {
    const matching = batches.filter((b) => {
      const bm = batchWeekMonday(b)
      if (bm && bm === prevMonday) return true
      if (b.startDate && b.endDate && rangesOverlap(b.startDate, b.endDate, prevMonday, prevSunday)) {
        return true
      }
      return false
    })
    picked = pickNewestBatch(matching)
  }

  if (!picked) {
    picked = pickNewestBatch(batches)
    fallbackNewest = !!picked
  }

  if (!picked) {
    return {
      ok: true,
      range: null,
      batchId: null,
      rows: [],
      empty: true,
      fallbackNewest: false,
    }
  }

  const startDate = picked.startDate || prevMonday || ''
  const endDate = picked.endDate || prevSunday || ''
  const range = {
    startDate,
    endDate,
    startDateLabel: formatChineseDateLabel(startDate),
    endDateLabel: formatChineseDateLabel(endDate),
  }

  const rowRows = all<{
    user_platform_id: string
    nickname: string
    point_rate: string | null
    total_flow_amount: number | null
    total_flow_cents: number | null
    host_hours: number | null
    mic_hours: number | null
  }>(
    database,
    `SELECT user_platform_id, nickname, point_rate, total_flow_amount, total_flow_cents, host_hours, mic_hours
     FROM liushui_rows
     WHERE batch_id = ?
     ORDER BY rowid ASC`,
    [picked.id],
  )

  // A streamer row can use a linked Excel ID, so resolve profile identity by
  // primary and linked IDs before deciding whether it is an admin, 全满, or 大哥 account.
  const profileIdentityRows = all<{
    username: string | null
    streamer_id: string | null
    point_rate: string | null
    linked_id_1: string | null
    linked_id_2: string | null
    linked_id_3: string | null
  }>(
    database,
    `SELECT u.username, sp.streamer_id, sp.point_rate, sp.linked_id_1, sp.linked_id_2, sp.linked_id_3
     FROM streamer_profiles sp
     LEFT JOIN users u ON u.id = sp.user_id`,
    [],
  )
  const profileIdentityById = new Map<string, { pointRate: string; isAdminName: boolean }>()
  const isExcludedCharmPointRate = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text === '全满' || text === '大哥' || /[（(]\s*(?:全满|大哥)\s*[）)]/u.test(text)
  }
  for (const profile of profileIdentityRows) {
    const identity = {
      pointRate: typeof profile.point_rate === 'string' ? profile.point_rate.trim() : '',
      isAdminName: isAdminUsername(typeof profile.username === 'string' ? profile.username : ''),
    }
    for (const rawId of [profile.streamer_id, profile.linked_id_1, profile.linked_id_2, profile.linked_id_3]) {
      const id = typeof rawId === 'string' ? rawId.trim() : ''
      if (id && !profileIdentityById.has(id)) profileIdentityById.set(id, identity)
    }
  }

  const mapped = rowRows.map((r) => {
    const nickname = String(r.nickname || '').trim() || '—'
    const rowPointRate = typeof r.point_rate === 'string' ? r.point_rate.trim() : ''
    const profileIdentity = profileIdentityById.get(String(r.user_platform_id || '').trim())
    const excludeFromCharm = Boolean(
      profileIdentity?.isAdminName ||
        isAdminUsername(nickname) ||
        isExcludedCharmPointRate(rowPointRate) ||
        isExcludedCharmPointRate(profileIdentity?.pointRate),
    )
    const hostHours = nullableNum(r.host_hours)
    const micHours = nullableNum(r.mic_hours)
    const totalHours = (hostHours ?? 0) + (micHours ?? 0)
    const amount = nullableNum(r.total_flow_amount)
    const cents = nullableNum(r.total_flow_cents)
    let totalFlow: number | null = null
    if (amount != null) totalFlow = amount
    else if (cents != null) totalFlow = cents / 100
    if (totalFlow != null && Number.isFinite(totalFlow)) totalFlow = roundMoney(totalFlow)
    else totalFlow = null
    return {
      nickname,
      userPlatformId: String(r.user_platform_id || '').trim(),
      excludeFromCharm,
      hostHours,
      micHours,
      totalHours,
      totalFlow,
    }
  })

  // Default order by totalHours desc for stable ranks in response; client re-sorts for tabs.
  mapped.sort((a, b) => {
    if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours
    const af = a.totalFlow ?? -Infinity
    const bf = b.totalFlow ?? -Infinity
    if (bf !== af) return bf - af
    return a.userPlatformId.localeCompare(b.userPlatformId)
  })

  const rows: LastWeekRankingRow[] = mapped.map((r, i) => ({
    rank: i + 1,
    nickname: r.nickname,
    userPlatformId: r.userPlatformId,
    excludeFromCharm: r.excludeFromCharm,
    hostHours: r.hostHours,
    micHours: r.micHours,
    totalHours: r.totalHours,
    totalFlow: r.totalFlow,
  }))

  return {
    ok: true,
    range,
    batchId: picked.id,
    rows,
    empty: rows.length === 0,
    fallbackNewest,
  }
}


export type HallOwnerWageResult = {
  hallNo: string
  hallPayMode: HallPayMode
  /** 该厅用户总流水 (overviewUserTotalFlow) */
  hallUserFlow: number
  /** 该厅主持/主播总流水 (overviewStreamerTotalFlow) */
  hallStreamerFlow: number
  /** 该厅主持总工资 — sum of streamer totalWage for hall, excluding 厅主 own IDs */
  hallStreamerWageTotal: number
  /** overviewUserHallRevenue + overviewStreamerHallRevenue */
  hallRevenue: number
  /**
   * union: hallRevenue − hallStreamerWageTotal
   * self: hallRevenue
   */
  totalWage: number
}

/**
 * Shared 厅主 wage for 我的工资 + 工资发放.
 * Uses same getRevenueBoard hall filters / formulas as today.
 */
export async function computeHallOwnerWage(
  year: number,
  month: number,
  week: number,
  profile: {
    hallNo: string
    streamerId?: string | null
    linkedId1?: string | null
    linkedId2?: string | null
    linkedId3?: string | null
    hallPayMode?: HallPayMode | string | null
  },
): Promise<HallOwnerWageResult | null> {
  const hallNo = String(profile.hallNo || '').trim()
  if (!hallNo) return null
  const hallPayMode = normalizeHallPayMode(profile.hallPayMode)

  const board = await getRevenueBoard(year, month, week, hallNo, hallNo, hallNo)
  const hallUserFlow = roundMoney(board.overviewUserTotalFlow || 0)
  const hallStreamerFlow = roundMoney(board.overviewStreamerTotalFlow || 0)
  const hallRevenue = roundMoney(
    (board.overviewUserHallRevenue || 0) + (board.overviewStreamerHallRevenue || 0),
  )

  const ownerIds = new Set(
    collectNonEmptyIds(
      profile.streamerId,
      profile.linkedId1,
      profile.linkedId2,
      profile.linkedId3,
    ),
  )

  const database = await openDb()
  migrateStreamer(database)
  migrateLiushui(database)

  const monday = board.period.monday || ''
  const sunday = board.period.sunday || ''

  let hallStreamerWageTotal = 0
  if (monday) {
    const batchRows = all<{
      id: string
      start_date: string
      end_date: string
      uploaded_at: number
      kind: string | null
    }>(
      database,
      `SELECT id, start_date, end_date, uploaded_at, kind
       FROM liushui_batches
       WHERE COALESCE(kind, 'streamer') = 'streamer'
       ORDER BY uploaded_at DESC`,
      [],
    )
    const matching = batchRows.filter((r) => {
      const startDate = typeof r.start_date === 'string' ? r.start_date : ''
      const endDate = typeof r.end_date === 'string' ? r.end_date : ''
      const bm = batchWeekMonday({ startDate, endDate })
      if (bm && bm === monday) return true
      if (startDate && endDate && sunday && rangesOverlap(startDate, endDate, monday, sunday)) {
        return true
      }
      return false
    })
    const streamerBatch = pickNewestBatch(
      matching.map((r) => ({
        id: r.id,
        uploadedAt: Number(r.uploaded_at) || 0,
      })),
    )

    if (streamerBatch) {
      const hallNoByPlatform = buildHallNoByStreamerIdFromDb(database)
      const wageRows = all<{
        user_platform_id: string
        total_wage: number | null
      }>(
        database,
        `SELECT user_platform_id, total_wage FROM liushui_rows WHERE batch_id = ?`,
        [streamerBatch.id],
      )
      for (const r of wageRows) {
        const sid = String(r.user_platform_id || '').trim()
        if (!sid || ownerIds.has(sid)) continue
        const h = (hallNoByPlatform[sid] || '').trim()
        if (h !== hallNo) continue
        const tw = nullableNum(r.total_wage)
        hallStreamerWageTotal += tw != null && Number.isFinite(tw) ? tw : 0
      }
    }
  }
  hallStreamerWageTotal = roundMoney(hallStreamerWageTotal)

  const totalWage =
    hallPayMode === 'self'
      ? hallRevenue
      : roundMoney(hallRevenue - hallStreamerWageTotal)

  return {
    hallNo,
    hallPayMode,
    hallUserFlow,
    hallStreamerFlow,
    hallStreamerWageTotal,
    hallRevenue,
    totalWage,
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
  /** 厅主 row markers / 明细 */
  isHallOwner?: boolean
  hallNo?: string | null
  hallPayMode?: HallPayMode | null
  hallUserFlow?: number | null
  hallStreamerFlow?: number | null
  hallStreamerWageTotal?: number | null
}

export type PayrollBoardResult = {
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
  /** Sum of totalWage where paid===true (null wage → 0). */
  paidTotal: number
  /** Sum of totalWage where paid===false (null wage → 0). */
  unpaidTotal: number
  /** Revenue board 流水总览 overviewPayableTotal (all halls). */
  payableTotal: number
  /** payableTotal − paidTotal. */
  weekBalance: number
}

type PayrollProfileHit = {
  userId: string
  name: string
  streamerId: string
  payQrPath: string
  exact: boolean
}

/** Build platform-id → profile map; exact streamer_id wins over linked_id matches. */
function buildPayrollProfileIndex(database: Database): Map<string, PayrollProfileHit> {
  const rows = all<{
    user_id: string
    name: string
    streamer_id: string
    linked_id_1: string | null
    linked_id_2: string | null
    linked_id_3: string | null
    pay_qr_path: string | null
  }>(
    database,
    `SELECT user_id, name, streamer_id, linked_id_1, linked_id_2, linked_id_3, pay_qr_path
     FROM streamer_profiles`,
    [],
  )
  const map = new Map<string, PayrollProfileHit>()
  for (const r of rows) {
    const streamerId = String(r.streamer_id || '').trim()
    if (!streamerId) continue
    const hit: PayrollProfileHit = {
      userId: String(r.user_id || '').trim(),
      name: String(r.name || '').trim(),
      streamerId,
      payQrPath: String(r.pay_qr_path || '').trim(),
      exact: true,
    }
    const existing = map.get(streamerId)
    if (!existing || !existing.exact) map.set(streamerId, hit)
  }
  for (const r of rows) {
    const streamerId = String(r.streamer_id || '').trim()
    if (!streamerId) continue
    const hit: PayrollProfileHit = {
      userId: String(r.user_id || '').trim(),
      name: String(r.name || '').trim(),
      streamerId,
      payQrPath: String(r.pay_qr_path || '').trim(),
      exact: false,
    }
    for (const raw of [r.linked_id_1, r.linked_id_2, r.linked_id_3]) {
      const id = String(raw || '').trim()
      if (!id || id === streamerId) continue
      const existing = map.get(id)
      if (!existing) map.set(id, hit)
      // keep exact match if already present
    }
  }
  return map
}

/**
 * Admin payroll board for year/month/week (1..5).
 * Resolves the newest streamer-kind batch for that calendar week (same matching
 * rules as getRevenueBoard streamer batch), then loads payroll rows.
 * Pay QR only returned here (admin-only); never on public list APIs.
 */
export async function getPayrollBoard(
  year: number,
  month: number,
  week: number,
  /**
   * When set (厅管): only include rows for this hall + hall-owner row for this hall.
   * null/'' = full board (admin/全满).
   */
  hallScope: string | null = null,
): Promise<PayrollBoardResult> {
  const weeks = listMonthWeeks(year, month)
  const selected = weeks.find((w) => w.week === week)

  const emptyBase = (
    label: string,
    monday = '',
    sunday = '',
    shared: string | null = null,
    emptyMessage = '该周暂无主播流水',
  ): PayrollBoardResult => ({
    period: { year, month, week, label, sharedLabel: shared, monday, sunday },
    range: {
      startDate: monday,
      endDate: sunday,
      startDateLabel: formatChineseDateLabel(monday),
      endDateLabel: formatChineseDateLabel(sunday),
    },
    selectedBatchId: null,
    rows: [],
    empty: true,
    emptyMessage,
    paidTotal: 0,
    unpaidTotal: 0,
    payableTotal: 0,
    weekBalance: 0,
  })

  if (!selected) {
    return emptyBase(periodLabel(year, month, week))
  }

  const { monday, sunday } = selected
  const label = periodLabel(year, month, week)

  // Shared group: week5 of M ↔ week1 of M+1 (same Monday), and week1 of M ↔ week5 of M-1
  let sharedLabel: string | null = null
  if (week === 5) {
    const nextY = month === 12 ? year + 1 : year
    const nextM = month === 12 ? 1 : month + 1
    const nextWeeks = listMonthWeeks(nextY, nextM)
    const w1 = nextWeeks.find((w) => w.week === 1)
    if (w1 && w1.monday === monday) sharedLabel = periodLabel(nextY, nextM, 1)
  } else if (week === 1) {
    const prevY = month === 1 ? year - 1 : year
    const prevM = month === 1 ? 12 : month - 1
    const prevWeeks = listMonthWeeks(prevY, prevM)
    const w5 = prevWeeks.find((w) => w.week === 5)
    if (w5 && w5.monday === monday) sharedLabel = periodLabel(prevY, prevM, 5)
  }

  const database = await openDb()
  migrateStreamer(database)
  migrateLiushui(database)
  migrateSalaryConfirmations(database)
  migrateSalaryPayments(database)

  const batchRows = all<{
    id: string
    label: string
    filename: string
    row_count: number
    uploaded_at: number
    uploaded_by: string
    start_date: string
    end_date: string
    host_wage_per_hour: number | null
    kind: string | null
    person_count: number | null
  }>(
    database,
    `SELECT id, label, filename, row_count, uploaded_at, uploaded_by, start_date, end_date, host_wage_per_hour, kind, person_count
     FROM liushui_batches ORDER BY uploaded_at DESC`,
    [],
  )
  const batches = batchRows.map(rowToLiushuiBatch)

  const matching = batches.filter((b) => {
    const bm = batchWeekMonday(b)
    if (bm && bm === monday) return true
    if (b.startDate && b.endDate && rangesOverlap(b.startDate, b.endDate, monday, sunday)) return true
    return false
  })

  const streamerMatches = matching.filter((b) => b.kind === 'streamer')
  const streamerBatch = pickNewestBatch(streamerMatches)

  if (!streamerBatch) {
    const empty = emptyBase(label, monday, sunday, sharedLabel)
    try {
      const revenue = await getRevenueBoard(year, month, week, '', '', '')
      const payableTotal = roundMoney(revenue.overviewPayableTotal || 0)
      empty.payableTotal = payableTotal
      empty.weekBalance = payableTotal
    } catch {
      /* keep zeros */
    }
    return empty
  }

  const selectedBatchId = streamerBatch.id
  const profileIndex = buildPayrollProfileIndex(database)

  const liushuiRows = all<{
    id: string
    user_platform_id: string
    nickname: string
    total_flow_amount: number | null
    add_flow_yuan: number | null
    deduct_flow_yuan: number | null
    total_wage: number | null
  }>(
    database,
    `SELECT id, user_platform_id, nickname, total_flow_amount, add_flow_yuan, deduct_flow_yuan, total_wage
     FROM liushui_rows
     WHERE batch_id = ?
     ORDER BY rowid ASC`,
    [selectedBatchId],
  )

  const confRows = all<{ user_id: string; confirmed_at: string }>(
    database,
    `SELECT user_id, confirmed_at FROM salary_confirmations WHERE batch_id = ?`,
    [selectedBatchId],
  )
  const confByUser = new Map(
    confRows.map((c) => [String(c.user_id), String(c.confirmed_at || '')]),
  )

  const payRows = all<{
    user_platform_id: string
    paid_at: string
    paid_wage: number | null
    paid_snapshot: string | null
  }>(
    database,
    `SELECT user_platform_id, paid_at, paid_wage, paid_snapshot FROM salary_payments WHERE batch_id = ?`,
    [selectedBatchId],
  )
  const payByPlatform = new Map<string, SalaryPayHit>(
    payRows.map((p) => [
      String(p.user_platform_id).trim(),
      {
        paidAt: String(p.paid_at || ''),
        paidWage: nullableNum(p.paid_wage),
        paidSnapshot: parseHallPaidSnapshot(p.paid_snapshot),
      },
    ]),
  )

  const rows: PayrollBoardRow[] = liushuiRows.map((r) => {
    const streamerId = String(r.user_platform_id || '').trim()
    const profile = streamerId ? profileIndex.get(streamerId) : undefined
    const profileName = profile?.name || null
    const nicknameRaw = String(r.nickname || '').trim()
    const nickname = profileName || nicknameRaw || '—'
    const totalFlow = nullableNum(r.total_flow_amount) ?? 0
    const addFlow = nullableNum(r.add_flow_yuan) ?? 0
    const deductFlow = nullableNum(r.deduct_flow_yuan) ?? 0
    const mergedFlow = roundMoney(totalFlow + addFlow - deductFlow)
    let totalWage = nullableNum(r.total_wage)
    const confirmedAt = profile?.userId ? confByUser.get(profile.userId) || null : null
    const confirmed = !!(confirmedAt && confirmedAt.length)
    const payHit = streamerId ? payByPlatform.get(streamerId) : undefined
    const paidAt = payHit?.paidAt || null
    const paid = !!(paidAt && paidAt.length)
    // Paid rows with snapshot: freeze 总工资 (null paid_wage = legacy → live wage)
    if (paid && payHit?.paidWage != null && Number.isFinite(payHit.paidWage)) {
      totalWage = payHit.paidWage
    }
    const payPath = profile?.payQrPath || ''
    const payQrUrl = payPath ? photoPublicUrl(payPath) : null
    return {
      rowId: String(r.id),
      nickname,
      streamerId,
      mergedFlow,
      totalWage,
      confirmed,
      confirmedAt,
      paid,
      paidAt,
      payQrUrl,
      profileName,
    }
  })

  // 厅主 rows: 总工资 = computeHallOwnerWage (同 我的工资 / hall_pay_mode)
  const hallOwners = all<{
    user_id: string
    name: string
    streamer_id: string
    hall_no: string
    hall_pay_mode: string | null
    pay_qr_path: string | null
    linked_id_1: string | null
    linked_id_2: string | null
    linked_id_3: string | null
    username: string | null
  }>(
    database,
    `SELECT sp.user_id AS user_id, sp.name AS name, sp.streamer_id AS streamer_id,
            sp.hall_no AS hall_no, sp.hall_pay_mode AS hall_pay_mode, sp.pay_qr_path AS pay_qr_path,
            sp.linked_id_1 AS linked_id_1, sp.linked_id_2 AS linked_id_2, sp.linked_id_3 AS linked_id_3,
            u.username AS username
     FROM streamer_profiles sp
     LEFT JOIN users u ON u.id = sp.user_id
     WHERE COALESCE(sp.is_hall_owner, 0) = 1`,
    [],
  )

  const mergedOwnerRowIndexes = new Set<number>()

  for (const owner of hallOwners) {
    const hallNo = String(owner.hall_no || '').trim()
    if (!hallNo) continue // 厅主 without hall_no: skip

    const ownerStreamerId = String(owner.streamer_id || '').trim()
    const ownerIds = new Set(
      collectNonEmptyIds(
        ownerStreamerId,
        owner.linked_id_1,
        owner.linked_id_2,
        owner.linked_id_3,
      ),
    )

    const hw = await computeHallOwnerWage(year, month, week, {
      hallNo,
      streamerId: ownerStreamerId,
      linkedId1: owner.linked_id_1,
      linkedId2: owner.linked_id_2,
      linkedId3: owner.linked_id_3,
      hallPayMode: owner.hall_pay_mode,
    })
    if (!hw) continue

    const profileName = String(owner.name || '').trim() || null
    const username = String(owner.username || '').trim()
    const displayName = profileName || username || ownerStreamerId || '—'
    const payPath = String(owner.pay_qr_path || '').trim()
    const payQrUrl = payPath ? photoPublicUrl(payPath) : null
    const userId = String(owner.user_id || '').trim()
    const confirmedAt = userId ? confByUser.get(userId) || null : null
    const confirmed = !!(confirmedAt && confirmedAt.length)

    // Prefer pay status keyed by primary streamerId; fall back to any owner alias already paid
    let payHit: SalaryPayHit | undefined
    if (ownerStreamerId && payByPlatform.has(ownerStreamerId)) {
      payHit = payByPlatform.get(ownerStreamerId)
    } else {
      for (const id of ownerIds) {
        const p = payByPlatform.get(id)
        if (p) {
          payHit = p
          break
        }
      }
    }
    const paidAt = payHit?.paidAt || null
    const paid = !!(paidAt && paidAt.length)

    // 厅主工资与厅明细始终取当前 live 计算；paid_wage/paid_snapshot
    // 仅用于非厅主主播，不能冻结厅主金额。
    const hallOwnerWage = hw.totalWage
    const hallUserFlow = hw.hallUserFlow
    const hallStreamerFlow = hw.hallStreamerFlow
    const hallStreamerWageTotal = hw.hallStreamerWageTotal

    const hallFields = {
      isHallOwner: true as const,
      hallNo: hw.hallNo,
      hallPayMode: hw.hallPayMode,
      hallUserFlow,
      hallStreamerFlow,
      hallStreamerWageTotal,
    }

    // Merge into existing liushui row if 厅主 already appears as a streamer
    let mergeIdx = -1
    for (let i = 0; i < rows.length; i++) {
      if (mergedOwnerRowIndexes.has(i)) continue
      if (ownerIds.has(rows[i].streamerId)) {
        mergeIdx = i
        break
      }
    }

    if (mergeIdx >= 0) {
      const existing = rows[mergeIdx]
      rows[mergeIdx] = {
        ...existing,
        nickname: displayName !== '—' ? displayName : existing.nickname,
        streamerId: ownerStreamerId || existing.streamerId,
        totalWage: hallOwnerWage,
        confirmed,
        confirmedAt,
        paid,
        paidAt,
        payQrUrl: payQrUrl ?? existing.payQrUrl,
        profileName: profileName ?? existing.profileName,
        ...hallFields,
      }
      mergedOwnerRowIndexes.add(mergeIdx)
    } else {
      rows.push({
        rowId: `hall-owner:${userId || ownerStreamerId || hallNo}`,
        nickname: displayName,
        streamerId: ownerStreamerId,
        mergedFlow: 0,
        totalWage: hallOwnerWage,
        confirmed,
        confirmedAt,
        paid,
        paidAt,
        payQrUrl,
        profileName,
        ...hallFields,
      })
    }
  }

  // hall_pay_mode=self: streamers of that hall are NOT payable by union (exclude from list).
  // Keep 厅主 row as designed.
  {
    const selfPayHalls = new Set<string>()
    for (const owner of hallOwners) {
      if (normalizeHallPayMode(owner.hall_pay_mode) !== 'self') continue
      const hn = String(owner.hall_no || '').trim()
      if (hn) selfPayHalls.add(hn)
    }
    if (selfPayHalls.size) {
      const hallNoByPlatform = buildHallNoByStreamerIdFromDb(database)
      const ownerStreamerIds = new Set<string>()
      for (const owner of hallOwners) {
        for (const id of collectNonEmptyIds(
          owner.streamer_id,
          owner.linked_id_1,
          owner.linked_id_2,
          owner.linked_id_3,
        )) {
          ownerStreamerIds.add(id)
        }
      }
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]
        if (r.isHallOwner) continue // keep 厅主 row
        if (ownerStreamerIds.has(r.streamerId)) continue
        const h = (hallNoByPlatform[r.streamerId] || '').trim()
        if (h && selfPayHalls.has(h)) {
          rows.splice(i, 1)
        }
      }
    }
  }

  // 厅管 scope: only own hall streamers + that hall's 厅主 row.
  // hallScope === '' (厅管 without 所属厅号): show no payable rows; document in emptyMessage.
  const scopeSpecified = hallScope != null
  const scopeHall = (hallScope || '').trim()
  if (scopeSpecified) {
    if (!scopeHall) {
      rows.length = 0
    } else {
      const hallNoByPlatform = buildHallNoByStreamerIdFromDb(database)
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]
        if (r.isHallOwner) {
          if ((r.hallNo || '').trim() !== scopeHall) rows.splice(i, 1)
          continue
        }
        const h = (hallNoByPlatform[r.streamerId] || '').trim()
        if (h !== scopeHall) rows.splice(i, 1)
      }
    }
  }

  // 厅主 always pinned first; within each group keep 未付款 first, then 总工资 desc.
  rows.sort((a, b) => {
    const aHallOwner = a.isHallOwner === true
    const bHallOwner = b.isHallOwner === true
    if (aHallOwner !== bHallOwner) return aHallOwner ? -1 : 1
    if (a.paid !== b.paid) return a.paid ? 1 : -1
    const aw = a.totalWage ?? -Infinity
    const bw = b.totalWage ?? -Infinity
    if (bw !== aw) return bw - aw
    return a.streamerId.localeCompare(b.streamerId)
  })

  let paidTotal = 0
  let unpaidTotal = 0
  for (const r of rows) {
    const w = r.totalWage != null && Number.isFinite(r.totalWage) ? r.totalWage : 0
    if (r.paid) paidTotal += w
    else unpaidTotal += w
  }
  paidTotal = roundMoney(paidTotal)
  unpaidTotal = roundMoney(unpaidTotal)

  // All-halls admin scope — same overviewPayableTotal as 收益看板「全部」
  const revenue = await getRevenueBoard(year, month, week, '', '', '')
  const payableTotal = roundMoney(revenue.overviewPayableTotal || 0)
  const weekBalance = roundMoney(payableTotal - paidTotal)

  return {
    period: { year, month, week, label, sharedLabel, monday, sunday },
    range: {
      startDate: monday,
      endDate: sunday,
      startDateLabel: formatChineseDateLabel(monday),
      endDateLabel: formatChineseDateLabel(sunday),
    },
    selectedBatchId,
    rows,
    empty: rows.length === 0,
    emptyMessage:
      rows.length === 0
        ? scopeSpecified && !scopeHall
          ? '厅管账号未设置所属厅号，无法按厅筛选工资发放（请在注册列表填写所属厅号）'
          : '该周暂无主播流水'
        : undefined,
    paidTotal,
    unpaidTotal,
    payableTotal,
    weekBalance,
  }
}

const SALARY_NOTICE_TITLE = '工资通知'

function formatSalaryNoticeHours(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return String(n)
}

function resolvePayrollPeriodForBatch(
  startDate: string,
  endDate: string,
  preferred?: { year: number; month: number; week: number } | null,
): { year: number; month: number; week: number; label: string } {
  if (
    preferred &&
    Number.isFinite(preferred.year) &&
    Number.isFinite(preferred.month) &&
    Number.isFinite(preferred.week) &&
    preferred.month >= 1 &&
    preferred.month <= 12 &&
    preferred.week >= 1 &&
    preferred.week <= 5
  ) {
    const year = Math.trunc(preferred.year)
    const month = Math.trunc(preferred.month)
    const week = Math.trunc(preferred.week)
    return { year, month, week, label: periodLabel(year, month, week) }
  }

  const monday = batchWeekMonday({ startDate, endDate })
  if (monday) {
    const parts = ymdParts(monday)
    if (parts) {
      const [y, m] = parts
      const candidates = [
        { year: y, month: m },
        m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 },
        m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 },
      ]
      for (const pass of [0, 1] as const) {
        for (const c of candidates) {
          if (pass === 0 && !(c.year === y && c.month === m)) continue
          const weeks = listMonthWeeks(c.year, c.month)
          const hit = weeks.find((w) => w.monday === monday)
          if (hit) {
            return {
              year: c.year,
              month: c.month,
              week: hit.week,
              label: periodLabel(c.year, c.month, hit.week),
            }
          }
        }
      }
    }
  }

  const fallback = ymdParts(startDate) || ymdParts(endDate)
  if (fallback) {
    const year = fallback[0]
    const month = fallback[1]
    return { year, month, week: 1, label: periodLabel(year, month, 1) }
  }
  return { year: 0, month: 0, week: 0, label: '工资' }
}

function buildSalaryPaidNoticeText(opts: {
  month: number
  week: number
  year: number
  totalFlow: number | null
  addFlow: number | null
  deductFlow: number | null
  mergedFlow: number | null
  micHours: number | null
  hostHours: number | null
  baseWage: number | null
  hostWage: number | null
  rewardYuan: number | null
  fineYuan: number | null
  totalWage: number | null
}): string {
  const head =
    opts.year > 0 && opts.month > 0 && opts.week > 0
      ? `${opts.year}年${opts.month}月第${opts.week}周 工资已发放请前往上传的收款码软件查询`
      : opts.month > 0 && opts.week > 0
        ? `${opts.month}月第${opts.week}周 工资已发放请前往上传的收款码软件查询`
        : `工资已发放请前往上传的收款码软件查询`
  const lines = [
    head,
    '',
    `总流水：${formatMoney2(opts.totalFlow)}`,
    `增加流水：${formatMoney2(opts.addFlow)}`,
    `扣除流水：${formatMoney2(opts.deductFlow)}`,
    `合并流水：${formatMoney2(opts.mergedFlow)}`,
    `麦序时长：${formatSalaryNoticeHours(opts.micHours)}`,
    `主持时长：${formatSalaryNoticeHours(opts.hostHours)}`,
    `基础工资：${formatMoney2(opts.baseWage)}`,
    `主持工资：${formatMoney2(opts.hostWage)}`,
    `奖励：${formatMoney2(opts.rewardYuan)}`,
    `罚款：${formatMoney2(opts.fineYuan)}`,
    `实发工资：${formatMoney2(opts.totalWage)}`,
  ]
  return lines.join('\n')
}

function resolveAccountUserIdForPlatform(database: Database, platformId: string): string | null {
  const pid = (platformId || '').trim()
  if (!pid) return null
  const index = buildPayrollProfileIndex(database)
  const hit = index.get(pid)
  const uid = (hit?.userId || '').trim()
  return uid || null
}

async function notifySalaryPaidChat(opts: {
  database: Database
  batchId: string
  userPlatformId: string
  period?: { year: number; month: number; week: number } | null
}): Promise<{ notified: boolean; threadId?: string; reason?: string }> {
  const bid = opts.batchId
  const pid = opts.userPlatformId
  const accountUserId = resolveAccountUserIdForPlatform(opts.database, pid)
  if (!accountUserId) {
    return { notified: false, reason: 'no-account' }
  }

  const batch = one<{ start_date: string; end_date: string }>(
    opts.database,
    `SELECT start_date, end_date FROM liushui_batches WHERE id = ?`,
    [bid],
  )
  const startDate = typeof batch?.start_date === 'string' ? batch.start_date : ''
  const endDate = typeof batch?.end_date === 'string' ? batch.end_date : ''
  const period = resolvePayrollPeriodForBatch(startDate, endDate, opts.period || null)

  const row = one<{
    total_flow_amount: number | null
    add_flow_yuan: number | null
    deduct_flow_yuan: number | null
    host_hours: number | null
    mic_hours: number | null
    base_wage: number | null
    host_wage: number | null
    reward_yuan: number | null
    fine_yuan: number | null
    total_wage: number | null
  }>(
    opts.database,
    `SELECT total_flow_amount, add_flow_yuan, deduct_flow_yuan,
            host_hours, mic_hours, base_wage, host_wage, reward_yuan, fine_yuan, total_wage
     FROM liushui_rows
     WHERE batch_id = ? AND user_platform_id = ?
     LIMIT 1`,
    [bid, pid],
  )

  let totalFlow: number | null = null
  let addFlow = 0
  let deductFlow = 0
  let mergedFlow = 0
  let micHours: number | null = null
  let hostHours: number | null = null
  let baseWage: number | null = null
  let hostWage: number | null = null
  let rewardYuan: number | null = null
  let fineYuan: number | null = null
  let totalWage: number | null = null

  // Prefer wage snapshotted at 已付款 (written just before notify)
  migrateSalaryPayments(opts.database)
  const paySnap = one<{ paid_wage: number | null }>(
    opts.database,
    `SELECT paid_wage FROM salary_payments WHERE batch_id = ? AND user_platform_id = ?`,
    [bid, pid],
  )
  const frozenWage = nullableNum(paySnap?.paid_wage)

  if (row) {
    totalFlow = nullableNum(row.total_flow_amount)
    addFlow = nullableNum(row.add_flow_yuan) ?? 0
    deductFlow = nullableNum(row.deduct_flow_yuan) ?? 0
    mergedFlow = roundMoney((totalFlow ?? 0) + addFlow - deductFlow)
    micHours = nullableNum(row.mic_hours)
    hostHours = nullableNum(row.host_hours)
    baseWage = nullableNum(row.base_wage)
    hostWage = nullableNum(row.host_wage)
    rewardYuan = nullableNum(row.reward_yuan)
    fineYuan = nullableNum(row.fine_yuan)
    totalWage = frozenWage != null ? frozenWage : nullableNum(row.total_wage)
  } else {
    // 厅主 without liushui row: use snapshotted wage, else payroll board when period known
    migrateStreamer(opts.database)
    const hallOwner = one<{ id: string }>(
      opts.database,
      `SELECT id FROM streamer_profiles
       WHERE COALESCE(is_hall_owner, 0) = 1
         AND TRIM(COALESCE(hall_no, '')) != ''
         AND (
           streamer_id = ?
           OR linked_id_1 = ?
           OR linked_id_2 = ?
           OR linked_id_3 = ?
         )
       LIMIT 1`,
      [pid, pid, pid, pid],
    )
    if (!hallOwner) {
      return { notified: false, reason: 'no-row' }
    }
    if (frozenWage != null) {
      totalWage = frozenWage
    } else if (period.year > 0 && period.month > 0 && period.week > 0) {
      try {
        const board = await getPayrollBoard(period.year, period.month, period.week)
        const hit = board.rows.find((r) => r.streamerId === pid)
        if (hit) totalWage = hit.totalWage
      } catch {
        /* keep null wage */
      }
    }
  }

  const text = buildSalaryPaidNoticeText({
    year: period.year,
    month: period.month,
    week: period.week,
    totalFlow,
    addFlow,
    deductFlow,
    mergedFlow,
    micHours,
    hostHours,
    baseWage,
    hostWage,
    rewardYuan,
    fineYuan,
    totalWage,
  })

  const noticeMsg = {
    id: uid('m-'),
    role: 'bot' as const,
    bot: {
      analysis: text,
      bossMindset: '',
      hostMood: '',
      hostTone: '',
      replies: [],
      spicy: false,
      coachOpen: true,
    },
  }

  const preferredId = `sys-salary-${accountUserId}`
  const existingById = one<{ id: string; payload: string }>(
    opts.database,
    `SELECT id, payload FROM threads WHERE id = ? AND user_id = ?`,
    [preferredId, accountUserId],
  )
  const existingByTitle = existingById
    ? null
    : one<{ id: string; payload: string }>(
        opts.database,
        `SELECT id, payload FROM threads WHERE user_id = ? AND boss_name = ? ORDER BY updated_at DESC LIMIT 1`,
        [accountUserId, SALARY_NOTICE_TITLE],
      )
  const existing = existingById || existingByTitle

  if (existing) {
    const appended = await appendMessage(accountUserId, existing.id, noticeMsg)
    if (!appended) return { notified: false, reason: 'append-failed' }
    // Ensure systemNotice flag stays on
    const payload = parsePayload(
      one<{ payload: string }>(
        opts.database,
        `SELECT payload FROM threads WHERE id = ? AND user_id = ?`,
        [existing.id, accountUserId],
      )?.payload || '{}',
    )
    if (payload.systemNotice !== true || payload.bossName !== SALARY_NOTICE_TITLE) {
      await updateThread(accountUserId, existing.id, {
        ...payload,
        bossName: SALARY_NOTICE_TITLE,
        systemNotice: true,
      })
    }
    return { notified: true, threadId: existing.id }
  }

  const created = await createThread(accountUserId, {
    id: preferredId,
    bossName: SALARY_NOTICE_TITLE,
    personaId: 'soft',
    screenshot: null,
    messages: [noticeMsg],
    updatedAt: Date.now(),
    systemNotice: true,
  })
  if ('error' in created) {
    return { notified: false, reason: created.error }
  }
  return { notified: true, threadId: preferredId }
}

export type MarkSalaryPaidResult =
  | {
      ok: true
      paidAt: string
      batchId: string
      userPlatformId: string
      notified?: boolean
      notifyReason?: string
    }
  | { ok: false; error: string; status: number }

export type MarkSalaryPaidPeriod = { year: number; month: number; week: number }

/**
 * Live wage the 工资发放 board would show at click time (ignores existing payment rows,
 * so re-mark ON CONFLICT captures the current live amount).
 * 厅主 → computeHallOwnerWage (+ hall 明细 snapshot); else liushui_rows.total_wage.
 */
async function resolveWageSnapshotForPay(
  database: Database,
  batchId: string,
  userPlatformId: string,
  period?: MarkSalaryPaidPeriod | null,
): Promise<{ paidWage: number | null; paidSnapshot: string | null }> {
  const bid = batchId
  const pid = userPlatformId

  let ymw: MarkSalaryPaidPeriod | null =
    period &&
    Number.isFinite(period.year) &&
    Number.isFinite(period.month) &&
    Number.isFinite(period.week)
      ? { year: Math.trunc(period.year), month: Math.trunc(period.month), week: Math.trunc(period.week) }
      : null

  if (!ymw) {
    const batchDates = one<{ start_date: string; end_date: string }>(
      database,
      `SELECT start_date, end_date FROM liushui_batches WHERE id = ?`,
      [bid],
    )
    const startDate = typeof batchDates?.start_date === 'string' ? batchDates.start_date : ''
    const endDate = typeof batchDates?.end_date === 'string' ? batchDates.end_date : ''
    const resolved = resolvePayrollPeriodForBatch(startDate, endDate, period || null)
    if (resolved.year > 0 && resolved.month > 0 && resolved.week > 0) {
      ymw = { year: resolved.year, month: resolved.month, week: resolved.week }
    }
  }

  migrateStreamer(database)
  const owner = one<{
    hall_no: string | null
    streamer_id: string
    hall_pay_mode: string | null
    linked_id_1: string | null
    linked_id_2: string | null
    linked_id_3: string | null
  }>(
    database,
    `SELECT hall_no, streamer_id, hall_pay_mode, linked_id_1, linked_id_2, linked_id_3
     FROM streamer_profiles
     WHERE COALESCE(is_hall_owner, 0) = 1
       AND TRIM(COALESCE(hall_no, '')) != ''
       AND (
         streamer_id = ?
         OR linked_id_1 = ?
         OR linked_id_2 = ?
         OR linked_id_3 = ?
       )
     LIMIT 1`,
    [pid, pid, pid, pid],
  )

  if (owner) {
    // 厅主工资必须在每次读取时 live 重算；不要写入 paid_wage/paid_snapshot。
    return { paidWage: null, paidSnapshot: null }
  }

  const wageRow = one<{ total_wage: number | null }>(
    database,
    `SELECT total_wage FROM liushui_rows WHERE batch_id = ? AND user_platform_id = ? LIMIT 1`,
    [bid, pid],
  )
  return { paidWage: nullableNum(wageRow?.total_wage), paidSnapshot: null }
}

export async function markSalaryPaid(
  adminUserId: string,
  batchId: string,
  userPlatformId: string,
  period?: MarkSalaryPaidPeriod | null,
): Promise<MarkSalaryPaidResult> {
  const bid = (batchId || '').trim()
  const pid = (userPlatformId || '').trim()
  if (!bid || !pid) {
    return { ok: false, error: '缺少批次或主播ID', status: 400 }
  }

  const database = await openDb()
  migrateLiushui(database)
  migrateSalaryPayments(database)

  const batch = one<{ id: string; kind: string | null }>(
    database,
    `SELECT id, kind FROM liushui_batches WHERE id = ?`,
    [bid],
  )
  if (!batch) {
    return { ok: false, error: '批次不存在', status: 404 }
  }
  const kind = (batch.kind || 'streamer').trim() || 'streamer'
  if (kind !== 'streamer') {
    return { ok: false, error: '仅支持主播流水批次', status: 400 }
  }

  const row = one<{ id: string }>(
    database,
    `SELECT id FROM liushui_rows WHERE batch_id = ? AND user_platform_id = ? LIMIT 1`,
    [bid, pid],
  )
  if (!row) {
    // 厅主 may appear on payroll without a liushui row — allow pay by profile streamer_id
    migrateStreamer(database)
    const hallOwner = one<{ id: string }>(
      database,
      `SELECT id FROM streamer_profiles
       WHERE COALESCE(is_hall_owner, 0) = 1
         AND TRIM(COALESCE(hall_no, '')) != ''
         AND (
           streamer_id = ?
           OR linked_id_1 = ?
           OR linked_id_2 = ?
           OR linked_id_3 = ?
         )
       LIMIT 1`,
      [pid, pid, pid, pid],
    )
    if (!hallOwner) {
      return { ok: false, error: '该批次中没有此主播', status: 404 }
    }
  }

  const admin = one<{ username: string }>(
    database,
    `SELECT username FROM users WHERE id = ?`,
    [adminUserId],
  )
  const paidBy = (admin?.username || '').trim() || adminUserId
  const paidAt = new Date().toISOString()

  // Snapshot wage the board would show at click time (before marking paid)
  const snap = await resolveWageSnapshotForPay(database, bid, pid, period || null)

  database.run(
    `INSERT INTO salary_payments (batch_id, user_platform_id, paid_at, paid_by, paid_wage, paid_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(batch_id, user_platform_id) DO UPDATE SET
       paid_at = excluded.paid_at,
       paid_by = excluded.paid_by,
       paid_wage = excluded.paid_wage,
       paid_snapshot = excluded.paid_snapshot`,
    [bid, pid, paidAt, paidBy, snap.paidWage, snap.paidSnapshot],
  )
  scheduleSave()

  let notified = false
  let notifyReason: string | undefined
  try {
    const notice = await notifySalaryPaidChat({
      database,
      batchId: bid,
      userPlatformId: pid,
      period: period || null,
    })
    notified = !!notice.notified
    notifyReason = notice.reason
  } catch (e) {
    notifyReason = e instanceof Error ? e.message : 'notify-failed'
  }

  return { ok: true, paidAt, batchId: bid, userPlatformId: pid, notified, notifyReason }
}
