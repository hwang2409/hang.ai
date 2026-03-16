import { useState, useRef, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react'

export default function ImageViewer({ fileUrl, fileName }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const posStart = useRef({ x: 0, y: 0 })

  const zoomIn = () => setScale(s => Math.min(s + 0.25, 5))
  const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.25))
  const fitScreen = () => { setScale(1); setPosition({ x: 0, y: 0 }) }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(s => Math.max(0.25, Math.min(5, s + delta)))
  }, [])

  const handleMouseDown = (e) => {
    if (scale <= 1) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    posStart.current = { ...position }
  }

  const handleMouseMove = (e) => {
    if (!dragging) return
    setPosition({
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    })
  }

  const handleMouseUp = () => setDragging(false)

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-[#1c1c1c] bg-[#0e0e0e] flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors">
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-[#606060] min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn} className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors">
            <ZoomIn size={16} />
          </button>
          <button onClick={fitScreen} className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors ml-1" title="Fit to screen">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center bg-[#0a0a0a]"
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={fileUrl}
          alt={fileName || 'Image'}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>
    </div>
  )
}
