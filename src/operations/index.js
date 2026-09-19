// Operation registry. Metadata for UI controls; implementations load on demand.
//
// Operation shape:
//   {
//     id:             string
//     label:          string
//     description:    string
//     accepts:        string[] | '*'
//     params:         ParamSpec[]
//     defaultParams:  () => object
//     normalizeParams:(raw) => object
//     outputMime:     (file, params) => string
//     outputExt:      (file, params) => string
//     formatLabel:    (params) => string              // text shown on the result badge
//     execute:        async (file, params) => Blob     // implementation module only
//   }
//
// ParamSpec:
//   { name, type: 'enum'|'integer'|'number'|'string', enum?, min?, max?, default, desc }

const SUPPORTED_OUTPUT = ['png', 'jpeg', 'webp', 'avif']
const DEFAULT_MAX_DIMENSION = 1920
const MAX_OUTPUT_PIXELS = 80_000_000

function convertDefaultParams() {
  return { format: 'webp', quality: 100 }
}

function convertNormalizeParams(raw = {}) {
  const fmt = normalizeFormat(raw.format) || 'webp'
  const format = SUPPORTED_OUTPUT.includes(fmt) ? fmt : 'webp'
  const quality = clamp(Number(raw.quality ?? 100), 1, 100)
  return { format, quality }
}

function compressDefaultParams() {
  return { quality: 75, max_dimension: DEFAULT_MAX_DIMENSION, format: null }
}

function compressNormalizeParams(raw = {}) {
  const quality = clamp(Number(raw.quality ?? 75), 1, 100)
  const maxDim =
    raw.max_dimension == null || raw.max_dimension === 0
      ? null
      : clamp(Number(raw.max_dimension), 16, 16000)
  const format = normalizeFormat(raw.format)
  return { quality, max_dimension: maxDim, format }
}

function resizeDefaultParams() {
  return { scale: null, width: null, height: null, fit: 'stretch', format: null }
}

function resizeNormalizeParams(raw = {}) {
  let scale = null
  if (raw.scale != null && raw.scale !== '') {
    const s = Number(raw.scale)
    if (Number.isFinite(s) && s > 0) scale = clamp(s, 0.01, 20)
  }
  const width = raw.width != null && raw.width !== '' ? clamp(Math.round(Number(raw.width)), 1, 16000) : null
  const height = raw.height != null && raw.height !== '' ? clamp(Math.round(Number(raw.height)), 1, 16000) : null

  let fit = String(raw.fit || '').toLowerCase()
  if (!['stretch', 'crop', 'contain'].includes(fit)) fit = 'stretch'

  const format = normalizeFormat(raw.format)
  return { scale, width, height, fit, format }
}

function effectiveCompressFormat(file, params) {
  if (params.format) return params.format
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/avif') return 'avif'
  return 'jpeg'
}

export const OPERATIONS = [
  {
    id: 'convert_format',
    label: 'Convert',
    description: 'Convert an image from one format to another.',
    accepts: '*',
    params: [
      {
        name: 'format',
        type: 'enum',
        enum: SUPPORTED_OUTPUT,
        default: 'webp',
        desc: 'Target image format.',
      },
      {
        name: 'quality',
        type: 'integer',
        min: 1,
        max: 100,
        default: 100,
        desc: 'Output quality 1-100. Ignored for png. Default 100.',
      },
    ],
    defaultParams: convertDefaultParams,
    normalizeParams: convertNormalizeParams,
    outputMime: (_file, params) => mimeFor(params.format),
    outputExt: (_file, params) => extFor(params.format),
    formatLabel: (params) => {
      const fmt = (params.format || 'webp').toUpperCase()
      if (params.format === 'png' || params.quality === 100) return fmt
      return `${fmt} ${params.quality}`
    },
  },
  {
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
        enum: SUPPORTED_OUTPUT,
        default: null,
        desc: 'Target output format. Defaults to keeping the original format.',
      },
    ],
    defaultParams: compressDefaultParams,
    normalizeParams: compressNormalizeParams,
    outputMime: (file, params) => mimeFor(effectiveCompressFormat(file, params)),
    outputExt: (file, params) => extFor(effectiveCompressFormat(file, params)),
    formatLabel: (params) => {
      const fmt = params.format ? ` ${params.format.toUpperCase()}` : ''
      return `Compress ${params.quality}${fmt}`
    },
  },
  {
    id: 'resize_image',
    label: 'Resize',
    description: 'Resize, scale, crop, or letterbox an image.',
    accepts: '*',
    params: [
      {
        name: 'scale',
        type: 'number',
        min: 0.01,
        max: 20,
        default: null,
        desc: 'Multiplicative scale factor (0.25 = 25%). Use this for percentage requests. Mutually exclusive with width/height.',
      },
      {
        name: 'width',
        type: 'integer',
        min: 1,
        max: 16000,
        default: null,
        desc: 'Target width in pixels. If only width is given, height auto-computes to preserve aspect.',
      },
      {
        name: 'height',
        type: 'integer',
        min: 1,
        max: 16000,
        default: null,
        desc: 'Target height in pixels. If only height is given, width auto-computes to preserve aspect.',
      },
      {
        name: 'fit',
        type: 'enum',
        enum: ['stretch', 'crop', 'contain'],
        default: 'stretch',
        desc: 'How to handle aspect mismatch. stretch=distort, crop=cover and crop, contain=letterbox.',
      },
      {
        name: 'format',
        type: 'enum',
        enum: SUPPORTED_OUTPUT,
        default: null,
        desc: 'Output format. Defaults to original.',
      },
    ],
    defaultParams: resizeDefaultParams,
    normalizeParams: resizeNormalizeParams,
    outputMime: (file, params) => {
      if (params.format) return mimeFor(params.format)
      return file.type || 'image/png'
    },
    outputExt: (file, params) => {
      if (params.format) return extFor(params.format)
      const t = file.type || ''
      if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg'
      if (t === 'image/webp') return 'webp'
      if (t === 'image/avif') return 'avif'
      return 'png'
    },
    formatLabel: (params) => {
      if (params.scale != null) return `Resize ${Math.round(params.scale * 100)}%`
      if (params.width && params.height) return `Resize ${params.width}×${params.height}`
      if (params.width) return `Resize w${params.width}`
      if (params.height) return `Resize h${params.height}`
      return 'Resize'
    },
  },
  {
    id: 'remove_background',
    label: 'Remove BG',
    description: 'Remove the background, leaving the subject on transparency.',
    accepts: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    params: [],
    defaultParams: () => ({}),
    normalizeParams: () => ({}),
    outputMime: () => 'image/png',
    outputExt: () => 'png',
    formatLabel: () => 'Remove BG',
  },
]

