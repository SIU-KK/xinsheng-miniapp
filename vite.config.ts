import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defineConfig,
  runnerImport,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const grokPluginPath = path.join(rootDir, 'grok-plugin.ts')

const BACKEND_WATCH_IGNORE = [
  '**/data/**',
  '**/.tunnel-url',
  '**/*.db',
  '**/*.db-journal',
  '**/*.db.tmp',
  '**/*.xlsx',
  '**/homework-content.json',
  '**/grok-plugin.ts',
  '**/persist.ts',
  '**/liushuiParse.ts',
  '**/activityParse.ts',
]

/**
 * Attach API without statically importing grok-plugin into vite.config.
 * Static imports put persist/liushuiParse in configFileDependencies, so every
 * agent save caused "server restarted" → full browser reload on the tunnel.
 *
 * Uses vite.runnerImport (loads .ts) at hook time only. After backend API edits,
 * restart Vite manually to pick them up.
 */
function lazyGrokApiPlugin(): Plugin {
  const backendFiles = [
    grokPluginPath,
    path.join(rootDir, 'persist.ts'),
    path.join(rootDir, 'liushuiParse.ts'),
    path.join(rootDir, 'activityParse.ts'),
    path.join(rootDir, 'data'),
    path.join(rootDir, '.tunnel-url'),
  ]

  async function loadInner(): Promise<Plugin> {
    const { module } = await runnerImport<{ default: () => Plugin }>(grokPluginPath)
    return module.default()
  }

  return {
    name: 'grok-api-lazy',
    async configureServer(server: ViteDevServer) {
      const inner = await loadInner()
      await inner.configureServer?.(server)
      try {
        server.watcher.unwatch(backendFiles)
      } catch {
        /* ignore */
      }
    },
    async configurePreviewServer(server: PreviewServer) {
      const inner = await loadInner()
      await inner.configurePreviewServer?.(server)
    },
  }
}

export default defineConfig({
  appType: 'spa',
  plugins: [react(), lazyGrokApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    allowedHosts: true,
    watch: {
      ignored: BACKEND_WATCH_IGNORE,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
  },
})
