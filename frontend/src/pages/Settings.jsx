import { useState } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Minus, Plus } from 'lucide-react'

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
  const [saving, setSaving] = useState({})

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
        </div>
      </div>
    </Layout>
  )
}
