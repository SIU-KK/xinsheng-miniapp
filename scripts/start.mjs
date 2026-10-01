import { spawn } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Vite 7 no longer exports ./bin/vite.js; resolve via package.json then join.
const viteRoot = path.dirname(require.resolve('vite/package.json'))
const viteCli = path.join(viteRoot, 'bin', 'vite.js')
const port = process.env.PORT || '5173'

const child = spawn(
  process.execPath,
  [viteCli, 'preview', '--host', '0.0.0.0', '--port', String(port)],
  { stdio: 'inherit', env: process.env },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
