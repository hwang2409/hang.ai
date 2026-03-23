import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'

// --- Obsidian-style palette ---

// Notes view: luminous constellation colors based on connectivity
const NODE_PALETTE = [
  '#8b9dc3', // isolated — soft periwinkle
  '#a0b4d4', // low — pale steel
  '#b8cce8', // moderate — light blue
  '#c9d4f0', // connected — lavender ice
  '#ddd6f3', // hub — soft violet
  '#e8d5f5', // major hub — luminous lilac
]

// Mastery palette for concept nodes — dark theme (soft neon tints)
const MASTERY_PALETTE_DARK = [
  { min: 0,  max: 20,  color: '#f47068' }, // red-coral
  { min: 20, max: 40,  color: '#e8a855' }, // warm amber
  { min: 40, max: 60,  color: '#c4d44a' }, // lime
  { min: 60, max: 80,  color: '#56d6a0' }, // mint
  { min: 80, max: 100, color: '#58a6ff' }, // bright blue
]

// Mastery palette for concept nodes — light theme
const MASTERY_PALETTE_LIGHT = [
  { min: 0,  max: 20,  color: '#d44030' },
  { min: 20, max: 40,  color: '#c08020' },
  { min: 40, max: 60,  color: '#80a020' },
  { min: 60, max: 80,  color: '#20a070' },
  { min: 80, max: 100, color: '#2070c0' },
]

function getNodeColor(degree, dark) {
  if (!dark) {
    // Light mode: darker tones
    const lightPalette = ['#5a6a8a', '#6a7a9a', '#7a8aaa', '#8a8ab0', '#9a80b0', '#a070b0']
    const i = Math.min(Math.floor(degree / 2), lightPalette.length - 1)
    return lightPalette[i]
  }
  const i = Math.min(Math.floor(degree / 2), NODE_PALETTE.length - 1)
  return NODE_PALETTE[i]
}

function getConceptColor(mastery_pct, isDark) {
  const palette = isDark ? MASTERY_PALETTE_DARK : MASTERY_PALETTE_LIGHT
  if (mastery_pct == null) return isDark ? '#8b9dc3' : '#5a6a8a'
  for (const band of palette) {
    if (mastery_pct >= band.min && mastery_pct < band.max) return band.color
  }
  return palette[palette.length - 1].color
}

