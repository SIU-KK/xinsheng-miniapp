/** Pure helpers for Mem0-style episodic fact normalize / keyword score (Chinese-friendly). */

const FACT_MAX = 120

export function normalizeFact(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().slice(0, FACT_MAX)
}

/** Split on non-CJK punctuation / spaces; also emit consecutive CJK 2-grams. */
export function tokenize(text: string): string[] {
  const raw = (text || '').toLowerCase()
  if (!raw.trim()) return []
  const parts = raw.split(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]+/i).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  for (const p of parts) {
    push(p)
    const cjk = p.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g)
    if (!cjk) continue
    for (const run of cjk) {
      if (run.length < 2) continue
      for (let i = 0; i < run.length - 1; i++) push(run.slice(i, i + 2))
    }
  }
  return out
}

export function scoreFact(query: string, fact: string): number {
  const q = tokenize(query)
  const f = tokenize(fact)
  if (!q.length || !f.length) return 0
  const fset = new Set(f)
  let hit = 0
  for (const t of q) if (fset.has(t)) hit++
  return hit
}
