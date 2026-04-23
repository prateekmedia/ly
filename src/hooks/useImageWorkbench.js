import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import compact from 'lodash/compact'
import keyBy from 'lodash/keyBy'
import { TAGLINES } from '../constants/taglines.js'
import { planOperations } from '../llm/intentParser.js'
import { getStatus, subscribe, waitForReady, disposeModel } from '../llm/llmClient.js'
import { runOperation, getOperation, NOOP } from '../operations/index.js'
import {
  OP_MODE_AUTO,
  advanceTagline,
  appendBatch,
  appendStaged,
  applyOperationPlan,
  cancelEdit as cancelEditState,
  clearComposerAfterSubmit,
  patchBatch as patchBatchState,
  patchItem as patchItemState,
  removeStaged as removeStagedState,
  replaceBatch,
  setDragging,
  setLightboxImg,
  setManualParam as setManualParamState,
  setOpMode,
  setText,
  startEditingBatch,
} from '../store/appSlice.js'
import { fileMetadata, newBatchId, newStagedId } from '../utils/imageMetadata.js'
import { useAssetRegistry } from './useAssetRegistry.js'

export function useImageWorkbench() {
  const dispatch = useDispatch()
  const state = useSelector((store) => store.app)
  const {
    text,
    staged,
    batches,
    lightboxImg,
    editingBatchId,
    opMode,
    manualParams,
  } = state
  const [, forceRerender] = useState(0)

  const fileInputRef = useRef(null)
  const dragCounter = useRef(0)
  const composerRef = useRef(null)
  const historyRef = useRef(null)
  const prevBatchCount = useRef(0)
  const batchesByIdRef = useRef({})
  const processingChain = useRef(Promise.resolve())
  const assets = useAssetRegistry()
  const batchesById = useMemo(() => keyBy(batches, 'id'), [batches])

  useEffect(() => { batchesByIdRef.current = batchesById }, [batchesById])
  useEffect(() => subscribe(() => forceRerender((n) => n + 1)), [])

  useEffect(() => {
    const id = setInterval(() => {
      dispatch(advanceTagline(TAGLINES.length))
    }, 1690)
    return () => clearInterval(id)
  }, [dispatch])

  useEffect(() => {
    if (!lightboxImg) return
    const onKey = (e) => {
      if (e.key === 'Escape') dispatch(setLightboxImg(null))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, lightboxImg])

  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        console.warn('[bfcache] page restored from cache, forcing hard reload')
        window.location.reload()
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  useEffect(() => {
    const hasWorkInFlight = batches.some(
      (batch) => batch.status === 'planning' || batch.status === 'processing',
    )
    if (!hasWorkInFlight) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [batches])

  useEffect(() => {
    if (batches.length > prevBatchCount.current && historyRef.current) {
      requestAnimationFrame(() => {
        historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    prevBatchCount.current = batches.length
  }, [batches.length])

  const currentManualOp = opMode === OP_MODE_AUTO ? null : getOperation(opMode)
  const currentManualParams = (() => {
    if (!currentManualOp) return {}
    const defaults = currentManualOp.defaultParams?.() || {}
    const overrides = manualParams[opMode] || {}
    return { ...defaults, ...overrides }
  })()

  const patchItem = (batchId, itemId, patch) => {
    dispatch(patchItemState({ batchId, itemId, patch }))
  }

  const patchBatch = (batchId, patch) => {
    dispatch(patchBatchState({ batchId, patch }))
  }

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (incoming.length === 0) return
    const next = incoming.map((file) => {
      const id = newStagedId(file)
      assets.registerFileAsset(id, file)
      return fileMetadata(id, file)
    })
    dispatch(appendStaged(next))
  }

  const buildItems = (stagedList) =>
    stagedList.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      size: item.size,
      lastModified: item.lastModified,
      status: 'pending',
      opId: null,
      params: {},
      processedFilename: null,
      error: null,
      skippedReason: null,
    }))

  const processBatch = async (batch) => {
    const batchId = batch.id
    const mark = (label) => {
      if (!import.meta.env.DEV) return
      const mem = performance?.memory?.usedJSHeapSize
      const memStr = mem ? ` heap=${(mem / 1048576).toFixed(0)}MB` : ''
      console.log(`[batch ${batchId.slice(-5)}] ${label} t=${(performance.now() / 1000).toFixed(1)}s${memStr}`)
    }

    mark('start')

    let ops
    if (batch.forcedOpId && batch.forcedOpId !== OP_MODE_AUTO) {
      const op = getOperation(batch.forcedOpId)
      const defaults = op?.defaultParams ? op.defaultParams() : {}
      const merged = { ...defaults, ...(batch.forcedParams || {}) }
      const params = op?.normalizeParams ? op.normalizeParams(merged) : merged
      ops = batch.items.map(() => ({ opId: batch.forcedOpId, params }))
      mark(`manual op: ${batch.forcedOpId}`)
    } else {
      let useLLM = false
      try {
        await waitForReady()
        useLLM = getStatus() === 'ready'
        mark('llm ready')
      } catch {
        useLLM = false
        mark('llm setup failed')
      }

      ops = await planOperations({
        instruction: batch.prompt,
        images: batch.items.map((item) => ({
          file: assets.getAsset(item.id)?.file,
          name: item.name,
        })),
        useLLM,
      })
      mark('plan done')

      if (useLLM) {
        disposeModel()
        mark('llm disposed')
      }
    }

    dispatch(applyOperationPlan({ batchId, ops, noop: NOOP }))

    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i]
      const assignment = ops[i]
      if (!assignment || assignment.opId === NOOP) continue

      patchItem(batchId, item.id, { status: 'processing' })
      mark(`op ${i} start: ${assignment.opId}`)
      try {
        const file = assets.getAsset(item.id)?.file
        if (!file) throw new Error('Source image is no longer available')
        const result = await runOperation(assignment.opId, file, assignment.params)
        mark(`op ${i} done: ${assignment.opId}`)
        assets.setProcessedAsset(item.id, result.blob)
        patchItem(batchId, item.id, {
          status: result.skippedReason ? 'skipped' : 'done',
          processedFilename: result.filename,
          opId: result.opId,
          params: result.params,
          skippedReason: result.skippedReason || null,
          error: null,
        })
      } catch (err) {
        console.error('[op] failed', { opId: assignment.opId, params: assignment.params, file: item.name }, err)
        mark(`op ${i} FAILED: ${assignment.opId}`)
        patchItem(batchId, item.id, {
          status: 'error',
          error: err?.message || 'Operation failed',
        })
      }
    }

    mark('batch done')
    patchBatch(batchId, { status: 'done' })
  }

  const enqueueBatch = (batch) => {
    processingChain.current = processingChain.current
      .catch(() => {})
      .then(() => processBatch(batch))
    return processingChain.current
  }

  const submitNewBatch = () => {
    const newBatch = {
      id: newBatchId(),
      prompt: opMode === OP_MODE_AUTO ? text.trim() : '',
      forcedOpId: opMode === OP_MODE_AUTO ? null : opMode,
      forcedParams: opMode === OP_MODE_AUTO ? null : { ...currentManualParams },
      status: 'planning',
      items: buildItems(staged),
    }
    dispatch(appendBatch(newBatch))
    dispatch(clearComposerAfterSubmit())

    enqueueBatch(newBatch).catch((err) => {
      patchBatch(newBatch.id, { status: 'done' })
      console.error('Batch failed', err)
    })
  }

  const canSend =
    staged.length > 0 && (opMode !== OP_MODE_AUTO || text.trim().length > 0)

  const actions = {
    setText: (value) => dispatch(setText(value)),
    setOpMode: (value) => dispatch(setOpMode(value)),
    setManualParam: (paramName, value) => {
      dispatch(setManualParamState({ opMode, paramName, value }))
    },
    setLightboxImg: (value) => dispatch(setLightboxImg(value)),
    closeLightbox: () => dispatch(setLightboxImg(null)),
    addFiles,
    removeStaged: (id) => {
      assets.cleanupAsset(id)
      dispatch(removeStagedState(id))
    },
    handleFileInput: (e) => {
      if (e.target.files) addFiles(e.target.files)
      e.target.value = ''
    },
    handleDragEnter: (e) => {
      e.preventDefault(); e.stopPropagation()
      dragCounter.current += 1
      if (e.dataTransfer?.items?.length) dispatch(setDragging(true))
    },
    handleDragLeave: (e) => {
      e.preventDefault(); e.stopPropagation()
      dragCounter.current -= 1
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        dispatch(setDragging(false))
      }
    },
    handleDragOver: (e) => {
      e.preventDefault(); e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    },
    handleDrop: (e) => {
      e.preventDefault(); e.stopPropagation()
      dragCounter.current = 0
      dispatch(setDragging(false))
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
    },
    handlePaste: (e) => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length > 0) {
        e.preventDefault()
        addFiles(files)
      }
    },
    handleSend: () => {
      if (!canSend) return

      if (editingBatchId) {
        const targetId = editingBatchId
        const target = batchesByIdRef.current[targetId]
        if (!target) {
          submitNewBatch()
          return
        }
        assets.cleanupAssets(target.items)
        const newItems = buildItems(staged)
        const updatedBatch = {
          ...target,
          prompt: opMode === OP_MODE_AUTO ? text.trim() : '',
          forcedOpId: opMode === OP_MODE_AUTO ? null : opMode,
          forcedParams: opMode === OP_MODE_AUTO ? null : { ...currentManualParams },
          status: 'planning',
          items: newItems,
        }
        dispatch(replaceBatch(updatedBatch))
        dispatch(clearComposerAfterSubmit())
        enqueueBatch(updatedBatch).catch((err) => {
          patchBatch(targetId, { status: 'done' })
          console.error('Edit failed', err)
        })
        return
      }

      submitNewBatch()
    },
    handleEdit: (batch) => {
      assets.cleanupAssets(staged)
      const files = compact(batch.items.map((item) => assets.getAsset(item.id)?.file))
      const next = files.map((file) => {
        const id = newStagedId(file)
        assets.registerFileAsset(id, file)
        return fileMetadata(id, file)
      })
      dispatch(startEditingBatch({
        batchId: batch.id,
        staged: next,
        text: batch.prompt || '',
        opMode: batch.forcedOpId || OP_MODE_AUTO,
        forcedParams: batch.forcedParams,
      }))
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    cancelEdit: () => {
      assets.cleanupAssets(staged)
      dispatch(cancelEditState())
    },
    triggerDownload: (item) => {
      const asset = assets.getAsset(item.id)
      const blob = asset?.processedBlob
      const name = item.processedFilename || item.name || 'image'
      if (!blob) {
        if (!asset?.srcUrl) return
        const a = document.createElement('a')
        a.href = asset.srcUrl
        a.download = item.name || 'image'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    handleDownloadAll: (batch) => {
      batch.items.forEach((item, index) => {
        setTimeout(() => actions.triggerDownload(item), index * 150)
      })
    },
    handleKeyDown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        actions.handleSend()
      }
    },
  }

  const selectors = {
    getPreviewUrl: (item) => assets.getAsset(item.id)?.srcUrl || '',
    displayUrl: (item) => {
      const asset = assets.getAsset(item.id)
      return asset?.processedUrl || asset?.srcUrl || ''
    },
    displayName: (item) => item.processedFilename || item.name,
    lightboxUrl: (lightbox) => {
      const asset = assets.getAsset(lightbox.itemId)
      return asset?.processedUrl || asset?.srcUrl || ''
    },
    batchIsUndetermined: (batch) =>
      batch.status === 'done' && batch.items.every((item) => !item.opId || item.opId === NOOP),
    opLabelFor: (item) => {
      const op = getOperation(item.opId)
      if (!op) return null
      if (op.formatLabel) return op.formatLabel(item.params || {})
      return op.label
    },
  }

  return {
    state,
    currentManualOp,
    currentManualParams,
    canSend,
    refs: {
      fileInputRef,
      composerRef,
      historyRef,
    },
    actions,
    selectors,
  }
}
