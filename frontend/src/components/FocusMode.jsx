import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Play, Pause, Clock, Layers, ChevronRight, RotateCcw, Check, BookOpen, Zap, Target, ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { useFocus } from '../contexts/FocusContext'
import MarkdownRenderer from './MarkdownRenderer'

const DURATIONS = [25, 45, 60, 90, 120]

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Setup Phase ──────────────────────────────────────────────────────────────

function SetupPhase({ config, setConfig, onStart, onExit }) {
  const [notes, setNotes] = useState([])
  const [brief, setBrief] = useState(null)

  useEffect(() => {
    api.get('/notes?limit=20').then(data => {
      setNotes(Array.isArray(data) ? data : (data?.items || []))
    }).catch(() => {})
    api.get('/dashboard/review').then(setBrief).catch(() => {})
  }, [])

  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#191919] border border-[#1c1c1c] mb-2">
            <Target size={20} className="text-[#c4a759]" />
          </div>
          <h2 className="text-lg font-medium text-[#e0e0e0] tracking-tight">Focus Session</h2>
          <p className="text-xs text-[#606060]">Block out distractions and lock in.</p>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-[#444444] block">Duration</label>
          <div className="flex gap-2">
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setConfig(prev => ({ ...prev, duration: d }))}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  config.duration === d
                    ? 'bg-[#c4a759] text-[#0a0a0a]'
                    : 'bg-[#141414] border border-[#1c1c1c] text-[#808080] hover:border-[#2a2a2a] hover:text-[#b0b0b0]'
                }`}
              >
                {d}m
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-[#444444] block">Subject (optional)</label>
          <input
            type="text"
            value={config.subject}
            onChange={e => setConfig(prev => ({ ...prev, subject: e.target.value }))}
            placeholder="e.g., Organic Chemistry, Chapter 5"
            className="w-full px-3 py-2 rounded-lg bg-[#111111] border border-[#1c1c1c] text-xs text-[#d4d4d4] placeholder-[#333333] focus:outline-none focus:border-[#2a2a2a] transition-colors"
          />
        </div>

        {/* Note selection */}
        {!config.noteId && notes.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-[#444444] block">Focus on a note</label>
            <div className="max-h-32 overflow-y-auto space-y-1 rounded-lg border border-[#1c1c1c] bg-[#0e0e0e] p-1.5">
              {notes.slice(0, 8).map(n => (
                <button
                  key={n.id}
                  onClick={() => setConfig(prev => ({ ...prev, noteId: n.id, noteTitle: n.title || 'Untitled' }))}
                  className="w-full text-left px-2.5 py-1.5 rounded text-[11px] text-[#808080] hover:bg-[#191919] hover:text-[#d4d4d4] transition-colors truncate"
                >
                  {n.title || 'Untitled'}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.noteId && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#141414] border border-[#1c1c1c]">
            <BookOpen size={12} className="text-[#c4a759] flex-shrink-0" />
            <span className="text-xs text-[#b0b0b0] truncate flex-1">{config.noteTitle || 'Selected note'}</span>
            <button onClick={() => setConfig(prev => ({ ...prev, noteId: null, noteTitle: '' }))} className="text-[#444444] hover:text-[#808080]">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Interleave toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => setConfig(prev => ({ ...prev, interleaveCards: !prev.interleaveCards }))}
            className={`w-8 h-[18px] rounded-full transition-colors flex-shrink-0 relative ${
              config.interleaveCards ? 'bg-[#c4a759]' : 'bg-[#2a2a2a]'
            }`}
          >
            <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-[#0a0a0a] transition-transform ${
              config.interleaveCards ? 'left-[16px]' : 'left-[2px]'
            }`} />
          </div>
          <span className="text-xs text-[#808080] group-hover:text-[#b0b0b0] transition-colors">
            Interleave flashcards during breaks
          </span>
        </label>

        {/* Brief suggestion */}
        {brief?.study_next && (
          <div className="px-3 py-2.5 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c] space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-[#333333]">Suggested</span>
            <p className="text-[11px] text-[#808080]">{brief.study_next.title}</p>
          </div>
        )}

        {/* Start */}
        <button
          onClick={onStart}
          className="w-full py-3 rounded-lg bg-[#c4a759] text-[#0a0a0a] text-sm font-semibold hover:bg-[#d4b769] transition-colors flex items-center justify-center gap-2"
        >
          <Play size={14} />
          Start Focusing
        </button>

        <button onClick={onExit} className="w-full text-center text-[11px] text-[#444444] hover:text-[#808080] transition-colors">
          cancel
        </button>
      </div>
    </div>
  )
}

