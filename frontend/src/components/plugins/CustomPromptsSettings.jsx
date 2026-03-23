import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useTheme } from '../../contexts/ThemeContext'
import { Plus, Trash2 } from 'lucide-react'

export default function CustomPromptsSettings() {
  const { dark } = useTheme()
  const [prompts, setPrompts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [template, setTemplate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/plugins/custom_prompts').then(setPrompts).catch(() => {})
  }, [])

  const handleCreate = async () => {
    if (!name.trim() || !label.trim() || !template.trim()) return
    setSaving(true)
    try {
      const created = await api.post('/plugins/custom_prompts', {
        name: name.trim(),
        label: label.trim(),
        prompt_template: template.trim(),
      })
      setPrompts(prev => [created, ...prev])
      setName('')
      setLabel('')
      setTemplate('')
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    await api.delete(`/plugins/custom_prompts/${id}`)
    setPrompts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted">your custom selection actions. use {'{text}'} in templates for selected text.</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-colors ${
            dark ? 'bg-[#1a1a1a] text-text-secondary hover:bg-[#222]' : 'bg-[#f0f0f0] text-[#666] hover:bg-[#e5e5e5]'
          }`}
        >
          <Plus size={10} />
          add
        </button>
      </div>

      {showForm && (
        <div className={`rounded-lg p-3 mb-3 space-y-2 ${dark ? 'bg-[#0a0a0a] border border-[#1c1c1c]' : 'bg-white border border-[#ddd]'}`}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="action name (e.g. eli5)"
            className={`w-full px-2.5 py-1.5 text-xs rounded-md ${
              dark ? 'bg-[#141414] text-text placeholder-[#444] border border-[#1c1c1c]' : 'bg-[#f8f8f8] text-[#1a1a1a] placeholder-[#aaa] border border-[#ddd]'
            } focus:outline-none focus:border-[#c4a759]`}
          />
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="display label (e.g. explain like i'm 5)"
            className={`w-full px-2.5 py-1.5 text-xs rounded-md ${
              dark ? 'bg-[#141414] text-text placeholder-[#444] border border-[#1c1c1c]' : 'bg-[#f8f8f8] text-[#1a1a1a] placeholder-[#aaa] border border-[#ddd]'
            } focus:outline-none focus:border-[#c4a759]`}
          />
          <textarea
            value={template}
            onChange={e => setTemplate(e.target.value)}
            placeholder="prompt template (use {text} for selected text)"
            rows={3}
            className={`w-full px-2.5 py-1.5 text-xs rounded-md resize-none ${
              dark ? 'bg-[#141414] text-text placeholder-[#444] border border-[#1c1c1c]' : 'bg-[#f8f8f8] text-[#1a1a1a] placeholder-[#aaa] border border-[#ddd]'
            } focus:outline-none focus:border-[#c4a759]`}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
            >
              cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !template.trim()}
              className={`px-3 py-1 text-[10px] rounded-md transition-colors ${
                dark ? 'bg-[#c4a759] text-[#0a0a0a] hover:bg-[#d4b769]' : 'bg-[#c4a759] text-white hover:bg-[#b49749]'
              } disabled:opacity-40`}
            >
              {saving ? '...' : 'save'}
            </button>
          </div>
        </div>
      )}

      {prompts.length === 0 && !showForm && (
        <p className="text-xs text-text-muted py-2">no custom prompts yet</p>
      )}

      <div className="space-y-1">
        {prompts.map(p => (
          <div key={p.id} className={`flex items-center justify-between py-2 px-2.5 rounded-md ${dark ? 'hover:bg-[#111]' : 'hover:bg-[#f8f8f8]'}`}>
            <div className="min-w-0 flex-1">
              <span className="text-xs text-text block">{p.label}</span>
              <span className="text-[10px] text-text-muted block truncate">{p.prompt_template.slice(0, 80)}{p.prompt_template.length > 80 ? '...' : ''}</span>
            </div>
            <button
              onClick={() => handleDelete(p.id)}
              className="ml-2 p-1 text-text-muted hover:text-red-400 transition-colors flex-shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
