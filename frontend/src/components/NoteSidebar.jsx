import { useRef, useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, X, Trash2, AlertTriangle, ExternalLink, ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import MarkdownRenderer from './MarkdownRenderer'

const AiAvatar = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" fill="#505050" />
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke="#333333" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const EmptyState = ({ children }) => (
  <div className="flex flex-col items-center py-12 px-4 animate-fade-in">
    <p className="text-[#404040] text-xs text-center leading-relaxed">{children}</p>
  </div>
)

const TabButton = ({ active, onClick, children, count }) => (
  <button
    onClick={onClick}
    className={`relative pb-2.5 text-xs transition-colors whitespace-nowrap ${
      active ? 'text-[#d4d4d4]' : 'text-[#505050] hover:text-[#808080]'
    }`}
  >
    {children}
    {count > 0 && <span className="text-[10px] text-[#444444] ml-0.5">{count}</span>}
    {active && <span className="absolute bottom-0 left-0 right-0 h-px bg-[#d4d4d4]" />}
  </button>
)

const StreamingDots = () => (
  <div className="flex gap-2 justify-start">
    <div className="w-5 h-5 rounded-full bg-[#141414] border border-[#1c1c1c] flex items-center justify-center flex-shrink-0 mt-1">
      <AiAvatar />
    </div>
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] px-3 py-2 rounded-lg">
      <div className="flex gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-pulse" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-pulse [animation-delay:0.2s]" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-pulse [animation-delay:0.4s]" />
      </div>
    </div>
  </div>
)

