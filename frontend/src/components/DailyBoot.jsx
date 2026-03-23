import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Layers, Clock, X, ChevronRight, CheckSquare, BookOpen, Calendar, RotateCcw, Brain, AlertTriangle, PlayCircle } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const BOOT_KEY = 'neuronic_last_boot'

function timeAgo(ts) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const TYPE_ICONS = {
  overdue_todo: AlertTriangle,
  flashcard_review: Layers,
  study_plan: Calendar,
  quiz_retake: RotateCcw,
  feynman_retry: Brain,
  upcoming_todo: CheckSquare,
  stale_note: BookOpen,
}

export default function DailyBoot() {
  const [visible, setVisible] = useState(false)
  const [review, setReview] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastSession, setLastSession] = useState(null)
  const { user, loading: authLoading } = useAuth()
  const { dark } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    if (authLoading) return
    if (!getToken() || !user) return

    const lastBoot = localStorage.getItem(BOOT_KEY)
    const today = new Date().toDateString()
    if (lastBoot === today) return

    setVisible(true)
    setLoading(true)

    Promise.all([
      api.get('/dashboard/review').catch(() => null),
      api.get('/flashcards/stats').catch(() => null),
    ]).then(([reviewData, statsData]) => {
      setReview(reviewData)
      setStats(statsData)

      // Check for previous session to offer "continue where you left off"
      try {
        const raw = localStorage.getItem('neuronic_last_session')
        if (raw) {
          const session = JSON.parse(raw)
          const ONE_HOUR = 60 * 60 * 1000
          if (session.path && session.label && session.timestamp && (Date.now() - session.timestamp) > ONE_HOUR) {
            setLastSession(session)
          }
        }
      } catch {}

      setLoading(false)
    })
  }, [authLoading, user])

  const dismiss = () => {
    localStorage.setItem(BOOT_KEY, new Date().toDateString())
    setVisible(false)
  }

  const startStudying = () => {
    dismiss()
    if (review?.study_next?.link) {
      navigate(review.study_next.link)
    } else {
      navigate('/dashboard')
    }
  }

  if (!visible) return null

  const agendaItems = (review?.brief_items || [])
    .filter(item => item.priority <= 2)
    .slice(0, 5)

  const gold = dark ? '#c4a759' : '#8b7a3d'
  const goldBg = dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)'
  const goldBorder = dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'
  const subtleText = dark ? '#505050' : '#999999'
  const cardBg = dark ? '#111111' : '#f0ede6'
  const cardBorder = dark ? '#1c1c1c' : '#ddd9d0'

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center animate-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="w-full max-w-[480px] mx-4 animate-pop-in overflow-hidden"
        style={{
          background: dark
            ? 'linear-gradient(180deg, #141414 0%, #0e0e0e 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
          border: `1px solid ${cardBorder}`,
          borderRadius: 16,
          boxShadow: dark
            ? '0 30px 100px rgba(0,0,0,0.7), 0 10px 40px rgba(0,0,0,0.5)'
            : '0 30px 100px rgba(0,0,0,0.1), 0 10px 40px rgba(0,0,0,0.06)',
        }}
      >
        {/* Accent line */}
        <div
          className="h-px"
          style={{
            background: `linear-gradient(90deg, transparent 5%, ${dark ? 'rgba(196,167,89,0.2)' : 'rgba(160,130,40,0.15)'} 50%, transparent 95%)`,
          }}
        />

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors"
          style={{ color: subtleText }}
          onMouseEnter={(e) => e.currentTarget.style.color = dark ? '#808080' : '#666666'}
          onMouseLeave={(e) => e.currentTarget.style.color = subtleText}
        >
          <X size={14} />
        </button>

        <div className="px-6 pt-6 pb-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: gold, opacity: 0.4, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-[11px]" style={{ color: subtleText }}>loading your day...</p>
            </div>
          ) : (
            <>
              {/* Greeting */}
              <p
                className="text-[15px] leading-relaxed tracking-tight mb-5"
                style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}
              >
                {review?.greeting || 'welcome back.'}
              </p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'streak', value: `${review?.current_streak || 0}d`, icon: Flame },
                  { label: 'cards due', value: stats?.due_today ?? review?.due_flashcard_count ?? 0, icon: Layers },
                  { label: 'est. time', value: `${review?.estimated_minutes || 0}m`, icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-xl px-3 py-3 flex flex-col items-center gap-1.5"
                    style={{
                      background: cardBg,
                      border: `1px solid ${cardBorder}`,
                    }}
                  >
                    <Icon size={13} style={{ color: gold }} />
                    <span
                      className="text-lg font-medium tracking-tight"
                      style={{ color: dark ? '#e8e8e8' : '#1a1a1a' }}
                    >
                      {value}
                    </span>
                    <span className="text-[10px] tracking-wide" style={{ color: subtleText }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Today's agenda */}
              {agendaItems.length > 0 && (
                <div className="mb-5">
                  <p
                    className="text-[10px] uppercase tracking-widest mb-2 px-1"
                    style={{ color: subtleText }}
                  >
                    today's priorities
                  </p>
                  <div className="space-y-1">
                    {agendaItems.map((item, i) => {
                      const ItemIcon = TYPE_ICONS[item.type] || CheckSquare
                      return (
                        <button
                          key={i}
                          onClick={() => { dismiss(); navigate(item.link) }}
                          className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors"
                          style={{ background: 'transparent' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = goldBg}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <ItemIcon size={12} style={{ color: gold, flexShrink: 0 }} />
                          <span
                            className="text-[13px] truncate tracking-tight"
                            style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}
                          >
                            {item.title}
                          </span>
                          {item.subtitle && (
                            <span
                              className="text-[10px] ml-auto flex-shrink-0"
                              style={{ color: subtleText }}
                            >
                              {item.subtitle}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Continue where you left off */}
              {lastSession && (
                <div className="mb-5">
                  <p
                    className="text-[10px] uppercase tracking-widest mb-2 px-1"
                    style={{ color: subtleText }}
                  >
                    continue where you left off
                  </p>
                  <button
                    onClick={() => { dismiss(); navigate(lastSession.path) }}
                    className="w-full text-left rounded-xl px-3 py-3 flex items-center gap-3 transition-colors"
                    style={{
                      background: goldBg,
                      border: `1px solid ${goldBorder}`,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = gold}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = goldBorder}
                  >
                    <PlayCircle size={14} style={{ color: gold, flexShrink: 0 }} />
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-[13px] truncate tracking-tight"
                        style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}
                      >
                        {lastSession.label}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: subtleText }}
                      >
                        {timeAgo(lastSession.timestamp)}
                      </span>
                    </div>
                    <ChevronRight size={12} className="ml-auto flex-shrink-0" style={{ color: subtleText }} />
                  </button>
                </div>
              )}

              {/* CTA */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={startStudying}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium tracking-tight transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${dark ? '#c4a759' : '#8b7a3d'}, ${dark ? '#a08940' : '#6b5d2e'})`,
                    color: dark ? '#0e0e0e' : '#ffffff',
                    boxShadow: `0 2px 12px ${dark ? 'rgba(196,167,89,0.2)' : 'rgba(160,130,40,0.15)'}`,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Start studying
                  <ChevronRight size={14} className="inline ml-1 -mt-px" />
                </button>
                <button
                  onClick={() => { dismiss(); navigate('/dashboard') }}
                  className="text-[11px] py-1 transition-colors"
                  style={{ color: subtleText }}
                  onMouseEnter={(e) => e.currentTarget.style.color = gold}
                  onMouseLeave={(e) => e.currentTarget.style.color = subtleText}
                >
                  go to dashboard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
