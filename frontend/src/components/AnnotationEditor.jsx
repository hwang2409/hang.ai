import { useState, useEffect, useRef } from 'react'
import { Highlighter } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function AnnotationEditor({ selectedText, subtitle, onSave, onCancel }) {
  const [content, setContent] = useState('')
  const textareaRef = useRef(null)
  const { dark } = useTheme()

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  useEffect(() => {
    // Focus textarea after animation settles
    const timer = setTimeout(() => textareaRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

  const handleSave = () => {
    onSave(content)
  }

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-modal-backdrop">
      <div
        className="w-full max-w-lg mx-4 rounded-xl overflow-hidden animate-pop-in"
        style={{
          background: dark
            ? 'linear-gradient(180deg, #131313 0%, #0e0e0e 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
          border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
          boxShadow: dark
            ? '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,167,89,0.04)'
            : '0 24px 64px rgba(0,0,0,0.1), 0 0 0 1px rgba(160,130,40,0.08)',
        }}
      >
        {/* Header with amber accent line */}
        <div className="relative px-5 pt-4 pb-3">
          <div
            className="absolute top-0 left-5 right-5 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(196,167,89,0.2), transparent)' }}
          />
          <div className="flex items-center gap-2">
            <Highlighter size={12} className="text-[#8b7a3d]" />
            <h3 className={`text-xs font-medium tracking-wide ${dark ? 'text-[#808080]' : 'text-[#7a7060]'}`}>annotate selection</h3>
          </div>
        </div>

        {/* Selected text blockquote or subtitle */}
        <div className="px-5 pb-3">
          {selectedText ? (
            <div
              className="relative rounded-lg px-4 py-3"
              style={{
                background: 'rgba(196, 167, 89, 0.04)',
                borderLeft: '2px solid rgba(196, 167, 89, 0.3)',
              }}
            >
              <p className={`text-sm italic leading-relaxed line-clamp-3 ${dark ? 'text-[#a09070]' : 'text-[#7a6840]'}`}>
                {selectedText}
              </p>
            </div>
          ) : subtitle ? (
            <p className={`text-xs ${dark ? 'text-[#606060]' : 'text-[#998f80]'}`}>
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* Textarea */}
        <div className="px-5 pb-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="add your note..."
            rows={3}
            className={`w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors resize-none ${
              dark
                ? 'bg-[#0a0a0a] border border-[#1c1c1c] text-[#d4d4d4] placeholder-[#2a2a2a]'
                : 'bg-[#f0ede6] border border-[#ddd9d0] text-[#3a3530] placeholder-[#b0a898]'
            }`}
            style={{ caretColor: '#c4a759' }}
          />
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t ${dark ? 'border-[#1c1c1c]' : 'border-[#ddd9d0]'}`}>
          <span className={`text-[10px] tracking-wide ${dark ? 'text-[#2a2a2a]' : 'text-[#b0a898]'}`}>
            {'\u2318'}Enter to save
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className={`px-4 py-1.5 text-xs transition-colors rounded-md ${
                dark ? 'text-[#606060] hover:text-[#d4d4d4]' : 'text-[#998f80] hover:text-[#3a3530]'
              }`}
            >
              cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs rounded-md transition-all duration-150"
              style={{
                background: 'linear-gradient(180deg, rgba(196,167,89,0.12) 0%, rgba(196,167,89,0.06) 100%)',
                border: '1px solid rgba(196,167,89,0.15)',
                color: '#c4a759',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(180deg, rgba(196,167,89,0.2) 0%, rgba(196,167,89,0.1) 100%)'
                e.currentTarget.style.borderColor = 'rgba(196,167,89,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(180deg, rgba(196,167,89,0.12) 0%, rgba(196,167,89,0.06) 100%)'
                e.currentTarget.style.borderColor = 'rgba(196,167,89,0.15)'
              }}
            >
              save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
