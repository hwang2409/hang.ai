import { useRef, useCallback } from 'react'
import Sidebar from './Sidebar'
import SidePanel from './SidePanel'
import StatusBar from './StatusBar'
import { useWorkspace } from '../contexts/WorkspaceContext'

export default function Layout({ children }) {
  const { panelOpen, panelWidth, setPanelWidth } = useWorkspace()
  const dragRef = useRef(null)

  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: panelWidth }
    const onMove = (ev) => {
      const diff = dragRef.current.startX - ev.clientX
      setPanelWidth(Math.min(700, Math.max(280, dragRef.current.startWidth + diff)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth, setPanelWidth])

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg">
            {children}
          </div>
          {panelOpen && (
            <div className="flex flex-shrink-0 h-full" style={{ width: panelWidth }}>
              {/* Resize handle */}
              <div
                onMouseDown={handleDragStart}
                className="w-1.5 cursor-col-resize flex items-center justify-center hover:bg-[rgba(196,167,89,0.06)] transition-colors group flex-shrink-0"
                style={{ borderLeft: '1px solid var(--color-border, #1c1c1c)' }}
              >
                <div className="w-px h-8 bg-border group-hover:bg-[#2a2a2a] transition-colors rounded-full" />
              </div>
              <SidePanel />
            </div>
          )}
        </div>
        <StatusBar />
      </main>
    </div>
  )
}
