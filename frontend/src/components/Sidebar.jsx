import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const mainItems = [
    { to: '/', label: 'notes' },
    { to: '/library', label: 'library' },
    { to: '/dashboard', label: 'dashboard' },
    { to: '/chat', label: 'chat' },
  ]

  const studyItems = [
    { to: '/flashcards', label: 'flashcards' },
    { to: '/feynman', label: 'feynman' },
    { to: '/quizzes', label: 'quizzes' },
    { to: '/pomodoro', label: 'pomodoro' },
    { to: '/todos', label: 'todos' },
    { to: '/studyplan', label: 'study plan' },
    { to: '/knowledge-graph', label: 'knowledge graph' },
  ]

  const adminItems = [
    { to: '/admin/imagesearch', label: 'image search' },
  ]

  const linkClasses = ({ isActive }) =>
    isActive
      ? 'block border-l-2 border-[#d4d4d4] pl-3 py-2 text-sm font-medium text-text transition-colors'
      : 'block border-l-2 border-transparent pl-4 py-2 text-sm text-text-secondary hover:text-text transition-colors'

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-6 border-b border-border">
        <span className="text-lg font-semibold text-text tracking-tight">
          hang.
        </span>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-text-secondary hover:text-text transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-5 py-8 space-y-1">
        {mainItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={linkClasses}
            onClick={() => setMobileOpen(false)}
          >
            {label}
          </NavLink>
        ))}

        {/* Study tools */}
        <div className="border-t border-border my-4" />
        <span className="block pl-4 py-1 text-[10px] uppercase tracking-widest text-text-muted">study</span>
        {studyItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={linkClasses}
            onClick={() => setMobileOpen(false)}
          >
            {label}
          </NavLink>
        ))}

        {user?.is_admin && (
          <>
            <div className="border-t border-border my-4" />
            <span className="block pl-4 py-1 text-[10px] uppercase tracking-widest text-text-muted">admin</span>
            {adminItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={linkClasses}
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="px-5 pt-4 pb-5 border-t border-border">
        <div className="text-sm text-text-secondary truncate">
          {user?.username || user?.email || 'user'}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
          <NavLink
            to="/wiki"
            className={({ isActive }) => `hover:text-text-secondary transition-colors ${isActive ? 'text-text-secondary' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            wiki
          </NavLink>
          <span className="text-border">·</span>
          <NavLink
            to="/settings"
            className={({ isActive }) => `hover:text-text-secondary transition-colors ${isActive ? 'text-text-secondary' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            settings
          </NavLink>
          <span className="text-border">·</span>
          <button
            onClick={logout}
            className="hover:text-text-secondary transition-colors"
          >
            log out
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 lg:hidden rounded-md p-2 bg-bg-secondary border border-border text-text-secondary hover:text-text transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-[rgba(0,0,0,0.8)]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-56 flex flex-col z-50 bg-[#0e0e0e] border-r border-border transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
