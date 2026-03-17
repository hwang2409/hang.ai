import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Square, X } from 'lucide-react'

export default function VoiceRecorder({ onRecordingComplete, onCancel }) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const getMimeType = () => {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
    return ''
  }

  const getExtension = (mimeType) => {
    if (mimeType.includes('webm')) return '.webm'
    if (mimeType.includes('mp4')) return '.m4a'
    return '.webm'
  }

  const startRecording = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = getMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const actualMime = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: actualMime })
        const ext = getExtension(actualMime)
        onRecordingComplete(blob, actualMime, ext)
        cleanup()
      }

      recorder.start()
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch (err) {
      setError('Could not access microphone. Please allow microphone access.')
      console.error('Microphone error:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
  }

  const handleCancel = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    cleanup()
    setRecording(false)
    onCancel()
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={handleCancel}>
      <div
        className="bg-[#111111] border border-[#1c1c1c] rounded-xl p-8 w-[340px] flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-[#d4d4d4]">record audio</h3>

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}

        {/* Timer */}
        <div className="flex items-center gap-3">
          {recording && (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          )}
          <span className="text-3xl font-mono text-[#d4d4d4] tabular-nums">
            {formatTime(elapsed)}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {!recording ? (
            <button
              onClick={startRecording}
              className="w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center hover:bg-red-500/30 transition-colors"
            >
              <Mic size={22} className="text-red-400" />
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-14 h-14 rounded-full bg-[#191919] border-2 border-[#333333] flex items-center justify-center hover:bg-[#222222] transition-colors"
            >
              <Square size={18} className="text-[#d4d4d4]" />
            </button>
          )}
        </div>

        <button
          onClick={handleCancel}
          className="text-xs text-[#606060] hover:text-[#808080] transition-colors flex items-center gap-1"
        >
          <X size={12} />
          cancel
        </button>
      </div>
    </div>
  )
}
