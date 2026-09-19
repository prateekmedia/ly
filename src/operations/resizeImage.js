// Resize / scale / crop / letterbox an image.
//
// Sizing modes (one of):
//   - scale:   number > 0     (e.g. 0.25 for 25%, 2 for 200%)
//   - width:   integer pixels (height computed from aspect if missing)
//   - height:  integer pixels (width computed from aspect if missing)
//   - both width + height: an exact target box
//
// fit:
//   - 'stretch'  : ignore aspect ratio, distort to exact box (default when both
//                  width and height are given)
//   - 'crop'     : preserve aspect, scale to cover, crop overflow
//   - 'contain'  : preserve aspect, scale to fit, transparent letterbox padding

import { assertCanvasSize, clamp, normalizeFormat, mimeFor, extFor } from './index.js'

function defaultParams() {
  return { scale: null, width: null, height: null, fit: 'stretch', format: null }
}

function normalizeParams(raw = {}) {
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

function computeTarget(srcW, srcH, params) {
  if (params.scale != null) {
    return {
      w: Math.max(1, Math.round(srcW * params.scale)),
      h: Math.max(1, Math.round(srcH * params.scale)),
    }
  }
  let w = params.width
  let h = params.height
  if (w && !h) h = Math.round(srcH * (w / srcW))
  else if (h && !w) w = Math.round(srcW * (h / srcH))
  if (!w || !h) return { w: srcW, h: srcH }
  return { w, h }
}

function drawWithFit(ctx, bitmap, dstW, dstH, fit) {
  if (fit === 'stretch') {
    ctx.drawImage(bitmap, 0, 0, dstW, dstH)
    return
  }
  const srcW = bitmap.width
  const srcH = bitmap.height
  const srcRatio = srcW / srcH
  const dstRatio = dstW / dstH

  if (fit === 'crop') {
    // cover: pick a source rect with the destination's aspect ratio
    let sw, sh, sx, sy
    if (srcRatio > dstRatio) {
      sh = srcH
      sw = srcH * dstRatio
      sx = (srcW - sw) / 2
      sy = 0
    } else {
      sw = srcW
      sh = srcW / dstRatio
      sx = 0
      sy = (srcH - sh) / 2
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dstW, dstH)
    return
  }

  // contain: letterbox; canvas already starts transparent
  let dw, dh, dx, dy
  if (srcRatio > dstRatio) {
    dw = dstW
    dh = dstW / srcRatio
    dx = 0
    dy = (dstH - dh) / 2
  } else {
    dh = dstH
    dw = dstH * srcRatio
    dx = (dstW - dw) / 2
    dy = 0
  }
  ctx.drawImage(bitmap, 0, 0, srcW, srcH, dx, dy, dw, dh)
}

async function execute(file, params) {
  const bitmap = await createImageBitmap(file)
  try {
    const { w, h } = computeTarget(bitmap.width, bitmap.height, params)
    assertCanvasSize(w, h)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    drawWithFit(ctx, bitmap, w, h, params.fit)

    const targetFormat = params.format || normalizeFormat(file.type?.replace('image/', '')) || 'png'
    const mime = mimeFor(targetFormat) || 'image/png'
    const q = targetFormat === 'png' ? undefined : 0.92
    return await canvas.convertToBlob({ type: mime, quality: q })
  } finally {
    bitmap.close()
  }
}

export default {
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
      enum: ['png', 'jpeg', 'webp', 'avif'],
      default: null,
      desc: 'Output format. Defaults to original.',
    },
  ],
  defaultParams,
  normalizeParams,
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
  execute,
}
