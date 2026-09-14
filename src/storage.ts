import type { Session } from './types'

/** Drop one boss session. Other bosses stay. Caller persists via API. */
export function dropSession(sessions: Session[], id: string): Session[] {
  return sessions.filter((s) => s.id !== id)
}
