import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { Calendar, Webhook, Upload, Copy, Check, Trash2, Plus, RefreshCw, Send, FileText, X, Unplug, Loader2 } from 'lucide-react'

export default function Integrations() {
  const { dark } = useTheme()
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [gcalBanner, setGcalBanner] = useState(searchParams.get('gcal') === 'connected')
  const [syncing, setSyncing] = useState(false)

  // Webhook form
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState({
    daily_brief: true,
    flashcard_due: true,
    quiz_complete: true,
    study_streak: true,
  })

  // Import state
  const [importing, setImporting] = useState(null) // 'notion' | 'obsidian' | null
  const [importResult, setImportResult] = useState(null)
  const notionRef = useRef(null)
  const obsidianRef = useRef(null)

  const calendarFeed = integrations.find(i => i.type === 'calendar_feed')
  const googleCalendar = integrations.find(i => i.type === 'google_calendar')
  const webhooks = integrations.filter(i => i.type === 'webhook')

  useEffect(() => {
    loadIntegrations()
    // Clear gcal query param
    if (searchParams.get('gcal')) {
      searchParams.delete('gcal')
      setSearchParams(searchParams, { replace: true })
      setTimeout(() => setGcalBanner(false), 4000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadIntegrations = async () => {
    try {
      const data = await api.get('/integrations')
      setIntegrations(data)
    } catch (e) {
      addToast(e.message || 'Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }

  const feedUrl = calendarFeed
    ? `${window.location.origin}/integrations/calendar/feed/${calendarFeed.token}.ics`
    : null

  const enableCalendar = async () => {
    try {
      await api.post('/integrations/calendar', {})
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const disableCalendar = async () => {
    try {
      await api.delete('/integrations/calendar')
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const regenerateCalendar = async () => {
    try {
      await api.post('/integrations/calendar/regenerate', {})
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const copyFeedUrl = () => {
    if (!feedUrl) return
    navigator.clipboard.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Google Calendar
  const connectGoogleCalendar = async () => {
    try {
      const { authorize_url } = await api.get('/integrations/google-calendar/authorize')
      window.location.href = authorize_url
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const disconnectGoogleCalendar = async () => {
    try {
      await api.delete('/integrations/google-calendar')
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const syncGoogleCalendar = async () => {
    setSyncing(true)
    try {
      await api.post('/integrations/google-calendar/sync', {})
    } catch (e) { addToast(e.message || 'Something went wrong') }
    finally { setSyncing(false) }
  }

  const gcalError = googleCalendar?.config?.error

  const createWebhook = async () => {
    if (!webhookUrl.trim()) return
    try {
      await api.post('/integrations/webhook', { url: webhookUrl, events: webhookEvents })
      setWebhookUrl('')
      setShowWebhookForm(false)
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const toggleWebhook = async (id, enabled) => {
    try {
      await api.put(`/integrations/webhook/${id}`, { enabled: !enabled })
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const deleteWebhook = async (id) => {
    try {
      await api.delete(`/integrations/webhook/${id}`)
      await loadIntegrations()
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const testWebhook = async (id) => {
    try {
      const result = await api.post(`/integrations/webhook/${id}/test`, {})
      alert(result.success ? 'Webhook test sent successfully!' : `Test failed: ${result.error || 'Unknown error'}`)
    } catch (e) { addToast(e.message || 'Something went wrong') }
  }

  const handleImport = async (type) => {
    const ref = type === 'notion' ? notionRef : obsidianRef
    ref.current?.click()
  }

  const onImportFile = async (type, file) => {
    if (!file) return
    setImporting(type)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await api.upload(`/imports/${type}`, form)
      setImportResult({ type, ...result })
    } catch (e) {
      setImportResult({ type, error: e.message })
    } finally {
      setImporting(null)
    }
  }

  const SectionHeader = ({ label, icon: Icon }) => (
    <div className="flex items-center gap-2 mb-6">
      {Icon && <Icon size={14} className="text-text-muted" />}
      <span className="text-[10px] uppercase tracking-widest text-text-muted">{label}</span>
    </div>
  )

  const Toggle = ({ checked, onChange }) => (
    <button
      onClick={onChange}
      className={`relative w-9 h-[18px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked
          ? 'bg-[#c4a759]'
          : dark ? 'bg-[#222222] hover:bg-[#2a2a2a]' : 'bg-[#d0d0d0] hover:bg-[#c0c0c0]'
      } cursor-pointer`}
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

  if (loading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-text-muted">loading...</span>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-16">
          <h1 className="text-sm font-medium text-text tracking-tight mb-10">integrations</h1>

          {/* Google Calendar connected banner */}
          {gcalBanner && (
            <div
              className="p-3 rounded-lg text-xs mb-8 transition-opacity"
              style={{ background: dark ? '#1a2a1a' : '#e8fce8', color: '#4a7a4a' }}
            >
              Google Calendar connected! Your study events are syncing now.
            </div>
          )}

          {/* Calendar Feed */}
          <section className="mb-12">
            <SectionHeader label="calendar feed" icon={Calendar} />
            {calendarFeed ? (
              <div className="space-y-4">
                <div
                  className="p-3 rounded-lg text-xs font-mono break-all"
                  style={{ background: dark ? '#151515' : '#f0f0f0', color: dark ? '#888' : '#666' }}
                >
                  {feedUrl}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyFeedUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{
                      background: copied ? (dark ? '#2a3a2a' : '#e0f0e0') : (dark ? '#1a1a1a' : '#f0f0f0'),
                      color: copied ? '#4a7a4a' : (dark ? '#d4d4d4' : '#333'),
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'copied' : 'copy url'}
                  </button>
                  <button
                    onClick={regenerateCalendar}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#888' : '#666' }}
                  >
                    <RefreshCw size={12} />
                    regenerate
                  </button>
                  <button
                    onClick={disableCalendar}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{ background: dark ? '#2a1a1a' : '#fce8e8', color: '#884444' }}
                  >
                    <Trash2 size={12} />
                    disable
                  </button>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Add this URL to Google Calendar, Apple Calendar, or Outlook to see your study schedule.
                  The feed includes flashcard review dates, todos with due dates, and study plan items.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-text-muted leading-relaxed">
                  Generate a calendar feed URL to sync your study schedule with Google Calendar, Apple Calendar, or Outlook.
                </p>
                <button
                  onClick={enableCalendar}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                  style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                >
                  <Calendar size={12} />
                  enable calendar feed
                </button>
              </div>
            )}
          </section>

          {/* Google Calendar */}
          <section className="mb-12">
            <SectionHeader label="google calendar" icon={Calendar} />
            {googleCalendar ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: gcalError ? '#c4a759' : '#4a7a4a' }}
                  />
                  <span className="text-xs text-text-secondary">
                    {gcalError === 'token_revoked' ? 'Access revoked — reconnect required' : 'Connected'}
                  </span>
                </div>

                {gcalError === 'token_revoked' && (
                  <div
                    className="p-3 rounded-lg text-xs"
                    style={{ background: dark ? '#2a2a1a' : '#fef9e8', color: '#887744' }}
                  >
                    Google revoked access. Click reconnect to re-authorize.
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {gcalError === 'token_revoked' ? (
                    <button
                      onClick={connectGoogleCalendar}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                      style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                    >
                      <RefreshCw size={12} />
                      reconnect
                    </button>
                  ) : (
                    <button
                      onClick={syncGoogleCalendar}
                      disabled={syncing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-50"
                      style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                    >
                      {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {syncing ? 'syncing...' : 'full sync'}
                    </button>
                  )}
                  <button
                    onClick={disconnectGoogleCalendar}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{ background: dark ? '#2a1a1a' : '#fce8e8', color: '#884444' }}
                  >
                    <Unplug size={12} />
                    disconnect
                  </button>
                </div>

                <p className="text-xs text-text-muted leading-relaxed">
                  Events are automatically created in a "Hang.ai Study Schedule" calendar when you
                  add todos, generate study plans, or review flashcards.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-text-muted leading-relaxed">
                  Connect your Google account to create study events directly in your Google Calendar.
                  Todos, study plan items, and flashcard reviews will sync automatically.
                </p>
                <button
                  onClick={connectGoogleCalendar}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                  style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                >
                  <Calendar size={12} />
                  connect google calendar
                </button>
              </div>
            )}
          </section>

          {/* Webhooks */}
          <section className="mb-12">
            <SectionHeader label="webhooks" icon={Webhook} />
            <p className="text-xs text-text-muted leading-relaxed mb-4">
              Send notifications to Slack, Discord, or any URL when study events occur.
            </p>

            {webhooks.length > 0 && (
              <div className="space-y-2 mb-4">
                {webhooks.map(wh => (
                  <div
                    key={wh.id}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: dark ? '#111111' : '#f8f8f8', border: `1px solid ${dark ? '#1c1c1c' : '#e5e5e5'}` }}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="text-xs font-mono text-text-secondary truncate">
                        {wh.config?.url || 'No URL'}
                      </div>
                      <div className="text-[10px] text-text-muted mt-1">
                        {Object.entries(wh.config?.events || {}).filter(([, v]) => v).map(([k]) => k).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={wh.enabled} onChange={() => toggleWebhook(wh.id, wh.enabled)} />
                      <button
                        onClick={() => testWebhook(wh.id)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: dark ? '#606060' : '#999' }}
                        title="Test webhook"
                      >
                        <Send size={12} />
                      </button>
                      <button
                        onClick={() => deleteWebhook(wh.id)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: '#884444' }}
                        title="Delete webhook"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showWebhookForm ? (
              <div
                className="p-4 rounded-lg space-y-3"
                style={{ background: dark ? '#111111' : '#f8f8f8', border: `1px solid ${dark ? '#1c1c1c' : '#e5e5e5'}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">new webhook</span>
                  <button onClick={() => setShowWebhookForm(false)} className="text-text-muted hover:text-text-secondary transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/..."
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border outline-none transition-colors"
                  style={{
                    background: dark ? '#0a0a0a' : '#fff',
                    borderColor: dark ? '#222' : '#ddd',
                    color: dark ? '#d4d4d4' : '#333',
                  }}
                />
                <div className="space-y-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider">events</span>
                  {['daily_brief', 'flashcard_due', 'quiz_complete', 'study_streak'].map(evt => (
                    <label key={evt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhookEvents[evt]}
                        onChange={() => setWebhookEvents(prev => ({ ...prev, [evt]: !prev[evt] }))}
                        className="accent-[#c4a759]"
                      />
                      <span className="text-xs text-text-secondary">{evt.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={createWebhook}
                  disabled={!webhookUrl.trim()}
                  className="px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-30"
                  style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                >
                  create webhook
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowWebhookForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
              >
                <Plus size={12} />
                add webhook
              </button>
            )}
          </section>

          {/* Import */}
          <section className="mb-12">
            <SectionHeader label="import notes" icon={Upload} />
            <div className="space-y-4">
              {/* Notion */}
              <div
                className="p-4 rounded-lg"
                style={{ background: dark ? '#111111' : '#f8f8f8', border: `1px solid ${dark ? '#1c1c1c' : '#e5e5e5'}` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text">Notion</span>
                  <button
                    onClick={() => handleImport('notion')}
                    disabled={importing === 'notion'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-50"
                    style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                  >
                    <FileText size={12} />
                    {importing === 'notion' ? 'importing...' : 'upload zip'}
                  </button>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Export your Notion workspace as Markdown & CSV, then upload the zip file here.
                  Folder structure, links, and images will be preserved.
                </p>
                <input
                  ref={notionRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={e => onImportFile('notion', e.target.files?.[0])}
                />
              </div>

              {/* Obsidian */}
              <div
                className="p-4 rounded-lg"
                style={{ background: dark ? '#111111' : '#f8f8f8', border: `1px solid ${dark ? '#1c1c1c' : '#e5e5e5'}` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text">Obsidian</span>
                  <button
                    onClick={() => handleImport('obsidian')}
                    disabled={importing === 'obsidian'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-50"
                    style={{ background: dark ? '#1a1a1a' : '#f0f0f0', color: dark ? '#d4d4d4' : '#333' }}
                  >
                    <FileText size={12} />
                    {importing === 'obsidian' ? 'importing...' : 'upload zip'}
                  </button>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Zip your Obsidian vault folder and upload it here. Wiki links, tags from frontmatter,
                  and folder structure will be preserved.
                </p>
                <input
                  ref={obsidianRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={e => onImportFile('obsidian', e.target.files?.[0])}
                />
              </div>

              {/* Import result */}
              {importResult && (
                <div
                  className="p-3 rounded-lg text-xs"
                  style={{
                    background: importResult.error
                      ? (dark ? '#2a1a1a' : '#fce8e8')
                      : (dark ? '#1a2a1a' : '#e8fce8'),
                    color: importResult.error ? '#cc6666' : '#4a7a4a',
                  }}
                >
                  {importResult.error
                    ? `Import failed: ${importResult.error}`
                    : `Imported ${importResult.imported} note${importResult.imported !== 1 ? 's' : ''} into "${importResult.folder_name}"`
                  }
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}
