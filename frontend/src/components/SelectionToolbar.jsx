import { useState, useEffect, useRef } from 'react'
import { Highlighter, Search, Layers, FileText, BookOpen, Paintbrush } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

const HIGHLIGHT_PRESET_COLORS = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
  orange: '#fed7aa',
  purple: '#e9d5ff',
}

const actions = [
  { id: 'highlight', icon: Paintbrush, label: 'highlight' },
  { id: 'annotate', icon: Highlighter, label: 'annotate' },
  { id: 'research', icon: Search, label: 'research' },
  { id: 'flashcards', icon: Layers, label: 'cards' },
  { id: 'summarize', icon: FileText, label: 'summarize' },
  { id: 'define', icon: BookOpen, label: 'define' },
]

export default function SelectionToolbar({ position, onAction, onDismiss, allowedActions }) {
  const ref = useRef(null)
  const { dark } = useTheme()
  const [showColors, setShowColors] = useState(false)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onDismiss()
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onDismiss])

  const handleActionClick = (id) => {
    if (id === 'highlight') {
      setShowColors(prev => !prev)
    } else {
      onAction(id)
    }
  }

  const handleColorClick = (colorName) => {
    onAction('highlight', { color: colorName })
    setShowColors(false)
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 animate-toolbar-rise"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="relative">
        {/* Main bar */}
        <div
          className={`flex items-center gap-0 rounded-xl border overflow-hidden toolbar-stagger ${
            dark ? 'border-[#1c1c1c]' : 'border-[#ddd9d0]'
          }`}
          style={{
            background: dark
              ? 'linear-gradient(180deg, #141414 0%, #101010 100%)'
              : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
            boxShadow: dark
              ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,167,89,0.06), 0 1px 0 0 rgba(255,255,255,0.03) inset'
              : '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(160,130,40,0.08), 0 1px 0 0 rgba(255,255,255,0.8) inset',
          }}
        >
          {(() => { const items = allowedActions ? actions.filter(a => allowedActions.includes(a.id)) : actions; return items.map(({ id, icon: Icon, label }, i) => (
            <button
              key={id}
              onClick={() => handleActionClick(id)}
              className={`group relative flex flex-col items-center gap-0.5 px-3 py-2 transition-all duration-150 hover:bg-[rgba(196,167,89,0.08)] ${
                id === 'highlight' && showColors ? (dark ? 'bg-[rgba(196,167,89,0.12)]' : 'bg-[rgba(196,167,89,0.1)]') : ''
              }`}
              style={i < items.length - 1 ? { borderRight: `1px solid ${dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)'}` } : {}}
            >
              <Icon
                size={13}
                className={`transition-colors duration-150 group-hover:text-[#c4a759] ${
                  id === 'highlight' && showColors ? 'text-[#c4a759]' : (dark ? 'text-[#606060]' : 'text-[#998f80]')
                }`}
              />
              <span className={`text-[9px] leading-none tracking-wide transition-colors duration-150 group-hover:text-[#8b7a3d] ${dark ? 'text-[#3a3a3a]' : 'text-[#b0a898]'}`}>
                {label}
              </span>
            </button>
          )); })()}
        </div>

        {/* Color picker row */}
        {showColors && (
          <div
            className={`flex items-center justify-center gap-2 rounded-lg border mt-1 px-3 py-2 ${
              dark ? 'border-[#1c1c1c]' : 'border-[#ddd9d0]'
            }`}
            style={{
              background: dark
                ? 'linear-gradient(180deg, #141414 0%, #101010 100%)'
                : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
              boxShadow: dark
                ? '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(196,167,89,0.06)'
                : '0 4px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(160,130,40,0.08)',
              animation: 'toolbar-rise 0.15s ease-out',
            }}
          >
            {Object.entries(HIGHLIGHT_PRESET_COLORS).map(([name, hex]) => (
              <button
                key={name}
                onClick={() => handleColorClick(name)}
                className="w-5 h-5 rounded-full transition-all duration-150 hover:scale-125 hover:shadow-md"
                style={{
                  backgroundColor: hex,
                  border: `1.5px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                }}
                title={name}
              />
            ))}
          </div>
        )}

        {/* Caret pointing down toward selection */}
        {!showColors && (
          <div className="flex justify-center -mt-px">
            <svg width="12" height="6" viewBox="0 0 12 6" className="drop-shadow-sm">
              <path d="M0 0 L6 6 L12 0" fill={dark ? '#101010' : '#f8f6f1'} />
              <path d="M0.5 0 L6 5.2 L11.5 0" fill="none" stroke={dark ? '#1c1c1c' : '#ddd9d0'} strokeWidth="0.5" />
            </svg>
          </div>
        )}

        {/* Subtle warm glow underneath */}
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(ellipse, rgba(196,167,89,${dark ? '0.15' : '0.25'}) 0%, transparent 70%)` }}
        />
      </div>
    </div>
  )
}
