#!/usr/bin/env node
/** Copy onnxruntime-web WASM binaries to public/ort-wasm/ for Laya worker. */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [join(root, 'node_modules/onnxruntime-web/dist')]

const src = candidates.find((p) => existsSync(p))
if (!src) {
  console.warn('[sync-ort-wasm] onnxruntime-web dist not found — run npm install')
  process.exit(0)
}

const dest = join(root, 'public/ort-wasm')
mkdirSync(dest, { recursive: true })
for (const name of readdirSync(src)) {
  if (
    name.endsWith('.wasm') ||
    name.startsWith('ort-wasm') ||
    name === 'ort.wasm.bundle.min.mjs' ||
    name === 'ort.wasm.min.mjs'
  ) {
    cpSync(join(src, name), join(dest, name), { force: true })
  }
}
console.log('[sync-ort-wasm] synced from', src)
