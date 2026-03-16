import { useState, useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'

function ScoreDisplay({ score }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-6xl font-light text-[#d4d4d4]">{score}</span>
      <span className="text-sm text-[#333333] mt-1">/ 100</span>
    </div>
  )
}

export default function Feynman() {
  const [activeTab, setActiveTab] = useState('new')

  // New session state
  const [topic, setTopic] = useState('')
  const [noteId, setNoteId] = useState('')
  const [explanation, setExplanation] = useState('')
  const [notes, setNotes] = useState([])
  const [evaluating, setEvaluating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  // History state
  const [sessions, setSessions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const data = await api.get('/notes')
        setNotes(Array.isArray(data) ? data : data.results || [])
      } catch (err) {
        console.error('Failed to fetch notes:', err)
      }
    }
    fetchNotes()
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory()
    }
  }, [activeTab])

  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await api.get('/feynman/sessions')
      setSessions(Array.isArray(data) ? data : data.results || [])
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleEvaluate = async () => {
    if (!topic.trim() || !explanation.trim()) {
      setError('please provide both a topic and an explanation.')
      return
    }
    setError('')
    setEvaluating(true)
    setResult(null)
    try {
      const payload = { topic: topic.trim(), explanation: explanation.trim() }
      if (noteId) payload.note_id = parseInt(noteId)
      const data = await api.post('/feynman/sessions', payload)
      setResult(data)
    } catch (err) {
      setError(err.message || 'evaluation failed. please try again.')
    } finally {
      setEvaluating(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"><div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#d4d4d4] mb-8 tracking-tight">feynman</h1>

        {/* Tabs */}
        <div className="flex border-b border-[#1c1c1c] mb-8">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === 'new'
                ? 'border-[#d4d4d4] text-[#d4d4d4]'
                : 'border-transparent text-[#333333] hover:text-[#606060]'
            }`}
          >
            new session
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-[#d4d4d4] text-[#d4d4d4]'
                : 'border-transparent text-[#333333] hover:text-[#606060]'
            }`}
          >
            history
          </button>
        </div>

        {/* New Session Tab */}
        {activeTab === 'new' && (
          <div className="space-y-5">
            {error && (
              <div className="text-[#884444] text-sm rounded-md px-4 py-3 border border-[#1c1c1c] bg-[#111111]">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-[#606060] mb-1.5">topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="what concept are you explaining?"
                className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-[#606060] mb-1.5">reference note (optional)</label>
              <select
                value={noteId}
                onChange={(e) => setNoteId(e.target.value)}
                className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
              >
                <option value="">no reference note</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-[#606060] mb-1.5">your explanation</label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="explain the concept as if teaching it to someone who has never heard of it..."
                rows={12}
                className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full resize-y"
                style={{ minHeight: '300px' }}
              />
            </div>

            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-6 py-2.5 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {evaluating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />
                  evaluating...
                </>
              ) : (
                'evaluate'
              )}
            </button>

            {/* Results */}
            {result && (
              <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-6 mt-6 space-y-8 animate-fade-in">
                {/* Score */}
                <div className="text-center py-4">
                  <ScoreDisplay score={result.score ?? 0} />
                </div>

                {/* Strengths */}
                {result.strengths && result.strengths.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">strengths</h3>
                    <ul className="space-y-2">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-[#606060]">
                          <span className="text-[#333333] mr-2">&mdash;</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Weaknesses */}
                {result.weaknesses && result.weaknesses.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">areas for improvement</h3>
                    <ul className="space-y-2">
                      {result.weaknesses.map((w, i) => (
                        <li key={i} className="text-sm text-[#606060]">
                          <span className="text-[#333333] mr-2">&mdash;</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Feedback */}
                {result.feedback && (
                  <div>
                    <h3 className="text-sm font-semibold text-[#d4d4d4] mb-2">feedback</h3>
                    <p className="text-sm text-[#606060] leading-relaxed italic">{result.feedback}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            {historyLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse bg-[#111111] rounded-lg p-5">
                    <div className="h-5 rounded w-3/4 mb-3 bg-[#191919]" />
                    <div className="h-4 rounded w-1/3 bg-[#191919]" />
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <p className="text-[#606060]">no sessions yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-in">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 cursor-pointer hover:border-[#2a2a2a] transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm text-[#606060] truncate pr-2">{session.topic}</h3>
                      <span className="text-lg font-semibold text-[#d4d4d4] flex-shrink-0">
                        {session.score}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#333333]">{formatDate(session.created_at)}</span>
                      <ChevronRight size={14} className="text-[#333333] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Session detail modal */}
            {selectedSession && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.8)]"
                onClick={() => setSelectedSession(null)}
              >
                <div
                  className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-semibold text-[#d4d4d4]">{selectedSession.topic}</h2>
                    <button onClick={() => setSelectedSession(null)} className="text-[#333333] hover:text-[#606060] transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="text-center mb-8">
                    <ScoreDisplay score={selectedSession.score ?? 0} />
                    <p className="text-xs text-[#333333] mt-3">{formatDate(selectedSession.created_at)}</p>
                  </div>

                  {selectedSession.explanation && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-[#d4d4d4] mb-2">your explanation</h3>
                      <p className="text-sm text-[#606060] leading-relaxed whitespace-pre-wrap">{selectedSession.explanation}</p>
                    </div>
                  )}

                  {selectedSession.strengths && selectedSession.strengths.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">strengths</h3>
                      <ul className="space-y-2">
                        {selectedSession.strengths.map((s, i) => (
                          <li key={i} className="text-sm text-[#606060]">
                            <span className="text-[#333333] mr-2">&mdash;</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedSession.weaknesses && selectedSession.weaknesses.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">areas for improvement</h3>
                      <ul className="space-y-2">
                        {selectedSession.weaknesses.map((w, i) => (
                          <li key={i} className="text-sm text-[#606060]">
                            <span className="text-[#333333] mr-2">&mdash;</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedSession.feedback && (
                    <div>
                      <h3 className="text-sm font-semibold text-[#d4d4d4] mb-2">feedback</h3>
                      <p className="text-sm text-[#606060] leading-relaxed italic">{selectedSession.feedback}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </Layout>
  )
}
