// Convert any browser-decodable image to a chosen format.
// Output formats: png, jpeg, webp (avif is best-effort if browser supports it).

import { assertCanvasSize, clamp, normalizeFormat, mimeFor, extFor } from './index.js'

const SUPPORTED_OUTPUT = ['png', 'jpeg', 'webp', 'avif']

function defaultParams() {
  return { format: 'webp', quality: 100 }
}

function normalizeParams(raw = {}) {
  const fmt = normalizeFormat(raw.format) || 'webp'
  const format = SUPPORTED_OUTPUT.includes(fmt) ? fmt : 'webp'
  const quality = clamp(Number(raw.quality ?? 100), 1, 100)
  return { format, quality }
}

async function execute(file, params) {
  const { format, quality } = params
  const bitmap = await createImageBitmap(file)
  try {
    assertCanvasSize(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)

    const mime = mimeFor(format)
    // PNG ignores quality entirely
    const q = format === 'png' ? undefined : quality / 100
    return await canvas.convertToBlob({ type: mime, quality: q })
  } finally {
    bitmap.close()
  }
}

export default {
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
  defaultParams,
  normalizeParams,
  outputMime: (_file, params) => mimeFor(params.format),
  outputExt: (_file, params) => extFor(params.format),
  formatLabel: (params) => {
    const fmt = (params.format || 'webp').toUpperCase()
    if (params.format === 'png' || params.quality === 100) return fmt
    return `${fmt} ${params.quality}`
  },
  execute,
}
