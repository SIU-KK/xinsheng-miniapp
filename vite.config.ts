import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import grokApiPlugin from './grok-plugin'

export default defineConfig({
  plugins: [react(), grokApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
  },
})
