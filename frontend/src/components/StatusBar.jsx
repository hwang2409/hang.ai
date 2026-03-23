import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, Square, Layers, CheckSquare, FilePlus, Zap, MessageCircle, Clock } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useTheme } from '../contexts/ThemeContext'
import { useFocus } from '../contexts/FocusContext'

const TIMER_KEY = 'neuronic_active_pomodoro'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function StatusBar() {
  const { dark } = useTheme()
  const { togglePanel } = useWorkspace()
  const { startFocus } = useFocus()
  const navigate = useNavigate()

  // Pomodoro state
  const [timerActive, setTimerActive] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [paused, setPaused] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [doneFlash, setDoneFlash] = useState(false)
  const intervalRef = useRef(null)

  // Counters
  const [dueCards, setDueCards] = useState(0)
  const [pendingTodos, setPendingTodos] = useState(0)

  // ── Restore timer from localStorage on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.paused) {
        setTimerActive(true)
        setPaused(true)
        setTimeLeft(saved.pausedRemaining || 0)
        setSessionId(saved.sessionId || null)
      } else if (saved.endTime) {
        const remaining = Math.round((saved.endTime - Date.now()) / 1000)
        if (remaining > 0) {
          setTimerActive(true)
          setTimeLeft(remaining)
          setSessionId(saved.sessionId || null)
        } else {
          // Timer expired while away — clean up
          localStorage.removeItem(TIMER_KEY)
        }
      }
    } catch {
      localStorage.removeItem(TIMER_KEY)
    }
  }, [])

  // ── Countdown interval ──
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (timerActive && !paused) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
            // Timer complete
            handleTimerComplete()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [timerActive, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync localStorage when timer state changes ──
  useEffect(() => {
    if (!timerActive) {
      // Don't remove on done flash
      if (!doneFlash) localStorage.removeItem(TIMER_KEY)
      return
    }
    if (paused) {
      localStorage.setItem(TIMER_KEY, JSON.stringify({
        paused: true,
        pausedRemaining: timeLeft,
        sessionId,
      }))
    } else {
      localStorage.setItem(TIMER_KEY, JSON.stringify({
        endTime: Date.now() + timeLeft * 1000,
        duration: 25,
        sessionId,
        paused: false,
      }))
    }
  }, [timerActive, paused, timeLeft, sessionId, doneFlash])

  const handleTimerComplete = useCallback(async () => {
    setTimerActive(false)
    setPaused(false)
    setTimeLeft(0)
    localStorage.removeItem(TIMER_KEY)

    // Show "Done!" briefly
    setDoneFlash(true)
    setTimeout(() => setDoneFlash(false), 2500)

    // Mark session as completed
    if (sessionId && getToken()) {
      try {
        await api.post('/pomodoro', {
          label: 'Focus session',
          session_type: 'focus',
          duration_minutes: 25,
          planned_minutes: 25,
          completed: true,
        })
      } catch {
        // silently fail
      }
    }
    setSessionId(null)
  }, [sessionId])

  const startTimer = useCallback(async () => {
    setTimerActive(true)
    setPaused(false)
    setTimeLeft(25 * 60)

    let newSessionId = null
    if (getToken()) {
      try {
        const data = await api.post('/pomodoro', {
          label: 'Focus session',
          session_type: 'focus',
          duration_minutes: 25,
          planned_minutes: 25,
          completed: false,
        })
        newSessionId = data.id
      } catch {
        // silently fail — timer still works locally
      }
    }
    setSessionId(newSessionId)
  }, [])

  const pauseTimer = useCallback(() => {
    setPaused(true)
  }, [])

  const resumeTimer = useCallback(() => {
    setPaused(false)
  }, [])

  const stopTimer = useCallback(() => {
    setTimerActive(false)
    setPaused(false)
    setTimeLeft(0)
    setSessionId(null)
    localStorage.removeItem(TIMER_KEY)
  }, [])

  // ── Fetch counters ──
  const fetchCounts = useCallback(async () => {
    if (!getToken()) return
    try {
      const [cards, todos] = await Promise.all([
        api.get('/flashcards/due').catch(() => []),
        api.get('/todos?completed=false').catch(() => []),
      ])
      setDueCards(Array.isArray(cards) ? cards.length : 0)
      setPendingTodos(Array.isArray(todos) ? todos.length : 0)
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchCounts()
    const id = setInterval(fetchCounts, 60000)
    return () => clearInterval(id)
  }, [fetchCounts])

  // ── New note action ──
  const handleNewNote = useCallback(async () => {
    try {
      const data = await api.post('/notes', {})
      if (data?.id) navigate('/notes/' + data.id)
    } catch {
      // silently fail
    }
  }, [navigate])

  // ── Styles ──
  const bgColor = dark ? '#0e0e0e' : '#f0ede6'
  const borderColor = dark ? '#1c1c1c' : '#ddd9d0'
  const textColor = dark ? '#606060' : '#888888'
  const textHoverColor = dark ? '#808080' : '#666666'
  const activeColor = '#c4a759'
  const btnBg = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
  const btnHoverBg = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'

  const iconBtnStyle = {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: textColor,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    padding: 0,
    flexShrink: 0,
  }

  return (
    <div
      style={{
        height: 36,
        minHeight: 36,
        maxHeight: 36,
        background: bgColor,
        borderTop: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        color: textColor,
        fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
        letterSpacing: '0.01em',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 20,
        gap: 8,
      }}
    >
      {/* ── Left: Pomodoro Timer ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '0 0 auto' }}>
        {doneFlash ? (
          <span style={{ color: activeColor, fontWeight: 500, fontSize: 11 }}>
            Done!
          </span>
        ) : !timerActive ? (
          <button
            onClick={() => startFocus()}
            style={{
              ...iconBtnStyle,
              width: 'auto',
              gap: 4,
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = btnHoverBg
              e.currentTarget.style.color = textHoverColor
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = textColor
            }}
            title="Start focus session"
          >
            <Play size={12} strokeWidth={2} />
            <span style={{ fontSize: 11 }}>Start focus</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={12} strokeWidth={2} style={{ color: activeColor, flexShrink: 0 }} />
            <span style={{
              color: paused ? textColor : (dark ? '#b0b0b0' : '#444444'),
              fontVariantNumeric: 'tabular-nums',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 500,
              opacity: paused ? 0.6 : 1,
            }}>
              {formatTime(timeLeft)}
            </span>
            {paused ? (
              <button
                onClick={resumeTimer}
                style={iconBtnStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.background = btnHoverBg
                  e.currentTarget.style.color = activeColor
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = textColor
                }}
                title="Resume timer"
              >
                <Play size={12} strokeWidth={2} />
              </button>
            ) : (
              <button
                onClick={pauseTimer}
                style={iconBtnStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.background = btnHoverBg
                  e.currentTarget.style.color = textHoverColor
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = textColor
                }}
                title="Pause timer"
              >
                <Pause size={12} strokeWidth={2} />
              </button>
            )}
            <button
              onClick={stopTimer}
              style={iconBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = btnHoverBg
                e.currentTarget.style.color = dark ? '#884444' : '#aa4444'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = textColor
              }}
              title="Stop timer"
            >
              <Square size={11} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* ── Center: Status Counters ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
        <button
          onClick={() => togglePanel('flashcards')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            color: textColor,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = btnHoverBg
            e.currentTarget.style.color = textHoverColor
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = textColor
          }}
          title="Due flashcards"
        >
          <Layers size={13} strokeWidth={1.8} />
          <span>{dueCards} due</span>
        </button>

        <button
          onClick={() => togglePanel('todos')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            color: textColor,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = btnHoverBg
            e.currentTarget.style.color = textHoverColor
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = textColor
          }}
          title="Pending tasks"
        >
          <CheckSquare size={13} strokeWidth={1.8} />
          <span>{pendingTodos} tasks</span>
        </button>
      </div>

      {/* ── Right: Quick Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
        <button
          onClick={handleNewNote}
          style={iconBtnStyle}
          onMouseEnter={e => {
            e.currentTarget.style.background = btnHoverBg
            e.currentTarget.style.color = textHoverColor
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = textColor
          }}
          title="New note"
        >
          <FilePlus size={13} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => togglePanel('flashcards')}
          style={iconBtnStyle}
          onMouseEnter={e => {
            e.currentTarget.style.background = btnHoverBg
            e.currentTarget.style.color = activeColor
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = textColor
          }}
          title="Flashcards"
        >
          <Zap size={13} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => togglePanel('chat')}
          style={iconBtnStyle}
          onMouseEnter={e => {
            e.currentTarget.style.background = btnHoverBg
            e.currentTarget.style.color = activeColor
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = textColor
          }}
          title="AI Chat"
        >
          <MessageCircle size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
