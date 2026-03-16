import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Send, Trash2, Globe, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { formatRelativeDate } from '../lib/formatDate'
import { useChat } from '../hooks/useChat'
import Layout from '../components/Layout'
import MarkdownRenderer from '../components/MarkdownRenderer'

const AiAvatar = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" fill="#505050" />
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke="#333333" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const SearchResultCard = ({ result }) => {
  let hostname = ''
  try { hostname = new URL(result.url).hostname } catch { /* ignore */ }
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded px-2.5 py-1.5 bg-[#0e0e0e] border border-[#1c1c1c] hover:border-[#2a2a2a] transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[#808080] group-hover:text-[#d4d4d4] truncate transition-colors">{result.title}</span>
        <ExternalLink size={9} className="text-[#333333] flex-shrink-0" />
      </div>
      {hostname && <p className="text-[10px] text-[#404040] truncate mt-0.5">{hostname}</p>}
    </a>
  )
}

const ChatMessageBubble = ({ msg, streaming, isLast }) => {
  const isEmptyStreaming = streaming && msg.role === 'assistant' && !msg.content && !msg.searchStatus && !msg.searchResults && isLast
  if (isEmptyStreaming) return null

  return (
    <div>
      <div className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        {msg.role === 'assistant' && (
          <div className="w-6 h-6 rounded-full bg-[#141414] border border-[#1c1c1c] flex items-center justify-center flex-shrink-0 mt-1">
            <AiAvatar />
          </div>
        )}
        <div
          className={`max-w-[80%] px-3.5 py-2.5 rounded-lg text-sm ${
            msg.role === 'user'
              ? 'bg-[#191919] text-[#d4d4d4]'
              : 'bg-[#0e0e0e] border border-[#1a1a1a] text-[#b0b0b0]'
          }`}
        >
          {msg.searchStatus?.searching && (
            <div className="flex items-center gap-2 text-xs text-[#606060] mb-2 pb-2 border-b border-[#1c1c1c]">
              <Globe size={12} className="animate-spin" />
              <span>searching: {msg.searchStatus.query}</span>
            </div>
          )}

          {msg.searchResults?.map((sr, si) => (
            <div key={si} className="mb-3 pb-2 border-b border-[#1c1c1c] last:border-0">
              <div className="flex items-center gap-1.5 text-[10px] text-[#606060] mb-1.5">
                <Globe size={10} />
                <span>web results for &ldquo;{sr.query}&rdquo;</span>
              </div>
              <div className="space-y-1.5">
                {sr.results.map((r, ri) => <SearchResultCard key={ri} result={r} />)}
              </div>
            </div>
          ))}

          {msg.role === 'assistant' ? (
            <MarkdownRenderer content={msg.content} />
          ) : (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}
        </div>
      </div>
    </div>
  )
}

const StreamingDots = () => (
  <div className="flex gap-2.5 justify-start">
    <div className="w-6 h-6 rounded-full bg-[#141414] border border-[#1c1c1c] flex items-center justify-center flex-shrink-0 mt-1">
      <AiAvatar />
    </div>
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] px-3.5 py-2.5 rounded-lg">
      <div className="flex gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-pulse" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-pulse [animation-delay:0.2s]" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-pulse [animation-delay:0.4s]" />
      </div>
    </div>
  </div>
)

