import styled from 'styled-components'

const StyledWrapper = styled.label.attrs({
  className: 'param-control',
})``

export default function ParamControl({ spec, value, onChange }) {
  const id = `param-${spec.name}`

  if (spec.type === 'enum') {
    return (
      <StyledWrapper htmlFor={id}>
          <span className='param-label'>{spec.name}</span>
          <select
            id={id}
            className='param-select'
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
          >
            {spec.default === null && <option value=''>auto</option>}
            {spec.enum.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
      </StyledWrapper>
    )
  }

  if (spec.type === 'integer' || spec.type === 'number') {
    const display = value == null || value === '' ? '' : String(value)
    const placeholder =
      spec.default === null
        ? 'auto'
        : spec.default !== undefined
          ? String(spec.default)
          : ''
    const handleChange = (e) => {
      const raw = e.target.value
      if (raw === '') {
        onChange(null)
        return
      }
      const n = spec.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw)
      if (Number.isNaN(n)) return
      onChange(n)
    }
    return (
      <StyledWrapper htmlFor={id}>
          <span className='param-label'>{spec.name}</span>
          <input
            id={id}
            className='param-input'
            type='number'
            inputMode={spec.type === 'integer' ? 'numeric' : 'decimal'}
            step={spec.type === 'integer' ? 1 : 'any'}
            min={spec.min}
            max={spec.max}
            value={display}
            placeholder={placeholder}
            onChange={handleChange}
          />
      </StyledWrapper>
    )
  }

  return (
    <StyledWrapper htmlFor={id}>
        <span className='param-label'>{spec.name}</span>
        <input
          id={id}
          className='param-input'
          type='text'
          value={value ?? ''}
          placeholder={spec.default ? String(spec.default) : ''}
          onChange={(e) => onChange(e.target.value)}
        />
    </StyledWrapper>
  )
}
