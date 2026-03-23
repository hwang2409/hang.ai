import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, MessageCircle, Layers, CheckSquare, X, Send, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useTheme } from '../contexts/ThemeContext'

/* ── NotePanel ─────────────────────────────────────────────────── */

function NotePanel({ noteId, onSelectNote, dark }) {
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [recentNotes, setRecentNotes] = useState([])
  const searchTimeout = useRef(null)

  // Fetch note content when noteId changes
  useEffect(() => {
    if (!noteId) {
      // Load recent notes for picker
      api.get('/notes?limit=10&offset=0').then(data => {
        setRecentNotes(Array.isArray(data) ? data : data.documents || [])
      }).catch(() => {})
      return
    }
    setLoading(true)
    api.get(`/notes/${noteId}`).then(data => {
      setNote(data)
    }).catch(() => setNote(null))
    .finally(() => setLoading(false))
  }, [noteId])

  // Search notes
  const handleSearch = (q) => {
    setSearchQuery(q)
    clearTimeout(searchTimeout.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await api.post('/search/hybrid', { query: q, limit: 8 })
        setSearchResults((data.results || []).filter(r => r.source === 'note'))
      } catch { setSearchResults([]) }
    }, 250)
  }

  // Note picker view (no noteId selected)
  if (!noteId) {
    const notes = searchQuery ? searchResults : recentNotes
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b" style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0' }}>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
            style={{ background: dark ? '#111111' : '#f5f3ee', border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}` }}>
            <Search size={12} style={{ color: dark ? '#404040' : '#aaaaaa' }} />
            <input value={searchQuery} onChange={e => handleSearch(e.target.value)}
              placeholder="Find a note..."
              className="flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!searchQuery && <div className="px-2 py-1 text-[10px] uppercase tracking-widest"
            style={{ color: dark ? '#333333' : '#bbbbbb' }}>Recent</div>}
          {notes.map(n => (
            <button key={n.id} onClick={() => onSelectNote(n.id)}
              className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition-colors"
              style={{ color: dark ? '#808080' : '#666666' }}
              onMouseEnter={e => e.currentTarget.style.background = dark ? '#141414' : '#f0ede6'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <FileText size={12} style={{ flexShrink: 0, color: dark ? '#333333' : '#aaaaaa' }} />
              <span className="text-[12px] truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
                {n.title || 'Untitled'}
              </span>
            </button>
          ))}
          {notes.length === 0 && searchQuery && (
            <div className="text-center py-8 text-[11px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>
              No notes found
            </div>
          )}
        </div>
      </div>
    )
  }

  // Note viewer
  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0', borderTopColor: dark ? '#c4a759' : '#8b7a3d' }} /></div>

  if (!note) return <div className="flex items-center justify-center h-full text-[12px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>Note not found</div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0' }}>
        <button onClick={() => onSelectNote(null)} className="p-1 rounded transition-colors"
          style={{ color: dark ? '#606060' : '#888888' }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-[12px] font-medium truncate" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
          {note.title || 'Untitled'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="prose prose-sm max-w-none text-[13px] leading-relaxed"
          style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
          <pre className="whitespace-pre-wrap font-[inherit] text-[13px] leading-relaxed" style={{ color: dark ? '#b0b0b0' : '#444444' }}>
            {note.content}
          </pre>
        </div>
      </div>
    </div>
  )
}

/* ── ChatPanel ─────────────────────────────────────────────────── */

function ChatPanel({ dark }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [threadId, setThreadId] = useState(null)
  const scrollRef = useRef(null)

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const body = { message: text }
      if (threadId) body.thread_id = threadId

      let assistantText = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      for await (const parsed of api.stream('/llm/chat', body)) {
        if (parsed.type === 'text') {
          assistantText += parsed.content
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: assistantText }
            return updated
          })
        } else if (parsed.type === 'thread_id') {
          setThreadId(parsed.thread_id)
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get response.' }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageCircle size={20} style={{ color: dark ? '#1c1c1c' : '#ddd9d0' }} />
            <p className="text-[11px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>Ask anything...</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] px-3 py-2 rounded-xl text-[12px] leading-relaxed"
              style={{
                background: msg.role === 'user'
                  ? (dark ? 'rgba(196,167,89,0.08)' : 'rgba(160,130,40,0.06)')
                  : (dark ? '#141414' : '#f0ede6'),
                color: dark ? '#d4d4d4' : '#2a2a2a',
                border: `1px solid ${msg.role === 'user'
                  ? (dark ? 'rgba(196,167,89,0.15)' : 'rgba(160,130,40,0.1)')
                  : (dark ? '#1c1c1c' : '#ddd9d0')}`,
              }}>
              <pre className="whitespace-pre-wrap font-[inherit]">{msg.content}</pre>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-1 px-3 py-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }} />
              <div className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:0.15s]" style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }} />
              <div className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:0.3s]" style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4 }} />
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t flex-shrink-0" style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0' }}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: dark ? '#111111' : '#f5f3ee', border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}` }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Ask AI..."
            className="flex-1 bg-transparent text-[12px] outline-none"
            style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }} />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="p-1 rounded transition-opacity disabled:opacity-30"
            style={{ color: dark ? '#c4a759' : '#8b7a3d' }}>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── FlashcardsPanel ───────────────────────────────────────────── */

