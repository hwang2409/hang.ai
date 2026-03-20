import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'

// Muted, cohesive palette — cold-to-warm gradient based on connectivity
const NODE_PALETTE = [
  '#4a6670', // isolated — slate
  '#5a7a8a', // low — steel blue
  '#7a9aa8', // moderate — dusty cyan
  '#a8b8a0', // connected — sage
  '#c8b078', // hub — warm amber
  '#d4a060', // major hub — gold
]

function getNodeColor(degree) {
  const i = Math.min(Math.floor(degree / 2), NODE_PALETTE.length - 1)
  return NODE_PALETTE[i]
}

function truncate(str, max = 18) {
  if (!str) return 'untitled'
  return str.length > max ? str.slice(0, max) + '\u2026' : str
}

// Compute a control point for a subtle curve between two nodes
function edgePath(sx, sy, tx, ty) {
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.sqrt(dx * dx + dy * dy)
  // Perpendicular offset scaled by distance — subtle arc
  const off = dist * 0.08
  const cx = mx - (dy / dist) * off
  const cy = my + (dx / dist) * off
  return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
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
  const [, forceRender] = useState(0)
  const [viewBox, setViewBox] = useState({ x: -500, y: -400, w: 1000, h: 800 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, vbx: 0, vby: 0 })
  const [settled, setSettled] = useState(false)

  // Fetch graph data
  useEffect(() => {
    api.get('/search/knowledge-graph')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (e.target === svgRef.current || e.target.closest('path') || e.target.tagName === 'rect') {
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
    return (node.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  }, [searchQuery])

  const nodeRadius = useCallback((node) => {
    return Math.min(Math.max(3, 3 + node.degree * 1.5), 14)
  }, [])

  const nodes = nodesRef.current
  const edges = edgesRef.current
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])

  // Colors based on theme
  const bg = dark ? '#0a0a0a' : '#f5f3ee'
  const edgeColor = dark ? '#ffffff' : '#000000'
  const labelColor = dark ? '#555' : '#999'
  const hoverLabelColor = dark ? '#aaa' : '#444'

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-14 lg:pt-0 relative">
        {/* Floating search — minimal, top-left */}
        <div
          className="absolute top-3 left-4 z-10 flex items-center gap-3"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="search..."
            className="px-3 py-1.5 rounded border text-xs outline-none transition-colors"
            style={{
              width: 180,
              background: dark ? 'rgba(20,20,20,0.8)' : 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(12px)',
              borderColor: dark ? '#222' : '#ddd',
              color: dark ? '#888' : '#555',
            }}
          />
        </div>

        {/* Stats — top-right */}
        {nodes.length > 0 && (
          <div
            className="absolute top-4 right-5 z-10 text-[10px] tracking-wider uppercase"
            style={{ color: dark ? '#2a2a2a' : '#ccc', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {nodes.length} nodes &middot; {edges.length} edges
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: dark ? 'rgba(100,120,130,0.15)' : 'rgba(100,120,130,0.1)' }}
                />
                <div
                  className="absolute inset-2 rounded-full animate-pulse"
                  style={{ background: dark ? 'rgba(100,120,130,0.25)' : 'rgba(100,120,130,0.15)' }}
                />
                <div
                  className="absolute inset-4 rounded-full"
                  style={{ background: dark ? '#4a6670' : '#7a9aa8' }}
                />
              </div>
              <span className="text-[11px] tracking-widest uppercase" style={{ color: dark ? '#333' : '#aaa' }}>
                mapping connections
              </span>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="mb-6 relative mx-auto" style={{ width: 80, height: 80 }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="20" cy="25" r="3" fill={dark ? '#2a2a2a' : '#ccc'} opacity="0.6" />
                  <circle cx="55" cy="18" r="2" fill={dark ? '#2a2a2a' : '#ccc'} opacity="0.4" />
                  <circle cx="40" cy="50" r="4" fill={dark ? '#2a2a2a' : '#ccc'} opacity="0.5" />
                  <circle cx="65" cy="55" r="2.5" fill={dark ? '#2a2a2a' : '#ccc'} opacity="0.3" />
                  <line x1="20" y1="25" x2="40" y2="50" stroke={dark ? '#1a1a1a' : '#ddd'} strokeWidth="0.5" />
                  <line x1="55" y1="18" x2="40" y2="50" stroke={dark ? '#1a1a1a' : '#ddd'} strokeWidth="0.5" />
                  <line x1="40" y1="50" x2="65" y2="55" stroke={dark ? '#1a1a1a' : '#ddd'} strokeWidth="0.5" />
                </svg>
              </div>
              <p className="text-xs mb-1" style={{ color: dark ? '#444' : '#999' }}>
                no connections yet
              </p>
              <p className="text-[11px]" style={{ color: dark ? '#2a2a2a' : '#bbb' }}>
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
              {/* Glow filter for hovered nodes */}
              <filter id="node-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Soft glow for all nodes */}
              <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Ambient glow halo */}
              <radialGradient id="halo-dark">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="halo-light">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background rect for pan detection */}
            <rect
              x={viewBox.x - 2000}
              y={viewBox.y - 2000}
              width={viewBox.w + 4000}
              height={viewBox.h + 4000}
              fill="transparent"
            />

            {/* Edges — curved paths */}
            {edges.map((edge, i) => {
              const s = nodeMap[edge.source]
              const t = nodeMap[edge.target]
              if (!s || !t) return null

              const bothMatch = matchesSearch(s) && matchesSearch(t)
              if (searchQuery.trim() && !bothMatch) return null

              const isHighlighted = hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode)
              const baseOpacity = 0.04 + edge.weight * 0.12
              const opacity = isHighlighted ? 0.35 : baseOpacity
              const width = isHighlighted ? 1.5 : 0.5 + edge.weight * 0.5

              return (
                <path
                  key={`e-${i}`}
                  d={edgePath(s.x, s.y, t.x, t.y)}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  style={{
                    transition: settled ? 'stroke-opacity 0.3s, stroke-width 0.3s' : undefined,
                  }}
                />
              )
            })}

            {/* Node halos — ambient glow circles behind each node */}
            {nodes.map(node => {
              const matches = matchesSearch(node)
              if (searchQuery.trim() && !matches) return null
              const r = nodeRadius(node)
              return (
                <circle
                  key={`halo-${node.id}`}
                  cx={node.x}
                  cy={node.y}
                  r={r * 4}
                  fill={`url(#halo-${dark ? 'dark' : 'light'})`}
                  style={{ pointerEvents: 'none' }}
                />
              )
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const matches = matchesSearch(node)
              const isHovered = hoveredNode === node.id
              const isNeighbor = hoveredNode && edges.some(e =>
                (e.source === hoveredNode && e.target === node.id) ||
                (e.target === hoveredNode && e.source === node.id)
              )
              const color = getNodeColor(node.degree)
              const r = nodeRadius(node)
              const displayR = isHovered ? r * 1.6 : r

              let opacity = 1
              if (searchQuery.trim() && !matches) opacity = 0.08
              else if (hoveredNode && !isHovered && !isNeighbor) opacity = 0.25

              return (
                <g
                  key={`n-${node.id}`}
                  style={{
                    cursor: 'pointer',
                    opacity,
                    transition: settled ? 'opacity 0.3s' : undefined,
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
                  {/* Core dot */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={displayR}
                    fill={color}
                    filter={isHovered ? 'url(#node-glow)' : 'url(#soft-glow)'}
                    style={{ transition: settled ? 'r 0.2s ease' : undefined }}
                  />

                  {/* Inner bright spot */}
                  <circle
                    cx={node.x - r * 0.2}
                    cy={node.y - r * 0.2}
                    r={displayR * 0.35}
                    fill="white"
                    opacity={isHovered ? 0.25 : 0.1}
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* Label — only on hover or for high-degree nodes */}
                  {(isHovered || node.degree >= 4) && (
                    <text
                      x={node.x}
                      y={node.y + displayR + (isHovered ? 16 : 12)}
                      textAnchor="middle"
                      fontSize={isHovered ? 11 : 8}
                      fill={isHovered ? hoverLabelColor : labelColor}
                      style={{
                        pointerEvents: 'none',
                        fontFamily: 'var(--font-sans, system-ui)',
                        fontWeight: isHovered ? 500 : 400,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {isHovered ? (node.title || 'untitled') : truncate(node.title, 14)}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Hover detail — connection count */}
            {hoveredNode && (() => {
              const node = nodeMap[hoveredNode]
              if (!node) return null
              const r = nodeRadius(node) * 1.6
              return (
                <text
                  x={node.x}
                  y={node.y - r - 8}
                  textAnchor="middle"
                  fontSize={8}
                  fill={dark ? '#444' : '#aaa'}
                  style={{
                    pointerEvents: 'none',
                    fontFamily: 'var(--font-mono, monospace)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {node.degree} connection{node.degree !== 1 ? 's' : ''}
                </text>
              )
            })()}
          </svg>
        )}
      </div>
    </Layout>
  )
}
