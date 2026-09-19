import { lazy, Suspense } from 'react'
import './App.css'
import Composer from '@/components/Composer.jsx'
import SuspenseLoader from '@/components/SuspenseLoader.jsx'
import { TAGLINES } from '@/constants/taglines.js'
import { useImageWorkbench } from '@/hooks/useImageWorkbench.js'

const History = lazy(() => import('@/components/History.jsx'))
const Lightbox = lazy(() => import('@/components/Lightbox.jsx'))
const ModelLoader = lazy(() => import('@/components/ModelLoader.jsx'))

function App() {
  const {
    state,
    currentManualOp,
    currentManualParams,
    canSend,
    refs,
    actions,
    selectors,
  } = useImageWorkbench()
  const { fileInputRef, composerRef, historyRef } = refs
  const { batches, lightboxImg } = state

  return (
    <>
      <header className='app-header'>
        <span className='brand-pill'>ly.sunal.in</span>
      </header>
      <section className='main'>
        <Composer
          state={state}
          composerRef={composerRef}
          fileInputRef={fileInputRef}
          actions={actions}
          selectors={selectors}
          currentManualOp={currentManualOp}
          currentManualParams={currentManualParams}
          canSend={canSend}
          tagline={TAGLINES[state.taglineIndex]}
          modelLoader={
            <Suspense fallback={null}>
              <SuspenseLoader>
                <ModelLoader />
              </SuspenseLoader>
            </Suspense>
          }
        />
        {batches.length > 0 && (
          <Suspense fallback={null}>
            <SuspenseLoader>
              <History
                batches={batches}
                editingBatchId={state.editingBatchId}
                historyRef={historyRef}
                actions={actions}
                selectors={selectors}
              />
            </SuspenseLoader>
          </Suspense>
        )}
      </section>
      {lightboxImg && (
        <Suspense fallback={null}>
          <SuspenseLoader>
            <Lightbox
              lightboxImg={lightboxImg}
              selectors={selectors}
              actions={actions}
            />
          </SuspenseLoader>
        </Suspense>
      )}
    </>
  )
}

export default App
