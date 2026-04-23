export function newBatchId() {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function newStagedId(file) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`
}

export function fileMetadata(id, file) {
  return {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  }
}
