/**
 * Profile URL slugs for 主播墙 (a.586248.xyz).
 * Source: streamer display name (资料卡「主播」/ name on the wall), not login username.
 * Rules: Chinese → tone-less pinyin, lowercase, compact with no hyphens;
 * Latin/digit runs kept as whole tokens; collision → append short id.
 */
import { pinyin } from 'pinyin-pro'

const RESERVED = new Set([
  'api',
  'assets',
  'wall',
  'p',
  'streamers',
  'login',
  'register',
  'favicon.ico',
  'index.html',
])

/** Last 6 alnum chars of profile id (stable, short). */
export function shortIdFromProfileId(id: string): string {
  const alnum = (id || '').replace(/[^a-zA-Z0-9]/g, '')
  return (alnum.slice(-6) || 'x').toLowerCase()
}

/** Display name → base slug (no collision suffix). */
export function nameToBaseSlug(name: string): string {
  const raw = (name || '').trim()
  if (!raw) return ''

  const parts: string[] = []
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]!
    if (/[\u4e00-\u9fff]/.test(ch)) {
      const py = pinyin(ch, { toneType: 'none', type: 'string' }).trim().toLowerCase()
      const clean = py.replace(/[^a-z0-9]/g, '')
      if (clean) parts.push(clean)
      i += 1
    } else if (/[A-Za-z0-9]/.test(ch)) {
      let j = i + 1
      while (j < raw.length && /[A-Za-z0-9]/.test(raw[j]!)) j += 1
      parts.push(raw.slice(i, j).toLowerCase())
      i = j
    } else {
      i += 1
    }
  }

  return parts.filter(Boolean).join('')
}

export type SlugSource = { id: string; name: string }

/**
 * Assign unique slugs in list order (wall uses updated_at DESC).
 * First profile keeps clean pinyin; later collisions append a short id.
 */
export function assignProfileSlugs(profiles: SlugSource[]): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()

  for (const p of profiles) {
    let base = nameToBaseSlug(p.name)
    if (!base || RESERVED.has(base)) {
      base = 'zb' + shortIdFromProfileId(p.id)
    }

    let slug = base
    if (used.has(slug) || RESERVED.has(slug)) {
      slug = `${base}${shortIdFromProfileId(p.id)}`
      let n = 2
      while (used.has(slug) || RESERVED.has(slug)) {
        slug = `${base}${shortIdFromProfileId(p.id)}${n}`
        n += 1
      }
    }

    used.add(slug)
    out.set(p.id, slug)
  }

  return out
}

/** Attach slug field onto profile objects (mutates copies). */
export function withProfileSlugs<T extends SlugSource>(profiles: T[]): (T & { slug: string })[] {
  const map = assignProfileSlugs(profiles)
  return profiles.map((p) => ({ ...p, slug: map.get(p.id) || 'zb' + shortIdFromProfileId(p.id) }))
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has((slug || '').toLowerCase())
}
