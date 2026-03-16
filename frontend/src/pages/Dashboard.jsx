import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Brain, FileText, Clock, Layers, AlertTriangle, BookOpen, Calendar, CheckCircle, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'

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

export default function Dashboard() {
  const { dark } = useTheme()
  const [pomodoroStats, setPomodoroStats] = useState(null)
  const [sessions, setSessions] = useState([])
  const [flashcardStats, setFlashcardStats] = useState(null)
  const [notes, setNotes] = useState([])
  const [todos, setTodos] = useState([])
  const [review, setReview] = useState(null)

  useEffect(() => {
    api.get('/pomodoro/stats').then(setPomodoroStats).catch(() => {})
    api.get('/pomodoro?days=365').then(setSessions).catch(() => {})
    api.get('/flashcards/stats').then(setFlashcardStats).catch(() => {})
    api.get('/notes').then(data => setNotes((data.documents || data).slice(0, 5))).catch(() => {})
    api.get('/todos?completed=false').then(setTodos).catch(() => {})
    api.get('/dashboard/review').then(setReview).catch(() => {})
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

  const toggleTodo = async (todo) => {
    await api.put(`/todos/${todo.id}`, { completed: !todo.completed })
    api.get('/todos?completed=false').then(setTodos).catch(() => {})
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

  const cardStyle = {
    background: dark ? '#0d0d0d' : '#fafafa',
    borderColor: dark ? '#1a1a1a' : '#eee',
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto animate-fade-in">
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-12 lg:pt-12">

          <h1 className="text-lg font-semibold mb-8 text-text">
            dashboard
          </h1>

          {/* Today's Focus */}
          {review && (review.due_flashcard_count > 0 || review.overdue_todos.length > 0 || review.weak_topics.length > 0 || review.study_plan_today.length > 0 || review.stale_notes.length > 0) && (
            <div className="rounded-xl border p-4 mb-6" style={{ ...cardStyle, borderColor: dark ? '#2a2211' : '#e8d9a0' }}>
              <p className="text-[10px] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: '#c4a759' }}>
                <Flame size={10} />
                today's focus
              </p>
              <div className="space-y-3">
                {/* Overdue todos */}
                {review.overdue_todos.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle size={11} style={{ color: '#ef4444' }} />
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: '#ef4444' }}>overdue</span>
                    </div>
                    {review.overdue_todos.map(t => (
                      <Link key={t.id} to="/todos" className="flex items-center gap-2 py-1 pl-4 no-underline group">
                        <span className="text-xs truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>{t.text}</span>
                        {t.due_date && <span className="text-[10px] flex-shrink-0" style={{ color: '#ef4444' }}>{t.due_date}</span>}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Due flashcards */}
                {review.due_flashcard_count > 0 && (
                  <Link to="/flashcards/study" className="flex items-center gap-2 py-1 no-underline group">
                    <Layers size={12} style={{ color: '#c4a759' }} />
                    <span className="text-xs" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
                      {review.due_flashcard_count} flashcard{review.due_flashcard_count !== 1 ? 's' : ''} due for review
                    </span>
                    <ChevronRight size={12} style={{ color: dark ? '#333' : '#bbb' }} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                )}

                {/* Weak Feynman topics */}
                {review.weak_topics.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BookOpen size={11} style={{ color: '#f59e0b' }} />
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#444' : '#999' }}>weak topics</span>
                    </div>
                    {review.weak_topics.map(t => (
                      <Link key={t.id} to="/feynman" className="flex items-center gap-2 py-1 pl-4 no-underline">
                        <span className="text-xs truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>{t.topic}</span>
                        <span className="text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded" style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: t.score < 40 ? '#ef4444' : '#f59e0b' }}>
                          {t.score}%
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Study plan today */}
                {review.study_plan_today.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Calendar size={11} style={{ color: '#c4a759' }} />
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#444' : '#999' }}>today's plan</span>
                    </div>
                    {review.study_plan_today.map(item => (
                      <Link key={item.id} to="/studyplan" className="flex items-center gap-2 py-1 pl-4 no-underline">
                        {item.completed ? (
                          <CheckCircle size={12} style={{ color: '#c4a759' }} />
                        ) : (
                          <div className="w-3 h-3 rounded-full border" style={{ borderColor: dark ? '#333' : '#ccc' }} />
                        )}
                        <span className="text-xs truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a', textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.5 : 1 }}>
                          {item.topic}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Upcoming todos */}
                {review.upcoming_todos.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Clock size={11} style={{ color: dark ? '#444' : '#999' }} />
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#444' : '#999' }}>upcoming</span>
                    </div>
                    {review.upcoming_todos.map(t => (
                      <Link key={t.id} to="/todos" className="flex items-center gap-2 py-1 pl-4 no-underline">
                        <span className="text-xs truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>{t.text}</span>
                        {t.due_date && <span className="text-[10px] flex-shrink-0" style={{ color: '#c4a759' }}>{t.due_date}</span>}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Stale notes */}
                {review.stale_notes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileText size={11} style={{ color: dark ? '#444' : '#999' }} />
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#444' : '#999' }}>needs review</span>
                    </div>
                    {review.stale_notes.map(n => (
                      <Link key={n.id} to={`/notes/${n.id}`} className="flex items-center gap-2 py-1 pl-4 no-underline">
                        <span className="text-xs truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>{n.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity Heatmap */}
          <div className="rounded-xl border p-4 mb-6" style={cardStyle}>
            <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: dark ? '#333' : '#bbb' }}>
              study activity
            </p>
            <div className="overflow-x-auto">
              {/* Month labels */}
              <div className="flex ml-0" style={{ paddingLeft: 0 }}>
                {monthLabels.map((m, i) => (
                  <span
                    key={i}
                    className="text-[9px]"
                    style={{
                      color: dark ? '#333' : '#bbb',
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
              <div key={label} className="rounded-xl px-4 py-3 border" style={cardStyle}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: dark ? '#333' : '#bbb' }}>{label}</p>
                <p className="text-lg font-semibold flex items-center gap-1" style={{ color: dark ? '#e0e0e0' : '#1a1a1a' }}>
                  {StatIcon && <StatIcon size={14} className="text-orange-500" />}
                  {value}
                </p>
                <p className="text-[11px]" style={{ color: dark ? '#333' : '#bbb' }}>{sub}</p>
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
                <div key={label} className="rounded-xl px-4 py-3 border" style={cardStyle}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: dark ? '#333' : '#bbb' }}>{label}</p>
                  <p className="text-lg font-semibold" style={{ color: dark ? '#e0e0e0' : '#1a1a1a' }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Weekly Focus Chart */}
          <div className="rounded-xl border p-4 mb-6" style={cardStyle}>
            <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: dark ? '#333' : '#bbb' }}>
              this week
            </p>
            <div className="flex items-end gap-2" style={{ height: 100 }}>
              {weeklyData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px]" style={{ color: dark ? '#444' : '#999' }}>
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
                  <span className="text-[9px]" style={{ color: dark ? '#333' : '#bbb' }}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Pending Todos */}
            <div className="rounded-xl border p-4" style={cardStyle}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#333' : '#bbb' }}>
                  pending todos
                </p>
                <Link to="/todos" className="text-[10px]" style={{ color: '#c4a759' }}>view all</Link>
              </div>
              <div className="space-y-1">
                {todos.slice(0, 5).map(todo => (
                  <div key={todo.id} className="flex items-center gap-2 py-1.5">
                    <button
                      onClick={() => toggleTodo(todo)}
                      className="w-3.5 h-3.5 rounded border flex-shrink-0"
                      style={{ borderColor: dark ? '#333' : '#ccc' }}
                    />
                    <span className="text-xs truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
                      {todo.text}
                    </span>
                  </div>
                ))}
                {todos.length === 0 && (
                  <p className="text-xs py-2" style={{ color: dark ? '#333' : '#bbb' }}>all caught up</p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-xl border p-4" style={cardStyle}>
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: dark ? '#333' : '#bbb' }}>
                recent activity
              </p>
              <div className="space-y-1">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    {item.type === 'pomodoro' ? (
                      <Brain size={12} style={{ color: '#c4a759', flexShrink: 0 }} />
                    ) : (
                      <FileText size={12} style={{ color: dark ? '#444' : '#999', flexShrink: 0 }} />
                    )}
                    <span className="text-xs truncate flex-1" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
                      {item.text}
                    </span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: dark ? '#333' : '#bbb' }}>
                      {relativeTime(item.time)}
                    </span>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <p className="text-xs py-2" style={{ color: dark ? '#333' : '#bbb' }}>no recent activity</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  )
}
