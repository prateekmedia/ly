// Web Worker that hosts the WebGPU LLM via @huggingface/transformers.
//
// Message protocol (from main thread):
//   { type: 'load' }                          -> begin downloading + initializing model
//   { type: 'generate', id, messages, options }  -> run a chat-style inference
//
// Messages emitted to main thread:
//   { type: 'status', status: 'idle'|'loading'|'ready'|'error', message? }
//   { type: 'progress', file, progress, loaded, total }   // raw transformers.js progress
//   { type: 'result', id, text }
//   { type: 'error', id?, message }

import { pipeline, env } from '@huggingface/transformers'

// Use WebGPU; let transformers.js cache the model in IndexedDB.
env.allowLocalModels = false
env.useBrowserCache = true

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

let generatorPromise = null

function send(msg) {
  self.postMessage(msg)
}

async function ensureGenerator() {
  if (generatorPromise) return generatorPromise

  send({ type: 'status', status: 'loading', message: 'Initializing WebGPU…' })

  generatorPromise = pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    dtype: 'q4',
    progress_callback: (data) => {
      // transformers.js emits a stream of progress events. We forward the ones
      // that carry a numeric progress so the UI can render a bar.
      if (typeof data?.progress === 'number') {
        send({
          type: 'progress',
          file: data.file,
          progress: data.progress,
          loaded: data.loaded,
          total: data.total,
        })
      } else if (data?.status) {
        send({ type: 'status', status: 'loading', message: data.status })
      }
    },
  })

  try {
    const generator = await generatorPromise
    // Warm up the model so the first real generation is fast.
    send({ type: 'status', status: 'loading', message: 'Warming up…' })
    await generator('Hi', { max_new_tokens: 1 })
    send({ type: 'status', status: 'ready' })
    return generator
  } catch (err) {
    generatorPromise = null
    // Log the raw error for debugging; surface only a generic message to the UI
    console.error('[llmWorker] setup failed', err)
    send({ type: 'status', status: 'error', message: 'Setup failed' })
    throw err
  }
}

async function disposeGenerator() {
  if (!generatorPromise) {
    send({ type: 'status', status: 'idle' })
    return
  }
  try {
    const generator = await generatorPromise
    // transformers.js v4: pipeline exposes the underlying model. Calling
    // .dispose() releases ONNX session memory (WebGPU buffers, WASM heap).
    if (generator?.model?.dispose) {
      await generator.model.dispose()
    } else if (generator?.dispose) {
      await generator.dispose()
    }
  } catch {
    // ignore — best effort
  }
  generatorPromise = null
  send({ type: 'status', status: 'idle' })
}

async function handleGenerate({ id, messages, options }) {
  try {
    const generator = await ensureGenerator()
    const out = await generator(messages, {
      max_new_tokens: 256,
      do_sample: false,
      temperature: 0,
      ...(options || {}),
    })
    // For chat-style input transformers.js returns the full chat with the
    // assistant message at the end.
    const last = out?.[0]?.generated_text
    let text = ''
    if (Array.isArray(last)) {
      text = last[last.length - 1]?.content ?? ''
    } else if (typeof last === 'string') {
      text = last
    }
    send({ type: 'result', id, text })
  } catch (err) {
    console.error('[llmWorker] generate failed', err)
    send({ type: 'error', id, message: 'Generation failed' })
  }
}

self.addEventListener('message', (e) => {
  const msg = e.data
  if (!msg) return
  if (msg.type === 'load') {
    ensureGenerator().catch(() => {
      // status:error already sent
    })
    return
  }
  if (msg.type === 'generate') {
    handleGenerate(msg)
    return
  }
  if (msg.type === 'dispose') {
    disposeGenerator()
    return
  }
})
