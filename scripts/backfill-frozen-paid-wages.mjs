/**
 * One-shot runner: freeze live wages onto salary_payments with NULL paid_wage.
 * Usage (from repo root): node scripts/backfill-frozen-paid-wages.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(rootDir)

const { module } = await runnerImport(path.join(rootDir, 'persist.ts'))
const result = await module.backfillFrozenPaidWages()
console.log(JSON.stringify({ ok: true, ...result }, null, 2))
process.exit(result.errors > 0 ? 1 : 0)
