// Maps natural-language instructions to per-image { opId, params }.
// Default: one op for all images via Laya ONNX; params from heuristics.

import { getPlanner } from '@/config/planner.js'
import { fetchLayaBrowserPlan } from '@/llm/layaBrowserClient.js'
import { OPERATIONS, getOperation, NOOP } from '@/operations/index.js'

function extractQuality(text) {
  const m =
    text.match(/quality\s*[:=]?\s*(\d{1,3})/) ||
    text.match(/(\d{1,3})\s*%?\s*quality/) ||
    text.match(/q\s*=\s*(\d{1,3})/)
  if (!m) return null
  const v = Number(m[1])
  return v >= 1 && v <= 100 ? v : null
}

function extractScalePercent(text) {
  if (/\bhalf\b/.test(text)) return 0.5
  if (/\bdouble\b|\b2x\b|\btwice\b/.test(text)) return 2
  if (/\bquarter\b/.test(text)) return 0.25
  const m = text.match(/(\d{1,4})\s*%/)
  if (!m) return null
  const v = Number(m[1])
  return v > 0 ? v / 100 : null
}

function extractDimension(text, kind) {
  const re = new RegExp(
    `(?:${kind})\\s*[:=]?\\s*(\\d{2,5})|(\\d{2,5})\\s*(?:px)?\\s*(?:${kind})`,
  )
  const m = text.match(re)
  if (!m) return null
  const v = Number(m[1] || m[2])
  return v > 0 && v <= 16000 ? v : null
}

function extractFit(text) {
  if (/\bcrop\b/.test(text)) return 'crop'
  if (/\bstretch\b|\bdistort\b/.test(text)) return 'stretch'
  if (/\bletterbox\b|\bfit\s+inside\b|\bcontain\b/.test(text)) return 'contain'
  return null
}

function extractTargetFormat(text) {
  if (/\bwebp\b/.test(text)) return 'webp'
  if (/\bavif\b/.test(text)) return 'avif'
  if (/\bjpe?g\b/.test(text)) return 'jpeg'
  if (/\bpng\b/.test(text)) return 'png'
  return null
}

export function detectOpFromHeuristics(instruction) {
  const text = (instruction || '').toLowerCase().trim()
  if (!text) return NOOP

  if (
    /(remove|cut\s*out|isolate|knock\s*out).*(background|bg)|background.*(remove|gone)|transparent\s+background/.test(
      text,
    )
  ) {
    return 'remove_background'
  }
  if (
    /\bresize\b|\bscale\b|\bdownscale\b|\bcrop\b|\b\d{1,3}\s*%\b|half|double|quarter|width\s*\d|height\s*\d|\b\d{2,5}\s*(?:px)?\s*(?:wide|tall|width|height)\b/.test(
      text,
    )
  ) {
    return 'resize_image'
  }
  if (
    /compress|optimi[sz]e|smaller(?!\s+than)|reduce\s+size|reduce\s+file|file\s+size/.test(text)
  ) {
    return 'compress_image'
  }
  if (
    /\bconvert\b|\bto\s+(?:webp|jpeg|jpg|png|avif)\b|save\s+as|export\s+as|change.*format/.test(text)
  ) {
    return 'convert_format'
  }
  return NOOP
}

export function paramsFromHeuristics(opId, instruction) {
  const text = (instruction || '').toLowerCase().trim()
  const op = getOperation(opId)
  if (!op || opId === NOOP) return {}

  const params = {}
  if (opId === 'resize_image') {
    const scale = extractScalePercent(text)
    if (scale != null) params.scale = scale
    const w = extractDimension(text, 'width|w')
    const h = extractDimension(text, 'height|h')
    if (w) params.width = w
    if (h) params.height = h
    const fit = extractFit(text)
    if (fit) params.fit = fit
  } else if (opId === 'compress_image' || opId === 'convert_format') {
    const q = extractQuality(text)
    if (q != null) params.quality = q
    const fmt = extractTargetFormat(text)
    if (fmt) params.format = fmt
  }

  return op.normalizeParams ? op.normalizeParams(params) : params
}

function singlePlanFromHeuristics(instruction) {
  const opId = detectOpFromHeuristics(instruction)
  if (opId === NOOP) return { opId: NOOP, params: {} }
  return { opId, params: paramsFromHeuristics(opId, instruction) }
}

function applyUniformPlan(plan, images) {
  return new Array(images.length).fill(0).map(() => ({
    opId: plan.opId,
    params: { ...plan.params },
  }))
}

function heuristicAssignments(instruction, images) {
  return applyUniformPlan(singlePlanFromHeuristics(instruction), images)
}

async function planWithLaya(instruction, images) {
  try {
    const { opId, confidence, rejected } = await fetchLayaBrowserPlan(instruction)
    if (import.meta.env.DEV) {
      console.log('[laya] plan', { opId, confidence, rejected })
    }
    let plan
    if (!opId || opId === NOOP || rejected) {
      plan = singlePlanFromHeuristics(instruction)
    } else {
      plan = { opId, params: paramsFromHeuristics(opId, instruction) }
    }
    if (plan.opId === NOOP && instruction?.trim()) {
      plan = singlePlanFromHeuristics(instruction)
    }
    return applyUniformPlan(plan, images)
  } catch (err) {
    console.warn('[laya] unavailable, using heuristics', err)
    return heuristicAssignments(instruction, images)
  }
}

export async function planOperations({ instruction, images, useLLM = true }) {
  if (images.length === 0) return []

  if (getPlanner() === 'heuristic') {
    return heuristicAssignments(instruction, images)
  }

  if (!useLLM) return heuristicAssignments(instruction, images)
  return planWithLaya(instruction, images)
}

export { OPERATIONS }