const ChatMessage = ({ msg, isEmptyStreaming }) => {
  if (isEmptyStreaming) return null
  return (
    <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {msg.role === 'assistant' && (
        <div className="w-5 h-5 rounded-full bg-[#141414] border border-[#1c1c1c] flex items-center justify-center flex-shrink-0 mt-1">
          <AiAvatar />
        </div>
      )}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
          msg.role === 'user'
            ? 'bg-[#191919] text-[#d4d4d4]'
            : 'bg-[#0e0e0e] border border-[#1a1a1a] text-[#b0b0b0]'
        }`}
      >
        {msg.role === 'assistant' ? (
          <MarkdownRenderer content={msg.content} />
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
      </div>
    </div>
  )
}

const formatTimestamp = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const AnnotationCard = ({ ann, content, dark, editing, editContent, onEdit, onEditChange, onEditSave, onEditCancel, onDelete, onCardClick }) => {
  const stale = ann.start_offset != null && ann.start_offset >= 0 && content.substring(ann.start_offset, ann.end_offset) !== ann.selected_text
  return (
    <div
      className={`rounded-lg p-3 space-y-2 ${onCardClick ? 'cursor-pointer' : ''}`}
      style={{
        background: dark
          ? 'linear-gradient(135deg, rgba(196,167,89,0.03) 0%, rgba(17,17,17,1) 60%)'
          : 'linear-gradient(135deg, rgba(180,150,60,0.04) 0%, #ffffff 60%)',
        border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
        borderLeft: `2px solid ${dark ? 'rgba(196,167,89,0.25)' : 'rgba(160,130,40,0.35)'}`,
      }}
      onClick={(e) => {
        if (!editing && onCardClick && !e.target.closest('button') && !e.target.closest('textarea')) {
          onCardClick(ann)
        }
      }}
    >
      {stale && (
        <div className="flex items-center gap-1.5 text-[10px] text-[#887744]">
          <AlertTriangle size={10} />
          text may have changed
        </div>
      )}
      {/* Page / timestamp badges */}
      {(ann.page_number != null || ann.timestamp != null) && (
        <div className="flex items-center gap-1.5">
          {ann.page_number != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#191919] text-[#606060]">p. {ann.page_number}</span>
          )}
          {ann.timestamp != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#191919] text-[#606060]">{formatTimestamp(ann.timestamp)}</span>
          )}
        </div>
      )}
      {ann.selected_text && (
        <blockquote className="pl-2 text-xs text-[#8b7a3d] italic line-clamp-2 opacity-80">
          {ann.selected_text}
        </blockquote>
      )}
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => onEditChange(e.target.value)}
            rows={2}
            autoFocus
            className="w-full bg-[#0e0e0e] border border-[#1c1c1c] rounded px-2 py-1.5 text-xs text-[#d4d4d4] outline-none focus:border-[#333333] resize-none"
          />
          <div className="flex gap-1.5 justify-end">
            <button onClick={onEditCancel} className="text-[10px] text-[#606060] hover:text-[#d4d4d4] px-2 py-0.5">cancel</button>
            <button onClick={onEditSave} className="text-[10px] text-[#d4d4d4] bg-[#191919] rounded px-2 py-0.5 hover:bg-[#222222]">save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-[#d4d4d4] cursor-pointer flex-1" onClick={onEdit}>
            {ann.annotation_content || <span className="text-[#333333] italic">click to add note...</span>}
          </p>
          <button onClick={onDelete} className="text-[#333333] hover:text-[#884444] transition-colors flex-shrink-0 mt-0.5">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

const LinkSearchInput = ({ noteId, linkedNoteIds, onAddLink }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) {
      timerRef.current = setTimeout(() => { setResults([]); setOpen(false) }, 0)
      return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.post('/notes/search', { query: query.trim() })
        const filtered = data.filter(d => d.id !== noteId && !linkedNoteIds.has(d.id))
        setResults(filtered.slice(0, 8))
        setOpen(true)
      } catch { setResults([]); setOpen(false) }
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, noteId, linkedNoteIds])

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="search notes to link..."
        className="w-full bg-[#0e0e0e] border border-[#1c1c1c] rounded-md px-3 py-2 text-xs text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-[#141414] border border-[#1c1c1c] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onMouseDown={(e) => { e.preventDefault(); onAddLink(r.id); setQuery(''); setResults([]); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors border-b border-[#1c1c1c] last:border-b-0"
            >
              <p className="text-xs text-[#d4d4d4] truncate">{r.title || 'Untitled'}</p>
              <p className="text-[10px] text-[#444444] truncate mt-0.5">{r.preview}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LinkedNoteCard = ({ link, onRemove, dark }) => {
  const navigate = useNavigate()
  return (
    <div
      className="rounded-lg p-3 cursor-pointer group"
      style={{
        background: dark
          ? 'linear-gradient(135deg, rgba(89,130,196,0.03) 0%, rgba(17,17,17,1) 60%)'
          : 'linear-gradient(135deg, rgba(60,100,180,0.04) 0%, #ffffff 60%)',
        border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
        borderLeft: `2px solid ${dark ? 'rgba(89,130,196,0.25)' : 'rgba(40,80,160,0.35)'}`,
      }}
      onClick={() => navigate(`/notes/${link.note_id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#d4d4d4] truncate font-medium">{link.title}</p>
          <p className="text-[10px] text-[#505050] truncate mt-1">{link.preview}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(link.link_id) }}
          className="text-[#333333] hover:text-[#884444] transition-colors flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  )
}

