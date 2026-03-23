import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, FileText, Layers, HelpCircle, BookOpen, Play, Upload, CheckSquare, Calendar, Search, X, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { useTheme } from '../contexts/ThemeContext'
import Layout from '../components/Layout'

const TYPE_CONFIG = {
  note:              { icon: FileText,    label: 'Notes',       color: '#c4a759' },
  flashcard_review:  { icon: Layers,      label: 'Flashcards',  color: '#8b9cf7' },
  quiz:              { icon: HelpCircle,  label: 'Quizzes',     color: '#f78b8b' },
  feynman:           { icon: BookOpen,    label: 'Feynman',     color: '#8bf7a4' },
  pomodoro:          { icon: Play,        label: 'Pomodoro',    color: '#f7c48b' },
  file:              { icon: Upload,      label: 'Files',       color: '#8bd4f7' },
  todo:              { icon: CheckSquare, label: 'Todos',       color: '#d48bf7' },
  study_plan:        { icon: Calendar,    label: 'Study Plan',  color: '#f7f08b' },
}

function formatDayHeader(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today - target) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function groupByDay(events) {
  const groups = []
  let currentDay = null
  let currentItems = []
  for (const e of events) {
    const day = e.timestamp.slice(0, 10)
    if (day !== currentDay) {
      if (currentDay) groups.push({ day: currentDay, items: currentItems })
      currentDay = day
      currentItems = []
    }
    currentItems.push(e)
  }
  if (currentDay) groups.push({ day: currentDay, items: currentItems })
  return groups
}

