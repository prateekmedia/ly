// Background removal via MediaPipe Tasks Vision ImageSegmenter.
//
// Runs on the main thread (not in a worker) because:
//   - MediaPipe with delegate: 'GPU' uses WebGL. The GPU handles the tensor
//     work asynchronously, so the main thread doesn't actually block on
//     inference even though segment() looks synchronous.
//   - MediaPipe's bundled FilesetResolver calls self.import() to load the
//     WASM shim. Safari module workers do not expose self.import, so running
//     in a worker just fails immediately. The main thread has it via the
//     standard global import().
//   - The segmenter is small (~250 KB model + WASM glue). No reason to
//     duplicate it across threads.

import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import { assertCanvasSize } from './index.js'

// Local copy of the MediaPipe WASM files. See public/mediapipe-wasm/.
const WASM_BASE = `${window.location.origin}/mediapipe-wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

let segmenterPromise = null

function getSegmenter() {
  if (segmenterPromise) return segmenterPromise
  segmenterPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
    return await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })
  })()
  return segmenterPromise
}

async function execute(file /* , params */) {
  const segmenter = await getSegmenter()
  const bitmap = await createImageBitmap(file)
  let mask = null

  try {
    assertCanvasSize(bitmap.width, bitmap.height)

    // Run the segmenter. Returns immediately with a result that points at
    // GPU-side data; getAsFloat32Array() pulls the mask back to JS.
    const result = segmenter.segment(bitmap)
    mask = result.confidenceMasks[0]
    const maskW = mask.width
    const maskH = mask.height
    const maskData = mask.getAsFloat32Array()

    // Convert the foreground confidence mask (0..1 floats) into a small
    // grayscale alpha texture.
    const maskCanvas = new OffscreenCanvas(maskW, maskH)
    const maskCtx = maskCanvas.getContext('2d')
    const maskImg = maskCtx.createImageData(maskW, maskH)
    for (let i = 0; i < maskData.length; i++) {
      const a = Math.round(Math.min(1, Math.max(0, maskData[i])) * 255)
      const o = i * 4
      maskImg.data[o] = 255
      maskImg.data[o + 1] = 255
      maskImg.data[o + 2] = 255
      maskImg.data[o + 3] = a
    }
    maskCtx.putImageData(maskImg, 0, 0)

    // Composite onto the FULL-resolution original. Canvas bilinearly upscales
    // the small mask, smoothing the edges, while the source pixels stay at
    // their native resolution. Result: 4K input → 4K transparent PNG output.
    const out = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = out.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskCanvas, 0, 0, bitmap.width, bitmap.height)
    ctx.globalCompositeOperation = 'source-over'

    return await out.convertToBlob({ type: 'image/png' })
  } finally {
    if (mask) mask.close()
    bitmap.close()
  }
}

export default {
  id: 'remove_background',
  label: 'Remove BG',
  description: 'Remove the background, leaving the subject on transparency.',
  llmDescription:
    'Remove the background from an image. Use when the user asks to remove background, cut out subject, make background transparent, isolate the subject, or knock out the background. Output is always PNG with transparency.',
  accepts: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  params: [],
  defaultParams: () => ({}),
  normalizeParams: () => ({}),
  outputMime: () => 'image/png',
  outputExt: () => 'png',
  formatLabel: () => 'Remove BG',
  execute,
}
