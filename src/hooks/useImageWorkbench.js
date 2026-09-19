import { useCallback, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import compact from 'lodash/compact'
import { TAGLINES } from '@/constants/taglines.js'
import { getOperation, NOOP } from '@/operations/index.js'
import {
  OP_MODE_AUTO,
  advanceTagline,
  appendBatch,
  appendStaged,
  cancelEdit as cancelEditState,
  clearComposerAfterSubmit,
  removeStaged as removeStagedState,
  replaceBatch,
  setDragging,
  setLightboxImg,
  setManualParam as setManualParamState,
  setOpMode,
  setText,
  startEditingBatch,
} from '@/store/appSlice.js'
import { store } from '@/store/store.js'
import { fileMetadata, newBatchId, newStagedId } from '@/utils/imageMetadata.js'
import { useAssetRegistry } from '@/hooks/useAssetRegistry.js'
import { useBatchProcessor } from '@/hooks/useBatchProcessor.js'

const MAX_STAGED = 50

export function useImageWorkbench({ mainRef } = {}) {
  const dispatch = useDispatch()
  const state = useSelector((state) => state.app)
  const {
    text,
    staged,
    batches,
    lightboxImg,
    editingBatchId,
    opMode,
    manualParams,
  } = state
  const fileInputRef = useRef(null)
  const dragCounter = useRef(0)
  const composerRef = useRef(null)
  const historyRef = useRef(null)
  const downloadingRef = useRef(false)
  const assets = useAssetRegistry()
  const { buildItems, enqueueBatch, patchBatch } = useBatchProcessor({ assets, dispatch })

  const scrollHistoryIntoView = useCallback(() => {
    const run = (attemptsLeft) => {
      const root = historyRef.current
      const newest =
        root?.querySelector('.history-item') ||
        root?.querySelector('.batch-card') ||
        root
      if (newest) {
        newest.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        return
      }
      if (attemptsLeft > 0) {
        requestAnimationFrame(() => run(attemptsLeft - 1))
        return
      }
      const main = mainRef?.current
      if (main) {
        main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' })
      }
    }
    requestAnimationFrame(() => run(48))
  }, [mainRef])

  useEffect(() => {
    const id = setInterval(() => {
      dispatch(advanceTagline(TAGLINES.length))
    }, 1690)
    return () => clearInterval(id)
  }, [dispatch])

  useEffect(() => {
    if (!lightboxImg) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        dispatch(setLightboxImg(null))
        return
      }

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()

      const allItems = batches.flatMap((batch) =>
        batch.items.filter((item) => item.status !== 'pending' && item.status !== 'processing'),
      )
      const currentIdx = allItems.findIndex((item) => item.id === lightboxImg.itemId)
      if (currentIdx === -1 || allItems.length === 0) return

      const nextIdx =
        e.key === 'ArrowLeft'
          ? (currentIdx > 0 ? currentIdx - 1 : allItems.length - 1)
          : (currentIdx < allItems.length - 1 ? currentIdx + 1 : 0)
      const next = allItems[nextIdx]
      if (!next) return

      dispatch(
        setLightboxImg({
          itemId: next.id,
          name: next.processedFilename || next.name,
        }),
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [batches, dispatch, lightboxImg])

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

  const currentManualOp = opMode === OP_MODE_AUTO ? null : getOperation(opMode)
  const currentManualParams = (() => {
    if (!currentManualOp) return {}
    const defaults = currentManualOp.defaultParams?.() || {}
    const overrides = manualParams[opMode] || {}
    return { ...defaults, ...overrides }
  })()

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (incoming.length === 0) return

    const available = MAX_STAGED - staged.length
    if (available <= 0) return

    const existingNames = new Set(staged.map((item) => item.name))
    const accepted = incoming.slice(0, available)
    const next = accepted.map((file) => {
      let name = file.name
      if (existingNames.has(name)) {
        const dot = name.lastIndexOf('.')
        const base = dot === -1 ? name : name.slice(0, dot)
        const ext = dot === -1 ? '' : name.slice(dot)
        let counter = 2
        while (existingNames.has(`${base} (${counter})${ext}`)) counter += 1
        name = `${base} (${counter})${ext}`
      }
      existingNames.add(name)

      const id = newStagedId(file)
      assets.registerFileAsset(id, file)
      return { ...fileMetadata(id, file), name }
    })

    dispatch(appendStaged(next))
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
    scrollHistoryIntoView()

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
        const freshBatches = store.getState().app.batches
        const target = freshBatches.find((batch) => batch.id === targetId)
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
        scrollHistoryIntoView()
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
      if (downloadingRef.current) return
      downloadingRef.current = true

      batch.items.forEach((item, index) => {
        setTimeout(() => {
          actions.triggerDownload(item)
          if (index === batch.items.length - 1) {
            downloadingRef.current = false
          }
        }, index * 150)
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
