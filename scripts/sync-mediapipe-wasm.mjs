import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const destination = resolve(root, 'public/mediapipe-wasm')

try {
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  await cp(source, destination, { recursive: true })
  console.log(`Synced MediaPipe WASM assets to ${destination}`)
} catch (error) {
  console.error('Failed to sync MediaPipe WASM assets.')
  console.error(`Expected source: ${source}`)
  console.error(error)
  process.exitCode = 1
}
