import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, X, Check, Loader2, Highlighter, Search, Layers, FileText, BookOpen, Tag, Download, Share2, Link2, Link2Off } from 'lucide-react'
import { api } from '../lib/api'
import { getCached, setCache, updateCacheMessages } from '../lib/noteThreadCache'
import { useChat } from '../hooks/useChat'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import MarkdownRenderer from '../components/MarkdownRenderer'
import SelectionToolbar from '../components/SelectionToolbar'
import AnnotationEditor from '../components/AnnotationEditor'
import ContextMenu from '../components/ContextMenu'
import NoteSidebar from '../components/NoteSidebar'

const CanvasEditor = lazy(() => import('../components/CanvasEditor'))
const MoodboardEditor = lazy(() => import('../components/MoodboardEditor'))
const VimEditor = lazy(() => import('../components/VimEditor'))

/** Extract selection info from the current window selection. Pure function — no component deps. */
const getSelectionInfo = (content) => {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return null
  const text = sel.toString().trim()
  if (text.length < 2) return null
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const startOffset = content.indexOf(text)
  const endOffset = startOffset >= 0 ? startOffset + text.length : -1
  return { text, x: rect.left + rect.width / 2, y: rect.top - 8, startOffset, endOffset }
}

export default function NoteEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dark } = useTheme()
  const { user } = useAuth()
  const userVimAllowed = user?.vim_enabled ?? false
  const FONT_SIZE_MAP = { small: '13px', normal: '14px', large: '16px', 'extra-large': '18px' }
  const editorFontSize = FONT_SIZE_MAP[user?.editor_font_size] || '14px'

  const [note, setNote] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [mode, setMode] = useState('write')
  const [vimEnabled, setVimEnabled] = useState(() => user?.vim_enabled && localStorage.getItem('vim-mode') === 'true')
  const [vimMode, setVimMode] = useState('NORMAL')
  const vimEditorRef = useRef(null)

  // Sidebar state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatWidth, setChatWidth] = useState(380)
  const [chatInput, setChatInput] = useState('')
  const [sidebarTab, setSidebarTab] = useState('chat')

  // Share state
  const [shareToken, setShareToken] = useState(null)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Lookup state
  const [lookups, setLookups] = useState([])
  const [activeLookupId, setActiveLookupId] = useState(null)

  // Selection state
  const [selectionToolbar, setSelectionToolbar] = useState(null)
  const [selectionContext, setSelectionContext] = useState(null)
  const [annotationEditor, setAnnotationEditor] = useState(null)

  // Annotations state
  const [annotations, setAnnotations] = useState([])
  const [editingAnnotation, setEditingAnnotation] = useState(null)
  const [editAnnotationContent, setEditAnnotationContent] = useState('')

  // Linked notes state
  const [linkedNotes, setLinkedNotes] = useState([])
  const [suggestions, setSuggestions] = useState([])

  // Wiki links: all note titles for resolution + autocomplete
  const [noteTitles, setNoteTitles] = useState([])

  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  // Canvas toolbar auto-hide
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const toolbarTimerRef = useRef(null)
  const [canvasTagsOpen, setCanvasTagsOpen] = useState(false)

  const saveTimeoutRef = useRef(null)
  const dragRef = useRef(null)
  const editorRef = useRef(null)
  const proseRef = useRef(null)
  const excalidrawApiRef = useRef(null)

  // Wiki link resolution map: lowercase title → note id
  const noteMap = useMemo(
    () => new Map(noteTitles.map(n => [n.title?.toLowerCase(), n.id])),
    [noteTitles]
  )

  // Auto-save (with wiki link sync)
  const saveNote = useCallback(async (newTitle, newContent, newTags) => {
    setSaveStatus('saving')
    try {
      await api.put(`/notes/${id}`, { title: newTitle, content: newContent, tags: newTags })
      setSaveStatus('saved')
      // Trigger background analysis (fire-and-forget)
      if (newContent.trim().length > 50) {
        api.post(`/notes/${id}/analyze`).then(() => {
          // Poll for result after a delay
          setTimeout(async () => {
            try {
              const analysisData = await api.get(`/notes/${id}/analysis`)
              if (analysisData.status === 'ready') setInsights(analysisData.analysis)
            } catch { /* ignore */ }
          }, 8000)
        }).catch(() => {})
      }
      // Sync wiki links → DocumentLinks (additive only)
      const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
      let m
      const targetIds = new Set()
      while ((m = wikiRe.exec(newContent)) !== null) {
        const targetId = noteMap.get(m[1].trim().toLowerCase())
        if (targetId && targetId !== parseInt(id)) targetIds.add(targetId)
      }
      const existingIds = new Set(linkedNotes.map(l => l.target_id ?? l.id))
      for (const tid of targetIds) {
        if (!existingIds.has(tid)) {
          try {
            await api.post(`/notes/${id}/links`, { target_id: tid })
          } catch { /* ignore duplicate link errors */ }
        }
      }
    } catch (err) {
      console.error('Save failed:', err)
      setSaveStatus('unsaved')
    }
  }, [id, noteMap, linkedNotes])

  const debouncedSave = useCallback((newTitle, newContent, newTags) => {
    setSaveStatus('unsaved')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveNote(newTitle, newContent, newTags), 1000)
  }, [saveNote])

  const isCanvas = note?.type === 'canvas'
  const isMoodboard = note?.type === 'moodboard'

  // Handle canvas edits from AI
  const handleCanvasEdit = useCallback((operations) => {
    const excalidrawApi = excalidrawApiRef.current
    if (!excalidrawApi) return
    const elements = excalidrawApi.getSceneElements()
    let updated = [...elements]
    const filesToAdd = []

    for (const op of operations) {
      if (op.op === 'add' && op.element) {
        updated.push(op.element)
        // Collect any files (for image elements)
        if (op.files) {
          for (const fileData of Object.values(op.files)) {
            filesToAdd.push(fileData)
          }
        }
      } else if (op.op === 'update' && op.element_id) {
        updated = updated.map(el =>
          el.id === op.element_id
            ? { ...el, ...op.updates, version: (el.version || 1) + 1 }
            : el
        )
      } else if (op.op === 'delete' && op.element_id) {
        updated = updated.map(el =>
          el.id === op.element_id
            ? { ...el, isDeleted: true, version: (el.version || 1) + 1 }
            : el
        )
      }
    }

    // Add image files first so the elements can reference them
    if (filesToAdd.length > 0) {
      excalidrawApi.addFiles(filesToAdd)
    }
    excalidrawApi.updateScene({ elements: updated })
  }, [])

  // Handle moodboard edits from AI
  const handleMoodboardEdit = useCallback((operations) => {
    setContent(prev => {
      let data
      try { data = JSON.parse(prev || '{}') } catch { data = { items: [], settings: { columns: 3, gap: 12 } } }
      const items = [...(data.items || [])]

      for (const op of operations) {
        if (op.type === 'add_image') {
          items.push({
            id: op.id || Math.random().toString(36).slice(2, 10),
            type: 'image',
            url: op.url,
            caption: op.caption || '',
            width: op.width || 1,
            order: items.length,
          })
        } else if (op.type === 'add_text') {
          items.push({
            id: op.id || Math.random().toString(36).slice(2, 10),
            type: 'text',
            content: op.content || '',
            color: op.color || '#1a1a2e',
            width: op.width || 1,
            order: items.length,
          })
        } else if (op.type === 'remove') {
          const idx = items.findIndex(i => i.id === op.item_id)
          if (idx !== -1) items.splice(idx, 1)
        } else if (op.type === 'update_caption') {
          const item = items.find(i => i.id === op.item_id)
          if (item) item.caption = op.caption
        }
      }

      const newData = { ...data, items }
      const newContent = JSON.stringify(newData)
      debouncedSave(title, newContent, tags)
      return newContent
    })
  }, [title, tags, debouncedSave])

  // Chat hook
  const noteId = parseInt(id)
  const { messages, streaming, sendMessage, setThreadId: loadThread } = useChat({
    noteId,
    onNoteEdit: (isCanvas || isMoodboard) ? undefined : (newContent) => {
      setContent(newContent)
      debouncedSave(title, newContent, tags)
    },
    onCanvasEdit: isCanvas ? handleCanvasEdit : undefined,
    onMoodboardEdit: isMoodboard ? handleMoodboardEdit : undefined,
    onThreadCreated: (threadId) => {
      setCache(noteId, threadId, [])
    },
    onStreamEnd: (cur) => {
      updateCacheMessages(noteId, cur)
    },
  })

  // Fetch note + annotations
  useEffect(() => {
    const fetchNote = async () => {
      try {
        const data = await api.get(`/notes/${id}`)
        setNote(data)
        setTitle(data.title || '')
        setContent(data.content || '')
        setShareToken(data.share_token || null)
        setTags((data.tags || []).map(t => typeof t === 'string' ? t : t.name))
        try {
          const anns = await api.get(`/annotations?document_id=${id}`)
          setAnnotations(anns)
        } catch (err) {
          if (err?.status !== 404) console.error('Failed to load annotations:', err)
        }
        try {
          const lks = await api.get(`/lookups?document_id=${id}`)
          setLookups(lks)
        } catch (err) {
          if (err?.status !== 404) console.error('Failed to load lookups:', err)
        }
        try {
          const links = await api.get(`/notes/${id}/links`)
          setLinkedNotes(links)
        } catch (err) {
          if (err?.status !== 404) console.error('Failed to load links:', err)
        }
        try {
          const sug = await api.get(`/notes/${id}/suggestions`)
          setSuggestions(sug)
        } catch {
          setSuggestions([])
        }
        try {
          const allNotes = await api.get('/notes')
          setNoteTitles(allNotes.map(n => ({ id: n.id, title: n.title })))
        } catch (err) {
          console.error('Failed to load note titles:', err)
        }
        try {
          const analysisData = await api.get(`/notes/${id}/analysis`)
          if (analysisData.status === 'ready') setInsights(analysisData.analysis)
        } catch (err) {
          // Analysis not available yet — that's fine
        }
      } catch (err) {
        console.error('Failed to fetch note:', err)
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    fetchNote()
  }, [id, navigate])

  // Load cached/persisted chat thread
  useEffect(() => {
    const cached = getCached(noteId)
    if (cached) {
      loadThread(cached.threadId, cached.messages)
      if (!cached.stale) return
    }
    const fetchThread = async () => {
      try {
        const threads = await api.get(`/llm/threads?note_id=${noteId}`)
        if (threads.length > 0) {
          const latest = threads[0]
          const data = await api.get(`/llm/threads/${latest.id}`)
          loadThread(latest.id, data.messages || [])
          setCache(noteId, latest.id, data.messages || [])
        }
      } catch (err) {
        if (err?.status !== 404) console.error('Failed to load threads:', err)
      }
    }
    fetchThread()
  }, [noteId, loadThread])

  // Persist vim preference
  useEffect(() => { localStorage.setItem('vim-mode', vimEnabled ? 'true' : 'false') }, [vimEnabled])

  // Sync vim state when profile setting changes
  useEffect(() => { if (!userVimAllowed) setVimEnabled(false) }, [userVimAllowed])

  const handleMoodboardChange = useCallback((jsonStr) => {
    setContent(jsonStr)
    debouncedSave(title, jsonStr, tags)
  }, [title, tags, debouncedSave])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        if (isCanvas || isMoodboard) return
        setMode(m => m === 'write' ? 'read' : 'write')
        setSelectionToolbar(null)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        if (isCanvas || isMoodboard || !userVimAllowed) return
        setVimEnabled(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCanvas, isMoodboard, userVimAllowed])

  // Focus editor on mode switch
  useEffect(() => {
    if (mode === 'write') {
      if (vimEnabled) vimEditorRef.current?.focus()
      else editorRef.current?.focus()
    }
  }, [mode, vimEnabled])

  // Canvas toolbar auto-hide after 3s of inactivity
  useEffect(() => {
    if (!isCanvas) return
    const resetTimer = () => {
      setToolbarVisible(true)
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
      toolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000)
    }
    resetTimer()
    window.addEventListener('mousemove', resetTimer)
    return () => {
      window.removeEventListener('mousemove', resetTimer)
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
    }
  }, [isCanvas])

  // Handlers
  const handleTitleChange = (val) => { setTitle(val); debouncedSave(val, content, tags) }
  const handleContentChange = (val) => { setContent(val); debouncedSave(title, val, tags) }
  const handleVimSave = useCallback(() => { saveNote(title, content, tags) }, [saveNote, title, content, tags])
  const handleVimQuit = useCallback(() => { navigate('/') }, [navigate])
  const handleCanvasChange = useCallback((jsonStr) => { setContent(jsonStr); debouncedSave(title, jsonStr, tags) }, [title, tags, debouncedSave])

  // Wiki link autocomplete for VimEditor
  const handleSearchNotes = useCallback(async (query) => {
    if (!query.trim()) return noteTitles.filter(n => n.id !== parseInt(id)).slice(0, 10)
    const lower = query.toLowerCase()
    return noteTitles.filter(n => n.title?.toLowerCase().includes(lower) && n.id !== parseInt(id)).slice(0, 10)
  }, [id, noteTitles])

  const handleCreateFlashcard = useCallback(async (front, back) => {
    try {
      await api.post('/flashcards', { front, back, note_id: parseInt(id) })
    } catch (err) {
      console.error('Failed to create flashcard:', err)
    }
  }, [id])

  const handleAddInsightTag = useCallback((tag) => {
    if (tags.includes(tag)) return
    const newTags = [...tags, tag]
    setTags(newTags)
    debouncedSave(title, content, newTags)
  }, [tags, title, content, debouncedSave])

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      const newTags = [...tags, tagInput.trim()]
      setTags(newTags)
      setTagInput('')
      debouncedSave(title, content, newTags)
    }
  }

  const handleRemoveTag = (index) => {
    const newTags = tags.filter((_, i) => i !== index)
    setTags(newTags)
    debouncedSave(title, content, newTags)
  }

  // Chat drag to resize
  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: chatWidth }
    const onMove = (e) => {
      const diff = dragRef.current.startX - e.clientX
      setChatWidth(Math.min(800, Math.max(250, dragRef.current.startWidth + diff)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [chatWidth])

  const handleSendMessage = async () => {
    if (!chatInput.trim() || streaming) return
    const msg = chatInput
    setChatInput('')
    await sendMessage(msg)
  }

  const handleShare = async () => {
    try {
      const { share_token } = await api.post(`/notes/${id}/share`)
      setShareToken(share_token)
      const url = `${window.location.origin}/shared/${share_token}`
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch (err) {
      console.error('Share failed:', err)
    }
  }

  const handleUnshare = async () => {
    try {
      await api.delete(`/notes/${id}/share`)
      setShareToken(null)
      setShareMenuOpen(false)
    } catch (err) {
      console.error('Unshare failed:', err)
    }
  }

  const handleCopyShareLink = async () => {
    const url = `${window.location.origin}/shared/${shareToken}`
    await navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() }
  }

  // Selection handling
  const handleProseMouseUp = useCallback(() => {
    if (mode !== 'read') return
    const info = getSelectionInfo(content)
    if (!info) return
    setSelectionToolbar(info)
  }, [mode, content])

  const handleReadModeClick = useCallback(() => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    setMode('write')
  }, [])

  const handleProseContextMenu = useCallback((e) => {
    if (mode !== 'read') return
    const info = getSelectionInfo(content)
    if (!info) return
    e.preventDefault()
    if (!selectionToolbar) {
      setSelectionToolbar(info)
    }
    setSelectionContext({ x: e.clientX, y: e.clientY })
  }, [mode, content, selectionToolbar])

  const handleSelectionAction = useCallback(async (actionId) => {
    if (!selectionToolbar) return
    const { text, startOffset, endOffset } = selectionToolbar
    setSelectionToolbar(null)
    setSelectionContext(null)
    window.getSelection()?.removeAllRanges()

    switch (actionId) {
      case 'annotate':
        setAnnotationEditor({ text, startOffset, endOffset })
        break
      case 'research':
      case 'summarize':
      case 'define': {
        const pendingId = 'pending-' + Date.now()
        setChatOpen(true)
        setSidebarTab('lookup')
        setLookups(prev => [{ id: pendingId, action: actionId, selected_text: text, result: '', loading: true }, ...prev])
        setActiveLookupId(pendingId)
        try {
          const data = await api.post('/llm/selection-action', { action: actionId, selected_text: text, note_context: content })
          const saved = await api.post('/lookups', { document_id: noteId, action: actionId, selected_text: text, result: data.result })
          setLookups(prev => prev.map(l => l.id === pendingId ? saved : l))
          setActiveLookupId(saved.id)
        } catch (err) {
          console.error('Lookup failed:', err)
          setLookups(prev => prev.map(l => l.id === pendingId ? { ...l, result: 'Something went wrong. Please try again.', loading: false } : l))
        }
        break
      }
      case 'flashcards':
        try {
          await api.post('/flashcards/generate', { note_id: noteId, count: 3, content_override: text })
          setChatOpen(true)
          setSidebarTab('chat')
        } catch (err) {
          console.error('Failed to generate flashcards:', err)
        }
        break
    }
  }, [selectionToolbar, noteId, content])

  // Annotation CRUD
  const handleSaveAnnotation = useCallback(async (annotationContent) => {
    if (!annotationEditor) return
    try {
      const ann = await api.post('/annotations', {
        document_id: noteId,
        selected_text: annotationEditor.text,
        annotation_content: annotationContent,
        start_offset: annotationEditor.startOffset,
        end_offset: annotationEditor.endOffset,
      })
      setAnnotations(prev => [...prev, ann])
      setAnnotationEditor(null)
      setChatOpen(true)
      setSidebarTab('annotations')
    } catch (err) {
      console.error('Failed to save annotation:', err)
    }
  }, [annotationEditor, noteId])

  const handleDeleteAnnotation = useCallback(async (annId) => {
    try {
      await api.delete(`/annotations/${annId}`)
      setAnnotations(prev => prev.filter(a => a.id !== annId))
    } catch (err) {
      console.error('Failed to delete annotation:', err)
    }
  }, [])

  const handleUpdateAnnotation = useCallback(async (annId) => {
    try {
      const updated = await api.put(`/annotations/${annId}`, { annotation_content: editAnnotationContent })
      setAnnotations(prev => prev.map(a => a.id === annId ? updated : a))
      setEditingAnnotation(null)
    } catch (err) {
      console.error('Failed to update annotation:', err)
    }
  }, [editAnnotationContent])

  const handleAddLink = useCallback(async (targetId) => {
    try {
      const link = await api.post(`/notes/${id}/links`, { target_id: targetId })
      setLinkedNotes(prev => [...prev, link])
      setSuggestions(prev => prev.filter(s => s.id !== targetId))
    } catch (err) {
      console.error('Failed to create link:', err)
    }
  }, [id])

  const handleRemoveLink = useCallback(async (linkId) => {
    try {
      await api.delete(`/notes/${id}/links/${linkId}`)
      setLinkedNotes(prev => prev.filter(l => l.link_id !== linkId))
    } catch (err) {
      console.error('Failed to remove link:', err)
    }
  }, [id])

  const handleDeleteLookup = useCallback(async (lookupId) => {
    try {
      await api.delete(`/lookups/${lookupId}`)
      setLookups(prev => prev.filter(l => l.id !== lookupId))
      if (activeLookupId === lookupId) setActiveLookupId(null)
    } catch (err) {
      console.error('Failed to delete lookup:', err)
    }
  }, [activeLookupId])

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center flex-1 p-8 pt-16 lg:pt-8">
          <div className="animate-spin h-8 w-8 border-4 border-[#333333] border-t-transparent rounded-full" />
        </div>
      </Layout>
    )
  }

  if (isCanvas) {
    // Cool neutral palette to match Excalidraw's white/gray UI
    const frostedStyle = {
      background: dark ? 'rgba(17,17,17,0.85)' : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      border: `1px solid ${dark ? 'rgba(28,28,28,0.8)' : 'rgba(230,230,235,0.9)'}`,
      boxShadow: dark
        ? '0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset'
        : '0 2px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03) inset',
    }

    return (
      <div className="h-full w-full relative">
        {/* Floating toolbar — compact, auto-hides after 3s */}
        <div
          className={`canvas-toolbar absolute top-4 left-4 z-[10] flex items-center gap-1.5 ${!toolbarVisible ? 'toolbar-hidden' : ''}`}
          onMouseEnter={() => { setToolbarVisible(true); if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current) }}
          onMouseLeave={() => { toolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), 2000) }}
        >
          {/* Back */}
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl text-[#606060] hover:text-[#d4d4d4] transition-colors flex-shrink-0"
            style={frostedStyle}
          >
            <ArrowLeft size={15} />
          </button>

          {/* Title + tag trigger + save status — single compact pill */}
          <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={frostedStyle}>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="untitled"
              className="bg-transparent border-none outline-none text-sm font-medium tracking-tight w-36 pl-3 py-1.5"
              style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="w-px h-4" style={{ background: dark ? 'rgba(42,42,42,0.5)' : 'rgba(0,0,0,0.08)' }} />
            <button
              onClick={(e) => { e.stopPropagation(); setCanvasTagsOpen(!canvasTagsOpen) }}
              className="px-2 py-1.5 transition-colors relative"
              style={{ color: canvasTagsOpen ? (dark ? '#c4a759' : '#6965db') : (dark ? '#444444' : '#aaaaaa') }}
              title="Tags"
            >
              <Tag size={13} />
              {tags.length > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
                  style={{ background: dark ? '#c4a759' : '#6965db', color: '#ffffff' }}
                >
                  {tags.length}
                </span>
              )}
            </button>
            <div className="w-px h-4" style={{ background: dark ? 'rgba(42,42,42,0.5)' : 'rgba(0,0,0,0.08)' }} />
            <div className="px-2.5 py-1.5 text-xs flex items-center gap-1.5">
              {saveStatus === 'saving' && <span className="flex items-center gap-1 text-[#606060]"><Loader2 size={10} className="animate-spin" /></span>}
              {saveStatus === 'saved' && <span className="flex items-center gap-1 text-[#333333]"><Check size={10} /></span>}
              {saveStatus === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full bg-[#606060]" />}
            </div>
          </div>

          {/* Chat toggle */}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-2 rounded-xl transition-colors flex-shrink-0"
            style={{
              ...frostedStyle,
              color: chatOpen ? (dark ? '#c4a759' : '#6965db') : (dark ? '#606060' : '#999999'),
            }}
            title="AI Chat"
          >
            <MessageSquare size={15} />
          </button>
        </div>

        {/* Tags popover — drops down below the toolbar */}
        {canvasTagsOpen && (
          <>
            <div className="fixed inset-0 z-[9]" onClick={() => setCanvasTagsOpen(false)} />
            <div
              className="canvas-tags-popover absolute top-16 left-16 z-[11] rounded-xl p-3 min-w-48 max-w-72"
              style={{
                ...frostedStyle,
                background: dark ? 'rgba(14,14,14,0.95)' : 'rgba(255,255,255,0.97)',
              }}
              onMouseEnter={() => { setToolbarVisible(true); if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current) }}
            >
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: dark ? '#333333' : '#aaaaaa' }}>
                tags
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg"
                    style={{ background: dark ? 'rgba(25,25,25,0.9)' : 'rgba(240,240,245,0.9)', color: dark ? '#808080' : '#666666' }}
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(i)}
                      className="hover:opacity-70 transition-opacity"
                      style={{ color: dark ? '#444444' : '#bbbbbb' }}
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
                {tags.length === 0 && (
                  <span className="text-[11px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>no tags yet</span>
                )}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { handleAddTag(e); if (e.key === 'Escape') setCanvasTagsOpen(false) }}
                placeholder="type + enter"
                autoFocus
                className="bg-transparent border-none outline-none text-[11px] w-full py-1 px-1 rounded-md"
                style={{
                  color: dark ? '#808080' : '#555555',
                  background: dark ? 'rgba(25,25,25,0.5)' : 'rgba(240,240,245,0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </>
        )}

        {/* Chat sidebar — frosted glass overlay */}
        {chatOpen && (
          <div
            className="canvas-chat-panel absolute top-0 right-0 z-[9] h-full flex flex-col"
            style={{
              width: Math.min(chatWidth, 420),
              background: dark ? 'rgba(10,10,10,0.92)' : 'rgba(252,252,254,0.95)',
              backdropFilter: 'blur(24px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
              borderLeft: `1px solid ${dark ? 'rgba(28,28,28,0.8)' : 'rgba(230,230,235,0.9)'}`,
              boxShadow: dark
                ? '-8px 0 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02) inset'
                : '-4px 0 24px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03) inset',
            }}
          >
            {/* Canvas mode: chat-only sidebar — annotation/lookup features not applicable */}
            <NoteSidebar
              chatOnly
              sidebarTab="chat"
              setSidebarTab={() => {}}
              messages={messages}
              streaming={streaming}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSendMessage={handleSendMessage}
              onChatKeyDown={handleChatKeyDown}
              lookups={[]}
              activeLookupId={null}
              onSetActiveLookup={() => {}}
              onDeleteLookup={() => {}}
              dark={dark}
              annotations={[]}
              content={content}
              editingAnnotation={null}
              editAnnotationContent=""
              onEditAnnotation={() => {}}
              onEditAnnotationChange={() => {}}
              onUpdateAnnotation={() => {}}
              onCancelEditAnnotation={() => {}}
              onDeleteAnnotation={() => {}}
              onClose={() => setChatOpen(false)}
            />
          </div>
        )}

        {/* Full-screen canvas */}
        <Suspense fallback={
          <div className="flex items-center justify-center h-full" style={{ background: dark ? '#0a0a0a' : '#ffffff' }}>
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{
                      background: dark ? '#c4a759' : '#8b7a3d',
                      opacity: 0.4,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
              <span className="text-[11px] tracking-wide" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>loading canvas</span>
            </div>
          </div>
        }>
          <CanvasEditor initialData={content} onChange={handleCanvasChange} dark={dark} onApiReady={(api) => { excalidrawApiRef.current = api }} />
        </Suspense>
      </div>
    )
  }

  if (isMoodboard) {
    const frostedStyle = {
      background: dark ? 'rgba(17,17,17,0.85)' : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      border: `1px solid ${dark ? 'rgba(28,28,28,0.8)' : 'rgba(230,230,235,0.9)'}`,
      boxShadow: dark
        ? '0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset'
        : '0 2px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03) inset',
    }

    return (
      <div className="h-full w-full relative flex flex-col" style={{ background: dark ? '#0a0a0a' : '#f5f3ee' }}>
        {/* Floating toolbar */}
        <div className="flex items-center gap-1.5 p-4 flex-shrink-0">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl text-[#606060] hover:text-[#d4d4d4] transition-colors flex-shrink-0"
            style={frostedStyle}
          >
            <ArrowLeft size={15} />
          </button>

          <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={frostedStyle}>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="untitled"
              className="bg-transparent border-none outline-none text-sm font-medium tracking-tight w-36 pl-3 py-1.5"
              style={{ color: dark ? '#d4d4d4' : '#2a2a2a' }}
            />
            <div className="w-px h-4" style={{ background: dark ? 'rgba(42,42,42,0.5)' : 'rgba(0,0,0,0.08)' }} />
            <button
              onClick={(e) => { e.stopPropagation(); setCanvasTagsOpen(!canvasTagsOpen) }}
              className="px-2 py-1.5 transition-colors relative"
              style={{ color: canvasTagsOpen ? (dark ? '#c4a759' : '#6965db') : (dark ? '#444444' : '#aaaaaa') }}
            >
              <Tag size={13} />
              {tags.length > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
                  style={{ background: dark ? '#c4a759' : '#6965db', color: '#ffffff' }}
                >
                  {tags.length}
                </span>
              )}
            </button>
            <div className="w-px h-4" style={{ background: dark ? 'rgba(42,42,42,0.5)' : 'rgba(0,0,0,0.08)' }} />
            <div className="px-2.5 py-1.5 text-xs flex items-center gap-1.5">
              {saveStatus === 'saving' && <span className="flex items-center gap-1 text-[#606060]"><Loader2 size={10} className="animate-spin" /></span>}
              {saveStatus === 'saved' && <span className="flex items-center gap-1 text-[#333333]"><Check size={10} /></span>}
              {saveStatus === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full bg-[#606060]" />}
            </div>
          </div>

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-2 rounded-xl transition-colors flex-shrink-0"
            style={{
              ...frostedStyle,
              color: chatOpen ? (dark ? '#c4a759' : '#6965db') : (dark ? '#606060' : '#999999'),
            }}
          >
            <MessageSquare size={15} />
          </button>
        </div>

        {/* Tags popover */}
        {canvasTagsOpen && (
          <>
            <div className="fixed inset-0 z-[9]" onClick={() => setCanvasTagsOpen(false)} />
            <div
              className="absolute top-16 left-16 z-[11] rounded-xl p-3 min-w-48 max-w-72"
              style={{
                ...frostedStyle,
                background: dark ? 'rgba(14,14,14,0.95)' : 'rgba(255,255,255,0.97)',
              }}
            >
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: dark ? '#333333' : '#aaaaaa' }}>
                tags
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg"
                    style={{ background: dark ? 'rgba(25,25,25,0.9)' : 'rgba(240,240,245,0.9)', color: dark ? '#808080' : '#666666' }}
                  >
                    {tag}
                    <button onClick={() => handleRemoveTag(i)} className="hover:opacity-70 transition-opacity" style={{ color: dark ? '#444444' : '#bbbbbb' }}>
                      <X size={9} />
                    </button>
                  </span>
                ))}
                {tags.length === 0 && <span className="text-[11px]" style={{ color: dark ? '#333333' : '#bbbbbb' }}>no tags yet</span>}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { handleAddTag(e); if (e.key === 'Escape') setCanvasTagsOpen(false) }}
                placeholder="type + enter"
                autoFocus
                className="bg-transparent border-none outline-none text-[11px] w-full py-1 px-1 rounded-md"
                style={{ color: dark ? '#808080' : '#555555', background: dark ? 'rgba(25,25,25,0.5)' : 'rgba(240,240,245,0.5)' }}
              />
            </div>
          </>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Moodboard editor */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full" style={{ background: dark ? '#0a0a0a' : '#f5f3ee' }}>
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: dark ? '#c4a759' : '#8b7a3d', opacity: 0.4, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-[11px] tracking-wide" style={{ color: dark ? '#2a2a2a' : '#bbbbbb' }}>loading moodboard</span>
                </div>
              </div>
            }>
              <MoodboardEditor
                initialData={content}
                onChange={handleMoodboardChange}
                dark={dark}
                generating={streaming}
                onGenerate={(topic) => {
                  const prompt = `Build a moodboard about "${topic}". Use search_images to find 6-8 high-quality images. Search Pinterest first (site:pinterest.com). Add each image with a short caption (2-6 words). Add 1-2 text cards with key concepts.`
                  sendMessage(prompt)
                }}
              />
            </Suspense>
          </div>

          {/* Chat sidebar */}
          {chatOpen && (
            <div
              className="flex-shrink-0 h-full flex flex-col"
              style={{
                width: Math.min(chatWidth, 420),
                background: dark ? 'rgba(10,10,10,0.92)' : 'rgba(252,252,254,0.95)',
                backdropFilter: 'blur(24px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                borderLeft: `1px solid ${dark ? 'rgba(28,28,28,0.8)' : 'rgba(230,230,235,0.9)'}`,
              }}
            >
              <NoteSidebar
                chatOnly
                sidebarTab="chat"
                setSidebarTab={() => {}}
                messages={messages}
                streaming={streaming}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSendMessage={handleSendMessage}
                onChatKeyDown={handleChatKeyDown}
                lookups={[]}
              activeLookupId={null}
              onSetActiveLookup={() => {}}
              onDeleteLookup={() => {}}
                dark={dark}
                annotations={[]}
                content={content}
                editingAnnotation={null}
                editAnnotationContent=""
                onEditAnnotation={() => {}}
                onEditAnnotationChange={() => {}}
                onUpdateAnnotation={() => {}}
                onCancelEditAnnotation={() => {}}
                onDeleteAnnotation={() => {}}
                onClose={() => setChatOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-full p-8 pt-16 lg:pt-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <button onClick={() => navigate('/')} className="text-[#333333] hover:text-[#606060] transition-colors duration-200 p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === 'saving' && <span className="flex items-center gap-1.5 text-[#333333]"><Loader2 size={12} className="animate-spin" />saving...</span>}
            {saveStatus === 'saved' && <span className="flex items-center gap-1.5 text-[#333333]"><Check size={12} />saved</span>}
            {saveStatus === 'unsaved' && <span className="text-[#606060]">unsaved</span>}
          </div>
          {userVimAllowed && vimEnabled && mode === 'write' && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#191919] border border-[#1c1c1c] text-[#808080] tracking-wider select-none">
              {vimMode}
            </span>
          )}
          {userVimAllowed && (
            <button
              onClick={() => setVimEnabled(v => !v)}
              className={`group flex items-center gap-2 px-2.5 py-1 rounded-md text-xs transition-colors border ${
                vimEnabled
                  ? 'bg-[#191919] text-[#c4a759] border-[#2a2a2a]'
                  : 'bg-[#111111] text-[#606060] border-[#1c1c1c] hover:text-[#d4d4d4] hover:border-[#2a2a2a]'
              }`}
              title="Toggle vim mode"
            >
              <span>vim</span>
              <span className="text-[#333333] transition-colors group-hover:text-[#505050]">⌘J</span>
            </button>
          )}
          <button
            onClick={() => setMode(m => m === 'write' ? 'read' : 'write')}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs transition-colors text-[#606060] hover:text-[#d4d4d4] bg-[#111111] border border-[#1c1c1c] hover:border-[#2a2a2a]"
          >
            <span>{mode === 'write' ? 'writing' : 'reading'}</span>
            <span className="text-[#333333]">⌘E</span>
          </button>
          {!isCanvas && !isMoodboard && (
            <button
              onClick={() => api.download(`/notes/${id}/export/pdf`)}
              className="p-2 rounded-md transition-colors text-[#333333] hover:text-[#606060]"
              title="Export as PDF"
            >
              <Download size={18} />
            </button>
          )}
          <div className="relative">
            {!shareToken ? (
              <button
                onClick={handleShare}
                className="p-2 rounded-md transition-colors text-[#333333] hover:text-[#606060]"
                title="Share note"
              >
                <Share2 size={18} />
              </button>
            ) : (
              <button
                onClick={() => setShareMenuOpen(s => !s)}
                className="p-2 rounded-md transition-colors text-[#c4a759] bg-[#191919]"
                title="Sharing enabled"
              >
                <Share2 size={18} />
              </button>
            )}
            {shareMenuOpen && shareToken && (
              <>
              <div className="fixed inset-0 z-40" onClick={() => setShareMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-[#111111] border border-[#1c1c1c] rounded-lg shadow-xl z-50 w-56 py-1">
                <button
                  onClick={() => { handleCopyShareLink(); setShareMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#d4d4d4] hover:bg-[#191919] transition-colors"
                >
                  <Link2 size={13} />
                  {shareCopied ? 'copied!' : 'copy share link'}
                </button>
                <button
                  onClick={handleUnshare}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-[#191919] transition-colors"
                >
                  <Link2Off size={13} />
                  stop sharing
                </button>
              </div>
              </>
            )}
          </div>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`p-2 rounded-md transition-colors ${chatOpen ? 'bg-[#191919] text-[#d4d4d4]' : 'text-[#333333] hover:text-[#606060]'}`}
            title="AI Chat"
          >
            <MessageSquare size={18} />
          </button>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onFocus={() => setMode('write')}
          placeholder="untitled"
          className="text-2xl font-light bg-transparent border-none outline-none text-[#d4d4d4] placeholder-[#333333] mb-2 flex-shrink-0 w-full tracking-tight"
        />

        {/* Tags */}
        <div className="flex items-center gap-2 mb-4 flex-shrink-0 flex-wrap">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[#191919] text-[#606060]">
              {tag}
              <button onClick={() => handleRemoveTag(i)} className="text-[#333333] hover:text-[#606060] transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            onFocus={() => setMode('write')}
            placeholder="add tag..."
            className="text-xs bg-transparent border-none outline-none text-[#606060] placeholder-[#333333] w-20"
          />
        </div>

        {/* Main content area */}
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Editor / Reader */}
          <div className="flex-1 min-h-0 min-w-0">
            {mode === 'write' ? (
              vimEnabled ? (
                <Suspense fallback={
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="start writing..."
                    className="bg-[#111111] border border-[#1c1c1c] rounded-lg w-full h-full p-4 text-sm text-[#d4d4d4] placeholder-[#333333] resize-none outline-none focus:border-[#333333] transition-colors"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: editorFontSize }}
                  />
                }>
                  <VimEditor
                    ref={vimEditorRef}
                    initialContent={content}
                    onChange={handleContentChange}
                    onVimModeChange={setVimMode}
                    onSave={handleVimSave}
                    onQuit={handleVimQuit}
                    onSearchNotes={handleSearchNotes}
                    dark={dark}
                    fontSize={editorFontSize}
                    className="vim-editor-wrapper w-full h-full"
                  />
                </Suspense>
              ) : (
                <textarea
                  ref={editorRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="start writing..."
                  className="bg-[#111111] border border-[#1c1c1c] rounded-lg w-full h-full p-4 text-sm text-[#d4d4d4] placeholder-[#333333] resize-none outline-none focus:border-[#333333] transition-colors"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: editorFontSize }}
                />
              )
            ) : (
              <div
                className="note-prose bg-[#111111] border border-[#1c1c1c] rounded-lg h-full p-5 overflow-y-auto cursor-text"
                style={{ fontSize: editorFontSize }}
                onClick={handleReadModeClick}
                onMouseUp={handleProseMouseUp}
                onContextMenu={handleProseContextMenu}
              >
                {content ? <MarkdownRenderer ref={proseRef} content={content} noteMap={noteMap} enableWikiLinks /> : <p className="text-[#333333] text-sm italic">nothing here yet.</p>}
              </div>
            )}
          </div>

          {/* Chat sidebar */}
          {chatOpen && (
            <div className="flex flex-shrink-0" style={{ width: chatWidth }}>
              <div
                onMouseDown={handleDragStart}
                className="w-2 cursor-col-resize flex items-center justify-center mx-1 group"
                title="Drag to resize"
              >
                <div className="w-px h-8 bg-[#1c1c1c] group-hover:bg-[#2a2a2a] transition-colors rounded-full" />
              </div>
              <NoteSidebar
                sidebarTab={sidebarTab}
                setSidebarTab={setSidebarTab}
                messages={messages}
                streaming={streaming}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSendMessage={handleSendMessage}
                onChatKeyDown={handleChatKeyDown}
                lookups={lookups}
                activeLookupId={activeLookupId}
                onSetActiveLookup={setActiveLookupId}
                onDeleteLookup={handleDeleteLookup}
                dark={dark}
                annotations={annotations}
                content={content}
                editingAnnotation={editingAnnotation}
                editAnnotationContent={editAnnotationContent}
                onEditAnnotation={(annId, annContent) => { setEditingAnnotation(annId); setEditAnnotationContent(annContent) }}
                onEditAnnotationChange={setEditAnnotationContent}
                onUpdateAnnotation={handleUpdateAnnotation}
                onCancelEditAnnotation={() => setEditingAnnotation(null)}
                onDeleteAnnotation={handleDeleteAnnotation}
                linkedNotes={linkedNotes}
                suggestions={suggestions}
                onAddLink={handleAddLink}
                onRemoveLink={handleRemoveLink}
                noteId={parseInt(id)}
                insights={insights}
                insightsLoading={insightsLoading}
                onAddInsightTag={handleAddInsightTag}
                onCreateFlashcard={handleCreateFlashcard}
                onClose={() => setChatOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Selection toolbar */}
      {selectionToolbar && mode === 'read' && !selectionContext && (
        <SelectionToolbar
          position={{ x: selectionToolbar.x, y: selectionToolbar.y }}
          onAction={handleSelectionAction}
          onDismiss={() => setSelectionToolbar(null)}
        />
      )}

      {/* Context menu */}
      {selectionContext && selectionToolbar && mode === 'read' && (
        <ContextMenu
          x={selectionContext.x}
          y={selectionContext.y}
          onClose={() => setSelectionContext(null)}
          items={[
            { id: 'annotate', icon: Highlighter, label: 'annotate', action: () => handleSelectionAction('annotate') },
            { id: 'research', icon: Search, label: 'research', action: () => handleSelectionAction('research') },
            { id: 'flashcards', icon: Layers, label: 'generate cards', action: () => handleSelectionAction('flashcards') },
            { separator: true },
            { id: 'summarize', icon: FileText, label: 'summarize', action: () => handleSelectionAction('summarize') },
            { id: 'define', icon: BookOpen, label: 'define', action: () => handleSelectionAction('define') },
          ]}
        />
      )}

      {/* Annotation editor modal */}
      {annotationEditor && (
        <AnnotationEditor
          selectedText={annotationEditor.text}
          onSave={handleSaveAnnotation}
          onCancel={() => setAnnotationEditor(null)}
        />
      )}
    </Layout>
  )
}
