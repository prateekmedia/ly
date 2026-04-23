// Builds the prompt for the LLM and parses its JSON output into an
// assignment plan: an array of { opId, params } per image.
//
// The LLM's job is to map a natural-language instruction onto operation ids
// from the registry, and to fill in any params each operation declares.
// It does NOT see image content, only filenames + indices.

import { generate } from './llmClient.js'
import {
  OPERATIONS,
  getOperation,
  listOperationIds,
  operationsForPrompt,
  NOOP,
} from '../operations/index.js'

function buildSystemPrompt() {
  return `Route images to ops. Output ONLY compact JSON: {"a":[[i,"op",{p}]]}. Omit {p} if empty/default. i is 0-based. image 1 => i=0. others/rest => unnamed images. No mention => "${NOOP}". % resize => scale decimal (25%=>0.25). Split requests by image clauses.

Ops:
${operationsForPrompt()}
${NOOP}: no-op. Valid: ${[...listOperationIds(), NOOP].join(', ')}.`
}

// One-shot example demonstrating the "first vs rest" split pattern. Small
// models follow patterns much more reliably from examples than from rules.
const FEWSHOT = [
  {
    role: 'user',
    content:
      'Instruction: remove bg from the first image and convert the rest to webp\n\nImages:\n0: cat.jpg\n1: dog.jpg\n2: bird.jpg',
  },
  {
    role: 'assistant',
    content:
      '{"a":[[0,"remove_background"],[1,"convert_format",{"format":"webp"}],[2,"convert_format",{"format":"webp"}]]}',
  },
]

function buildUserPrompt(instruction, images) {
  const list = images
    .map((img, i) => `${i}: ${img.file?.name || img.name || `image_${i}`}`)
    .join('\n')
  return `I: ${instruction || '(empty)'}\nImgs:\n${list}`
}

// Extract the first balanced JSON object from a string.
function extractJson(text) {
  if (!text) return null
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = text.slice(start, i + 1)
        try {
          return JSON.parse(candidate)
        } catch {
          return null
        }
      }
    }
  }
  return null
}

// Validate the parsed JSON against the registry. Always returns an array of
// length === images.length where each entry is { opId, params }.
function normalizeAssignments(parsed, images) {
  const validIds = new Set([...listOperationIds(), NOOP])
  const out = new Array(images.length).fill(null).map(() => ({ opId: NOOP, params: {} }))
  const assignments = Array.isArray(parsed?.a)
    ? parsed.a
    : Array.isArray(parsed?.assignments)
      ? parsed.assignments
      : null
  if (!assignments) return out
  for (const a of assignments) {
    const idx = Number(Array.isArray(a) ? a[0] : (a?.i ?? a?.index))
    const opId = String(Array.isArray(a) ? (a[1] || NOOP) : (a?.o || a?.op || NOOP))
    if (!Number.isInteger(idx) || idx < 0 || idx >= images.length) continue
    if (!validIds.has(opId)) continue
    const op = getOperation(opId)
    const rawParams = Array.isArray(a) ? (a[2] || {}) : (a?.p || a?.params || {})
    const params = op ? op.normalizeParams(rawParams) : {}
    out[idx] = { opId, params }
  }
  return out
}

// ---------- Heuristic fallback ----------
// Used when the LLM is unavailable or returns garbage. Extracts a coarse
// intent from the prompt and applies it uniformly to every image.

function extractQuality(text) {
  // "quality 80", "quality: 80", "80% quality", "q=80"
  const m =
    text.match(/quality\s*[:=]?\s*(\d{1,3})/) ||
    text.match(/(\d{1,3})\s*%?\s*quality/) ||
    text.match(/q\s*=\s*(\d{1,3})/)
  if (!m) return null
  const v = Number(m[1])
  return v >= 1 && v <= 100 ? v : null
}

function extractScalePercent(text) {
  // "25%", "to 25 %", "by 50%", "half" / "double"
  if (/\bhalf\b/.test(text)) return 0.5
  if (/\bdouble\b|\b2x\b|\btwice\b/.test(text)) return 2
  if (/\bquarter\b/.test(text)) return 0.25
  const m = text.match(/(\d{1,4})\s*%/)
  if (!m) return null
  const v = Number(m[1])
  return v > 0 ? v / 100 : null
}

function extractDimension(text, kind) {
  // "800px wide", "width 800", "w=800", "800 wide"
  const re = new RegExp(`${kind}\\s*[:=]?\\s*(\\d{2,5})|(\\d{2,5})\\s*(?:px)?\\s*${kind}`)
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

function heuristicAssignments(instruction, images) {
  const text = (instruction || '').toLowerCase().trim()
  const blank = { opId: NOOP, params: {} }
  if (!text) return new Array(images.length).fill(blank)

  let plan = blank

  if (/(remove|cut\s*out|isolate|knock\s*out).*(background|bg)|background.*(remove|gone)|transparent\s+background/.test(text)) {
    plan = { opId: 'remove_background', params: {} }
  } else if (/\bresize\b|\bscale\b|\bdownscale\b|\bcrop\b|\b\d{1,3}\s*%\b|half|double|quarter|width\s*\d|height\s*\d|\b\d{2,5}\s*(?:px)?\s*(?:wide|tall|width|height)\b/.test(text)) {
    const params = {}
    const scale = extractScalePercent(text)
    if (scale != null) params.scale = scale
    const w = extractDimension(text, 'width|w')
    const h = extractDimension(text, 'height|h')
    if (w) params.width = w
    if (h) params.height = h
    const fit = extractFit(text)
    if (fit) params.fit = fit
    plan = { opId: 'resize_image', params }
  } else if (/compress|optimi[sz]e|smaller(?!\s+than)|reduce\s+size|reduce\s+file|file\s+size/.test(text)) {
    const params = {}
    const q = extractQuality(text)
    if (q) params.quality = q
    const fmt = extractTargetFormat(text)
    if (fmt) params.format = fmt
    plan = { opId: 'compress_image', params }
  } else if (/\bconvert\b|\bto\s+(?:webp|jpeg|jpg|png|avif)\b|save\s+as|export\s+as|change.*format/.test(text)) {
    const params = {}
    const fmt = extractTargetFormat(text)
    if (fmt) params.format = fmt
    const q = extractQuality(text)
    if (q != null) params.quality = q
    plan = { opId: 'convert_format', params }
  }

  // Normalize params through the operation's own validator
  if (plan.opId !== NOOP) {
    const op = getOperation(plan.opId)
    if (op) plan = { opId: plan.opId, params: op.normalizeParams(plan.params) }
  }

  return new Array(images.length).fill(0).map(() => ({ ...plan, params: { ...plan.params } }))
}

// Public: ask the LLM (or heuristic fallback) what to do with each image.
// Returns array of { opId, params } of length === images.length.
export async function planOperations({ instruction, images, useLLM = true }) {
  if (images.length === 0) return []

  if (!useLLM) {
    return heuristicAssignments(instruction, images)
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...FEWSHOT,
    { role: 'user', content: buildUserPrompt(instruction, images) },
  ]

  try {
    const max_new_tokens = Math.min(256, Math.max(96, 32 + images.length * 48))
    const text = await generate(messages, { max_new_tokens, do_sample: false })
    const parsed = extractJson(text)
    const normalized = normalizeAssignments(parsed, images)
    if (normalized.every((p) => p.opId === NOOP) && instruction?.trim()) {
      return heuristicAssignments(instruction, images)
    }
    return normalized
  } catch {
    return heuristicAssignments(instruction, images)
  }
}

// Re-exported for App.jsx convenience
export { OPERATIONS }
