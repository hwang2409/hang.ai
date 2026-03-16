const cache = new Map()
const STALE_MS = 30_000

export function getCached(noteId) {
  const entry = cache.get(noteId)
  if (!entry) return null
  return { ...entry, stale: Date.now() - entry.timestamp > STALE_MS }
}

export function setCache(noteId, threadId, messages) {
  cache.set(noteId, { threadId, messages, timestamp: Date.now() })
}

export function updateCacheMessages(noteId, messages) {
  const entry = cache.get(noteId)
  if (entry) cache.set(noteId, { ...entry, messages, timestamp: Date.now() })
}
