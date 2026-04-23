import { createSlice } from '@reduxjs/toolkit'

export const OP_MODE_AUTO = 'auto'

const initialState = {
  text: '',
  staged: [],
  isDragging: false,
  taglineIndex: 0,
  batches: [],
  lightboxImg: null,
  editingBatchId: null,
  opMode: OP_MODE_AUTO,
  manualParams: {},
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setText(state, action) {
      state.text = action.payload
    },
    appendStaged(state, action) {
      state.staged.push(...action.payload)
    },
    setStaged(state, action) {
      state.staged = action.payload
    },
    removeStaged(state, action) {
      state.staged = state.staged.filter((item) => item.id !== action.payload)
    },
    setDragging(state, action) {
      state.isDragging = action.payload
    },
    advanceTagline(state, action) {
      state.taglineIndex = (state.taglineIndex + 1) % action.payload
    },
    setLightboxImg(state, action) {
      state.lightboxImg = action.payload
    },
    setEditingBatchId(state, action) {
      state.editingBatchId = action.payload
    },
    setOpMode(state, action) {
      state.opMode = action.payload
    },
    setManualParam(state, action) {
      const { opMode, paramName, value } = action.payload
      state.manualParams[opMode] = {
        ...(state.manualParams[opMode] || {}),
        [paramName]: value,
      }
    },
    mergeManualParams(state, action) {
      const { opId, params } = action.payload
      state.manualParams[opId] = {
        ...(state.manualParams[opId] || {}),
        ...params,
      }
    },
    appendBatch(state, action) {
      state.batches.push(action.payload)
    },
    replaceBatch(state, action) {
      const index = state.batches.findIndex((batch) => batch.id === action.payload.id)
      if (index !== -1) state.batches[index] = action.payload
    },
    patchBatch(state, action) {
      const { batchId, patch } = action.payload
      const batch = state.batches.find((item) => item.id === batchId)
      if (batch) Object.assign(batch, patch)
    },
    patchItem(state, action) {
      const { batchId, itemId, patch } = action.payload
      const batch = state.batches.find((item) => item.id === batchId)
      const item = batch?.items.find((entry) => entry.id === itemId)
      if (item) Object.assign(item, patch)
    },
    applyOperationPlan(state, action) {
      const { batchId, ops, noop } = action.payload
      const batch = state.batches.find((item) => item.id === batchId)
      if (!batch) return

      batch.status = 'processing'
      batch.items = batch.items.map((item, index) => {
        const assignment = ops[index] || { opId: noop, params: {} }
        const willRun = assignment.opId && assignment.opId !== noop
        return {
          ...item,
          opId: assignment.opId,
          params: assignment.params || {},
          status: willRun ? 'pending' : 'done',
        }
      })
    },
    clearComposerAfterSubmit(state) {
      state.staged = []
      state.text = ''
      state.editingBatchId = null
    },
    startEditingBatch(state, action) {
      const { batchId, staged, text, opMode, forcedParams } = action.payload
      state.staged = staged
      state.text = text
      state.opMode = opMode
      state.editingBatchId = batchId
      if (opMode !== OP_MODE_AUTO && forcedParams) {
        state.manualParams[opMode] = {
          ...(state.manualParams[opMode] || {}),
          ...forcedParams,
        }
      }
    },
    cancelEdit(state) {
      state.staged = []
      state.text = ''
      state.opMode = OP_MODE_AUTO
      state.editingBatchId = null
    },
  },
})

export const {
  setText,
  appendStaged,
  setStaged,
  removeStaged,
  setDragging,
  advanceTagline,
  setLightboxImg,
  setEditingBatchId,
  setOpMode,
  setManualParam,
  mergeManualParams,
  appendBatch,
  replaceBatch,
  patchBatch,
  patchItem,
  applyOperationPlan,
  clearComposerAfterSubmit,
  startEditingBatch,
  cancelEdit,
} = appSlice.actions

export default appSlice.reducer
