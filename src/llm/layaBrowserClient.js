import debounce from 'lodash/debounce'
import sumBy from 'lodash/sumBy'
import { layaMinConfidence } from '@/config/planner.js'
import { OPERATION_QUESTION } from './layaConstants.js'

let workerRef = null
let nextRequestId = 1
const pending = new Map()
const listeners = new Set()

const state = {
  status: 'idle',
  message: '',
  files: {},
  error: null,
}

let cachedSnapshot = {
  status: state.status,
  message: state.message,
  files: { ...state.files },
  error: state.error,
  overallProgress: 0,
}

function emit() {
  cachedSnapshot = {
    status: state.status,
    message: state.message,
    files: { ...state.files },
    error: state.error,
    overallProgress: computeOverallProgress(),
  }
  listeners.forEach((cb) => cb(cachedSnapshot))
}

export function getSnapshot() {
  return cachedSnapshot
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
  workerRef = new Worker(new URL('./layaOnnxWorker.js', import.meta.url), { type: 'module' })
  workerRef.addEventListener('message', (e) => {
    const msg = e.data
    if (!msg) return
    switch (msg.type) {
      case 'status':
        emitProgress.flush()
        state.status = msg.status
        state.message = msg.message || ''
        if (msg.status === 'ready') state.error = null
        if (msg.status === 'error') state.error = msg.message
        emit()
        break
      case 'progress':
        if (msg.file) {
          state.files[msg.file] = {
            progress: msg.progress ?? 0,
            loaded: msg.loaded ?? 0,
            total: msg.total ?? 0,
          }
          emitProgress()
        }
        break
      case 'result': {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p.resolve(msg.answers)
        }
        break
      }
      case 'error':
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
  })
  return workerRef
}

export function loadModel() {
  ensureWorker().postMessage({ type: 'load' })
}

export function disposeModel() {
  if (!workerRef) return
  try {
    workerRef.postMessage({ type: 'dispose' })
    workerRef.terminate()
  } catch {
    // ignore
  }
  workerRef = null
  pending.forEach(({ reject }) => reject(new Error('Worker terminated')))
  pending.clear()
  state.status = 'idle'
  state.message = ''
  state.files = {}
  state.error = null
  emitProgress.cancel()
  emit()
}

function predict(stateObj, questions) {
  const w = ensureWorker()
  const id = nextRequestId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ type: 'predict', id, state: stateObj, questions })
  })
}

export function subscribe(cb) {
  listeners.add(cb)
  cb(getSnapshot())
  return () => listeners.delete(cb)
}

export function getStatus() {
  return state.status
}

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

/** One op id + confidence for the image workbench prompt. */
export async function fetchLayaBrowserPlan(instruction) {
  const answers = await predict(
    { instruction: instruction?.trim() || '(empty)' },
    { operation: OPERATION_QUESTION.operation },
  )
  const a = answers.operation
  if (!a || a.type !== 'choice') {
    return { opId: 'none', confidence: null }
  }
  const opId = String(a.choice || 'none')
  const confidence = a.confidence ?? null
  const minConf = layaMinConfidence()
  if (confidence != null && confidence < minConf) {
    return { opId: 'none', confidence, rejected: true }
  }
  return { opId, confidence, rejected: false }
}
