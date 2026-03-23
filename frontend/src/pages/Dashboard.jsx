import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame, Brain, FileText, Clock, Layers, AlertTriangle, BookOpen, Calendar, CheckCircle, ChevronRight, ChevronDown, RotateCcw, StickyNote, ArrowRight, Zap, Lightbulb, TrendingUp, Timer, BarChart3, Play, HelpCircle, Square, X, Users } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import PomodoroInsightsWidget from '../components/plugins/PomodoroInsightsWidget'
import { usePlugins } from '../contexts/PluginContext'

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function QuickAction({ icon: Icon, label, sublabel, onClick, dark }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl text-left transition-all group"
      style={{
        background: dark ? '#111111' : '#f5f3ee',
        border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = dark ? '#2a2a2a' : '#ccc8bf'}
      onMouseLeave={e => e.currentTarget.style.borderColor = dark ? '#1c1c1c' : '#ddd9d0'}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: dark ? 'rgba(196,167,89,0.06)' : 'rgba(160,130,40,0.04)' }}>
        <Icon size={16} style={{ color: dark ? '#c4a759' : '#8b7a3d' }} />
      </div>
      <div>
        <div className="text-[13px] font-medium" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>{label}</div>
        <div className="text-[11px]" style={{ color: dark ? '#404040' : '#aaaaaa' }}>{sublabel}</div>
      </div>
    </button>
  )
}

const PLUGIN_WIDGET_MAP = { pomodoro_insights: PomodoroInsightsWidget }

