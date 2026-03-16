import { useState, useRef, useCallback } from 'react'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'

export default function ImageSearch() {
  const { dark } = useTheme()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [keywords, setKeywords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('smart')
  const [pinterestFirst, setPinterestFirst] = useState(true)
  const [lightbox, setLightbox] = useState(null)
  const [failedImages, setFailedImages] = useState(new Set())
  const inputRef = useRef(null)

  const search = useCallback(async (e) => {
    e?.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResults([])
    setKeywords([])
    setFailedImages(new Set())

    try {
      let data
      if (mode === 'smart') {
        data = await api.post('/admin/imagesearch', {
          prompt: query.trim(),
          num_results: 30,
          pinterest_first: pinterestFirst,
        })
        setKeywords(data.keywords || [])
      } else {
        const q = pinterestFirst ? `${query.trim()} site:pinterest.com` : query.trim()
        data = await api.get(`/admin/imagesearch/direct?q=${encodeURIComponent(q)}&n=30`)
      }
      setResults(data.results || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [query, mode, pinterestFirst])

  const handleImageError = useCallback((imgSrc) => {
    setFailedImages(prev => {
      const next = new Set(prev)
      next.add(imgSrc)
      return next
    })
  }, [])

  const visibleResults = results.filter(r => !failedImages.has(r.img_src))

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 z-10 border-b border-border" style={{ background: dark ? 'rgba(10,10,10,0.92)' : 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)' }}>
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-sm font-semibold text-text tracking-tight">image search</h1>
              <div className="flex gap-1 rounded-lg p-0.5" style={{ background: dark ? '#141414' : '#f0f0f0' }}>
                {['smart', 'direct'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: mode === m ? (dark ? '#222' : '#fff') : 'transparent',
                      color: mode === m ? (dark ? '#fff' : '#000') : (dark ? '#666' : '#999'),
                    }}
                  >
                    {m === 'smart' ? 'AI search' : 'direct'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={pinterestFirst}
                  onChange={(e) => setPinterestFirst(e.target.checked)}
                  className="accent-[#c4a759]"
                />
                pinterest first
              </label>
            </div>

            <form onSubmit={search} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'smart' ? 'describe what you\'re looking for...' : 'search query...'}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-bg text-text text-sm outline-none focus:border-[#333] transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                style={{
                  background: loading ? (dark ? '#1a1a1a' : '#e0e0e0') : '#c4a759',
                  color: loading ? (dark ? '#666' : '#999') : '#000',
                }}
              >
                {loading ? 'searching...' : 'search'}
              </button>
            </form>

            {keywords.length > 0 && (
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                <span className="text-[11px] text-text-muted">keywords:</span>
                {keywords.map((kw, i) => (
                  <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full border border-border bg-bg-secondary text-text-secondary">
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-6 py-6">
          {error && (
            <div className="px-4 py-3 rounded-lg border mb-5 text-sm" style={{
              background: dark ? '#1a0a0a' : '#fff5f5',
              borderColor: dark ? '#331a1a' : '#fcc',
              color: dark ? '#cc6666' : '#c33',
            }}>
              {error}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-border rounded-full animate-spin" style={{ borderTopColor: '#c4a759' }} />
                <span className="text-sm text-text-muted">
                  {mode === 'smart' ? 'AI is picking keywords...' : 'searching...'}
                </span>
              </div>
            </div>
          )}

          {!loading && visibleResults.length > 0 && (
            <>
              <p className="text-xs text-text-muted mb-4">{visibleResults.length} images found</p>
              <div style={{ columns: 'auto 260px', columnGap: 12 }}>
                {visibleResults.map((r) => (
                  <div
                    key={r.img_src}
                    onClick={() => setLightbox(r)}
                    className="break-inside-avoid mb-3 rounded-lg overflow-hidden border border-border cursor-pointer transition-colors hover:border-[#333]"
                    style={{ background: dark ? '#111' : '#f8f8f8' }}
                  >
                    <img
                      src={r.img_src}
                      alt={r.title}
                      loading="lazy"
                      onError={() => handleImageError(r.img_src)}
                      className="w-full block"
                    />
                    {r.title && (
                      <div className="px-2.5 py-2">
                        <p className="text-[11px] text-text-secondary truncate">{r.title}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && !error && results.length === 0 && !query && (
            <div className="text-center py-20">
              <Search size={32} className="mx-auto mb-4 text-text-muted opacity-30" />
              <p className="text-sm text-text-muted">
                {mode === 'smart'
                  ? 'describe what you\'re looking for in natural language'
                  : 'enter a search query'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-10"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', cursor: 'zoom-out' }}
        >
          <div className="max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.img_src}
              alt={lightbox.title}
              className="max-w-[90vw] max-h-[80vh] rounded-xl block"
            />
            <div className="mt-3 flex justify-between items-center">
              <p className="text-sm text-[#888] truncate max-w-[60%]">{lightbox.title}</p>
              <div className="flex gap-2">
                <a
                  href={lightbox.img_src}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-lg border border-[#333] bg-[#1a1a1a] text-[#aaa] text-xs no-underline hover:border-[#444] transition-colors"
                >
                  open image
                </a>
                {lightbox.source_url && (
                  <a
                    href={lightbox.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1.5 rounded-lg border border-[#333] bg-[#1a1a1a] text-[#aaa] text-xs no-underline hover:border-[#444] transition-colors"
                  >
                    source
                  </a>
                )}
                <button
                  onClick={() => setLightbox(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#333] bg-[#1a1a1a] text-[#aaa] text-xs cursor-pointer hover:border-[#444] transition-colors"
                >
                  close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
