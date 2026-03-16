import { useState, useRef, useCallback } from 'react'
import { X, Upload, Youtube, FileText, Presentation, Loader2, ChevronRight, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { useTheme } from '../contexts/ThemeContext'

const STEPS = { upload: 0, preview: 1, converting: 2, done: 3 }

export default function ImportModal({ open, onClose, onComplete }) {
  const { dark } = useTheme()
  const [step, setStep] = useState(STEPS.upload)
  const [dragOver, setDragOver] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [extracted, setExtracted] = useState(null) // { text, source_name, source_type, char_count }
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { folder_id, folder_name, notes }
  const fileInputRef = useRef(null)

  const reset = useCallback(() => {
    setStep(STEPS.upload)
    setExtracted(null)
    setError(null)
    setLoading(false)
    setResult(null)
    setYoutubeUrl('')
    setDragOver(false)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const uploadFile = useCallback(async (file) => {
    setError(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = localStorage.getItem('token')
      const resp = await fetch('/imports/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Upload failed' }))
        throw new Error(err.detail || 'Upload failed')
      }
      const data = await resp.json()
      setExtracted(data)
      setStep(STEPS.preview)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleYoutube = useCallback(async () => {
    if (!youtubeUrl.trim()) return
    setError(null)
    setLoading(true)
    try {
      const data = await api.post('/imports/youtube', { url: youtubeUrl.trim() })
      setExtracted(data)
      setStep(STEPS.preview)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [youtubeUrl])

  const handleConvert = useCallback(async () => {
    if (!extracted) return
    setStep(STEPS.converting)
    setError(null)
    try {
      const data = await api.post('/imports/convert', {
        text: extracted.text,
        source_name: extracted.source_name,
      })
      setResult(data)
      setStep(STEPS.done)
    } catch (err) {
      setError(err.message)
      setStep(STEPS.preview)
    }
  }, [extracted])

  if (!open) return null

  const typeIcon = {
    pdf: FileText,
    pptx: Presentation,
    ppt: Presentation,
    youtube: Youtube,
  }
  const TypeIcon = extracted ? (typeIcon[extracted.source_type] || FileText) : FileText

  // Theme-aware colors
  const t = {
    overlay: dark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.2)',
    modalBg: dark ? '#0e0e0e' : '#ffffff',
    modalBorder: dark ? '#1c1c1c' : '#ddd9d0',
    headerText: dark ? '#e0e0e0' : '#222222',
    closeBtn: dark ? '#444444' : '#999999',
    closeBtnHover: dark ? '#888888' : '#555555',
    errorBg: dark ? '#1a0a0a' : '#fef2f2',
    errorBorder: dark ? '#331a1a' : '#e8cccc',
    errorText: dark ? '#cc6666' : '#b91c1c',
    dropBg: dark ? '#0a0a0a' : '#fafaf8',
    dropBorder: dark ? '#1c1c1c' : '#ddd9d0',
    dropHoverBg: dark ? '#111111' : '#f0ede6',
    dropHoverBorder: dark ? '#333333' : '#ccc8bf',
    dragBorder: '#c4a759',
    dragBg: dark ? 'rgba(196,167,89,0.05)' : 'rgba(196,167,89,0.08)',
    iconMuted: dark ? '#333333' : '#bbbbbb',
    textMuted: dark ? '#888888' : '#666666',
    textFaint: dark ? '#444444' : '#999999',
    textSubtle: dark ? '#666666' : '#888888',
    divider: dark ? '#1c1c1c' : '#e8e5de',
    inputBg: dark ? '#0a0a0a' : '#fafaf8',
    inputBorder: dark ? '#1c1c1c' : '#ddd9d0',
    inputText: dark ? '#e0e0e0' : '#222222',
    inputPlaceholder: dark ? '#333333' : '#bbbbbb',
    btnSecBg: dark ? '#1a1a1a' : '#f0ede6',
    btnSecBorder: dark ? '#2a2a2a' : '#ddd9d0',
    btnSecText: dark ? '#888888' : '#666666',
    btnSecHoverBg: dark ? '#222222' : '#e8e5de',
    btnSecHoverText: dark ? '#cccccc' : '#333333',
    // Preview
    previewBg: dark ? '#080808' : '#fafaf8',
    previewBorder: dark ? '#1c1c1c' : '#ddd9d0',
    previewSep: dark ? '#141414' : '#f0ede6',
    previewHeaderBg: dark ? 'rgba(12,12,12,0.9)' : 'rgba(245,243,238,0.9)',
    previewLabel: dark ? '#444444' : '#999999',
    previewText: dark ? '#777777' : '#555555',
    previewTrunc: dark ? '#333333' : '#bbbbbb',
    scrollThumb: dark ? '#222222' : '#ccc8bf',
    // Source info
    infoBg: dark ? '#111111' : '#fafaf8',
    infoBadgeBg: dark ? 'rgba(196,167,89,0.1)' : 'rgba(139,122,61,0.08)',
    infoMeta: dark ? '#555555' : '#888888',
    // Gold accent (works in both)
    gold: '#c4a759',
    goldHover: dark ? '#d4b769' : '#b4963c',
    goldText: dark ? '#000000' : '#ffffff',
    goldIcon: dark ? '#c4a759' : '#8b7a3d',
    // Done step
    noteHoverBg: dark ? '#111111' : '#f5f3ee',
    noteText: dark ? '#cccccc' : '#333333',
    noteIcon: dark ? '#444444' : '#999999',
    chevron: dark ? '#222222' : '#cccccc',
    chevronHover: dark ? '#444444' : '#888888',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: t.overlay, backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden" style={{ background: t.modalBg, border: `1px solid ${t.modalBorder}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${t.modalBorder}` }}>
          <h2 className="text-sm font-semibold" style={{ color: t.headerText }}>
            {step === STEPS.upload && 'import'}
            {step === STEPS.preview && 'preview'}
            {step === STEPS.converting && 'converting to notes...'}
            {step === STEPS.done && 'done'}
          </h2>
          <button onClick={handleClose} className="transition-colors" style={{ color: t.closeBtn }} onMouseEnter={e => e.currentTarget.style.color = t.closeBtnHover} onMouseLeave={e => e.currentTarget.style.color = t.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: t.errorBg, border: `1px solid ${t.errorBorder}`, color: t.errorText }}>
              {error}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === STEPS.upload && (
            <div className="space-y-4">
              {/* Drag & drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all"
                style={{
                  borderColor: dragOver ? t.dragBorder : t.dropBorder,
                  background: dragOver ? t.dragBg : t.dropBg,
                }}
                onMouseEnter={e => { if (!dragOver) { e.currentTarget.style.borderColor = t.dropHoverBorder; e.currentTarget.style.background = t.dropHoverBg }}}
                onMouseLeave={e => { if (!dragOver) { e.currentTarget.style.borderColor = t.dropBorder; e.currentTarget.style.background = t.dropBg }}}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={24} className="animate-spin" style={{ color: t.goldIcon }} />
                    <span className="text-xs" style={{ color: t.textSubtle }}>extracting text...</span>
                  </div>
                ) : (
                  <>
                    <Upload size={28} className="mx-auto mb-3" style={{ color: t.iconMuted }} />
                    <p className="text-sm mb-1" style={{ color: t.textMuted }}>drop a file here or click to browse</p>
                    <p className="text-[10px]" style={{ color: t.textFaint }}>PDF, PPTX &middot; max 50MB</p>
                  </>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: t.divider }} />
                <span className="text-[10px] uppercase tracking-wider" style={{ color: t.iconMuted }}>or</span>
                <div className="flex-1 h-px" style={{ background: t.divider }} />
              </div>

              {/* YouTube URL */}
              <div>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ border: `1px solid ${t.inputBorder}`, background: t.inputBg }}>
                    <Youtube size={16} className="flex-shrink-0" style={{ color: t.textFaint }} />
                    <input
                      type="text"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleYoutube()}
                      placeholder="paste YouTube URL..."
                      className="flex-1 bg-transparent text-sm outline-none placeholder-[#333333]"
                      style={{ color: t.inputText }}
                    />
                  </div>
                  <button
                    onClick={handleYoutube}
                    disabled={!youtubeUrl.trim() || loading}
                    className="px-4 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
                    style={{ background: t.btnSecBg, color: t.btnSecText, border: `1px solid ${t.btnSecBorder}` }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.btnSecHoverBg; e.currentTarget.style.color = t.btnSecHoverText }}
                    onMouseLeave={e => { e.currentTarget.style.background = t.btnSecBg; e.currentTarget.style.color = t.btnSecText }}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : 'extract'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === STEPS.preview && extracted && (() => {
            const previewText = extracted.text.slice(0, 3000)
            const sections = previewText.split(/--- (?:Page|Slide) (\d+) ---/)
            const pages = []
            for (let i = 1; i < sections.length; i += 2) {
              pages.push({ num: sections[i], text: (sections[i + 1] || '').trim() })
            }
            if (pages.length === 0 && previewText.trim()) {
              pages.push({ num: null, text: previewText.trim() })
            }

            return (
            <div className="space-y-4">
              {/* Source info bar */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: t.infoBg, border: `1px solid ${t.previewBorder}` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: t.infoBadgeBg }}>
                  <TypeIcon size={18} style={{ color: t.goldIcon }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: t.headerText }}>{extracted.source_name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: t.infoMeta }}>
                    {extracted.source_type.toUpperCase()} &middot; {(extracted.char_count / 1000).toFixed(1)}k characters
                    {pages.length > 1 && ` · ${pages.length} ${extracted.source_type === 'pptx' || extracted.source_type === 'ppt' ? 'slides' : extracted.source_type === 'youtube' ? 'segments' : 'pages'}`}
                  </p>
                </div>
              </div>

              {/* Text preview */}
              <div
                className="rounded-lg max-h-72 overflow-y-auto"
                style={{ border: `1px solid ${t.previewBorder}`, background: t.previewBg, scrollbarColor: `${t.scrollThumb} transparent` }}
              >
                {pages.map((page, i) => (
                  <div key={i} style={i > 0 ? { borderTop: `1px solid ${t.previewSep}` } : undefined}>
                    {page.num && (
                      <div className="sticky top-0 px-4 py-1.5 backdrop-blur-sm" style={{ background: t.previewHeaderBg, borderBottom: `1px solid ${t.previewSep}` }}>
                        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: t.previewLabel }}>
                          {extracted.source_type === 'pptx' || extracted.source_type === 'ppt' ? 'Slide' : extracted.source_type === 'youtube' ? 'Segment' : 'Page'} {page.num}
                        </span>
                      </div>
                    )}
                    <div className="px-4 py-3">
                      <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: t.previewText }}>{page.text}</p>
                    </div>
                  </div>
                ))}
                {extracted.text.length > 3000 && (
                  <div className="px-4 py-3 text-center" style={{ borderTop: `1px solid ${t.previewSep}` }}>
                    <span className="text-[10px] italic" style={{ color: t.previewTrunc }}>showing first 3,000 of {(extracted.char_count / 1000).toFixed(1)}k characters</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="px-4 py-2.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ border: `1px solid ${t.btnSecBorder}`, background: t.btnSecBg, color: t.btnSecText }}
                  onMouseEnter={e => { e.currentTarget.style.background = t.btnSecHoverBg; e.currentTarget.style.color = t.btnSecHoverText }}
                  onMouseLeave={e => { e.currentTarget.style.background = t.btnSecBg; e.currentTarget.style.color = t.btnSecText }}
                >
                  back
                </button>
                <button
                  onClick={handleConvert}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: t.gold, color: t.goldText }}
                  onMouseEnter={e => e.currentTarget.style.background = t.goldHover}
                  onMouseLeave={e => e.currentTarget.style.background = t.gold}
                >
                  <Sparkles size={15} />
                  convert to notes
                </button>
              </div>
            </div>
            )
          })()}

          {/* Step 3: Converting */}
          {step === STEPS.converting && (
            <div className="flex flex-col items-center py-10">
              <Loader2 size={28} className="animate-spin mb-4" style={{ color: t.goldIcon }} />
              <p className="text-sm" style={{ color: t.textMuted }}>AI is analyzing and creating notes...</p>
              <p className="text-[10px] mt-1" style={{ color: t.iconMuted }}>this may take 10-30 seconds</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === STEPS.done && result && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-2xl mb-2">&#10003;</div>
                <p className="text-sm font-medium" style={{ color: t.headerText }}>
                  Created {result.notes.length} note{result.notes.length > 1 ? 's' : ''}
                  {result.folder_name && ` in "${result.folder_name}"`}
                </p>
              </div>

              {/* Note list */}
              <div className="space-y-1">
                {result.notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => { handleClose(); onComplete?.(note.id) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors group"
                    style={{ color: t.noteText }}
                    onMouseEnter={e => e.currentTarget.style.background = t.noteHoverBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <FileText size={14} className="flex-shrink-0" style={{ color: t.noteIcon }} />
                    <span className="text-sm truncate flex-1">{note.title}</span>
                    <ChevronRight size={14} style={{ color: t.chevron }} />
                  </button>
                ))}
              </div>

              <button
                onClick={() => { handleClose(); onComplete?.(result.notes[0]?.id) }}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: t.gold, color: t.goldText }}
                onMouseEnter={e => e.currentTarget.style.background = t.goldHover}
                onMouseLeave={e => e.currentTarget.style.background = t.gold}
              >
                open {result.notes.length > 1 ? 'first note' : 'note'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