export default function Dashboard() {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const { togglePanel } = useWorkspace()
  const pluginCtx = usePlugins()
  const [pomodoroStats, setPomodoroStats] = useState(null)
  const [sessions, setSessions] = useState([])
  const [flashcardStats, setFlashcardStats] = useState(null)
  const [notes, setNotes] = useState([])
  const [todos, setTodos] = useState([])
  const [review, setReview] = useState(null)
  const [showSuggested, setShowSuggested] = useState(false)
  const [trends, setTrends] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [mastery, setMastery] = useState(null)
  const [habits, setHabits] = useState(null)
  const [nudges, setNudges] = useState([])
  const [reviewStats, setReviewStats] = useState(null)
  const [socialFeed, setSocialFeed] = useState([])
  const [dismissedNudges, setDismissedNudges] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('neuronic_dismissed_nudges') || '[]') } catch { return [] }
  })

  const dueCount = flashcardStats?.due_today ?? 0

  const startPomodoro = async () => {
    try {
      await api.post('/pomodoro', {
        label: 'Focus session',
        session_type: 'focus',
        duration_minutes: 25,
        planned_minutes: 25,
        completed: false,
      })
      localStorage.setItem('neuronic_active_pomodoro', JSON.stringify({
        endTime: Date.now() + 25 * 60 * 1000,
        duration: 25,
        paused: false,
      }))
      window.dispatchEvent(new Event('storage'))
    } catch {}
  }

  useEffect(() => {
    api.get('/pomodoro/stats').then(setPomodoroStats).catch(() => {})
    api.get('/pomodoro?days=365').then(setSessions).catch(() => {})
    api.get('/flashcards/stats').then(setFlashcardStats).catch(() => {})
    api.get('/notes').then(data => setNotes((data.documents || data).slice(0, 5))).catch(() => {})
    api.get('/todos?completed=false').then(setTodos).catch(() => {})
    api.get('/dashboard/review').then(setReview).catch(() => {})
    api.get('/reviews/stats').then(setReviewStats).catch(() => {})
    api.get('/dashboard/trends?weeks=8').then(setTrends).catch(() => {})
    api.get('/pomodoro/analytics?weeks=12').then(setAnalytics).catch(() => {})
    api.get('/dashboard/mastery').then(setMastery).catch(() => {})
    api.get('/dashboard/habits').then(setHabits).catch(() => {})
    api.post('/dashboard/generate-nudges').catch(() => {})
    api.get('/social/feed?limit=5').then(data => setSocialFeed(data || [])).catch(() => {})
    api.get('/notifications').then(data => {
      const studyNudges = (data.notifications || []).filter(n => n.type === 'study_nudge' && !n.is_read)
      setNudges(studyNudges)
    }).catch(() => {})
  }, [])

  // Heatmap data: minutes per day for last 365 days
  const heatmapData = useMemo(() => {
    const map = {}
    const focusSessions = sessions.filter(s => s.session_type === 'focus' && s.completed)
    focusSessions.forEach(s => {
      const day = new Date(s.started_at).toISOString().slice(0, 10)
      map[day] = (map[day] || 0) + s.duration_minutes
    })
    return map
  }, [sessions])

  // Weekly chart data: last 7 days
  const weeklyData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      days.push({ label, minutes: heatmapData[key] || 0 })
    }
    return days
  }, [heatmapData])

  const maxWeeklyMinutes = Math.max(...weeklyData.map(d => d.minutes), 1)

  // Recent activity feed
  const recentActivity = useMemo(() => {
    const items = []
    sessions.slice(0, 10).forEach(s => {
      if (s.session_type === 'focus' && s.completed) {
        items.push({
          type: 'pomodoro',
          text: `${s.duration_minutes}m focus${s.label ? ` — ${s.label}` : ''}`,
          time: s.started_at,
        })
      }
    })
    notes.forEach(n => {
      items.push({
        type: 'note',
        text: n.title || 'Untitled note',
        time: n.updated_at || n.created_at,
      })
    })
    items.sort((a, b) => new Date(b.time) - new Date(a.time))
    return items.slice(0, 8)
  }, [sessions, notes])

  const dismissNudge = async (nudge) => {
    const updated = [...dismissedNudges, nudge.id]
    setDismissedNudges(updated)
    sessionStorage.setItem('neuronic_dismissed_nudges', JSON.stringify(updated))
    try { await api.post(`/notifications/${nudge.id}/read`) } catch {}
  }

  const visibleNudges = nudges.filter(n => !dismissedNudges.includes(n.id))

  const toggleTodo = async (todo) => {
    await api.put(`/todos/${todo.id}`, { completed: !todo.completed })
    api.get('/todos?completed=false').then(setTodos).catch(() => {})
  }

  const toggleBriefTodo = async (item) => {
    // Extract todo id from the item link (e.g. /todos or /todos/123)
    const match = item.link?.match(/\/todos\/(\d+)/)
    if (match) {
      try {
        await api.put(`/todos/${match[1]}`, { completed: true })
        // Refresh the daily brief and todos
        api.get('/dashboard/review').then(setReview).catch(() => {})
        api.get('/todos?completed=false').then(setTodos).catch(() => {})
      } catch {}
    }
  }

  const startBriefPomodoro = async (item) => {
    try {
      await api.post('/pomodoro', {
        label: item.title || 'Study session',
        session_type: 'focus',
        duration_minutes: 25,
        planned_minutes: 25,
        completed: false,
      })
      localStorage.setItem('neuronic_active_pomodoro', JSON.stringify({
        endTime: Date.now() + 25 * 60 * 1000,
        duration: 25,
        paused: false,
      }))
      window.dispatchEvent(new Event('storage'))
      if (item.link) navigate(item.link)
    } catch {}
  }

  // Build heatmap grid (52 weeks x 7 days)
  const heatmapGrid = useMemo(() => {
    const weeks = []
    const today = new Date()
    const dayOfWeek = today.getDay()
    // Start from 52 weeks ago, aligned to Sunday
    const start = new Date(today)
    start.setDate(start.getDate() - (52 * 7 + dayOfWeek))

    for (let w = 0; w < 53; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + w * 7 + d)
        const key = date.toISOString().slice(0, 10)
        const isFuture = date > today
        week.push({ date: key, minutes: heatmapData[key] || 0, isFuture })
      }
      weeks.push(week)
    }
    return weeks
  }, [heatmapData])

  // Month labels for heatmap
  const monthLabels = useMemo(() => {
    const labels = []
    const today = new Date()
    const dayOfWeek = today.getDay()
    const start = new Date(today)
    start.setDate(start.getDate() - (52 * 7 + dayOfWeek))

    let lastMonth = -1
    for (let w = 0; w < 53; w++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7)
      const month = date.getMonth()
      if (month !== lastMonth) {
        labels.push({ week: w, label: date.toLocaleDateString('en-US', { month: 'short' }) })
        lastMonth = month
      }
    }
    return labels
  }, [])

  const heatmapMax = Math.max(...Object.values(heatmapData), 1)

  function heatmapColor(minutes) {
    if (minutes === 0) return dark ? '#111' : '#eee'
    const intensity = Math.min(minutes / heatmapMax, 1)
    if (intensity < 0.25) return dark ? '#3d2e0a' : '#f5e6b8'
    if (intensity < 0.5) return dark ? '#6b4f12' : '#e8c96e'
    if (intensity < 0.75) return dark ? '#9a731c' : '#d4a730'
    return '#c4a759'
  }

  const cardClasses = 'bg-bg-secondary border-border'

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto animate-fade-in">
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-12 lg:pt-12">

          <h1 className="text-lg font-semibold mb-8 text-text">
            dashboard
          </h1>

          {/* Quick Start */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <QuickAction icon={Play} label="Focus session" sublabel="25 min pomodoro" onClick={startPomodoro} dark={dark} />
            <QuickAction icon={Layers} label="Review cards" sublabel={`${dueCount} due`} onClick={() => navigate('/flashcards/study')} dark={dark} />
            <QuickAction icon={HelpCircle} label="Take a quiz" sublabel="Test yourself" onClick={() => navigate('/quizzes')} dark={dark} />
            <QuickAction icon={Brain} label="Feynman" sublabel="Explain to learn" onClick={() => navigate('/feynman')} dark={dark} />
            {reviewStats?.due_review_count > 0 && (
              <QuickAction icon={BookOpen} label="Review notes" sublabel={`${reviewStats.due_review_count} due`} onClick={() => navigate('/reviews')} dark={dark} />
            )}
          </div>

          {/* Smart Nudges */}
          {visibleNudges.length > 0 && (
            <div className="space-y-2 mb-6">
              {visibleNudges.map(nudge => (
                <div
                  key={nudge.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer group transition-colors"
                  style={{
                    background: dark ? 'rgba(196,167,89,0.06)' : 'rgba(196,167,89,0.04)',
                    borderColor: dark ? 'rgba(196,167,89,0.15)' : 'rgba(196,167,89,0.25)',
                  }}
                  onClick={() => nudge.link && navigate(nudge.link)}
                >
                  <Zap size={14} style={{ color: '#c4a759', flexShrink: 0 }} />
                  <span className="text-xs flex-1 min-w-0 truncate text-text">{nudge.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissNudge(nudge) }}
                    className="flex-shrink-0 p-1 rounded-md transition-colors border-0 cursor-pointer"
                    style={{
                      background: 'transparent',
                      color: dark ? '#555' : '#aaa',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = dark ? '#999' : '#666'}
                    onMouseLeave={e => e.currentTarget.style.color = dark ? '#555' : '#aaa'}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Daily Brief */}
          {review && (() => {
            const items = review.brief_items || []
            const _urgent = items.filter(i => i.priority === 1)
            const _important = items.filter(i => i.priority === 2)
            const suggested = items.filter(i => i.priority === 3)
            const studyNext = review.study_next
            const estMin = review.estimated_minutes || 0

            const briefIcon = (type, size = 12) => {
              const s = { flexShrink: 0 }
              switch (type) {
                case 'overdue_todo': return <AlertTriangle size={size} style={{ ...s, color: '#ef4444' }} />
                case 'flashcard_review': return <Layers size={size} style={{ ...s, color: '#c4a759' }} />
                case 'study_plan': return <Calendar size={size} style={{ ...s, color: '#c4a759' }} />
                case 'quiz_retake': return <RotateCcw size={size} style={{ ...s, color: '#c4a759' }} />
                case 'feynman_retry': return <BookOpen size={size} style={{ ...s, color: '#f59e0b' }} />
                case 'upcoming_todo': return <Clock size={size} className="text-text-muted" style={s} />
                case 'stale_note': return <StickyNote size={size} className="text-text-muted" style={s} />
                default: return <ChevronRight size={size} style={s} />
              }
            }

            const BriefRow = ({ item }) => (
              <div
                className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg group transition-colors"
                style={item.priority === 1 ? { background: dark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)' } : {}}
              >
                {(item.type === 'overdue_todo' || item.type === 'upcoming_todo') ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleBriefTodo(item) }}
                    className="flex-shrink-0 transition-colors"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    title="Mark complete"
                  >
                    <Square size={12} style={{ color: item.type === 'overdue_todo' ? '#ef4444' : (dark ? '#555' : '#aaa') }} />
                  </button>
                ) : (
                  briefIcon(item.type)
                )}
                <Link
                  to={item.link}
                  className="flex-1 min-w-0 no-underline"
                >
                  <span className="text-xs block truncate text-text">{item.title}</span>
                  {item.subtitle && <span className="text-[10px] block truncate text-text-muted">{item.subtitle}</span>}
                </Link>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.type === 'flashcard_review' && (
                    <button onClick={(e) => { e.stopPropagation(); togglePanel('flashcards') }}
                      className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors border-0 cursor-pointer"
                      style={{
                        background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)',
                        color: dark ? '#c4a759' : '#8b7a3d',
                      }}>
                      Review
                    </button>
                  )}
                  {item.type === 'quiz_retake' && (
                    <button onClick={(e) => { e.stopPropagation(); navigate(item.link) }}
                      className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors border-0 cursor-pointer"
                      style={{
                        background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)',
                        color: dark ? '#c4a759' : '#8b7a3d',
                      }}>
                      Retake
                    </button>
                  )}
                  {item.type === 'study_plan' && (
                    <button onClick={(e) => { e.stopPropagation(); startBriefPomodoro(item) }}
                      className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors border-0 cursor-pointer"
                      style={{
                        background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)',
                        color: dark ? '#c4a759' : '#8b7a3d',
                      }}>
                      Start
                    </button>
                  )}
                  {item.type === 'feynman_retry' && (
                    <button onClick={(e) => { e.stopPropagation(); navigate(item.link) }}
                      className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors border-0 cursor-pointer"
                      style={{
                        background: dark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)',
                        color: dark ? '#f59e0b' : '#b45309',
                      }}>
                      Retry
                    </button>
                  )}
                  <ChevronRight size={12} style={{ flexShrink: 0 }} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )

            // Items for the task list (excluding the study_next item to avoid duplication)
            const remainingItems = studyNext
              ? items.filter(i => !(i.type === studyNext.type && i.title === studyNext.title && i.link === studyNext.link))
              : items
            const remainingUrgent = remainingItems.filter(i => i.priority === 1)
            const remainingImportant = remainingItems.filter(i => i.priority === 2)

            return (
              <div className={`rounded-xl border p-5 mb-6 ${cardClasses}`} style={{ borderColor: dark ? '#2a2211' : '#e8d9a0' }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#c4a759' }}>
                    <Flame size={10} />
                    daily brief
                  </p>
                  {estMin > 0 && (
                    <span className="text-[10px] flex items-center gap-1 text-text-muted">
                      <Clock size={9} />
                      ~{formatMinutes(estMin)} today
                    </span>
                  )}
                </div>

                {/* Greeting */}
                {review.greeting && (
                  <p className="text-sm mb-4 text-text">
                    {review.greeting}
                  </p>
                )}

                {items.length === 0 ? (
                  <div className="flex items-center gap-2 py-3 justify-center">
                    <CheckCircle size={14} style={{ color: '#c4a759' }} />
                    <span className="text-xs text-text-secondary">nothing on the agenda. enjoy the free time.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Study Next — prominent CTA */}
                    {studyNext && (
                      <Link
                        to={studyNext.link}
                        className="flex items-center gap-3 p-3 rounded-lg no-underline group transition-all"
                        style={{
                          background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(196,167,89,0.06)',
                          border: `1px solid ${dark ? 'rgba(196,167,89,0.2)' : 'rgba(196,167,89,0.25)'}`,
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: dark ? 'rgba(196,167,89,0.15)' : 'rgba(196,167,89,0.12)' }}
                        >
                          {briefIcon(studyNext.type, 16)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: '#c4a759' }}>
                            study next
                          </span>
                          <span className="text-sm font-medium block truncate text-text">
                            {studyNext.title}
                          </span>
                          {studyNext.subtitle && (
                            <span className="text-[11px] block truncate text-text-secondary">
                              {studyNext.subtitle}
                            </span>
                          )}
                        </div>
                        <ArrowRight
                          size={16}
                          style={{ color: '#c4a759', flexShrink: 0 }}
                          className="group-hover:translate-x-0.5 transition-transform"
                        />
                      </Link>
                    )}

                    {/* Remaining action items */}
                    {(remainingUrgent.length > 0 || remainingImportant.length > 0) && (
                      <div className="space-y-3">
                        {remainingUrgent.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />
                              <span className="text-[10px] uppercase tracking-wider" style={{ color: '#ef4444' }}>urgent</span>
                            </div>
                            {remainingUrgent.map((item, i) => <BriefRow key={`u-${i}`} item={item} />)}
                          </div>
                        )}

                        {remainingImportant.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4a759' }} />
                              <span className="text-[10px] uppercase tracking-wider" style={{ color: '#c4a759' }}>also today</span>
                            </div>
                            {remainingImportant.map((item, i) => <BriefRow key={`i-${i}`} item={item} />)}
                          </div>
                        )}
                      </div>
                    )}

                    {suggested.length > 0 && (
                      <div>
                        <button
                          onClick={() => setShowSuggested(!showSuggested)}
                          className="flex items-center gap-1.5 mb-1 w-full text-left bg-transparent border-0 cursor-pointer p-0"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-text-muted" />
                          <span className="text-[10px] uppercase tracking-wider text-text-muted">
                            suggested ({suggested.length})
                          </span>
                          <ChevronDown
                            size={10}
                            className="text-text-muted"
                            style={{ transform: showSuggested ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                          />
                        </button>
                        {showSuggested && suggested.map((item, i) => <BriefRow key={`s-${i}`} item={item} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Activity Heatmap */}
          <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
            <p className="text-[10px] uppercase tracking-wider mb-3 text-text-muted">
              study activity
            </p>
            <div className="overflow-x-auto">
              {/* Month labels */}
              <div className="flex ml-0" style={{ paddingLeft: 0 }}>
                {monthLabels.map((m, i) => (
                  <span
                    key={i}
                    className="text-[9px] text-text-muted"
                    style={{
                      position: 'relative',
                      left: m.week * 13,
                      marginRight: -10,
                    }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
              {/* Grid */}
              <div className="flex gap-[2px] mt-1">
                {heatmapGrid.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        title={day.isFuture ? '' : `${day.date}: ${day.minutes}m`}
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 2,
                          background: day.isFuture ? 'transparent' : heatmapColor(day.minutes),
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {pomodoroStats && [
              { label: 'today', value: formatMinutes(pomodoroStats.today_focus_minutes), sub: `${pomodoroStats.today_sessions} sessions` },
              { label: 'this week', value: formatMinutes(pomodoroStats.week_focus_minutes), sub: `${pomodoroStats.week_sessions} sessions` },
              { label: 'streak', value: `${pomodoroStats.current_streak}d`, sub: pomodoroStats.current_streak > 0 ? 'keep going' : 'start today', icon: pomodoroStats.current_streak > 0 ? Flame : null },
              { label: 'total', value: formatMinutes(pomodoroStats.total_focus_minutes), sub: `${pomodoroStats.total_sessions} sessions` },
            ].map(({ label, value, sub, icon: StatIcon }) => (
              <div key={label} className={`rounded-xl px-4 py-3 border ${cardClasses}`}>
                <p className="text-[10px] uppercase tracking-wider mb-1 text-text-muted">{label}</p>
                <p className="text-lg font-semibold flex items-center gap-1 text-text">
                  {StatIcon && <StatIcon size={14} style={{ color: '#c4a759' }} />}
                  {value}
                </p>
                <p className="text-[11px] text-text-muted">{sub}</p>
              </div>
            ))}
          </div>

          {/* Flashcard stats */}
          {flashcardStats && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'due today', value: flashcardStats.due_today ?? 0 },
                { label: 'mastered', value: flashcardStats.mastered ?? 0 },
                { label: 'learning', value: flashcardStats.learning ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className={`rounded-xl px-4 py-3 border ${cardClasses}`}>
                  <p className="text-[10px] uppercase tracking-wider mb-1 text-text-muted">{label}</p>
                  <p className="text-lg font-semibold text-text">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Performance Trends */}
          {trends && (() => {
            const hasQuiz = trends.quiz_accuracy?.some(w => w.count > 0)
            const hasRetention = trends.flashcard_retention?.some(w => w.total > 0)
            const hasStudy = trends.study_minutes?.some(w => w.minutes > 0)
            if (!hasQuiz && !hasRetention && !hasStudy) return null

            const TrendLine = ({ data, valueKey, color, label, suffix = '%', maxOverride }) => {
              const points = data || []
              const values = points.map(p => p[valueKey])
              const max = maxOverride || Math.max(...values, 1)
              const h = 80, w = points.length > 1 ? 100 : 100

              // Build SVG path
              const pathPoints = values.map((v, i) => {
                const x = points.length > 1 ? (i / (points.length - 1)) * w : w / 2
                const y = h - (v / max) * (h - 8) - 4
                return `${x},${y}`
              })
              const hasData = values.some(v => v > 0)
              const latest = values[values.length - 1] || 0
              const prev = values.length >= 2 ? values[values.length - 2] : latest
              const delta = latest - prev

              return (
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
                    {hasData && (
                      <span className="text-xs font-medium" style={{ color }}>
                        {Math.round(latest)}{suffix}
                        {delta !== 0 && (
                          <span className="text-[10px] ml-1" style={{ color: delta > 0 ? '#4ade80' : '#f87171' }}>
                            {delta > 0 ? '+' : ''}{Math.round(delta)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {hasData ? (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }} preserveAspectRatio="none">
                      {/* Grid lines */}
                      {[0.25, 0.5, 0.75].map(f => (
                        <line key={f} x1="0" y1={h - f * (h - 12) - 4} x2={w} y2={h - f * (h - 12) - 4}
                          stroke={dark ? '#1a1a1a' : '#eee'} strokeWidth="0.5" />
                      ))}
                      {/* Line */}
                      <polyline
                        points={pathPoints.join(' ')}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {/* Dots */}
                      {values.map((v, i) => {
                        if (v === 0) return null
                        const x = points.length > 1 ? (i / (points.length - 1)) * w : w / 2
                        const y = h - (v / max) * (h - 8) - 4
                        return <circle key={i} cx={x} cy={y} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />
                      })}
                    </svg>
                  ) : (
                    <div className="flex items-center justify-center" style={{ height: 80 }}>
                      <span className="text-[10px] text-text-muted">no data yet</span>
                    </div>
                  )}
                  {/* Week labels */}
                  <div className="flex justify-between mt-1">
                    {points.length > 0 && (
                      <>
                        <span className="text-[8px] text-text-muted">
                          {new Date(points[0].week + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-[8px] text-text-muted">
                          {new Date(points[points.length - 1].week + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
                <p className="text-[10px] uppercase tracking-wider mb-4 text-text-muted">
                  performance trends
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {hasQuiz && (
                    <TrendLine data={trends.quiz_accuracy} valueKey="avg_pct" color={dark ? '#c4a759' : '#a08928'} label="quiz accuracy" />
                  )}
                  {hasRetention && (
                    <TrendLine data={trends.flashcard_retention} valueKey="retention_pct" color={dark ? '#4ade80' : '#16a34a'} label="card retention" />
                  )}
                  {hasStudy && (
                    <TrendLine data={trends.study_minutes} valueKey="minutes" color={dark ? '#60a5fa' : '#2563eb'} label="study time" suffix="m"
                      maxOverride={Math.max(...trends.study_minutes.map(w => w.minutes), 60)} />
                  )}
                </div>
              </div>
            )
          })()}

          {/* Topic Mastery */}
          {mastery && mastery.topics?.length > 0 && (
            <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
              <p className="text-[10px] uppercase tracking-wider mb-4 text-text-muted">
                topic mastery
              </p>
              <div className="space-y-2.5">
                {mastery.topics.map((t) => {
                  const barColor = t.mastery_pct >= 70 ? (dark ? '#4ade80' : '#16a34a')
                    : t.mastery_pct >= 40 ? '#c4a759'
                    : (dark ? '#f87171' : '#dc2626')
                  return (
                    <div key={t.note_id}>
                      <div className="flex items-center justify-between mb-1">
                        <Link
                          to={`/notes/${t.note_id}`}
                          className="text-xs truncate max-w-[60%] no-underline text-text"
                        >
                          {t.topic}
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted">
                            {t.flashcard_count > 0 && `${t.flashcard_count} cards`}
                            {t.quiz_attempts > 0 && `${t.flashcard_count > 0 ? ' · ' : ''}${t.quiz_attempts} quiz${t.quiz_attempts !== 1 ? 'zes' : ''}`}
                            {t.feynman_score != null && `${(t.flashcard_count > 0 || t.quiz_attempts > 0) ? ' · ' : ''}feynman ${t.feynman_score}`}
                          </span>
                          <span className="text-xs font-medium w-10 text-right" style={{ color: barColor }}>
                            {Math.round(t.mastery_pct)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-bg-tertiary">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(t.mastery_pct, 2)}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Study Habits */}
          {habits && habits.insights?.length > 0 && (
            <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-text-muted">
                  <Lightbulb size={10} />
                  study habits
                </p>
                {habits.study_days_last_30 > 0 && (
                  <span className="text-[10px] text-text-muted">
                    {habits.study_days_last_30} days active · {habits.avg_daily_minutes > 0 ? `~${Math.round(habits.avg_daily_minutes)}m/day avg` : ''}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {habits.insights.map((insight, i) => {
                  const iconMap = {
                    performance: <TrendingUp size={13} style={{ color: '#4ade80', flexShrink: 0 }} />,
                    consistency: <Flame size={13} style={{ color: '#c4a759', flexShrink: 0 }} />,
                    timing: <Clock size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />,
                    sessions: <Timer size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />,
                  }
                  return (
                    <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-bg">
                      <div className="mt-0.5">{iconMap[insight.category] || <BarChart3 size={13} className="text-text-secondary" style={{ flexShrink: 0 }} />}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium mb-0.5 text-text">{insight.title}</p>
                        <p className="text-[11px] leading-relaxed text-text-secondary">{insight.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Weekly Focus Chart */}
          <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
            <p className="text-[10px] uppercase tracking-wider mb-3 text-text-muted">
              this week
            </p>
            <div className="flex items-end gap-2" style={{ height: 100 }}>
              {weeklyData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-text-muted">
                    {d.minutes > 0 ? formatMinutes(d.minutes) : ''}
                  </span>
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: d.minutes > 0 ? Math.max((d.minutes / maxWeeklyMinutes) * 70, 4) : 4,
                      background: d.minutes > 0 ? '#c4a759' : (dark ? '#151515' : '#eee'),
                      maxWidth: 40,
                    }}
                  />
                  <span className="text-[9px] text-text-muted">
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Study Time Analytics */}
          {analytics && analytics.weekly_hours?.some(w => w.hours > 0) && (() => {
            const weeks = analytics.weekly_hours
            const maxHours = Math.max(...weeks.map(w => w.hours), 1)
            const trendColor = analytics.trend === 'increasing' ? '#4ade80'
              : analytics.trend === 'decreasing' ? '#f87171' : (dark ? '#555' : '#999')
            const trendLabel = analytics.trend === 'increasing' ? 'trending up'
              : analytics.trend === 'decreasing' ? 'trending down' : 'stable'

            return (
              <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-text-muted">
                    study time
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] flex items-center gap-1" style={{ color: trendColor }}>
                      {analytics.trend === 'increasing' ? '↑' : analytics.trend === 'decreasing' ? '↓' : '→'} {trendLabel}
                    </span>
                  </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'avg / week', value: `${analytics.avg_hours_per_week}h` },
                    { label: 'best week', value: `${analytics.best_week_hours}h` },
                    { label: 'total', value: `${analytics.total_hours}h` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-sm font-semibold text-text">{value}</p>
                      <p className="text-[9px] uppercase tracking-wider text-text-muted">{label}</p>
                    </div>
                  ))}
                </div>

                {/* 12-week bar chart */}
                <div className="flex items-end gap-1" style={{ height: 80 }}>
                  {weeks.map((w, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-sm"
                        title={`${w.week}: ${w.hours}h (${w.sessions} sessions)`}
                        style={{
                          height: w.hours > 0 ? Math.max((w.hours / maxHours) * 60, 3) : 3,
                          background: w.hours > 0 ? (dark ? '#60a5fa' : '#2563eb') : (dark ? '#151515' : '#eee'),
                          maxWidth: 28,
                        }}
                      />
                    </div>
                  ))}
                </div>
                {/* Week labels - first and last */}
                <div className="flex justify-between mt-1">
                  <span className="text-[8px] text-text-muted">
                    {weeks.length > 0 ? new Date(weeks[0].week + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                  <span className="text-[8px] text-text-muted">
                    {weeks.length > 0 ? new Date(weeks[weeks.length - 1].week + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Pending Todos */}
            <div className={`rounded-xl border p-4 ${cardClasses}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  pending todos
                </p>
                <Link to="/todos" className="text-[10px]" style={{ color: '#c4a759' }}>view all</Link>
              </div>
              <div className="space-y-1">
                {todos.slice(0, 5).map(todo => (
                  <div key={todo.id} className="flex items-center gap-2 py-1.5">
                    <button
                      onClick={() => toggleTodo(todo)}
                      className="w-3.5 h-3.5 rounded border flex-shrink-0 border-border"
                    />
                    <span className="text-xs truncate text-text">
                      {todo.text}
                    </span>
                  </div>
                ))}
                {todos.length === 0 && (
                  <p className="text-xs py-2 text-text-muted">all caught up</p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className={`rounded-xl border p-4 ${cardClasses}`}>
              <p className="text-[10px] uppercase tracking-wider mb-3 text-text-muted">
                recent activity
              </p>
              <div className="space-y-1">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    {item.type === 'pomodoro' ? (
                      <Brain size={12} style={{ color: '#c4a759', flexShrink: 0 }} />
                    ) : (
                      <FileText size={12} className="text-text-muted" style={{ flexShrink: 0 }} />
                    )}
                    <span className="text-xs truncate flex-1 text-text">
                      {item.text}
                    </span>
                    <span className="text-[10px] flex-shrink-0 text-text-muted">
                      {relativeTime(item.time)}
                    </span>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <p className="text-xs py-2 text-text-muted">no recent activity</p>
                )}
              </div>
            </div>
          </div>

          {/* Friend Activity */}
          {socialFeed.length > 0 && (
            <div className={`rounded-xl border p-4 mb-6 ${cardClasses}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-text-muted">
                  <Users size={10} />
                  friend activity
                </p>
                <Link to="/groups" className="text-[10px] no-underline" style={{ color: '#c4a759' }}>see all</Link>
              </div>
              <div className="space-y-1">
                {socialFeed.map(e => {
                  const detail = (() => { try { return JSON.parse(e.detail_json || '{}') } catch { return {} } })()
                  let text = e.event_type
                  switch (e.event_type) {
                    case 'study_session':
                      text = `studied for ${detail.duration_minutes || '?'}min`; break
                    case 'flashcard_review':
                      text = 'reviewed flashcards'; break
                    case 'quiz_complete':
                      text = `scored ${detail.score}/${detail.total} on ${detail.title || 'a quiz'}`; break
                    case 'note_created':
                      text = 'created a note'; break
                    case 'note_shared':
                      text = 'shared a note'; break
                    default: break
                  }
                  return (
                    <div key={e.id} className="flex items-center gap-3 py-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                        style={{
                          background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(196,167,89,0.06)',
                          color: dark ? '#c4a759' : '#8b7a3d',
                          border: `1px solid ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(196,167,89,0.2)'}`,
                        }}>
                        {e.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0 truncate">
                        <span className="text-xs font-medium text-text">{e.username}</span>
                        <span className="text-xs text-text-secondary"> {text}</span>
                      </div>
                      <span className="text-[10px] flex-shrink-0 text-text-muted tabular-nums">
                        {relativeTime(e.created_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Plugin widgets */}
          {pluginCtx?.getDashboardWidgets().map(widgetId => {
            const Widget = PLUGIN_WIDGET_MAP[widgetId]
            return Widget ? <Widget key={widgetId} /> : null
          })}

        </div>
      </div>
    </Layout>
  )
}
