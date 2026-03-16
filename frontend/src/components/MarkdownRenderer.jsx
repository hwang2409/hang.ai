import { forwardRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkWikiLinks from '../lib/remarkWikiLinks'

const MarkdownRenderer = forwardRef(function MarkdownRenderer({ content, noteMap, enableWikiLinks }, ref) {
  const navigate = useNavigate()

  const WikiLink = useCallback(({ title, displaytext, children }) => {
    const noteId = noteMap?.get(title?.toLowerCase())
    if (noteId) {
      return (
        <span
          className="wiki-link"
          onClick={(e) => { e.stopPropagation(); navigate(`/notes/${noteId}`) }}
        >
          {children || displaytext || title}
        </span>
      )
    }
    return <span className="wiki-link unresolved">{children || displaytext || title}</span>
  }, [noteMap, navigate])

  const remarkPlugins = enableWikiLinks
    ? [remarkGfm, remarkMath, remarkWikiLinks]
    : [remarkGfm, remarkMath]

  const components = enableWikiLinks ? { wikilink: WikiLink } : undefined

  return (
    <div className="prose max-w-none" ref={ref}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={[rehypeKatex]} components={components}>
        {content || ''}
      </ReactMarkdown>
    </div>
  )
})

export default MarkdownRenderer
