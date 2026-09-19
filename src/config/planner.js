/** Intent routing: browser Laya ONNX (default) or regex heuristics. */

const VALID = new Set(['laya', 'heuristic'])

export function getPlanner() {
  const raw = String(import.meta.env.VITE_PLANNER || 'laya').toLowerCase()
  return VALID.has(raw) ? raw : 'laya'
}

export function layaMinConfidence() {
  const n = Number(import.meta.env.VITE_LAYA_MIN_CONFIDENCE)
  return Number.isFinite(n) ? n : 0.35
}
