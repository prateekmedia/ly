import { useSyncExternalStore } from 'react'
import { getPlannerRuntime } from '@/llm/plannerRuntime.js'

const IDLE_SNAPSHOT = Object.freeze({
  status: 'idle',
  message: '',
  files: {},
  error: null,
  overallProgress: 0,
})

function subscribe(cb) {
  const runtime = getPlannerRuntime()
  if (!runtime) return () => {}
  return runtime.subscribe(cb)
}

function getSnapshot() {
  const runtime = getPlannerRuntime()
  if (!runtime) return IDLE_SNAPSHOT
  return runtime.getSnapshot()
}

/** Laya ONNX worker download / init state (heuristic planner → idle snapshot). */
export function useLayaPlannerSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE_SNAPSHOT)
}
