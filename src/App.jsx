import './App.css'
import Composer from './components/Composer.jsx'
import History from './components/History.jsx'
import Lightbox from './components/Lightbox.jsx'
import ModelLoader from './components/ModelLoader.jsx'
import { TAGLINES } from './constants/taglines.js'
import { useImageWorkbench } from './hooks/useImageWorkbench.js'

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
          modelLoader={<ModelLoader />}
        />
        <History
          batches={state.batches}
          editingBatchId={state.editingBatchId}
          historyRef={historyRef}
          actions={actions}
          selectors={selectors}
        />
      </section>
      <Lightbox
        lightboxImg={state.lightboxImg}
        selectors={selectors}
        actions={actions}
      />
    </>
  )
}

export default App
