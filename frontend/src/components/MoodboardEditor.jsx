import { useState, useCallback, useRef, useEffect } from 'react'
import { ImagePlus, Type, X, GripVertical, Columns3, Sparkles, Loader2 } from 'lucide-react'

function AutoTextarea({ value, onChange, placeholder, className, style, onClick }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      style={{ ...style, overflow: 'hidden' }}
      rows={1}
      onClick={onClick}
    />
  )
}

const DARK_COLORS = ['#1a1a2e', '#2d1b2e', '#1b2e1b', '#2e2a1b', '#1b1b2e', '#2e1b1b']
const LIGHT_COLORS = ['#e8e5f0', '#f0e5ee', '#e5f0e8', '#f0ede5', '#e5e5f0', '#f0e5e5']
// Map dark colors to their light equivalents for theme switching
const COLOR_MAP = Object.fromEntries(DARK_COLORS.map((d, i) => [d, LIGHT_COLORS[i]]))

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function proxyImageUrl(url) {
  // Let the browser load images directly — <img> tags aren't subject to CORS.
  // The backend validates URLs are real images before storing them.
  return url || ''
}

export default function MoodboardEditor({ initialData, onChange, dark, onGenerate, generating }) {
  const [data, setData] = useState(() => {
    try {
      const parsed = JSON.parse(initialData || '{}')
      return {
        items: parsed.items || [],
        settings: parsed.settings || { columns: 3, gap: 12 },
      }
    } catch {
      return { items: [], settings: { columns: 3, gap: 12 } }
    }
  })

  const [urlPopover, setUrlPopover] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [generatePopover, setGeneratePopover] = useState(false)
  const [generateTopic, setGenerateTopic] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const urlInputRef = useRef(null)
  const generateInputRef = useRef(null)

  // Sync external updates (from AI edits)
  useEffect(() => {
    try {
      const parsed = JSON.parse(initialData || '{}')
      const newItems = parsed.items || []
      setData(prev => {
        if (JSON.stringify(prev.items) !== JSON.stringify(newItems)) {
          return { ...prev, items: newItems, settings: parsed.settings || prev.settings }
        }
        return prev
      })
    } catch { /* ignore */ }
  }, [initialData])

  const save = useCallback((newData) => {
    setData(newData)
    onChange?.(JSON.stringify(newData))
  }, [onChange])

  const addImage = () => {
    const url = urlInput.trim()
    if (!url) return
    const newItems = [...data.items, {
      id: generateId(),
      type: 'image',
      url,
      caption: '',
      width: 1,
      order: data.items.length,
    }]
    save({ ...data, items: newItems })
    setUrlInput('')
    setUrlPopover(false)
  }

  const addText = () => {
    const newItems = [...data.items, {
      id: generateId(),
      type: 'text',
      content: 'New text card',
      color: DARK_COLORS[data.items.length % DARK_COLORS.length],
      width: 1,
      order: data.items.length,
    }]
    save({ ...data, items: newItems })
  }

  const removeItem = (id) => {
    save({ ...data, items: data.items.filter(i => i.id !== id) })
  }

  const updateItem = (id, updates) => {
    save({
      ...data,
      items: data.items.map(i => i.id === id ? { ...i, ...updates } : i),
    })
  }

  const setColumns = (cols) => {
    save({ ...data, settings: { ...data.settings, columns: cols } })
  }

  // Drag and drop
  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const items = [...data.items]
    const [moved] = items.splice(dragIndex, 1)
    items.splice(dropIndex, 0, moved)
    save({ ...data, items: items.map((item, i) => ({ ...item, order: i })) })
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const { columns, gap } = data.settings

  const frostedStyle = {
    background: dark ? 'rgba(17,17,17,0.85)' : 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    border: `1px solid ${dark ? 'rgba(28,28,28,0.8)' : 'rgba(230,230,235,0.9)'}`,
    boxShadow: dark
      ? '0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset'
      : '0 2px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03) inset',
  }

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: dark ? '#0a0a0a' : '#f5f3ee' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-xl sticky top-0 z-10"
        style={frostedStyle}
      >
        {/* Add Image */}
        <div className="relative">
          <button
            onClick={() => { setUrlPopover(!urlPopover); setTimeout(() => urlInputRef.current?.focus(), 50) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              background: dark ? 'rgba(25,25,25,0.8)' : 'rgba(240,240,245,0.8)',
              color: dark ? '#d4d4d4' : '#2a2a2a',
            }}
          >
            <ImagePlus size={14} />
            add image
          </button>
          {urlPopover && (
            <>
              <div className="fixed inset-0 z-[1]" onClick={() => setUrlPopover(false)} />
              <div
                className="absolute top-full left-0 mt-2 z-[2] rounded-xl p-3 min-w-72"
                style={{
                  ...frostedStyle,
                  background: dark ? 'rgba(14,14,14,0.97)' : 'rgba(255,255,255,0.98)',
                }}
              >
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: dark ? '#333' : '#aaa' }}>
                  image url
                </div>
                <div className="flex gap-2">
                  <input
                    ref={urlInputRef}
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addImage(); if (e.key === 'Escape') setUrlPopover(false) }}
                    placeholder="https://..."
                    className="flex-1 bg-transparent text-xs outline-none py-1.5 px-2 rounded-md"
                    style={{
                      color: dark ? '#d4d4d4' : '#2a2a2a',
                      background: dark ? 'rgba(25,25,25,0.5)' : 'rgba(240,240,245,0.5)',
                    }}
                  />
                  <button
                    onClick={addImage}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: dark ? '#c4a759' : '#8b7a3d',
                      color: '#fff',
                    }}
                  >
                    add
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Add Text */}
        <button
          onClick={addText}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            background: dark ? 'rgba(25,25,25,0.8)' : 'rgba(240,240,245,0.8)',
            color: dark ? '#d4d4d4' : '#2a2a2a',
          }}
        >
          <Type size={14} />
          add text
        </button>

        {/* Divider */}
        <div className="w-px h-4 mx-0.5" style={{ background: dark ? 'rgba(42,42,42,0.5)' : 'rgba(0,0,0,0.08)' }} />

        {/* Generate with AI */}
        <div className="relative">
          <button
            onClick={() => { setGeneratePopover(!generatePopover); setTimeout(() => generateInputRef.current?.focus(), 50) }}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: generating
                ? (dark ? 'rgba(196,167,89,0.15)' : 'rgba(139,122,61,0.1)')
                : (dark ? 'rgba(196,167,89,0.1)' : 'rgba(139,122,61,0.08)'),
              color: dark ? '#c4a759' : '#8b7a3d',
              border: `1px solid ${dark ? 'rgba(196,167,89,0.2)' : 'rgba(139,122,61,0.15)'}`,
            }}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {generating ? 'generating...' : 'generate'}
          </button>
          {generatePopover && !generating && (
            <>
              <div className="fixed inset-0 z-[1]" onClick={() => setGeneratePopover(false)} />
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[2] rounded-xl p-4 w-80"
                style={{
                  ...frostedStyle,
                  background: dark ? 'rgba(14,14,14,0.97)' : 'rgba(255,255,255,0.98)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={12} style={{ color: dark ? '#c4a759' : '#8b7a3d' }} />
                  <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: dark ? '#c4a759' : '#8b7a3d' }}>
                    ai generate
                  </span>
                </div>
                <p className="text-[11px] mb-3 leading-relaxed" style={{ color: dark ? '#555' : '#999' }}>
                  describe a topic and Claude will search for images and build your moodboard
                </p>
                <input
                  ref={generateInputRef}
                  type="text"
                  value={generateTopic}
                  onChange={(e) => setGenerateTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && generateTopic.trim()) {
                      onGenerate?.(generateTopic.trim())
                      setGenerateTopic('')
                      setGeneratePopover(false)
                    }
                    if (e.key === 'Escape') setGeneratePopover(false)
                  }}
                  placeholder="e.g. photosynthesis diagrams, cell biology..."
                  className={`w-full text-xs outline-none py-2 px-3 rounded-lg mb-2 ${dark ? 'placeholder-[#333]' : 'placeholder-[#bbb]'}`}
                  style={{
                    color: dark ? '#d4d4d4' : '#2a2a2a',
                    background: dark ? 'rgba(25,25,25,0.8)' : 'rgba(240,240,245,0.8)',
                    border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                  }}
                />
                <button
                  onClick={() => {
                    if (generateTopic.trim()) {
                      onGenerate?.(generateTopic.trim())
                      setGenerateTopic('')
                      setGeneratePopover(false)
                    }
                  }}
                  disabled={!generateTopic.trim()}
                  className="w-full py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
                  style={{
                    background: dark ? '#c4a759' : '#8b7a3d',
                    color: '#fff',
                  }}
                >
                  generate moodboard
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Column count */}
        <div className="flex items-center gap-1">
          <Columns3 size={13} style={{ color: dark ? '#444' : '#aaa' }} />
          {[2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setColumns(n)}
              className="w-6 h-6 rounded text-[11px] font-medium transition-colors"
              style={{
                background: columns === n ? (dark ? '#c4a759' : '#8b7a3d') : 'transparent',
                color: columns === n ? '#fff' : (dark ? '#606060' : '#999'),
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {data.items.length === 0 && !generating && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: dark ? '#111' : '#eae7e0',
              border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
            }}
          >
            <ImagePlus size={24} style={{ color: dark ? '#2a2a2a' : '#bbb' }} />
          </div>
          <p className="text-sm mb-5" style={{ color: dark ? '#333' : '#aaa' }}>
            start building your moodboard
          </p>

          {/* Generate CTA */}
          <div
            className="rounded-xl p-5 mb-5 w-full max-w-sm"
            style={{
              background: dark ? 'rgba(196,167,89,0.04)' : 'rgba(139,122,61,0.03)',
              border: `1px solid ${dark ? 'rgba(196,167,89,0.12)' : 'rgba(139,122,61,0.1)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} style={{ color: dark ? '#c4a759' : '#8b7a3d' }} />
              <span className="text-xs font-medium" style={{ color: dark ? '#c4a759' : '#8b7a3d' }}>generate with ai</span>
            </div>
            <p className="text-[11px] mb-3 leading-relaxed" style={{ color: dark ? '#444' : '#999' }}>
              enter a topic and Claude will search for images and create your board
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={generateTopic}
                onChange={(e) => setGenerateTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && generateTopic.trim()) {
                    onGenerate?.(generateTopic.trim())
                    setGenerateTopic('')
                  }
                }}
                placeholder="e.g. photosynthesis, baroque art..."
                className={`flex-1 text-xs outline-none py-2 px-3 rounded-lg ${dark ? 'placeholder-[#333]' : 'placeholder-[#bbb]'}`}
                style={{
                  color: dark ? '#d4d4d4' : '#2a2a2a',
                  background: dark ? 'rgba(25,25,25,0.8)' : 'rgba(240,240,245,0.8)',
                  border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                }}
              />
              <button
                onClick={() => {
                  if (generateTopic.trim()) {
                    onGenerate?.(generateTopic.trim())
                    setGenerateTopic('')
                  }
                }}
                disabled={!generateTopic.trim()}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
                style={{
                  background: dark ? '#c4a759' : '#8b7a3d',
                  color: '#fff',
                }}
              >
                generate
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-12" style={{ background: dark ? '#1c1c1c' : '#ddd9d0' }} />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: dark ? '#222' : '#ccc' }}>or add manually</span>
            <div className="h-px w-12" style={{ background: dark ? '#1c1c1c' : '#ddd9d0' }} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setUrlPopover(true); setTimeout(() => urlInputRef.current?.focus(), 50) }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors"
              style={{
                background: dark ? '#191919' : '#e8e5de',
                color: dark ? '#d4d4d4' : '#2a2a2a',
                border: `1px solid ${dark ? '#2a2a2a' : '#ddd9d0'}`,
              }}
            >
              <ImagePlus size={14} />
              add image
            </button>
            <button
              onClick={addText}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors"
              style={{
                background: dark ? '#191919' : '#e8e5de',
                color: dark ? '#d4d4d4' : '#2a2a2a',
                border: `1px solid ${dark ? '#2a2a2a' : '#ddd9d0'}`,
              }}
            >
              <Type size={14} />
              add text
            </button>
          </div>
        </div>
      )}

      {/* Generating state */}
      {generating && data.items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 size={16} className="animate-spin" style={{ color: dark ? '#c4a759' : '#8b7a3d' }} />
            <span className="text-sm font-medium" style={{ color: dark ? '#c4a759' : '#8b7a3d' }}>generating moodboard...</span>
          </div>
          <p className="text-xs" style={{ color: dark ? '#444' : '#999' }}>
            searching for images and building your board
          </p>
        </div>
      )}

      {/* Masonry grid */}
      {data.items.length > 0 && (
        <div
          style={{
            columnCount: columns,
            columnGap: `${gap}px`,
          }}
        >
          {data.items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className="group relative mb-3"
              style={{
                breakInside: 'avoid',
                columnSpan: item.width === 2 ? 'all' : undefined,
                opacity: dragIndex === index ? 0.4 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {/* Drop indicator */}
              {dragOverIndex === index && dragIndex !== index && (
                <div
                  className="absolute -top-1.5 left-0 right-0 h-0.5 rounded-full z-10"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d' }}
                />
              )}

              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: item.type === 'text'
                    ? (dark ? (item.color || '#1a1a2e') : (COLOR_MAP[item.color] || '#e8e5f0'))
                    : (dark ? '#111' : '#f0ede6'),
                  border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                }}
              >
                {/* Drag handle + delete */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-[2]">
                  <div
                    className="cursor-grab p-1 rounded-md"
                    style={{ background: dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)', color: dark ? '#999' : '#888' }}
                  >
                    <GripVertical size={12} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
                    className="p-1 rounded-md transition-colors"
                    style={{ background: dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)', color: dark ? '#999' : '#888' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ff6b6b'}
                    onMouseLeave={(e) => e.currentTarget.style.color = dark ? '#999' : '#888'}
                  >
                    <X size={12} />
                  </button>
                </div>

                {item.type === 'image' ? (
                  <>
                    <img
                      src={proxyImageUrl(item.url)}
                      alt={item.caption || ''}
                      loading="lazy"
                      className="w-full block"
                      style={{ borderRadius: item.caption ? '12px 12px 0 0' : 12 }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling && (e.target.nextSibling.style.display = 'flex')
                      }}
                    />
                    <div
                      className="hidden items-center justify-center py-8"
                      style={{ color: dark ? '#333' : '#bbb' }}
                    >
                      <ImagePlus size={20} />
                    </div>
                    {/* Caption */}
                    <div className="px-3 py-2">
                      <input
                        type="text"
                        value={item.caption || ''}
                        onChange={(e) => updateItem(item.id, { caption: e.target.value })}
                        placeholder="add caption..."
                        className={`w-full bg-transparent text-xs outline-none ${dark ? 'placeholder-[#333]' : 'placeholder-[#bbb]'}`}
                        style={{ color: dark ? '#808080' : '#666' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </>
                ) : (
                  <div className="p-4">
                    <AutoTextarea
                      value={item.content || ''}
                      onChange={(e) => updateItem(item.id, { content: e.target.value })}
                      placeholder="write something..."
                      className={`w-full bg-transparent text-sm outline-none resize-none border-none ${dark ? 'placeholder-[#555555]' : 'placeholder-[#aaaaaa]'}`}
                      style={{ color: dark ? '#d4d4d4' : '#2a2a2a', minHeight: 40, caretColor: dark ? '#c4a759' : '#8b7a3d' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