const operationLoaders = {
  convert_format: () => import('./convertFormat.js'),
  compress_image: () => import('./compressImage.js'),
  resize_image: () => import('./resizeImage.js'),
  remove_background: () => import('./removeBackground.js'),
}

// Special pseudo-id meaning "do nothing to this image"
export const NOOP = 'none'

const byId = new Map(OPERATIONS.map((op) => [op.id, op]))

export function getOperation(id) {
  if (!id || id === NOOP) return null
  return byId.get(id) || null
}

export function listOperationIds() {
  return OPERATIONS.map((o) => o.id)
}

// Replace the file extension on a filename
export function swapExtension(name, newExt) {
  const dot = name.lastIndexOf('.')
  const base = dot === -1 ? name : name.slice(0, dot)
  return `${base}.${newExt}`
}

// Run an operation against a file. Returns { blob, filename, mime, opId, params }.
// If opId is null/none, returns a passthrough referencing the original file.
export async function runOperation(opId, file, rawParams = {}) {
  const op = getOperation(opId)
  if (!op) {
    return {
      blob: file,
      filename: file.name,
      mime: file.type,
      opId: NOOP,
      params: {},
    }
  }
  if (op.accepts !== '*' && !op.accepts.includes(file.type)) {
    return {
      blob: file,
      filename: file.name,
      mime: file.type,
      opId: NOOP,
      params: {},
      skippedReason: `${op.label} does not support ${file.type || 'unknown'}`,
    }
  }
  const params = op.normalizeParams ? op.normalizeParams(rawParams) : { ...op.defaultParams?.(), ...rawParams }
  const loadOperation = operationLoaders[op.id]
  if (!loadOperation) throw new Error(`Operation implementation missing: ${op.id}`)
  const implementation = (await loadOperation()).default
  const blob = await implementation.execute(file, params)
  const ext = op.outputExt(file, params)
  return {
    blob,
    filename: swapExtension(file.name, ext),
    mime: op.outputMime(file, params),
    opId: op.id,
    params,
  }
}

// Helpers used by individual operations
export function clamp(n, min, max) {
  if (typeof n !== 'number' || Number.isNaN(n)) return min
  return Math.min(Math.max(n, min), max)
}

export function normalizeFormat(fmt) {
  if (!fmt) return null
  const f = String(fmt).toLowerCase().trim()
  if (f === 'jpg' || f === 'jpeg') return 'jpeg'
  if (f === 'png') return 'png'
  if (f === 'webp') return 'webp'
  if (f === 'avif') return 'avif'
  return null
}

export function mimeFor(fmt) {
  const n = normalizeFormat(fmt)
  return n ? `image/${n}` : null
}

export function extFor(fmt) {
  const n = normalizeFormat(fmt)
  if (n === 'jpeg') return 'jpg'
  return n || 'png'
}

export function assertCanvasSize(width, height) {
  const pixels = width * height
  if (pixels > MAX_OUTPUT_PIXELS) {
    throw new Error(
      `Output image is too large (${width}×${height}). Try a smaller size.`,
    )
  }
}
