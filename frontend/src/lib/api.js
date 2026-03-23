const API_BASE = import.meta.env.VITE_API_URL || ''  // empty = vite proxy in dev

let redirecting = false

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    if (!redirecting) {
      redirecting = true
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
  if (res.status === 402) {
    const data = await res.json().catch(() => ({}))
    if (data.detail === 'api_key_required') {
      window.dispatchEvent(new CustomEvent('api-key-required'))
      throw new Error('API key required')
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

export function getToken() {
  return localStorage.getItem('token')
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  // Multipart upload (no Content-Type header — browser sets multipart boundary)
  upload: async (path, formData) => {
    const token = getToken()
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    })
    if (res.status === 401) {
      if (!redirecting) {
        redirecting = true
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
      throw new Error('Unauthorized')
    }
    if (res.status === 402) {
      const data = await res.json().catch(() => ({}))
      if (data.detail === 'api_key_required') {
        window.dispatchEvent(new CustomEvent('api-key-required'))
        throw new Error('API key required')
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Upload failed')
    }
    return res.json()
  },

  // File download via token-in-URL (browser handles Content-Disposition)
  download: (path) => {
    const token = getToken()
    const sep = path.includes('?') ? '&' : '?'
    const url = `${API_BASE}${path}${sep}token=${token}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  },

  // SSE streaming for chat
  stream: async function* (path, data) {
    const token = getToken()
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (res.status === 402) {
      const errData = await res.json().catch(() => ({}))
      if (errData.detail === 'api_key_required') {
        window.dispatchEvent(new CustomEvent('api-key-required'))
        throw new Error('API key required')
      }
    }
    if (!res.ok) throw new Error('Stream failed')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6))
          } catch {
            // skip unparseable lines
          }
        }
      }
    }
  }
}
