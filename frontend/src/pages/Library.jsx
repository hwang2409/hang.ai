import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Image, Film, Music, Trash2, Link2, Globe, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'

const TYPE_ICONS = {
  pdf: FileText,
  image: Image,
  video: Film,
  audio: Music,
  link: Link2,
}

const TYPE_FILTERS = ['all', 'pdf', 'image', 'video', 'audio', 'link']

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

function truncate(text, len = 40) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '...' : text
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return '' }
}

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov,.mp3,.wav,.m4a,.pptx'

export default function Library() {
  const [files, setFiles] = useState([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const fetchFiles = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('file_type', typeFilter)
      const data = await api.get(`/files?${params}`)
      setFiles(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch files:', err)
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    setLoading(true)
    fetchFiles()
  }, [fetchFiles])

  const handleUpload = async (fileList) => {
    if (!fileList?.length) return
    setUploading(true)
    try {
      for (const file of fileList) {
        const formData = new FormData()
        formData.append('file', file)
        await api.upload('/files', formData)
      }
      await fetchFiles()
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e, fileId) => {
    e.stopPropagation()
    try {
      await api.delete(`/files/${fileId}`)
      setFiles(prev => prev.filter(f => f.id !== fileId))
    } catch (err) {
      console.error('Failed to delete file:', err)
    }
  }

  const handleImportUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setImportingUrl(true)
    try {
      await api.post('/files/import-url', { url })
      setUrlInput('')
      await fetchFiles()
    } catch (err) {
      console.error('URL import failed:', err)
    } finally {
      setImportingUrl(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  return (
    <Layout>
      <div
        className="flex-1 overflow-y-auto p-8 pt-16 lg:pt-8 animate-fade-in"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold text-text tracking-tight">library</h1>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />
              ) : (
                <Upload size={16} />
              )}
              upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          {/* URL import bar */}
          <div className="flex gap-2 mb-6">
            <div className="flex-1 relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444444]" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
                placeholder="paste a URL to import (YouTube, arXiv, webpage)"
                className="w-full bg-[#111111] border border-[#1c1c1c] rounded-md pl-9 pr-3 py-2 text-sm text-[#d4d4d4] placeholder-[#333333] focus:outline-none focus:border-[#2a2a2a] transition-colors"
                disabled={importingUrl}
              />
            </div>
            <button
              onClick={handleImportUrl}
              disabled={importingUrl || !urlInput.trim()}
              className="bg-[#191919] text-[#d4d4d4] hover:bg-[#222222] border border-[#1c1c1c] rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {importingUrl ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link2 size={14} />
              )}
              import
            </button>
          </div>

          {/* Type filter tabs */}
          <div className="flex gap-1 mb-8">
            {TYPE_FILTERS.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  typeFilter === t
                    ? 'bg-[#191919] text-[#d4d4d4]'
                    : 'text-[#606060] hover:text-[#808080]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Drag overlay */}
          {dragOver && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.7)] pointer-events-none">
              <div className="border-2 border-dashed border-[#333333] rounded-2xl px-16 py-12 text-center">
                <Upload size={32} className="mx-auto mb-3 text-[#606060]" />
                <p className="text-[#606060] text-sm">drop files to upload</p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="animate-pulse bg-[#111111] rounded-lg p-5">
                  <div className="h-10 w-10 rounded bg-[#191919] mb-3" />
                  <div className="h-4 rounded w-3/4 mb-2 bg-[#191919]" />
                  <div className="h-3 rounded w-1/2 bg-[#191919]" />
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-24 animate-fade-in">
              <p className="text-[#606060] mb-6">
                {typeFilter !== 'all' ? `no ${typeFilter} files yet.` : 'no files yet.'}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm inline-flex items-center gap-2"
              >
                <Upload size={16} />
                upload a file
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-in">
              {files.map(file => {
                const Icon = TYPE_ICONS[file.file_type] || FileText
                const isLink = file.file_type === 'link'
                const thumbnail = file.metadata?.thumbnail_url
                const domain = file.metadata?.domain || (file.source_url ? getDomain(file.source_url) : '')
                return (
                  <div
                    key={file.id}
                    onClick={() => navigate(`/files/${file.id}`)}
                    className="group relative bg-[#111111] border border-[#1c1c1c] rounded-lg p-5 cursor-pointer hover:border-[#2a2a2a] transition-colors"
                  >
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(e, file.id)}
                      className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 text-[#333333] hover:text-[#606060] transition-all duration-200 p-1.5 rounded-lg"
                      title="Delete file"
                    >
                      <Trash2 size={14} />
                    </button>

                    {/* Icon / Thumbnail */}
                    {isLink && thumbnail ? (
                      <div className="w-full h-24 rounded-lg bg-[#191919] border border-[#1c1c1c] mb-3 overflow-hidden">
                        <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#191919] border border-[#1c1c1c] flex items-center justify-center mb-3">
                        <Icon size={18} className="text-[#606060]" />
                      </div>
                    )}

                    {/* Filename */}
                    <h3 className="font-medium text-[#d4d4d4] text-sm mb-1 truncate pr-6">
                      {truncate(file.original_name, 45)}
                    </h3>

                    {/* Meta */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#333333]">
                        {isLink ? domain : formatBytes(file.size_bytes)}
                      </span>
                      <span className="text-xs text-[#333333]">
                        {formatDate(file.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
