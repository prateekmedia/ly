// Thin wrapper around the LLM Web Worker. Exposes a small Promise/event API
// to the rest of the app so React components don't deal with raw postMessage.

import debounce from 'lodash/debounce'
import sumBy from 'lodash/sumBy'

let workerRef = null
let nextRequestId = 1
const pending = new Map() // id -> { resolve, reject }
const listeners = new Set() // status/progress listeners

// Aggregated state we surface to the UI
const state = {
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  message: '',
  // file-level progress, keyed by filename
  files: {}, // { [filename]: { progress, loaded, total } }
  error: null,
}

function emit() {
  // Snapshot so listeners get a stable object
  const snapshot = {
    status: state.status,
    message: state.message,
    files: { ...state.files },
    error: state.error,
    overallProgress: computeOverallProgress(),
  }
  listeners.forEach((cb) => cb(snapshot))
}

const emitProgress = debounce(emit, 100, { maxWait: 300 })

function computeOverallProgress() {
  const files = Object.values(state.files)
  if (files.length === 0) return 0
  const total = sumBy(files, (f) => f.total || 0)
  const loaded = sumBy(files, (f) => f.loaded || 0)
  if (total === 0) return 0
  return Math.min(1, loaded / total)
}

function ensureWorker() {
  if (workerRef) return workerRef
  workerRef = new Worker(new URL('./llmWorker.js', import.meta.url), {
    type: 'module',
  })
  workerRef.addEventListener('message', (e) => {
    const msg = e.data
    if (!msg) return

    switch (msg.type) {
      case 'status': {
        emitProgress.flush()
        state.status = msg.status
        state.message = msg.message || ''
        if (msg.status === 'ready') {
          state.error = null
        }
        if (msg.status === 'error') {
          state.error = msg.message
        }
        emit()
        break
      }
      case 'progress': {
        if (msg.file) {
          state.files[msg.file] = {
            progress: msg.progress ?? 0,
            loaded: msg.loaded ?? 0,
            total: msg.total ?? 0,
          }
          emitProgress()
        }
        break
      }
      case 'result': {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p.resolve(msg.text)
        }
        break
      }
      case 'error': {
        if (msg.id != null) {
          const p = pending.get(msg.id)
          if (p) {
            pending.delete(msg.id)
            p.reject(new Error(msg.message))
          }
        } else {
          state.status = 'error'
          state.error = msg.message
          emit()
        }
        break
      }
    }
  })
  return workerRef
}

export function loadModel() {
  const w = ensureWorker()
  w.postMessage({ type: 'load' })
}

// Free the model from memory. Terminating the worker is the only reliable way
// to actually release the ONNX session — calling .dispose() leaves significant
// memory resident until JS GC runs, which on Safari can be too late and cause
// other workers (e.g. background removal) to OOM. Next loadModel() spawns a
// fresh worker; the model weights are still cached in IndexedDB so re-warmup
// is fast.
export function disposeModel() {
  if (!workerRef) return
  try {
    workerRef.terminate()
  } catch {
    // ignore
  }
  workerRef = null
  // Reject any in-flight requests so callers don't hang
  pending.forEach(({ reject }) => reject(new Error('Worker terminated')))
  pending.clear()
  state.status = 'idle'
  state.message = ''
  state.files = {}
  state.error = null
  emitProgress.cancel()
  emit()
}

export function generate(messages, options) {
  const w = ensureWorker()
  const id = nextRequestId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ type: 'generate', id, messages, options })
  })
}

export function subscribe(cb) {
  listeners.add(cb)
  // Push current state immediately so the new subscriber renders right away
  cb({
    status: state.status,
    message: state.message,
    files: { ...state.files },
    error: state.error,
    overallProgress: computeOverallProgress(),
  })
  return () => listeners.delete(cb)
}

export function getStatus() {
  return state.status
}

// Resolve once the model is ready. If idle, kicks off the load.
// Rejects if setup fails. Use this from any flow that needs the LLM.
export function waitForReady() {
  return new Promise((resolve, reject) => {
    if (state.status === 'ready') return resolve()
    if (state.status === 'error') return reject(new Error(state.error || 'Setup failed'))
    if (state.status === 'idle') loadModel()
    const unsub = subscribe((snap) => {
      if (snap.status === 'ready') {
        unsub()
        resolve()
      } else if (snap.status === 'error') {
        unsub()
        reject(new Error(snap.error || 'Setup failed'))
      }
    })
  })
}
