import { useEffect, useRef } from 'react'

export function useAssetRegistry() {
  const registryRef = useRef(new Map())

  useEffect(() => {
    const registry = registryRef.current
    return () => {
      registry.forEach((asset) => {
        if (asset.srcUrl) URL.revokeObjectURL(asset.srcUrl)
        if (asset.processedUrl) URL.revokeObjectURL(asset.processedUrl)
      })
      registry.clear()
    }
  }, [])

  const getAsset = (id) => registryRef.current.get(id)

  const cleanupAsset = (id) => {
    const asset = registryRef.current.get(id)
    if (!asset) return
    if (asset.srcUrl) URL.revokeObjectURL(asset.srcUrl)
    if (asset.processedUrl) URL.revokeObjectURL(asset.processedUrl)
    registryRef.current.delete(id)
  }

  const cleanupAssets = (items) => {
    items.forEach((item) => cleanupAsset(item.id))
  }

  const registerFileAsset = (id, file) => {
    registryRef.current.set(id, {
      file,
      srcUrl: URL.createObjectURL(file),
      processedBlob: null,
      processedUrl: null,
    })
  }

  const setProcessedAsset = (id, blob) => {
    const asset = getAsset(id)
    if (!asset) return null
    if (asset.processedUrl) URL.revokeObjectURL(asset.processedUrl)
    const processedUrl = URL.createObjectURL(blob)
    asset.processedBlob = blob
    asset.processedUrl = processedUrl
    return processedUrl
  }

  return {
    getAsset,
    cleanupAsset,
    cleanupAssets,
    registerFileAsset,
    setProcessedAsset,
  }
}
