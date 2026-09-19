// Compress an image while preserving its original format by default.
//
// Each format gets the right tool for the job:
//   - JPEG  : OffscreenCanvas convertToBlob with quality knob (real lossy)
//   - WebP  : same, lossy WebP
//   - AVIF  : same, lossy AVIF (browser support varies)
//   - PNG   : UPNG.js color quantization (lossy palette-based PNG, real shrink)
//
// The user can override the output format via params.format.

import UPNG from 'upng-js'
import { assertCanvasSize, clamp, normalizeFormat, mimeFor, extFor } from './index.js'

const DEFAULT_MAX_DIMENSION = 1920

function defaultParams() {
  return { quality: 75, max_dimension: DEFAULT_MAX_DIMENSION, format: null }
}

function normalizeParams(raw = {}) {
  const quality = clamp(Number(raw.quality ?? 75), 1, 100)
  const maxDim =
    raw.max_dimension == null || raw.max_dimension === 0
      ? null
      : clamp(Number(raw.max_dimension), 16, 16000)
  // null = preserve original format
  const format = normalizeFormat(raw.format)
  return { quality, max_dimension: maxDim, format }
}

function targetSize(w, h, maxDim) {
  if (!maxDim) return { w, h }
  const longest = Math.max(w, h)
  if (longest <= maxDim) return { w, h }
  const scale = maxDim / longest
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

function inferFormatFromMime(mime) {
  if (!mime) return 'jpeg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/avif') return 'avif'
  return 'jpeg' // jpg, jpeg, anything else
}

function effectiveFormat(file, params) {
  return params.format || inferFormatFromMime(file.type)
}

// Map quality 1..100 to UPNG palette size (cnum):
//   100 -> 0  (lossless, no quantization)
//   75  -> 192
//   50  -> 128
//   25  -> 64
//   1   -> 4
function qualityToCnum(q) {
  if (q >= 100) return 0
  return clamp(Math.round((q / 100) * 256), 2, 256)
}

async function compressPng(bitmap, w, h, quality) {
  // Render to a 2d canvas so we can read raw RGBA pixels
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)

  const cnum = qualityToCnum(quality)
  // UPNG.encode([rgba], w, h, cnum) — cnum=0 lossless, >0 lossy palette
  const ab = UPNG.encode([imageData.data.buffer], w, h, cnum)
  return new Blob([ab], { type: 'image/png' })
}

async function compressViaCanvas(bitmap, w, h, mime, quality) {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return await canvas.convertToBlob({ type: mime, quality: quality / 100 })
}

async function execute(file, params) {
  const { quality, max_dimension } = params
  const format = effectiveFormat(file, params)
  const bitmap = await createImageBitmap(file)
  try {
    const { w, h } = targetSize(bitmap.width, bitmap.height, max_dimension)
    assertCanvasSize(w, h)

    if (format === 'png') {
      return await compressPng(bitmap, w, h, quality)
    }
    const mime = mimeFor(format) || 'image/jpeg'
    return await compressViaCanvas(bitmap, w, h, mime, quality)
  } finally {
    bitmap.close()
  }
}

export default {
  id: 'compress_image',
  label: 'Compress',
  description: 'Reduce image file size while preserving its format.',
  accepts: '*',
  params: [
    {
      name: 'quality',
      type: 'integer',
      min: 1,
      max: 100,
      default: 75,
      desc: 'Re-encode quality 1-100. For PNG controls color quantization.',
    },
    {
      name: 'max_dimension',
      type: 'integer',
      min: 16,
      max: 16000,
      default: 1920,
      desc: 'Cap on the longest edge in pixels. Use 0 or null to disable.',
    },
    {
      name: 'format',
      type: 'enum',
      enum: ['png', 'jpeg', 'webp', 'avif'],
      default: null,
      desc: 'Target output format. Defaults to keeping the original format.',
    },
  ],
  defaultParams,
  normalizeParams,
  outputMime: (file, params) => mimeFor(effectiveFormat(file, params)),
  outputExt: (file, params) => extFor(effectiveFormat(file, params)),
  formatLabel: (params) => {
    const fmt = params.format ? ` ${params.format.toUpperCase()}` : ''
    return `Compress ${params.quality}${fmt}`
  },
  execute,
}
