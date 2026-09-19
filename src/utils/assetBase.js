/** Resolve a public/ path for the current Vite base (e.g. `/ly/` on GitHub Pages). */
export function assetUrl(path) {
  const clean = String(path).replace(/^\//, '')
  const base = import.meta.env.BASE_URL || '/'
  return new URL(clean, new URL(base, globalThis.location?.href || 'http://localhost')).href
}
