// Setup state. Inline for idle/error, floating toast for loading so it stays
// visible regardless of which page the user is scrolled to.

import { useEffect, useState } from 'react'
import sumBy from 'lodash/sumBy'
import { subscribe, loadModel } from '../llm/llmClient.js'

function formatBytes(n) {
  if (!n || !Number.isFinite(n)) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 1 ? 1 : 0)} ${units[i]}`
}

export default function ModelLoader() {
  const [snap, setSnap] = useState({
    status: 'idle',
    error: null,
    files: {},
    overallProgress: 0,
  })

  useEffect(() => subscribe(setSnap), [])

  const { status, error, files, overallProgress } = snap

  if (status === 'error') {
    // Log the raw error for debugging; show only friendly copy in the UI.
    if (error) console.error('[setup]', error)
    return (
      <div className='setup-card is-error'>
        <span>Setup didn’t work. Try again, or use Chrome or Edge.</span>
        <button type='button' onClick={() => loadModel()}>Try again</button>
      </div>
    )
  }

  // Only show the toast while bytes are actively flowing in. When the model is
  // cached, transformers.js still emits progress events but loaded === total
  // immediately, so we'd otherwise show a stuck "100%" toast during the
  // (separate) WebGPU shader warm-up phase. Hide once we hit 100%.
  const fileProgress = Object.values(files)
  const totalBytes = sumBy(fileProgress, (f) => f.total || 0)
  const loadedBytes = sumBy(fileProgress, (f) => f.loaded || 0)
  const isDownloading =
    status === 'loading' && totalBytes > 0 && loadedBytes < totalBytes
  if (isDownloading) {
    const pct = Math.round(overallProgress * 100)
    return (
      <div className='setup-toast' role='status' aria-live='polite'>
        <div className='setup-toast-row'>
          <span className='setup-toast-title'>Getting ready</span>
          <span className='setup-toast-pct'>{pct}%</span>
        </div>
        <div className='setup-toast-sub'>
          {formatBytes(loadedBytes)} of {formatBytes(totalBytes)}
        </div>
        <div className='setup-toast-bar'>
          <div className='setup-toast-bar-fill' style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  // idle, loading-without-bytes, ready → nothing to show
  return null
}
