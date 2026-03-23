import { useState, useRef, useCallback } from 'react'
import { api } from '../lib/api'

/**
 * Shared chat streaming hook used by both Chat page and NoteEdit sidebar.
 *
 * @param {Object} opts
 * @param {number|null} opts.noteId — links thread to a note (null for general chat)
 * @param {number|null} opts.fileId — links thread to an uploaded file
 * @param {function|null} opts.onNoteEdit — called when AI edits the note content
 * @param {function|null} opts.onCanvasEdit — called when AI edits canvas elements
 * @param {function|null} opts.onMoodboardEdit — called when AI edits moodboard items
 * @param {function|null} opts.onSearchStart — called when web search begins
 * @param {function|null} opts.onSearchResults — called when web search results arrive
 * @param {function|null} opts.onThreadCreated — called with threadId on first message
 * @param {function|null} opts.onStreamEnd — called with final messages after streaming
 */
export const useChat = ({
  noteId = null,
  fileId = null,
  onNoteEdit = null,
  onCanvasEdit = null,
  onMoodboardEdit = null,
  onSearchStart = null,
  onSearchResults = null,
  onThreadCreated = null,
  onStreamEnd = null,
} = {}) => {
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const streamingRef = useRef(false)
  const [threadId, _setThreadId] = useState(null)
  const threadIdRef = useRef(null)

  const setThreadId = useCallback((value) => {
    threadIdRef.current = value
    _setThreadId(value)
  }, [])

  const sendMessage = useCallback(async (message, selectedText = null) => {
    if (!message.trim() || streamingRef.current) return
    const userMsg = message.trim()

    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    streamingRef.current = true
    setStreaming(true)

    let assistantContent = ''

    try {
      const payload = { message: userMsg }
      if (threadIdRef.current) payload.thread_id = threadIdRef.current
      if (noteId) payload.note_id = noteId
      if (fileId) payload.file_id = fileId
      if (selectedText) payload.selected_text = selectedText

      for await (const chunk of api.stream('/llm/chat', payload)) {
        if (chunk.type === 'done') {
          if (chunk.thread_id) {
            setThreadId(chunk.thread_id)
            onThreadCreated?.(chunk.thread_id)
          }
          break
        }
        if (chunk.type === 'token' && chunk.content) {
          assistantContent += chunk.content
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: assistantContent }
            }
            return updated
          })
        }
        if (chunk.type === 'note_edit' && chunk.content != null) {
          onNoteEdit?.(chunk.content)
        }
        if (chunk.type === 'canvas_edit' && chunk.operations) {
          onCanvasEdit?.(chunk.operations)
        }
        if (chunk.type === 'moodboard_edit' && chunk.operations) {
          onMoodboardEdit?.(chunk.operations)
        }
        if (chunk.type === 'search_start') {
          onSearchStart?.(chunk.query)
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                searchStatus: { searching: true, query: chunk.query },
              }
            }
            return updated
          })
        }
        if (chunk.type === 'search_results') {
          onSearchResults?.(chunk)
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                searchStatus: null,
                searchResults: [
                  ...(last.searchResults || []),
                  { query: chunk.query, results: chunk.results },
                ],
              }
            }
            return updated
          })
        }
        if (chunk.type === 'notes_search_start') {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                noteSearchStatus: { searching: true, query: chunk.query },
              }
            }
            return updated
          })
        }
        if (chunk.type === 'notes_search') {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                noteSearchStatus: null,
                noteResults: chunk.results,
              }
            }
            return updated
          })
        }
        if (chunk.type === 'error') {
          if (chunk.code === 'api_key_required') {
            window.dispatchEvent(new CustomEvent('api-key-required'))
            assistantContent = 'An API key is required to use AI features. Add your key in Settings.'
          } else {
            assistantContent = 'Sorry, something went wrong. Please try again.'
          }
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
            return updated
          })
        }
      }
    } catch (err) {
      console.error('Chat stream error:', err)
      assistantContent = 'Sorry, something went wrong. Please try again.'
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
        return updated
      })
    } finally {
      streamingRef.current = false
      setStreaming(false)
      setMessages(cur => {
        onStreamEnd?.(cur)
        return cur
      })
    }
  }, [noteId, fileId, setThreadId, onNoteEdit, onCanvasEdit, onMoodboardEdit, onSearchStart, onSearchResults, onThreadCreated, onStreamEnd])

  const resetChat = useCallback(() => {
    setMessages([])
    setThreadId(null)
  }, [setThreadId])

  const loadThread = useCallback((newThreadId, newMessages) => {
    setThreadId(newThreadId)
    setMessages(newMessages)
  }, [setThreadId])

  return { messages, setMessages, streaming, threadId, setThreadId: loadThread, sendMessage, resetChat }
}
