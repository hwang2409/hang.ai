import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Menu, X, ChevronDown } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePlugins } from '../contexts/PluginContext'
import NotificationBell from './NotificationBell'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const morePaths = ['/feynman', '/pomodoro', '/studyplan', '/knowledge-graph', '/timeline', '/automations', '/groups', '/forum', '/wiki']
  const isOnMorePage = morePaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))
  const [moreOpen, setMoreOpen] = useState(isOnMorePage)
  const navigate = useNavigate()
  const pluginCtx = usePlugins()

  const mainItems = [
    { to: '/', label: 'notes' },
    { to: '/library', label: 'library' },
    { to: '/dashboard', label: 'dashboard' },
    { to: '/chat', label: 'chat' },
  ]

  const studyItems = [
    { to: '/flashcards', label: 'flashcards' },
    { to: '/reviews', label: 'reviews' },
    { to: '/quizzes', label: 'quizzes' },
    { to: '/todos', label: 'todos' },
  ]

  const moreItems = [
    { to: '/feynman', label: 'feynman' },
    { to: '/pomodoro', label: 'pomodoro' },
    { to: '/studyplan', label: 'study plan' },
    { to: '/knowledge-graph', label: 'knowledge graph' },
    { to: '/timeline', label: 'timeline' },
    { to: '/automations', label: 'automations' },
    { to: '/groups', label: 'study groups' },
    { to: '/forum', label: 'forum' },
    { to: '/wiki', label: 'wiki' },
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
          neuronic
        </span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-text-secondary hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>
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

        {/* More tools */}
        <div className="border-t border-border my-4" />
        <button
          onClick={() => setMoreOpen(o => !o)}
          className="flex items-center justify-between w-full pl-4 pr-2 py-1 text-[10px] uppercase tracking-widest text-text-muted hover:text-text-secondary transition-colors"
        >
          <span>more</span>
          <ChevronDown size={12} className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        {moreOpen && moreItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={linkClasses}
            onClick={() => setMobileOpen(false)}
          >
            {label}
          </NavLink>
        ))}
        {moreOpen && pluginCtx?.getNavItems('more').map(({ to, label }) => (
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
      <div className="px-5 py-4 border-t border-border">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive
              ? 'block py-1.5 text-xs text-text-secondary transition-colors'
              : 'block py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors'
          }
          onClick={() => setMobileOpen(false)}
        >
          settings
        </NavLink>
        <div className="border-t border-border mt-3 pt-3 flex items-center gap-2.5">
          <div
            onClick={() => { setMobileOpen(false); if (user?.id) navigate(`/profile/${user.id}`) }}
            className="w-6 h-6 rounded-full bg-bg-tertiary border border-border flex items-center justify-center text-[10px] font-medium text-text-secondary flex-shrink-0 cursor-pointer hover:border-[#c4a759] transition-colors"
          >
            {user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <span
              onClick={() => { setMobileOpen(false); if (user?.id) navigate(`/profile/${user.id}`) }}
              className="block text-xs text-text truncate cursor-pointer hover:text-[#c4a759] transition-colors"
            >
              {user?.username}
            </span>
            {user?.reputation != null && (
              <span className="block text-[10px] text-[#c4a759]">{user.reputation} rep</span>
            )}
          </div>
          <button
            onClick={logout}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
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
