import { useState } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { usePlugins } from '../contexts/PluginContext'
import CustomPromptsSettings from '../components/plugins/CustomPromptsSettings'
import { Minus, Plus, Check, X, Eye, EyeOff } from 'lucide-react'

const FONT_SIZES = [
  { value: 'small', label: 'small' },
  { value: 'normal', label: 'normal' },
  { value: 'large', label: 'large' },
  { value: 'extra-large', label: 'extra large' },
]

const NOTE_TYPES = [
  { value: 'text', label: 'text' },
  { value: 'canvas', label: 'canvas' },
  { value: 'moodboard', label: 'moodboard' },
]

export default function Settings() {
  const { user, updateUser } = useAuth()
  const { dark, setThemeFromProfile } = useTheme()
  const pluginCtx = usePlugins()
  const [saving, setSaving] = useState({})
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)

  const saveSetting = async (key, value) => {
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await updateUser({ [key]: value })
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  const toggleVim = () => saveSetting('vim_enabled', !user.vim_enabled)

  const toggleTheme = () => {
    const newTheme = dark ? 'light' : 'dark'
    setThemeFromProfile(newTheme)
    saveSetting('theme', newTheme)
  }

  const Toggle = ({ checked, onChange, disabled }) => (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-9 h-[18px] rounded-full transition-colors duration-200 flex-shrink-0 ml-8 ${
        checked
          ? 'bg-[#c4a759]'
          : dark ? 'bg-[#222222] hover:bg-[#2a2a2a]' : 'bg-[#d0d0d0] hover:bg-[#c0c0c0]'
      } ${disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-3 h-3 rounded-full transition-transform duration-200 ${
          checked
            ? 'translate-x-[18px] bg-[#0a0a0a]'
            : dark ? 'translate-x-0 bg-[#606060]' : 'translate-x-0 bg-[#fff]'
        }`}
      />
    </button>
  )

  const SegmentedControl = ({ options, value, onChange, disabled }) => (
    <div className={`inline-flex rounded-lg p-0.5 ${dark ? 'bg-[#151515]' : 'bg-[#f0f0f0]'}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs rounded-md transition-all ${
            value === opt.value
              ? dark ? 'bg-[#222] text-[#d4d4d4] shadow-sm' : 'bg-white text-[#1a1a1a] shadow-sm'
              : dark ? 'text-[#606060] hover:text-[#888]' : 'text-[#999] hover:text-[#666]'
          } ${disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  const NumberStepper = ({ value, onChange, min, max, suffix, disabled }) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => value > min && onChange(value - 1)}
        disabled={disabled || value <= min}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
          dark ? 'bg-[#151515] text-[#606060] hover:text-[#888] hover:bg-[#1a1a1a]' : 'bg-[#f0f0f0] text-[#999] hover:text-[#666] hover:bg-[#e5e5e5]'
        } disabled:opacity-30`}
      >
        <Minus size={12} />
      </button>
      <span className={`text-sm font-mono w-12 text-center ${dark ? 'text-[#d4d4d4]' : 'text-[#1a1a1a]'}`}>
        {value}{suffix}
      </span>
      <button
        onClick={() => value < max && onChange(value + 1)}
        disabled={disabled || value >= max}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
          dark ? 'bg-[#151515] text-[#606060] hover:text-[#888] hover:bg-[#1a1a1a]' : 'bg-[#f0f0f0] text-[#999] hover:text-[#666] hover:bg-[#e5e5e5]'
        } disabled:opacity-30`}
      >
        <Plus size={12} />
      </button>
    </div>
  )

  const SettingRow = ({ label, description, children }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm text-text">{label}</div>
        {description && (
          <div className="text-xs text-text-muted mt-1 leading-relaxed">{description}</div>
        )}
      </div>
      {children}
    </div>
  )

  const SectionHeader = ({ label }) => (
    <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-4">{label}</span>
  )

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-16">
          <h1 className="text-sm font-medium text-text tracking-tight mb-10">settings</h1>

          {/* Appearance */}
          <section className="mb-10">
            <SectionHeader label="appearance" />
            <SettingRow label="theme" description="switch between dark and light mode">
              <Toggle checked={dark} onChange={toggleTheme} disabled={saving.theme} />
            </SettingRow>
          </section>

          {/* Editor */}
          <section className="mb-10">
            <SectionHeader label="editor" />
            <SettingRow label="vim mode" description="enable vim keybindings in the note editor">
              <Toggle checked={user?.vim_enabled} onChange={toggleVim} disabled={saving.vim_enabled} />
            </SettingRow>
            <SettingRow label="font size" description="editor text size">
              <SegmentedControl
                options={FONT_SIZES}
                value={user?.editor_font_size || 'normal'}
                onChange={(v) => saveSetting('editor_font_size', v)}
                disabled={saving.editor_font_size}
              />
            </SettingRow>
            <SettingRow label="default note type" description="type used when creating a new note">
              <SegmentedControl
                options={NOTE_TYPES}
                value={user?.default_note_type || 'text'}
                onChange={(v) => saveSetting('default_note_type', v)}
                disabled={saving.default_note_type}
              />
            </SettingRow>
          </section>

          {/* AI Keys */}
          <section className="mb-10">
            <SectionHeader label="ai" />
            <div className="text-xs text-text-muted mb-4 leading-relaxed">
              Your keys are encrypted and stored securely. They override the server's default keys.
            </div>

            {/* Anthropic API Key */}
            <div className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-text">anthropic api key</div>
                  <div className="text-xs text-text-muted mt-1">used for all AI features (chat, flashcards, quizzes, etc.)</div>
                </div>
                {user?.anthropic_api_key_set && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-[#1a2a1a] text-[#6a9a6a]' : 'bg-[#e8f5e8] text-[#4a8a4a]'}`}>
                    set {user.anthropic_api_key_hint && `(${user.anthropic_api_key_hint})`}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder={user?.anthropic_api_key_set ? 'enter new key to replace' : 'sk-ant-...'}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg pr-8 ${
                      dark ? 'bg-[#151515] text-[#d4d4d4] placeholder-[#444]' : 'bg-[#f0f0f0] text-[#1a1a1a] placeholder-[#aaa]'
                    } border ${dark ? 'border-[#222]' : 'border-[#ddd]'} focus:outline-none focus:border-[#c4a759]`}
                  />
                  <button
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 ${dark ? 'text-[#606060] hover:text-[#888]' : 'text-[#999] hover:text-[#666]'}`}
                  >
                    {showAnthropicKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!anthropicKey.trim()) return
                    setSaving(s => ({ ...s, anthropic: true }))
                    try {
                      await updateUser({ anthropic_api_key: anthropicKey })
                      setAnthropicKey('')
                    } finally {
                      setSaving(s => ({ ...s, anthropic: false }))
                    }
                  }}
                  disabled={saving.anthropic || !anthropicKey.trim()}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    dark ? 'bg-[#222] text-[#d4d4d4] hover:bg-[#2a2a2a]' : 'bg-[#e5e5e5] text-[#1a1a1a] hover:bg-[#ddd]'
                  } disabled:opacity-30`}
                >
                  {saving.anthropic ? '...' : <Check size={12} />}
                </button>
                {user?.anthropic_api_key_set && (
                  <button
                    onClick={async () => {
                      setSaving(s => ({ ...s, anthropic_remove: true }))
                      try {
                        await updateUser({ anthropic_api_key: '' })
                        setAnthropicKey('')
                      } finally {
                        setSaving(s => ({ ...s, anthropic_remove: false }))
                      }
                    }}
                    disabled={saving.anthropic_remove}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      dark ? 'bg-[#2a1a1a] text-[#c47070] hover:bg-[#331a1a]' : 'bg-[#fde8e8] text-[#c44040] hover:bg-[#fbd5d5]'
                    } disabled:opacity-30`}
                  >
                    {saving.anthropic_remove ? '...' : <X size={12} />}
                  </button>
                )}
              </div>
            </div>

            {/* OpenAI API Key */}
            <div className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-text">openai api key</div>
                  <div className="text-xs text-text-muted mt-1">used for audio transcription (Whisper)</div>
                </div>
                {user?.openai_api_key_set && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-[#1a2a1a] text-[#6a9a6a]' : 'bg-[#e8f5e8] text-[#4a8a4a]'}`}>
                    set {user.openai_api_key_hint && `(${user.openai_api_key_hint})`}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder={user?.openai_api_key_set ? 'enter new key to replace' : 'sk-...'}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg pr-8 ${
                      dark ? 'bg-[#151515] text-[#d4d4d4] placeholder-[#444]' : 'bg-[#f0f0f0] text-[#1a1a1a] placeholder-[#aaa]'
                    } border ${dark ? 'border-[#222]' : 'border-[#ddd]'} focus:outline-none focus:border-[#c4a759]`}
                  />
                  <button
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 ${dark ? 'text-[#606060] hover:text-[#888]' : 'text-[#999] hover:text-[#666]'}`}
                  >
                    {showOpenaiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!openaiKey.trim()) return
                    setSaving(s => ({ ...s, openai: true }))
                    try {
                      await updateUser({ openai_api_key: openaiKey })
                      setOpenaiKey('')
                    } finally {
                      setSaving(s => ({ ...s, openai: false }))
                    }
                  }}
                  disabled={saving.openai || !openaiKey.trim()}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    dark ? 'bg-[#222] text-[#d4d4d4] hover:bg-[#2a2a2a]' : 'bg-[#e5e5e5] text-[#1a1a1a] hover:bg-[#ddd]'
                  } disabled:opacity-30`}
                >
                  {saving.openai ? '...' : <Check size={12} />}
                </button>
                {user?.openai_api_key_set && (
                  <button
                    onClick={async () => {
                      setSaving(s => ({ ...s, openai_remove: true }))
                      try {
                        await updateUser({ openai_api_key: '' })
                        setOpenaiKey('')
                      } finally {
                        setSaving(s => ({ ...s, openai_remove: false }))
                      }
                    }}
                    disabled={saving.openai_remove}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      dark ? 'bg-[#2a1a1a] text-[#c47070] hover:bg-[#331a1a]' : 'bg-[#fde8e8] text-[#c44040] hover:bg-[#fbd5d5]'
                    } disabled:opacity-30`}
                  >
                    {saving.openai_remove ? '...' : <X size={12} />}
                  </button>
                )}
              </div>
            </div>

            <SettingRow label="contextual ai" description="ai adapts to your study history — strengths, weaknesses, and progress">
              <Toggle
                checked={user?.contextual_ai !== false}
                onChange={() => saveSetting('contextual_ai', !(user?.contextual_ai !== false))}
              />
            </SettingRow>
          </section>

          {/* Nudges */}
          <section className="mb-10">
            <SectionHeader label="nudges" />
            <SettingRow label="cards due" description="notify when flashcards are due for review">
              <Toggle
                checked={user?.nudge_preferences?.cards_due !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, cards_due: user?.nudge_preferences?.cards_due === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="severely overdue" description="notify when cards are 2+ days overdue">
              <Toggle
                checked={user?.nudge_preferences?.severely_overdue !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, severely_overdue: user?.nudge_preferences?.severely_overdue === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="topic overdue" description="notify about overdue cards grouped by topic">
              <Toggle
                checked={user?.nudge_preferences?.topic_overdue !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, topic_overdue: user?.nudge_preferences?.topic_overdue === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="study plan" description="remind about today's study plan items">
              <Toggle
                checked={user?.nudge_preferences?.study_plan !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, study_plan: user?.nudge_preferences?.study_plan === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="streak at risk" description="warn when your study streak might break">
              <Toggle
                checked={user?.nudge_preferences?.streak_risk !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, streak_risk: user?.nudge_preferences?.streak_risk === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="stale notes" description="flag notes untouched for 2+ weeks">
              <Toggle
                checked={user?.nudge_preferences?.stale_notes !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, stale_notes: user?.nudge_preferences?.stale_notes === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="draft notes" description="remind about unfinished draft notes">
              <Toggle
                checked={user?.nudge_preferences?.draft_notes !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, draft_notes: user?.nudge_preferences?.draft_notes === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
            <SettingRow label="quiz regression" description="alert when quiz scores drop significantly">
              <Toggle
                checked={user?.nudge_preferences?.quiz_regression !== false}
                onChange={() => saveSetting('nudge_preferences', { ...user?.nudge_preferences, quiz_regression: user?.nudge_preferences?.quiz_regression === false })}
                disabled={saving.nudge_preferences}
              />
            </SettingRow>
          </section>

          {/* Pomodoro */}
          <section className="mb-10">
            <SectionHeader label="pomodoro" />
            <SettingRow label="focus duration" description="minutes per focus session">
              <NumberStepper
                value={user?.pomodoro_focus || 25}
                onChange={(v) => saveSetting('pomodoro_focus', v)}
                min={1} max={120} suffix="m"
                disabled={saving.pomodoro_focus}
              />
            </SettingRow>
            <SettingRow label="short break" description="minutes between focus sessions">
              <NumberStepper
                value={user?.pomodoro_short_break || 5}
                onChange={(v) => saveSetting('pomodoro_short_break', v)}
                min={1} max={30} suffix="m"
                disabled={saving.pomodoro_short_break}
              />
            </SettingRow>
            <SettingRow label="long break" description="minutes after every 4 sessions">
              <NumberStepper
                value={user?.pomodoro_long_break || 15}
                onChange={(v) => saveSetting('pomodoro_long_break', v)}
                min={1} max={60} suffix="m"
                disabled={saving.pomodoro_long_break}
              />
            </SettingRow>
          </section>

          {/* Plugins */}
          {pluginCtx?.plugins?.length > 0 && (
            <section className="mb-10">
              <SectionHeader label="plugins" />
              {pluginCtx.plugins.map(p => (
                <SettingRow key={p.id} label={p.name} description={p.description}>
                  <Toggle
                    checked={p.enabled}
                    onChange={() => pluginCtx.togglePlugin(p.id, !p.enabled)}
                  />
                </SettingRow>
              ))}

              {/* Render plugin settings sections */}
              {pluginCtx.getSettingsSections().map(section => (
                <div key={section.id} className="mt-6">
                  <SectionHeader label={section.label} />
                  {section.id === 'custom_prompts' && <CustomPromptsSettings />}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </Layout>
  )
}
