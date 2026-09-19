/** Wraps lazy-loaded UI so chunks fade in without shifting the shell layout. */
export default function SuspenseLoader({ children }) {
  return <div className='suspense-root'>{children}</div>
}
