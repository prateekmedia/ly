/** Mattepiu/laya-onnx (int8) + calibration from convaiinnovations/laya. */

export const LAYA_ONNX_REPO = 'Mattepiu/laya-onnx'
export const LAYA_HF_BASE = `https://huggingface.co/${LAYA_ONNX_REPO}/resolve/main`

export const LAYA_ASSETS = {
  model: `${LAYA_HF_BASE}/int8/laya_int8.onnx`,
  tokenizer: `${LAYA_HF_BASE}/tokenizer.json`,
  tokenizerConfig: `${LAYA_HF_BASE}/tokenizer_config.json`,
}

export const LAYA_CONFIG = {
  max_len: 512,
  head_max_len: 192,
  temperature: [1.6369030475616455, 1.2514300346374512, 1.983399510383606],
  temperature_by_options: {
    'choice:3-5': 1.7601518630981445,
    'choice:6-10': 1.0000158548355103,
    'score:3-5': 1.2514300346374512,
    'noul:2': 1.983399510383606,
    'choice:11+': 0.10058280825614929,
    'choice:2': 1.9063563346862793,
  },
}

export const OPERATION_QUESTION = {
  operation: {
    type: 'choice',
    instructions: 'Which single image operation does `instruction` request?',
    criteria: {
      remove_background: 'remove or cut out the background, transparent background, isolate subject',
      convert_format: 'convert, save as, export as, or change to png jpeg webp or avif',
      compress_image: 'compress, optimize, shrink file size, reduce file size without focusing on pixel dimensions',
      resize_image: 'resize, scale, crop, change width height, or percentage size',
      none: 'no clear image operation, empty, or unrelated text',
    },
  },
}