export default function Chat() {
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)

  const messagesEndRef = useRef(null)
  const messagesScrollRef = useRef(null)
  const inputRef = useRef(null)

  const refreshThreadList = useCallback(async () => {
    try {
      const data = await api.get('/llm/threads?general=true')
      setThreads(data)
    } catch { /* ignore */ }
  }, [])

  const { messages, streaming, sendMessage, resetChat, setThreadId: loadThread } = useChat({
    onThreadCreated: (threadId) => {
      if (!activeThreadId) {
        setActiveThreadId(threadId)
        refreshThreadList()
      }
    },
  })

  // Load threads
  useEffect(() => {
    const fetchThreads = async () => {
      try {
        const data = await api.get('/llm/threads?general=true')
        setThreads(data)
      } catch (err) {
        console.error('Failed to load threads:', err)
      } finally {
        setLoadingThreads(false)
      }
    }
    fetchThreads()
  }, [])

  // Load messages when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      resetChat()
      return
    }
    const fetchMessages = async () => {
      setLoadingMessages(true)
      try {
        const data = await api.get(`/llm/threads/${activeThreadId}`)
        loadThread(activeThreadId, data.messages || [])
      } catch (err) {
        console.error('Failed to load messages:', err)
      } finally {
        setLoadingMessages(false)
      }
    }
    fetchMessages()
  }, [activeThreadId, resetChat, loadThread])

  // Auto-scroll
  useEffect(() => {
    if (messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when not streaming
  useEffect(() => {
    if (!streaming && inputRef.current) inputRef.current.focus()
  }, [streaming, activeThreadId])

  const handleNewChat = useCallback(() => {
    setActiveThreadId(null)
    resetChat()
    setChatInput('')
  }, [resetChat])

  const handleDeleteThread = useCallback(async (e, threadId) => {
    e.stopPropagation()
    try {
      await api.delete(`/llm/threads/${threadId}`)
      setThreads(prev => prev.filter(t => t.id !== threadId))
      if (activeThreadId === threadId) {
        setActiveThreadId(null)
        resetChat()
      }
    } catch (err) {
      console.error('Failed to delete thread:', err)
    }
  }, [activeThreadId, resetChat])

  const handleSend = useCallback(() => {
    if (!chatInput.trim() || streaming) return
    const msg = chatInput
    setChatInput('')
    sendMessage(msg)
  }, [chatInput, streaming, sendMessage])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showStreamingDots = streaming && messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    !messages[messages.length - 1].content &&
    !messages[messages.length - 1].searchStatus

  return (
    <Layout>
      <div className="flex flex-1 min-h-0 overflow-hidden p-8 pt-16 lg:pt-8 animate-fade-in">
        {/* Thread sidebar */}
        <div className="w-[280px] flex-shrink-0 border-r border-[#1c1c1c] flex flex-col bg-[#0e0e0e]">
          <div className="flex items-center justify-between px-4 py-4 border-b border-[#1c1c1c]">
            <span className="text-xs font-medium text-[#606060] uppercase tracking-wider">conversations</span>
            <button
              onClick={handleNewChat}
              className="text-[#606060] hover:text-[#d4d4d4] transition-colors p-1 rounded hover:bg-[#191919]"
              title="New chat"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 rounded w-3/4 bg-[#191919] animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                    <div className="h-2.5 rounded w-1/3 bg-[#191919] animate-pulse" style={{ animationDelay: `${i * 0.1 + 0.05}s` }} />
                  </div>
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-[#404040]">no conversations yet</p>
              </div>
            ) : (
              <div className="py-1">
                {threads.map(thread => (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-2 group transition-colors ${
                      activeThreadId === thread.id
                        ? 'bg-[#111111] border-l-2 border-[#d4d4d4]'
                        : 'border-l-2 border-transparent hover:bg-[#0f0f0f]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${activeThreadId === thread.id ? 'text-[#d4d4d4]' : 'text-[#808080]'}`}>
                        {thread.title}
                      </p>
                      <p className="text-[10px] text-[#404040] mt-0.5">{formatRelativeDate(thread.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteThread(e, thread.id)}
                      className="text-[#333333] hover:text-[#884444] transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5"
                    >
                      <Trash2 size={12} />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-6">
            {loadingMessages ? (
              <div className="max-w-2xl mx-auto space-y-4 pt-8">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <div className={`rounded-lg p-3 space-y-1.5 ${i % 2 === 0 ? 'w-48' : 'w-64'}`}>
                      <div className="h-3 rounded bg-[#191919] animate-pulse w-full" />
                      <div className="h-3 rounded bg-[#191919] animate-pulse w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 && !activeThreadId ? (
              <div className="flex flex-col items-center justify-center h-full animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-[#111111] border border-[#1c1c1c] flex items-center justify-center mb-5">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" fill="#404040" />
                    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M5.64 5.64l3.54 3.54M14.82 14.82l3.54 3.54M5.64 18.36l3.54-3.54M14.82 9.18l3.54-3.54" stroke="#1c1c1c" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-[#404040] text-sm text-center leading-relaxed">
                  start a conversation.<br />
                  <span className="text-[#333333] text-xs">ask me anything — I can search the web too.</span>
                </p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-4">
                {messages.map((msg, i) => (
                  <ChatMessageBubble key={i} msg={msg} streaming={streaming} isLast={i === messages.length - 1} />
                ))}
                {showStreamingDots && <StreamingDots />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[#1c1c1c] p-4">
            <div className="max-w-2xl mx-auto flex gap-2">
              <textarea
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ask me anything..."
                rows={1}
                className="bg-[#111111] border border-[#1c1c1c] rounded-lg px-4 py-2.5 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors flex-1 resize-none"
              />
              <button
                onClick={handleSend}
                disabled={!chatInput.trim() || streaming}
                className="bg-[#191919] text-[#606060] hover:text-[#d4d4d4] rounded-lg px-4 py-2.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