export default function Timeline() {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTypes, setActiveTypes] = useState(new Set(Object.keys(TYPE_CONFIG)))
  const [search, setSearch] = useState('')
  const [days, setDays] = useState(30)

  const fetchTimeline = useCallback(async () => {
    setLoading(true)
    try {
      const types = [...activeTypes].join(',')
      const data = await api.get(`/timeline?days=${days}&types=${types}&search=${encodeURIComponent(search)}&limit=200`)
      setEvents(data.events || [])
    } catch {} finally { setLoading(false) }
  }, [activeTypes, search, days])

  useEffect(() => { fetchTimeline() }, [fetchTimeline])

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const dayGroups = useMemo(() => groupByDay(events), [events])
  const totalCount = events.length

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: dark
                    ? 'linear-gradient(135deg, rgba(196,167,89,0.08) 0%, rgba(196,167,89,0.02) 100%)'
                    : 'linear-gradient(135deg, rgba(160,130,40,0.06) 0%, rgba(160,130,40,0.01) 100%)',
                  border: `1px solid ${dark ? 'rgba(196,167,89,0.12)' : 'rgba(160,130,40,0.1)'}`,
                }}
              >
                <Clock size={16} style={{ color: dark ? '#c4a759' : '#8b7a3d' }} />
              </div>
              <div>
                <h1 className="text-[15px] font-semibold text-text tracking-[-0.01em]">Timeline</h1>
                <p className="text-[11px] text-text-secondary">
                  {loading ? 'Loading...' : `${totalCount} event${totalCount !== 1 ? 's' : ''} in the last ${days} days`}
                </p>
              </div>
            </div>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-text-secondary focus:outline-none cursor-pointer"
              style={{
                background: dark ? '#111111' : '#ffffff',
                border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
              }}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search timeline..."
              className="w-full pl-8 pr-8 py-2 rounded-lg text-xs text-text placeholder-text-muted focus:outline-none transition-colors"
              style={{
                background: dark ? '#111111' : '#ffffff',
                border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
              }}
              onFocus={e => e.currentTarget.style.borderColor = dark ? '#2a2a2a' : '#ccc8bf'}
              onBlur={e => e.currentTarget.style.borderColor = dark ? '#1c1c1c' : '#ddd9d0'}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text transition-colors">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Type filters */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
              const active = activeTypes.has(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
                  style={{
                    background: active ? `${cfg.color}15` : 'transparent',
                    border: `1px solid ${active ? `${cfg.color}35` : (dark ? '#1c1c1c' : '#ddd9d0')}`,
                    color: active ? cfg.color : (dark ? '#505050' : '#aaa'),
                    boxShadow: active ? `0 0 8px ${cfg.color}08` : 'none',
                  }}
                >
                  <cfg.icon size={10} />
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-3 pt-2">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-2 py-2.5"
                  style={{ opacity: 0, animation: `timeline-skeleton-in 0.4s ease ${i * 60}ms forwards` }}
                >
                  <div
                    className="w-[30px] h-[30px] rounded-full flex-shrink-0"
                    style={{ background: dark ? '#151515' : '#eae7e0' }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div
                      className="h-3 rounded"
                      style={{
                        background: dark ? '#151515' : '#eae7e0',
                        width: `${55 + (i * 17) % 35}%`,
                      }}
                    />
                    <div
                      className="h-2 rounded"
                      style={{
                        background: dark ? '#111111' : '#f0ede6',
                        width: `${30 + (i * 13) % 25}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <style>{`
                @keyframes timeline-skeleton-in {
                  from { opacity: 0; transform: translateY(6px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                style={{
                  background: dark
                    ? 'linear-gradient(135deg, #111111 0%, #0e0e0e 100%)'
                    : 'linear-gradient(135deg, #ffffff 0%, #f0ede6 100%)',
                  border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                }}
              >
                <Clock size={20} className="text-text-muted" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">No activity found</p>
                <p className="text-[10px] text-text-muted mt-1">
                  {search ? 'Try a different search term' : 'Start studying to build your timeline'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {dayGroups.map((group, gi) => (
                <div key={group.day}>
                  {/* Day header */}
                  <div
                    className="sticky top-0 z-10 flex items-center gap-3 py-2.5 mb-0.5"
                    style={{
                      background: dark ? '#0a0a0a' : '#f5f3ee',
                    }}
                  >
                    <span
                      className="text-[10px] uppercase tracking-[0.08em] font-semibold"
                      style={{ color: dark ? '#505050' : '#999' }}
                    >
                      {formatDayHeader(group.items[0].timestamp)}
                    </span>
                    <div
                      className="flex-1 h-px"
                      style={{ background: dark ? '#1a1a1a' : '#e8e5de' }}
                    />
                    <span
                      className="text-[9px] tabular-nums"
                      style={{ color: dark ? '#333' : '#bbb' }}
                    >
                      {group.items.length}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5">
                    {group.items.map((event, i) => {
                      const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.note
                      const Icon = cfg.icon
                      const globalIndex = dayGroups.slice(0, gi).reduce((s, g) => s + g.items.length, 0) + i

                      return (
                        <div
                          key={`${event.type}-${i}`}
                          style={{
                            opacity: 0,
                            animation: `timeline-item-in 0.35s ease ${Math.min(globalIndex * 30, 600)}ms forwards`,
                          }}
                        >
                          <button
                            onClick={() => event.link && navigate(event.link)}
                            className="w-full text-left flex items-start gap-2.5 px-2 py-2.5 rounded-lg transition-all group"
                            style={{ cursor: event.link ? 'pointer' : 'default' }}
                            onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {/* Icon */}
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                              style={{
                                background: `${cfg.color}08`,
                                border: `1px solid ${cfg.color}15`,
                              }}
                            >
                              <Icon size={12} style={{ color: `${cfg.color}cc` }} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pt-px">
                              <p className="text-[12.5px] text-text leading-snug truncate group-hover:text-primary-hover transition-colors">
                                {event.title}
                              </p>
                              {event.subtitle && (
                                <p className="text-[10.5px] text-text-secondary mt-0.5 truncate">{event.subtitle}</p>
                              )}
                            </div>

                            {/* Right side: time + arrow */}
                            <div className="flex items-center gap-1 flex-shrink-0 pt-1">
                              <span className="text-[9px] text-text-muted tabular-nums">
                                {formatTime(event.timestamp)}
                              </span>
                              {event.link && (
                                <ChevronRight
                                  size={10}
                                  className="text-text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                                />
                              )}
                            </div>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              <style>{`
                @keyframes timeline-item-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