// ── Focus Phase ──────────────────────────────────────────────────────────────

function FocusPhase({ config, sessionData, onTimerEnd, onEndEarly, onRecordNote }) {
  const [timeLeft, setTimeLeft] = useState(config.duration * 60)
  const [paused, setPaused] = useState(false)
  const [noteContent, setNoteContent] = useState(null)
  const [dueCards, setDueCards] = useState([])
  const [taskQueue, setTaskQueue] = useState([])
  const intervalRef = useRef(null)
  const totalSeconds = config.duration * 60

  // Load note content
  useEffect(() => {
    if (config.noteId) {
      api.get(`/notes/${config.noteId}`).then(data => {
        setNoteContent(data)
        onRecordNote(config.noteId, data.title || 'Untitled')
      }).catch(() => {})
    }
  }, [config.noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load due flashcards + tasks for sidebar
  useEffect(() => {
    api.get('/flashcards/due').then(cards => {
      setDueCards(Array.isArray(cards) ? cards : [])
    }).catch(() => {})
    api.get('/dashboard/review').then(data => {
      setTaskQueue(data?.brief_items?.slice(0, 8) || [])
    }).catch(() => {})
  }, [])

  // Timer
  useEffect(() => {
    if (paused) return
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          onTimerEnd()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [paused, onTimerEnd])

  const elapsed = totalSeconds - timeLeft
  const progressPct = Math.round((elapsed / totalSeconds) * 100)

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1c1c1c] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#c4a759] animate-pulse" />
          <span className="text-xs text-[#808080] font-medium">
            {config.subject || config.noteTitle || 'Focus Session'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-[#c4a759]" />
            <span className="text-sm font-mono font-medium text-[#e0e0e0] tabular-nums">
              {formatTime(timeLeft)}
            </span>
            <button
              onClick={() => setPaused(!paused)}
              className="p-1 rounded hover:bg-[#191919] text-[#606060] hover:text-[#c4a759] transition-colors"
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
            </button>
          </div>
          <button
            onClick={onEndEarly}
            className="text-[10px] text-[#444444] hover:text-[#808080] transition-colors px-2 py-1 rounded hover:bg-[#191919]"
          >
            end session
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-8">
          {noteContent ? (
            <div className="max-w-3xl mx-auto">
              <h1 className="text-xl font-semibold text-[#e0e0e0] mb-6">{noteContent.title || 'Untitled'}</h1>
              <div className="prose-sm">
                <MarkdownRenderer content={noteContent.content || ''} />
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center py-12 space-y-3">
                <Target size={32} className="mx-auto text-[#2a2a2a]" />
                <p className="text-sm text-[#606060]">Focus time is running.</p>
                <p className="text-xs text-[#333333]">Work on your material — the timer keeps going.</p>
              </div>
              {dueCards.length > 0 && (
                <div className="px-4 py-3 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c]">
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">
                    {dueCards.length} flashcard{dueCards.length !== 1 ? 's' : ''} due
                  </span>
                  <p className="text-xs text-[#606060]">These will be shown during your next break.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Task sidebar */}
        <div className="w-56 border-l border-[#1c1c1c] overflow-y-auto p-3 flex-shrink-0">
          <span className="text-[9px] uppercase tracking-wider text-[#333333] block mb-3">Queue</span>
          <div className="space-y-1.5">
            {dueCards.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-[10px] text-[#c4a759] bg-[rgba(196,167,89,0.04)]">
                <Layers size={10} />
                <span>{dueCards.length} cards due</span>
              </div>
            )}
            {taskQueue.map((item, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded text-[10px] text-[#606060]">
                <ChevronRight size={9} className="mt-0.5 flex-shrink-0 text-[#333333]" />
                <span className="line-clamp-2">{item.title}</span>
              </div>
            ))}
            {dueCards.length === 0 && taskQueue.length === 0 && (
              <p className="text-[10px] text-[#2a2a2a] px-2">No tasks queued.</p>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-[#1c1c1c]">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-[#191919] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#c4a759] transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-[#444444] tabular-nums font-mono w-8 text-right">{progressPct}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Break Phase ──────────────────────────────────────────────────────────────

function BreakPhase({ config, onEndBreak, onRecordCard }) {
  const [cards, setCards] = useState([])
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [breakTime, setBreakTime] = useState(5 * 60) // 5 min break
  const intervalRef = useRef(null)

  useEffect(() => {
    if (config.interleaveCards) {
      api.get('/flashcards/due').then(data => {
        setCards((Array.isArray(data) ? data : []).slice(0, 5))
      }).catch(() => {})
    }
  }, [config.interleaveCards])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setBreakTime(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          onEndBreak()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [onEndBreak])

  const currentCard = cards[cardIndex]

  const handleRate = async (quality) => {
    if (!currentCard) return
    try {
      await api.post(`/flashcards/${currentCard.id}/review`, { quality })
      onRecordCard()
    } catch {}
    setFlipped(false)
    if (cardIndex < cards.length - 1) {
      setCardIndex(prev => prev + 1)
    } else {
      setCards([])
    }
  }

  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="w-full max-w-md space-y-6 animate-fade-in text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-[#e0e0e0]">Break Time</h2>
          <span className="text-2xl font-mono font-medium text-[#c4a759] tabular-nums">{formatTime(breakTime)}</span>
        </div>

        {/* Flashcard interleaving */}
        {currentCard ? (
          <div className="space-y-4">
            <span className="text-[10px] uppercase tracking-wider text-[#444444]">
              Card {cardIndex + 1}/{cards.length}
            </span>
            <div
              onClick={() => setFlipped(!flipped)}
              className="min-h-[160px] flex items-center justify-center p-6 rounded-xl bg-[#111111] border border-[#1c1c1c] cursor-pointer hover:border-[#2a2a2a] transition-colors"
            >
              <div className="text-sm text-[#d4d4d4] leading-relaxed">
                {flipped ? (
                  <MarkdownRenderer content={currentCard.back} />
                ) : (
                  <MarkdownRenderer content={currentCard.front} />
                )}
              </div>
            </div>
            {!flipped ? (
              <p className="text-[10px] text-[#444444]">Click to reveal answer</p>
            ) : (
              <div className="flex justify-center gap-2">
                {[
                  { q: 1, label: 'Again', color: '#ef4444' },
                  { q: 3, label: 'Good', color: '#c4a759' },
                  { q: 5, label: 'Easy', color: '#4ade80' },
                ].map(({ q, label, color }) => (
                  <button
                    key={q}
                    onClick={() => handleRate(q)}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : config.interleaveCards && cards.length === 0 ? (
          <div className="py-8 space-y-2">
            <Check size={24} className="mx-auto text-[#4ade80]" />
            <p className="text-xs text-[#606060]">No cards due — enjoy your break!</p>
          </div>
        ) : null}

        <button
          onClick={onEndBreak}
          className="text-xs text-[#808080] hover:text-[#d4d4d4] transition-colors px-4 py-2 rounded-lg bg-[#141414] border border-[#1c1c1c] hover:border-[#2a2a2a]"
        >
          Skip break →
        </button>
      </div>
    </div>
  )
}

// ── Summary Phase ────────────────────────────────────────────────────────────

function SummaryPhase({ config, sessionData, onExit }) {
  const navigate = useNavigate()
  const [nextAction, setNextAction] = useState(null)
  const durationMin = sessionData.startedAt ? Math.round((Date.now() - sessionData.startedAt) / 60000) : config.duration

  useEffect(() => {
    api.get('/dashboard/review').then(data => {
      setNextAction(data?.study_next || null)
    }).catch(() => {})
  }, [])

  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.15)] mb-2">
            <Check size={20} className="text-[#4ade80]" />
          </div>
          <h2 className="text-lg font-medium text-[#e0e0e0]">Session Complete</h2>
          <p className="text-xs text-[#606060]">Great work. Here's what you accomplished.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Duration', value: `${durationMin} min`, icon: Clock },
            { label: 'Pomodoros', value: sessionData.pomodorosCompleted, icon: Target },
            { label: 'Cards Reviewed', value: sessionData.cardsReviewed, icon: Zap },
            { label: 'Notes Covered', value: sessionData.notesViewed.length, icon: BookOpen },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="px-4 py-3 rounded-lg bg-[#111111] border border-[#1c1c1c] space-y-1">
              <div className="flex items-center gap-1.5">
                <Icon size={11} className="text-[#444444]" />
                <span className="text-[9px] uppercase tracking-wider text-[#444444]">{label}</span>
              </div>
              <p className="text-lg font-semibold text-[#e0e0e0]">{value}</p>
            </div>
          ))}
        </div>

        {/* Notes covered */}
        {sessionData.notesViewed.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-wider text-[#444444] block">Notes covered</span>
            <div className="space-y-1">
              {sessionData.notesViewed.map(n => (
                <button
                  key={n.id}
                  onClick={() => { onExit(); navigate(`/notes/${n.id}`) }}
                  className="w-full text-left px-3 py-1.5 rounded text-[11px] text-[#808080] hover:text-[#d4d4d4] hover:bg-[#191919] transition-colors truncate"
                >
                  {n.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* What's next */}
        {nextAction && (
          <div className="px-4 py-3 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c] space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-[#333333]">What's next</span>
            <div className="flex items-center gap-2">
              <ArrowRight size={11} className="text-[#c4a759] flex-shrink-0" />
              <p className="text-xs text-[#808080]">{nextAction.title}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onExit}
            className="w-full py-3 rounded-lg bg-[#c4a759] text-[#0a0a0a] text-sm font-semibold hover:bg-[#d4b769] transition-colors"
          >
            Done
          </button>
          <button
            onClick={() => { onExit(); navigate('/dashboard') }}
            className="w-full text-center text-[11px] text-[#444444] hover:text-[#808080] transition-colors py-1"
          >
            go to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main FocusMode Overlay ───────────────────────────────────────────────────

export default function FocusMode() {
  const {
    active, phase, config, sessionData, sessionIdRef,
    beginSession, startBreak,
    recordCardReview, recordNoteView, showSummary, exitFocus,
    setConfig,
  } = useFocus()

  const handleStart = useCallback(async () => {
    // Create pomodoro session
    try {
      const data = await api.post('/pomodoro', {
        label: config.subject || config.noteTitle || 'Focus session',
        session_type: 'focus',
        duration_minutes: config.duration,
        planned_minutes: config.duration,
        completed: false,
        note_id: config.noteId || undefined,
      })
      sessionIdRef.current = data.id
    } catch {}
    beginSession()
  }, [config, beginSession]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimerEnd = useCallback(async () => {
    // Log completed pomodoro
    try {
      await api.post('/pomodoro', {
        label: config.subject || config.noteTitle || 'Focus session',
        session_type: 'focus',
        duration_minutes: config.duration,
        planned_minutes: config.duration,
        completed: true,
        note_id: config.noteId || undefined,
      })
    } catch {}
    if (config.interleaveCards) {
      startBreak()
    } else {
      showSummary()
    }
  }, [config, startBreak, showSummary])

  const handleEndEarly = useCallback(() => {
    showSummary()
  }, [showSummary])

  // ESC to exit (with confirmation during active session)
  useEffect(() => {
    if (!active) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (phase === 'setup' || phase === 'summary') {
          exitFocus()
        }
        // During focus/break, ignore ESC — use the button
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, phase, exitFocus])

  if (!active) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col"
      style={{ background: '#0a0a0a' }}
    >
      {phase === 'setup' && (
        <SetupPhase config={config} setConfig={setConfig} onStart={handleStart} onExit={exitFocus} />
      )}
      {phase === 'focus' && (
        <FocusPhase
          config={config}
          sessionData={sessionData}
          onTimerEnd={handleTimerEnd}
          onEndEarly={handleEndEarly}
          onRecordNote={recordNoteView}
        />
      )}
      {phase === 'break' && (
        <BreakPhase config={config} onEndBreak={showSummary} onRecordCard={recordCardReview} />
      )}
      {phase === 'summary' && (
        <SummaryPhase config={config} sessionData={sessionData} onExit={exitFocus} />
      )}
    </div>
  )
}
