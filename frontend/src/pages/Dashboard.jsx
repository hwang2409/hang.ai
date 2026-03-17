import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Brain, FileText, Clock, Layers, AlertTriangle, BookOpen, Calendar, CheckCircle, ChevronRight, ChevronDown, RotateCcw, StickyNote, ArrowRight, Zap } from 'lucide-react'
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
  const [showSuggested, setShowSuggested] = useState(false)
  const [trends, setTrends] = useState(null)

  useEffect(() => {
    api.get('/pomodoro/stats').then(setPomodoroStats).catch(() => {})
    api.get('/pomodoro?days=365').then(setSessions).catch(() => {})
    api.get('/flashcards/stats').then(setFlashcardStats).catch(() => {})
    api.get('/notes').then(data => setNotes((data.documents || data).slice(0, 5))).catch(() => {})
    api.get('/todos?completed=false').then(setTodos).catch(() => {})
    api.get('/dashboard/review').then(setReview).catch(() => {})
    api.get('/dashboard/trends?weeks=8').then(setTrends).catch(() => {})
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

          {/* Daily Brief */}
          {review && (() => {
            const items = review.brief_items || []
            const urgent = items.filter(i => i.priority === 1)
            const important = items.filter(i => i.priority === 2)
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
                case 'upcoming_todo': return <Clock size={size} style={{ ...s, color: dark ? '#444' : '#999' }} />
                case 'stale_note': return <StickyNote size={size} style={{ ...s, color: dark ? '#444' : '#999' }} />
                default: return <ChevronRight size={size} style={s} />
              }
            }

            const BriefRow = ({ item }) => (
              <Link
                to={item.link}
                className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg no-underline group transition-colors"
                style={item.priority === 1 ? { background: dark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)' } : {}}
              >
                {briefIcon(item.type)}
                <div className="flex-1 min-w-0">
                  <span className="text-xs block truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>{item.title}</span>
                  {item.subtitle && <span className="text-[10px] block truncate" style={{ color: dark ? '#444' : '#999' }}>{item.subtitle}</span>}
                </div>
                <ChevronRight size={12} style={{ color: dark ? '#333' : '#bbb', flexShrink: 0 }} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )

            // Items for the task list (excluding the study_next item to avoid duplication)
            const remainingItems = studyNext
              ? items.filter(i => !(i.type === studyNext.type && i.title === studyNext.title && i.link === studyNext.link))
              : items
            const remainingUrgent = remainingItems.filter(i => i.priority === 1)
            const remainingImportant = remainingItems.filter(i => i.priority === 2)

            return (
              <div className="rounded-xl border p-5 mb-6" style={{ ...cardStyle, borderColor: dark ? '#2a2211' : '#e8d9a0' }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#c4a759' }}>
                    <Flame size={10} />
                    daily brief
                  </p>
                  {estMin > 0 && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: dark ? '#444' : '#999' }}>
                      <Clock size={9} />
                      ~{formatMinutes(estMin)} today
                    </span>
                  )}
                </div>

                {/* Greeting */}
                {review.greeting && (
                  <p className="text-sm mb-4" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
                    {review.greeting}
                  </p>
                )}

                {items.length === 0 ? (
                  <div className="flex items-center gap-2 py-3 justify-center">
                    <CheckCircle size={14} style={{ color: '#c4a759' }} />
                    <span className="text-xs" style={{ color: dark ? '#555' : '#888' }}>nothing on the agenda. enjoy the free time.</span>
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
                          <span className="text-sm font-medium block truncate" style={{ color: dark ? '#e0e0e0' : '#1a1a1a' }}>
                            {studyNext.title}
                          </span>
                          {studyNext.subtitle && (
                            <span className="text-[11px] block truncate" style={{ color: dark ? '#555' : '#888' }}>
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
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: dark ? '#444' : '#999' }} />
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#444' : '#999' }}>
                            suggested ({suggested.length})
                          </span>
                          <ChevronDown
                            size={10}
                            style={{ color: dark ? '#444' : '#999', transform: showSuggested ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
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
                  {StatIcon && <StatIcon size={14} style={{ color: '#c4a759' }} />}
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
              const step = points.length > 1 ? w / (points.length - 1) : w

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
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: dark ? '#444' : '#999' }}>{label}</span>
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
                      <span className="text-[10px]" style={{ color: dark ? '#333' : '#ccc' }}>no data yet</span>
                    </div>
                  )}
                  {/* Week labels */}
                  <div className="flex justify-between mt-1">
                    {points.length > 0 && (
                      <>
                        <span className="text-[8px]" style={{ color: dark ? '#333' : '#bbb' }}>
                          {new Date(points[0].week + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-[8px]" style={{ color: dark ? '#333' : '#bbb' }}>
                          {new Date(points[points.length - 1].week + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div className="rounded-xl border p-4 mb-6" style={cardStyle}>
                <p className="text-[10px] uppercase tracking-wider mb-4" style={{ color: dark ? '#333' : '#bbb' }}>
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
