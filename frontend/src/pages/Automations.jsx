import { useState, useEffect, useCallback } from 'react'
import { Zap, Plus, Trash2, X, Check, AlertTriangle, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../lib/api'
import { useTheme } from '../contexts/ThemeContext'
import Layout from '../components/Layout'

const TRIGGER_LABELS = {
  note_updated: 'Note updated',
  import_completed: 'Import completed',
  quiz_completed: 'Quiz completed',
  feynman_completed: 'Feynman session completed',
  flashcard_reviewed: 'Flashcard reviewed',
  pomodoro_completed: 'Pomodoro completed',
}

const ACTION_LABELS = {
  generate_flashcards: 'Generate flashcards',
  generate_quiz: 'Generate quiz',
  create_todo: 'Create todo',
  create_notification: 'Send notification',
  analyze_note: 'Analyze note',
}

const PRESETS = [
  {
    name: 'Auto-generate flashcards on import',
    description: 'When notes are imported, generate 10 flashcards automatically',
    trigger_type: 'import_completed',
    trigger_config: {},
    action_type: 'generate_flashcards',
    action_config: { count: 10 },
  },
  {
    name: 'Re-study weak Feynman topics',
    description: 'Create a todo when Feynman score is below 60%',
    trigger_type: 'feynman_completed',
    trigger_config: { score_below: 60 },
    action_type: 'create_todo',
    action_config: { text_template: 'Re-study: {topic} (scored {score}%)' },
  },
  {
    name: 'Notify on low quiz score',
    description: 'Get notified when you score below 70% on a quiz',
    trigger_type: 'quiz_completed',
    trigger_config: { score_below: 70 },
    action_type: 'create_notification',
    action_config: { title_template: 'Quiz needs review', body_template: 'You scored {score}/{total} on {title}.' },
  },
  {
    name: 'Auto-analyze on save',
    description: 'Run AI analysis whenever a note is updated',
    trigger_type: 'note_updated',
    trigger_config: {},
    action_type: 'analyze_note',
    action_config: {},
  },
  {
    name: 'Quiz from import',
    description: 'Auto-generate a quiz when notes are imported',
    trigger_type: 'import_completed',
    trigger_config: {},
    action_type: 'generate_quiz',
    action_config: { count: 5 },
  },
]

function timeAgo(iso) {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Create/Edit Modal ────────────────────────────────────────────────────────

function RuleModal({ onClose, onSave, initial }) {
  const [name, setName] = useState(initial?.name || '')
  const [triggerType, setTriggerType] = useState(initial?.trigger_type || 'note_updated')
  const [actionType, setActionType] = useState(initial?.action_type || 'generate_flashcards')
  const [triggerConfig, setTriggerConfig] = useState(initial?.trigger_config || {})
  const [actionConfig, setActionConfig] = useState(initial?.action_config || {})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name, trigger_type: triggerType, trigger_config: triggerConfig, action_type: actionType, action_config: actionConfig })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  const hasScoreCondition = ['quiz_completed', 'feynman_completed'].includes(triggerType)
  const hasQualityCondition = triggerType === 'flashcard_reviewed'
  const needsCount = ['generate_flashcards', 'generate_quiz'].includes(actionType)
  const needsTemplate = ['create_todo', 'create_notification'].includes(actionType)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#0e0e0e] border border-[#1c1c1c] rounded-xl w-full max-w-md p-6 space-y-5 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#e0e0e0]">{initial ? 'Edit' : 'New'} Automation</h3>
          <button onClick={onClose} className="text-[#444] hover:text-[#808080]"><X size={16} /></button>
        </div>

        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[#444444]">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My automation"
            className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] placeholder-[#333] focus:outline-none focus:border-[#2a2a2a]" />
        </div>

        {/* Trigger */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[#444444]">When</label>
          <select value={triggerType} onChange={e => { setTriggerType(e.target.value); setTriggerConfig({}) }}
            className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]">
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Score condition */}
        {hasScoreCondition && (
          <div className="space-y-1 pl-3 border-l-2 border-[#1c1c1c]">
            <label className="text-[10px] uppercase tracking-wider text-[#444444]">Score below (%)</label>
            <input type="number" min={0} max={100} value={triggerConfig.score_below ?? ''} placeholder="e.g., 70"
              onChange={e => setTriggerConfig(prev => ({ ...prev, score_below: e.target.value ? Number(e.target.value) : undefined }))}
              className="w-24 px-3 py-1.5 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] focus:outline-none" />
          </div>
        )}
        {hasQualityCondition && (
          <div className="space-y-1 pl-3 border-l-2 border-[#1c1c1c]">
            <label className="text-[10px] uppercase tracking-wider text-[#444444]">Quality below (0-5)</label>
            <input type="number" min={0} max={5} value={triggerConfig.quality_below ?? ''} placeholder="e.g., 3"
              onChange={e => setTriggerConfig(prev => ({ ...prev, quality_below: e.target.value ? Number(e.target.value) : undefined }))}
              className="w-24 px-3 py-1.5 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] focus:outline-none" />
          </div>
        )}

        {/* Action */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[#444444]">Then</label>
          <select value={actionType} onChange={e => { setActionType(e.target.value); setActionConfig({}) }}
            className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] focus:outline-none focus:border-[#2a2a2a]">
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Action config */}
        {needsCount && (
          <div className="space-y-1 pl-3 border-l-2 border-[#1c1c1c]">
            <label className="text-[10px] uppercase tracking-wider text-[#444444]">Count</label>
            <input type="number" min={1} max={20} value={actionConfig.count ?? 10}
              onChange={e => setActionConfig(prev => ({ ...prev, count: Number(e.target.value) }))}
              className="w-24 px-3 py-1.5 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] focus:outline-none" />
          </div>
        )}
        {needsTemplate && (
          <div className="space-y-1 pl-3 border-l-2 border-[#1c1c1c]">
            <label className="text-[10px] uppercase tracking-wider text-[#444444]">
              {actionType === 'create_todo' ? 'Todo text' : 'Notification title'}
            </label>
            <input
              value={actionType === 'create_todo' ? (actionConfig.text_template ?? '') : (actionConfig.title_template ?? '')}
              onChange={e => setActionConfig(prev => actionType === 'create_todo'
                ? { ...prev, text_template: e.target.value }
                : { ...prev, title_template: e.target.value }
              )}
              placeholder="Use {topic}, {score}, {title} as variables"
              className="w-full px-3 py-1.5 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] placeholder-[#333] focus:outline-none" />
            {actionType === 'create_notification' && (
              <>
                <label className="text-[10px] uppercase tracking-wider text-[#444444] block mt-2">Body</label>
                <input value={actionConfig.body_template ?? ''}
                  onChange={e => setActionConfig(prev => ({ ...prev, body_template: e.target.value }))}
                  placeholder="Optional body text"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#111] border border-[#1c1c1c] text-xs text-[#d4d4d4] placeholder-[#333] focus:outline-none" />
              </>
            )}
          </div>
        )}

        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-2.5 rounded-lg bg-[#c4a759] text-[#0a0a0a] text-xs font-semibold hover:bg-[#d4b769] transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Automation'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Automations() {
  const { dark } = useTheme()
  const [rules, setRules] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRule, setEditRule] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const [rulesData, logsData] = await Promise.all([
        api.get('/automations'),
        api.get('/automations/logs?limit=10'),
      ])
      setRules(rulesData.rules || [])
      setLogs(logsData.logs || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreate = async (data) => {
    await api.post('/automations', data)
    fetchData()
  }

  const handleToggle = async (rule) => {
    await api.put(`/automations/${rule.id}`, { enabled: !rule.enabled })
    fetchData()
  }

  const handleDelete = async (id) => {
    await api.delete(`/automations/${id}`)
    fetchData()
  }

  const handlePreset = async (preset) => {
    await api.post('/automations', preset)
    fetchData()
  }

  const existingTriggerActions = new Set(rules.map(r => `${r.trigger_type}:${r.action_type}`))
  const availablePresets = PRESETS.filter(p => !existingTriggerActions.has(`${p.trigger_type}:${p.action_type}`))

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#191919] border border-[#1c1c1c] flex items-center justify-center">
                <Zap size={15} className="text-[#c4a759]" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-[#e0e0e0]">Automations</h1>
                <p className="text-[11px] text-[#606060]">When something happens, do something else.</p>
              </div>
            </div>
            <button onClick={() => { setEditRule(null); setModalOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c4a759] text-[#0a0a0a] text-[11px] font-semibold hover:bg-[#d4b769] transition-colors">
              <Plus size={12} /> New
            </button>
          </div>

          {/* Quick Setup Presets */}
          {availablePresets.length > 0 && (
            <div className="space-y-3">
              <span className="text-[10px] uppercase tracking-wider text-[#444444]">Quick setup</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availablePresets.map((preset, i) => (
                  <button key={i} onClick={() => handlePreset(preset)}
                    className="text-left p-3 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c] hover:border-[#2a2a2a] transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-[11px] text-[#b0b0b0] font-medium truncate">{preset.name}</p>
                        <p className="text-[10px] text-[#444444] line-clamp-2">{preset.description}</p>
                      </div>
                      <Plus size={12} className="text-[#333] group-hover:text-[#c4a759] transition-colors flex-shrink-0 mt-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Rules */}
          <div className="space-y-3">
            <span className="text-[10px] uppercase tracking-wider text-[#444444]">
              Your automations {rules.length > 0 && <span className="text-[#333]">({rules.length})</span>}
            </span>
            {loading ? (
              <div className="space-y-2">
                {[1, 0.8, 0.9].map((w, i) => (
                  <div key={i} className="h-16 rounded-lg bg-[#0e0e0e] animate-pulse" style={{ opacity: w }} />
                ))}
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Zap size={24} className="mx-auto text-[#2a2a2a]" />
                <p className="text-xs text-[#444444]">No automations yet. Use a preset above or create a custom one.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div key={rule.id} className="p-3.5 rounded-lg border transition-colors"
                    style={{
                      background: dark ? '#0e0e0e' : '#faf9f6',
                      borderColor: rule.enabled ? (dark ? '#1c1c1c' : '#e0ddd6') : (dark ? '#151515' : '#eee'),
                      opacity: rule.enabled ? 1 : 0.6,
                    }}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => handleToggle(rule)} className="mt-0.5 flex-shrink-0">
                        {rule.enabled ? (
                          <ToggleRight size={20} className="text-[#c4a759]" />
                        ) : (
                          <ToggleLeft size={20} className="text-[#333]" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#d4d4d4] truncate">{rule.name}</p>
                        <p className="text-[10px] text-[#606060] mt-0.5">
                          {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                          {' → '}
                          {ACTION_LABELS[rule.action_type] || rule.action_type}
                        </p>
                        <p className="text-[9px] text-[#333] mt-1">
                          Ran {rule.trigger_count} time{rule.trigger_count !== 1 ? 's' : ''}
                          {rule.last_triggered_at && ` · Last: ${timeAgo(rule.last_triggered_at)}`}
                        </p>
                      </div>
                      <button onClick={() => handleDelete(rule.id)}
                        className="text-[#333] hover:text-[#ef4444] transition-colors flex-shrink-0 p-1">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          {logs.length > 0 && (
            <div className="space-y-3">
              <span className="text-[10px] uppercase tracking-wider text-[#444444]">Recent activity</span>
              <div className="space-y-1">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[10px]"
                    style={{ background: dark ? '#0a0a0a' : '#faf9f6' }}>
                    {log.status === 'success' ? (
                      <Check size={10} className="text-[#4ade80] flex-shrink-0" />
                    ) : log.status === 'failed' ? (
                      <AlertTriangle size={10} className="text-[#ef4444] flex-shrink-0" />
                    ) : (
                      <ChevronRight size={10} className="text-[#333] flex-shrink-0" />
                    )}
                    <span className="text-[#808080] flex-1 truncate">{log.rule_name}</span>
                    <span className="text-[#333] flex-shrink-0">{timeAgo(log.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <RuleModal
          initial={editRule}
          onClose={() => setModalOpen(false)}
          onSave={handleCreate}
        />
      )}
    </Layout>
  )
}
