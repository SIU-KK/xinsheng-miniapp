import { CHEN_SIGNALS, generateOpening, hashesFromPmLines } from './engine'
import { suggestedFromBot } from './hostChoice'
import type { Session } from './types'

export const CHEN_SHOT = '/assets/boss-chen.jpg'

export function seedChenSession(now = Date.now()): Session {
  const bot = generateOpening({
    persona: 'soft',
    bossName: '宸',
    hasScreenshot: true,
    signals: CHEN_SIGNALS,
    salt: 20260902,
    preferFamilies: ['撒娇', '刚看见'],
  })
  return {
    id: 'demo-chen',
    bossName: '宸',
    personaId: 'soft',
    screenshot: CHEN_SHOT,
    signals: CHEN_SIGNALS,
    updatedAt: now,
    usedPmHashes: hashesFromPmLines(bot, '宸'),
    lastSuggested: suggestedFromBot(bot),
    messages: [{ id: 'b-demo-chen', role: 'bot', bot }],
  }
}
