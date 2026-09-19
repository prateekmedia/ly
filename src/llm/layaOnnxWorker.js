// Web Worker: Mattepiu/laya-onnx int8 via onnxruntime-web (WASM).
//
// Messages in:  { type: 'load' } | { type: 'predict', id, state, questions } | { type: 'dispose' }
// Messages out: status, progress, result, error

import * as ort from 'onnxruntime-web'
import { Tokenizer } from '@huggingface/tokenizers'
import { LAYA_ASSETS, LAYA_CONFIG, OPERATION_QUESTION } from './layaConstants.js'
import {
  buildSequence,
  confidenceFromProbs,
  QTYPES,
  renderOptions,
  softmax,
  tempBucket,
  toInternal,
} from './layaSequence.js'

const CACHE_NAME = 'ly-laya-onnx-v1'
const round4 = (x) => Math.round(x * 1e4) / 1e4

let session = null
let tok = null
let specialIds = null

function send(msg) {
  self.postMessage(msg)
}

function configureOrt() {
  const base = import.meta.env.BASE_URL || '/'
  const wasmBase = new URL('ort-wasm/', new URL(base, self.location.href)).href
  ort.env.wasm.wasmPaths = wasmBase
  if (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) {
    ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1)
  } else {
    ort.env.wasm.numThreads = 1
  }
}

async function fetchWithProgress(url, label) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(url)
  if (cached) {
    const buf = await cached.arrayBuffer()
    send({ type: 'progress', file: label, progress: 100, loaded: buf.byteLength, total: buf.byteLength })
    return buf
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${label} (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body) {
    const buf = await res.arrayBuffer()
    await cache.put(url, new Response(buf))
    send({ type: 'progress', file: label, progress: 100, loaded: buf.byteLength, total: buf.byteLength || buf.byteLength })
    return buf
  }

  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    if (total > 0) {
      send({
        type: 'progress',
        file: label,
        progress: Math.min(100, (loaded / total) * 100),
        loaded,
        total,
      })
    }
  }
  const buf = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    buf.set(c, off)
    off += c.byteLength
  }
  await cache.put(url, new Response(buf))
  send({ type: 'progress', file: label, progress: 100, loaded, total: total || loaded })
  return buf.buffer
}

function resolveSpecialIds(tokenizer) {
  const id = (t) => {
    const v = tokenizer.token_to_id(t)
    if (v === undefined) throw new Error(`tokenizer missing token ${t}`)
    return v
  }
  const padCandidates = ['[PAD]', '[PAD]', '<pad>']
  let pad = null
  for (const p of padCandidates) {
    const v = tokenizer.token_to_id(p)
    if (v !== undefined) {
      pad = v
      break
    }
  }
  if (pad === null) pad = id('[PAD]')
  return {
    cls: id('[CLS]'),
    sep: id('[SEP]'),
    mask: id('[MASK]'),
    pad,
    maskTok: '[MASK]',
  }
}

async function ensureLoaded() {
  if (session && tok) return

  configureOrt()
  send({ type: 'status', status: 'loading', message: 'Downloading tokenizer…' })

  const [tokJson, tokCfg] = await Promise.all([
    fetch(LAYA_ASSETS.tokenizer).then((r) => r.json()),
    fetch(LAYA_ASSETS.tokenizerConfig).then((r) => r.json()),
  ])
  tok = new Tokenizer(tokJson, tokCfg)
  specialIds = resolveSpecialIds(tok)

  send({ type: 'status', status: 'loading', message: 'Downloading Laya ONNX (~580 MB)…' })
  const modelBuf = await fetchWithProgress(LAYA_ASSETS.model, 'laya_int8.onnx')

  send({ type: 'status', status: 'loading', message: 'Initializing ONNX…' })
  session = await ort.InferenceSession.create(modelBuf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })

  send({ type: 'status', status: 'loading', message: 'Warming up…' })
  await runSystemOne({ instruction: 'warm up' }, { operation: OPERATION_QUESTION.operation })
  send({ type: 'status', status: 'ready' })
}

function encode(text) {
  return tok.encode(text, { add_special_tokens: false }).ids
}

