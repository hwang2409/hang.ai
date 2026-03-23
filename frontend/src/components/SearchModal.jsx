import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, PenTool, LayoutGrid, X, ArrowUp, ArrowDown, CornerDownLeft, Sparkles, TextSearch, Zap, Play, BookOpen, HelpCircle, FilePlus, BarChart3, Calendar, CheckSquare, MessageSquare, Users, Brain, GitFork, FolderOpen, MessageCircle, Settings, Layers } from 'lucide-react'
import { api } from '../lib/api'
import { useTheme } from '../contexts/ThemeContext'
import { useWorkspace } from '../contexts/WorkspaceContext'

const COMMANDS = [
  { id: 'start-pomodoro', keywords: ['pomodoro', 'focus', 'timer'], label: 'Start a pomodoro session', icon: Play, action: { type: 'start-pomodoro' } },
  { id: 'review-flashcards', keywords: ['review flashcards', 'study cards', 'cards due'], label: 'Review flashcards', icon: BookOpen, action: { type: 'navigate', to: '/flashcards/study' } },
  { id: 'quiz', keywords: ['quiz me', 'take quiz', 'test'], label: 'Take a quiz', icon: HelpCircle, action: { type: 'navigate', to: '/quizzes' } },
  { id: 'new-note', keywords: ['new note', 'create note', 'write'], label: 'Create a new note', icon: FilePlus, action: { type: 'create-note', noteType: 'text' } },
  { id: 'dashboard', keywords: ['dashboard', 'stats', 'progress'], label: 'View dashboard', icon: BarChart3, action: { type: 'navigate', to: '/dashboard' } },
  { id: 'study-plan', keywords: ['study plan', 'plan', 'schedule'], label: 'Open study plan', icon: Calendar, action: { type: 'navigate', to: '/studyplan' } },
  { id: 'todos', keywords: ['todos', 'tasks', 'to do'], label: 'View todos', icon: CheckSquare, action: { type: 'navigate', to: '/todos' } },
  { id: 'forum', keywords: ['forum', 'discussion', 'ask'], label: 'Browse forum', icon: MessageSquare, action: { type: 'navigate', to: '/forum' } },
  { id: 'groups', keywords: ['groups', 'study groups'], label: 'Study groups', icon: Users, action: { type: 'navigate', to: '/groups' } },
  { id: 'feynman', keywords: ['feynman', 'explain', 'teach'], label: 'Feynman technique', icon: Brain, action: { type: 'navigate', to: '/feynman' } },
  { id: 'knowledge-graph', keywords: ['knowledge graph', 'graph', 'connections'], label: 'Knowledge graph', icon: GitFork, action: { type: 'navigate', to: '/knowledge-graph' } },
  { id: 'library', keywords: ['library', 'files', 'uploads'], label: 'Open library', icon: FolderOpen, action: { type: 'navigate', to: '/library' } },
  { id: 'chat', keywords: ['chat', 'ai', 'ask ai'], label: 'Chat with AI', icon: MessageCircle, action: { type: 'navigate', to: '/chat' } },
  { id: 'settings', keywords: ['settings', 'preferences'], label: 'Settings', icon: Settings, action: { type: 'navigate', to: '/settings' } },
  { id: 'new-canvas', keywords: ['new canvas', 'create canvas', 'draw', 'diagram', 'whiteboard'], label: 'Create a new canvas', icon: PenTool, action: { type: 'create-note', noteType: 'canvas' } },
  { id: 'new-moodboard', keywords: ['new moodboard', 'moodboard', 'collage', 'image board'], label: 'Create a new moodboard', icon: LayoutGrid, action: { type: 'create-note', noteType: 'moodboard' } },
  { id: 'add-todo', keywords: ['add todo', 'new todo', 'new task', 'remind me', 'remember to'], label: 'Add a todo', icon: CheckSquare, action: { type: 'quick-todo' } },
  { id: 'socratic', keywords: ['socratic', 'question me', 'probe understanding'], label: 'Start Socratic dialogue', icon: Brain, action: { type: 'navigate', to: '/feynman?mode=socratic' } },
  { id: 'practice', keywords: ['practice', 'practice problems', 'exercises', 'drill'], label: 'Practice problems', icon: Zap, action: { type: 'navigate', to: '/feynman?mode=practice' } },
  { id: 'all-notes', keywords: ['notes', 'all notes', 'my notes', 'browse notes'], label: 'View all notes', icon: FileText, action: { type: 'navigate', to: '/notes' } },
  { id: 'generate-flashcards', keywords: ['generate flashcards', 'make flashcards', 'create cards from', 'flashcards from'], label: 'Generate flashcards from a note', icon: BookOpen, action: { type: 'navigate', to: '/flashcards' } },
  { id: 'generate-quiz', keywords: ['generate quiz', 'make quiz', 'quiz from', 'test from'], label: 'Generate quiz from a note', icon: HelpCircle, action: { type: 'navigate', to: '/quizzes' } },
  { id: 'wiki', keywords: ['wiki', 'links', 'backlinks', 'connections'], label: 'Wiki & backlinks', icon: GitFork, action: { type: 'navigate', to: '/knowledge-graph' } },
  { id: 'open-panel-chat', keywords: ['open chat panel', 'side chat', 'panel chat', 'split chat'], label: 'Open chat panel', icon: MessageCircle, action: { type: 'open-panel', tab: 'chat' } },
  { id: 'open-panel-flashcards', keywords: ['open flashcard panel', 'side flashcards', 'panel flashcards', 'split flashcards'], label: 'Open flashcards panel', icon: Layers, action: { type: 'open-panel', tab: 'flashcards' } },
  { id: 'open-panel-todos', keywords: ['open todo panel', 'side todos', 'panel todos', 'split todos'], label: 'Open todos panel', icon: CheckSquare, action: { type: 'open-panel', tab: 'todos' } },
  { id: 'open-panel-note', keywords: ['open note panel', 'side note', 'panel note', 'split note', 'split view'], label: 'Open note panel', icon: FileText, action: { type: 'open-panel', tab: 'note' } },
  { id: 'close-panel', keywords: ['close panel', 'hide panel', 'unsplit', 'single view'], label: 'Close side panel', icon: X, action: { type: 'close-panel' } },
]

