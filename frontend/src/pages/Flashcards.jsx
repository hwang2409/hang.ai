import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Sparkles, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, RotateCcw, AlertTriangle, Download } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import ContextMenu from '../components/ContextMenu'

export default function Flashcards() {
  const navigate = useNavigate()
  const [flashcards, setFlashcards] = useState([])
  const [stats, setStats] = useState({ total: 0, due_today: 0, mastered: 0, learning: 0 })
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState([])

  // Weak spots
  const [weakSpots, setWeakSpots] = useState(null)
  const [weakOpen, setWeakOpen] = useState(false)

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [genNoteId, setGenNoteId] = useState('')
  const [genCount, setGenCount] = useState(10)
  const [generating, setGenerating] = useState(false)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newFront, setNewFront] = useState('')
  const [newBack, setNewBack] = useState('')
  const [newNoteId, setNewNoteId] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  // Generate results
  const [skippedCards, setSkippedCards] = useState([])

  // Context menu
  const [contextMenu, setContextMenu] = useState(null) // { x, y, cardId }

  // Inline editing
  const [editingId, setEditingId] = useState(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')

  const fetchAll = async () => {
    try {
      const [cardsData, statsData, notesData, weakSpotsData] = await Promise.all([
        api.get('/flashcards'),
        api.get('/flashcards/stats'),
        api.get('/notes'),
        api.get('/flashcards/weak-spots'),
      ])
      setFlashcards(Array.isArray(cardsData) ? cardsData : cardsData.results || [])
      setStats(statsData)
      setNotes(Array.isArray(notesData) ? notesData : notesData.results || [])
      setWeakSpots(weakSpotsData)
    } catch (err) {
      console.error('Failed to fetch flashcards:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const handleGenerate = async () => {
    if (!genNoteId) return
    setGenerating(true)
    setSkippedCards([])
    try {
      const result = await api.post('/flashcards/generate', { note_id: parseInt(genNoteId), count: genCount })
      await fetchAll()
      if (result.skipped && result.skipped.length > 0) {
        setSkippedCards(result.skipped)
      } else {
        setShowGenerate(false)
        setGenNoteId('')
        setGenCount(10)
      }
    } catch (err) {
      console.error('Failed to generate flashcards:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newFront.trim() || !newBack.trim()) return
    setCreateLoading(true)
    setCreateError('')
    try {
      const payload = { front: newFront, back: newBack }
      if (newNoteId) payload.note_id = parseInt(newNoteId)
      await api.post('/flashcards', payload)
      setNewFront('')
      setNewBack('')
      setNewNoteId('')
      setShowCreate(false)
      await fetchAll()
    } catch (err) {
      if (err?.message?.toLowerCase().includes('similar') && err?.message?.toLowerCase().includes('already exists')) {
        setCreateError('a similar flashcard already exists')
      } else {
        console.error('Failed to create flashcard:', err)
      }
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSaveEdit = async (cardId) => {
    try {
      await api.put(`/flashcards/${cardId}`, { front: editFront, back: editBack })
      setEditingId(null)
      await fetchAll()
    } catch (err) {
      console.error('Failed to update flashcard:', err)
    }
  }

  const handleDelete = async (cardId) => {
    try {
      await api.delete(`/flashcards/${cardId}`)
      setFlashcards((prev) => prev.filter((c) => c.id !== cardId))
      setStats((prev) => ({ ...prev, total: prev.total - 1 }))
    } catch (err) {
      console.error('Failed to delete flashcard:', err)
    }
  }

  const handleCardContext = (e, cardId) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, cardId })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"><div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#d4d4d4] mb-8 tracking-tight">flashcards</h1>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.total}</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">total</div>
          </div>
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.due_today}</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">due today</div>
          </div>
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.mastered}</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">mastered</div>
          </div>
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.learning}</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">learning</div>
          </div>
        </div>

        {/* Weak spots (collapsed by default) */}
        {weakSpots && weakSpots.total > 0 && (
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-5 mb-8">
            <button
              onClick={() => setWeakOpen(o => !o)}
              className="flex items-center gap-2 w-full text-left"
            >
              <AlertTriangle size={16} className="text-[#c4a759]" />
              <h3 className="text-sm font-semibold text-[#d4d4d4]">weak spots</h3>
              <span className="text-xs text-[#606060]">{weakSpots.total} card{weakSpots.total !== 1 ? 's' : ''} need attention</span>
              <ChevronDown size={14} className={`ml-auto text-[#333333] transition-transform duration-150 ${weakOpen ? '' : '-rotate-90'}`} />
            </button>
            {weakOpen && (
              <div className="space-y-3 mt-3">
                {weakSpots.groups.map((group) => (
                  <div key={group.note_id ?? 'unlinked'} className="border border-[#1c1c1c] rounded-md p-3">
                    <div className="flex items-center justify-between mb-2">
                      {group.note_id ? (
                        <button
                          onClick={() => navigate(`/notes/${group.note_id}`)}
                          className="text-sm text-[#c4a759] hover:text-[#d4b86a] transition-colors truncate"
                        >
                          {group.note_title}
                        </button>
                      ) : (
                        <span className="text-sm text-[#606060]">{group.note_title}</span>
                      )}
                      <span className="text-xs text-[#333333] flex-shrink-0 ml-2">
                        {group.cards.length} card{group.cards.length !== 1 ? 's' : ''} · avg ease {group.avg_ease.toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {group.cards.slice(0, 3).map((card) => (
                        <p key={card.id} className="text-xs text-[#606060] truncate">
                          {card.front}
                        </p>
                      ))}
                      {group.cards.length > 3 && (
                        <p className="text-xs text-[#333333]">+{group.cards.length - 3} more</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => navigate('/flashcards/study')}
            className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2"
          >
            <Play size={16} />
            study
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2"
          >
            <Sparkles size={16} />
            generate from note
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2"
          >
            {showCreate ? <ChevronUp size={16} /> : <Plus size={16} />}
            create card
          </button>
          <button
            onClick={() => api.download('/flashcards/export/anki')}
            className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2"
          >
            <Download size={16} />
            export to anki
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-5 mb-6">
            <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">create flashcard</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm text-[#606060] mb-1">front (question)</label>
                <textarea
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                  placeholder="enter the question..."
                  rows={2}
                  className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[#606060] mb-1">back (answer)</label>
                <textarea
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                  placeholder="enter the answer..."
                  rows={2}
                  className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[#606060] mb-1">link to note (optional)</label>
                <select
                  value={newNoteId}
                  onChange={(e) => setNewNoteId(e.target.value)}
                  className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
                >
                  <option value="">no linked note</option>
                  {notes.map((n) => (
                    <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={createLoading || !newFront.trim() || !newBack.trim()}
                className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {createLoading && <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />}
                create
              </button>
              {createError && (
                <p className="text-sm text-red-400 mt-2">{createError}</p>
              )}
            </form>
          </div>
        )}

        {/* Generate modal */}
        {showGenerate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.8)]"
            onClick={() => setShowGenerate(false)}
          >
            <div
              className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#d4d4d4]">generate flashcards from note</h2>
                <button onClick={() => setShowGenerate(false)} className="text-[#333333] hover:text-[#606060] transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#606060] mb-1.5">select note</label>
                  <select
                    value={genNoteId}
                    onChange={(e) => setGenNoteId(e.target.value)}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
                  >
                    <option value="">choose a note...</option>
                    {notes.map((n) => (
                      <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-[#606060] mb-1.5">number of cards</label>
                  <input
                    type="number"
                    value={genCount}
                    onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
                    min={1}
                    max={50}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
                  />
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating || !genNoteId}
                  className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2.5 transition-colors text-sm w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />
                      generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      generate
                    </>
                  )}
                </button>

                {skippedCards.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-[#606060] mb-2">
                      {skippedCards.length} duplicate{skippedCards.length !== 1 ? 's' : ''} skipped:
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {skippedCards.map((s, i) => (
                        <div key={i} className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-md px-3 py-2 text-xs">
                          <p className="text-[#d4d4d4] truncate">{s.front}</p>
                          <span className="text-[#333333]">
                            {s.reason === 'semantic_duplicate' ? 'semantic match' : 'exact match'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setShowGenerate(false)
                        setSkippedCards([])
                        setGenNoteId('')
                        setGenCount(10)
                      }}
                      className="mt-3 border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm w-full"
                    >
                      close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Flashcards list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-[#111111] rounded-lg p-4">
                <div className="h-4 rounded w-3/4 mb-2 bg-[#191919]" />
                <div className="h-3 rounded w-1/2 bg-[#191919]" />
              </div>
            ))}
          </div>
        ) : flashcards.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <p className="text-[#606060] mb-2">no flashcards yet.</p>
            <p className="text-[#333333] text-sm">create flashcards manually or generate them from your notes.</p>
          </div>
        ) : (
          <div className="space-y-3 stagger-in">
            {flashcards.map((card) => (
              <div
                key={card.id}
                onContextMenu={(e) => handleCardContext(e, card.id)}
                className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4"
              >
                {editingId === card.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editFront}
                      onChange={(e) => setEditFront(e.target.value)}
                      rows={2}
                      className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full resize-none"
                    />
                    <textarea
                      value={editBack}
                      onChange={(e) => setEditBack(e.target.value)}
                      rows={2}
                      className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(card.id)}
                        className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-3 py-1.5 transition-colors text-sm"
                      >
                        save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-3 py-1.5 transition-colors text-sm"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#d4d4d4] truncate">{card.front}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {card.note_title && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[#191919] text-[#606060]">{card.note_title}</span>
                        )}
                        {card.next_review && (
                          <span className="text-xs text-[#333333]">next: {formatDate(card.next_review)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(card.id)
                          setEditFront(card.front)
                          setEditBack(card.back)
                        }}
                        className="p-1.5 text-[#333333] hover:text-[#606060] rounded-md transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(card.id)}
                        className="p-1.5 text-[#333333] hover:text-[#606060] rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flashcard context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'edit',
              icon: Pencil,
              label: 'edit card',
              action: () => {
                const card = flashcards.find((c) => c.id === contextMenu.cardId)
                if (card) {
                  setEditingId(card.id)
                  setEditFront(card.front)
                  setEditBack(card.back)
                }
              },
            },
            {
              id: 'reset',
              icon: RotateCcw,
              label: 'reset progress',
              confirm: true,
              confirmLabel: 'click to confirm',
              action: async () => {
                try {
                  await api.post(`/flashcards/${contextMenu.cardId}/review`, { quality: 0 })
                  await fetchAll()
                } catch (err) {
                  console.error('Failed to reset flashcard:', err)
                }
              },
            },
            { separator: true },
            {
              id: 'delete',
              icon: Trash2,
              label: 'delete card',
              variant: 'danger',
              confirm: true,
              confirmLabel: 'click to confirm',
              action: () => handleDelete(contextMenu.cardId),
            },
          ]}
        />
      )}
      </div>
    </Layout>
  )
}
