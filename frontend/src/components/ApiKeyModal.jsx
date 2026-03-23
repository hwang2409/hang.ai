import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function ApiKeyModal() {
  const [visible, setVisible] = useState(false)
  const { dark } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = () => {
      // Debounce: don't re-trigger if already visible
      setVisible(v => v ? v : true)
    }
    window.addEventListener('api-key-required', handler)
    return () => window.removeEventListener('api-key-required', handler)
  }, [])

  if (!visible) return null

  const close = () => setVisible(false)

  const goToSettings = () => {
    setVisible(false)
    navigate('/settings')
  }

  return (
    <div
      className="fixed inset-0 z-[250] animate-modal-backdrop flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        className="w-full max-w-[380px] mx-4 animate-pop-in"
        style={{
          background: dark
            ? 'linear-gradient(180deg, #141414 0%, #0e0e0e 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
          border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
          borderRadius: 14,
          boxShadow: dark
            ? '0 25px 80px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(196,167,89,0.04)'
            : '0 25px 80px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.04), 0 0 0 1px rgba(160,130,40,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Top amber accent line */}
        <div
          className="h-px"
          style={{
            background: `linear-gradient(90deg, transparent 5%, ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'} 50%, transparent 95%)`,
          }}
        />

        <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center">
          {/* Key icon */}
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
            style={{
              background: dark
                ? 'rgba(196,167,89,0.08)'
                : 'rgba(160,130,40,0.06)',
              border: `1px solid ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'}`,
            }}
          >
            <KeyRound
              size={18}
              style={{ color: dark ? '#c4a759' : '#8b7a3d' }}
            />
          </div>

          {/* Title */}
          <h2
            className="text-sm font-medium tracking-tight mb-2"
            style={{ color: dark ? '#e8e8e8' : '#1a1a1a' }}
          >
            API key required
          </h2>

          {/* Body text */}
          <p
            className="text-xs leading-relaxed mb-6"
            style={{ color: dark ? '#606060' : '#888888' }}
          >
            To use AI features, add your Anthropic API key in settings.
            Your key is encrypted and never shared.
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={goToSettings}
              className="w-full py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              style={{
                background: dark ? '#c4a759' : '#8b7a3d',
                color: dark ? '#0a0a0a' : '#ffffff',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Go to settings
            </button>
            <button
              onClick={close}
              className="w-full py-2 text-xs rounded-lg transition-colors cursor-pointer"
              style={{
                background: 'transparent',
                color: dark ? '#606060' : '#999999',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = dark ? '#808080' : '#777777'}
              onMouseLeave={(e) => e.currentTarget.style.color = dark ? '#606060' : '#999999'}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
