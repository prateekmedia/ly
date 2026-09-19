import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Cross-origin isolation headers. Required to enable SharedArrayBuffer, which
// in turn lets ONNX Runtime use multi-threaded WASM. Without these, ONNX
// silently falls back to single-threaded execution AND still allocates memory
// for all threads — which is the worst of both worlds and triggers Safari's
// WebContent jetsam during background removal.
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: process.env.VITE_BASE || env.VITE_BASE || '/',
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    plugins: [react()],
    server: {
      headers: crossOriginHeaders,
    },
    preview: {
      headers: crossOriginHeaders,
    },
  }
})
