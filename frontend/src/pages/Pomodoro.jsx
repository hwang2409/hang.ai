import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, Coffee, Brain, Clock, Flame, ChevronDown, Tag } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function Pomodoro() {
  const { dark } = useTheme()
  const { user } = useAuth()

  const MODES = useMemo(() => ({
    focus: { label: 'focus', minutes: user?.pomodoro_focus || 25, color: '#c4a759', icon: Brain },
    short_break: { label: 'short break', minutes: user?.pomodoro_short_break || 5, color: '#59a7c4', icon: Coffee },
    long_break: { label: 'long break', minutes: user?.pomodoro_long_break || 15, color: '#7a59c4', icon: Clock },
  }), [user?.pomodoro_focus, user?.pomodoro_short_break, user?.pomodoro_long_break])

  const [mode, setMode] = useState('focus')
  const [timeLeft, setTimeLeft] = useState(() => (user?.pomodoro_focus || 25) * 60)
  const [running, setRunning] = useState(false)
  const [label, setLabel] = useState('')
  const [sessionCount, setSessionCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [activeTab, setActiveTab] = useState('timer')
  const startTimeRef = useRef(null)
  const intervalRef = useRef(null)
  const audioRef = useRef(null)

  const modeConfig = MODES[mode]

  // Load stats on mount
  useEffect(() => {
    api.get('/pomodoro/stats').then(setStats).catch(() => {})
    api.get('/pomodoro?days=90').then(setHistory).catch(() => {})
  }, [])

  // Create audio context for notification
  useEffect(() => {
    audioRef.current = {
      play: () => {
        try {
          const ctx = new AudioContext()
          // Play a gentle chime: two notes
          const playNote = (freq, startTime, duration) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = freq
            osc.type = 'sine'
            gain.gain.setValueAtTime(0.3, startTime)
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration)
            osc.start(startTime)
            osc.stop(startTime + duration)
          }
          const now = ctx.currentTime
          playNote(880, now, 0.3)
          playNote(1100, now + 0.15, 0.4)
          playNote(880, now + 0.4, 0.3)
        } catch { /* ignored */ }
      }
    }
  }, [])

  const switchMode = useCallback((newMode) => {
    setRunning(false)
    clearInterval(intervalRef.current)
    setMode(newMode)
    setTimeLeft(MODES[newMode].minutes * 60)
    startTimeRef.current = null
  }, [MODES])

  // Timer logic
  useEffect(() => {
    if (running && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(intervalRef.current)
    }
  }, [running, timeLeft])

  // Handle timer completion
  useEffect(() => {
    if (timeLeft === 0 && running) {
      setRunning(false) // eslint-disable-line react-hooks/set-state-in-effect
      audioRef.current?.play()

      // Record session
      const elapsed = modeConfig.minutes
      const now = new Date()
      const startedAt = new Date(now.getTime() - elapsed * 60000)

      api.post('/pomodoro', {
        label: label.trim() || null,
        session_type: mode,
        duration_minutes: elapsed,
        planned_minutes: modeConfig.minutes,
        completed: true,
        started_at: startedAt.toISOString(),
      }).then(() => {
        api.get('/pomodoro/stats').then(setStats)
        api.get('/pomodoro?days=90').then(setHistory)
      }).catch(() => {})

      if (mode === 'focus') {
        const next = (sessionCount + 1) % 4 === 0 ? 'long_break' : 'short_break'
        setSessionCount(prev => prev + 1)
        // Auto-switch to break after a short delay
        setTimeout(() => {
          switchMode(next)
        }, 1000)
      } else {
        setTimeout(() => {
          switchMode('focus')
        }, 1000)
      }
    }
  }, [timeLeft, running, label, mode, modeConfig.minutes, sessionCount, switchMode])

  const toggleTimer = useCallback(() => {
    if (timeLeft === 0) {
      // Reset if completed
      setTimeLeft(modeConfig.minutes * 60)
      return
    }
    if (!running) {
      startTimeRef.current = Date.now()
    }
    setRunning(prev => !prev)
  }, [running, timeLeft, modeConfig])

  const resetTimer = useCallback(() => {
    setRunning(false)
    clearInterval(intervalRef.current)
    setTimeLeft(modeConfig.minutes * 60)
    startTimeRef.current = null
  }, [modeConfig])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        toggleTimer()
      } else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        resetTimer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleTimer, resetTimer])

  // Progress circle
  const total = modeConfig.minutes * 60
  const progress = 1 - timeLeft / total
  const radius = 120
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  const focusSessions = history.filter(s => s.session_type === 'focus' && s.completed)

  // Topics data: group focus sessions by label
  const topicsData = useMemo(() => {
    const map = {}
    focusSessions.forEach(s => {
      if (!s.label || !s.label.trim()) return
      const key = s.label.trim().toLowerCase()
      if (!map[key]) {
        map[key] = { label: s.label.trim(), totalMinutes: 0, sessions: 0, lastStudied: s.started_at }
      }
      map[key].totalMinutes += s.duration_minutes
      map[key].sessions += 1
      // Use most recent casing
      if (new Date(s.started_at) > new Date(map[key].lastStudied)) {
        map[key].label = s.label.trim()
        map[key].lastStudied = s.started_at
      }
    })
    return Object.values(map).sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [focusSessions])

  // Limit history display to recent sessions only
  const recentHistory = useMemo(() => {
    const recent = {}
    const recentSessions = focusSessions.slice(0, 20)
    recentSessions.forEach(s => {
      const date = new Date(s.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      if (!recent[date]) recent[date] = []
      recent[date].push(s)
    })
    return recent
  }, [focusSessions])

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto animate-fade-in">
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-12 lg:pt-12">

          {/* Tab selector */}
          <div className="flex justify-center gap-4 mb-8">
            {[
              { key: 'timer', label: 'timer', icon: Clock },
              { key: 'topics', label: 'topics', icon: Tag },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all"
                style={{
                  color: activeTab === tab.key ? (dark ? '#e0e0e0' : '#1a1a1a') : (dark ? '#444' : '#aaa'),
                  borderBottom: activeTab === tab.key ? '2px solid #c4a759' : '2px solid transparent',
                }}
              >
                <tab.icon size={13} />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'topics' ? (
            /* Topics Tab */
            <div>
              {topicsData.length === 0 ? (
                <p className="text-center text-sm mt-12" style={{ color: dark ? '#333' : '#bbb' }}>
                  no labeled sessions yet — add a label when you start a focus session
                </p>
              ) : (
                <div className="space-y-2">
                  {topicsData.map(topic => (
                    <div
                      key={topic.label}
                      className="rounded-xl px-4 py-3 border"
                      style={{
                        background: dark ? '#0d0d0d' : '#fafafa',
                        borderColor: dark ? '#1a1a1a' : '#eee',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
                          {topic.label}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: '#c4a759' }}>
                          {formatMinutes(topic.totalMinutes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px]" style={{ color: dark ? '#444' : '#aaa' }}>
                          {topic.sessions} {topic.sessions === 1 ? 'session' : 'sessions'}
                        </span>
                        <span className="text-[11px]" style={{ color: dark ? '#333' : '#bbb' }}>
                          last studied {new Date(topic.lastStudied).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Mode selector */}
          <div className="flex justify-center gap-2 mb-12">
            {Object.entries(MODES).map(([key, cfg]) => {
              const Icon = cfg.icon
              const active = mode === key
              return (
                <button
                  key={key}
                  onClick={() => !running && switchMode(key)}
                  disabled={running}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? (dark ? '#1a1a1a' : '#f0f0f0') : 'transparent',
                    color: active ? cfg.color : (dark ? '#444' : '#aaa'),
                    border: active ? `1px solid ${dark ? '#2a2a2a' : '#ddd'}` : '1px solid transparent',
                    opacity: running && !active ? 0.3 : 1,
                    cursor: running ? 'default' : 'pointer',
                  }}
                >
                  <Icon size={13} />
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Session label */}
          <div className="flex justify-center mb-6">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="what are you studying?"
              className="text-center text-sm bg-transparent border-none outline-none w-64"
              style={{ color: dark ? '#888' : '#666', borderBottom: `1px solid ${dark ? '#1a1a1a' : '#eee'}`, paddingBottom: 4 }}
            />
          </div>

          {/* Timer circle */}
          <div className="flex justify-center mb-10">
            <div className="relative" style={{ width: 280, height: 280 }}>
              <svg width="280" height="280" className="transform -rotate-90">
                {/* Background circle */}
                <circle
                  cx="140" cy="140" r={radius}
                  fill="none"
                  stroke={dark ? '#151515' : '#eee'}
                  strokeWidth="6"
                />
                {/* Progress circle */}
                <circle
                  cx="140" cy="140" r={radius}
                  fill="none"
                  stroke={modeConfig.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  opacity={0.8}
                />
              </svg>

              {/* Time display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="font-mono font-light tracking-wider"
                  style={{
                    fontSize: 56,
                    color: timeLeft === 0 ? modeConfig.color : (dark ? '#e0e0e0' : '#1a1a1a'),
                  }}
                >
                  {formatTime(timeLeft)}
                </span>
                <span className="text-[11px] mt-1" style={{ color: dark ? '#333' : '#bbb' }}>
                  {mode === 'focus'
                    ? `session ${sessionCount + 1}`
                    : modeConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4 mb-12">
            <button
              onClick={resetTimer}
              className="p-3 rounded-full transition-all"
              style={{
                background: dark ? '#111' : '#f5f5f5',
                color: dark ? '#444' : '#999',
                border: `1px solid ${dark ? '#1a1a1a' : '#eee'}`,
              }}
            >
              <RotateCcw size={18} />
            </button>

            <button
              onClick={toggleTimer}
              className="px-8 py-3 rounded-full text-sm font-semibold transition-all"
              style={{
                background: running ? (dark ? '#1a1a1a' : '#f0f0f0') : modeConfig.color,
                color: running ? modeConfig.color : '#000',
                border: running ? `1px solid ${modeConfig.color}40` : 'none',
                minWidth: 140,
              }}
            >
              <span className="flex items-center justify-center gap-2">
                {running ? <Pause size={16} /> : <Play size={16} />}
                {timeLeft === 0 ? 'done' : running ? 'pause' : 'start'}
              </span>
            </button>

            <div className="p-3 rounded-full" style={{ visibility: 'hidden' }}>
              <RotateCcw size={18} />
            </div>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-[10px] mb-12" style={{ color: dark ? '#222' : '#ccc' }}>
            space to start/pause &middot; r to reset
          </p>

          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'today', value: formatMinutes(stats.today_focus_minutes), sub: `${stats.today_sessions} sessions` },
                { label: 'this week', value: formatMinutes(stats.week_focus_minutes), sub: `${stats.week_sessions} sessions` },
                { label: 'streak', value: `${stats.current_streak}d`, sub: stats.current_streak > 0 ? 'keep going' : 'start today', icon: stats.current_streak > 0 ? Flame : null },
                { label: 'total', value: formatMinutes(stats.total_focus_minutes), sub: `${stats.total_sessions} sessions` },
              ].map(({ label, value, sub, icon: StatIcon }) => (
                <div
                  key={label}
                  className="rounded-xl px-4 py-3 border"
                  style={{
                    background: dark ? '#0d0d0d' : '#fafafa',
                    borderColor: dark ? '#1a1a1a' : '#eee',
                  }}
                >
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: dark ? '#333' : '#bbb' }}>
                    {label}
                  </p>
                  <p className="text-lg font-semibold flex items-center gap-1" style={{ color: dark ? '#e0e0e0' : '#1a1a1a' }}>
                    {StatIcon && <StatIcon size={14} className="text-orange-500" />}
                    {value}
                  </p>
                  <p className="text-[11px]" style={{ color: dark ? '#333' : '#bbb' }}>
                    {sub}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* History toggle */}
          {focusSessions.length > 0 && (
            <div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 text-xs mb-3 transition-colors"
                style={{ color: dark ? '#444' : '#999' }}
              >
                <ChevronDown size={14} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                recent sessions
              </button>

              {showHistory && (
                <div className="space-y-4 animate-fade-in">
                  {Object.entries(recentHistory).map(([date, sessions]) => (
                    <div key={date}>
                      <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: dark ? '#333' : '#bbb' }}>
                        {date} &middot; {formatMinutes(sessions.reduce((acc, s) => acc + s.duration_minutes, 0))}
                      </p>
                      <div className="space-y-1">
                        {sessions.map(s => (
                          <div
                            key={s.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg"
                            style={{ background: dark ? '#0d0d0d' : '#fafafa' }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: MODES.focus.color }} />
                            <span className="text-xs" style={{ color: dark ? '#888' : '#666' }}>
                              {new Date(s.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                            <span className="text-xs font-medium" style={{ color: dark ? '#ccc' : '#333' }}>
                              {s.duration_minutes}m focus
                            </span>
                            {s.label && (
                              <span className="text-[11px] ml-auto truncate max-w-[140px]" style={{ color: dark ? '#444' : '#aaa' }}>
                                {s.label}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          </>
          )}

        </div>
      </div>
    </Layout>
  )
}
