import { useState, useEffect, useRef } from 'react'
import { Trash2, Calendar, ChevronLeft, ChevronRight, X, Flag } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'

const PRIORITY_COLORS = {
  0: null,
  1: '#4a7aaa',
  2: '#aa8833',
  3: '#aa4444',
}

const PRIORITY_LABELS = {
  0: 'none',
  1: 'low',
  2: 'medium',
  3: 'high',
}

const SORT_OPTIONS = [
  { key: 'created', label: 'recent' },
  { key: 'due_date', label: 'due date' },
  { key: 'priority', label: 'priority' },
]

function DatePicker({ value, onChange, dark }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const today = new Date()
  const selected = value ? new Date(value + 'T00:00:00') : null
  const [viewYear, setViewYear] = useState(selected?.getFullYear() || today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth())

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const monthName = new Date(viewYear, viewMonth).toLocaleString('en-US', { month: 'long' })

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const selectDate = (day) => {
    const m = String(viewMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    onChange(`${viewYear}-${m}-${d}`)
    setOpen(false)
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  const label = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  const bg = dark ? '#0d0d0d' : '#fafafa'
  const border = dark ? '#1a1a1a' : '#eee'
  const dropBg = dark ? '#111111' : '#ffffff'
  const dropBorder = dark ? '#222222' : '#e0e0e0'
  const textPrimary = dark ? '#d4d4d4' : '#2a2a2a'
  const textMuted = dark ? '#444' : '#bbb'
  const hoverBg = dark ? '#1a1a1a' : '#f0f0f0'
  const todayColor = '#c4a759'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs transition-colors"
        style={{ color: label ? textPrimary : (dark ? '#555' : '#999'), borderColor: border, background: bg }}
      >
        <Calendar size={13} style={{ color: dark ? '#555' : '#999' }} />
        {label || 'date'}
        {label && (
          <span onClick={clear} className="ml-0.5 hover:opacity-80 cursor-pointer" style={{ color: dark ? '#555' : '#999' }}>
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-1.5 right-0 z-50 rounded-xl shadow-2xl p-3 w-[260px] animate-fade-in"
          style={{ background: dropBg, border: `1px solid ${dropBorder}` }}
        >
          {/* Month/year nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded hover:opacity-80 transition-opacity" style={{ color: textMuted }}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium" style={{ color: textPrimary }}>
              {monthName} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 rounded hover:opacity-80 transition-opacity" style={{ color: textMuted }}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] py-1" style={{ color: textMuted }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
              const isSelected = selected && day === selected.getDate() && viewMonth === selected.getMonth() && viewYear === selected.getFullYear()
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className="w-8 h-8 mx-auto rounded-lg text-xs flex items-center justify-center transition-colors"
                  style={{
                    color: isSelected ? '#000' : isToday ? todayColor : textPrimary,
                    background: isSelected ? todayColor : 'transparent',
                    fontWeight: isToday || isSelected ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = hoverBg }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-2 pt-2 flex justify-center" style={{ borderTop: `1px solid ${dropBorder}` }}>
            <button
              type="button"
              onClick={() => selectDate(today.getDate(), setViewMonth(today.getMonth()), setViewYear(today.getFullYear()))}
              className="text-[10px] px-2 py-0.5 rounded transition-colors"
              style={{ color: todayColor }}
            >
              today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Todos() {
  const { dark } = useTheme()
  const [todos, setTodos] = useState([])
  const [text, setText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState(0)
  const [showCompleted, setShowCompleted] = useState(false)
  const [sortBy, setSortBy] = useState('created')

  const load = () => {
    const params = new URLSearchParams()
    if (!showCompleted) params.set('completed', 'false')
    if (sortBy !== 'created') params.set('sort', sortBy)
    const q = params.toString() ? `?${params}` : ''
    api.get(`/todos${q}`).then(setTodos).catch(() => {})
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [showCompleted, sortBy])

  const add = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    await api.post('/todos', {
      text: text.trim(),
      due_date: dueDate || null,
      priority,
    })
    setText('')
    setDueDate('')
    setPriority(0)
    load()
  }

  const updatePriority = async (todo, newPriority) => {
    await api.put(`/todos/${todo.id}`, { priority: newPriority })
    load()
  }

  const toggle = async (todo) => {
    await api.put(`/todos/${todo.id}`, { completed: !todo.completed })
    load()
  }

  const remove = async (id) => {
    await api.delete(`/todos/${id}`)
    load()
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto animate-fade-in">
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-12 lg:pt-12">

          <h1 className="text-lg font-semibold mb-8 text-text">
            todos
          </h1>

          {/* Add form */}
          <form onSubmit={add} className="flex gap-2 mb-6">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="add a task..."
              className="flex-1 text-sm bg-transparent outline-none px-3 py-2 rounded-lg border"
              style={{
                color: dark ? '#d4d4d4' : '#2a2a2a',
                borderColor: dark ? '#1a1a1a' : '#eee',
                background: dark ? '#0d0d0d' : '#fafafa',
              }}
            />
            <DatePicker value={dueDate} onChange={setDueDate} dark={dark} />
            <button
              type="button"
              onClick={() => setPriority(p => (p + 1) % 4)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs transition-colors"
              style={{
                borderColor: dark ? '#1a1a1a' : '#eee',
                background: dark ? '#0d0d0d' : '#fafafa',
                color: PRIORITY_COLORS[priority] || (dark ? '#555' : '#999'),
              }}
              title={`Priority: ${PRIORITY_LABELS[priority]}`}
            >
              <Flag size={13} />
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-medium"
              style={{
                background: '#c4a759',
                color: '#000',
              }}
            >
              add
            </button>
          </form>

          {/* Sort controls + completed toggle */}
          <div className="flex items-center gap-1 mb-6">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className="px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background: sortBy === opt.key ? (dark ? '#191919' : '#e8e8e8') : 'transparent',
                  color: sortBy === opt.key ? (dark ? '#d4d4d4' : '#2a2a2a') : (dark ? '#606060' : '#999'),
                }}
              >
                {opt.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-xs transition-colors"
              style={{ color: dark ? '#444' : '#999' }}
            >
              {showCompleted ? 'hide completed' : 'show completed'}
            </button>
          </div>

          {/* Todo list */}
          <div className="space-y-1">
            {todos.map(todo => {
              const dueDateColor = (() => {
                if (!todo.due_date || todo.completed) return dark ? '#444' : '#aaa'
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const due = new Date(todo.due_date + 'T00:00:00')
                if (due.getTime() === today.getTime()) return '#c4a759'
                if (due < today) return '#aa4444'
                return dark ? '#444' : '#aaa'
              })()

              return (
                <div
                  key={todo.id}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                  style={{ background: dark ? '#0d0d0d' : '#fafafa' }}
                >
                  <button
                    onClick={() => toggle(todo)}
                    className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center"
                    style={{
                      borderColor: todo.completed ? '#c4a759' : (dark ? '#333' : '#ccc'),
                      background: todo.completed ? '#c4a759' : 'transparent',
                    }}
                  >
                    {todo.completed && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4.5 7.5L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  {/* Priority dot (inline, visible when priority > 0) */}
                  {todo.priority > 0 && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0 -ml-1"
                      style={{ background: PRIORITY_COLORS[todo.priority] }}
                    />
                  )}

                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: todo.completed ? (dark ? '#333' : '#bbb') : (dark ? '#d4d4d4' : '#2a2a2a'),
                      textDecoration: todo.completed ? 'line-through' : 'none',
                    }}
                  >
                    {todo.text}
                  </span>

                  {/* Inline priority changer on hover */}
                  <button
                    onClick={() => updatePriority(todo, (todo.priority + 1) % 4)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: PRIORITY_COLORS[todo.priority] || (dark ? '#333' : '#ccc') }}
                    title={`Priority: ${PRIORITY_LABELS[todo.priority || 0]}`}
                  >
                    <Flag size={12} />
                  </button>

                  {todo.due_date && (
                    <span className="text-[11px] flex-shrink-0" style={{ color: dueDateColor }}>
                      {new Date(todo.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  <button
                    onClick={() => remove(todo.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: dark ? '#333' : '#ccc' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          {todos.length === 0 && (
            <p className="text-center text-sm mt-12" style={{ color: dark ? '#333' : '#bbb' }}>
              {showCompleted ? 'no todos yet' : 'all caught up'}
            </p>
          )}

        </div>
      </div>
    </Layout>
  )
}