async function runSystemOne(state, questions) {
  const qids = Object.keys(questions)
  const items = qids.map((qid) => {
    const q = toInternal(questions[qid])
    const { ids, markers } = buildSequence(
      encode,
      specialIds,
      state,
      q,
      LAYA_CONFIG.max_len,
      LAYA_CONFIG.head_max_len,
    )
    if (markers.length !== renderOptions(q).length) {
      throw new Error(`question ${qid}: options do not fit in head_max_len`)
    }
    return { qid, q, ids, markers, qtype: QTYPES[q.t] }
  })

  const n = items.length
  const L = Math.max(...items.map((it) => it.ids.length))
  const K = Math.max(...items.map((it) => it.markers.length))

  const inputIds = new BigInt64Array(n * L)
  inputIds.fill(BigInt(specialIds.pad))
  const attention = new BigInt64Array(n * L)
  const markerPos = new BigInt64Array(n * K)
  const markerMask = new Uint8Array(n * K)
  const qtype = new BigInt64Array(n)

  items.forEach((it, i) => {
    it.ids.forEach((v, j) => {
      inputIds[i * L + j] = BigInt(v)
      attention[i * L + j] = 1n
    })
    it.markers.forEach((m, j) => {
      markerPos[i * K + j] = BigInt(m)
      markerMask[i * K + j] = 1
    })
    qtype[i] = BigInt(it.qtype)
  })

  const feeds = {
    input_ids: new ort.Tensor('int64', inputIds, [n, L]),
    attention_mask: new ort.Tensor('int64', attention, [n, L]),
    marker_pos: new ort.Tensor('int64', markerPos, [n, K]),
    marker_mask: new ort.Tensor('bool', markerMask, [n, K]),
    qtype: new ort.Tensor('int64', qtype, [n]),
  }

  const out = await session.run(feeds)
  const logitsT = out.logits ?? out[Object.keys(out)[0]]
  const logits = logitsT.data
  if (!(logits instanceof Float32Array)) {
    throw new Error('unexpected logits output')
  }

  const answers = {}
  items.forEach((it, r) => {
    const k = it.markers.length
    const bucket = tempBucket(it.qtype, k)
    const temp =
      LAYA_CONFIG.temperature_by_options[bucket] ?? LAYA_CONFIG.temperature[it.qtype] ?? 1
    const slice = Array.from(logits.subarray(r * K, r * K + k), (v) => v / temp)
    const p = softmax(slice)
    const q = it.q
    if (q.t === 'choice') {
      const keys = Object.keys(q.crit)
      const best = p.indexOf(Math.max(...p))
      answers[it.qid] = {
        type: 'choice',
        choice: keys[best],
        probabilities: Object.fromEntries(keys.map((kk, i) => [kk, round4(p[i] ?? 0)])),
        confidence: round4(confidenceFromProbs(p)),
      }
    } else if (q.t === 'score') {
      answers[it.qid] = {
        type: 'score',
        score: round4(p.reduce((s, v, i) => s + i * v, 0)),
        confidence: round4(confidenceFromProbs(p)),
      }
    } else {
      answers[it.qid] = { type: 'noul', noul: round4(p[1] ?? 0) }
    }
  })

  return answers
}

async function disposeSession() {
  if (session) {
    try {
      await session.release()
    } catch {
      // ignore
    }
    session = null
  }
  tok = null
  specialIds = null
  send({ type: 'status', status: 'idle' })
}

self.addEventListener('message', (e) => {
  const msg = e.data
  if (!msg) return
  if (msg.type === 'load') {
    ensureLoaded().catch((err) => {
      console.error('[layaOnnxWorker] setup failed', err)
      send({ type: 'status', status: 'error', message: 'Setup failed' })
    })
    return
  }
  if (msg.type === 'dispose') {
    disposeSession()
    return
  }
  if (msg.type === 'predict') {
    ;(async () => {
      try {
        await ensureLoaded()
        const answers = await runSystemOne(msg.state, msg.questions)
        send({ type: 'result', id: msg.id, answers })
      } catch (err) {
        console.error('[layaOnnxWorker] predict failed', err)
        send({ type: 'error', id: msg.id, message: 'Prediction failed' })
      }
    })()
  }
})
