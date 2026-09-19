import { Image, Send, X } from 'lucide-react'
import styled from 'styled-components'
import ParamControl from '@/components/ParamControl.jsx'
import { OPERATIONS } from '@/operations/index.js'
import { OP_MODE_AUTO } from '@/store/appSlice.js'

const StyledWrapper = styled.div.attrs({
  className: 'page composer-page',
})``

export default function Composer({
  state,
  composerRef,
  fileInputRef,
  actions,
  selectors,
  currentManualOp,
  currentManualParams,
  canSend,
  tagline,
  modelLoader,
}) {
  const { text, staged, isDragging, editingBatchId, opMode, batches } = state

  return (
    <StyledWrapper ref={composerRef}>
      <h1 className='tagline'>
        <span key={tagline} className='tagline-text'>{tagline}</span>
      </h1>
      {editingBatchId && (
        <div className='editing-banner'>
          <span>Editing previous batch</span>
          <button type='button' onClick={actions.cancelEdit}>Cancel</button>
        </div>
      )}
      <div
        className={`inputbox${isDragging ? ' is-dragging' : ''}${editingBatchId ? ' is-editing' : ''}${opMode !== OP_MODE_AUTO ? ' is-compact' : ''}`}
        onDragEnter={actions.handleDragEnter}
        onDragLeave={actions.handleDragLeave}
        onDragOver={actions.handleDragOver}
        onDrop={actions.handleDrop}
      >
        {opMode === OP_MODE_AUTO ? (
          <textarea
            name='userprompt'
            placeholder='Drop an image and tell me what you need…'
            value={text}
            onChange={(e) => actions.setText(e.target.value)}
            onPaste={actions.handlePaste}
            onKeyDown={actions.handleKeyDown}
          />
        ) : currentManualOp && currentManualOp.params.length > 0 ? (
          <div className='params-row'>
            {currentManualOp.params.map((spec) => (
              <ParamControl
                key={spec.name}
                spec={spec}
                value={currentManualParams[spec.name]}
                onChange={(value) => actions.setManualParam(spec.name, value)}
              />
            ))}
          </div>
        ) : null}

        <div className='actions'>
          {staged.length > 0 ? (
            <div className='previews'>
              {staged.map((img) => (
                <div key={img.id} className='preview'>
                  <img src={selectors.getPreviewUrl(img)} alt={img.name} />
                  <button
                    type='button'
                    className='preview-remove'
                    aria-label={`Remove ${img.name}`}
                    onClick={() => actions.removeStaged(img.id)}
                  >
                    <X />
                  </button>
                </div>
              ))}
            </div>
          ) : opMode !== OP_MODE_AUTO ? (
            <button
              type='button'
              className='empty-images-hint'
              onClick={() => fileInputRef.current?.click()}
            >
              <Image />
              <span>No images yet. Click to add.</span>
            </button>
          ) : null}

          <div className='op-picker'>
            <select
              className='op-picker-select'
              value={opMode}
              onChange={(e) => actions.setOpMode(e.target.value)}
              aria-label='Operation'
            >
              <option value={OP_MODE_AUTO}>Auto</option>
              {OPERATIONS.map((op) => (
                <option key={op.id} value={op.id}>{op.label}</option>
              ))}
            </select>
          </div>

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            multiple
            hidden
            onChange={actions.handleFileInput}
          />
          <button
            type='button'
            className='imgAttach'
            aria-label='Attach image'
            onClick={() => fileInputRef.current?.click()}
          >
            <Image />
          </button>
          <button
            type='button'
            className='send'
            aria-label='Send'
            onClick={actions.handleSend}
            disabled={!canSend}
          >
            <Send />
          </button>
        </div>

        {isDragging && (
          <div className='drop-overlay'>
            <p>Drop images to attach</p>
          </div>
        )}
      </div>

      {modelLoader}

      <p className='hint'>
        {batches.length > 0
          ? 'Send another batch, or scroll down to see history'
          : 'Drag & drop, paste, or click the image button'}
      </p>
    </StyledWrapper>
  )
}
