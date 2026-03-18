import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, MessageCircle, Send, Square } from 'lucide-react'
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

function EvaluationDisplay({ data }) {
  if (!data) return null
  return (
    <div className="space-y-8">
      {data.score != null && (
        <div className="text-center py-4">
          <ScoreDisplay score={data.score} />
        </div>
      )}
      {data.strengths?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">strengths</h3>
          <ul className="space-y-2">
            {data.strengths.map((s, i) => (
              <li key={i} className="text-sm text-[#606060]">
                <span className="text-[#333333] mr-2">&mdash;</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.weaknesses?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#d4d4d4] mb-3">areas for improvement</h3>
          <ul className="space-y-2">
            {data.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-[#606060]">
                <span className="text-[#333333] mr-2">&mdash;</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.feedback && (
        <div>
          <h3 className="text-sm font-semibold text-[#d4d4d4] mb-2">feedback</h3>
          <p className="text-sm text-[#606060] leading-relaxed italic">{data.feedback}</p>
        </div>
      )}
    </div>
  )
}

export default function Feynman() {
  const [activeTab, setActiveTab] = useState('explain')

  // Explain (classic Feynman) state
  const [topic, setTopic] = useState('')
  const [noteId, setNoteId] = useState('')
  const [explanation, setExplanation] = useState('')
  const [notes, setNotes] = useState([])
  const [evaluating, setEvaluating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  // Socratic state
  const [socTopic, setSocTopic] = useState('')
  const [socNoteId, setSocNoteId] = useState('')
  const [socSession, setSocSession] = useState(null) // active socratic session
  const [socReply, setSocReply] = useState('')
  const [socLoading, setSocLoading] = useState(false)
  const [socError, setSocError] = useState('')
  const messagesEndRef = useRef(null)

  // History state
  const [sessions, setSessions] = useState([])
  const [socraticSessions, setSocraticSessions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [selectedSocratic, setSelectedSocratic] = useState(null)

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
    if (activeTab === 'history') fetchHistory()
  }, [activeTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [socSession?.messages])

  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const [feynmanData, socraticData] = await Promise.all([
        api.get('/feynman/sessions'),
        api.get('/feynman/socratic'),
      ])
      setSessions(Array.isArray(feynmanData) ? feynmanData : feynmanData.results || [])
      setSocraticSessions(Array.isArray(socraticData) ? socraticData : socraticData.results || [])
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  // --- Classic Feynman ---
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

  // --- Socratic ---
  const handleStartSocratic = async () => {
    if (!socTopic.trim()) {
      setSocError('please provide a topic.')
      return
    }
    setSocError('')
    setSocLoading(true)
    try {
      const payload = { topic: socTopic.trim() }
      if (socNoteId) payload.note_id = parseInt(socNoteId)
      const data = await api.post('/feynman/socratic', payload)
      setSocSession(data)
    } catch (err) {
      setSocError(err.message || 'failed to start session.')
    } finally {
      setSocLoading(false)
    }
  }

  const handleSocraticReply = async () => {
    if (!socReply.trim() || !socSession) return
    setSocLoading(true)
    setSocError('')
    const replyText = socReply.trim()
    setSocReply('')
    // Optimistically add user message
    setSocSession(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'user', content: replyText }],
    }))
    try {
      const data = await api.post(`/feynman/socratic/${socSession.id}/reply`, { message: replyText })
      setSocSession(data)
    } catch (err) {
      setSocError(err.message || 'failed to send reply.')
    } finally {
      setSocLoading(false)
    }
  }

  const handleFinishSocratic = async () => {
    if (!socSession) return
    setSocLoading(true)
    try {
      const data = await api.post(`/feynman/socratic/${socSession.id}/finish`)
      setSocSession(data)
    } catch (err) {
      setSocError(err.message || 'failed to finish session.')
    } finally {
      setSocLoading(false)
    }
  }

  const handleNewSocratic = () => {
    setSocSession(null)
    setSocTopic('')
    setSocNoteId('')
    setSocReply('')
    setSocError('')
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  const tabClass = (tab) =>
    `px-4 py-2.5 text-sm border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-[#d4d4d4] text-[#d4d4d4]'
        : 'border-transparent text-[#333333] hover:text-[#606060]'
    }`

  // Merge history for display
  const allHistory = [
    ...sessions.map(s => ({ ...s, mode: 'explain' })),
    ...socraticSessions.map(s => ({ ...s, mode: 'socratic' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"><div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#d4d4d4] mb-8 tracking-tight">feynman</h1>

        {/* Tabs */}
        <div className="flex border-b border-[#1c1c1c] mb-8">
          <button onClick={() => setActiveTab('explain')} className={tabClass('explain')}>explain</button>
          <button onClick={() => setActiveTab('socratic')} className={tabClass('socratic')}>socratic</button>
          <button onClick={() => setActiveTab('history')} className={tabClass('history')}>history</button>
        </div>

        {/* ========== EXPLAIN TAB ========== */}
        {activeTab === 'explain' && (
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

            {result && (
              <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-6 mt-6 animate-fade-in">
                <EvaluationDisplay data={result} />
              </div>
            )}
          </div>
        )}

        {/* ========== SOCRATIC TAB ========== */}
        {activeTab === 'socratic' && (
          <div>
            {!socSession ? (
              /* --- Start form --- */
              <div className="space-y-5">
                <p className="text-sm text-[#606060] leading-relaxed mb-2">
                  the AI will probe your understanding through questions. answer honestly — it adapts to find your knowledge gaps.
                </p>

                {socError && (
                  <div className="text-[#884444] text-sm rounded-md px-4 py-3 border border-[#1c1c1c] bg-[#111111]">
                    {socError}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#606060] mb-1.5">topic</label>
                  <input
                    type="text"
                    value={socTopic}
                    onChange={(e) => setSocTopic(e.target.value)}
                    placeholder="what topic should the AI quiz you on?"
                    className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
                    onKeyDown={(e) => e.key === 'Enter' && !socLoading && handleStartSocratic()}
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#606060] mb-1.5">reference note (optional)</label>
                  <select
                    value={socNoteId}
                    onChange={(e) => setSocNoteId(e.target.value)}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
                  >
                    <option value="">no reference note</option>
                    {notes.map((n) => (
                      <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleStartSocratic}
                  disabled={socLoading}
                  className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-6 py-2.5 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {socLoading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />
                      starting...
                    </>
                  ) : (
                    <>
                      <MessageCircle size={14} />
                      start dialogue
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* --- Active / completed session --- */
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[#d4d4d4]">{socSession.topic}</h2>
                    <span className="text-xs text-[#333333]">
                      {socSession.question_count} question{socSession.question_count !== 1 ? 's' : ''}
                      {socSession.status === 'completed' && ' — completed'}
                    </span>
                  </div>
                  {socSession.status === 'completed' && (
                    <button
                      onClick={handleNewSocratic}
                      className="text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors border border-[#1c1c1c] rounded-md px-3 py-1.5"
                    >
                      new session
                    </button>
                  )}
                </div>

                {socError && (
                  <div className="text-[#884444] text-sm rounded-md px-4 py-3 border border-[#1c1c1c] bg-[#111111]">
                    {socError}
                  </div>
                )}

                {/* Messages */}
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {socSession.messages?.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-[#1a1a2e] text-[#d4d4d4] rounded-br-sm'
                            : 'bg-[#111111] border border-[#1c1c1c] text-[#a0a0a0] rounded-bl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {socLoading && (
                    <div className="flex justify-start">
                      <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-[#333333] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 bg-[#333333] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 bg-[#333333] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply input or evaluation */}
                {socSession.status === 'active' ? (
                  <div className="flex gap-2 items-end pt-2">
                    <textarea
                      value={socReply}
                      onChange={(e) => setSocReply(e.target.value)}
                      placeholder="type your answer..."
                      rows={2}
                      className="flex-1 bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (!socLoading) handleSocraticReply()
                        }
                      }}
                      disabled={socLoading}
                    />
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={handleSocraticReply}
                        disabled={socLoading || !socReply.trim()}
                        className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white rounded-md p-2 transition-colors disabled:opacity-30"
                        title="send reply"
                      >
                        <Send size={16} />
                      </button>
                      <button
                        onClick={handleFinishSocratic}
                        disabled={socLoading}
                        className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#333333] rounded-md p-2 transition-colors disabled:opacity-30"
                        title="end & evaluate"
                      >
                        <Square size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Completed — show evaluation */
                  <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-6 mt-4 animate-fade-in">
                    <EvaluationDisplay data={socSession} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========== HISTORY TAB ========== */}
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
            ) : allHistory.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <p className="text-[#606060]">no sessions yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-in">
                {allHistory.map((session) => (
                  <div
                    key={`${session.mode}-${session.id}`}
                    onClick={async () => {
                      if (session.mode === 'socratic') {
                        try {
                          const full = await api.get(`/feynman/socratic/${session.id}`)
                          setSelectedSocratic(full)
                        } catch (err) {
                          console.error(err)
                        }
                      } else {
                        try {
                          const full = await api.get(`/feynman/sessions/${session.id}`)
                          setSelectedSession(full)
                        } catch (err) {
                          console.error(err)
                        }
                      }
                    }}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 cursor-pointer hover:border-[#2a2a2a] transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {session.mode === 'socratic' && (
                          <MessageCircle size={12} className="text-[#333333] flex-shrink-0" />
                        )}
                        <h3 className="text-sm text-[#606060] truncate">{session.topic}</h3>
                      </div>
                      <span className="text-lg font-semibold text-[#d4d4d4] flex-shrink-0 ml-2">
                        {session.score ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#333333]">{formatDate(session.created_at)}</span>
                        <span className="text-xs text-[#222222]">
                          {session.mode === 'socratic' ? 'socratic' : 'explain'}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-[#333333] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Explain session detail modal */}
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

                  <EvaluationDisplay data={selectedSession} />
                </div>
              </div>
            )}

            {/* Socratic session detail modal */}
            {selectedSocratic && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.8)]"
                onClick={() => setSelectedSocratic(null)}
              >
                <div
                  className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MessageCircle size={14} className="text-[#333333]" />
                      <h2 className="text-sm font-semibold text-[#d4d4d4]">{selectedSocratic.topic}</h2>
                    </div>
                    <button onClick={() => setSelectedSocratic(null)} className="text-[#333333] hover:text-[#606060] transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  <p className="text-xs text-[#333333] mb-6">
                    {selectedSocratic.question_count} questions &middot; {formatDate(selectedSocratic.created_at)}
                  </p>

                  {/* Dialogue */}
                  <div className="space-y-3 mb-6">
                    {selectedSocratic.messages?.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-[#1a1a2e] text-[#d4d4d4] rounded-br-sm'
                              : 'bg-[#0d0d0d] border border-[#1c1c1c] text-[#a0a0a0] rounded-bl-sm'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedSocratic.status === 'completed' && selectedSocratic.score != null && (
                    <div className="border-t border-[#1c1c1c] pt-6">
                      <EvaluationDisplay data={selectedSocratic} />
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
