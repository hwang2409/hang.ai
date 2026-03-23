import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { api } from '../lib/api'

function timeAgo(dateStr) {
  const raw = String(dateStr)
  const d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function TagPill({ tag, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded-full transition-colors duration-150 cursor-pointer ${
        active
          ? 'bg-[#c4a759] text-black'
          : 'bg-bg border border-border text-text-muted hover:border-[#c4a759] hover:text-[#c4a759]'
      }`}
    >
      {tag}
    </button>
  )
}

function VoteColumn({ score, userVote, onUpvote, onDownvote }) {
  return (
    <div className="flex flex-col items-center gap-0.5 w-10 shrink-0 pt-1">
      <button
        onClick={onUpvote}
        className={`p-1 rounded transition-colors duration-150 cursor-pointer ${
          userVote === 1 ? 'text-[#c4a759]' : 'text-text-muted hover:text-[#c4a759]'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3L14 10H2L8 3Z" fill="currentColor" />
        </svg>
      </button>
      <span className={`text-sm font-medium ${score > 0 ? 'text-text' : score < 0 ? 'text-red-400' : 'text-text-muted'}`}>
        {score}
      </span>
      <button
        onClick={onDownvote}
        className={`p-1 rounded transition-colors duration-150 cursor-pointer ${
          userVote === -1 ? 'text-[#c4a759]' : 'text-text-muted hover:text-[#c4a759]'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 13L2 6H14L8 13Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  )
}

function CommentsSection({ comments, targetType, targetId, onCommentAdded }) {
  const [expanded, setExpanded] = useState(false)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const endpoint = targetType === 'question'
        ? `/forum/questions/${targetId}/comments`
        : `/forum/answers/${targetId}/comments`
      const comment = await api.post(endpoint, { body: body.trim() })
      onCommentAdded(comment)
      setBody('')
      setExpanded(false)
    } catch {}
    setSubmitting(false)
  }

  const handleDelete = async (commentId) => {
    try {
      await api.delete(`/forum/comments/${commentId}`)
      onCommentAdded(null, commentId)
    } catch {}
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {comments && comments.length > 0 && (
        <div className="space-y-0">
          {comments.map((c, i) => (
            <div
              key={c.id}
              className={`flex items-start gap-2 py-1.5 ${
                i < comments.length - 1 ? 'border-b border-border/50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs text-text-secondary">{c.body}</span>
                <span className="text-[10px] text-text-muted ml-2">
                  — {c.username || 'anonymous'} {timeAgo(c.created_at)}
                </span>
              </div>
              {c.is_owner && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-[10px] text-text-muted hover:text-red-400 transition-colors duration-150 cursor-pointer shrink-0"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-text-muted hover:text-[#c4a759] transition-colors duration-150 cursor-pointer mt-1"
        >
          add comment
        </button>
      ) : (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="write a comment..."
            className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759]"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
            className="bg-[#c4a759] text-black text-[10px] px-2 py-1 rounded hover:brightness-110 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '...' : 'comment'}
          </button>
          <button
            onClick={() => { setExpanded(false); setBody('') }}
            className="text-[10px] text-text-muted hover:text-text transition-colors duration-150 cursor-pointer"
          >
            cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default function Forum() {
  const { questionId } = useParams()
  const navigate = useNavigate()

  // View state
  const [view, setView] = useState(questionId ? 'detail' : 'list')

  // List state
  const [questions, setQuestions] = useState([])
  const [sort, setSort] = useState('newest')
  const [activeTag, setActiveTag] = useState('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [tags, setTags] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState(null)
  const limit = 20
  const searchTimer = useRef(null)

  // Detail state
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [answers, setAnswers] = useState([])
  const [similarQuestions, setSimilarQuestions] = useState([])
  const [relatedNotes, setRelatedNotes] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [answerBody, setAnswerBody] = useState('')
  const [answerSubmitting, setAnswerSubmitting] = useState(false)
  const [answerPreview, setAnswerPreview] = useState(false)
  const [savedFilter, setSavedFilter] = useState(false)
  const [aiAnswerLoading, setAiAnswerLoading] = useState(false)
  const [bountyInput, setBountyInput] = useState('')
  const [showBountyInput, setShowBountyInput] = useState(false)

  // Ask state
  const [askTitle, setAskTitle] = useState('')
  const [askBody, setAskBody] = useState('')
  const [askTagsInput, setAskTagsInput] = useState('')
  const [askLinkedNote, setAskLinkedNote] = useState('')
  const [askSimilar, setAskSimilar] = useState([])
  const [askSubmitting, setAskSubmitting] = useState(false)
  const [askPreview, setAskPreview] = useState(false)
  const [askError, setAskError] = useState(null)
  const [findingSimilar, setFindingSimilar] = useState(false)

  // Parse tags from comma-separated input
  const askTags = askTagsInput
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  // ── Data fetching ──────────────────────────────────────────────────────

  const loadTags = useCallback(async () => {
    try {
      const data = await api.get('/forum/tags')
      setTags(data || [])
    } catch {
      // tags are non-critical
    }
  }, [])

  const loadQuestions = useCallback(async (reset = false) => {
    setListLoading(true)
    setListError(null)
    const currentOffset = reset ? 0 : offset
    try {
      const params = new URLSearchParams()
      params.set('sort', sort)
      params.set('limit', String(limit))
      params.set('offset', String(currentOffset))
      if (activeTag) params.set('tag', activeTag)
      if (searchDebounced) params.set('q', searchDebounced)
      if (savedFilter) params.set('saved', 'true')
      const data = await api.get(`/forum/questions?${params.toString()}`)
      const list = Array.isArray(data) ? data : data.questions || data.items || []
      if (reset) {
        setQuestions(list)
        setOffset(list.length)
      } else {
        setQuestions(prev => [...prev, ...list])
        setOffset(currentOffset + list.length)
      }
      setHasMore(list.length >= limit)
    } catch (err) {
      setListError(err.message || 'Failed to load questions')
    } finally {
      setListLoading(false)
    }
  }, [sort, activeTag, searchDebounced, offset, savedFilter])

  const loadQuestion = useCallback(async (id) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const data = await api.get(`/forum/questions/${id}`)
      setCurrentQuestion(data)
      const answerList = data.answers || []
      setAnswers(answerList)
      // Try to load similar questions
      try {
        if (data.title) {
          const sim = await api.post('/forum/questions/find-similar', {
            title: data.title,
            body: data.body || '',
          })
          const simQuestions = (sim.similar_questions || sim.questions || (Array.isArray(sim) ? sim : []))
            .filter(q => q.id !== id)
          setSimilarQuestions(simQuestions)
          setRelatedNotes(sim.related_notes || [])
        }
      } catch {
        setSimilarQuestions([])
        setRelatedNotes([])
      }
    } catch (err) {
      setDetailError(err.message || 'Failed to load question')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // ── Effects ────────────────────────────────────────────────────────────

  // Load tags on mount
  useEffect(() => {
    loadTags()
  }, [loadTags])

  // Load questions when filters change
  useEffect(() => {
    if (view === 'list') {
      loadQuestions(true)
    }
  }, [sort, activeTag, searchDebounced, view, savedFilter])

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchDebounced(search)
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search])

  // Load question from URL param on mount
  useEffect(() => {
    if (questionId) {
      setView('detail')
      loadQuestion(parseInt(questionId))
    }
  }, [questionId, loadQuestion])

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleViewQuestion = (q) => {
    setView('detail')
    setCurrentQuestion(q)
    setAnswers(q.answers || [])
    setSimilarQuestions([])
    setRelatedNotes([])
    loadQuestion(q.id)
    navigate(`/forum/${q.id}`, { replace: true })
  }

  const handleBackToList = () => {
    setView('list')
    setCurrentQuestion(null)
    setAnswers([])
    setSimilarQuestions([])
    setRelatedNotes([])
    setDetailError(null)
    navigate('/forum', { replace: true })
  }

  const handleVoteQuestion = async (id, direction) => {
    try {
      const data = await api.post(`/forum/questions/${id}/vote`, { direction })
      if (currentQuestion?.id === id) {
        setCurrentQuestion(prev => ({
          ...prev,
          score: data.score,
          upvote_count: data.upvote_count,
          downvote_count: data.downvote_count,
          user_vote_direction: data.voted,
        }))
      }
      setQuestions(prev =>
        prev.map(q =>
          q.id === id ? { ...q, score: data.score, user_vote_direction: data.voted } : q
        )
      )
    } catch {}
  }

  const handleVoteAnswer = async (id, direction) => {
    try {
      const data = await api.post(`/forum/answers/${id}/vote`, { direction })
      setAnswers(prev =>
        prev.map(a =>
          a.id === id
            ? {
                ...a,
                score: data.score,
                upvote_count: data.upvote_count,
                downvote_count: data.downvote_count,
                user_vote_direction: data.voted,
              }
            : a
        )
      )
    } catch {}
  }

  const handleAcceptAnswer = async (id) => {
    try {
      await api.post(`/forum/answers/${id}/accept`)
      setAnswers(prev =>
        prev.map(a => ({
          ...a,
          is_accepted: a.id === id,
        }))
      )
      setCurrentQuestion(prev => prev ? { ...prev, is_answered: true } : prev)
    } catch {}
  }

  const handleSubmitAnswer = async () => {
    if (!answerBody.trim() || !currentQuestion) return
    setAnswerSubmitting(true)
    try {
      const answer = await api.post(`/forum/questions/${currentQuestion.id}/answers`, {
        body: answerBody.trim(),
      })
      setAnswers(prev => [...prev, answer])
      setAnswerBody('')
    } catch {}
    setAnswerSubmitting(false)
  }

  const handleDeleteQuestion = async (id) => {
    try {
      await api.delete(`/forum/questions/${id}`)
      handleBackToList()
      loadQuestions(true)
    } catch {}
  }

  const handleDeleteAnswer = async (id) => {
    try {
      await api.delete(`/forum/answers/${id}`)
      setAnswers(prev => prev.filter(a => a.id !== id))
    } catch {}
  }

  const handleFindSimilar = async () => {
    if (!askTitle.trim()) return
    setFindingSimilar(true)
    try {
      const data = await api.post('/forum/questions/find-similar', {
        title: askTitle.trim(),
        body: askBody.trim(),
      })
      setAskSimilar(data.similar_questions || data.questions || (Array.isArray(data) ? data : []))
    } catch {
      setAskSimilar([])
    }
    setFindingSimilar(false)
  }

  const handleSubmitQuestion = async () => {
    if (!askTitle.trim() || !askBody.trim()) return
    setAskSubmitting(true)
    setAskError(null)
    try {
      const payload = {
        title: askTitle.trim(),
        body: askBody.trim(),
        tags: askTags,
      }
      if (askLinkedNote && !isNaN(parseInt(askLinkedNote))) {
        payload.linked_note_id = parseInt(askLinkedNote)
      }
      const q = await api.post('/forum/questions', payload)
      setAskTitle('')
      setAskBody('')
      setAskTagsInput('')
      setAskLinkedNote('')
      setAskSimilar([])
      setView('detail')
      setCurrentQuestion(q)
      setAnswers(q.answers || [])
      navigate(`/forum/${q.id}`, { replace: true })
      loadQuestion(q.id)
    } catch (err) {
      setAskError(err.message || 'Failed to create question')
    }
    setAskSubmitting(false)
  }

  const handleBookmarkQuestion = async (id) => {
    try {
      const data = await api.post(`/forum/questions/${id}/bookmark`)
      const bookmarked = data.bookmarked ?? data.is_bookmarked ?? !currentQuestion?.is_bookmarked
      if (currentQuestion?.id === id) {
        setCurrentQuestion(prev => ({ ...prev, is_bookmarked: bookmarked }))
      }
      setQuestions(prev =>
        prev.map(q => q.id === id ? { ...q, is_bookmarked: bookmarked } : q)
      )
    } catch {}
  }

  const handleCloseQuestion = async (id) => {
    try {
      await api.post(`/forum/questions/${id}/close`, { status: 'closed' })
      setCurrentQuestion(prev => prev ? { ...prev, status: 'closed' } : prev)
    } catch {}
  }

  const handleReopenQuestion = async (id) => {
    try {
      await api.post(`/forum/questions/${id}/reopen`)
      setCurrentQuestion(prev => prev ? { ...prev, status: 'open' } : prev)
    } catch {}
  }

  const handleAddBounty = async (id) => {
    const amount = parseInt(bountyInput)
    if (isNaN(amount) || amount < 50 || amount > 500) return
    try {
      const data = await api.post(`/forum/questions/${id}/bounty`, { amount })
      setCurrentQuestion(prev => prev ? { ...prev, bounty: data.bounty || amount } : prev)
      setShowBountyInput(false)
      setBountyInput('')
    } catch {}
  }

  const handleGetAiAnswer = async (id) => {
    setAiAnswerLoading(true)
    try {
      const answer = await api.post(`/forum/questions/${id}/ai-answer`)
      setAnswers(prev => [...prev, answer])
    } catch {}
    setAiAnswerLoading(false)
  }

  const handleLoadMore = () => {
    loadQuestions(false)
  }

  const handleTagFilter = (tag) => {
    setActiveTag(prev => (prev === tag ? '' : tag))
    setOffset(0)
  }

  // Comment handlers
  const handleQuestionCommentAdded = (comment, deletedId) => {
    if (deletedId) {
      setCurrentQuestion(prev => prev ? {
        ...prev,
        comments: (prev.comments || []).filter(c => c.id !== deletedId),
      } : prev)
    } else if (comment) {
      setCurrentQuestion(prev => prev ? {
        ...prev,
        comments: [...(prev.comments || []), comment],
      } : prev)
    }
  }

  const handleAnswerCommentAdded = (answerId) => (comment, deletedId) => {
    if (deletedId) {
      setAnswers(prev => prev.map(a =>
        a.id === answerId
          ? { ...a, comments: (a.comments || []).filter(c => c.id !== deletedId) }
          : a
      ))
    } else if (comment) {
      setAnswers(prev => prev.map(a =>
        a.id === answerId
          ? { ...a, comments: [...(a.comments || []), comment] }
          : a
      ))
    }
  }

  // ── Sort answers: accepted first, then by score ────────────────────────

  const sortedAnswers = [...answers].sort((a, b) => {
    if (a.is_accepted && !b.is_accepted) return -1
    if (!a.is_accepted && b.is_accepted) return 1
    return (b.score || 0) - (a.score || 0)
  })

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto p-6 bg-bg">
        <div className="max-w-3xl mx-auto">
          {/* ── List View ────────────────────────────────────────── */}
          {view === 'list' && (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h1 className="text-lg font-semibold text-text">forum</h1>
                <button
                  onClick={() => {
                    setView('ask')
                    setAskError(null)
                    setAskSimilar([])
                  }}
                  className="bg-[#c4a759] text-black text-xs px-3 py-1.5 rounded hover:brightness-110 transition-colors duration-150 cursor-pointer"
                >
                  ask question
                </button>
              </div>

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <select
                  value={sort}
                  onChange={e => {
                    setSort(e.target.value)
                    setOffset(0)
                  }}
                  className="bg-bg border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-[#c4a759] cursor-pointer"
                >
                  <option value="newest">newest</option>
                  <option value="most voted">most voted</option>
                  <option value="unanswered">unanswered</option>
                  <option value="hot">hot</option>
                </select>

                <button
                  onClick={() => { setSavedFilter(prev => !prev); setOffset(0) }}
                  className={`text-xs px-3 py-2 rounded border transition-colors duration-150 cursor-pointer ${
                    savedFilter
                      ? 'bg-[#c4a759] text-black border-[#c4a759]'
                      : 'bg-bg border-border text-text-muted hover:border-[#c4a759] hover:text-[#c4a759]'
                  }`}
                >
                  saved
                </button>

                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map(tag => (
                    <TagPill
                      key={typeof tag === 'string' ? tag : tag.name || tag.tag}
                      tag={typeof tag === 'string' ? tag : tag.name || tag.tag}
                      active={activeTag === (typeof tag === 'string' ? tag : tag.name || tag.tag)}
                      onClick={() =>
                        handleTagFilter(typeof tag === 'string' ? tag : tag.name || tag.tag)
                      }
                    />
                  ))}
                </div>

                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="search questions..."
                  className="ml-auto bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759] w-48"
                />
              </div>

              {/* Error */}
              {listError && (
                <div className="text-xs text-red-400 mb-3">{listError}</div>
              )}

              {/* Questions list */}
              <div className="space-y-2">
                {questions.map(q => {
                  const tagName = t => (typeof t === 'string' ? t : t.name || t.tag || '')
                  const qScore = q.score || 0
                  return (
                    <div
                      key={q.id}
                      className="bg-bg-secondary border border-border rounded-lg p-4 transition-colors duration-150"
                    >
                      <div className="flex items-start gap-3">
                        {/* Compact score display */}
                        <div className="flex flex-col items-center w-10 shrink-0 pt-0.5">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                            <path d="M8 3L14 10H2L8 3Z" fill="currentColor" />
                          </svg>
                          <span className={`text-sm font-medium leading-tight ${qScore > 0 ? 'text-text' : qScore < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                            {qScore}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                            <path d="M8 13L2 6H14L8 13Z" fill="currentColor" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => handleViewQuestion(q)}
                            className="text-sm font-medium text-text hover:underline cursor-pointer text-left"
                          >
                            {q.title}
                          </button>

                          {/* Tags */}
                          {q.tags && q.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {q.tags.map(t => (
                                <span
                                  key={tagName(t)}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg border border-border text-text-muted"
                                >
                                  {tagName(t)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Stats row */}
                          <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                            <span>{q.answer_count || 0} answers</span>
                            <span>{q.views || 0} views</span>
                            <span className="ml-auto">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/profile/${q.author_id || q.user_id}`) }}
                                className="hover:text-[#c4a759] transition-colors duration-150 cursor-pointer"
                              >
                                {q.author_username || q.author || 'anonymous'}
                              </button>
                              {q.author_reputation != null && (
                                <span className="text-[#c4a759]"> &middot; {q.author_reputation} rep</span>
                              )}
                              {' '}&middot; {timeAgo(q.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Right side badges */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {/* Bookmark icon */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleBookmarkQuestion(q.id) }}
                            className={`p-1 rounded transition-colors duration-150 cursor-pointer ${
                              q.is_bookmarked ? 'text-[#c4a759]' : 'text-text-muted hover:text-[#c4a759]'
                            }`}
                            title={q.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={q.is_bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                            </svg>
                          </button>

                          {/* Status badge */}
                          {q.status === 'closed' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-400">closed</span>
                          )}
                          {q.status === 'duplicate' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/25 text-yellow-400">duplicate</span>
                          )}

                          {/* Answered badge */}
                          {q.is_answered && (
                            <span className="flex items-center gap-1 text-[10px] text-[#6a9a6a] bg-[rgba(106,154,106,0.10)] border border-[rgba(106,154,106,0.25)] rounded px-2 py-0.5">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path
                                  d="M2 5L4.5 7.5L8 3"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              answered
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Empty state */}
              {!listLoading && questions.length === 0 && (
                <div className="text-center text-text-muted text-sm py-12">
                  no questions found
                </div>
              )}

              {/* Loading */}
              {listLoading && (
                <div className="text-center text-text-muted text-xs py-4">loading...</div>
              )}

              {/* Load more */}
              {hasMore && questions.length > 0 && !listLoading && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleLoadMore}
                    className="bg-bg-secondary border border-border text-text-muted text-xs px-4 py-2 rounded hover:border-[#c4a759] hover:text-[#c4a759] transition-colors duration-150 cursor-pointer"
                  >
                    load more
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Detail View ──────────────────────────────────────── */}
          {view === 'detail' && (
            <div>
              {/* Back button */}
              <button
                onClick={handleBackToList}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors duration-150 mb-4 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M9 3L5 7L9 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                back to questions
              </button>

              {detailError && (
                <div className="text-xs text-red-400 mb-3">{detailError}</div>
              )}

              {detailLoading && !currentQuestion && (
                <div className="text-center text-text-muted text-xs py-12">loading...</div>
              )}

              {currentQuestion && (
                <div>
                  {/* Question */}
                  <div className="bg-bg-secondary border border-border rounded-lg p-5 mb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold text-text">
                          {currentQuestion.title}
                        </h2>
                        {/* Status badges */}
                        {currentQuestion.status === 'closed' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-400">closed</span>
                        )}
                        {currentQuestion.status === 'duplicate' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/25 text-yellow-400">duplicate</span>
                        )}
                        {/* Bounty badge */}
                        {currentQuestion.bounty > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#c4a759]/10 border border-[#c4a759]/25 text-[#c4a759] font-medium">
                            +{currentQuestion.bounty} bounty
                          </span>
                        )}
                      </div>
                      {/* Bookmark icon */}
                      <button
                        onClick={() => handleBookmarkQuestion(currentQuestion.id)}
                        className={`p-1 rounded transition-colors duration-150 cursor-pointer shrink-0 ${
                          currentQuestion.is_bookmarked ? 'text-[#c4a759]' : 'text-text-muted hover:text-[#c4a759]'
                        }`}
                        title={currentQuestion.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={currentQuestion.is_bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                    </div>

                    {/* Tags */}
                    {currentQuestion.tags && currentQuestion.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {currentQuestion.tags.map(t => {
                          const name = typeof t === 'string' ? t : t.name || t.tag || ''
                          return (
                            <span
                              key={name}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg border border-border text-text-muted"
                            >
                              {name}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Vote column + Body row */}
                    <div className="flex items-start gap-3">
                      <VoteColumn
                        score={currentQuestion.score || 0}
                        userVote={currentQuestion.user_vote_direction || 0}
                        onUpvote={() => handleVoteQuestion(currentQuestion.id, 1)}
                        onDownvote={() => handleVoteQuestion(currentQuestion.id, -1)}
                      />
                      <div className="flex-1 min-w-0">
                        {/* Body */}
                        <div className="text-sm text-text-secondary mb-4">
                          <MarkdownRenderer content={currentQuestion.body} />
                        </div>

                        {/* Linked note */}
                        {currentQuestion.linked_note_id && (
                          <div className="mb-3">
                            <a
                              href={`/notes/${currentQuestion.linked_note_id}`}
                              className="text-xs text-[#c4a759] hover:underline"
                            >
                              linked note #{currentQuestion.linked_note_id}
                            </a>
                          </div>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-text-muted">
                            <button
                              onClick={() => navigate(`/profile/${currentQuestion.author_id || currentQuestion.user_id}`)}
                              className="hover:text-[#c4a759] transition-colors duration-150 cursor-pointer"
                            >
                              {currentQuestion.author_username || currentQuestion.author || 'anonymous'}
                            </button>
                            {currentQuestion.author_reputation != null && (
                              <span className="text-[#c4a759]"> &middot; {currentQuestion.author_reputation} rep</span>
                            )}
                            {' '}&middot; {timeAgo(currentQuestion.created_at)}
                          </span>
                          <div className="ml-auto flex items-center gap-2">
                            {/* Close/Reopen buttons for question author */}
                            {currentQuestion.is_owner && currentQuestion.status !== 'closed' && (
                              <button
                                onClick={() => handleCloseQuestion(currentQuestion.id)}
                                className="text-[10px] text-text-muted hover:text-red-400 transition-colors duration-150 cursor-pointer"
                              >
                                close
                              </button>
                            )}
                            {currentQuestion.is_owner && currentQuestion.status === 'closed' && (
                              <button
                                onClick={() => handleReopenQuestion(currentQuestion.id)}
                                className="text-[10px] text-text-muted hover:text-[#6a9a6a] transition-colors duration-150 cursor-pointer"
                              >
                                reopen
                              </button>
                            )}
                            {/* Add Bounty button for author with no existing bounty */}
                            {currentQuestion.is_owner && !currentQuestion.bounty && (
                              <>
                                {!showBountyInput ? (
                                  <button
                                    onClick={() => setShowBountyInput(true)}
                                    className="text-[10px] text-text-muted hover:text-[#c4a759] transition-colors duration-150 cursor-pointer"
                                  >
                                    add bounty
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="50"
                                      max="500"
                                      value={bountyInput}
                                      onChange={e => setBountyInput(e.target.value)}
                                      placeholder="50-500"
                                      className="w-20 bg-bg border border-border rounded px-2 py-0.5 text-[10px] text-text focus:outline-none focus:border-[#c4a759]"
                                    />
                                    <button
                                      onClick={() => handleAddBounty(currentQuestion.id)}
                                      disabled={!bountyInput || parseInt(bountyInput) < 50 || parseInt(bountyInput) > 500}
                                      className="text-[10px] text-[#c4a759] hover:brightness-110 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      add
                                    </button>
                                    <button
                                      onClick={() => { setShowBountyInput(false); setBountyInput('') }}
                                      className="text-[10px] text-text-muted hover:text-text transition-colors duration-150 cursor-pointer"
                                    >
                                      cancel
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                            {currentQuestion.is_owner && (
                              <button
                                onClick={() => handleDeleteQuestion(currentQuestion.id)}
                                className="text-[10px] text-text-muted hover:text-red-400 transition-colors duration-150 cursor-pointer"
                              >
                                delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Comments on question */}
                    <CommentsSection
                      comments={currentQuestion.comments || []}
                      targetType="question"
                      targetId={currentQuestion.id}
                      onCommentAdded={handleQuestionCommentAdded}
                    />
                  </div>

                  {/* Answers header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted">
                      answers
                    </span>
                    <span className="text-[10px] text-text-muted">
                      ({sortedAnswers.length})
                    </span>
                  </div>

                  {/* Answers list */}
                  {sortedAnswers.length === 0 && (
                    <div className="text-sm text-text-muted py-6 text-center">
                      no answers yet. be the first to answer!
                    </div>
                  )}

                  <div className="space-y-2 mb-6">
                    {sortedAnswers.map(a => (
                      <div
                        key={a.id}
                        className={`bg-bg-secondary border border-border rounded-lg p-4 transition-colors duration-150 ${
                          a.is_accepted ? 'border-l-2 border-l-[#6a9a6a]' : ''
                        } ${a.is_ai ? 'border-l-2 border-l-[#c4a759]/50' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {a.is_accepted && (
                            <div className="flex items-center gap-1 text-[10px] text-[#6a9a6a]">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path
                                  d="M2 5L4.5 7.5L8 3"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              accepted answer
                            </div>
                          )}
                          {a.is_ai && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#c4a759]/10 border border-[#c4a759]/25 text-[#c4a759] font-medium">
                              AI
                            </span>
                          )}
                        </div>

                        {/* Vote column + Body row */}
                        <div className="flex items-start gap-3">
                          <VoteColumn
                            score={a.score || 0}
                            userVote={a.user_vote_direction || 0}
                            onUpvote={() => handleVoteAnswer(a.id, 1)}
                            onDownvote={() => handleVoteAnswer(a.id, -1)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-text-secondary mb-3">
                              <MarkdownRenderer content={a.body} />
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs text-text-muted">
                                <button
                                  onClick={() => navigate(`/profile/${a.author_id || a.user_id}`)}
                                  className="hover:text-[#c4a759] transition-colors duration-150 cursor-pointer"
                                >
                                  {a.author_username || a.author || 'anonymous'}
                                </button>
                                {a.author_reputation != null && (
                                  <span className="text-[#c4a759]"> &middot; {a.author_reputation} rep</span>
                                )}
                                {' '}&middot; {timeAgo(a.created_at)}
                              </span>

                              <div className="ml-auto flex items-center gap-2">
                                {currentQuestion.is_owner && !a.is_accepted && (
                                  <button
                                    onClick={() => handleAcceptAnswer(a.id)}
                                    className="text-[10px] text-text-muted hover:text-[#6a9a6a] transition-colors duration-150 cursor-pointer"
                                  >
                                    accept
                                  </button>
                                )}
                                {a.is_owner && (
                                  <button
                                    onClick={() => handleDeleteAnswer(a.id)}
                                    className="text-[10px] text-text-muted hover:text-red-400 transition-colors duration-150 cursor-pointer"
                                  >
                                    delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Comments on answer */}
                        <CommentsSection
                          comments={a.comments || []}
                          targetType="answer"
                          targetId={a.id}
                          onCommentAdded={handleAnswerCommentAdded(a.id)}
                        />
                      </div>
                    ))}
                  </div>

                  {/* AI Answer button */}
                  {!sortedAnswers.some(a => a.is_accepted) && !sortedAnswers.some(a => a.is_ai) && currentQuestion.status !== 'closed' && (
                    <div className="mb-4">
                      <button
                        onClick={() => handleGetAiAnswer(currentQuestion.id)}
                        disabled={aiAnswerLoading}
                        className="bg-bg-secondary border border-[#c4a759]/25 text-[#c4a759] text-xs px-3 py-1.5 rounded hover:border-[#c4a759] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {aiAnswerLoading ? (
                          <>
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            generating AI answer...
                          </>
                        ) : (
                          'get AI answer'
                        )}
                      </button>
                    </div>
                  )}

                  {/* Answer form */}
                  {currentQuestion.status !== 'closed' ? (
                    <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-6">
                      <span className="text-[10px] uppercase tracking-widest text-text-muted block mb-2">
                        your answer
                      </span>
                      <textarea
                        value={answerBody}
                        onChange={e => setAnswerBody(e.target.value)}
                        placeholder="write your answer..."
                        rows={4}
                        className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759] resize-none mb-2"
                      />
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-[10px] text-text-muted">
                          supports markdown and LaTeX ($inline$, $$display$$)
                        </p>
                        <button
                          type="button"
                          onClick={() => setAnswerPreview(p => !p)}
                          className={`text-[10px] px-2 py-0.5 rounded transition-colors duration-150 cursor-pointer ${
                            answerPreview
                              ? 'bg-[#c4a759] text-black'
                              : 'text-text-muted hover:text-[#c4a759]'
                          }`}
                        >
                          {answerPreview ? 'hide preview' : 'preview'}
                        </button>
                      </div>
                      {answerPreview && answerBody.trim() && (
                        <div className="mb-3 bg-bg border border-border rounded-lg p-4">
                          <MarkdownRenderer content={answerBody} />
                        </div>
                      )}
                      <button
                        onClick={handleSubmitAnswer}
                        disabled={answerSubmitting || !answerBody.trim()}
                        className="bg-[#c4a759] text-black text-xs px-3 py-1.5 rounded hover:brightness-110 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {answerSubmitting ? 'submitting...' : 'submit answer'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-text-muted bg-bg-secondary border border-border rounded-lg p-4 mb-6 text-center">
                      this question is closed and no longer accepting answers
                    </div>
                  )}

                  {/* Similar questions */}
                  {similarQuestions.length > 0 && (
                    <div className="mb-4">
                      <span className="text-[10px] uppercase tracking-widest text-text-muted block mb-2">
                        similar questions
                      </span>
                      <div className="space-y-1">
                        {similarQuestions.map(sq => (
                          <button
                            key={sq.id}
                            onClick={() => handleViewQuestion(sq)}
                            className="block w-full text-left text-sm text-text-secondary hover:text-text hover:underline transition-colors duration-150 py-1 cursor-pointer"
                          >
                            {sq.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related notes */}
                  {relatedNotes.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-text-muted block mb-2">
                        related notes
                      </span>
                      <div className="space-y-1">
                        {relatedNotes.map(note => (
                          <a
                            key={note.id}
                            href={`/notes/${note.id}`}
                            className="block text-sm text-text-secondary hover:text-text hover:underline transition-colors duration-150 py-1"
                          >
                            {note.title || `note #${note.id}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Ask View ──────────────────────────────────────── */}
          {view === 'ask' && (
            <div>
              {/* Back button */}
              <button
                onClick={handleBackToList}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors duration-150 mb-4 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M9 3L5 7L9 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                back to questions
              </button>

              <h2 className="text-lg font-semibold text-text mb-5">ask a question</h2>

              {askError && (
                <div className="text-xs text-red-400 mb-3">{askError}</div>
              )}

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted block mb-1">
                    title
                  </label>
                  <input
                    type="text"
                    value={askTitle}
                    onChange={e => setAskTitle(e.target.value)}
                    placeholder="what's your question?"
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759]"
                  />
                </div>

                {/* Body */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted block mb-1">
                    body
                  </label>
                  <textarea
                    value={askBody}
                    onChange={e => setAskBody(e.target.value)}
                    placeholder="provide details about your question..."
                    rows={8}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759] resize-none"
                  />
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-text-muted">
                      supports markdown and LaTeX ($inline$, $$display$$)
                    </p>
                    <button
                      type="button"
                      onClick={() => setAskPreview(p => !p)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors duration-150 cursor-pointer ${
                        askPreview
                          ? 'bg-[#c4a759] text-black'
                          : 'text-text-muted hover:text-[#c4a759]'
                      }`}
                    >
                      {askPreview ? 'hide preview' : 'preview'}
                    </button>
                  </div>
                  {askPreview && askBody.trim() && (
                    <div className="mt-2 bg-bg-secondary border border-border rounded-lg p-4">
                      <MarkdownRenderer content={askBody} />
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted block mb-1">
                    tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={askTagsInput}
                    onChange={e => setAskTagsInput(e.target.value)}
                    placeholder="e.g. math, calculus, homework"
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759]"
                  />
                  {askTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {askTags.map(t => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[#c4a759] text-black"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linked note */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted block mb-1">
                    linked note id (optional)
                  </label>
                  <input
                    type="number"
                    value={askLinkedNote}
                    onChange={e => setAskLinkedNote(e.target.value)}
                    placeholder="note id"
                    className="w-48 bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-[#c4a759]"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSubmitQuestion}
                    disabled={askSubmitting || !askTitle.trim() || !askBody.trim()}
                    className="bg-[#c4a759] text-black text-xs px-3 py-1.5 rounded hover:brightness-110 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {askSubmitting ? 'submitting...' : 'submit question'}
                  </button>
                  <button
                    onClick={handleFindSimilar}
                    disabled={findingSimilar || !askTitle.trim()}
                    className="bg-bg-secondary border border-border text-text-muted text-xs px-3 py-1.5 rounded hover:border-[#c4a759] hover:text-[#c4a759] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {findingSimilar ? 'searching...' : 'find similar'}
                  </button>
                </div>

                {/* Similar questions */}
                {askSimilar.length > 0 && (
                  <div className="bg-bg-secondary border border-border rounded-lg p-4">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted block mb-2">
                      similar questions already asked
                    </span>
                    <div className="space-y-1">
                      {askSimilar.map(sq => (
                        <button
                          key={sq.id}
                          onClick={() => handleViewQuestion(sq)}
                          className="block w-full text-left text-sm text-text-secondary hover:text-text hover:underline transition-colors duration-150 py-1 cursor-pointer"
                        >
                          {sq.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