function FlashcardsPanel({ dark }) {
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/flashcards/due').then(data => {
      setCards(Array.isArray(data) ? data : [])
    }).catch(() => setCards([]))
    .finally(() => setLoading(false))
  }, [])

  const card = cards[currentIndex]

  const rateCard = async (quality) => {
    if (!card) return
    try {
      await api.post(`/flashcards/${card.id}/review`, { quality })
    } catch {}
    setFlipped(false)
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(i => i + 1)
    } else {
      // Refresh due cards
      setLoading(true)
      try {
        const data = await api.get('/flashcards/due')
        setCards(Array.isArray(data) ? data : [])
        setCurrentIndex(0)
      } catch { setCards([]) }
      setLoading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0', borderTopColor: dark ? '#c4a759' : '#8b7a3d' }} /></div>

  if (cards.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <Layers size={20} style={{ color: dark ? '#1c1c1c' : '#ddd9d0' }} />
      <p className="text-[12px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>No cards due</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full p-4">
      {/* Progress */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: dark ? '#404040' : '#aaaaaa' }}>
          {currentIndex + 1} / {cards.length}
        </span>
        <button onClick={() => { setCurrentIndex(0); setFlipped(false) }}
          className="p-1 rounded transition-colors"
          style={{ color: dark ? '#404040' : '#aaaaaa' }}>
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Card */}
      <button onClick={() => setFlipped(f => !f)}
        className="flex-1 flex items-center justify-center rounded-xl p-5 text-center cursor-pointer transition-all min-h-0 overflow-y-auto"
        style={{
          background: dark ? '#111111' : '#f5f3ee',
          border: `1px solid ${flipped ? (dark ? 'rgba(196,167,89,0.2)' : 'rgba(160,130,40,0.15)') : (dark ? '#1c1c1c' : '#ddd9d0')}`,
        }}>
        <pre className="whitespace-pre-wrap font-[inherit] text-[13px] leading-relaxed"
          style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
          {flipped ? card.back : card.front}
        </pre>
      </button>

      {/* Rate buttons (show when flipped) */}
      {flipped && (
        <div className="flex gap-2 mt-3 flex-shrink-0">
          {[
            { q: 1, label: 'Again', color: '#884444' },
            { q: 2, label: 'Hard', color: dark ? '#887744' : '#887744' },
            { q: 3, label: 'Good', color: dark ? '#4a7a4a' : '#4a7a4a' },
            { q: 4, label: 'Easy', color: dark ? '#c4a759' : '#8b7a3d' },
          ].map(({ q, label, color }) => (
            <button key={q} onClick={() => rateCard(q)}
              className="flex-1 py-2 rounded-lg text-[11px] font-medium tracking-wide transition-opacity hover:opacity-80"
              style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!flipped && (
        <p className="text-center text-[10px] mt-3 flex-shrink-0" style={{ color: dark ? '#333333' : '#bbbbbb' }}>
          click to flip
        </p>
      )}
    </div>
  )
}

/* ── TodosPanel ────────────────────────────────────────────────── */

function TodosPanel({ dark }) {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTodo, setNewTodo] = useState('')

  useEffect(() => {
    api.get('/todos').then(data => {
      setTodos(Array.isArray(data) ? data : [])
    }).catch(() => setTodos([]))
    .finally(() => setLoading(false))
  }, [])

  const toggleTodo = async (id, completed) => {
    try {
      await api.put(`/todos/${id}`, { completed: !completed })
      setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
    } catch {}
  }

  const addTodo = async () => {
    const text = newTodo.trim()
    if (!text) return
    setNewTodo('')
    try {
      const todo = await api.post('/todos', { text, priority: 1 })
      setTodos(prev => [todo, ...prev])
    } catch {}
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0', borderTopColor: dark ? '#c4a759' : '#8b7a3d' }} /></div>

  const pending = todos.filter(t => !t.completed)
  const completed = todos.filter(t => t.completed)

  return (
    <div className="flex flex-col h-full">
      {/* Add todo */}
      <div className="p-3 border-b flex-shrink-0" style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0' }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: dark ? '#111111' : '#f5f3ee', border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}` }}>
          <input value={newTodo} onChange={e => setNewTodo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo() }}
            placeholder="Add a task..."
            className="flex-1 bg-transparent text-[12px] outline-none"
            style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }} />
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto p-2">
        {pending.length === 0 && completed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <CheckSquare size={20} style={{ color: dark ? '#1c1c1c' : '#ddd9d0' }} />
            <p className="text-[12px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>No todos</p>
          </div>
        )}
        {pending.map(todo => (
          <button key={todo.id} onClick={() => toggleTodo(todo.id, todo.completed)}
            className="w-full text-left px-3 py-2 rounded-lg flex items-start gap-2.5 transition-colors"
            onMouseEnter={e => e.currentTarget.style.background = dark ? '#141414' : '#f0ede6'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div className="w-3.5 h-3.5 rounded border mt-0.5 flex-shrink-0"
              style={{ borderColor: dark ? '#333333' : '#cccccc' }} />
            <span className="text-[12px] leading-relaxed" style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}>
              {todo.text}
            </span>
          </button>
        ))}
        {completed.length > 0 && (
          <>
            <div className="px-3 py-1.5 mt-2 text-[10px] uppercase tracking-widest"
              style={{ color: dark ? '#2a2a2a' : '#cccccc' }}>
              Completed ({completed.length})
            </div>
            {completed.slice(0, 10).map(todo => (
              <button key={todo.id} onClick={() => toggleTodo(todo.id, todo.completed)}
                className="w-full text-left px-3 py-1.5 rounded-lg flex items-start gap-2.5 transition-colors"
                onMouseEnter={e => e.currentTarget.style.background = dark ? '#141414' : '#f0ede6'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div className="w-3.5 h-3.5 rounded border mt-0.5 flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: dark ? '#333333' : '#cccccc', background: dark ? 'rgba(196,167,89,0.1)' : 'rgba(160,130,40,0.08)' }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={dark ? '#c4a759' : '#8b7a3d'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className="text-[12px] leading-relaxed line-through" style={{ color: dark ? '#333333' : '#bbbbbb' }}>
                  {todo.text}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/* ── SidePanel (main export) ───────────────────────────────────── */

export default function SidePanel() {
  const { panelTab, panelNoteId, setPanelTab, setPanelNoteId, closePanel } = useWorkspace()
  const { dark } = useTheme()

  const tabs = [
    { id: 'note', icon: FileText, label: 'Note' },
    { id: 'chat', icon: MessageCircle, label: 'Chat' },
    { id: 'flashcards', icon: Layers, label: 'Cards' },
    { id: 'todos', icon: CheckSquare, label: 'Todos' },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border px-1 flex-shrink-0"
        style={{ borderColor: dark ? '#1c1c1c' : '#ddd9d0' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setPanelTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] tracking-wide transition-colors"
            style={{
              color: panelTab === tab.id
                ? (dark ? '#d4d4d4' : '#2a2a2a')
                : (dark ? '#404040' : '#aaaaaa'),
              borderBottom: panelTab === tab.id
                ? `2px solid ${dark ? '#c4a759' : '#8b7a3d'}`
                : '2px solid transparent',
            }}>
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
        <button onClick={closePanel}
          className="ml-auto p-1.5 rounded transition-colors"
          style={{ color: dark ? '#404040' : '#aaaaaa' }}
          onMouseEnter={e => e.currentTarget.style.color = dark ? '#808080' : '#666666'}
          onMouseLeave={e => e.currentTarget.style.color = dark ? '#404040' : '#aaaaaa'}>
          <X size={14} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {panelTab === 'note' && <NotePanel noteId={panelNoteId} onSelectNote={setPanelNoteId} dark={dark} />}
        {panelTab === 'chat' && <ChatPanel dark={dark} />}
        {panelTab === 'flashcards' && <FlashcardsPanel dark={dark} />}
        {panelTab === 'todos' && <TodosPanel dark={dark} />}
      </div>
    </div>
  )
}
