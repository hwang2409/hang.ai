import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export default function SharedNote() {
  const { token } = useParams()
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/notes/shared/${token}`)
        if (!res.ok) {
          setError(res.status === 404 ? 'This note does not exist or is no longer shared.' : 'Failed to load note.')
          return
        }
        setNote(await res.json())
      } catch {
        setError('Failed to load note.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-[#333333] border-t-[#d4d4d4] rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#606060] text-sm mb-4">{error}</p>
          <a href="/" className="text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors">
            go to hang.ai
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#1c1c1c] bg-[#0e0e0e] px-6 py-3 flex items-center justify-between">
        <span className="text-xs text-[#606060]">shared via hang.ai</span>
        <a href="/" className="text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors no-underline">
          hang.ai
        </a>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-light text-[#d4d4d4] mb-8 tracking-tight">
          {note.title || 'Untitled'}
        </h1>

        <div className="note-prose prose max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {note.content || ''}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
