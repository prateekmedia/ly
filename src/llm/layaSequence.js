/** Port of receptron/laya sequence.ts — Laya token layout without ONNX. */

export const QTYPES = { choice: 0, score: 1, noul: 2 }
const QTYPE_NAMES = ['choice', 'score', 'noul']

export function toInternal(q) {
  let crit = q.criteria
  if (q.type === 'choice' && Array.isArray(crit)) {
    crit = Object.fromEntries(crit.map((c) => [c, null]))
  }
  return {
    t: q.type,
    ins: typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions),
    crit,
  }
}

export function renderOptions(q) {
  if (q.t === 'choice') {
    return Object.entries(q.crit).map(([k, v]) => (v ? `${k}: ${v}` : k))
  }
  if (q.t === 'score') {
    return q.crit.map((c, i) => `level ${i}: ${c}`)
  }
  const c = q.crit ?? {}
  return [
    `false: ${c.false || 'no, the statement does not hold'}`,
    `true: ${c.true || 'yes, the statement holds'}`,
  ]
}

export function pyJsonDumps(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return `[${v.map(pyJsonDumps).join(', ')}]`
  return `{${Object.entries(v)
    .map(([k, x]) => `${JSON.stringify(k)}: ${pyJsonDumps(x)}`)
    .join(', ')}}`
}

export function serializeState(state) {
  return typeof state === 'string' ? state : pyJsonDumps(state)
}

export function tempBucket(qtype, k) {
  const size = k <= 2 ? '2' : k <= 5 ? '3-5' : k <= 10 ? '6-10' : '11+'
  return `${QTYPE_NAMES[qtype]}:${size}`
}

export function confidenceFromProbs(p) {
  const k = p.length
  if (k < 2) return 1
  let ent = 0
  for (const x of p) ent -= x * Math.log(Math.max(x, 1e-12))
  return 1 - ent / Math.log(k)
}

export function softmax(z) {
  const zmax = Math.max(...z)
  const e = z.map((v) => Math.exp(v - zmax))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / sum)
}

export function buildSequence(encode, ids, state, q, maxLen, headMaxLen) {
  const scrub = (s) => s.split(ids.maskTok).join(' ')
  const opts = renderOptions(q)
  let headIds = encode(`${q.t} question: ${scrub(q.ins)}`)
  let optIds = opts.map((o) => [ids.mask, ...encode(` ${scrub(o)}`).slice(0, 48)])
  const total = (xs) => xs.reduce((s, o) => s + o.length, 0)
  let optBudget = headMaxLen - total(optIds)
  if (optBudget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)))
    optIds = optIds.map((o) => o.slice(0, per))
    optBudget = headMaxLen - total(optIds)
  }
  headIds = headIds.slice(0, Math.max(8, optBudget))
  const seq = [ids.cls, ...headIds, ids.sep]
  const markers = []
  for (const o of optIds) {
    markers.push(seq.length)
    seq.push(...o)
  }
  seq.push(ids.sep)
  const room = Math.max(0, maxLen - seq.length - 1)
  const st = encode(scrub(serializeState(state))).slice(0, room)
  seq.push(...st, ids.sep)
  return { ids: seq.slice(0, maxLen), markers: markers.filter((m) => m < maxLen) }
}
