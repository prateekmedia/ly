import { X } from 'lucide-react'
import styled from 'styled-components'

const StyledWrapper = styled.div.attrs({
  className: 'lightbox',
  role: 'dialog',
  'aria-modal': 'true',
})``

export default function Lightbox({ lightboxImg, selectors, actions }) {
  if (!lightboxImg) return null

  const src = selectors.lightboxUrl(lightboxImg)

  return (
    <StyledWrapper onClick={actions.closeLightbox}>
      <button
        type='button'
        className='lightbox-close'
        aria-label='Close preview'
        onClick={actions.closeLightbox}
      >
        <X />
      </button>
      <img
        src={src}
        alt={lightboxImg.name}
        onClick={(e) => e.stopPropagation()}
      />
    </StyledWrapper>
  )
}
