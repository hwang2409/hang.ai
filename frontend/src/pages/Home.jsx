import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, ExternalLink, Copy, PenTool, LayoutGrid, Upload, Folder, ChevronRight, ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import ContextMenu from '../components/ContextMenu'
import ImportModal from '../components/ImportModal'
import { useAuth } from '../contexts/AuthContext'

export default function Home() {
  const { user } = useAuth()
  const [notes, setNotes] = useState([])
  const [folders, setFolders] = useState([])
  const [expandedFolders, setExpandedFolders] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, noteId }
  const [showImport, setShowImport] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const createMenuRef = useRef(null)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  const fetchNotes = useCallback(async (query = '') => {
    try {
      if (query.trim()) {
        const data = await api.post('/search/hybrid', { query: query.trim(), limit: 30 })
        setNotes((data.results || []).map(r => ({
          id: r.id,
          title: r.title,
          preview: r.preview,
          type: r.type,
          tags: r.tags,
          updated_at: r.updated_at,
          match_type: r.match_type,
        })))
        setFolders([]) // hide folders during search
      } else {
        const [notesData, foldersData] = await Promise.all([
          api.get('/notes'),
          api.get('/notes/folders'),
        ])
        setNotes(Array.isArray(notesData) ? notesData : notesData.results || [])
        setFolders(Array.isArray(foldersData) ? foldersData : [])
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  // Close create menu on outside click
  useEffect(() => {
    if (!showCreateMenu) return
    const handleClick = (e) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target)) setShowCreateMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCreateMenu])

  const handleSearch = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchNotes(value)
    }, 300)
  }

  const handleNewNote = async () => {
    const noteType = user?.default_note_type || 'text'
    if (noteType === 'canvas') { handleNewCanvas(); return }
    if (noteType === 'moodboard') { handleNewMoodboard(); return }
    setCreating(true)
    try {
      const note = await api.post('/notes', { title: '', content: '' })
      navigate(`/notes/${note.id}`)
    } catch (err) {
      console.error('Failed to create note:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleNewCanvas = async () => {
    setCreating(true)
    try {
      const note = await api.post('/notes', { title: '', content: '', type: 'canvas' })
      navigate(`/notes/${note.id}`)
    } catch (err) {
      console.error('Failed to create canvas:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleNewMoodboard = async () => {
    setCreating(true)
    try {
      const note = await api.post('/notes', {
        title: '',
        content: JSON.stringify({ items: [], settings: { columns: 3, gap: 12 } }),
        type: 'moodboard',
      })
      navigate(`/notes/${note.id}`)
    } catch (err) {
      console.error('Failed to create moodboard:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (noteId) => {
    try {
      await api.delete(`/notes/${noteId}`)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  }

  const handleDeleteFolder = async (folderId) => {
    try {
      await api.delete(`/notes/folders/${folderId}`)
      setFolders((prev) => prev.filter((f) => f.id !== folderId))
      // Notes in the folder become loose (folder_id set to null on backend cascade or stay orphaned)
      setNotes((prev) => prev.map((n) => n.folder_id === folderId ? { ...n, folder_id: null } : n))
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }

  const handleDuplicate = async (noteId) => {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    try {
      const copy = await api.post('/notes', {
        title: `${note.title || 'untitled'} (copy)`,
        content: note.content || '',
        type: note.type || 'text',
      })
      setNotes((prev) => [copy, ...prev])
    } catch (err) {
      console.error('Failed to duplicate note:', err)
    }
  }

  const handleNoteContext = (e, noteId) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, noteId })
  }

  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    })
  }

  const truncate = (text, len = 150) => {
    if (!text) return ''
    return text.length > len ? text.slice(0, len) + '...' : text
  }

  // Group notes by folder
  const folderNotes = {} // folderId -> [notes]
  const looseNotes = []
  for (const note of notes) {
    if (note.folder_id) {
      if (!folderNotes[note.folder_id]) folderNotes[note.folder_id] = []
      folderNotes[note.folder_id].push(note)
    } else {
      looseNotes.push(note)
    }
  }

  // Only show folders that have notes
  const activeFolders = folders.filter((f) => folderNotes[f.id]?.length > 0)

  const renderNoteCard = (note) => (
    <div
      key={note.id}
      onClick={() => navigate(`/notes/${note.id}`)}
      onContextMenu={(e) => handleNoteContext(e, note.id)}
      className="group relative bg-[#111111] border border-[#1c1c1c] rounded-lg p-5 cursor-pointer hover:border-[#2a2a2a] transition-colors"
    >
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); handleDelete(note.id) }}
        className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 text-[#333333] hover:text-[#606060] transition-all duration-200 p-1.5 rounded-lg"
        title="Delete note"
      >
        <Trash2 size={14} />
      </button>

      {/* Preview image / Canvas pattern */}
      {note.type === 'canvas' ? (
        <div className="mb-3 -mx-5 -mt-5 rounded-t-lg overflow-hidden">
          <div className="canvas-card-pattern h-24 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <PenTool size={20} className="text-[#2a2a2a]" />
            </div>
          </div>
        </div>
      ) : note.type === 'moodboard' ? (
        <div className="mb-3 -mx-5 -mt-5 rounded-t-lg overflow-hidden">
          {note.preview_image_url ? (
            <img src={note.preview_image_url} alt="" className="w-full h-24 object-cover opacity-60" />
          ) : (
            <div className="canvas-card-pattern h-24 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <LayoutGrid size={20} className="text-[#2a2a2a]" />
              </div>
            </div>
          )}
        </div>
      ) : note.preview_image_url ? (
        <div className="mb-3 -mx-5 -mt-5 rounded-t-lg overflow-hidden">
          <img
            src={note.preview_image_url}
            alt=""
            className="w-full h-32 object-cover opacity-60"
          />
        </div>
      ) : null}

      {/* Title */}
      <h3 className="font-semibold text-[#d4d4d4] mb-1.5 truncate pr-6">
        {note.title || 'untitled'}
      </h3>

      {/* Content preview */}
      <p className="text-sm text-[#606060] mb-3 line-clamp-3">
        {note.type === 'canvas' ? 'canvas' : note.type === 'moodboard' ? 'moodboard' : truncate(note.preview)}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Tags */}
        <div className="flex gap-1.5 flex-wrap">
          {(note.tags || []).slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded bg-[#191919] text-[#606060]"
            >
              {typeof tag === 'string' ? tag : tag.name}
            </span>
          ))}
        </div>

        {/* Date */}
        <span className="text-xs text-[#333333] whitespace-nowrap ml-2">
          {formatDate(note.updated_at)}
        </span>
      </div>
    </div>
  )

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"><div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-text tracking-tight">notes</h1>
          <div className="flex items-center gap-2">
            {/* Create dropdown (import, canvas, moodboard) */}
            <div className="relative" ref={createMenuRef}>
              <button
                onClick={() => setShowCreateMenu(o => !o)}
                className="text-[#606060] hover:text-[#d4d4d4] border border-[#1c1c1c] hover:border-[#2a2a2a] rounded-md px-3 py-2 transition-colors text-sm flex items-center gap-1.5"
              >
                <Plus size={14} />
                <ChevronDown size={12} className={`transition-transform duration-150 ${showCreateMenu ? 'rotate-180' : ''}`} />
              </button>
              {showCreateMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-[#111111] border border-[#1c1c1c] rounded-lg py-1 z-30 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <button
                    onClick={() => { setShowImport(true); setShowCreateMenu(false) }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#999] hover:text-[#d4d4d4] hover:bg-[#161616] transition-colors rounded-md mx-0"
                  >
                    <Upload size={14} />
                    import
                  </button>
                  <div className="border-t border-[#1c1c1c] my-1 mx-3" />
                  <button
                    onClick={() => { handleNewCanvas(); setShowCreateMenu(false) }}
                    disabled={creating}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#999] hover:text-[#d4d4d4] hover:bg-[#161616] transition-colors disabled:opacity-50"
                  >
                    <PenTool size={14} />
                    new canvas
                  </button>
                  <button
                    onClick={() => { handleNewMoodboard(); setShowCreateMenu(false) }}
                    disabled={creating}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#999] hover:text-[#d4d4d4] hover:bg-[#161616] transition-colors disabled:opacity-50"
                  >
                    <LayoutGrid size={14} />
                    new moodboard
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleNewNote}
              disabled={creating}
              className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? (
                <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />
              ) : (
                <Plus size={16} />
              )}
              new note
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-8">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#333333]" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="search notes..."
            className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full pl-10 pr-16"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#333333] bg-[#191919] px-1.5 py-0.5 rounded border border-[#1c1c1c]">⌘K</kbd>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse bg-[#111111] rounded-lg p-5">
                <div className="h-5 rounded w-3/4 mb-3 bg-[#191919]" />
                <div className="h-4 rounded w-full mb-2 bg-[#191919]" />
                <div className="h-4 rounded w-2/3 bg-[#191919]" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          /* Empty state */
          <div className="text-center py-24 animate-fade-in">
            <p className="text-[#606060] mb-6">
              {search ? 'no notes found.' : 'no notes yet.'}
            </p>
            {!search && (
              <button
                onClick={handleNewNote}
                disabled={creating}
                className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm inline-flex items-center gap-2"
              >
                <Plus size={16} />
                new note
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Folders */}
            {activeFolders.map((folder) => (
              <div key={folder.id} className="group/folder">
                <button
                  onClick={() => toggleFolder(folder.id)}
                  className="flex items-center gap-2 mb-3 px-1 w-full text-left group/btn"
                >
                  <ChevronRight
                    size={14}
                    className={`text-[#333333] transition-transform duration-200 ${expandedFolders[folder.id] ? 'rotate-90' : ''}`}
                  />
                  <Folder size={15} className="text-[#606060]" />
                  <span className="text-sm font-medium text-[#d4d4d4]">{folder.name}</span>
                  <span className="text-xs text-[#333333] ml-1">{folderNotes[folder.id]?.length || 0}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                    className="ml-auto opacity-0 group-hover/folder:opacity-100 text-[#333333] hover:text-[#606060] transition-all p-1 rounded"
                    title="Delete folder"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
                {expandedFolders[folder.id] && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-7 stagger-in">
                    {(folderNotes[folder.id] || []).map(renderNoteCard)}
                  </div>
                )}
              </div>
            ))}

            {/* Loose notes */}
            {looseNotes.length > 0 && (
              <div>
                {activeFolders.length > 0 && (
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="text-xs text-[#333333] uppercase tracking-wider">notes</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-in">
                  {looseNotes.map(renderNoteCard)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'open',
              icon: ExternalLink,
              label: 'open note',
              action: () => navigate(`/notes/${contextMenu.noteId}`),
            },
            {
              id: 'duplicate',
              icon: Copy,
              label: 'duplicate',
              action: () => handleDuplicate(contextMenu.noteId),
            },
            { separator: true },
            {
              id: 'delete',
              icon: Trash2,
              label: 'delete',
              variant: 'danger',
              confirm: true,
              confirmLabel: 'click to confirm',
              action: () => handleDelete(contextMenu.noteId),
            },
          ]}
        />
      )}

      {/* Import modal */}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={(noteId) => {
          if (noteId) navigate(`/notes/${noteId}`)
          else fetchNotes()
        }}
      />
      </div>
    </Layout>
  )
}