function extractAfterKeywords(query, keywords) {
  const q = query.toLowerCase().trim()
  for (const kw of [...keywords].sort((a, b) => b.length - a.length)) {
    if (q.startsWith(kw) && query.trim().length > kw.length) {
      return query.trim().slice(kw.length).trim()
    }
  }
  return ''
}

function matchCommands(query) {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  const matches = []
  for (const cmd of COMMANDS) {
    let bestScore = 0
    for (const kw of cmd.keywords) {
      if (kw.startsWith(q)) {
        // keyword starts with query — strong match, shorter keyword = better
        bestScore = Math.max(bestScore, 100 - kw.length)
      } else if (q.startsWith(kw)) {
        // query starts with keyword — weaker match
        bestScore = Math.max(bestScore, 50 - kw.length)
      }
    }
    if (bestScore > 0) {
      matches.push({ ...cmd, score: bestScore })
    }
  }
  matches.sort((a, b) => b.score - a.score)
  return matches
}

export default function SearchModal() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('search') // 'search' | 'commands'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [inputFocused, setInputFocused] = useState(false)
  const [recentNotes, setRecentNotes] = useState([])
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const resultsRef = useRef(null)
  const navigate = useNavigate()
  const { dark } = useTheme()
  const { openPanel, closePanel } = useWorkspace()

  const commandMatches = mode === 'commands' ? matchCommands(query) : []
  const searchResults = mode === 'search' ? results : []
  const combined = [...commandMatches, ...searchResults]

  // Cmd+K for note search, Cmd+P for command palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        if (open && mode === 'search') {
          setOpen(false)
        } else {
          setMode('search')
          setOpen(true)
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        e.stopPropagation()
        if (open && mode === 'commands') {
          setOpen(false)
        } else {
          setMode('commands')
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, mode])

  // Focus input when opened, reset on close
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus()
        setInputFocused(true)
      }, 80)
    } else {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setInputFocused(false)
    }
  }, [open])

  useEffect(() => {
    if (open && !query && mode === 'search') {
      api.get('/notes?limit=5&offset=0').then(data => {
        setRecentNotes(Array.isArray(data) ? data : data.documents || [])
      }).catch(() => {})
    }
  }, [open, mode])

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await api.post('/search/hybrid', { query: q.trim(), limit: 12 })
      setResults(data.results || [])
      setSelectedIndex(0)
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleQueryChange = (value) => {
    setQuery(value)
    setSelectedIndex(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (mode === 'search') {
      debounceRef.current = setTimeout(() => doSearch(value), 200)
    }
  }

  // Execute a command
  const executeCommand = async (cmd) => {
    const action = cmd.action
    if (action.type === 'navigate') {
      navigate(action.to)
    } else if (action.type === 'create' || action.type === 'create-note') {
      try {
        const titleFromQuery = extractAfterKeywords(query, cmd.keywords)
        const body = { type: action.noteType || 'text' }
        if (titleFromQuery) body.title = titleFromQuery
        const endpoint = action.endpoint || '/notes'
        const data = await api.post(endpoint, body)
        const path = (action.navigate || '/notes/{id}').replace('{id}', data.id)
        navigate(path)
      } catch (err) {
        console.error('Command failed:', err)
      }
    } else if (action.type === 'quick-todo') {
      try {
        const text = extractAfterKeywords(query, cmd.keywords) || 'New todo'
        await api.post('/todos', { text, priority: 1 })
      } catch (err) {
        console.error('Todo creation failed:', err)
      }
      navigate('/todos')
    } else if (action.type === 'start-pomodoro') {
      try {
        const durationMatch = query.match(/(\d+)\s*(?:min|m|minutes?)?\b/)
        const duration = durationMatch ? parseInt(durationMatch[1]) : 25
        const label = extractAfterKeywords(query, cmd.keywords).replace(/\d+\s*(?:min|m|minutes?)?\s*/g, '').trim()
        await api.post('/pomodoro', {
          label: label || 'Focus session',
          session_type: 'focus',
          duration_minutes: duration,
          planned_minutes: duration,
          completed: false,
        })
      } catch (err) {
        console.error('Pomodoro creation failed:', err)
      }
      navigate('/pomodoro')
    } else if (action.type === 'open-panel') {
      openPanel(action.tab)
    } else if (action.type === 'close-panel') {
      closePanel()
    }
    setOpen(false)
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const max = query ? combined.length - 1 : (mode === 'commands' ? COMMANDS.length - 1 : recentNotes.length - 1)
      setSelectedIndex(i => Math.min(i + 1, max))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!query && mode === 'search' && recentNotes.length > 0 && selectedIndex < recentNotes.length) {
        navigate(`/notes/${recentNotes[selectedIndex].id}`)
        setOpen(false)
      } else if (!query && mode === 'commands' && selectedIndex < COMMANDS.length) {
        executeCommand(COMMANDS[selectedIndex])
      } else if (combined.length > 0) {
        const selected = combined[selectedIndex]
        if (selected) {
          if (selected.id && selected.action) {
            // It's a command
            executeCommand(selected)
          } else {
            // It's a search result
            navigate(selected.source === 'flashcard' ? '/flashcards' : `/notes/${selected.id}`)
            setOpen(false)
          }
        }
      }
    }
  }

  // Auto-scroll selected into view
  useEffect(() => {
    if (resultsRef.current) {
      const el = resultsRef.current.children[selectedIndex]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  const matchBadge = (type) => {
    switch (type) {
      case 'both': return {
        bg: dark ? 'rgba(196,167,89,0.10)' : 'rgba(160,130,40,0.08)',
        text: dark ? '#c4a759' : '#8b7a3d',
        label: 'hybrid',
      }
      case 'semantic': return {
        bg: dark ? 'rgba(120,160,120,0.08)' : 'rgba(60,120,60,0.06)',
        text: dark ? '#7aaa7a' : '#4a8a4a',
        label: 'semantic',
      }
      default: return {
        bg: dark ? 'rgba(160,160,160,0.06)' : 'rgba(100,100,100,0.06)',
        text: dark ? '#707070' : '#888888',
        label: 'keyword',
      }
    }
  }

  const hasContent = combined.length > 0 || loading || (query && !loading) || (mode === 'commands' && !query)

  return (
    <div
      className="fixed inset-0 z-[200] animate-modal-backdrop flex items-start justify-center"
      style={{ paddingTop: '14vh' }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        className="w-full max-w-[560px] mx-4 animate-pop-in overflow-hidden"
        style={{
          background: dark
            ? 'linear-gradient(180deg, #141414 0%, #0e0e0e 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8f6f1 100%)',
          border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
          borderRadius: 14,
          boxShadow: dark
            ? '0 25px 80px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(196,167,89,0.04)'
            : '0 25px 80px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.04), 0 0 0 1px rgba(160,130,40,0.06)',
        }}
      >
        {/* Top amber accent line */}
        <div
          className="h-px"
          style={{
            background: `linear-gradient(90deg, transparent 5%, ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'} 50%, transparent 95%)`,
          }}
        />

        {/* Search input area */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{
            borderBottom: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
          }}
        >
          <Search
            size={15}
            style={{
              color: inputFocused
                ? (dark ? '#c4a759' : '#8b7a3d')
                : (dark ? '#404040' : '#bbbbbb'),
              transition: 'color 0.25s ease',
              flexShrink: 0,
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={mode === 'commands' ? "type a command..." : "search notes..."}
            className={`flex-1 bg-transparent text-[15px] outline-none tracking-tight ${
              dark
                ? 'text-[#d4d4d4] placeholder-[#2a2a2a]'
                : 'text-[#2a2a2a] placeholder-[#bbbbbb]'
            }`}
            style={{ caretColor: dark ? '#c4a759' : '#8b7a3d' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setLoading(false) }}
              className="transition-colors p-0.5"
              style={{ color: dark ? '#333333' : '#bbbbbb' }}
              onMouseEnter={(e) => e.currentTarget.style.color = dark ? '#808080' : '#777777'}
              onMouseLeave={(e) => e.currentTarget.style.color = dark ? '#333333' : '#bbbbbb'}
            >
              <X size={13} />
            </button>
          )}
          <kbd
            className="text-[10px] px-1.5 py-[3px] rounded flex-shrink-0"
            style={{
              color: dark ? '#333333' : '#aaaaaa',
              background: dark ? '#191919' : '#e8e5de',
              border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results area */}
        <div
          ref={resultsRef}
          className="max-h-[46vh] overflow-y-auto search-results-stagger"
          style={{
            padding: hasContent ? '6px' : 0,
          }}
        >
          {/* Command matches */}
          {commandMatches.map((cmd, i) => {
            const isSelected = i === selectedIndex
            const CmdIcon = cmd.icon
            return (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
                className="w-full text-left px-3 py-2.5 rounded-[10px] flex items-center gap-3 group"
                style={{
                  background: isSelected
                    ? (dark ? 'rgba(196,167,89,0.04)' : 'rgba(160,130,40,0.04)')
                    : 'transparent',
                  borderLeft: isSelected
                    ? `2px solid ${dark ? 'rgba(196,167,89,0.3)' : 'rgba(160,130,40,0.25)'}`
                    : '2px solid transparent',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)',
                    border: `1px solid ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'}`,
                  }}
                >
                  <CmdIcon
                    size={12}
                    style={{ color: dark ? '#c4a759' : '#8b7a3d' }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <span
                    className="text-sm tracking-tight"
                    style={{
                      color: isSelected
                        ? (dark ? '#e8e8e8' : '#1a1a1a')
                        : (dark ? '#d4d4d4' : '#2a2a2a'),
                      fontWeight: isSelected ? 500 : 400,
                      transition: 'color 0.15s ease',
                    }}
                  >
                    {cmd.label}
                  </span>
                </div>

                <span
                  className="text-[9px] px-1.5 py-[1px] rounded-full flex-shrink-0 tracking-wide"
                  style={{
                    background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)',
                    color: dark ? '#c4a759' : '#8b7a3d',
                  }}
                >
                  {['create', 'create-note', 'quick-todo', 'start-pomodoro'].includes(cmd.action.type) ? 'action' : 'go'}
                </span>

                {isSelected && (
                  <CornerDownLeft
                    size={11}
                    className="flex-shrink-0"
                    style={{ color: dark ? '#333333' : '#bbbbbb' }}
                  />
                )}
              </button>
            )
          })}

          {/* Divider between commands and search results */}
          {commandMatches.length > 0 && results.length > 0 && (
            <div
              className="mx-3 my-1"
              style={{
                height: 1,
                background: `linear-gradient(90deg, transparent 0%, ${dark ? '#1c1c1c' : '#ddd9d0'} 50%, transparent 100%)`,
              }}
            />
          )}

          {/* Loading state */}
          {loading && results.length === 0 && commandMatches.length === 0 && (
            <div className="px-5 py-10 flex flex-col items-center gap-3 animate-fade-in">
              <div className="flex gap-1.5">
                <div
                  className="w-1 h-1 rounded-full animate-pulse"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }}
                />
                <div
                  className="w-1 h-1 rounded-full animate-pulse [animation-delay:0.15s]"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }}
                />
                <div
                  className="w-1 h-1 rounded-full animate-pulse [animation-delay:0.3s]"
                  style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }}
                />
              </div>
              <p className="text-[11px]" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>
                searching...
              </p>
            </div>
          )}

          {/* Empty state */}
          {!loading && query && combined.length === 0 && (
            <div className="px-5 py-10 flex flex-col items-center gap-2 animate-fade-in">
              <TextSearch size={20} style={{ color: dark ? '#1c1c1c' : '#ddd9d0' }} />
              <p className="text-[11px]" style={{ color: dark ? '#333333' : '#aaaaaa' }}>
                no results matched "{query.length > 30 ? query.slice(0, 30) + '...' : query}"
              </p>
            </div>
          )}

          {/* Search result items */}
          {results.map((result, i) => {
            const combinedIndex = commandMatches.length + i
            const badge = matchBadge(result.match_type)
            const isSelected = combinedIndex === selectedIndex
            const isCanvasResult = result.type === 'canvas'
            const isMoodboardResult = result.type === 'moodboard'
            const isFlashcard = result.source === 'flashcard'
            const ResultIcon = isFlashcard ? Zap : isCanvasResult ? PenTool : isMoodboardResult ? LayoutGrid : FileText
            return (
              <button
                key={result.id}
                onClick={() => { navigate(result.source === 'flashcard' ? '/flashcards' : `/notes/${result.id}`); setOpen(false) }}
                onMouseEnter={() => setSelectedIndex(combinedIndex)}
                className="w-full text-left px-3 py-2.5 rounded-[10px] flex items-start gap-3 group"
                style={{
                  background: isSelected
                    ? (dark ? 'rgba(196,167,89,0.04)' : 'rgba(160,130,40,0.04)')
                    : 'transparent',
                  borderLeft: isSelected
                    ? `2px solid ${dark ? 'rgba(196,167,89,0.3)' : 'rgba(160,130,40,0.25)'}`
                    : '2px solid transparent',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: isSelected
                      ? (dark ? 'rgba(196,167,89,0.06)' : 'rgba(160,130,40,0.05)')
                      : (dark ? '#111111' : '#f0ede6'),
                    border: `1px solid ${isSelected
                      ? (dark ? 'rgba(196,167,89,0.12)' : 'rgba(160,130,40,0.1)')
                      : (dark ? '#1c1c1c' : '#ddd9d0')}`,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ResultIcon
                    size={12}
                    style={{
                      color: isSelected
                        ? (dark ? '#c4a759' : '#8b7a3d')
                        : (dark ? '#333333' : '#aaaaaa'),
                      transition: 'color 0.15s ease',
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-sm truncate tracking-tight"
                      style={{
                        color: isSelected
                          ? (dark ? '#e8e8e8' : '#1a1a1a')
                          : (dark ? '#d4d4d4' : '#2a2a2a'),
                        fontWeight: isSelected ? 500 : 400,
                        transition: 'color 0.15s ease',
                      }}
                    >
                      {result.title || 'untitled'}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-[1px] rounded-full flex-shrink-0 tracking-wide"
                      style={{
                        background: badge.bg,
                        color: badge.text,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p
                    className="text-xs truncate leading-relaxed"
                    style={{ color: dark ? '#505050' : '#999999' }}
                  >
                    {isFlashcard ? result.preview : isCanvasResult ? 'Canvas note' : isMoodboardResult ? 'Moodboard' : result.preview}
                  </p>
                  {result.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5">
                      {result.tags.slice(0, 3).map((tag, j) => (
                        <span
                          key={j}
                          className="text-[9px] px-1.5 py-[1px] rounded"
                          style={{
                            background: dark ? '#141414' : '#eae7e0',
                            color: dark ? '#505050' : '#888888',
                            border: `1px solid ${dark ? '#1a1a1a' : '#ddd9d0'}`,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Return hint on selected */}
                {isSelected && (
                  <div className="flex-shrink-0 mt-2">
                    <CornerDownLeft
                      size={11}
                      style={{ color: dark ? '#333333' : '#bbbbbb' }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        {hasContent && (
          <div
            className="flex items-center gap-5 px-5 py-2.5"
            style={{
              borderTop: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
            }}
          >
            <div className="flex items-center gap-1.5" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>
              <ArrowUp size={10} />
              <ArrowDown size={10} />
              <span className="text-[10px] tracking-wide">navigate</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>
              <CornerDownLeft size={10} />
              <span className="text-[10px] tracking-wide">open</span>
            </div>
            {combined.length > 0 && (
              <span
                className="text-[10px] ml-auto tracking-wide"
                style={{ color: dark ? '#1c1c1c' : '#ccc8bf' }}
              >
                {commandMatches.length > 0 && `${commandMatches.length} command${commandMatches.length !== 1 ? 's' : ''}`}
                {commandMatches.length > 0 && results.length > 0 && ' · '}
                {results.length > 0 && `${results.length} result${results.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        )}

        {/* Initial empty state — no query yet */}
        {!query && mode === 'commands' && (
          <div className="animate-fade-in" style={{ padding: '6px' }}>
            <div
              className="px-3 py-1.5 text-[10px] tracking-widest uppercase"
              style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}
            >
              commands
            </div>
            {COMMANDS.map((cmd, i) => {
              const isSelected = i === selectedIndex
              const CmdIcon = cmd.icon
              return (
                <button
                  key={cmd.id}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className="w-full text-left px-3 py-2 rounded-[10px] flex items-center gap-3 group"
                  style={{
                    background: isSelected
                      ? (dark ? 'rgba(196,167,89,0.04)' : 'rgba(160,130,40,0.04)')
                      : 'transparent',
                    borderLeft: isSelected
                      ? `2px solid ${dark ? 'rgba(196,167,89,0.3)' : 'rgba(160,130,40,0.25)'}`
                      : '2px solid transparent',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{
                      background: dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)',
                      border: `1px solid ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.12)'}`,
                    }}
                  >
                    <CmdIcon size={11} style={{ color: dark ? '#c4a759' : '#8b7a3d' }} />
                  </div>
                  <span
                    className="text-sm truncate tracking-tight"
                    style={{
                      color: isSelected
                        ? (dark ? '#e8e8e8' : '#1a1a1a')
                        : (dark ? '#606060' : '#888888'),
                      transition: 'color 0.15s ease',
                    }}
                  >
                    {cmd.label}
                  </span>
                  {isSelected && (
                    <CornerDownLeft
                      size={11}
                      className="flex-shrink-0 ml-auto"
                      style={{ color: dark ? '#333333' : '#bbbbbb' }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}
        {!query && mode === 'search' && (
          <div className="animate-fade-in">
            {recentNotes.length > 0 && (
              <div style={{ padding: '6px' }}>
                <div
                  className="px-3 py-1.5 text-[10px] tracking-widest uppercase"
                  style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}
                >
                  recent
                </div>
                {recentNotes.map((note, i) => {
                  const isSelected = i === selectedIndex
                  const NoteIcon = note.type === 'canvas' ? PenTool : note.type === 'moodboard' ? LayoutGrid : FileText
                  return (
                    <button
                      key={note.id}
                      onClick={() => { navigate(`/notes/${note.id}`); setOpen(false) }}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className="w-full text-left px-3 py-2 rounded-[10px] flex items-center gap-3 group"
                      style={{
                        background: isSelected
                          ? (dark ? 'rgba(196,167,89,0.04)' : 'rgba(160,130,40,0.04)')
                          : 'transparent',
                        borderLeft: isSelected
                          ? `2px solid ${dark ? 'rgba(196,167,89,0.3)' : 'rgba(160,130,40,0.25)'}`
                          : '2px solid transparent',
                        transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      <NoteIcon
                        size={13}
                        style={{
                          color: isSelected
                            ? (dark ? '#c4a759' : '#8b7a3d')
                            : (dark ? '#333333' : '#aaaaaa'),
                          transition: 'color 0.15s ease',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        className="text-sm truncate tracking-tight"
                        style={{
                          color: isSelected
                            ? (dark ? '#e8e8e8' : '#1a1a1a')
                            : (dark ? '#606060' : '#888888'),
                          transition: 'color 0.15s ease',
                        }}
                      >
                        {note.title || 'Untitled'}
                      </span>
                      {isSelected && (
                        <CornerDownLeft
                          size={11}
                          className="flex-shrink-0 ml-auto"
                          style={{ color: dark ? '#333333' : '#bbbbbb' }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {recentNotes.length === 0 && (
              <div className="px-5 py-8 flex flex-col items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: dark
                      ? 'linear-gradient(135deg, #111111, #0e0e0e)'
                      : 'linear-gradient(135deg, #f0ede6, #e8e5de)',
                    border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                  }}
                >
                  <Sparkles size={14} style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }} />
                </div>
                <p
                  className="text-[11px] text-center leading-relaxed"
                  style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}
                >
                  search by title, content, or concept
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
