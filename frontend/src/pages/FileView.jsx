import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, FileText, ExternalLink, Info } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { useChat } from '../hooks/useChat'
import Layout from '../components/Layout'
import NoteSidebar from '../components/NoteSidebar'
import PdfViewer from '../components/PdfViewer'
import ImageViewer from '../components/ImageViewer'
import VideoPlayer from '../components/VideoPlayer'
import SelectionToolbar from '../components/SelectionToolbar'
import AnnotationEditor from '../components/AnnotationEditor'

const formatTimestamp = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function FileView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('chat')
  const [infoAutoOpened, setInfoAutoOpened] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [converting, setConverting] = useState(false)
  const [linkText, setLinkText] = useState(null)

  // Annotation state
  const [annotations, setAnnotations] = useState([])
  const [editingAnnotation, setEditingAnnotation] = useState(null)
  const [editAnnotationContent, setEditAnnotationContent] = useState('')
  const [selectionToolbar, setSelectionToolbar] = useState(null)   // { text, pageNumber, x, y }
  const [annotationEditor, setAnnotationEditor] = useState(null)   // { selectedText, pageNumber, timestamp }

  const pdfRef = useRef(null)
  const videoRef = useRef(null)

  const fileId = parseInt(id, 10)

  const {
    messages, streaming, threadId, sendMessage, resetChat, setThreadId,
  } = useChat({ fileId })

  // Load file metadata
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get(`/files/${id}`)
        setFile(data)
      } catch (err) {
        console.error('Failed to load file:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // Auto-open info sidebar for links
  useEffect(() => {
    if (file?.file_type === 'link' && !infoAutoOpened) {
      setShowSidebar(true)
      setSidebarTab('info')
      setInfoAutoOpened(true)
    }
  }, [file, infoAutoOpened])

  // Load link text if applicable
  useEffect(() => {
    if (file?.file_type === 'link' && file.has_extracted_text) {
      api.get(`/files/${id}/text`).then(data => setLinkText(data.text)).catch(() => {})
    }
  }, [file, id])

  // Load existing chat thread for this file
  useEffect(() => {
    const loadThread = async () => {
      try {
        const threads = await api.get(`/llm/threads?file_id=${fileId}`)
        if (threads?.length > 0) {
          const threadData = await api.get(`/llm/threads/${threads[0].id}`)
          setThreadId(threads[0].id, threadData.messages.map(m => ({
            role: m.role,
            content: m.content,
          })))
        }
      } catch (err) {
        // Ignore — no prior chat
      }
    }
    loadThread()
  }, [fileId, setThreadId])

  // Load annotations
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        const data = await api.get(`/file-annotations?file_id=${fileId}`)
        setAnnotations(data)
      } catch (err) {
        // Ignore — no annotations yet
      }
    }
    loadAnnotations()
  }, [fileId])

  const handleSendMessage = useCallback(() => {
    if (!chatInput.trim()) return
    sendMessage(chatInput)
    setChatInput('')
  }, [chatInput, sendMessage])

  const handleChatKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleConvertToNotes = async () => {
    if (converting) return
    setConverting(true)
    try {
      const { text, source_name } = await api.get(`/files/${id}/text`)
      const result = await api.post('/imports/convert', { text, source_name })
      if (result.folder_id) {
        if (result.notes?.length > 0) {
          navigate(`/notes/${result.notes[0].id}`)
        } else {
          navigate('/')
        }
      }
    } catch (err) {
      console.error('Convert to notes failed:', err)
    } finally {
      setConverting(false)
    }
  }

  // PDF text selection → show toolbar
  const handleTextSelect = useCallback(({ text, pageNumber, x, y }) => {
    setSelectionToolbar({ text, pageNumber, x, y })
  }, [])

  // Toolbar action → open annotation editor or create highlight
  const handleToolbarAction = useCallback((action, data) => {
    if (action === 'annotate' && selectionToolbar) {
      setAnnotationEditor({
        selectedText: selectionToolbar.text,
        pageNumber: selectionToolbar.pageNumber,
        timestamp: null,
      })
    } else if (action === 'highlight' && selectionToolbar && data?.color) {
      // Create highlight annotation directly (no editor modal)
      const body = {
        file_id: fileId,
        annotation_type: 'text_selection',
        selected_text: selectionToolbar.text,
        annotation_content: '',
        page_number: selectionToolbar.pageNumber || null,
        color: data.color,
      }
      api.post('/file-annotations', body).then(saved => {
        setAnnotations(prev => [...prev, saved])
      }).catch(err => console.error('Failed to save highlight:', err))
    }
    setSelectionToolbar(null)
  }, [selectionToolbar, fileId])

  // Video annotate button
  const handleVideoAnnotate = useCallback((currentTime) => {
    setAnnotationEditor({
      selectedText: null,
      pageNumber: null,
      timestamp: currentTime,
    })
  }, [])

  // Save annotation
  const handleSaveAnnotation = useCallback(async (content) => {
    if (!annotationEditor) return
    try {
      const body = {
        file_id: fileId,
        annotation_type: annotationEditor.timestamp != null ? 'timestamp' : 'text_selection',
        selected_text: annotationEditor.selectedText || null,
        annotation_content: content,
        page_number: annotationEditor.pageNumber || null,
        timestamp: annotationEditor.timestamp != null ? annotationEditor.timestamp : null,
      }
      const saved = await api.post('/file-annotations', body)
      setAnnotations(prev => [...prev, saved])
      setAnnotationEditor(null)
      setShowSidebar(true)
      setSidebarTab('annotations')
    } catch (err) {
      console.error('Failed to save annotation:', err)
    }
  }, [annotationEditor, fileId])

  // Edit annotation inline
  const handleEditAnnotation = useCallback((annId, content) => {
    setEditingAnnotation(annId)
    setEditAnnotationContent(content || '')
  }, [])

  const handleUpdateAnnotation = useCallback(async (annId) => {
    try {
      const updated = await api.put(`/file-annotations/${annId}`, {
        annotation_content: editAnnotationContent,
      })
      setAnnotations(prev => prev.map(a => a.id === annId ? updated : a))
      setEditingAnnotation(null)
      setEditAnnotationContent('')
    } catch (err) {
      console.error('Failed to update annotation:', err)
    }
  }, [editAnnotationContent])

  const handleDeleteAnnotation = useCallback(async (annId) => {
    try {
      await api.delete(`/file-annotations/${annId}`)
      setAnnotations(prev => prev.filter(a => a.id !== annId))
    } catch (err) {
      console.error('Failed to delete annotation:', err)
    }
  }, [])

  // Click annotation card → navigate to location
  const handleAnnotationCardClick = useCallback((ann) => {
    if (ann.page_number != null && pdfRef.current) {
      pdfRef.current.goToPage(ann.page_number)
    } else if (ann.timestamp != null && videoRef.current) {
      videoRef.current.seekTo(ann.timestamp)
    }
  }, [])

  const token = getToken()
  const fileUrl = file ? `/files/${file.id}/serve?token=${encodeURIComponent(token)}` : null

  const isVideo = file?.file_type === 'video'
  const isLink = file?.file_type === 'link'
  const linkDomain = file?.metadata?.domain || ''
  const isYouTubeLink = isLink && (linkDomain.includes('youtube') || file?.source_url?.includes('youtu.be'))
  const isArxivLink = isLink && linkDomain.includes('arxiv')
  const hasLinkPdf = isLink && file?.metadata?.pdf_url
  const youtubeEmbedUrl = isYouTubeLink && file?.metadata?.video_id
    ? `https://www.youtube.com/embed/${file.metadata.video_id}`
    : null

  const highlightAnnotations = annotations.filter(a => a.color && a.color !== 'default')

  if (loading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-6 w-6 border-2 border-[#333333] border-t-[#d4d4d4] rounded-full" />
        </div>
      </Layout>
    )
  }

  if (!file) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center text-[#606060] text-sm">
          file not found
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1c1c1c] bg-[#0e0e0e] flex-shrink-0">
        <button
          onClick={() => navigate('/library')}
          className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>

        <span className="text-sm text-[#d4d4d4] truncate flex-1">
          {file.original_name}
        </span>

        <div className="flex items-center gap-2">
          {isLink && file.source_url && (
            <a
              href={file.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#191919] text-[#d4d4d4] hover:bg-[#222222] border border-[#2a2a2a] rounded-md px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5 no-underline"
            >
              <ExternalLink size={13} />
              open original
            </a>
          )}
          {file.has_extracted_text && (
            <button
              onClick={handleConvertToNotes}
              disabled={converting}
              className="bg-[#191919] text-[#d4d4d4] hover:bg-[#222222] border border-[#2a2a2a] rounded-md px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {converting ? (
                <div className="animate-spin h-3 w-3 border border-[#d4d4d4] border-t-transparent rounded-full" />
              ) : (
                <FileText size={13} />
              )}
              convert to notes
            </button>
          )}
          <button
            onClick={() => setShowSidebar(s => !s)}
            className={`p-1.5 rounded transition-colors ${
              showSidebar
                ? 'text-[#d4d4d4] bg-[#191919]'
                : 'text-[#606060] hover:text-[#d4d4d4]'
            }`}
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Viewer */}
        <div className="flex-1 min-w-0 flex flex-col">
          {file.file_type === 'pdf' && fileUrl && (
            <PdfViewer ref={pdfRef} fileUrl={fileUrl} onTextSelect={handleTextSelect} highlights={highlightAnnotations} />
          )}
          {file.file_type === 'image' && fileUrl && (
            <ImageViewer fileUrl={fileUrl} fileName={file.original_name} />
          )}
          {isVideo && fileUrl && (
            <VideoPlayer ref={videoRef} fileUrl={fileUrl} onAnnotateClick={handleVideoAnnotate} />
          )}
          {isLink && youtubeEmbedUrl && (
            <div className="flex-1 flex items-center justify-center bg-black p-4">
              <iframe
                src={youtubeEmbedUrl}
                className="w-full max-w-4xl aspect-video rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={file.original_name}
              />
            </div>
          )}
          {isLink && hasLinkPdf && !youtubeEmbedUrl && fileUrl && (
            <PdfViewer ref={pdfRef} fileUrl={fileUrl} onTextSelect={handleTextSelect} highlights={highlightAnnotations} />
          )}
          {isLink && !youtubeEmbedUrl && !hasLinkPdf && (
            <div className="flex-1 overflow-y-auto p-8">
              {linkText ? (
                <pre className="text-[#d4d4d4] text-sm whitespace-pre-wrap font-sans leading-relaxed max-w-3xl">
                  {linkText}
                </pre>
              ) : (
                <div className="text-[#606060] text-sm">loading content...</div>
              )}
            </div>
          )}
          {file.file_type !== 'pdf' && file.file_type !== 'image' && !isVideo && !isLink && (
            <div className="flex-1 flex items-center justify-center text-[#606060] text-sm">
              preview not available for {file.file_type} files yet
            </div>
          )}
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-[380px] flex-shrink-0 flex flex-col">
            <NoteSidebar
              sidebarTab={sidebarTab}
              setSidebarTab={setSidebarTab}
              messages={messages}
              streaming={streaming}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSendMessage={handleSendMessage}
              onChatKeyDown={handleChatKeyDown}
              lookups={[]}
              activeLookupId={null}
              onSetActiveLookup={() => {}}
              onDeleteLookup={() => {}}
              dark={true}
              annotations={annotations}
              content=""
              editingAnnotation={editingAnnotation}
              editAnnotationContent={editAnnotationContent}
              onEditAnnotation={handleEditAnnotation}
              onEditAnnotationChange={setEditAnnotationContent}
              onUpdateAnnotation={handleUpdateAnnotation}
              onCancelEditAnnotation={() => { setEditingAnnotation(null); setEditAnnotationContent('') }}
              onDeleteAnnotation={handleDeleteAnnotation}
              onAnnotationCardClick={handleAnnotationCardClick}
              onClose={() => setShowSidebar(false)}
              linkMeta={isLink ? file.metadata : null}
              sourceUrl={isLink ? file.source_url : null}
            />
          </div>
        )}
      </div>

      {/* Selection toolbar (PDF text selection) */}
      {selectionToolbar && (
        <SelectionToolbar
          position={{ x: selectionToolbar.x, y: selectionToolbar.y }}
          onAction={handleToolbarAction}
          onDismiss={() => setSelectionToolbar(null)}
          allowedActions={['annotate', 'highlight']}
        />
      )}

      {/* Annotation editor modal */}
      {annotationEditor && (
        <AnnotationEditor
          selectedText={annotationEditor.selectedText}
          subtitle={annotationEditor.timestamp != null ? `at ${formatTimestamp(annotationEditor.timestamp)}` : null}
          onSave={handleSaveAnnotation}
          onCancel={() => setAnnotationEditor(null)}
        />
      )}
    </Layout>
  )
}