const LookupCard = ({ lookup, expanded, onToggle, onDelete, dark }) => (
  <div
    className={`rounded-lg p-3 space-y-2 cursor-pointer`}
    style={{
      background: dark
        ? 'linear-gradient(135deg, rgba(196,167,89,0.03) 0%, rgba(17,17,17,1) 60%)'
        : 'linear-gradient(135deg, rgba(180,150,60,0.04) 0%, #ffffff 60%)',
      border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
      borderLeft: `2px solid ${dark ? 'rgba(196,167,89,0.25)' : 'rgba(160,130,40,0.35)'}`,
    }}
    onClick={(e) => {
      if (!e.target.closest('button')) onToggle()
    }}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: 'rgba(196,167,89,0.12)', color: '#c4a759' }}>
          {lookup.action}
        </span>
        {!expanded && (
          <span className="text-[11px] text-[#606060] truncate">{lookup.selected_text}</span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <ChevronDown size={11} className={`text-[#444444] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        {!lookup.loading && (
          <button onClick={() => onDelete(lookup.id)} className="text-[#333333] hover:text-[#884444] transition-colors">
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
    {expanded && (
      <div className="animate-fade-in space-y-2">
        <blockquote
          className="pl-2 text-xs italic line-clamp-4 opacity-80"
          style={{
            borderLeft: `2px solid ${dark ? 'rgba(196,167,89,0.25)' : 'rgba(160,130,40,0.35)'}`,
            color: dark ? '#8b7a3d' : '#6b5a2d',
          }}
        >
          {lookup.selected_text}
        </blockquote>
        {lookup.loading ? (
          <div className="space-y-2 pt-2">
            {[1, 5/6, 4/6, 1, 3/4].map((w, i) => (
              <div key={i} className="h-3 rounded bg-[#191919] animate-pulse" style={{ width: `${w * 100}%`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : (
          <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-3">
            <MarkdownRenderer content={lookup.result} />
          </div>
        )}
      </div>
    )}
  </div>
)

const OutlineItem = ({ item }) => (
    <div style={{ paddingLeft: `${((item.level || 1) - 1) * 10}px` }}>
        <p className="text-[11px] text-[#d4d4d4] leading-relaxed">{item.text}</p>
        {item.children?.map((child, i) => (
            <OutlineItem key={i} item={child} />
        ))}
    </div>
)

export default function NoteSidebar({
  sidebarTab, setSidebarTab,
  // Chat props
  messages, streaming, chatInput, setChatInput, onSendMessage, onChatKeyDown,
  // Lookup props
  lookups = [], activeLookupId, onSetActiveLookup, onDeleteLookup, dark,
  // Annotation props
  annotations, content, editingAnnotation, editAnnotationContent,
  onEditAnnotation, onEditAnnotationChange, onUpdateAnnotation, onCancelEditAnnotation, onDeleteAnnotation,
  onAnnotationCardClick,
  // Link props
  linkedNotes = [], suggestions = [], onAddLink, onRemoveLink, noteId,
  // Insights props
  insights = null, insightsLoading = false, onAddInsightTag, onCreateFlashcard,
  // Close
  onClose,
  // Canvas mode — chat only, no tabs
  chatOnly = false,
  // Link metadata
  linkMeta = null,
  sourceUrl = null,
}) {
  const chatScrollRef = useRef(null)
  const chatEndRef = useRef(null)

  // Cheat sheet state
  const [cheatsheet, setCheatsheet] = useState(null)
  const [cheatsheetLoading, setCheatsheetLoading] = useState(false)

  // Outline state
  const [outline, setOutline] = useState(null)
  const [outlineLoading, setOutlineLoading] = useState(false)

  const handleGenerateOutline = async () => {
    setOutlineLoading(true)
    try {
      const data = await api.post(`/notes/${noteId}/outline`)
      setOutline(data)
    } catch (err) {
      console.error('Failed to generate outline:', err)
    } finally {
      setOutlineLoading(false)
    }
  }

  // Auto-TOC from markdown content
  const tocItems = useMemo(() => {
    if (!content) return []
    const lines = content.split('\n')
    const items = []
    for (const line of lines) {
      const match = line.match(/^(#{1,4})\s+(.+)/)
      if (match) {
        items.push({
          level: match[1].length,
          text: match[2].replace(/[*_`~]/g, '').trim(),
          id: match[2].replace(/[*_`~]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        })
      }
    }
    return items
  }, [content])

  const handleGenerateCheatsheet = async () => {
    if (!noteId || cheatsheetLoading) return
    setCheatsheetLoading(true)
    try {
      const result = await api.post(`/notes/${noteId}/cheatsheet`)
      setCheatsheet(result)
    } catch (err) {
      console.error('Failed to generate cheat sheet:', err)
    } finally {
      setCheatsheetLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-l border-[#1c1c1c] bg-[#0e0e0e]">
      {/* Tab header */}
      <div className="flex items-center px-4 pt-3 border-b border-[#1c1c1c]">
        <div className="flex items-center gap-4 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          {chatOnly ? (
            <span className="text-xs text-[#606060] pb-2.5">chat</span>
          ) : (
            <>
              {linkMeta && (
                <TabButton active={sidebarTab === 'info'} onClick={() => setSidebarTab('info')}>info</TabButton>
              )}
              <TabButton active={sidebarTab === 'chat'} onClick={() => setSidebarTab('chat')}>chat</TabButton>
              <TabButton active={sidebarTab === 'lookup'} onClick={() => setSidebarTab('lookup')} count={lookups.length}>lookup</TabButton>
              <TabButton active={sidebarTab === 'annotations'} onClick={() => setSidebarTab('annotations')} count={annotations.length}>
                notes
              </TabButton>
              <TabButton active={sidebarTab === 'links'} onClick={() => setSidebarTab('links')} count={linkedNotes.length}>
                links
              </TabButton>
              <TabButton active={sidebarTab === 'insights'} onClick={() => setSidebarTab('insights')}>insights</TabButton>
            </>
          )}
        </div>
        <button onClick={onClose} className="text-[#333333] hover:text-[#606060] transition-colors flex-shrink-0 pb-2.5 ml-2">
          <X size={14} />
        </button>
      </div>

      {/* Tab content */}
      {sidebarTab === 'info' && linkMeta ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          {linkMeta.title && (
            <div>
              <div className="sidebar-info-title text-[#d4d4d4] text-sm font-medium leading-snug">
                <MarkdownRenderer content={linkMeta.title} />
              </div>
              {linkMeta.domain && (
                <span className="text-[10px] text-[#444444] mt-1 inline-block">{linkMeta.domain}</span>
              )}
            </div>
          )}

          {/* Thumbnail */}
          {linkMeta.thumbnail_url && (
            <img src={linkMeta.thumbnail_url} alt="" className="w-full rounded-lg border border-[#1c1c1c]" />
          )}

          {/* Authors (arXiv) */}
          {linkMeta.authors?.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-1.5">authors</span>
              <div className="flex flex-wrap gap-1.5">
                {linkMeta.authors.map((a, i) => (
                  <span key={i} className="text-xs text-[#808080] bg-[#141414] border border-[#1c1c1c] rounded px-2 py-0.5">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Categories (arXiv) */}
          {linkMeta.categories?.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-1.5">categories</span>
              <div className="flex flex-wrap gap-1.5">
                {linkMeta.categories.map((c, i) => (
                  <span key={i} className="text-[10px] text-[#606060] bg-[#111111] border border-[#1c1c1c] rounded px-1.5 py-0.5">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Abstract / Description */}
          {linkMeta.description && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-1.5">
                {linkMeta.authors ? 'abstract' : 'description'}
              </span>
              <div className="sidebar-info-body text-xs text-[#808080] leading-relaxed">
                <MarkdownRenderer content={linkMeta.description} />
              </div>
            </div>
          )}

          {/* arXiv ID */}
          {linkMeta.arxiv_id && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-1">arxiv id</span>
              <span className="text-xs text-[#808080]">{linkMeta.arxiv_id}</span>
            </div>
          )}

          {/* PDF link (arXiv) */}
          {linkMeta.pdf_url && (
            <a
              href={linkMeta.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors no-underline"
            >
              <ExternalLink size={11} />
              download pdf
            </a>
          )}

          {/* Source URL */}
          {sourceUrl && (
            <div className="pt-2 border-t border-[#1c1c1c]">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors no-underline"
              >
                <ExternalLink size={11} />
                open original
              </a>
            </div>
          )}
        </div>
      ) : sidebarTab === 'lookup' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {lookups.length === 0 ? (
            <EmptyState>select text in read mode, then<br />use research, summarize, or define.</EmptyState>
          ) : (
            lookups.map((l) => (
              <LookupCard
                key={l.id}
                lookup={l}
                expanded={l.id === activeLookupId}
                onToggle={() => onSetActiveLookup(activeLookupId === l.id ? null : l.id)}
                onDelete={onDeleteLookup}
                dark={dark}
              />
            ))
          )}
        </div>
      ) : sidebarTab === 'chat' ? (
        <>
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <EmptyState>
                <div className="w-12 h-12 rounded-full bg-[#111111] border border-[#1c1c1c] flex items-center justify-center mb-4 mx-auto">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" fill="#404040" />
                    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M5.64 5.64l3.54 3.54M14.82 14.82l3.54 3.54M5.64 18.36l3.54-3.54M14.82 9.18l3.54-3.54" stroke="#1c1c1c" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                i can help you think through<br />your notes. ask me anything.
              </EmptyState>
            )}
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                msg={msg}
                isEmptyStreaming={streaming && msg.role === 'assistant' && !msg.content && i === messages.length - 1}
              />
            ))}
            {streaming && messages.length > 0 && messages[messages.length - 1].content === '' && <StreamingDots />}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-[#1c1c1c]">
            <div className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={onChatKeyDown}
                placeholder="ask me anything..."
                rows={1}
                className="bg-[#111111] border border-[#1c1c1c] rounded-md px-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors flex-1 resize-none"
              />
              <button
                onClick={onSendMessage}
                disabled={!chatInput.trim() || streaming}
                className="bg-[#191919] text-[#606060] hover:text-[#d4d4d4] rounded-md px-3 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </>
      ) : sidebarTab === 'annotations' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {annotations.length === 0 && (
            <EmptyState>no annotations yet.<br />select text in read mode to annotate.</EmptyState>
          )}
          {annotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              ann={ann}
              content={content}
              dark={dark}
              editing={editingAnnotation === ann.id}
              editContent={editAnnotationContent}
              onEdit={() => onEditAnnotation(ann.id, ann.annotation_content)}
              onEditChange={onEditAnnotationChange}
              onEditSave={() => onUpdateAnnotation(ann.id)}
              onEditCancel={onCancelEditAnnotation}
              onDelete={() => onDeleteAnnotation(ann.id)}
              onCardClick={onAnnotationCardClick}
            />
          ))}
        </div>
      ) : sidebarTab === 'links' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <LinkSearchInput
            noteId={noteId}
            linkedNoteIds={new Set(linkedNotes.map(l => l.note_id))}
            onAddLink={onAddLink}
          />
          {linkedNotes.length === 0 && suggestions.length === 0 && (
            <EmptyState>no linked notes yet.<br />search above to link related notes.</EmptyState>
          )}
          {linkedNotes.map((link) => (
            <LinkedNoteCard
              key={link.link_id}
              link={link}
              onRemove={onRemoveLink}
              dark={dark}
            />
          ))}
          {suggestions.length > 0 && (
            <div className="pt-2 mt-1 border-t border-[#1c1c1c]">
              <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">suggested connections</span>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg p-3 group"
                    style={{
                      background: dark
                        ? 'linear-gradient(135deg, rgba(130,196,89,0.03) 0%, rgba(17,17,17,1) 60%)'
                        : 'linear-gradient(135deg, rgba(80,160,60,0.04) 0%, #ffffff 60%)',
                      border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                      borderLeft: `2px solid ${dark ? 'rgba(130,196,89,0.25)' : 'rgba(60,140,40,0.35)'}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#d4d4d4] truncate font-medium">{s.title}</p>
                        <p className="text-[10px] text-[#505050] truncate mt-1">{s.preview}</p>
                      </div>
                      <button
                        onClick={() => onAddLink(s.id)}
                        className="text-[9px] text-[#444444] hover:text-[#d4d4d4] transition-colors flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 border border-[#1c1c1c] rounded px-1.5 py-0.5"
                      >
                        + link
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className="h-1 rounded-full flex-1" style={{ background: dark ? '#1a1a1a' : '#eee', maxWidth: 60 }}>
                        <div className="h-1 rounded-full" style={{ width: `${Math.round(s.similarity * 100)}%`, background: 'rgba(130,196,89,0.4)' }} />
                      </div>
                      <span className="text-[9px] text-[#333333]">{Math.round(s.similarity * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Insights tab */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-fade-in">
          {insightsLoading ? (
            <div className="space-y-4 pt-2">
              {[1, 0.7, 0.85, 1, 0.6, 0.9, 0.75].map((w, i) => (
                <div key={i} className="h-3 rounded bg-[#191919] animate-pulse" style={{ width: `${w * 100}%`, animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          ) : !insights ? (
            <EmptyState>insights will appear here after<br />you save some content.</EmptyState>
          ) : (
            <>
              {/* Table of Contents */}
              {tocItems.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">table of contents</span>
                  <div className="space-y-0.5">
                    {tocItems.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          // Scroll to heading in the note
                          const headings = document.querySelectorAll('h1, h2, h3, h4')
                          for (const h of headings) {
                            if (h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') === item.id) {
                              h.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              break
                            }
                          }
                        }}
                        className="block w-full text-left text-[11px] text-[#808080] hover:text-[#d4d4d4] transition-colors truncate"
                        style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
                      >
                        {item.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {insights.summary && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-1.5">summary</span>
                  <p className="text-xs text-[#b0b0b0] leading-relaxed">{insights.summary}</p>
                </div>
              )}

              {/* Key Concepts */}
              {insights.concepts?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">key concepts</span>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.concepts.map((c, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#191919] border border-[#1c1c1c] text-[#c4a759]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Definitions */}
              {insights.definitions?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">definitions</span>
                  <div className="space-y-2">
                    {insights.definitions.map((d, i) => (
                      <div
                        key={i}
                        className="rounded-lg p-2.5 group"
                        style={{
                          background: dark
                            ? 'linear-gradient(135deg, rgba(196,167,89,0.03) 0%, rgba(17,17,17,1) 60%)'
                            : 'linear-gradient(135deg, rgba(180,150,60,0.04) 0%, #ffffff 60%)',
                          border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}`,
                          borderLeft: `2px solid ${dark ? 'rgba(196,167,89,0.25)' : 'rgba(160,130,40,0.35)'}`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[#d4d4d4]">{d.term}</p>
                            <p className="text-[11px] text-[#808080] mt-1 leading-relaxed">{d.definition}</p>
                          </div>
                          {onCreateFlashcard && (
                            <button
                              onClick={() => onCreateFlashcard(d.term, d.definition)}
                              className="text-[9px] text-[#444444] hover:text-[#c4a759] transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 mt-0.5"
                              title="Create flashcard"
                            >
                              + card
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulas */}
              {insights.formulas?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">formulas</span>
                  <div className="space-y-2">
                    {insights.formulas.map((f, i) => (
                      <div key={i} className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-2.5">
                        <MarkdownRenderer content={`$${f.latex}$`} />
                        <p className="text-[10px] text-[#606060] mt-1">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Tags */}
              {insights.suggested_tags?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">suggested tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.suggested_tags.map((tag, i) => (
                      <button
                        key={i}
                        onClick={() => onAddInsightTag?.(tag)}
                        className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[#2a2a2a] text-[#606060] hover:text-[#d4d4d4] hover:border-[#444444] transition-colors"
                        title="Add tag"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Prerequisites */}
              {insights.prerequisites?.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#444444] block mb-2">prerequisites</span>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.prerequisites.map((p, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#141414] border border-[#1c1c1c] text-[#808080]">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cheat Sheet */}
              <div className="border-t border-[#1c1c1c] pt-3 mt-1">
                {!cheatsheet ? (
                  <button
                    onClick={handleGenerateCheatsheet}
                    disabled={cheatsheetLoading}
                    className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-md bg-[#191919] border border-[#1c1c1c] text-[#808080] hover:text-[#d4d4d4] hover:border-[#2a2a2a] transition-colors disabled:opacity-50 w-full justify-center"
                  >
                    {cheatsheetLoading ? (
                      <>
                        <div className="animate-spin h-3 w-3 border border-[#606060] border-t-transparent rounded-full" />
                        generating cheat sheet...
                      </>
                    ) : (
                      '+ generate cheat sheet'
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-[#444444]">cheat sheet</span>
                      <button
                        onClick={() => setCheatsheet(null)}
                        className="text-[9px] text-[#444] hover:text-[#808080] transition-colors"
                      >
                        clear
                      </button>
                    </div>

                    {/* Sections */}
                    {cheatsheet.sections?.map((s, i) => (
                      <div key={i}>
                        <p className="text-[11px] font-medium text-[#d4d4d4] mb-1">{s.heading}</p>
                        <ul className="space-y-0.5 pl-3">
                          {s.points?.map((pt, j) => (
                            <li key={j} className="text-[11px] text-[#808080] leading-relaxed list-disc">{pt}</li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {/* Key Facts */}
                    {cheatsheet.key_facts?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#444444] mb-1.5">key facts</p>
                        <ul className="space-y-0.5 pl-3">
                          {cheatsheet.key_facts.map((f, i) => (
                            <li key={i} className="text-[11px] text-[#808080] leading-relaxed list-disc">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Formulas */}
                    {cheatsheet.formulas?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#444444] mb-1.5">formulas</p>
                        <div className="space-y-1.5">
                          {cheatsheet.formulas.map((f, i) => (
                            <div key={i} className="bg-[#111111] border border-[#1c1c1c] rounded-md p-2">
                              <MarkdownRenderer content={`$${f.latex}$`} />
                              <p className="text-[10px] text-[#606060] mt-0.5">{f.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mnemonics */}
                    {cheatsheet.mnemonics?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#444444] mb-1.5">memory aids</p>
                        {cheatsheet.mnemonics.map((m, i) => (
                          <p key={i} className="text-[11px] text-[#c4a759] leading-relaxed pl-2 border-l-2 border-[#2a2211] mb-1">{m}</p>
                        ))}
                      </div>
                    )}

                    {/* Common Mistakes */}
                    {cheatsheet.common_mistakes?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#444444] mb-1.5">common mistakes</p>
                        {cheatsheet.common_mistakes.map((m, i) => (
                          <p key={i} className="text-[11px] text-[#ef4444] leading-relaxed pl-2 border-l-2 border-[rgba(239,68,68,0.2)] mb-1">{m}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI Outline */}
              <div className="border-t border-[#1c1c1c] pt-3 mt-1">
                {!outline ? (
                  <button
                    onClick={handleGenerateOutline}
                    disabled={outlineLoading}
                    className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-md bg-[#191919] border border-[#1c1c1c] text-[#808080] hover:text-[#d4d4d4] hover:border-[#2a2a2a] transition-colors disabled:opacity-50 w-full justify-center"
                  >
                    {outlineLoading ? (
                      <>
                        <div className="animate-spin h-3 w-3 border border-[#606060] border-t-transparent rounded-full" />
                        generating outline...
                      </>
                    ) : (
                      '+ generate outline'
                    )}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-[#444444]">outline</span>
                      <button
                        onClick={() => setOutline(null)}
                        className="text-[9px] text-[#444] hover:text-[#808080] transition-colors"
                      >
                        clear
                      </button>
                    </div>
                    {outline.items?.map((item, i) => (
                      <OutlineItem key={i} item={item} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