export default function KnowledgeGraph() {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const svgRef = useRef(null)
  const [, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState(null)
  const [dragNode, setDragNode] = useState(null)
  const dragNodeRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const animRef = useRef(null)
  const driftRef = useRef(null)
  const [, forceRender] = useState(0)
  const [viewBox, setViewBox] = useState({ x: -500, y: -400, w: 1000, h: 800 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, vbx: 0, vby: 0 })
  const [settled, setSettled] = useState(false)
  const [viewMode, setViewMode] = useState('notes')
  const [glowPhase, setGlowPhase] = useState(0)

  // Concept explorer state
  const [concepts, setConcepts] = useState([])
  const [conceptsLoading, setConceptsLoading] = useState(false)
  const [sortMode, setSortMode] = useState('mastery-desc')
  const [expandedConcept, setExpandedConcept] = useState(null)
  const [conceptNotes, setConceptNotes] = useState([])
  const [conceptNotesLoading, setConceptNotesLoading] = useState(false)

  // Animated glow pulse for hovered node — skip in concepts view
  useEffect(() => {
    if (viewMode === 'concepts') return
    let raf
    let t = 0
    const tick = () => {
      t += 0.04
      setGlowPhase(Math.sin(t) * 0.5 + 0.5) // 0..1 oscillation
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [viewMode])

  // Ambient idle drift — tiny random velocities when settled (skip in concepts view)
  useEffect(() => {
    if (viewMode === 'concepts' || !settled) {
      if (driftRef.current) cancelAnimationFrame(driftRef.current)
      return
    }
    const drift = () => {
      const nodes = nodesRef.current
      if (!nodes.length) return
      let changed = false
      nodes.forEach(n => {
        if (dragNodeRef.current && n.id === dragNodeRef.current) return
        // Tiny random nudge
        n.x += (Math.random() - 0.5) * 0.15
        n.y += (Math.random() - 0.5) * 0.15
        changed = true
      })
      if (changed) forceRender(r => r + 1)
      driftRef.current = requestAnimationFrame(drift)
    }
    driftRef.current = requestAnimationFrame(drift)
    return () => { if (driftRef.current) cancelAnimationFrame(driftRef.current) }
  }, [settled, viewMode])

  // Load data for the active view
  const loadGraph = useCallback((mode) => {
    setLoading(true)
    setHoveredNode(null)
    setSettled(false)
    nodesRef.current = []
    edgesRef.current = []
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (driftRef.current) cancelAnimationFrame(driftRef.current)
    setViewBox({ x: -500, y: -400, w: 1000, h: 800 })

    const endpoint = mode === 'concepts' ? '/knowledge/graph' : '/search/knowledge-graph'
    api.get(endpoint)
      .then(data => {
        setGraphData(data)
        const nodes = data.nodes.map((n, i) => ({
          ...n,
          x: 350 * Math.cos((2 * Math.PI * i) / data.nodes.length + Math.random() * 0.5),
          y: 350 * Math.sin((2 * Math.PI * i) / data.nodes.length + Math.random() * 0.5),
          vx: 0,
          vy: 0,
          degree: data.edges.filter(e => e.source === n.id || e.target === n.id).length,
        }))
        nodesRef.current = nodes
        edgesRef.current = data.edges
        startSimulation(nodes, data.edges)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load concept tiles (no physics)
  const loadConcepts = useCallback(() => {
    setConceptsLoading(true)
    setExpandedConcept(null)
    setConceptNotes([])
    // Stop any running graph animations
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (driftRef.current) cancelAnimationFrame(driftRef.current)
    api.get('/knowledge/concepts')
      .then(data => setConcepts(data.concepts || []))
      .catch(() => setConcepts([]))
      .finally(() => setConceptsLoading(false))
  }, [])

  useEffect(() => {
    if (viewMode === 'concepts') {
      loadConcepts()
    } else {
      loadGraph('notes')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // Force simulation
  const startSimulation = useCallback((nodes, edges) => {
    let iteration = 0
    setSettled(false)
    const simulate = () => {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = 6000 / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          nodes[i].vx -= fx
          nodes[i].vy -= fy
          nodes[j].vx += fx
          nodes[j].vy += fy
        }
      }

      const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
      edges.forEach(edge => {
        const s = nodeMap[edge.source]
        const t = nodeMap[edge.target]
        if (!s || !t) return
        const dx = t.x - s.x
        const dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const force = 0.008 * (dist - 180) * edge.weight
        const fx = (dx / Math.max(dist, 1)) * force
        const fy = (dy / Math.max(dist, 1)) * force
        s.vx += fx
        s.vy += fy
        t.vx -= fx
        t.vy -= fy
      })

      nodes.forEach(n => {
        n.vx -= n.x * 0.008
        n.vy -= n.y * 0.008
      })

      let maxV = 0
      nodes.forEach(n => {
        if (dragNodeRef.current && n.id === dragNodeRef.current) {
          n.vx = 0
          n.vy = 0
          return
        }
        n.vx *= 0.82
        n.vy *= 0.82
        n.x += n.vx
        n.y += n.vy
        maxV = Math.max(maxV, Math.abs(n.vx), Math.abs(n.vy))
      })

      iteration++
      forceRender(r => r + 1)

      if (iteration < 300 && maxV > 0.3) {
        animRef.current = requestAnimationFrame(simulate)
      } else {
        setSettled(true)
      }
    }
    animRef.current = requestAnimationFrame(simulate)
  }, [])

  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (driftRef.current) cancelAnimationFrame(driftRef.current)
  }, [])

  const screenToSVG = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
    }
  }, [viewBox])

  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragNode(nodeId)
    dragNodeRef.current = nodeId
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (dragNodeRef.current != null) {
      const pos = screenToSVG(e.clientX, e.clientY)
      const node = nodesRef.current.find(n => n.id === dragNodeRef.current)
      if (node) {
        node.x = pos.x
        node.y = pos.y
        node.vx = 0
        node.vy = 0
        forceRender(r => r + 1)
      }
      return
    }
    if (isPanningRef.current) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const dx = ((e.clientX - panStartRef.current.x) / rect.width) * viewBox.w
      const dy = ((e.clientY - panStartRef.current.y) / rect.height) * viewBox.h
      setViewBox(vb => ({
        ...vb,
        x: panStartRef.current.vbx - dx,
        y: panStartRef.current.vby - dy,
      }))
    }
  }, [screenToSVG, viewBox.w, viewBox.h])

  const handleMouseUp = useCallback(() => {
    if (dragNodeRef.current != null) {
      setDragNode(null)
      dragNodeRef.current = null
    }
    isPanningRef.current = false
  }, [])

  const handleSvgMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.closest('line') || e.target.tagName === 'rect') {
      isPanningRef.current = true
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        vbx: viewBox.x,
        vby: viewBox.y,
      }
    }
  }, [viewBox.x, viewBox.y])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mouseXFrac = (e.clientX - rect.left) / rect.width
    const mouseYFrac = (e.clientY - rect.top) / rect.height
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
    setViewBox(vb => {
      const newW = vb.w * zoomFactor
      const newH = vb.h * zoomFactor
      return {
        x: vb.x + (vb.w - newW) * mouseXFrac,
        y: vb.y + (vb.h - newH) * mouseYFrac,
        w: newW,
        h: newH,
      }
    })
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const matchesSearch = useCallback((node) => {
    if (!searchQuery.trim()) return true
    const text = (node.title || node.label || '').toLowerCase()
    return text.includes(searchQuery.toLowerCase())
  }, [searchQuery])

  const nodeRadius = useCallback((node) => {
    return Math.min(Math.max(3, 3 + node.degree * 1.0), 10)
  }, [])

  const nodes = nodesRef.current
  const edges = edgesRef.current
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])

  // Connected node set for hovered node
  const connectedSet = useMemo(() => {
    if (!hoveredNode) return new Set()
    const s = new Set()
    s.add(hoveredNode)
    edges.forEach(e => {
      if (e.source === hoveredNode) s.add(e.target)
      if (e.target === hoveredNode) s.add(e.source)
    })
    return s
  }, [hoveredNode, edges])

  // Filtered + sorted concepts for tile grid
  const filteredConcepts = useMemo(() => {
    let list = concepts
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c => (c.concept || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    switch (sortMode) {
      case 'mastery-desc': sorted.sort((a, b) => (b.mastery_pct ?? 0) - (a.mastery_pct ?? 0)); break
      case 'mastery-asc': sorted.sort((a, b) => (a.mastery_pct ?? 0) - (b.mastery_pct ?? 0)); break
      case 'notes': sorted.sort((a, b) => (b.note_count ?? 0) - (a.note_count ?? 0)); break
      case 'alpha': sorted.sort((a, b) => (a.concept || '').localeCompare(b.concept || '')); break
      case 'recent': sorted.sort((a, b) => (b.last_seen_at || '').localeCompare(a.last_seen_at || '')); break
      default: break
    }
    return sorted
  }, [concepts, searchQuery, sortMode])

  const conceptStats = useMemo(() => {
    if (!concepts.length) return null
    const avg = Math.round(concepts.reduce((s, c) => s + (c.mastery_pct ?? 0), 0) / concepts.length)
    return { total: concepts.length, avgMastery: avg }
  }, [concepts])

  // Theme-aware colors
  const bg = dark ? '#0d1117' : '#f0f0f5'
  const edgeBaseColor = dark ? '#ffffff' : '#333333'

  // Frosted glass style for controls
  const glassStyle = {
    background: dark ? 'rgba(13, 17, 23, 0.75)' : 'rgba(240, 240, 245, 0.8)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
    boxShadow: dark
      ? '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)'
      : '0 4px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
  }

  const toggleBtnStyle = (active) => ({
    ...glassStyle,
    background: active
      ? (dark ? 'rgba(88, 166, 255, 0.15)' : 'rgba(60, 100, 180, 0.12)')
      : (dark ? 'rgba(13, 17, 23, 0.6)' : 'rgba(240, 240, 245, 0.6)'),
    color: active
      ? (dark ? '#79c0ff' : '#3c64b4')
      : (dark ? '#484f58' : '#8b8b9a'),
    borderColor: active
      ? (dark ? 'rgba(88, 166, 255, 0.3)' : 'rgba(60, 100, 180, 0.25)')
      : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'),
  })

  // Expand a concept tile — lazy-fetch linked notes
  const handleConceptExpand = useCallback((concept) => {
    if (expandedConcept && expandedConcept.id === concept.id) {
      setExpandedConcept(null)
      setConceptNotes([])
      return
    }
    setExpandedConcept(concept)
    setConceptNotes([])
    setConceptNotesLoading(true)
    const fetchId = concept.id
    api.get(`/notes/by-concept?concept=${encodeURIComponent(concept.concept)}`)
      .then(data => {
        // Race condition guard
        setExpandedConcept(prev => {
          if (prev && prev.id === fetchId) {
            setConceptNotes(data.notes || [])
          }
          return prev
        })
      })
      .catch(() => setConceptNotes([]))
      .finally(() => setConceptNotesLoading(false))
  }, [expandedConcept])

  const emptyMessage = viewMode === 'concepts'
    ? 'study more notes to build your concept map'
    : 'create notes to see your knowledge graph'

  return (
    <Layout>
      <div
        className="flex-1 flex flex-col min-h-0 overflow-hidden pt-14 lg:pt-0 relative"
        style={{ background: bg }}
      >
        {/* Floating search — frosted glass */}
        <div
          className="absolute top-3 left-4 z-10 flex items-center gap-3"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={viewMode === 'concepts' ? 'search concepts...' : 'search graph...'}
            className="px-3 py-1.5 rounded-lg text-xs outline-none transition-all"
            style={{
              width: 190,
              ...glassStyle,
              color: dark ? '#b0b8c4' : '#444',
              caretColor: dark ? '#58a6ff' : '#3c64b4',
            }}
          />
        </div>

        {/* View toggle — frosted glass */}
        <div
          className="absolute top-3 right-5 z-10 flex items-center gap-1"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <button
            onClick={() => setViewMode('notes')}
            className="px-2.5 py-1 rounded-lg text-[10px] tracking-wider uppercase transition-all"
            style={toggleBtnStyle(viewMode === 'notes')}
          >
            Notes
          </button>
          <button
            onClick={() => setViewMode('concepts')}
            className="px-2.5 py-1 rounded-lg text-[10px] tracking-wider uppercase transition-all"
            style={toggleBtnStyle(viewMode === 'concepts')}
          >
            Concepts
          </button>
        </div>

        {/* Stats */}
        {viewMode === 'notes' && nodes.length > 0 && (
          <div
            className="absolute top-10 right-5 z-10 text-[10px] tracking-wider uppercase"
            style={{
              color: dark ? 'rgba(139, 148, 158, 0.5)' : 'rgba(100, 100, 120, 0.5)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {nodes.length} nodes &middot; {edges.length} edges
          </div>
        )}

        {/* ─── Concepts View ─── */}
        {viewMode === 'concepts' ? (
          conceptsLoading ? (
            <div className="flex-1 flex items-center justify-center" style={{ background: bg }}>
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full animate-ping" style={{ background: dark ? 'rgba(88, 166, 255, 0.1)' : 'rgba(60, 100, 180, 0.08)' }} />
                  <div className="absolute inset-2 rounded-full animate-pulse" style={{ background: dark ? 'rgba(88, 166, 255, 0.2)' : 'rgba(60, 100, 180, 0.12)' }} />
                  <div className="absolute inset-4 rounded-full" style={{ background: dark ? '#58a6ff' : '#3c64b4' }} />
                </div>
                <span className="text-[11px] tracking-widest uppercase" style={{ color: dark ? 'rgba(139, 148, 158, 0.4)' : 'rgba(100, 100, 120, 0.5)' }}>
                  loading concepts
                </span>
              </div>
            </div>
          ) : concepts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" style={{ background: bg }}>
              <div className="text-center max-w-xs">
                <div className="mb-6 relative mx-auto" style={{ width: 80, height: 80 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="20" cy="25" r="2" fill={dark ? '#58a6ff' : '#3c64b4'} opacity="0.3" />
                    <circle cx="55" cy="18" r="1.5" fill={dark ? '#b392f0' : '#6a5acd'} opacity="0.25" />
                    <circle cx="40" cy="50" r="2.5" fill={dark ? '#79c0ff' : '#4a80c4'} opacity="0.35" />
                    <circle cx="65" cy="55" r="1.5" fill={dark ? '#c9d1d9' : '#666'} opacity="0.2" />
                  </svg>
                </div>
                <p className="text-xs mb-1" style={{ color: dark ? 'rgba(139,148,158,0.5)' : 'rgba(100,100,120,0.6)' }}>no concepts yet</p>
                <p className="text-[11px]" style={{ color: dark ? 'rgba(139,148,158,0.3)' : 'rgba(100,100,120,0.4)' }}>
                  {emptyMessage}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto" style={{ background: bg, paddingTop: 48 }}>
              {/* Summary bar */}
              {conceptStats && (
                <div className="px-4 pb-3">
                  <div className="rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-3" style={glassStyle}>
                    <span className="text-[11px] tracking-wider" style={{
                      color: dark ? 'rgba(139,148,158,0.6)' : 'rgba(100,100,120,0.6)',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}>
                      {conceptStats.total} concept{conceptStats.total !== 1 ? 's' : ''} &middot; avg {conceptStats.avgMastery}% mastery
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                      {[
                        { key: 'mastery-desc', label: 'mastery \u2193' },
                        { key: 'mastery-asc', label: 'mastery \u2191' },
                        { key: 'notes', label: 'notes' },
                        { key: 'alpha', label: 'a\u2013z' },
                        { key: 'recent', label: 'recent' },
                      ].map(s => (
                        <button
                          key={s.key}
                          onClick={() => setSortMode(s.key)}
                          className="px-2 py-0.5 rounded-md text-[9px] tracking-wider uppercase transition-all"
                          style={toggleBtnStyle(sortMode === s.key)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Concept grid */}
              <div
                className="px-4 pb-6 stagger-in"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                {filteredConcepts.map((c, idx) => {
                  const color = getConceptColor(c.mastery_pct, dark)
                  const isExpanded = expandedConcept && expandedConcept.id === c.id

                  return (
                    <div key={c.id} style={isExpanded ? { gridColumn: '1 / -1' } : undefined}>
                      <div
                        onClick={() => handleConceptExpand(c)}
                        className="rounded-lg cursor-pointer transition-all"
                        style={{
                          background: dark ? '#161b22' : '#ffffff',
                          border: `1px solid ${isExpanded ? color : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)')}`,
                          boxShadow: isExpanded
                            ? `0 0 12px ${color}33`
                            : (dark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)'),
                          transform: 'translateY(0)',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.borderColor = color
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          if (!isExpanded) e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
                        }}
                      >
                        <div className="p-3 pb-2">
                          <div
                            className="text-[13px] font-medium leading-tight mb-1.5"
                            style={{
                              color: dark ? '#c9d1d9' : '#1f2937',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {c.concept}
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span style={{
                              fontSize: 20,
                              fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
                              fontWeight: 600,
                              color,
                            }}>
                              {Math.round(c.mastery_pct ?? 0)}%
                            </span>
                            <span className="text-[10px]" style={{
                              color: dark ? 'rgba(139,148,158,0.5)' : 'rgba(100,100,120,0.5)',
                            }}>
                              {c.note_count || 0} note{(c.note_count || 0) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        {/* Mastery bar */}
                        <div style={{
                          height: 3,
                          background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.round(c.mastery_pct ?? 0)}%`,
                            background: color,
                            borderRadius: '0 2px 2px 0',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div
                          className="mt-2 rounded-xl p-4 animate-fade-in"
                          style={{
                            ...glassStyle,
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium" style={{ color: dark ? '#c9d1d9' : '#1f2937' }}>
                                {c.concept}
                              </span>
                              <span className="text-xs" style={{
                                fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
                                color,
                              }}>
                                {Math.round(c.mastery_pct ?? 0)}%
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedConcept(null); setConceptNotes([]) }}
                              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
                              style={{
                                color: dark ? 'rgba(139,148,158,0.6)' : 'rgba(100,100,120,0.6)',
                                background: 'transparent',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              &#x2715;
                            </button>
                          </div>

                          {conceptNotesLoading ? (
                            <div className="space-y-2">
                              {[1, 2, 3].map(i => (
                                <div key={i} className="rounded-md animate-pulse" style={{
                                  height: 36,
                                  background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                }} />
                              ))}
                            </div>
                          ) : conceptNotes.length === 0 ? (
                            <p className="text-[11px]" style={{
                              color: dark ? 'rgba(139,148,158,0.4)' : 'rgba(100,100,120,0.4)',
                            }}>
                              no related notes found
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {conceptNotes.map(note => (
                                <div
                                  key={note.id}
                                  onClick={(e) => { e.stopPropagation(); navigate(`/notes/${note.id}`) }}
                                  className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors"
                                  style={{
                                    background: 'transparent',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <span className="text-xs" style={{ color: dark ? '#b0b8c4' : '#374151' }}>
                                    {note.title || 'Untitled'}
                                  </span>
                                  <span className="text-[10px] ml-auto flex-shrink-0" style={{
                                    color: dark ? 'rgba(139,148,158,0.4)' : 'rgba(100,100,120,0.4)',
                                  }}>
                                    {note.source_type === 'prerequisite' ? 'prereq' : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* No results from search */}
                {filteredConcepts.length === 0 && searchQuery.trim() && (
                  <div className="col-span-full text-center py-8">
                    <p className="text-[11px]" style={{ color: dark ? 'rgba(139,148,158,0.4)' : 'rgba(100,100,120,0.4)' }}>
                      no concepts matching "{searchQuery}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          /* ─── Notes Graph View ─── */
          loading ? (
            <div className="flex-1 flex items-center justify-center" style={{ background: bg }}>
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full animate-ping" style={{ background: dark ? 'rgba(88, 166, 255, 0.1)' : 'rgba(60, 100, 180, 0.08)' }} />
                  <div className="absolute inset-2 rounded-full animate-pulse" style={{ background: dark ? 'rgba(88, 166, 255, 0.2)' : 'rgba(60, 100, 180, 0.12)' }} />
                  <div className="absolute inset-4 rounded-full" style={{ background: dark ? '#58a6ff' : '#3c64b4' }} />
                </div>
                <span className="text-[11px] tracking-widest uppercase" style={{ color: dark ? 'rgba(139, 148, 158, 0.4)' : 'rgba(100, 100, 120, 0.5)' }}>
                  mapping connections
                </span>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" style={{ background: bg }}>
              <div className="text-center max-w-xs">
                <div className="mb-6 relative mx-auto" style={{ width: 80, height: 80 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="20" cy="25" r="2" fill={dark ? '#58a6ff' : '#3c64b4'} opacity="0.3" />
                    <circle cx="55" cy="18" r="1.5" fill={dark ? '#b392f0' : '#6a5acd'} opacity="0.25" />
                    <circle cx="40" cy="50" r="2.5" fill={dark ? '#79c0ff' : '#4a80c4'} opacity="0.35" />
                    <circle cx="65" cy="55" r="1.5" fill={dark ? '#c9d1d9' : '#666'} opacity="0.2" />
                    <line x1="20" y1="25" x2="40" y2="50" stroke={dark ? '#58a6ff' : '#3c64b4'} strokeWidth="0.4" opacity="0.15" />
                    <line x1="55" y1="18" x2="40" y2="50" stroke={dark ? '#b392f0' : '#6a5acd'} strokeWidth="0.4" opacity="0.12" />
                    <line x1="40" y1="50" x2="65" y2="55" stroke={dark ? '#79c0ff' : '#4a80c4'} strokeWidth="0.4" opacity="0.1" />
                  </svg>
                </div>
                <p className="text-xs mb-1" style={{ color: dark ? 'rgba(139,148,158,0.5)' : 'rgba(100,100,120,0.6)' }}>no connections yet</p>
                <p className="text-[11px]" style={{ color: dark ? 'rgba(139,148,158,0.3)' : 'rgba(100,100,120,0.4)' }}>
                  create notes to see your knowledge graph
                </p>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="flex-1 cursor-grab active:cursor-grabbing"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ userSelect: 'none', background: bg }}
            >
              <defs>
                <filter id="glow-strong" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur1" />
                    <feMergeNode in="blur2" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-soft" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-medium" x="-150%" y="-150%" width="400%" height="400%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-pulse" x="-300%" y="-300%" width="700%" height="700%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur1" />
                    <feMergeNode in="blur2" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect
                x={viewBox.x - 2000}
                y={viewBox.y - 2000}
                width={viewBox.w + 4000}
                height={viewBox.h + 4000}
                fill="transparent"
              />

              {edges.map((edge, i) => {
                const s = nodeMap[edge.source]
                const t = nodeMap[edge.target]
                if (!s || !t) return null

                const sMatches = matchesSearch(s)
                const tMatches = matchesSearch(t)
                const hasSearch = searchQuery.trim()

                if (hasSearch && !sMatches && !tMatches) return null

                const isHighlighted = hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode)
                const dimmedByHover = hoveredNode && !isHighlighted
                const dimmedBySearch = hasSearch && (!sMatches || !tMatches)

                let opacity
                if (isHighlighted) opacity = 0.4
                else if (dimmedByHover) opacity = 0.02
                else if (dimmedBySearch) opacity = 0.03
                else opacity = 0.06 + edge.weight * 0.09

                const width = isHighlighted ? 0.8 : 0.3 + edge.weight * 0.3

                return (
                  <line
                    key={`e-${i}`}
                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={isHighlighted ? (dark ? '#79c0ff' : '#4a80c4') : edgeBaseColor}
                    strokeWidth={width}
                    strokeOpacity={opacity}
                    style={{ transition: settled ? 'stroke-opacity 0.4s ease, stroke-width 0.4s ease' : undefined }}
                  />
                )
              })}

              {nodes.map(node => {
                const matches = matchesSearch(node)
                const isHovered = hoveredNode === node.id
                const isConnected = connectedSet.has(node.id)
                const color = getNodeColor(node.degree, dark)
                const r = nodeRadius(node)
                const hasSearch = searchQuery.trim()

                let opacity
                if (hasSearch && !matches) opacity = 0.04
                else if (hoveredNode) {
                  if (isHovered) opacity = 1
                  else if (isConnected) opacity = 0.9
                  else opacity = 0.06
                } else if (hasSearch && matches) opacity = 1
                else opacity = 0.85

                let filter
                if (isHovered) filter = 'url(#glow-pulse)'
                else if (isConnected && hoveredNode) filter = 'url(#glow-medium)'
                else filter = 'url(#glow-soft)'

                const showLabel = isHovered || (!hoveredNode && node.degree >= 5)
                const nodeDisplayName = node.title || 'untitled'
                const pulseR = r + 4 + glowPhase * 6

                return (
                  <g
                    key={`n-${node.id}`}
                    style={{
                      cursor: 'pointer',
                      opacity,
                      transition: settled ? 'opacity 0.4s ease' : undefined,
                    }}
                    onMouseDown={e => handleNodeMouseDown(e, node.id)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={(e) => {
                      if (!dragNode) {
                        e.stopPropagation()
                        navigate(`/notes/${node.id}`)
                      }
                    }}
                  >
                    <circle cx={node.x} cy={node.y} r={r * 5} fill={color} opacity={isHovered ? 0.08 : 0.03} style={{ pointerEvents: 'none' }} />
                    {isHovered && (
                      <circle cx={node.x} cy={node.y} r={pulseR} fill="none" stroke={color} strokeWidth={1} opacity={0.2 + glowPhase * 0.25} style={{ pointerEvents: 'none' }} />
                    )}
                    <circle cx={node.x} cy={node.y} r={isHovered ? r * 1.5 : r} fill={color} filter={filter} style={{ transition: settled ? 'r 0.2s ease' : undefined }} />
                    <circle cx={node.x} cy={node.y} r={isHovered ? r * 0.5 : r * 0.35} fill="white" opacity={isHovered ? 0.6 : 0.25} style={{ pointerEvents: 'none' }} />
                    <circle cx={node.x} cy={node.y} r={Math.max(r * 3, 12)} fill="transparent" style={{ cursor: 'pointer' }} />
                    {showLabel && (
                      <text
                        x={node.x} y={node.y + (isHovered ? r * 1.5 : r) + 14}
                        textAnchor="middle" fontSize={isHovered ? 11 : 8}
                        fill={isHovered ? (dark ? '#c9d1d9' : '#333') : (dark ? 'rgba(139,148,158,0.5)' : 'rgba(100,100,120,0.5)')}
                        style={{ pointerEvents: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', fontWeight: isHovered ? 500 : 400, letterSpacing: '0.02em' }}
                      >
                        {nodeDisplayName}
                      </text>
                    )}
                  </g>
                )
              })}

              {hoveredNode && (() => {
                const node = nodeMap[hoveredNode]
                if (!node) return null
                const r = nodeRadius(node) * 1.5
                const tooltipColor = dark ? 'rgba(139,148,158,0.6)' : 'rgba(100,100,120,0.7)'
                return (
                  <text
                    x={node.x} y={node.y - r - 10}
                    textAnchor="middle" fontSize={8} fill={tooltipColor}
                    style={{ pointerEvents: 'none', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em' }}
                  >
                    {node.degree} connection{node.degree !== 1 ? 's' : ''}
                  </text>
                )
              })()}
            </svg>
          )
        )}
      </div>
    </Layout>
  )
}
