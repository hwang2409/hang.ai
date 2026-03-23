import { createContext, useContext, useState, useCallback, useRef } from 'react'

const FocusContext = createContext(null)

const FOCUS_KEY = 'neuronic_focus_session'

export function FocusProvider({ children }) {
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState('setup') // setup | focus | break | summary
  const [config, setConfig] = useState({ duration: 25, noteId: null, noteTitle: '', subject: '', interleaveCards: true })
  const [sessionData, setSessionData] = useState({ startedAt: null, cardsReviewed: 0, notesViewed: [], pomodorosCompleted: 0 })
  const sessionIdRef = useRef(null)

  const startFocus = useCallback((opts = {}) => {
    setConfig(prev => ({ ...prev, ...opts }))
    setSessionData({ startedAt: null, cardsReviewed: 0, notesViewed: [], pomodorosCompleted: 0 })
    setPhase('setup')
    setActive(true)
  }, [])

  const beginSession = useCallback(() => {
    setSessionData(prev => ({ ...prev, startedAt: Date.now() }))
    setPhase('focus')
  }, [])

  const startBreak = useCallback(() => {
    setSessionData(prev => ({ ...prev, pomodorosCompleted: prev.pomodorosCompleted + 1 }))
    setPhase('break')
  }, [])

  const endBreak = useCallback(() => {
    setPhase('focus')
  }, [])

  const recordCardReview = useCallback(() => {
    setSessionData(prev => ({ ...prev, cardsReviewed: prev.cardsReviewed + 1 }))
  }, [])

  const recordNoteView = useCallback((noteId, title) => {
    setSessionData(prev => {
      if (prev.notesViewed.some(n => n.id === noteId)) return prev
      return { ...prev, notesViewed: [...prev.notesViewed, { id: noteId, title }] }
    })
  }, [])

  const showSummary = useCallback(() => {
    setPhase('summary')
  }, [])

  const exitFocus = useCallback(() => {
    setActive(false)
    setPhase('setup')
    sessionIdRef.current = null
    localStorage.removeItem(FOCUS_KEY)
  }, [])

  return (
    <FocusContext.Provider value={{
      active, phase, config, sessionData, sessionIdRef,
      startFocus, beginSession, startBreak, endBreak,
      recordCardReview, recordNoteView, showSummary, exitFocus,
      setConfig,
    }}>
      {children}
    </FocusContext.Provider>
  )
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within FocusProvider')
  return ctx
}
