import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Sparkles, Trash2, X, ChevronDown, Clock, Target } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'

export default function Quizzes() {
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState([])
  const [attempts, setAttempts] = useState([])
  const [stats, setStats] = useState({ total_quizzes: 0, total_attempts: 0, average_score: 0, best_score: 0 })
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState([])
  const [tab, setTab] = useState('quizzes')

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [genNoteId, setGenNoteId] = useState('')
  const [genCount, setGenCount] = useState(10)
  const [genTypes, setGenTypes] = useState({ multiple_choice: true, true_false: true, fill_blank: true })
  const [generating, setGenerating] = useState(false)

  // History detail expand
  const [expandedAttempt, setExpandedAttempt] = useState(null)
  const [attemptDetail, setAttemptDetail] = useState(null)

  const fetchAll = async () => {
    try {
      const [quizzesData, attemptsData, statsData, notesData] = await Promise.all([
        api.get('/quizzes'),
        api.get('/quizzes/attempts'),
        api.get('/quizzes/stats'),
        api.get('/notes'),
      ])
      setQuizzes(Array.isArray(quizzesData) ? quizzesData : [])
      setAttempts(Array.isArray(attemptsData) ? attemptsData : [])
      setStats(statsData)
      setNotes(Array.isArray(notesData) ? notesData : notesData.results || [])
    } catch (err) {
      console.error('Failed to fetch quizzes:', err)
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
    try {
      const selectedTypes = Object.entries(genTypes).filter(([, v]) => v).map(([k]) => k)
      if (selectedTypes.length === 0) return
      const result = await api.post('/quizzes/generate', {
        note_id: parseInt(genNoteId),
        count: genCount,
        question_types: selectedTypes,
      })
      setShowGenerate(false)
      setGenNoteId('')
      setGenCount(10)
      await fetchAll()
      navigate(`/quizzes/take/${result.id}`)
    } catch (err) {
      console.error('Failed to generate quiz:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (quizId) => {
    try {
      await api.delete(`/quizzes/${quizId}`)
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId))
      setStats((prev) => ({ ...prev, total_quizzes: prev.total_quizzes - 1 }))
    } catch (err) {
      console.error('Failed to delete quiz:', err)
    }
  }

  const handleExpandAttempt = async (attemptId) => {
    if (expandedAttempt === attemptId) {
      setExpandedAttempt(null)
      setAttemptDetail(null)
      return
    }
    try {
      const detail = await api.get(`/quizzes/attempts/${attemptId}`)
      setAttemptDetail(detail)
      setExpandedAttempt(attemptId)
    } catch (err) {
      console.error('Failed to fetch attempt detail:', err)
    }
  }

  const toggleType = (type) => {
    setGenTypes((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (seconds) => {
    if (!seconds) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"><div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#d4d4d4] mb-8 tracking-tight">quizzes</h1>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.total_quizzes}</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">quizzes</div>
          </div>
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.total_attempts}</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">attempts</div>
          </div>
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.average_score}%</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">avg score</div>
          </div>
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4 text-center">
            <div className="text-xl font-semibold text-[#d4d4d4]">{stats.best_score}%</div>
            <div className="text-xs text-[#333333] uppercase tracking-wider">best score</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-[#1c1c1c]">
          <button
            onClick={() => setTab('quizzes')}
            className={`pb-2 text-sm transition-colors ${tab === 'quizzes' ? 'text-[#d4d4d4] border-b border-[#d4d4d4]' : 'text-[#606060] hover:text-[#d4d4d4]'}`}
          >
            quizzes
          </button>
          <button
            onClick={() => setTab('history')}
            className={`pb-2 text-sm transition-colors ${tab === 'history' ? 'text-[#d4d4d4] border-b border-[#d4d4d4]' : 'text-[#606060] hover:text-[#d4d4d4]'}`}
          >
            history
          </button>
        </div>

        {/* Quizzes tab */}
        {tab === 'quizzes' && (
          <>
            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-8">
              <button
                onClick={() => setShowGenerate(true)}
                className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2"
              >
                <Sparkles size={16} />
                generate quiz
              </button>
            </div>

            {/* Quiz list */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-[#111111] rounded-lg p-4">
                    <div className="h-4 rounded w-3/4 mb-2 bg-[#191919]" />
                    <div className="h-3 rounded w-1/2 bg-[#191919]" />
                  </div>
                ))}
              </div>
            ) : quizzes.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <p className="text-[#606060] mb-2">no quizzes yet.</p>
                <p className="text-[#333333] text-sm">generate a quiz from your notes to get started.</p>
              </div>
            ) : (
              <div className="space-y-3 stagger-in">
                {quizzes.map((quiz) => (
                  <div
                    key={quiz.id}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#d4d4d4] truncate">{quiz.title}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-[#333333]">{quiz.question_count} questions</span>
                          <span className="text-xs text-[#333333]">{formatDate(quiz.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => navigate(`/quizzes/take/${quiz.id}`)}
                          className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-3 py-1.5 transition-colors text-sm flex items-center gap-1.5"
                        >
                          <Play size={14} />
                          take
                        </button>
                        <button
                          onClick={() => handleDelete(quiz.id)}
                          className="p-1.5 text-[#333333] hover:text-[#606060] rounded-md transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <>
            {attempts.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <p className="text-[#606060] mb-2">no attempts yet.</p>
                <p className="text-[#333333] text-sm">take a quiz to see your history here.</p>
              </div>
            ) : (
              <div className="space-y-3 stagger-in">
                {attempts.map((attempt) => {
                  const pct = attempt.total_questions > 0
                    ? Math.round(attempt.score / attempt.total_questions * 100)
                    : 0
                  return (
                    <div key={attempt.id} className="bg-[#111111] border border-[#1c1c1c] rounded-lg">
                      <button
                        onClick={() => handleExpandAttempt(attempt.id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#d4d4d4] truncate">{attempt.quiz_title}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-xs flex items-center gap-1 text-[#333333]">
                                <Target size={12} />
                                {attempt.score}/{attempt.total_questions} ({pct}%)
                              </span>
                              <span className="text-xs flex items-center gap-1 text-[#333333]">
                                <Clock size={12} />
                                {formatTime(attempt.time_seconds)}
                              </span>
                              <span className="text-xs text-[#333333]">{formatDate(attempt.completed_at)}</span>
                            </div>
                          </div>
                          <ChevronDown size={14} className={`text-[#333333] transition-transform duration-150 mt-1 ${expandedAttempt === attempt.id ? '' : '-rotate-90'}`} />
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {expandedAttempt === attempt.id && attemptDetail && (
                        <div className="border-t border-[#1c1c1c] p-4 space-y-3">
                          {attemptDetail.results
                            .filter((r) => !r.is_correct)
                            .map((r) => (
                              <div key={r.question_id} className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-md p-3">
                                <p className="text-sm text-[#d4d4d4] mb-2">{r.question_text}</p>
                                <div className="flex flex-col gap-1 text-xs">
                                  <span className="text-red-400">your answer: {r.user_answer}</span>
                                  <span className="text-green-400">correct: {r.correct_answer}</span>
                                  {r.explanation && (
                                    <span className="text-[#606060] mt-1">{r.explanation}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          {attemptDetail.results.filter((r) => !r.is_correct).length === 0 && (
                            <p className="text-sm text-[#606060]">perfect score — no wrong answers.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
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
                <h2 className="text-sm font-semibold text-[#d4d4d4]">generate quiz from note</h2>
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
                  <label className="block text-sm text-[#606060] mb-1.5">number of questions</label>
                  <input
                    type="number"
                    value={genCount}
                    onChange={(e) => setGenCount(Math.max(5, Math.min(30, parseInt(e.target.value) || 5)))}
                    min={5}
                    max={30}
                    className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#606060] mb-1.5">question types</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'multiple_choice', label: 'multiple choice' },
                      { key: 'true_false', label: 'true / false' },
                      { key: 'fill_blank', label: 'fill in the blank' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => toggleType(key)}
                        className={`border rounded-md px-3 py-1.5 text-xs transition-colors ${
                          genTypes[key]
                            ? 'border-[#d4d4d4] text-[#d4d4d4] bg-[#191919]'
                            : 'border-[#1c1c1c] text-[#333333] hover:text-[#606060]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating || !genNoteId || !Object.values(genTypes).some(Boolean)}
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
              </div>
            </div>
          </div>
        )}
      </div></div>
    </Layout>
  )
}
