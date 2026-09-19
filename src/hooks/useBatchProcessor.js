import { useRef } from 'react'
import { useDispatch } from 'react-redux'
import { getPlanner } from '@/config/planner.js'
import { planOperations } from '@/llm/intentParser.js'
import { getPlannerRuntime } from '@/llm/plannerRuntime.js'
import { runOperation, getOperation, NOOP } from '@/operations/index.js'
import {
  OP_MODE_AUTO,
  applyOperationPlan,
  patchBatch as patchBatchState,
  patchItem as patchItemState,
} from '@/store/appSlice.js'

export function useBatchProcessor({ assets, dispatch: dispatchFromProps }) {
  const reduxDispatch = useDispatch()
  const dispatch = dispatchFromProps || reduxDispatch
  const processingChain = useRef(Promise.resolve())

  const patchItem = (batchId, itemId, patch) => {
    dispatch(patchItemState({ batchId, itemId, patch }))
  }

  const patchBatch = (batchId, patch) => {
    dispatch(patchBatchState({ batchId, patch }))
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
      const runtime = getPlannerRuntime()
      if (runtime) {
        try {
          await runtime.waitForReady()
          useLLM = runtime.getStatus() === 'ready'
          mark(`${getPlanner()} ready`)
        } catch {
          useLLM = false
          runtime.disposeModel()
          mark(`${getPlanner()} setup failed — heuristics; will retry next batch`)
        }
      } else {
        mark(`planner: ${getPlanner()}`)
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

      if (useLLM && runtime) {
        runtime.disposeModel()
        mark(`${getPlanner()} disposed`)
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

  return { buildItems, enqueueBatch, patchBatch, patchItem, processingChain }
}
