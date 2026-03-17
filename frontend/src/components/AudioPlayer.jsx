import { useRef, useImperativeHandle, forwardRef } from 'react'
import { Highlighter } from 'lucide-react'

const AudioPlayer = forwardRef(function AudioPlayer({ fileUrl, onAnnotateClick }, ref) {
  const audioRef = useRef(null)

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      if (audioRef.current) {
        audioRef.current.currentTime = seconds
        audioRef.current.play()
      }
    },
  }))

  const handleAnnotate = () => {
    const currentTime = audioRef.current?.currentTime || 0
    onAnnotateClick?.(currentTime)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1c1c1c] bg-[#0e0e0e] flex-shrink-0">
        <div />
        <button
          onClick={handleAnnotate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[#606060] hover:text-[#c4a759] bg-[#111111] border border-[#1c1c1c] hover:border-[rgba(196,167,89,0.2)] transition-colors"
        >
          <Highlighter size={13} />
          annotate
        </button>
      </div>

      {/* Audio */}
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] overflow-hidden px-8">
        <audio
          ref={audioRef}
          src={fileUrl}
          controls
          className="w-full max-w-lg"
        />
      </div>
    </div>
  )
})

export default AudioPlayer
