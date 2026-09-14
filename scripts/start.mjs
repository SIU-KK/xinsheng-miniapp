import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const viteCli = require.resolve('vite/bin/vite.js')
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
