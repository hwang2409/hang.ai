import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, PenTool, LayoutGrid, X, ArrowUp, ArrowDown, CornerDownLeft, Sparkles, TextSearch, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { useTheme } from '../contexts/ThemeContext'

export default function SearchModal() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const resultsRef = useRef(null)
  const navigate = useNavigate()
  const { dark } = useTheme()

  // Cmd+K to toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  // Focus input when opened, reset on close
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus()
        setInputFocused(true)
      }, 80)
    } else {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setInputFocused(false)
    }
  }, [open])

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await api.post('/search/hybrid', { query: q.trim(), limit: 12 })
      setResults(data.results || [])
      setSelectedIndex(0)
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleQueryChange = (value) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 200)
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      const selected = results[selectedIndex]
      if (selected) {
        navigate(selected.source === 'flashcard' ? '/flashcards' : `/notes/${selected.id}`)
        setOpen(false)
      }
    }
  }

  // Auto-scroll selected into view
  useEffect(() => {
    if (resultsRef.current) {
      const el = resultsRef.current.children[selectedIndex]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  const matchBadge = (type) => {
    switch (type) {
      case 'both': return {
        bg: dark ? 'rgba(196,167,89,0.10)' : 'rgba(160,130,40,0.08)',
        text: dark ? '#c4a759' : '#8b7a3d',
        label: 'hybrid',
      }
      case 'semantic': return {
        bg: dark ? 'rgba(120,160,120,0.08)' : 'rgba(60,120,60,0.06)',
        text: dark ? '#7aaa7a' : '#4a8a4a',
        label: 'semantic',
      }
      default: return {
        bg: dark ? 'rgba(160,160,160,0.06)' : 'rgba(100,100,100,0.06)',
        text: dark ? '#707070' : '#888888',
        label: 'keyword',
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] animate-modal-backdrop flex items-start justify-center"
      style={{ paddingTop: '14vh' }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        className="w-full max-w-[560px] mx-4 animate-pop-in overflow-hidden"
        style={{
          background: dark
            ? 'linear-gradient(180deg, #141414 0%, #0e0e0e 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
          border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
          borderRadius: 14,
          boxShadow: dark
            ? '0 25px 80px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(196,167,89,0.04)'
            : '0 25px 80px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.04), 0 0 0 1px rgba(160,130,40,0.06)',
        }}
      >
        {/* Top amber accent line */}
        <div
          className="h-px"
          style={{
            background: `linear-gradient(90deg, transparent 5%, ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'} 50%, transparent 95%)`,
          }}
        />

        {/* Search input area */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{
            borderBottom: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
          }}
        >
          <Search
            size={15}
            style={{
              color: inputFocused
                ? (dark ? '#c4a759' : '#8b7a3d')
                : (dark ? '#404040' : '#bbbbbb'),
              transition: 'color 0.25s ease',
              flexShrink: 0,
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="search notes & cards..."
            className={`flex-1 bg-transparent text-[15px] outline-none tracking-tight ${
              dark
                ? 'text-[#d4d4d4] placeholder-[#2a2a2a]'
                : 'text-[#2a2a2a] placeholder-[#bbbbbb]'
            }`}
            style={{ caretColor: dark ? '#c4a759' : '#8b7a3d' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setLoading(false) }}
              className="transition-colors p-0.5"
              style={{ color: dark ? '#333333' : '#bbbbbb' }}
              onMouseEnter={(e) => e.currentTarget.style.color = dark ? '#808080' : '#777777'}
              onMouseLeave={(e) => e.currentTarget.style.color = dark ? '#333333' : '#bbbbbb'}
            >
              <X size={13} />
            </button>
          )}
          <kbd
            className="text-[10px] px-1.5 py-[3px] rounded flex-shrink-0"
            style={{
              color: dark ? '#333333' : '#aaaaaa',
              background: dark ? '#191919' : '#e8e5de',
              border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results area */}
        <div
          ref={resultsRef}
          className="max-h-[46vh] overflow-y-auto search-results-stagger"
          style={{
            padding: results.length > 0 || loading || (query && !loading) ? '6px' : 0,
          }}
        >
          {/* Loading state */}
          {loading && results.length === 0 && (
            <div className="px-5 py-10 flex flex-col items-center gap-3 animate-fade-in">
              <div className="flex gap-1.5">
                <div
                  className="w-1 h-1 rounded-full animate-pulse"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }}
                />
                <div
                  className="w-1 h-1 rounded-full animate-pulse [animation-delay:0.15s]"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }}
                />
                <div
                  className="w-1 h-1 rounded-full animate-pulse [animation-delay:0.3s]"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }}
                />
              </div>
              <p className="text-[11px]" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>
                searching...
              </p>
            </div>
          )}

          {/* Empty state */}
          {!loading && query && results.length === 0 && (
            <div className="px-5 py-10 flex flex-col items-center gap-2 animate-fade-in">
              <TextSearch size={20} style={{ color: dark ? '#1c1c1c' : '#ddd9d0' }} />
              <p className="text-[11px]" style={{ color: dark ? '#333333' : '#aaaaaa' }}>
                no results matched "{query.length > 30 ? query.slice(0, 30) + '...' : query}"
              </p>
            </div>
          )}

          {/* Result items */}
          {results.map((result, i) => {
            const badge = matchBadge(result.match_type)
            const isSelected = i === selectedIndex
            const isCanvasResult = result.type === 'canvas'
            const isMoodboardResult = result.type === 'moodboard'
            const isFlashcard = result.source === 'flashcard'
            const ResultIcon = isFlashcard ? Zap : isCanvasResult ? PenTool : isMoodboardResult ? LayoutGrid : FileText
            return (
              <button
                key={result.id}
                onClick={() => { navigate(result.source === 'flashcard' ? '/flashcards' : `/notes/${result.id}`); setOpen(false) }}
                onMouseEnter={() => setSelectedIndex(i)}
                className="w-full text-left px-3 py-2.5 rounded-[10px] flex items-start gap-3 group"
                style={{
                  background: isSelected
                    ? (dark ? 'rgba(196,167,89,0.04)' : 'rgba(160,130,40,0.04)')
                    : 'transparent',
                  borderLeft: isSelected
                    ? `2px solid ${dark ? 'rgba(196,167,89,0.3)' : 'rgba(160,130,40,0.25)'}`
                    : '2px solid transparent',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: isSelected
                      ? (dark ? 'rgba(196,167,89,0.06)' : 'rgba(160,130,40,0.05)')
                      : (dark ? '#111111' : '#f0ede6'),
                    border: `1px solid ${isSelected
                      ? (dark ? 'rgba(196,167,89,0.12)' : 'rgba(160,130,40,0.1)')
                      : (dark ? '#1c1c1c' : '#ddd9d0')}`,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ResultIcon
                    size={12}
                    style={{
                      color: isSelected
                        ? (dark ? '#c4a759' : '#8b7a3d')
                        : (dark ? '#333333' : '#aaaaaa'),
                      transition: 'color 0.15s ease',
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-sm truncate tracking-tight"
                      style={{
                        color: isSelected
                          ? (dark ? '#e8e8e8' : '#1a1a1a')
                          : (dark ? '#d4d4d4' : '#2a2a2a'),
                        fontWeight: isSelected ? 500 : 400,
                        transition: 'color 0.15s ease',
                      }}
                    >
                      {result.title || 'untitled'}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-[1px] rounded-full flex-shrink-0 tracking-wide"
                      style={{
                        background: badge.bg,
                        color: badge.text,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p
                    className="text-xs truncate leading-relaxed"
                    style={{ color: dark ? '#505050' : '#999999' }}
                  >
                    {isFlashcard ? result.preview : isCanvasResult ? 'Canvas note' : isMoodboardResult ? 'Moodboard' : result.preview}
                  </p>
                  {result.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5">
                      {result.tags.slice(0, 3).map((tag, j) => (
                        <span
                          key={j}
                          className="text-[9px] px-1.5 py-[1px] rounded"
                          style={{
                            background: dark ? '#141414' : '#eae7e0',
                            color: dark ? '#505050' : '#888888',
                            border: `1px solid ${dark ? '#1a1a1a' : '#ddd9d0'}`,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Return hint on selected */}
                {isSelected && (
                  <div className="flex-shrink-0 mt-2">
                    <CornerDownLeft
                      size={11}
                      style={{ color: dark ? '#333333' : '#bbbbbb' }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        {(results.length > 0 || (query && !loading)) && (
          <div
            className="flex items-center gap-5 px-5 py-2.5"
            style={{
              borderTop: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
            }}
          >
            <div className="flex items-center gap-1.5" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>
              <ArrowUp size={10} />
              <ArrowDown size={10} />
              <span className="text-[10px] tracking-wide">navigate</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>
              <CornerDownLeft size={10} />
              <span className="text-[10px] tracking-wide">open</span>
            </div>
            {results.length > 0 && (
              <span
                className="text-[10px] ml-auto tracking-wide"
                style={{ color: dark ? '#1c1c1c' : '#ccc8bf' }}
              >
                {results.length} result{results.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Initial empty state — no query yet */}
        {!query && (
          <div className="px-5 py-8 flex flex-col items-center gap-3 animate-fade-in">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: dark
                  ? 'linear-gradient(135deg, #111111, #0e0e0e)'
                  : 'linear-gradient(135deg, #f0ede6, #e8e5de)',
                border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
              }}
            >
              <Sparkles size={14} style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }} />
            </div>
            <p
              className="text-[11px] text-center leading-relaxed"
              style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}
            >
              search by title, content, or concept
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
