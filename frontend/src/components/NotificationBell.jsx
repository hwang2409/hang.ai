import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const bellRef = useRef(null)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get('/notifications')
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch {}
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      if (!document.hidden) fetchNotifications()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (
        bellRef.current && !bellRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const markRead = async (notif) => {
    if (!notif.is_read) {
      try { await api.post(`/notifications/${notif.id}/read`) } catch {}
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(prev - 1, 0))
    }
    if (notif.link) {
      setOpen(false)
      navigate(notif.link)
    }
  }

  const markAllRead = async () => {
    try { await api.post('/notifications/read-all') } catch {}
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const timeAgo = (dateStr) => {
    const raw = String(dateStr)
    const d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const dropdown = open && createPortal(
    <div
      ref={dropdownRef}
      className="fixed w-72 max-w-[calc(100vw-1rem)] max-h-80 overflow-y-auto bg-bg-secondary border border-border rounded-lg shadow-lg"
      style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text">Notifications</span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[10px] text-[#c4a759] hover:underline cursor-pointer flex-shrink-0"
          >
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-text-muted">
          No notifications
        </div>
      ) : (
        notifications.map(n => (
          <button
            key={n.id}
            onClick={() => markRead(n)}
            className={`w-full text-left px-3 py-2 border-b border-border last:border-b-0 hover:bg-bg-tertiary transition-colors cursor-pointer ${
              !n.is_read ? 'bg-bg-tertiary/50' : ''
            }`}
          >
            <div className="flex items-start gap-2 overflow-hidden">
              {!n.is_read && (
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#c4a759] flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-xs text-text leading-snug break-words">{n.title}</p>
                {n.body && <p className="text-[10px] text-text-muted mt-0.5 break-words line-clamp-2">{n.body}</p>}
                <p className="text-[10px] text-text-muted mt-0.5">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          </button>
        ))
      )}
    </div>,
    document.body
  )

  return (
    <>
      <button
        ref={bellRef}
        onClick={() => {
          if (!open && bellRef.current) {
            const rect = bellRef.current.getBoundingClientRect()
            setDropdownPos({
              top: rect.bottom + 4,
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
            })
          }
          setOpen(o => !o)
        }}
        className="relative p-1.5 rounded text-text-muted hover:text-text transition-colors cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5a4 4 0 0 0-4 4v2.5L2.5 10.5v1h11v-1L12 8V5.5a4 4 0 0 0-4-4Z" />
          <path d="M6 12a2 2 0 1 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {dropdown}
    </>
  )
}
