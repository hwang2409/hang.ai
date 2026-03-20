import { useEffect, useRef, useState } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [adjusted, setAdjusted] = useState({ x, y })
  const [confirmId, setConfirmId] = useState(null)

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const pad = 8
    let ax = x, ay = y
    if (x + rect.width > window.innerWidth - pad) ax = x - rect.width
    if (y + rect.height > window.innerHeight - pad) ay = y - rect.height
    if (ax < pad) ax = pad
    if (ay < pad) ay = pad
    const handle = requestAnimationFrame(() => {
      setAdjusted({ x: ax, y: ay })
    })
    return () => cancelAnimationFrame(handle)
  }, [x, y])

  // Dismiss on outside click, escape, scroll
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    const handleScroll = () => onClose()
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[100] context-menu-enter"
      style={{ left: adjusted.x, top: adjusted.y }}
    >
      <div className="min-w-[160px] rounded-lg border border-border overflow-hidden py-1 context-menu-stagger context-menu-surface">

        {items.map((item, i) => {
          if (item.separator) {
            return <div key={`sep-${i}`} className="my-1 mx-2 border-t border-border" />
          }

          const isDanger = item.variant === 'danger'
          const _needsConfirm = item.confirm && confirmId !== item.id

          return (
            <button
              key={item.id}
              onClick={(e) => {
                e.stopPropagation()
                if (item.confirm && confirmId !== item.id) {
                  setConfirmId(item.id)
                  return
                }
                item.action()
                onClose()
              }}
              className={`
                group relative w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-all duration-150
                ${isDanger
                  ? confirmId === item.id
                    ? 'bg-[rgba(136,68,68,0.15)]'
                    : 'hover:bg-[rgba(136,68,68,0.08)]'
                  : 'hover:bg-[rgba(196,167,89,0.06)]'
                }
              `}
            >
              {item.icon && (
                <item.icon
                  size={13}
                  className={`flex-shrink-0 transition-colors duration-150 ${
                    isDanger
                      ? confirmId === item.id
                        ? 'text-danger'
                        : 'text-danger/60 group-hover:text-danger'
                      : 'text-[#444444] group-hover:text-[#c4a759]'
                  }`}
                />
              )}
              <span className={`text-[11px] tracking-wide transition-colors duration-150 ${
                isDanger
                  ? confirmId === item.id
                    ? 'text-danger'
                    : 'text-danger/70 group-hover:text-danger'
                  : 'text-text-secondary group-hover:text-text'
              }`}>
                {confirmId === item.id ? item.confirmLabel || 'confirm?' : item.label}
              </span>
              {item.shortcut && (
                <span className="ml-auto text-[9px] text-text-muted group-hover:text-[#444444] tracking-wider font-mono transition-colors duration-150">
                  {item.shortcut}
                </span>
              )}

              {/* Warm side glow on hover */}
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-0 rounded-full transition-all duration-200 group-hover:h-3/5 ${
                isDanger ? 'bg-danger' : 'bg-[#c4a759]'
              }`} style={{ opacity: 0.5 }} />
            </button>
          )
        })}
      </div>

      {/* Subtle ambient glow beneath */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-20 h-1 rounded-full pointer-events-none context-menu-glow" />
    </div>
  )
}
