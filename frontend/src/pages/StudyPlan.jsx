import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'
import { Plus, Trash2, ChevronRight, Calendar, BookOpen, Check } from 'lucide-react'

export default function StudyPlan() {
  const { dark } = useTheme()

  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [syllabusText, setSyllabusText] = useState('')
  const [loading, setLoading] = useState(true)

  const textPrimary = dark ? '#e0e0e0' : '#1a1a1a'
  const textSecondary = dark ? '#606060' : '#999'
  const textMuted = dark ? '#333' : '#bbb'
  const cardBg = dark ? '#0d0d0d' : '#fafafa'
  const cardBorder = dark ? '#1a1a1a' : '#eee'
  const gold = '#c4a759'

  const fetchPlans = async () => {
    try {
      const data = await api.get('/studyplan')
      setPlans(Array.isArray(data) ? data : data.results || [])
    } catch (err) {
      console.error('Failed to fetch study plans:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlanDetail = async (id) => {
    try {
      const data = await api.get(`/studyplan/${id}`)
      setSelectedPlan(data)
    } catch (err) {
      console.error('Failed to fetch plan detail:', err)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!title.trim() || !examDate || !syllabusText.trim()) return
    setCreating(true)
    try {
      const plan = await api.post('/studyplan/generate', {
        title: title.trim(),
        syllabus_text: syllabusText.trim(),
        exam_date: examDate,
      })
      setTitle('')
      setExamDate('')
      setSyllabusText('')
      setShowCreate(false)
      await fetchPlans()
      setSelectedPlan(plan)
    } catch (err) {
      console.error('Failed to generate study plan:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleToggleItem = async (itemId, currentCompleted) => {
    if (!selectedPlan) return
    const planId = selectedPlan.id
    // Optimistic update
    setSelectedPlan((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, completed: !currentCompleted } : item
      ),
    }))
    try {
      await api.put(`/studyplan/${planId}/items/${itemId}`, {
        completed: !currentCompleted,
      })
    } catch (err) {
      console.error('Failed to toggle item:', err)
      // Revert on failure
      setSelectedPlan((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId ? { ...item, completed: currentCompleted } : item
        ),
      }))
    }
  }

  const handleDeletePlan = async (planId) => {
    if (!window.confirm('delete this study plan?')) return
    try {
      await api.delete(`/studyplan/${planId}`)
      setPlans((prev) => prev.filter((p) => p.id !== planId))
      if (selectedPlan && selectedPlan.id === planId) {
        setSelectedPlan(null)
      }
    } catch (err) {
      console.error('Failed to delete plan:', err)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getProgressPercent = (plan) => {
    const total = plan.item_count ?? plan.items?.length ?? 0
    const completed = plan.completed_count ?? plan.items?.filter((i) => i.completed).length ?? 0
    if (total === 0) return 0
    return Math.round((completed / total) * 100)
  }

  const getStatusBadge = (plan) => {
    const percent = getProgressPercent(plan)
    if (percent === 100) return { label: 'complete', color: '#4a7aaa' }
    if (percent > 0) return { label: 'in progress', color: gold }
    return { label: 'not started', color: textSecondary }
  }

  // Plan detail view
  if (selectedPlan) {
    const items = selectedPlan.items || []
    const completedCount = items.filter((i) => i.completed).length
    const totalCount = items.length
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    return (
      <Layout>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 pt-16 pb-12 lg:pt-12">
            {/* Back button */}
            <button
              onClick={() => {
                setSelectedPlan(null)
                fetchPlans()
              }}
              className="flex items-center gap-1 text-xs mb-8 transition-colors"
              style={{ color: textSecondary }}
              onMouseEnter={(e) => (e.currentTarget.style.color = textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = textSecondary)}
            >
              <ChevronRight size={14} className="rotate-180" />
              back to plans
            </button>

            {/* Plan header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1
                  className="text-lg font-semibold mb-1 text-text"
                >
                  {selectedPlan.title}
                </h1>
                {selectedPlan.exam_date && (
                  <div
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: textSecondary }}
                  >
                    <Calendar size={12} />
                    exam: {formatDate(selectedPlan.exam_date)}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDeletePlan(selectedPlan.id)}
                className="p-2 rounded-md transition-colors"
                style={{ color: textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#aa4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = textMuted)}
                title="Delete plan"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs" style={{ color: textSecondary }}>
                  {completedCount} of {totalCount} completed
                </span>
                <span className="text-xs font-medium" style={{ color: gold }}>
                  {percent}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: dark ? '#1a1a1a' : '#e8e8e8' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${percent}%`, background: gold }}
                />
              </div>
            </div>

            {/* Timeline */}
            <div className="relative">
              {items.map((item, index) => {
                const isLast = index === items.length - 1

                return (
                  <div key={item.id} className="relative flex gap-4">
                    {/* Vertical line + dot */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      {/* Checkbox dot */}
                      <button
                        onClick={() => handleToggleItem(item.id, item.completed)}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 transition-colors"
                        style={{
                          borderColor: item.completed ? gold : (dark ? '#333' : '#ccc'),
                          background: item.completed ? gold : (dark ? '#0a0a0a' : '#fff'),
                        }}
                      >
                        {item.completed && (
                          <Check size={11} strokeWidth={3} style={{ color: '#000' }} />
                        )}
                      </button>
                      {/* Connecting line */}
                      {!isLast && (
                        <div
                          className="w-px flex-1 min-h-[24px]"
                          style={{
                            background: dark ? '#1a1a1a' : '#e0e0e0',
                          }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div
                      className="flex-1 pb-6 rounded-xl px-4 py-3 mb-2 border transition-opacity"
                      style={{
                        background: cardBg,
                        borderColor: cardBorder,
                        opacity: item.completed ? 0.5 : 1,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {item.date && (
                          <span
                            className="text-[11px] font-medium"
                            style={{ color: item.completed ? textMuted : gold }}
                          >
                            {formatDate(item.date)}
                          </span>
                        )}
                        {item.day_number != null && (
                          <span
                            className="text-[11px]"
                            style={{ color: textMuted }}
                          >
                            day {item.day_number}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-sm font-medium mb-0.5"
                        style={{
                          color: item.completed ? textMuted : textPrimary,
                          textDecoration: item.completed ? 'line-through' : 'none',
                        }}
                      >
                        {item.topic}
                      </p>
                      {item.description && (
                        <p
                          className="text-xs leading-relaxed"
                          style={{
                            color: item.completed ? textMuted : textSecondary,
                            textDecoration: item.completed ? 'line-through' : 'none',
                          }}
                        >
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {items.length === 0 && (
              <p className="text-center text-sm mt-12" style={{ color: textMuted }}>
                no items in this plan
              </p>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  // Plan list view
  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-12 lg:pt-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1
              className="text-lg font-semibold text-text"
            >
              study plans
            </h1>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors border"
              style={{
                background: dark ? '#191919' : '#f0f0f0',
                color: dark ? '#d4d4d4' : '#2a2a2a',
                borderColor: dark ? '#2a2a2a' : '#ddd',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = dark ? '#222222' : '#e8e8e8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = dark ? '#191919' : '#f0f0f0'
              }}
            >
              <Plus size={14} />
              new plan
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div
              className="rounded-xl p-5 mb-6 border"
              style={{ background: cardBg, borderColor: cardBorder }}
            >
              <h3
                className="text-sm font-semibold mb-4"
                style={{ color: textPrimary }}
              >
                create study plan
              </h3>
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label
                    className="block text-xs mb-1.5"
                    style={{ color: textSecondary }}
                  >
                    title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. linear algebra final"
                    className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors border"
                    style={{
                      background: dark ? '#111' : '#fff',
                      borderColor: dark ? '#1c1c1c' : '#e0e0e0',
                      color: dark ? '#d4d4d4' : '#2a2a2a',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#333' : '#bbb'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#1c1c1c' : '#e0e0e0'
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs mb-1.5"
                    style={{ color: textSecondary }}
                  >
                    exam date
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors border"
                    style={{
                      background: dark ? '#111' : '#fff',
                      borderColor: dark ? '#1c1c1c' : '#e0e0e0',
                      color: dark ? '#d4d4d4' : '#2a2a2a',
                      colorScheme: dark ? 'dark' : 'light',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#333' : '#bbb'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#1c1c1c' : '#e0e0e0'
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs mb-1.5"
                    style={{ color: textSecondary }}
                  >
                    syllabus
                  </label>
                  <textarea
                    value={syllabusText}
                    onChange={(e) => setSyllabusText(e.target.value)}
                    placeholder="paste your syllabus or course outline here..."
                    rows={8}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors border resize-none"
                    style={{
                      background: dark ? '#111' : '#fff',
                      borderColor: dark ? '#1c1c1c' : '#e0e0e0',
                      color: dark ? '#d4d4d4' : '#2a2a2a',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#333' : '#bbb'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#1c1c1c' : '#e0e0e0'
                    }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={creating || !title.trim() || !examDate || !syllabusText.trim()}
                    className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: gold, color: '#000' }}
                  >
                    {creating && (
                      <div className="animate-spin h-4 w-4 border-2 border-[#000] border-t-transparent rounded-full" />
                    )}
                    {creating ? 'generating...' : 'generate plan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false)
                      setTitle('')
                      setExamDate('')
                      setSyllabusText('')
                    }}
                    className="rounded-md px-3 py-2 text-sm transition-colors"
                    style={{ color: textSecondary }}
                  >
                    cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Plans list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl p-4 border"
                  style={{ background: cardBg, borderColor: cardBorder }}
                >
                  <div
                    className="h-4 rounded w-2/3 mb-3"
                    style={{ background: dark ? '#191919' : '#e8e8e8' }}
                  />
                  <div
                    className="h-3 rounded w-1/3"
                    style={{ background: dark ? '#191919' : '#e8e8e8' }}
                  />
                </div>
              ))}
            </div>
          ) : plans.length === 0 && !showCreate ? (
            <div className="text-center py-20">
              <BookOpen
                size={32}
                className="mx-auto mb-3"
                style={{ color: textMuted }}
              />
              <p className="text-sm mb-1" style={{ color: textSecondary }}>
                no study plans yet
              </p>
              <p className="text-xs" style={{ color: textMuted }}>
                create a plan to organize your study schedule
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => {
                const percent = getProgressPercent(plan)
                const status = getStatusBadge(plan)
                const total = plan.item_count ?? 0
                const completed = plan.completed_count ?? 0

                return (
                  <button
                    key={plan.id}
                    onClick={() => fetchPlanDetail(plan.id)}
                    className="w-full text-left group rounded-xl p-4 border transition-colors"
                    style={{ background: cardBg, borderColor: cardBorder }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = dark ? '#2a2a2a' : '#ddd'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = cardBorder
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: textPrimary }}
                      >
                        {plan.title}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{
                            color: status.color,
                            background: dark ? '#111' : '#f0f0f0',
                          }}
                        >
                          {status.label}
                        </span>
                        <ChevronRight
                          size={14}
                          style={{ color: textMuted }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2.5">
                      {plan.exam_date && (
                        <span
                          className="flex items-center gap-1 text-[11px]"
                          style={{ color: textSecondary }}
                        >
                          <Calendar size={11} />
                          {formatDate(plan.exam_date)}
                        </span>
                      )}
                      <span
                        className="text-[11px]"
                        style={{ color: textMuted }}
                      >
                        {completed}/{total} items
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div
                      className="h-1 rounded-full overflow-hidden"
                      style={{ background: dark ? '#1a1a1a' : '#e8e8e8' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, background: gold }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
