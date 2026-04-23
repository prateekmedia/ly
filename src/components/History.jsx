import { useMemo } from 'react'
import { AlertCircle, Download, Pencil, RotateCcw } from 'lucide-react'
import styled from 'styled-components'

const StyledWrapper = styled.div.attrs({
  className: 'page history-page',
})``

export default function History({ batches, editingBatchId, historyRef, actions, selectors }) {
  const reversedBatches = useMemo(() => batches.slice().reverse(), [batches])

  if (batches.length === 0) return null

  return (
    <StyledWrapper ref={historyRef}>
      <div className='history'>
        <ol className='history-list'>
          {reversedBatches.map((batch) => {
            const undetermined = selectors.batchIsUndetermined(batch)
            const isPlanning = batch.status === 'planning'
            return (
              <li key={batch.id} className='history-item'>
                <div className={`batch-card${editingBatchId === batch.id ? ' is-editing' : ''}${isPlanning ? ' is-planning' : ''}`}>
                  {batch.prompt && <p className='batch-prompt'>{batch.prompt}</p>}
                  <div className='batch-status-row'>
                    <div className='batch-status'>
                      {batch.status === 'planning' && 'Determining edits…'}
                      {batch.status === 'processing' &&
                        `Processing ${batch.items.length} image${batch.items.length === 1 ? '' : 's'}…`}
                      {batch.status === 'done' && !undetermined &&
                        `${batch.items.length} image${batch.items.length === 1 ? '' : 's'} ready`}
                      {batch.status === 'done' && undetermined &&
                        'Couldn’t figure out what you wanted'}
                    </div>
                    {batch.status === 'done' && (
                      <button
                        type='button'
                        className='batch-edit'
                        onClick={() => actions.handleEdit(batch)}
                        aria-label='Edit batch'
                      >
                        <Pencil />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                  {undetermined ? (
                    <button
                      type='button'
                      className='batch-retry'
                      onClick={() => actions.handleEdit(batch)}
                    >
                      <RotateCcw />
                      <span>Refine your prompt and try again</span>
                    </button>
                  ) : (
                    <>
                      <div className='results-grid'>
                        {batch.items.map((item) => {
                          const isLoading =
                            item.status === 'processing' || item.status === 'pending'
                          const label = selectors.opLabelFor(item)
                          const displayUrl = selectors.displayUrl(item)
                          const displayName = selectors.displayName(item)
                          return (
                            <div
                              key={item.id}
                              className={`result-card${isLoading ? ' is-loading' : ''}`}
                              onClick={() =>
                                actions.setLightboxImg({
                                  itemId: item.id,
                                  name: displayName,
                                })
                              }
                              role='button'
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  actions.setLightboxImg({
                                    itemId: item.id,
                                    name: displayName,
                                  })
                                }
                              }}
                            >
                              <img src={displayUrl} alt={displayName} />
                              {(item.status === 'processing' || isPlanning) && (
                                <div className='result-shimmer' aria-hidden='true' />
                              )}
                              {label && <span className='result-op-badge'>{label}</span>}
                              {item.status === 'error' && (
                                <span className='result-error-badge' title={item.error || 'Operation failed'}>
                                  <AlertCircle />
                                  Failed
                                </span>
                              )}
                              {!isLoading && item.status !== 'error' && (
                                <button
                                  type='button'
                                  className='result-download'
                                  aria-label={`Download ${displayName}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    actions.triggerDownload(item)
                                  }}
                                >
                                  <Download />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {batch.status === 'done' && batch.items.length > 1 && (
                        <button
                          type='button'
                          className='download-all'
                          onClick={() => actions.handleDownloadAll(batch)}
                        >
                          <Download />
                          <span>Download all</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </StyledWrapper>
  )
}
