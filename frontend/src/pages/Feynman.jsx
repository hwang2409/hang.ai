import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, MessageCircle, Send, Square, Lightbulb, Eye, EyeOff, Check, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'

function ScoreDisplay({ score }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-6xl font-light text-text">{score}</span>
      <span className="text-sm text-text-muted mt-1">/ 100</span>
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
          <h3 className="text-sm font-semibold text-text mb-3">strengths</h3>
          <ul className="space-y-2">
            {data.strengths.map((s, i) => (
              <li key={i} className="text-sm text-text-secondary">
                <span className="text-text-muted mr-2">&mdash;</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.weaknesses?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text mb-3">areas for improvement</h3>
          <ul className="space-y-2">
            {data.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-text-secondary">
                <span className="text-text-muted mr-2">&mdash;</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.feedback && (
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">feedback</h3>
          <p className="text-sm text-text-secondary leading-relaxed italic">{data.feedback}</p>
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

  // Practice state
  const [pracTopic, setPracTopic] = useState('')
  const [pracNoteId, setPracNoteId] = useState('')
  const [pracDifficulty, setPracDifficulty] = useState('medium')
  const [pracProblem, setPracProblem] = useState(null)
  const [pracLoading, setPracLoading] = useState(false)
  const [pracAnswer, setPracAnswer] = useState('')
  const [pracResult, setPracResult] = useState(null)
  const [pracChecking, setPracChecking] = useState(false)
  const [pracHintsShown, setPracHintsShown] = useState(0)
  const [pracShowSolution, setPracShowSolution] = useState(false)
  const [pracError, setPracError] = useState('')

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

  // --- Practice ---
  const handleGenerateProblem = async () => {
    if (!pracTopic.trim()) { setPracError('please provide a topic.'); return }
    setPracError('')
    setPracLoading(true)
    setPracProblem(null)
    setPracResult(null)
    setPracAnswer('')
    setPracHintsShown(0)
    setPracShowSolution(false)
    try {
      const payload = { topic: pracTopic.trim(), difficulty: pracDifficulty }
      if (pracNoteId) payload.note_id = parseInt(pracNoteId)
      const data = await api.post('/feynman/practice', payload)
      setPracProblem(data)
    } catch (err) {
      setPracError(err.message || 'failed to generate problem.')
    } finally {
      setPracLoading(false)
    }
  }

  const handleCheckAnswer = async () => {
    if (!pracAnswer.trim() || !pracProblem) return
    setPracChecking(true)
    setPracError('')
    try {
      const data = await api.post('/feynman/practice/check', {
        problem: pracProblem.problem,
        student_answer: pracAnswer.trim(),
        answer: pracProblem.answer,
        solution: pracProblem.solution,
      })
      setPracResult(data)
    } catch (err) {
      setPracError(err.message || 'failed to check answer.')
    } finally {
      setPracChecking(false)
    }
  }

  const handleNewProblem = () => {
    setPracProblem(null)
    setPracResult(null)
    setPracAnswer('')
    setPracHintsShown(0)
    setPracShowSolution(false)
    setPracError('')
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
        ? 'border-text text-text'
        : 'border-transparent text-text-muted hover:text-text-secondary'
    }`

  // Merge history for display
  const allHistory = [
    ...sessions.map(s => ({ ...s, mode: 'explain' })),
    ...socraticSessions.map(s => ({ ...s, mode: 'socratic' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"><div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-text mb-8 tracking-tight">feynman</h1>

        {/* Tabs */}
        <div className="flex border-b border-border mb-8">
          <button onClick={() => setActiveTab('explain')} className={tabClass('explain')}>explain</button>
          <button onClick={() => setActiveTab('socratic')} className={tabClass('socratic')}>socratic</button>
          <button onClick={() => setActiveTab('practice')} className={tabClass('practice')}>practice</button>
          <button onClick={() => setActiveTab('history')} className={tabClass('history')}>history</button>
        </div>

        {/* ========== EXPLAIN TAB ========== */}
        {activeTab === 'explain' && (
          <div className="space-y-5">
            {error && (
              <div className="text-danger text-sm rounded-md px-4 py-3 border border-border bg-bg-secondary">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="what concept are you explaining?"
                className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">reference note (optional)</label>
              <select
                value={noteId}
                onChange={(e) => setNoteId(e.target.value)}
                className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full"
              >
                <option value="">no reference note</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">your explanation</label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="explain the concept as if teaching it to someone who has never heard of it..."
                rows={12}
                className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full resize-y"
                style={{ minHeight: '300px' }}
              />
            </div>

            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="bg-text text-bg hover:bg-white font-medium rounded-md px-6 py-2.5 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {evaluating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-bg border-t-transparent rounded-full" />
                  evaluating...
                </>
              ) : (
                'evaluate'
              )}
            </button>

            {result && (
              <div className="bg-bg-secondary border border-border rounded-lg p-6 mt-6 animate-fade-in">
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
                <p className="text-sm text-text-secondary leading-relaxed mb-2">
                  the AI will probe your understanding through questions. answer honestly — it adapts to find your knowledge gaps.
                </p>

                {socError && (
                  <div className="text-danger text-sm rounded-md px-4 py-3 border border-border bg-bg-secondary">
                    {socError}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">topic</label>
                  <input
                    type="text"
                    value={socTopic}
                    onChange={(e) => setSocTopic(e.target.value)}
                    placeholder="what topic should the AI quiz you on?"
                    className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full"
                    onKeyDown={(e) => e.key === 'Enter' && !socLoading && handleStartSocratic()}
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">reference note (optional)</label>
                  <select
                    value={socNoteId}
                    onChange={(e) => setSocNoteId(e.target.value)}
                    className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full"
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
                  className="bg-text text-bg hover:bg-white font-medium rounded-md px-6 py-2.5 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {socLoading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-bg border-t-transparent rounded-full" />
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
                    <h2 className="text-sm font-semibold text-text">{socSession.topic}</h2>
                    <span className="text-xs text-text-muted">
                      {socSession.question_count} question{socSession.question_count !== 1 ? 's' : ''}
                      {socSession.status === 'completed' && ' — completed'}
                    </span>
                  </div>
                  {socSession.status === 'completed' && (
                    <button
                      onClick={handleNewSocratic}
                      className="text-xs text-text-secondary hover:text-text transition-colors border border-border rounded-md px-3 py-1.5"
                    >
                      new session
                    </button>
                  )}
                </div>

                {socError && (
                  <div className="text-danger text-sm rounded-md px-4 py-3 border border-border bg-bg-secondary">
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
                            ? 'bg-bg-tertiary text-text rounded-br-sm'
                            : 'bg-bg-secondary border border-border text-text-secondary rounded-bl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {socLoading && (
                    <div className="flex justify-start">
                      <div className="bg-bg-secondary border border-border rounded-lg rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                      className="flex-1 bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors resize-none"
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
                        className="bg-text text-bg hover:bg-white rounded-md p-2 transition-colors disabled:opacity-30"
                        title="send reply"
                      >
                        <Send size={16} />
                      </button>
                      <button
                        onClick={handleFinishSocratic}
                        disabled={socLoading}
                        className="border border-border text-text-secondary hover:text-text hover:border-text-muted rounded-md p-2 transition-colors disabled:opacity-30"
                        title="end & evaluate"
                      >
                        <Square size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Completed — show evaluation */
                  <div className="bg-bg-secondary border border-border rounded-lg p-6 mt-4 animate-fade-in">
                    <EvaluationDisplay data={socSession} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========== PRACTICE TAB ========== */}
        {activeTab === 'practice' && (
          <div>
            {!pracProblem ? (
              <div className="space-y-5">
                <p className="text-sm text-text-secondary leading-relaxed mb-2">
                  generate practice problems and get step-by-step feedback on your solutions.
                </p>

                {pracError && (
                  <div className="text-danger text-sm rounded-md px-4 py-3 border border-border bg-bg-secondary">
                    {pracError}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">topic</label>
                  <input
                    type="text"
                    value={pracTopic}
                    onChange={(e) => setPracTopic(e.target.value)}
                    placeholder="what topic do you want to practice?"
                    className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full"
                    onKeyDown={(e) => e.key === 'Enter' && !pracLoading && handleGenerateProblem()}
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">reference note (optional)</label>
                  <select
                    value={pracNoteId}
                    onChange={(e) => setPracNoteId(e.target.value)}
                    className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full"
                  >
                    <option value="">no reference note</option>
                    {notes.map((n) => (
                      <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">difficulty</label>
                  <div className="flex gap-2">
                    {['easy', 'medium', 'hard'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setPracDifficulty(d)}
                        className={`border rounded-md px-4 py-2 text-sm transition-colors ${
                          pracDifficulty === d
                            ? 'border-text text-text bg-bg-tertiary'
                            : 'border-border text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerateProblem}
                  disabled={pracLoading}
                  className="bg-text text-bg hover:bg-white font-medium rounded-md px-6 py-2.5 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {pracLoading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-bg border-t-transparent rounded-full" />
                      generating...
                    </>
                  ) : (
                    <>
                      <Lightbulb size={14} />
                      generate problem
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text">{pracTopic}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{pracDifficulty}</span>
                    <button
                      onClick={handleNewProblem}
                      className="text-xs text-text-secondary hover:text-text transition-colors border border-border rounded-md px-3 py-1.5 flex items-center gap-1"
                    >
                      <RotateCcw size={12} />
                      new problem
                    </button>
                  </div>
                </div>

                {pracError && (
                  <div className="text-danger text-sm rounded-md px-4 py-3 border border-border bg-bg-secondary">
                    {pracError}
                  </div>
                )}

                {/* Problem */}
                <div className="bg-bg-secondary border border-border rounded-lg p-5">
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">problem</p>
                  <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{pracProblem.problem}</p>
                </div>

                {/* Hints */}
                {pracProblem.hints?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setPracHintsShown(h => Math.min(h + 1, pracProblem.hints.length))}
                      disabled={pracHintsShown >= pracProblem.hints.length}
                      className="text-xs text-text-secondary hover:text-[#c4a759] transition-colors flex items-center gap-1 mb-2 disabled:opacity-30"
                    >
                      <Lightbulb size={12} />
                      {pracHintsShown === 0 ? 'show hint' : pracHintsShown < pracProblem.hints.length ? 'next hint' : 'no more hints'}
                      {pracHintsShown < pracProblem.hints.length && ` (${pracHintsShown}/${pracProblem.hints.length})`}
                    </button>
                    {pracProblem.hints.slice(0, pracHintsShown).map((hint, i) => (
                      <div key={i} className="bg-bg-secondary border border-[#2a2211] rounded-md px-4 py-2 mb-2 text-sm text-[#c4a759] animate-fade-in">
                        hint {i + 1}: {hint}
                      </div>
                    ))}
                  </div>
                )}

                {/* Answer input */}
                {!pracResult ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">your solution</label>
                      <textarea
                        value={pracAnswer}
                        onChange={(e) => setPracAnswer(e.target.value)}
                        placeholder="work through the problem and write your answer..."
                        rows={6}
                        className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-text-muted transition-colors w-full resize-y"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCheckAnswer}
                        disabled={pracChecking || !pracAnswer.trim()}
                        className="bg-text text-bg hover:bg-white font-medium rounded-md px-6 py-2.5 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {pracChecking ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-bg border-t-transparent rounded-full" />
                            checking...
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            check answer
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setPracShowSolution(v => !v)}
                        className="text-xs text-text-secondary hover:text-text transition-colors flex items-center gap-1"
                      >
                        {pracShowSolution ? <EyeOff size={12} /> : <Eye size={12} />}
                        {pracShowSolution ? 'hide solution' : 'show solution'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Result */
                  <div className="bg-bg-secondary border border-border rounded-lg p-6 animate-fade-in space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pracResult.correct ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                        <span className="text-lg font-semibold" style={{ color: pracResult.correct ? '#4ade80' : '#f87171' }}>
                          {pracResult.score}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: pracResult.correct ? '#4ade80' : '#f87171' }}>
                          {pracResult.correct ? 'correct' : 'not quite'}
                        </p>
                        <p className="text-xs text-text-muted">score: {pracResult.score}/100</p>
                      </div>
                    </div>

                    {pracResult.feedback && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">feedback</p>
                        <p className="text-sm text-text-secondary leading-relaxed">{pracResult.feedback}</p>
                      </div>
                    )}

                    {pracResult.steps_missed?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">missed steps</p>
                        <ul className="space-y-1">
                          {pracResult.steps_missed.map((s, i) => (
                            <li key={i} className="text-sm text-text-secondary">
                              <span className="text-text-muted mr-2">&mdash;</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleGenerateProblem}
                        disabled={pracLoading}
                        className="border border-border text-text-secondary hover:text-text hover:border-text-muted rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2"
                      >
                        <RotateCcw size={14} />
                        another problem
                      </button>
                      <button
                        onClick={() => setPracShowSolution(v => !v)}
                        className="text-xs text-text-secondary hover:text-text transition-colors flex items-center gap-1"
                      >
                        {pracShowSolution ? <EyeOff size={12} /> : <Eye size={12} />}
                        {pracShowSolution ? 'hide solution' : 'show solution'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Solution (toggle) */}
                {pracShowSolution && pracProblem.solution && (
                  <div className="bg-bg-secondary border border-border rounded-lg p-5 animate-fade-in">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted mb-3">solution</p>
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{pracProblem.solution}</p>
                    {pracProblem.answer && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">answer</p>
                        <p className="text-sm text-text">{pracProblem.answer}</p>
                      </div>
                    )}
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
                  <div key={i} className="animate-pulse bg-bg-secondary rounded-lg p-5">
                    <div className="h-5 rounded w-3/4 mb-3 bg-bg-tertiary" />
                    <div className="h-4 rounded w-1/3 bg-bg-tertiary" />
                  </div>
                ))}
              </div>
            ) : allHistory.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <p className="text-text-secondary">no sessions yet.</p>
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
                    className="bg-bg-secondary border border-border rounded-lg p-4 cursor-pointer hover:border-text-muted transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {session.mode === 'socratic' && (
                          <MessageCircle size={12} className="text-text-muted flex-shrink-0" />
                        )}
                        <h3 className="text-sm text-text-secondary truncate">{session.topic}</h3>
                      </div>
                      <span className="text-lg font-semibold text-text flex-shrink-0 ml-2">
                        {session.score ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{formatDate(session.created_at)}</span>
                        <span className="text-xs text-text-muted">
                          {session.mode === 'socratic' ? 'socratic' : 'explain'}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
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
                  className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-semibold text-text">{selectedSession.topic}</h2>
                    <button onClick={() => setSelectedSession(null)} className="text-text-muted hover:text-text-secondary transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="text-center mb-8">
                    <ScoreDisplay score={selectedSession.score ?? 0} />
                    <p className="text-xs text-text-muted mt-3">{formatDate(selectedSession.created_at)}</p>
                  </div>

                  {selectedSession.explanation && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-text mb-2">your explanation</h3>
                      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{selectedSession.explanation}</p>
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
                  className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MessageCircle size={14} className="text-text-muted" />
                      <h2 className="text-sm font-semibold text-text">{selectedSocratic.topic}</h2>
                    </div>
                    <button onClick={() => setSelectedSocratic(null)} className="text-text-muted hover:text-text-secondary transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  <p className="text-xs text-text-muted mb-6">
                    {selectedSocratic.question_count} questions &middot; {formatDate(selectedSocratic.created_at)}
                  </p>

                  {/* Dialogue */}
                  <div className="space-y-3 mb-6">
                    {selectedSocratic.messages?.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-bg-tertiary text-text rounded-br-sm'
                              : 'bg-bg-secondary border border-border text-text-secondary rounded-bl-sm'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedSocratic.status === 'completed' && selectedSocratic.score != null && (
                    <div className="border-t border-border pt-6">
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
