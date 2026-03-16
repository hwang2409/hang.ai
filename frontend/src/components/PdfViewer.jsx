import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const HIGHLIGHT_COLORS = {
  yellow: 'rgba(254, 240, 138, 0.4)',
  green: 'rgba(187, 247, 208, 0.4)',
  blue: 'rgba(191, 219, 254, 0.4)',
  pink: 'rgba(251, 207, 232, 0.4)',
  orange: 'rgba(254, 215, 170, 0.4)',
  purple: 'rgba(233, 213, 255, 0.4)',
  default: 'rgba(254, 240, 138, 0.4)',
}

const PdfViewer = forwardRef(function PdfViewer({ fileUrl, onTextSelect, highlights }, ref) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [pageInput, setPageInput] = useState('1')
  const containerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    goToPage(n) {
      const page = Math.max(1, Math.min(n, numPages || 1))
      setPageNumber(page)
      setPageInput(String(page))
    },
  }))

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages)
  }, [])

  const goToPage = (n) => {
    const page = Math.max(1, Math.min(n, numPages || 1))
    setPageNumber(page)
    setPageInput(String(page))
  }

  const handlePageInput = (e) => {
    setPageInput(e.target.value)
  }

  const handlePageInputSubmit = (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(pageInput, 10)
      if (!isNaN(n)) goToPage(n)
    }
  }

  const zoomIn = () => setScale(s => Math.min(s + 0.2, 3))
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.5))
  const fitWidth = () => setScale(1.2)

  // Text selection detection
  useEffect(() => {
    if (!onTextSelect) return
    const container = containerRef.current
    if (!container) return

    const handleMouseUp = () => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()
      if (!text) return

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      onTextSelect({
        text,
        pageNumber,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      })
    }

    container.addEventListener('mouseup', handleMouseUp)
    return () => container.removeEventListener('mouseup', handleMouseUp)
  }, [onTextSelect, pageNumber])

  // Apply highlights after text layer renders
  const handleTextLayerSuccess = useCallback(() => {
    if (!highlights?.length) return
    const pageHighlights = highlights.filter(h => h.page_number === pageNumber)
    if (!pageHighlights.length) return

    // Find the text layer div
    const container = containerRef.current
    if (!container) return
    const textLayer = container.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    // Remove existing highlights
    textLayer.querySelectorAll('.pdf-highlight').forEach(el => {
      el.style.backgroundColor = ''
      el.style.borderRadius = ''
      el.classList.remove('pdf-highlight')
    })

    const spans = textLayer.querySelectorAll('span')

    pageHighlights.forEach(highlight => {
      const searchText = highlight.selected_text
      const bgColor = HIGHLIGHT_COLORS[highlight.color] || HIGHLIGHT_COLORS.default

      // Search through spans to find matching text
      spans.forEach(span => {
        const spanText = span.textContent
        if (spanText && searchText.includes(spanText.trim()) && spanText.trim().length > 0) {
          span.style.backgroundColor = bgColor
          span.style.borderRadius = '2px'
          span.classList.add('pdf-highlight')
        }
      })
    })
  }, [highlights, pageNumber])

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1c1c1c] bg-[#0e0e0e] flex-shrink-0">
        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInput}
              onKeyDown={handlePageInputSubmit}
              onBlur={() => { const n = parseInt(pageInput, 10); if (!isNaN(n)) goToPage(n); }}
              className="w-10 bg-[#111111] border border-[#1c1c1c] rounded px-1.5 py-1 text-center text-[#d4d4d4] outline-none focus:border-[#333333] transition-colors"
            />
            <span className="text-[#333333]">/</span>
            <span className="text-[#606060]">{numPages || '...'}</span>
          </div>
          <button
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= (numPages || 1)}
            className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors">
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-[#606060] min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn} className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors">
            <ZoomIn size={16} />
          </button>
          <button onClick={fitWidth} className="p-1.5 rounded text-[#606060] hover:text-[#d4d4d4] transition-colors ml-1" title="Fit width">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div ref={containerRef} className="flex-1 overflow-auto flex justify-center py-4 bg-[#0a0a0a]">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-6 w-6 border-2 border-[#333333] border-t-[#d4d4d4] rounded-full" />
            </div>
          }
          error={
            <div className="flex items-center justify-center h-full text-[#606060] text-sm">
              failed to load PDF
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-2xl"
            onRenderTextLayerSuccess={handleTextLayerSuccess}
          />
        </Document>
      </div>
    </div>
  )
})

export default PdfViewer
