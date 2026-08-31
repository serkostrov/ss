import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { attachInnLookupMiddleware } from './scripts/inn-lookup-middleware.ts'
import { blockSensitiveFilesPlugin } from './scripts/block-sensitive-files.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const listenOnLan = process.env.VITE_DEV_HOST === '1'

const fsGuard: {
  strict: boolean
  allow: string[]
  deny: string[]
} = {
  strict: true,
  // Do not allow the monorepo root: that is where `.env` lives (envDir).
  allow: [
    __dirname,
    path.resolve(repoRoot, 'packages/shared'),
    path.resolve(repoRoot, 'node_modules'),
  ],
  deny: ['.env', '.env.*', '**/.env', '**/.env.*', '**/.git/**', '**/*.{pem,crt,key}'],
}

export default defineConfig({
  plugins: [
    blockSensitiveFilesPlugin(),
    react(),
    tailwindcss(),
    {
      name: 'inn-lookup-dev-api',
      configureServer(server) {
        attachInnLookupMiddleware(server.middlewares)
      },
    },
  ],
  envDir: repoRoot,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@widgets': path.resolve(__dirname, './src/widgets'),
      '@features': path.resolve(__dirname, './src/features'),
      '@entities': path.resolve(__dirname, './src/entities'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@processes': path.resolve(__dirname, './src/processes'),
    },
  },
  server: {
    port: 5173,
    // `host: true` exposes Vite to the LAN and is the prerequisite for .env CVEs.
    // Opt in with VITE_DEV_HOST=1 if you need a phone on the same network.
    host: listenOnLan ? true : '127.0.0.1',
    fs: fsGuard,
    proxy: {
      // Messenger outbound API (local worker on :8787)
      '/api/messenger': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/messenger/, ''),
      },
    },
  },
  preview: {
    port: 4173,
    host: listenOnLan ? true : '127.0.0.1',
  },
})
