import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
export default defineConfig({
  plugins: [react()],
  server: {
    headers: crossOriginHeaders,
  },
  preview: {
    headers: crossOriginHeaders,
  },
})
