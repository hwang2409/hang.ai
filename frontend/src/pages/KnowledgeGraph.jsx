import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'

const FOLDER_COLORS = ['#c4a759', '#59a7c4', '#a759c4', '#59c472', '#c45959', '#5970c4', '#c49259']

function darkenColor(hex, amount = 0.3) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * (1 - amount))
  const dg = Math.round(g * (1 - amount))
  const db = Math.round(b * (1 - amount))
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}

function truncate(str, max = 20) {
  if (!str) return 'Untitled'
  return str.length > max ? str.slice(0, max) + '...' : str
}

export default function KnowledgeGraph() {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const svgRef = useRef(null)
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState(null)
  const [dragNode, setDragNode] = useState(null)
  const dragNodeRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const animRef = useRef(null)
  const [, forceRender] = useState(0)
  const [viewBox, setViewBox] = useState({ x: -400, y: -300, w: 800, h: 600 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, vbx: 0, vby: 0 })

  // Fetch graph data
  useEffect(() => {
    api.get('/search/knowledge-graph')
      .then(data => {
        setGraphData(data)
        const nodes = data.nodes.map((n, i) => ({
          ...n,
          x: 300 * Math.cos((2 * Math.PI * i) / data.nodes.length),
          y: 300 * Math.sin((2 * Math.PI * i) / data.nodes.length),
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
  }, [])

  // Force simulation
  const startSimulation = useCallback((nodes, edges) => {
    let iteration = 0
    const simulate = () => {
      // Repulsion between all node pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = 5000 / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          nodes[i].vx -= fx
          nodes[i].vy -= fy
          nodes[j].vx += fx
          nodes[j].vy += fy
        }
      }

      // Attraction along edges
      const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
      edges.forEach(edge => {
        const s = nodeMap[edge.source]
        const t = nodeMap[edge.target]
        if (!s || !t) return
        const dx = t.x - s.x
        const dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const force = 0.01 * (dist - 150) * edge.weight
        const fx = (dx / Math.max(dist, 1)) * force
        const fy = (dy / Math.max(dist, 1)) * force
        s.vx += fx
        s.vy += fy
        t.vx -= fx
        t.vy -= fy
      })

      // Center gravity
      nodes.forEach(n => {
        n.vx -= n.x * 0.01
        n.vy -= n.y * 0.01
      })

      // Apply velocity with damping
      let maxV = 0
      nodes.forEach(n => {
        if (dragNodeRef.current && n.id === dragNodeRef.current) {
          n.vx = 0
          n.vy = 0
          return
        }
        n.vx *= 0.85
        n.vy *= 0.85
        n.x += n.vx
        n.y += n.vy
        maxV = Math.max(maxV, Math.abs(n.vx), Math.abs(n.vy))
      })

      iteration++
      forceRender(r => r + 1)

      if (iteration < 200 && maxV > 0.5) {
        animRef.current = requestAnimationFrame(simulate)
      }
    }
    animRef.current = requestAnimationFrame(simulate)
  }, [])

  // Cleanup animation frame
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // Convert screen coords to SVG coords
  const screenToSVG = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const x = viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w
    const y = viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h
    return { x, y }
  }, [viewBox])

  // Drag handling
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
    // Only pan if not clicking on a node
    if (e.target === svgRef.current || e.target.tagName === 'line') {
      isPanningRef.current = true
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        vbx: viewBox.x,
        vby: viewBox.y,
      }
    }
  }, [viewBox.x, viewBox.y])

  // Zoom
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
      // Keep mouse position stable
      const newX = vb.x + (vb.w - newW) * mouseXFrac
      const newY = vb.y + (vb.h - newH) * mouseYFrac
      return { x: newX, y: newY, w: newW, h: newH }
    })
  }, [])

  // Attach wheel listener with passive: false
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Search filtering
  const matchesSearch = useCallback((node) => {
    if (!searchQuery.trim()) return true
    return (node.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  }, [searchQuery])

  const nodeColor = useCallback((node) => {
    if (node.folder_id != null) {
      return FOLDER_COLORS[node.folder_id % FOLDER_COLORS.length]
    }
    return FOLDER_COLORS[0]
  }, [])

  const nodeRadius = useCallback((node) => {
    return Math.min(Math.max(6, 6 + node.degree * 2), 20)
  }, [])

  const nodes = nodesRef.current
  const edges = edgesRef.current
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  return (
    <Layout>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-14 lg:pt-0">
        {/* Header */}
        <div
          className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center gap-4"
          style={{
            background: dark ? 'rgba(10,10,10,0.92)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <h1 className="text-sm font-semibold tracking-tight text-text">
            knowledge graph
          </h1>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="search nodes..."
            className="px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-xs outline-none focus:border-[#333] transition-colors"
            style={{ width: 220 }}
          />
          {nodes.length > 0 && (
            <span className="text-[11px] ml-auto" style={{ color: dark ? '#444' : '#999' }}>
              {nodes.length} nodes &middot; {edges.length} connections
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-6 h-6 border-2 border-border rounded-full animate-spin"
                style={{ borderTopColor: '#c4a759' }}
              />
              <span className="text-sm" style={{ color: dark ? '#444' : '#999' }}>
                loading knowledge graph...
              </span>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: dark ? '#111' : '#f5f5f5' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? '#333' : '#ccc'} strokeWidth="1.5">
                  <circle cx="6" cy="6" r="2.5" />
                  <circle cx="18" cy="8" r="2.5" />
                  <circle cx="12" cy="18" r="2.5" />
                  <line x1="8.2" y1="7" x2="15.8" y2="7.5" />
                  <line x1="7" y1="8.2" x2="10.8" y2="16.2" />
                  <line x1="16.5" y1="10" x2="13.5" y2="16" />
                </svg>
              </div>
              <p className="text-sm mb-1" style={{ color: dark ? '#666' : '#999' }}>
                no notes with embeddings found
              </p>
              <p className="text-xs" style={{ color: dark ? '#333' : '#bbb' }}>
                create some notes first to see your knowledge graph
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
            style={{ userSelect: 'none' }}
          >
            {/* Edges */}
            {edges.map((edge, i) => {
              const s = nodeMap[edge.source]
              const t = nodeMap[edge.target]
              if (!s || !t) return null

              const bothMatch = matchesSearch(s) && matchesSearch(t)
              const showEdge = !searchQuery.trim() || bothMatch

              if (!showEdge) return null

              return (
                <line
                  key={`edge-${i}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={dark ? '#333' : '#ccc'}
                  strokeWidth={1}
                  strokeOpacity={0.1 + edge.weight * 0.4}
                />
              )
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const matches = matchesSearch(node)
              const isHovered = hoveredNode === node.id
              const color = nodeColor(node)
              const radius = nodeRadius(node)
              const displayRadius = isHovered ? radius * 1.3 : radius
              const opacity = searchQuery.trim() ? (matches ? 1 : 0.2) : 1

              return (
                <g
                  key={`node-${node.id}`}
                  style={{ cursor: 'pointer', opacity }}
                  onMouseDown={e => handleNodeMouseDown(e, node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={(e) => {
                    if (dragNode == null) {
                      e.stopPropagation()
                      navigate(`/notes/${node.id}`)
                    }
                  }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={displayRadius}
                    fill={color}
                    stroke={darkenColor(color)}
                    strokeWidth={1.5}
                    style={{ transition: 'r 0.15s ease' }}
                  />
                  <text
                    x={node.x}
                    y={node.y + displayRadius + 12}
                    textAnchor="middle"
                    fontSize={10}
                    fill={dark ? '#666' : '#999'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {isHovered ? (node.title || 'Untitled') : truncate(node.title)}
                  </text>
                </g>
              )
            })}

            {/* Tooltip for hovered node */}
            {hoveredNode && (() => {
              const node = nodeMap[hoveredNode]
              if (!node) return null
              const radius = nodeRadius(node)
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={node.x - 60}
                    y={node.y - radius - 30}
                    width={120}
                    height={20}
                    rx={4}
                    fill={dark ? '#1a1a1a' : '#fff'}
                    stroke={dark ? '#333' : '#ddd'}
                    strokeWidth={0.5}
                  />
                  <text
                    x={node.x}
                    y={node.y - radius - 17}
                    textAnchor="middle"
                    fontSize={9}
                    fill={dark ? '#ccc' : '#333'}
                  >
                    {node.degree} connection{node.degree !== 1 ? 's' : ''}
                  </text>
                </g>
              )
            })()}
          </svg>
        )}
      </div>
    </Layout>
  )
}
